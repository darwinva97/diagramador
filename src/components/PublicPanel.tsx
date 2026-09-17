/**
 * Panel de detalle de la vista pública.
 *
 * No es el inspector con los campos apagados: es una ficha aparte que sólo enseña. Así no
 * hay ningún control de edición que pueda confundir a quien abre el enlace, y el inspector
 * de verdad se puede seguir tocando sin miedo a filtrar acciones aquí.
 *
 * Sin nada seleccionado hace de portada: de qué va el diagrama, quién participa y la
 * leyenda de colores (las reglas de estilo, que si no habría que adivinar).
 */
import { useStore, useValidSel } from '../store';
import { curDiagram, findComp, findPerson, findType, libOfComp, participants } from '../lib/model';
import { matchingRules, resolveStyle, styleToCss } from '../lib/rules';
import { apiOfComp, findOp, opName } from '../lib/api';
import { parseJsonFields } from '../lib/schema';
import { Avatar } from './People';
import { RulePreview } from './Rules';
import {
  OPS_SIN_VALOR, RULE_OPS, RULE_SOURCES,
  type ApiOperation, type Component, type Condition, type Diagram, type FieldDef, type KeyValue, type Placement, type Relation, type StyleRule,
} from '../types';

// ---------------------------------------------------------------- valores de campo
const vacio = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function FieldView({ def, value }: { def: FieldDef; value: unknown }) {
  const cuerpo = () => {
    switch (def.kind) {
      case 'checkbox': return <span>{value ? 'Sí' : 'No'}</span>;
      case 'url': return <a href={String(value)} target="_blank" rel="noreferrer">{String(value)}</a>;
      case 'list': return (
        <div className="people-row">
          {(value as unknown[]).map((x, i) => <span key={i} className="chip-btn as-text">{String(x)}</span>)}
        </div>
      );
      case 'keyvalue': {
        const items = value as KeyValue[];
        const [kl, vl] = (def.options ?? 'Clave|Valor').split('|');
        return (
          <table className="table kv-view">
            <thead><tr><th>{kl}</th><th>{vl ?? 'Valor'}</th></tr></thead>
            <tbody>{items.map((it, i) => <tr key={i}><td><code>{it.key}</code></td><td>{it.value}</td></tr>)}</tbody>
          </table>
        );
      }
      case 'json': {
        const txt = String(value);
        const campos = parseJsonFields(txt);
        return (
          <>
            <pre className="code-block">{txt}</pre>
            {campos && campos.length > 0 && (
              <details className="schema">
                <summary>Estructura ({campos.length})</summary>
                <table><thead><tr><th>Campo</th><th>Tipo</th><th>Ejemplo</th></tr></thead>
                  <tbody>{campos.map(f => <tr key={f.path} className={f.leaf ? '' : 'branch'}><td><code>{f.path}</code></td><td>{f.type}</td><td className="ex">{f.example}</td></tr>)}</tbody>
                </table>
              </details>
            )}
          </>
        );
      }
      case 'textarea': return <div className="ro-text multi">{String(value)}</div>;
      default: return <div className="ro-text">{String(value)}</div>;
    }
  };
  return <div className="ro-field"><span className="fld-label">{def.label}</span>{cuerpo()}</div>;
}

/** Contrato de una operación de API, en modo lectura. */
function ApiOperationView({ op }: { op: ApiOperation }) {
  const kv = (label: string, items: KeyValue[]) => items.filter(x => x.key).length === 0 ? null : (
    <div className="ro-field"><span className="fld-label">{label}</span>
      <table className="table kv-view"><tbody>
        {items.filter(x => x.key).map((x, i) => <tr key={i}><td><code>{x.key}</code></td><td>{x.value}</td></tr>)}
      </tbody></table>
    </div>
  );
  return (
    <>
      {kv('Parámetros de ruta', op.pathParams)}
      {kv('Parámetros de consulta', op.queryParams)}
      {kv('Cabeceras', op.headers)}
      {op.requestBody.trim() && <FieldView def={{ key: 'req', label: 'Request body', kind: 'json' }} value={op.requestBody} />}
      {op.responseBody.trim() && <FieldView def={{ key: 'res', label: 'Response body', kind: 'json' }} value={op.responseBody} />}
      {kv('Códigos de respuesta', op.codes)}
      {op.notes && <div className="ro-field"><span className="fld-label">Notas</span><div className="ro-text multi">{op.notes}</div></div>}
    </>
  );
}

/** Una condición en palabras: «estado es CONFIRMADO». */
function condText(c: Condition): string {
  const donde = c.source === 'field' ? (c.key || 'campo') : RULE_SOURCES[c.source].toLowerCase();
  const op = RULE_OPS[c.op].toLowerCase();
  return OPS_SIN_VALOR.includes(c.op) ? `${donde} ${op}` : `${donde} ${op} «${c.value ?? ''}»`;
}

function RuleCard({ r, activa }: { r: StyleRule; activa?: boolean }) {
  return (
    <div className={'ro-rule' + (activa ? ' on' : '')}>
      <RulePreview style={r.style} label={r.name} />
      <div className="muted small">
        {r.conditions.length === 0
          ? 'Sin condiciones.'
          : `${r.match === 'any' ? 'Si alguna: ' : 'Si '}${r.conditions.map(condText).join(r.match === 'any' ? ' · ' : ' y ')}`}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ficha de componente
function ComponentCard({ comp, placement, d }: { comp: Component; placement: Placement | null; d: Diagram }) {
  const data = useStore(s => s.data);
  const select = useStore(s => s.select);
  const t = findType(data, comp.typeId);
  const lib = libOfComp(data, comp.id);
  const capa = placement && d.layers.find(l => l.id === placement.layerId);
  const etapa = placement && d.stages.find(s => s.id === placement.stageId);
  const grupo = etapa?.groupId ? (d.stageGroups ?? []).find(g => g.id === etapa.groupId) : null;
  const otras = d.placements.filter(p => p.componentId === comp.id && p.id !== placement?.id);
  const gente = participants(data, 'component', comp.id);
  const reglas = matchingRules(data, comp, d.id);
  const { style } = resolveStyle(data, comp, d.id);
  const css = styleToCss(style);

  // campos con valor: primero los del tipo, en su orden
  const api = apiOfComp(data, comp);
  const op = findOp(api, placement?.operationId);
  const defs: FieldDef[] = t?.fields ?? [];
  const conValor = defs.filter(f => !vacio(comp.fields[f.key]));
  const extra = Object.keys(comp.fields).filter(k => !defs.some(f => f.key === k) && !vacio(comp.fields[k]));

  const enlaces = placement
    ? d.relations.filter(r => r.from === placement.id || r.to === placement.id)
    : [];
  const nombreDe = (pid: string) => {
    const p = d.placements.find(x => x.id === pid);
    return p ? (findComp(data, p.componentId)?.name ?? '?') : '?';
  };

  return (
    <>
      <div className="insp-head" style={{ ['--c' as string]: t?.color ?? '#94a3b8' }}>
        <span className="icon big">{style.icon || t?.icon || '▫️'}</span>
        <h3>{comp.name}</h3>
      </div>
      <div className="muted small">{api ? `API · ${api.version}` : ([t?.name, lib?.name].filter(Boolean).join(' · ') || 'Sin tipo')}</div>
      {comp.description && <div className="ro-text multi">{comp.description}</div>}
      {placement?.note && <><h4>Nota de este uso</h4><div className="ro-text multi">{placement.note}</div></>}

      {api && (
        <>
          <h4>Operación que usa aquí</h4>
          {op ? (
            <div className="op-summary">
              <div><span className={'method m-' + op.method.toLowerCase()}>{op.method}</span> <code>{op.path}</code></div>
              {op.name && <div><b>{op.name}</b></div>}
              {op.summary && <div className="muted small">{op.summary}</div>}
            </div>
          ) : <div className="muted small">Sin operación elegida.</div>}
          {op && <ApiOperationView op={op} />}
          <h4>La API</h4>
          {api.description && <div className="ro-text multi">{api.description}</div>}
          {api.repoUrl && <div className="ro-field"><span className="fld-label">Repositorio</span><a href={api.repoUrl} target="_blank" rel="noreferrer">{api.repoUrl}</a></div>}
          {api.docsUrl && <div className="ro-field"><span className="fld-label">Documentación</span><a href={api.docsUrl} target="_blank" rel="noreferrer">{api.docsUrl}</a></div>}
          {api.auth && <div className="ro-field"><span className="fld-label">Autenticación</span><div className="ro-text">{api.auth}</div></div>}
          {api.baseUrls.filter(b => b.value).length > 0 && (
            <div className="ro-field"><span className="fld-label">Base URL por entorno</span>
              <table className="table kv-view"><tbody>
                {api.baseUrls.filter(b => b.value).map((b, i) => <tr key={i}><td><code>{b.key}</code></td><td>{b.value}</td></tr>)}
              </tbody></table>
            </div>
          )}
          {api.operations.length > 1 && (
            <div className="muted small">La API tiene {api.operations.length} operaciones; aquí se usa {op ? `«${opName(op)}»` : 'ninguna'}.</div>
          )}
        </>
      )}

      {placement && (
        <>
          <h4>Dónde está</h4>
          <div className="ro-text">
            {capa?.name ?? '?'} <span className="muted">·</span> {etapa?.name ?? '?'}
            {grupo && <span className="muted"> ({grupo.name})</span>}
          </div>
          {otras.length > 0 && (
            <div className="muted small">También aparece en {otras.length} sitio(s) más de este diagrama.</div>
          )}
        </>
      )}

      {(conValor.length > 0 || extra.length > 0) && <h4>Datos</h4>}
      {conValor.map(f => <FieldView key={f.key} def={f} value={comp.fields[f.key]} />)}
      {extra.map(k => <FieldView key={k} def={{ key: k, label: k, kind: 'text' }} value={comp.fields[k]} />)}

      {enlaces.length > 0 && (
        <>
          <h4>Relaciones ({enlaces.length})</h4>
          {enlaces.map(r => (
            <button key={r.id} className="ro-rel" onClick={() => select({ kind: 'relation', id: r.id })}>
              <span>{r.from === placement?.id ? '→' : '←'}</span>
              <b>{nombreDe(r.from === placement?.id ? r.to : r.from)}</b>
              {r.label && <small>{r.label}</small>}
            </button>
          ))}
        </>
      )}

      {gente.length > 0 && (
        <>
          <h4>Personas ({gente.length})</h4>
          <div className="people-row">
            {gente.map(({ person, assignment }) => (
              <span key={assignment.id} className="person-chip" title={`${person.name} · ${assignment.role}`}>
                <Avatar p={person} size={18} />{person.name}<small>{assignment.role}</small>
              </span>
            ))}
          </div>
        </>
      )}

      {reglas.length > 0 && (
        <>
          <h4>Por qué se pinta así ({reglas.length})</h4>
          <div className={'comp static' + (css.className ? ' ' + css.className : '')} style={{ ...css.style, ['--c' as string]: t?.color ?? '#94a3b8' }}>
            <div className="comp-head"><span className="icon">{style.icon || t?.icon || '▫️'}</span><span className="txt"><span className="label">{comp.name}</span></span></div>
          </div>
          {reglas.map(r => <RuleCard key={r.id} r={r} activa />)}
          <div className="muted small">Cuando varias reglas coinciden, manda la de más prioridad en cada propiedad.</div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- ficha de relación
function RelationCard({ r, d }: { r: Relation; d: Diagram }) {
  const data = useStore(s => s.data);
  const select = useStore(s => s.select);
  const lado = (pid: string) => {
    const p = d.placements.find(x => x.id === pid);
    const c = p && findComp(data, p.componentId);
    return { pid, nombre: c?.name ?? '?', capa: p && d.layers.find(l => l.id === p.layerId)?.name };
  };
  const a = lado(r.from), b = lado(r.to);
  return (
    <>
      <div className="insp-head" style={{ ['--c' as string]: r.color }}>
        <span className="icon big">↗</span><h3>{r.label || 'Relación'}</h3>
      </div>
      <div className="ro-rel-ends">
        <button className="chip-btn" onClick={() => select({ kind: 'placement', id: a.pid })}>{a.nombre}<small>{a.capa}</small></button>
        <span className="arrow">{r.dir === 'both' ? '↔' : r.dir === 'none' ? '—' : '→'}</span>
        <button className="chip-btn" onClick={() => select({ kind: 'placement', id: b.pid })}>{b.nombre}<small>{b.capa}</small></button>
      </div>
      {(r.fromField || r.toField) && (
        <>
          <h4>Campos conectados</h4>
          <div className="ro-text"><code>{r.fromField || '—'}</code> → <code>{r.toField || '—'}</code></div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- portada
function DiagramCard({ d }: { d: Diagram }) {
  const data = useStore(s => s.data);
  const gente = participants(data, 'diagram', d.id);
  const reglas = (data.rules ?? [])
    .filter(r => r.enabled && (!r.diagramId || r.diagramId === d.id) && r.conditions.length > 0)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return (
    <>
      <h3>{d.name}</h3>
      {d.description && <div className="ro-text multi">{d.description}</div>}
      <div className="stats">{d.layers.length} capas · {d.stages.length} etapas · {d.placements.length} componentes · {d.relations.length} relaciones</div>

      {gente.length > 0 && (
        <>
          <h4>Participantes ({gente.length})</h4>
          <div className="people-row">
            {gente.map(({ person, assignment }) => (
              <span key={assignment.id} className="person-chip" title={`${person.name} · ${assignment.role}`}>
                <Avatar p={person} size={18} />{person.name}<small>{assignment.role}</small>
              </span>
            ))}
          </div>
        </>
      )}

      {reglas.length > 0 && (
        <>
          <h4>Leyenda de colores ({reglas.length})</h4>
          <div className="muted small">De más a menos prioridad: si un componente cumple varias, la de arriba manda.</div>
          {reglas.map(r => <RuleCard key={r.id} r={r} />)}
        </>
      )}

      <h4>Cómo se mira</h4>
      <ul className="help">
        <li>Clic en un componente para ver su ficha; clic en una flecha para ver la relación.</li>
        <li>Arrastra un componente para recolocarlo dentro de su celda: es sólo para ti, no cambia el diagrama de quien lo publicó.</li>
        <li>Arrastra el fondo (o la barra espaciadora) para mover el lienzo; Ctrl + rueda para el zoom.</li>
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- panel
export function PublicPanel() {
  const data = useStore(s => s.data);
  const sel = useValidSel();
  const d = curDiagram(data);
  if (!d) return null;

  let body: React.ReactElement;
  if (!sel) body = <DiagramCard d={d} />;
  else if (sel.kind === 'placement') {
    const p = d.placements.find(x => x.id === sel.id)!;
    const c = findComp(data, p.componentId);
    body = c ? <ComponentCard comp={c} placement={p} d={d} /> : <DiagramCard d={d} />;
  } else if (sel.kind === 'component') {
    const c = findComp(data, sel.id);
    body = c ? <ComponentCard comp={c} placement={null} d={d} /> : <DiagramCard d={d} />;
  } else if (sel.kind === 'relation') {
    body = <RelationCard r={d.relations.find(x => x.id === sel.id)!} d={d} />;
  } else if (sel.kind === 'person') {
    const p = findPerson(data, sel.id)!;
    body = <><div className="insp-head"><Avatar p={p} size={26} /><h3>{p.name}</h3></div><div className="muted small">{[p.title, p.team].filter(Boolean).join(' · ')}</div></>;
  } else body = <DiagramCard d={d} />;

  return <aside id="inspector" className="ro">{body}</aside>;
}
