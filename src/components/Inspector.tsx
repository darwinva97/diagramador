import { useStore, useValidSel } from '../store';
import { actions } from '../actions';
import { childrenOf, curDiagram, findComp, findType, libOfComp, libOfType, placementsOf } from '../lib/model';
import { DIRS, KINDS, STYLES, type Component, type ComponentType, type Diagram, type Dir, type FieldDef, type FieldKind, type KeyValue, type LineStyle, type Placement, type Relation } from '../types';
import { useState } from 'react';

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
        <li><b>Contrato de API:</b> crea un tipo con “+ Tipo API” en la pestaña Tipos. Trae método, path, base URL por entorno, cabeceras, parámetros, request/response en JSON y códigos de respuesta. Los campos se editan al seleccionar el componente.</li>
        <li>Arrastra desde el punto <b>●</b> de un componente hasta otro para crear una relación (puede saltar capas y etapas).</li>
        <li>Haz clic en una flecha para cambiar estilo (directa, troceada, punteada), dirección, color y etiqueta.</li>
        <li>Ctrl+arrastrar una instancia = clonarla. Suelta una instancia en la librería para quitarla. <b>Supr</b> borra lo seleccionado. <b>Ctrl+Z</b> deshace.</li>
        <li><b>Más espacio:</b> los botones ◧ ◨ de la barra superior (o Ctrl+B / Ctrl+J) ocultan la librería y el inspector; la pestaña del borde o un doble clic en un componente los vuelven a mostrar. <b>Zen</b> (Ctrl+Shift+F) deja sólo el tablero; ⤢ pone pantalla completa.</li>
        <li><b>Ventanas separadas:</b> con ⧉ abres la librería, el inspector o el tablero en otra ventana del navegador. Comparten datos y selección al instante, y puedes arrastrar componentes de una ventana a otra.</li>
        <li><b>Instalable:</b> el navegador ofrece “Instalar Diagramador” como aplicación; funciona sin conexión. Tema claro/oscuro con ☀ ☾ ◐.</li>
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
  const [addL, setAddL] = useState(d.layers[0]?.id ?? '');
  const [addS, setAddS] = useState(d.stages[0]?.id ?? '');
  const nameOf = (pid: string) => {
    const p = d.placements.find(x => x.id === pid); const c = p && findComp(data, p.componentId);
    const L = d.layers.find(l => l.id === p?.layerId), S = d.stages.find(s => s.id === p?.stageId);
    return c ? `${c.name} (${L?.name ?? '?'} · ${S?.name ?? '?'})` : '?';
  };

  return (
    <>
      <div className="insp-head" style={{ ['--c' as string]: t?.color ?? '#94a3b8' }}>
        <span className="icon big">{t?.icon ?? '▫️'}</span>
        <h3>{placement ? 'Componente en celda' : 'Componente'}</h3>
      </div>
      <label>Nombre<input value={comp.name} onFocus={snapshot} onChange={e => actions.updateComponent(comp.id, { name: e.target.value })} /></label>
      <label>Tipo
        <select value={comp.typeId ?? ''} onChange={e => actions.updateComponent(comp.id, { typeId: e.target.value || null }, true)}>
          <option value="">Sin tipo</option>
          {data.libraries.map(l => l.types.length > 0 && (
            <optgroup key={l.id} label={l.name}>{l.types.map(tt => <option key={tt.id} value={tt.id}>{tt.icon} {tt.name}</option>)}</optgroup>
          ))}
        </select>
      </label>
      <label>Librería
        <select value={lib?.id ?? ''} onChange={e => actions.moveComponentToLib(comp.id, e.target.value)}>
          {data.libraries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <label>Descripción<textarea rows={2} value={comp.description} onFocus={snapshot} onChange={e => actions.updateComponent(comp.id, { description: e.target.value })} /></label>

      {t && t.fields.length > 0 && (
        <>
          <h4>Campos de “{t.name}”</h4>
          {t.fields.map(f => <FieldInput key={f.key} def={f} value={comp.fields[f.key]} onFocus={snapshot} onChange={v => actions.setField(comp.id, f.key, v)} />)}
        </>
      )}
      {t && t.fields.length === 0 && <div className="muted">El tipo “{t.name}” no define campos. <button className="link" onClick={() => select({ kind: 'type', id: t.id })}>Editar tipo</button></div>}

      <h4>Uso en diagramas ({usedIn.length})</h4>
      <div className="inst-list">
        {usedIn.length === 0 && <span className="muted">No está colocado en ningún diagrama.</span>}
        {usedIn.map(g => <button key={g.id} className={'chip-btn' + (g.id === d.id ? ' on' : '')} onClick={() => actions.setCurrent(g.id)} title="Ir al diagrama">{g.name}</button>)}
      </div>
      {usedIn.length > 1 && <div className="notice">Este componente es <b>compartido</b>: editarlo aquí cambia también los otros {usedIn.length - 1} diagrama(s). Si no lo quieres, desvincúlalo.</div>}
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn" onClick={() => actions.duplicateComponent(comp.id)} title="Crea una copia independiente en la librería">⧉ Duplicar componente</button>
        <button className="btn" onClick={() => actions.detachComponent(comp.id, undefined)} title="Las instancias de este diagrama pasan a una copia independiente; los demás diagramas conservan el original">⛓ Desvincular en este diagrama</button>
      </div>
      {placement && inst.length > 1 && <div className="row" style={{ marginTop: 6 }}>
        <button className="btn" onClick={() => actions.detachComponent(comp.id, placement.id)} title="Sólo esta instancia pasa a una copia independiente">⛓ Desvincular sólo esta instancia</button>
      </div>}
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
          <div className="muted">Arrastra un componente (de la librería o del tablero) encima de este para meterlo dentro; arrástralo a la celda para sacarlo.</div>
          {!placement.parentId && <h4>Posición en la celda</h4>}
          {!placement.parentId && <div className="row">
            <label>X<input type="number" min={0} step={8} value={placement.x} onFocus={snapshot} onChange={e => actions.setPos(placement.id, Number(e.target.value) || 0, placement.y)} /></label>
            <label>Y<input type="number" min={0} step={8} value={placement.y} onFocus={snapshot} onChange={e => actions.setPos(placement.id, placement.x, Number(e.target.value) || 0)} /></label>
            <button className="btn" onClick={() => actions.tidyCell(placement.layerId, placement.stageId)} title="Apilar todos los componentes de la celda">⊞ Ordenar celda</button>
          </div>}
          {!placement.parentId && <div className="muted">Arrastra el componente para colocarlo; flechas del teclado lo mueven 8 px (Shift = 1 px).</div>}
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
      let bad = false;
      if (txt.trim()) { try { JSON.parse(txt); } catch { bad = true; } }
      return (
        <label>{def.label}{bad && <span className="warn"> · JSON no válido</span>}
          <textarea className={'code' + (bad ? ' invalid' : '')} rows={6} spellCheck={false} value={txt} onFocus={onFocus} onChange={e => onChange(e.target.value)} placeholder='{ "campo": "valor" }' />
          <span className="fld-hint"><button className="link" type="button" onClick={() => { if (!bad && txt.trim()) onChange(JSON.stringify(JSON.parse(txt), null, 2)); }}>Formatear</button></span>
        </label>
      );
    }
    case 'number': return <label>{def.label}<input type="number" value={String(v)} onFocus={onFocus} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} /></label>;
    default: return <label>{def.label}<input type={def.kind === 'url' ? 'url' : def.kind === 'date' ? 'date' : 'text'} value={String(v)} onFocus={onFocus} onChange={e => onChange(e.target.value)} /></label>;
  }
}

// ---------------------------------------------------------------- Relación
function RelationPanel({ r, d }: { r: Relation; d: Diagram }) {
  const data = useStore(s => s.data);
  const { snapshot, select } = useStore();
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
