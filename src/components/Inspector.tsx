import { useStore, useValidSel } from '../store';
import { actions } from '../actions';
import { childrenOf, collaborators, curDiagram, findComp, findPerson, findType, libOfComp, libOfType, participants, placementsOf, targetDiagram, targetName } from '../lib/model';
import { DIRS, KINDS, STYLES, type Component, type ComponentType, type Diagram, type Dir, type FieldDef, type FieldKind, type KeyValue, type LineStyle, type Placement, type Relation } from '../types';
import { useState } from 'react';
import { connectableFields, parseJsonFields } from '../lib/schema';
import { resolveStyle } from '../lib/rules';
import { Avatar, PeopleOf } from './People';
import { RulePanel, RulesOf } from './Rules';
import { ASSIGN_LABEL, ROLES, type Person } from '../types';

export function Inspector() {
  const data = useStore(s => s.data);
  const sel = useValidSel();
  const d = curDiagram(data);
  if (!d) return <aside id="inspector"><p className="muted">Crea un diagrama para empezar.</p></aside>;

  let body: React.ReactElement;
  if (!sel) body = <DiagramPanel d={d} />;
  else if (sel.kind === 'placement') {
    const p = d.placements.find(x => x.id === sel.id)!;
    body = <ComponentPanel comp={findComp(data, p.componentId)!} placement={p} d={d} />;
  } else if (sel.kind === 'component') body = <ComponentPanel comp={findComp(data, sel.id)!} placement={null} d={d} />;
  else if (sel.kind === 'person') body = <PersonPanel p={findPerson(data, sel.id)!} />;
  else if (sel.kind === 'rule') body = <RulePanel r={data.rules.find(r => r.id === sel.id)!} />;
  else if (sel.kind === 'relation') body = <RelationPanel r={d.relations.find(x => x.id === sel.id)!} d={d} />;
  else body = <TypePanel t={findType(data, sel.id)!} />;
  return <aside id="inspector">{body}</aside>;
}

// ---------------------------------------------------------------- Diagrama
function DiagramPanel({ d }: { d: Diagram }) {
  const { mutate, snapshot, ui, setUI } = useStore();
  const upd = (patch: Partial<Diagram>) => mutate(dd => { const g = curDiagram(dd); if (g) Object.assign(g, patch); }, false);
  return (
    <>
      <h3>Diagrama</h3>
      <label>Nombre<input value={d.name} onFocus={snapshot} onChange={e => upd({ name: e.target.value })} /></label>
      <label>Descripción<textarea rows={3} value={d.description} onFocus={snapshot} onChange={e => upd({ description: e.target.value })} /></label>
      <div className="stats">{d.layers.length} capas · {d.stages.length} etapas · {d.placements.length} instancias · {d.relations.length} relaciones</div>

      <h4>Compartir</h4>
      <label className="chk">
        <input type="checkbox" checked={!!d.public}
          onChange={e => { snapshot(); upd({ public: e.target.checked }); }} /> Público para lectura
      </label>
      {d.public ? (
        <div className="share-box">
          <div className="muted small">Cualquiera con el enlace puede verlo, sin cuenta y sin poder editarlo. Se publica lo que necesita para dibujarse: el diagrama, sus componentes, las personas asignadas y las reglas de estilo. No se comparten los correos ni el resto de tus diagramas.</div>
          <div className="row">
            <input readOnly value={`${location.origin}/p/${d.id}`} onFocus={e => e.currentTarget.select()} />
            <button className="btn" onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/p/${d.id}`); }}>Copiar</button>
            <a className="btn" href={`/p/${d.id}`} target="_blank" rel="noreferrer">Abrir</a>
          </div>
          <div className="muted small">Necesita haberse sincronizado con tu cuenta: sin sesión iniciada el enlace no funciona.</div>
        </div>
      ) : <div className="muted small">Mientras no lo publiques, sólo se ve desde tu cuenta.</div>}

      <PeopleOf kind="diagram" targetId={d.id} label={d.name} />

      <h4>Grupos de etapas ({(d.stageGroups ?? []).length})</h4>
      <div className="muted small">Una banda por encima de las columnas. En el tablero puedes arrastrar sobre la franja gris para crear un grupo, y arrastrar los bordes de una banda para abarcar más o menos columnas. Aquí puedes marcarlas a mano; si quedan separadas, el grupo se dibuja en varios tramos.</div>
      {(d.stageGroups ?? []).map(gr => (
        <div key={gr.id} className="sg-edit">
          <div className="row">
            <input value={gr.name} onFocus={snapshot} onChange={e => actions.renameStageGroup(gr.id, e.target.value)} />
            <input type="color" value={gr.color ?? '#94a3b8'} onFocus={snapshot} onChange={e => actions.colorStageGroup(gr.id, e.target.value)} title="Color del grupo" />
            <button className="btn icon danger" onClick={() => actions.deleteStageGroup(gr.id)} title="Deshacer el grupo">×</button>
          </div>
          <div className="sg-chips">
            {d.stages.map(s => (
              <label key={s.id} className={'chk-chip' + (s.groupId === gr.id ? ' on' : '') + (s.groupId && s.groupId !== gr.id ? ' taken' : '')}>
                <input type="checkbox" checked={s.groupId === gr.id}
                  onChange={e => actions.setStageGroup(s.id, e.target.checked ? gr.id : null)} />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button className="btn" onClick={() => actions.addStageGroup()}>+ Nuevo grupo de etapas</button>

      <h4>Flecha por defecto (para las nuevas relaciones)</h4>
      <label>Estilo<select value={ui.link.style} onChange={e => setUI({ link: { ...ui.link, style: e.target.value as LineStyle } })}>
        {Object.entries(STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Dirección<select value={ui.link.dir} onChange={e => setUI({ link: { ...ui.link, dir: e.target.value as Dir } })}>
        {Object.entries(DIRS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <div className="row">
        <label>Color<input type="color" value={ui.link.color} onChange={e => setUI({ link: { ...ui.link, color: e.target.value } })} /></label>
        <label>Grosor<input type="number" min={1} max={8} value={ui.link.width} onChange={e => setUI({ link: { ...ui.link, width: Number(e.target.value) || 2 } })} /></label>
      </div>

      <h4>Cómo se usa</h4>
      <ul className="help">
        <li><b>Filas = capas</b>, <b>columnas = etapas</b>. Arrastra ⋮⋮ para reordenar; escribe en la cabecera para renombrar.</li>
        <li>Arrastra un componente de la librería a una celda. Puedes soltarlo en varias etapas: sus <b>clones brillan</b> al pasar el ratón.</li>
        <li>Arrastra el <b>borde derecho</b> de una celda o cabecera para cambiar el ancho de la etapa, y el <b>borde inferior</b> para el alto de la capa. Doble clic en el borde = tamaño automático.</li>
        <li>Dentro de la celda colócalo <b>donde quieras</b> arrastrándolo (se ajusta a una rejilla de 8 px). Con el componente seleccionado, las flechas del teclado lo mueven; ⊞ apila los de una celda.</li>
        <li><b>Subcomponentes:</b> suelta un componente encima de otro para meterlo dentro (p. ej. un microservicio dentro de su API). Arrástralo fuera, a la celda, para sacarlo. Las relaciones pueden salir de o llegar a un subcomponente.</li>
        <li><b>Componentes compartidos:</b> un mismo componente puede estar en varios diagramas y al editarlo cambia en todos. Al <b>duplicar un diagrama</b> puedes pedir copias independientes; y en el inspector tienes “Duplicar componente” y “Desvincular” para separar uno cuando quieras.</li>
        <li><b>Cabeceras fijas:</b> los botones ⇤ y ⤒ de la barra superior mantienen a la vista la columna de capas y la fila de etapas mientras te desplazas. También desde el clic derecho en una capa o una etapa. El nombre de cada capa, etapa y grupo se queda a la vista mientras su bloque siga en pantalla.</li>
        <li><b>Zoom del diagrama:</b> los controles de abajo a la izquierda, o Ctrl y rueda sobre el tablero (Ctrl +, Ctrl −, Ctrl 0). Amplía sólo el diagrama, no la interfaz. Por encima del 100 % las cabeceras dejan de estar fijas.</li>
        <li><b>Mover el lienzo:</b> mantén la <b>barra espaciadora</b> y arrastra, usa el <b>botón central</b> del ratón, o arrastra desde una zona libre del tablero.</li>
        <li><b>Agrupar etapas:</b> arrastra sobre la franja gris que hay encima de las cabeceras de etapa para crear un grupo (“Evaluación rápida” sobre varias columnas) y escribe su nombre; arrastra los bordes de la banda para abarcar más o menos columnas.</li>
        <li><b>Contrato de API:</b> crea un tipo con “+ Tipo API” en la pestaña Tipos. Trae método, path, base URL por entorno, cabeceras, parámetros, request/response en JSON y códigos de respuesta. Los campos se editan al seleccionar el componente; los JSON válidos muestran su estructura (campos, tipos y ejemplos).</li>
        <li>Arrastra desde el punto <b>●</b> de un componente hasta otro para crear una relación (puede saltar capas y etapas).</li>
        <li>Haz clic en una flecha para cambiar estilo (directa, troceada, punteada), dirección, color y etiqueta.</li>
        <li>Ctrl+arrastrar una instancia = clonarla. Suelta una instancia en la librería para quitarla. <b>Supr</b> borra lo seleccionado. <b>Ctrl+Z</b> deshace, <b>Ctrl+Shift+Z</b> rehace.</li>
        <li><b>Copiar y pegar:</b> selecciona una instancia (o un componente de la librería), <b>Ctrl+C</b>, haz clic en la celda destino y <b>Ctrl+V</b>. <b>Ctrl+D</b> duplica en la misma celda y <b>Ctrl+Shift+D</b> desvincula (copia independiente); <b>Ctrl+Shift+V</b> pega ya desvinculado. <b>Clic derecho</b> abre el menú de acciones. Pulsa <b>?</b> para ver todos los atajos.</li>
        <li><b>Más espacio:</b> los botones ◧ ◨ de la barra superior (o Ctrl+J para la librería y Ctrl+B para el inspector) los ocultan; la pestaña del borde o un doble clic en un componente los vuelven a mostrar. <b>Zen</b> (Ctrl+Shift+F) deja sólo el tablero; ⤢ pone pantalla completa.</li>
        <li><b>Ventanas separadas:</b> con ⧉ abres la librería, el inspector o el tablero en otra ventana del navegador. Comparten datos y selección al instante, y puedes arrastrar componentes de una ventana a otra.</li>
        <li><b>Instalable:</b> el navegador ofrece “Instalar Drawer” como aplicación; funciona sin conexión. Tema claro/oscuro con ☀ ☾ ◐.</li>
        <li>Todo se guarda automáticamente en este navegador. Usa Exportar/Importar JSON para respaldar o compartir.</li>
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- Componente
function ComponentPanel({ comp, placement, d }: { comp: Component; placement: Placement | null; d: Diagram }) {
  const data = useStore(s => s.data);
  const { snapshot, select } = useStore();
  const t = findType(data, comp.typeId);
  const lib = libOfComp(data, comp.id);
  const inst = placementsOf(d, comp.id);
  const usedIn = data.diagrams.filter(g => g.placements.some(p => p.componentId === comp.id));
  const rels = placement ? d.relations.filter(r => r.from === placement.id || r.to === placement.id) : [];
  const { ui, setUI } = useStore();
  const gente = participants(data, 'component', comp.id);
  const { style: rstyle, rules: reglas } = resolveStyle(data, comp, d.id);
  const [addL, setAddL] = useState(d.layers[0]?.id ?? '');
  const [addS, setAddS] = useState(d.stages[0]?.id ?? '');
  const nameOf = (pid: string) => {
    const p = d.placements.find(x => x.id === pid); const c = p && findComp(data, p.componentId);
    const L = d.layers.find(l => l.id === p?.layerId), S = d.stages.find(s => s.id === p?.stageId);
    return c ? `${c.name} (${L?.name ?? '?'} · ${S?.name ?? '?'})` : '?';
  };

  // el panel tenía demasiada información seguida: se agrupa en pestañas y sólo el
  // nombre queda siempre a la vista, que es lo que identifica al componente
  const tabs: { key: string; label: string; n?: number }[] = [
    { key: 'datos', label: '📋 Datos', n: t?.fields.length },
    { key: 'sitio', label: '◫ Sitio', n: inst.length },
    { key: 'personas', label: '👥 Personas', n: gente.length },
    { key: 'estilo', label: '🎨 Estilo', n: reglas.length },
    { key: 'mas', label: '⚙ Más' },
  ];
  const tab = tabs.some(x => x.key === ui.compTab) ? ui.compTab : 'datos';

  return (
    <>
      <div className="insp-head" style={{ ['--c' as string]: t?.color ?? '#94a3b8' }}>
        <span className="icon big">{rstyle.icon || t?.icon || '▫️'}</span>
        <h3>{placement ? 'Componente en celda' : 'Componente'}</h3>
      </div>
      <label>Nombre<input value={comp.name} onFocus={snapshot} onChange={e => actions.updateComponent(comp.id, { name: e.target.value })} /></label>

      <div className="insp-tabs">
        {tabs.map(x => (
          <button key={x.key} className={'itab' + (tab === x.key ? ' on' : '')} onClick={() => setUI({ compTab: x.key })} title={x.label.replace(/^\S+\s/, '')}>
            {x.label}{x.n ? <small>{x.n}</small> : null}
          </button>
        ))}
      </div>

      {tab === 'datos' && (
        <>
          <label>Tipo
            <select value={comp.typeId ?? ''} onChange={e => actions.updateComponent(comp.id, { typeId: e.target.value || null }, true)}>
              <option value="">Sin tipo</option>
              {data.libraries.map(l => l.types.length > 0 && (
                <optgroup key={l.id} label={l.name}>{l.types.map(tt => <option key={tt.id} value={tt.id}>{tt.icon} {tt.name}</option>)}</optgroup>
              ))}
            </select>
          </label>
          <label>Descripción<textarea rows={2} value={comp.description} onFocus={snapshot} onChange={e => actions.updateComponent(comp.id, { description: e.target.value })} /></label>
          {t && t.fields.length > 0 && (
            <>
              <h4>Campos de “{t.name}” <button className="link" onClick={() => select({ kind: 'type', id: t.id })}>editar tipo</button></h4>
              {t.fields.map(f => <FieldInput key={f.key} def={f} value={comp.fields[f.key]} onFocus={snapshot} onChange={v => actions.setField(comp.id, f.key, v)} />)}
            </>
          )}
          {t && t.fields.length === 0 && <div className="muted">El tipo “{t.name}” no define campos. <button className="link" onClick={() => select({ kind: 'type', id: t.id })}>Editar tipo</button></div>}
          {!t && <div className="muted">Sin tipo: elige uno arriba para tener campos propios.</div>}
        </>
      )}

      {tab === 'sitio' && (
        <>
          <h4>Instancias en este diagrama ({inst.length})</h4>
          <div className="inst-list">
            {inst.length === 0 && <span className="muted">Ninguna todavía.</span>}
            {inst.map(x => {
              const L = d.layers.find(l => l.id === x.layerId), S = d.stages.find(s => s.id === x.stageId);
              return <button key={x.id} className={'chip-btn' + (placement?.id === x.id ? ' on' : '')} onClick={() => select({ kind: 'placement', id: x.id })}>{L?.name ?? '?'} · {S?.name ?? '?'}</button>;
            })}
          </div>
          <div className="row">
            <select value={addL} onChange={e => setAddL(e.target.value)}>{d.layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <select value={addS} onChange={e => setAddS(e.target.value)}>{d.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <button className="btn" disabled={!addL || !addS} onClick={() => actions.place(comp.id, addL, addS)}>Colocar</button>
          </div>

          {placement && (
            <>
              <h4>Subcomponentes ({childrenOf(d, placement.id).length})</h4>
              {placement.parentId && (() => { const par = d.placements.find(x => x.id === placement.parentId); const pc = par && findComp(data, par.componentId);
                return <div className="muted" style={{ marginBottom: 6 }}>Dentro de <button className="chip-btn" onClick={() => select({ kind: 'placement', id: par!.id })}>{pc?.name ?? '?'}</button> <button className="btn" onClick={() => actions.unnest(placement.id)}>Sacar del contenedor</button></div>; })()}
              <div className="inst-list">
                {childrenOf(d, placement.id).map(k => { const kc = findComp(data, k.componentId); return <button key={k.id} className="chip-btn" onClick={() => select({ kind: 'placement', id: k.id })}>{kc?.name ?? '?'}</button>; })}
                <button className="btn" onClick={() => actions.quickAddChild(placement.id)}>+ Nuevo subcomponente</button>
              </div>
              <div className="muted">Arrastra un componente encima de este para meterlo dentro; arrástralo a la celda para sacarlo.</div>
              {!placement.parentId && <h4>Posición en la celda</h4>}
              {!placement.parentId && <div className="row">
                <label>X<input type="number" min={0} step={8} value={placement.x} onFocus={snapshot} onChange={e => actions.setPos(placement.id, Number(e.target.value) || 0, placement.y)} /></label>
                <label>Y<input type="number" min={0} step={8} value={placement.y} onFocus={snapshot} onChange={e => actions.setPos(placement.id, placement.x, Number(e.target.value) || 0)} /></label>
                <button className="btn" onClick={() => actions.tidyCell(placement.layerId, placement.stageId)} title="Apilar todos los componentes de la celda">⊞ Ordenar celda</button>
              </div>}
              <h4>Relaciones de esta instancia ({rels.length})</h4>
              <div className="rel-list">
                {rels.length === 0 && <span className="muted">Ninguna. Arrastra desde el punto ● hacia otro componente.</span>}
                {rels.map(r => (
                  <button key={r.id} className="chip-btn" onClick={() => select({ kind: 'relation', id: r.id })}>
                    {r.from === placement.id ? `→ ${nameOf(r.to)}` : `← ${nameOf(r.from)}`}{r.label ? ` · “${r.label}”` : ''}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'personas' && <PeopleOf kind="component" targetId={comp.id} label={comp.name} />}

      {tab === 'estilo' && (
        reglas.length > 0
          ? <RulesOf componentId={comp.id} />
          : <div className="muted">Ninguna regla de estilo pinta este componente. Créalas en la pestaña <b>Reglas</b> de la librería.</div>
      )}

      {tab === 'mas' && (
        <>
          <label>Librería
            <select value={lib?.id ?? ''} onChange={e => actions.moveComponentToLib(comp.id, e.target.value)}>
              {data.libraries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <h4>Uso en diagramas ({usedIn.length})</h4>
          <div className="inst-list">
            {usedIn.length === 0 && <span className="muted">No está colocado en ningún diagrama.</span>}
            {usedIn.map(g => <button key={g.id} className={'chip-btn' + (g.id === d.id ? ' on' : '')} onClick={() => actions.setCurrent(g.id)} title="Ir al diagrama">{g.name}</button>)}
          </div>
          {usedIn.length > 1 && <div className="notice">Este componente es <b>compartido</b>: editarlo aquí cambia también los otros {usedIn.length - 1} diagrama(s). Si no lo quieres, desvincúlalo.</div>}
          <h4>Copias y vínculos</h4>
          <div className="row">
            <button className="btn" onClick={() => actions.duplicateComponent(comp.id)} title="Crea una copia independiente en la librería">⧉ Duplicar componente</button>
            <button className="btn" onClick={() => actions.splitInstances(comp.id)} disabled={inst.length < 2}
              title="Cada instancia de este diagrama pasa a tener su propia copia y dejan de ser clones entre sí">⧉ Separar sus {inst.length} instancias</button>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn" onClick={() => actions.detachComponent(comp.id, undefined)} disabled={usedIn.length < 2}
              title={usedIn.length < 2 ? 'Sólo se usa en este diagrama: no hay de qué desvincularlo' : 'Las instancias de este diagrama pasan a una copia independiente; los demás diagramas conservan el original'}>⛓ Desvincular en este diagrama</button>
            {placement && inst.length > 1 && (
              <button className="btn" onClick={() => actions.detachComponent(comp.id, placement.id)} title="Sólo esta instancia pasa a una copia independiente">⛓ Desvincular sólo esta instancia</button>
            )}
          </div>
        </>
      )}

      <div className="actions">
        {placement && <button className="btn" onClick={() => actions.removePlacement(placement.id)}>Quitar de la celda</button>}
        <button className="btn danger" onClick={() => actions.deleteComponent(comp.id)}>Eliminar de la librería</button>
      </div>
    </>
  );
}

function FieldInput({ def, value, onChange, onFocus }: { def: FieldDef; value: unknown; onChange(v: unknown): void; onFocus(): void }) {
  const v = value ?? '';
  switch (def.kind) {
    case 'textarea': return <label>{def.label}<textarea rows={2} value={String(v)} onFocus={onFocus} onChange={e => onChange(e.target.value)} /></label>;
    case 'select': {
      const opts = (def.options ?? '').split(',').map(o => o.trim()).filter(Boolean);
      return <label>{def.label}<select value={String(v)} onFocus={onFocus} onChange={e => onChange(e.target.value)}><option value="">—</option>{opts.map(o => <option key={o}>{o}</option>)}</select></label>;
    }
    case 'checkbox': return <label className="chk"><input type="checkbox" checked={Boolean(value)} onFocus={onFocus} onChange={e => onChange(e.target.checked)} /> {def.label}</label>;
    case 'list': {
      const items = Array.isArray(value) ? (value as unknown[]).map(String) : [];
      const set = (arr: string[]) => onChange(arr);
      return (
        <div className="fld">
          <span className="fld-label">{def.label} <small>({items.length})</small></span>
          {items.map((it, idx) => (
            <div key={idx} className="kv-row">
              <input value={it} onFocus={onFocus} onChange={e => set(items.map((x, j) => j === idx ? e.target.value : x))} />
              <button className="btn icon danger" title="Quitar" onClick={() => set(items.filter((_, j) => j !== idx))}>×</button>
            </div>
          ))}
          <button className="btn small" onClick={() => { onFocus(); set([...items, '']); }}>+ Añadir</button>
        </div>
      );
    }
    case 'keyvalue': {
      const items: KeyValue[] = Array.isArray(value) ? (value as KeyValue[]).map(x => ({ key: String(x?.key ?? ''), value: String(x?.value ?? '') })) : [];
      const [kl, vl] = (def.options ?? 'Clave|Valor').split('|');
      const set = (arr: KeyValue[]) => onChange(arr);
      return (
        <div className="fld">
          <span className="fld-label">{def.label} <small>({items.length})</small></span>
          {items.length > 0 && <div className="kv-head"><span>{kl}</span><span>{vl ?? 'Valor'}</span></div>}
          {items.map((it, idx) => (
            <div key={idx} className="kv-row two">
              <input value={it.key} placeholder={kl} onFocus={onFocus} onChange={e => set(items.map((x, j) => j === idx ? { ...x, key: e.target.value } : x))} />
              <input value={it.value} placeholder={vl ?? 'Valor'} onFocus={onFocus} onChange={e => set(items.map((x, j) => j === idx ? { ...x, value: e.target.value } : x))} />
              <button className="btn icon danger" title="Quitar" onClick={() => set(items.filter((_, j) => j !== idx))}>×</button>
            </div>
          ))}
          <button className="btn small" onClick={() => { onFocus(); set([...items, { key: '', value: '' }]); }}>+ Añadir</button>
        </div>
      );
    }
    case 'json': {
      const txt = String(v);
      const fields = parseJsonFields(txt);
      const bad = !!txt.trim() && !fields;
      const leaves = fields?.filter(f => f.leaf) ?? [];
      return (
        <div className="fld json-fld">
          <label>{def.label}{bad && <span className="warn"> · JSON no válido</span>}{fields && <span className="ok"> · {leaves.length} campo(s) reconocido(s)</span>}
            <textarea className={'code' + (bad ? ' invalid' : '')} rows={6} spellCheck={false} value={txt} onFocus={onFocus} onChange={e => onChange(e.target.value)} placeholder='{ "campo": "valor" }' />
            <span className="fld-hint"><button className="link" type="button" onClick={() => { if (!bad && txt.trim()) onChange(JSON.stringify(JSON.parse(txt), null, 2)); }}>Formatear</button></span>
          </label>
          {fields && fields.length > 0 && (
            <details className="schema" open={leaves.length <= 12}>
              <summary>Estructura ({fields.length})</summary>
              <table><thead><tr><th>Campo</th><th>Tipo</th><th>Ejemplo</th></tr></thead>
                <tbody>{fields.map(f => <tr key={f.path} className={f.leaf ? '' : 'branch'}><td><code>{f.path}</code></td><td>{f.type}</td><td className="ex">{f.example}</td></tr>)}</tbody>
              </table>
            </details>
          )}
        </div>
      );
    }
    case 'number': return <label>{def.label}<input type="number" value={String(v)} onFocus={onFocus} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} /></label>;
    default: return <label>{def.label}<input type={def.kind === 'url' ? 'url' : def.kind === 'date' ? 'date' : 'text'} value={String(v)} onFocus={onFocus} onChange={e => onChange(e.target.value)} /></label>;
  }
}

// ---------------------------------------------------------------- Persona
function PersonPanel({ p }: { p: Person }) {
  const data = useStore(s => s.data);
  const { snapshot, select } = useStore();
  const upd = (patch: Partial<Person>) => actions.updatePerson(p.id, patch);
  // participaciones agrupadas por papel
  const porPapel = new Map<string, typeof p.assignments>();
  for (const a of p.assignments) porPapel.set(a.role, [...(porPapel.get(a.role) ?? []), a]);
  const colegas = collaborators(data, p.id);
  const sugerencias = [...new Set([...ROLES, ...actions.usedRoles()])];

  return (
    <>
      <div className="insp-head" style={{ ['--c' as string]: p.color ?? '#94a3b8' }}>
        <Avatar p={p} size={30} />
        <h3>Persona</h3>
      </div>
      <label>Nombre<input value={p.name} onFocus={snapshot} onChange={e => upd({ name: e.target.value })} /></label>
      <label>Cargo<input value={p.title ?? ''} onFocus={snapshot} onChange={e => upd({ title: e.target.value })} placeholder="Arquitecto de soluciones…" /></label>
      <div className="row">
        <label>Equipo / área<input value={p.team ?? ''} onFocus={snapshot} onChange={e => upd({ team: e.target.value })} /></label>
        <label>Color<input type="color" value={p.color ?? '#94a3b8'} onFocus={snapshot} onChange={e => upd({ color: e.target.value })} /></label>
      </div>
      <label>Correo<input type="email" value={p.email ?? ''} onFocus={snapshot} onChange={e => upd({ email: e.target.value })} /></label>
      <label>Notas<textarea rows={2} value={p.notes ?? ''} onFocus={snapshot} onChange={e => upd({ notes: e.target.value })} /></label>

      <h4>Participa en ({p.assignments.length})</h4>
      {p.assignments.length === 0 && <div className="muted small">Todavía no participa en nada. Asígnala desde el inspector de un componente, del diagrama, o con el clic derecho en una capa o etapa.</div>}
      {[...porPapel.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([papel, lista]) => (
        <div key={papel} className="role-block">
          <div className="role-title">{papel} <small>{lista.length}</small></div>
          {lista.map(a => {
            const nombre = targetName(data, a);
            const dg = targetDiagram(data, a);
            return (
              <div key={a.id} className="assign-row">
                <button className="chip-btn" title={`${ASSIGN_LABEL[a.kind]}${dg ? ` · ${dg.name}` : ''}`}
                  onClick={() => {
                    if (dg) actions.setCurrent(dg.id);
                    if (a.kind === 'component') select({ kind: 'component', id: a.targetId });
                    else if (a.kind === 'type') select({ kind: 'type', id: a.targetId });
                    else select(null);
                  }}>
                  <small>{ASSIGN_LABEL[a.kind]}</small> {nombre ?? '(ya no existe)'}
                </button>
                <input className="role-inline" list="roles-sugeridos-insp" value={a.role}
                  onFocus={snapshot} onChange={e => actions.updateAssignment(p.id, a.id, { role: e.target.value })} />
                <button className="btn icon danger" title="Quitar participación" onClick={() => actions.unassign(p.id, a.id)}>×</button>
              </div>
            );
          })}
        </div>
      ))}
      <datalist id="roles-sugeridos-insp">{sugerencias.map(r => <option key={r} value={r} />)}</datalist>

      <h4>Coincide con ({colegas.length})</h4>
      {colegas.length === 0 && <div className="muted small">Nadie más participa en las mismas partes.</div>}
      <div className="people-row">
        {colegas.map(({ person, shared }) => (
          <button key={person.id} className="person-chip as-button" onClick={() => select({ kind: 'person', id: person.id })}
            title={`Coinciden en ${shared} parte(s)`}>
            <Avatar p={person} size={18} />{person.name}<small>{shared}</small>
          </button>
        ))}
      </div>

      <div className="actions">
        <button className="btn danger" onClick={() => actions.deletePerson(p.id)}>Eliminar persona</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Relación
function RelationPanel({ r, d }: { r: Relation; d: Diagram }) {
  const data = useStore(s => s.data);
  const { snapshot, select } = useStore();
  /** Campos conectables del componente que hay en un extremo de la relación. */
  const fieldsOf = (pid: string) => {
    const p = d.placements.find(x => x.id === pid); const c = p && findComp(data, p.componentId);
    if (!c) return [];
    return connectableFields(findType(data, c.typeId)?.fields, c.fields);
  };
  const fromFields = fieldsOf(r.from), toFields = fieldsOf(r.to);
  const FieldPicker = ({ end, value, opts }: { end: 'fromField' | 'toField'; value: string | undefined; opts: ReturnType<typeof fieldsOf> }) => {
    if (opts.length === 0) return <div className="muted small">Sin campos (el componente no tiene tipo con campos).</div>;
    const groups = [...new Set(opts.map(o => o.group))];
    return (
      <select value={value ?? ''} onChange={e => actions.updateRelation(r.id, { [end]: e.target.value || undefined }, true)}>
        <option value="">— todo el componente —</option>
        {groups.map(g => <optgroup key={g} label={g}>{opts.filter(o => o.group === g).map(o => <option key={o.path} value={o.path}>{o.label}</option>)}</optgroup>)}
      </select>
    );
  };
  const desc = (pid: string) => {
    const p = d.placements.find(x => x.id === pid); const c = p && findComp(data, p.componentId);
    const L = d.layers.find(l => l.id === p?.layerId), S = d.stages.find(s => s.id === p?.stageId);
    return <button className="chip-btn" onClick={() => select({ kind: 'placement', id: pid })}>{c?.name ?? '?'} <small>({L?.name} · {S?.name})</small></button>;
  };
  return (
    <>
      <h3>Relación</h3>
      <div className="rel-ends">{desc(r.from)}<span className="arrow">{r.dir === 'both' ? '↔' : r.dir === 'none' ? '—' : '→'}</span>{desc(r.to)}</div>
      <label>Estilo<select value={r.style} onChange={e => actions.updateRelation(r.id, { style: e.target.value as LineStyle }, true)}>
        {Object.entries(STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Dirección<select value={r.dir} onChange={e => actions.updateRelation(r.id, { dir: e.target.value as Dir }, true)}>
        {Object.entries(DIRS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Etiqueta<input value={r.label} onFocus={snapshot} onChange={e => actions.updateRelation(r.id, { label: e.target.value })} placeholder="p. ej. envía pedido" /></label>

      <h4>Conexión por campos</h4>
      <div className="muted small">Opcional: qué campo del origen alimenta qué campo del destino. Los JSON válidos de request/response se despliegan campo a campo.</div>
      <label>Campo de origen<FieldPicker end="fromField" value={r.fromField} opts={fromFields} /></label>
      <label>Campo de destino<FieldPicker end="toField" value={r.toField} opts={toFields} /></label>
      {(r.fromField || r.toField) && <div className="map-preview"><code>{r.fromField ?? '*'}</code> → <code>{r.toField ?? '*'}</code>
        <button className="link" onClick={() => actions.updateRelation(r.id, { fromField: undefined, toField: undefined }, true)}>Quitar</button></div>}
      <div className="row">
        <label>Color<input type="color" value={r.color} onFocus={snapshot} onChange={e => actions.updateRelation(r.id, { color: e.target.value })} /></label>
        <label>Grosor<input type="number" min={1} max={8} value={r.width} onFocus={snapshot} onChange={e => actions.updateRelation(r.id, { width: Math.max(1, Number(e.target.value) || 1) })} /></label>
      </div>
      <div className="actions">
        <button className="btn" onClick={() => actions.swapRelation(r.id)}>⇄ Invertir sentido</button>
        <button className="btn danger" onClick={() => actions.deleteRelation(r.id)}>Eliminar</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Tipo
function TypePanel({ t }: { t: ComponentType }) {
  const data = useStore(s => s.data);
  const snapshot = useStore(s => s.snapshot);
  const lib = libOfType(data, t.id);
  const n = data.libraries.flatMap(l => l.components).filter(c => c.typeId === t.id).length;
  return (
    <>
      <div className="insp-head" style={{ ['--c' as string]: t.color }}><span className="icon big">{t.icon}</span><h3>Tipo de componente</h3></div>
      <label>Nombre<input value={t.name} onFocus={snapshot} onChange={e => actions.updateType(t.id, { name: e.target.value })} /></label>
      <div className="row">
        <label>Icono (emoji)<input value={t.icon} maxLength={4} onFocus={snapshot} onChange={e => actions.updateType(t.id, { icon: e.target.value })} /></label>
        <label>Color<input type="color" value={t.color} onFocus={snapshot} onChange={e => actions.updateType(t.id, { color: e.target.value })} /></label>
      </div>
      <h4>Campos específicos ({t.fields.length})</h4>
      <div className="fields">
        {t.fields.map((f, i) => (
          <div key={f.key} className="field-row">
            <input value={f.label} placeholder="Etiqueta" onFocus={snapshot} onChange={e => actions.updateField(t.id, i, { label: e.target.value })} />
            <select value={f.kind} onChange={e => actions.updateField(t.id, i, { kind: e.target.value as FieldKind }, true)}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {f.kind === 'select' && <input className="wide" value={f.options ?? ''} placeholder="opción 1, opción 2, …" onFocus={snapshot} onChange={e => actions.updateField(t.id, i, { options: e.target.value })} />}
            {f.kind === 'keyvalue' && <input className="wide" value={f.options ?? ''} placeholder="Etiqueta clave|Etiqueta valor (p. ej. Entorno|URL)" onFocus={snapshot} onChange={e => actions.updateField(t.id, i, { options: e.target.value })} />}
            <button className="btn icon danger" onClick={() => actions.deleteField(t.id, i)} title="Quitar campo">×</button>
          </div>
        ))}
      </div>
      <div className="row">
        <button className="btn" onClick={() => actions.addField(t.id)}>+ Añadir campo</button>
        <button className="btn" title="Añade los campos del contrato de una API que falten (método, path, URLs por entorno, request/response…)"
          onClick={() => actions.addContractFields(t.id)}>+ Campos de contrato API</button>
      </div>
      <div className="muted" style={{ marginTop: 12 }}>{n} componente(s) usan este tipo · Librería: {lib?.name}</div>
      <div className="actions"><button className="btn danger" onClick={() => actions.deleteType(t.id)}>Eliminar tipo</button></div>
    </>
  );
}
