/**
 * Catálogo de APIs en el inspector.
 *
 * Dos paneles muy distintos a propósito:
 *  - `ApiPanel`: la API en sí. Aquí se edita todo, y lo que se toca cambia en **todos** los
 *    sitios donde se esté usando; el panel lo dice con el número de usos delante.
 *  - `ApiInstancePanel`: una instancia en una celda. Aquí NO se edita la API: sólo se elige
 *    qué operación se usa en esa celda y se escribe una nota propia de ese uso.
 */
import { useState } from 'react';
import { useStore } from '../store';
import { actions } from '../actions';
import { curDiagram, findComp } from '../lib/model';
import { apiUsage, findOp, opLabel, opName } from '../lib/api';
import { parseJsonFields } from '../lib/schema';
import { PeopleOf } from './People';
import { RulesOf } from './Rules';
import { METHODS, type Api, type ApiOperation, type KeyValue, type Placement } from '../types';

// ---------------------------------------------------------------- utilidades de edición
function KeyValueEditor({ label, cols, items, onChange, onFocus }: {
  label: string; cols?: string; items: KeyValue[]; onChange(v: KeyValue[]): void; onFocus(): void;
}) {
  const [kl, vl] = (cols ?? 'Clave|Valor').split('|');
  return (
    <div className="fld">
      <span className="fld-label">{label} <small>({items.length})</small></span>
      {items.length > 0 && <div className="kv-head"><span>{kl}</span><span>{vl ?? 'Valor'}</span></div>}
      {items.map((it, i) => (
        <div key={i} className="kv-row two">
          <input value={it.key} placeholder={kl} onFocus={onFocus} onChange={e => onChange(items.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
          <input value={it.value} placeholder={vl ?? 'Valor'} onFocus={onFocus} onChange={e => onChange(items.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
          <button className="btn icon danger" title="Quitar" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button className="btn small" onClick={() => { onFocus(); onChange([...items, { key: '', value: '' }]); }}>+ Añadir</button>
    </div>
  );
}

function JsonEditor({ label, value, onChange, onFocus }: { label: string; value: string; onChange(v: string): void; onFocus(): void }) {
  const campos = parseJsonFields(value);
  const malo = !!value.trim() && !campos;
  const hojas = campos?.filter(f => f.leaf) ?? [];
  return (
    <div className="fld json-fld">
      <label>{label}{malo && <span className="warn"> · JSON no válido</span>}{campos && <span className="ok"> · {hojas.length} campo(s)</span>}
        <textarea className={'code' + (malo ? ' invalid' : '')} rows={6} spellCheck={false} value={value}
          onFocus={onFocus} onChange={e => onChange(e.target.value)} placeholder='{ "campo": "valor" }' />
      </label>
      <button className="btn small" disabled={malo || !value.trim()}
        onClick={() => onChange(JSON.stringify(JSON.parse(value), null, 2))}>Formatear</button>
    </div>
  );
}

// ---------------------------------------------------------------- una operación
function OperationEditor({ api, op }: { api: Api; op: ApiOperation }) {
  const snapshot = useStore(s => s.snapshot);
  const data = useStore(s => s.data);
  const upd = (patch: Partial<ApiOperation>, snap = false) => actions.updateOperation(api.id, op.id, patch, snap);
  const usos = data.diagrams.reduce((n, g) => n + g.placements.filter(p => p.operationId === op.id).length, 0);
  const i = api.operations.findIndex(x => x.id === op.id);
  return (
    <div className="op-edit">
      <div className="row">
        <label style={{ flex: 3 }}>Nombre<input value={op.name} onFocus={snapshot} onChange={e => upd({ name: e.target.value })} placeholder="Consultar perfil" /></label>
        <button className="btn icon" disabled={i <= 0} title="Subir" onClick={() => actions.moveOperation(api.id, op.id, -1)}>↑</button>
        <button className="btn icon" disabled={i < 0 || i >= api.operations.length - 1} title="Bajar" onClick={() => actions.moveOperation(api.id, op.id, 1)}>↓</button>
      </div>
      <div className="row">
        <label style={{ flex: 1 }}>Método
          <select value={op.method} onChange={e => upd({ method: e.target.value }, true)}>
            {METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label style={{ flex: 3 }}>Ruta<input value={op.path} onFocus={snapshot} onChange={e => upd({ path: e.target.value })} placeholder="/v1/clientes/{id}" /></label>
      </div>
      <label>Resumen<input value={op.summary} onFocus={snapshot} onChange={e => upd({ summary: e.target.value })} placeholder="Qué hace" /></label>
      <label className="chk"><input type="checkbox" checked={!!op.deprecated} onChange={e => upd({ deprecated: e.target.checked || undefined }, true)} /> Obsoleta</label>

      <KeyValueEditor label="Parámetros de ruta" cols="Parámetro|Descripción" items={op.pathParams} onFocus={snapshot} onChange={v => upd({ pathParams: v })} />
      <KeyValueEditor label="Parámetros de consulta" cols="Parámetro|Descripción" items={op.queryParams} onFocus={snapshot} onChange={v => upd({ queryParams: v })} />
      <KeyValueEditor label="Cabeceras" cols="Cabecera|Valor" items={op.headers} onFocus={snapshot} onChange={v => upd({ headers: v })} />
      <JsonEditor label="Request body" value={op.requestBody} onFocus={snapshot} onChange={v => upd({ requestBody: v })} />
      <JsonEditor label="Response body" value={op.responseBody} onFocus={snapshot} onChange={v => upd({ responseBody: v })} />
      <KeyValueEditor label="Códigos de respuesta" cols="Código|Significado" items={op.codes} onFocus={snapshot} onChange={v => upd({ codes: v })} />
      <label>Notas<textarea rows={2} value={op.notes} onFocus={snapshot} onChange={e => upd({ notes: e.target.value })} /></label>

      <div className="row">
        <button className="btn" onClick={() => actions.duplicateOperation(api.id, op.id)}>⧉ Duplicar</button>
        <button className="btn danger" onClick={() => actions.deleteOperation(api.id, op.id)}>Eliminar operación</button>
      </div>
      {usos > 0 && <div className="muted small">Elegida en {usos} instancia(s).</div>}
    </div>
  );
}

// ---------------------------------------------------------------- la API
export function ApiPanel({ api }: { api: Api }) {
  const data = useStore(s => s.data);
  const snapshot = useStore(s => s.snapshot);
  const select = useStore(s => s.select);
  const [abierta, setAbierta] = useState<string | null>(api.operations[0]?.id ?? null);
  const upd = (patch: Partial<Api>, snap = false) => actions.updateApi(api.id, patch, snap);
  const usos = apiUsage(data, api.id);
  const total = usos.reduce((n, x) => n + x.placements.length, 0);

  return (
    <>
      <div className="insp-head" style={{ ['--c' as string]: api.color }}>
        <span className="icon big">{api.icon || '🔌'}</span><h3>{api.name}</h3>
      </div>
      <div className={'notice' + (total ? '' : ' ok')}>
        {total
          ? `Se usa en ${total} instancia(s) de ${usos.length} diagrama(s). Lo que cambies aquí cambia en todas.`
          : 'Todavía no se usa en ningún diagrama. Arrástrala a una celda desde la pestaña APIs.'}
      </div>

      <label>Nombre<input value={api.name} onFocus={snapshot} onChange={e => upd({ name: e.target.value })} /></label>
      <label>Descripción<textarea rows={2} value={api.description} onFocus={snapshot} onChange={e => upd({ description: e.target.value })} /></label>
      <div className="row">
        <label style={{ flex: 2 }}>Versión<input value={api.version} onFocus={snapshot} onChange={e => upd({ version: e.target.value })} /></label>
        <label style={{ flex: 1 }}>Icono<input value={api.icon} maxLength={4} onFocus={snapshot} onChange={e => upd({ icon: e.target.value })} /></label>
        <label style={{ flex: 1 }}>Color<input type="color" value={api.color} onFocus={snapshot} onChange={e => upd({ color: e.target.value })} /></label>
      </div>
      <label>Repositorio
        <input value={api.repoUrl} onFocus={snapshot} onChange={e => upd({ repoUrl: e.target.value })} placeholder="https://github.com/…" />
      </label>
      {api.repoUrl && <a className="btn small" href={api.repoUrl} target="_blank" rel="noreferrer">Abrir el repositorio ↗</a>}
      <label>Documentación<input value={api.docsUrl} onFocus={snapshot} onChange={e => upd({ docsUrl: e.target.value })} placeholder="https://…" /></label>
      <label>Autenticación<input value={api.auth} onFocus={snapshot} onChange={e => upd({ auth: e.target.value })} placeholder="OAuth2 client_credentials, API key…" /></label>
      <label>Etiquetas<input value={api.tags} onFocus={snapshot} onChange={e => upd({ tags: e.target.value })} placeholder="cliente, kyc" /></label>
      <KeyValueEditor label="Base URL por entorno" cols="Entorno|URL" items={api.baseUrls} onFocus={snapshot} onChange={v => upd({ baseUrls: v })} />

      <h4>Operaciones ({api.operations.length})</h4>
      <div className="muted small">Cada uso de la API en una celda elige una de estas operaciones.</div>
      {api.operations.map(o => (
        <div key={o.id} className={'op-item' + (abierta === o.id ? ' open' : '')}>
          <button className="op-head" onClick={() => setAbierta(abierta === o.id ? null : o.id)}>
            <span className={'method m-' + o.method.toLowerCase()}>{o.method}</span>
            <span className="txt"><b>{o.name || '(sin nombre)'}</b><small>{o.path || '/'}</small></span>
            <span className="caret">{abierta === o.id ? '▾' : '▸'}</span>
          </button>
          {abierta === o.id && <OperationEditor api={api} op={o} />}
        </div>
      ))}
      <div className="row">
        <button className="btn primary" onClick={() => { const id = actions.addOperation(api.id); if (id) setAbierta(id); }}>+ Operación</button>
        <button className="btn" onClick={() => void actions.importOpenApi(api.id)} title="Añade las operaciones de un archivo OpenAPI">⤓ OpenAPI</button>
        <button className="btn" disabled={!api.operations.length} onClick={() => actions.exportOpenApi(api.id)} title="Descarga esta API como OpenAPI 3.1">⤒ OpenAPI</button>
      </div>

      {usos.length > 0 && (
        <>
          <h4>Dónde se usa ({total})</h4>
          {usos.map(({ diagram, placements }) => (
            <div key={diagram.id} className="assign-row">
              <button className="chip-btn" onClick={() => { actions.setCurrent(diagram.id); }}>{diagram.name}</button>
              <span className="muted small">{placements.length} instancia(s)</span>
            </div>
          ))}
        </>
      )}

      <PeopleOf kind="component" targetId={`api-${api.id}`} label={api.name} />

      <div className="actions">
        <button className="btn" onClick={() => actions.duplicateApi(api.id)}>⧉ Duplicar API</button>
        <button className="btn danger" onClick={() => { actions.deleteApi(api.id); select(null); }}>Eliminar API</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- una instancia
export function ApiInstancePanel({ api, placement }: { api: Api; placement: Placement }) {
  const data = useStore(s => s.data);
  const select = useStore(s => s.select);
  const setUI = useStore(s => s.setUI);
  const d = curDiagram(data)!;
  const op = findOp(api, placement.operationId);
  const capa = d.layers.find(l => l.id === placement.layerId);
  const etapa = d.stages.find(s => s.id === placement.stageId);
  const comp = findComp(data, placement.componentId);

  return (
    <>
      <div className="insp-head" style={{ ['--c' as string]: api.color }}>
        <span className="icon big">{api.icon || '🔌'}</span><h3>{api.name}</h3>
      </div>
      <div className="muted small">API del catálogo · {capa?.name ?? '?'} · {etapa?.name ?? '?'}</div>

      <h4>Operación en esta celda</h4>
      <select value={placement.operationId ?? ''} onChange={e => actions.setPlacementOperation(placement.id, e.target.value || null)}>
        <option value="">— Sin elegir —</option>
        {api.operations.map(o => <option key={o.id} value={o.id}>{opName(o)}{o.path ? ` · ${opLabel(o)}` : ''}</option>)}
      </select>
      {api.operations.length === 0 && <div className="notice">Esta API todavía no tiene operaciones. Añádelas editando la API.</div>}
      {op && (
        <div className="op-summary">
          <div><span className={'method m-' + op.method.toLowerCase()}>{op.method}</span> <code>{op.path}</code></div>
          {op.summary && <div className="muted small">{op.summary}</div>}
          {op.deprecated && <div className="notice">Operación marcada como obsoleta.</div>}
        </div>
      )}

      <h4>Nota de esta instancia</h4>
      <textarea className="api-note" rows={3} value={placement.note ?? ''}
        onChange={e => actions.setPlacementNote(placement.id, e.target.value)}
        placeholder="Qué pinta esta API aquí, salvedades de este paso…" />
      <div className="muted small">Es lo único que pertenece a esta celda: no se ve en los demás usos de la API.</div>

      <h4>La API (común a todos sus usos)</h4>
      <div className="ro-field"><span className="fld-label">Repositorio</span>
        {api.repoUrl ? <a href={api.repoUrl} target="_blank" rel="noreferrer">{api.repoUrl}</a> : <span className="muted">Sin repositorio</span>}
      </div>
      {api.baseUrls.filter(b => b.value).length > 0 && (
        <div className="ro-field"><span className="fld-label">Base URL por entorno</span>
          <table className="table kv-view"><tbody>
            {api.baseUrls.filter(b => b.value).map((b, i) => <tr key={i}><td><code>{b.key}</code></td><td>{b.value}</td></tr>)}
          </tbody></table>
        </div>
      )}
      <div className="muted small">Para cambiar cualquiera de estos datos hay que editar la API, y eso cambia en todos los sitios donde se use.</div>
      <button className="btn wide" onClick={() => { select({ kind: 'api', id: api.id }); setUI({ inspectorOpen: true }); }}>🔌 Ver y editar la API…</button>

      {comp && <RulesOf componentId={comp.id} />}
      <PeopleOf kind="component" targetId={placement.componentId} label={api.name} />

      <div className="actions">
        <button className="btn danger" onClick={() => actions.removePlacement(placement.id)}>Quitar de la celda</button>
      </div>
    </>
  );
}
