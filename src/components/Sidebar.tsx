import { useStore, useHover } from '../store';
import { actions } from '../actions';
import { curDiagram, findType } from '../lib/model';
import { setDragData, startDrag } from './dnd';

export function Sidebar() {
  const data = useStore(s => s.data);
  const ui = useStore(s => s.ui);
  const setUI = useStore(s => s.setUI);
  const sel = useStore(s => s.sel);
  const select = useStore(s => s.select);
  const hoverCid = useHover(h => h.cid);
  const setHover = useHover(h => h.set);
  const d = curDiagram(data);
  const libs = ui.libFilter === 'all' ? data.libraries : data.libraries.filter(l => l.id === ui.libFilter);
  const q = ui.search.trim().toLowerCase();
  const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const qn = norm(q);
  /** Coincide por nombre, tipo, descripción o cualquier valor de campo (sin tildes). */
  const matchComp = (c: (typeof data.libraries)[number]['components'][number]) => {
    if (!qn) return true;
    const t = findType(data, c.typeId);
    if (norm(c.name).includes(qn) || norm(t?.name).includes(qn) || norm(c.description).includes(qn)) return true;
    return Object.values(c.fields).some(v => norm(typeof v === 'object' ? JSON.stringify(v) : v).includes(qn));
  };
  const total = ui.tab === 'comps' ? libs.reduce((n, l) => n + l.components.filter(matchComp).length, 0) : libs.reduce((n, l) => n + l.types.filter(t => !qn || norm(t.name).includes(qn)).length, 0);

  return (
    <aside id="sidebar">
      <div className="side-head">
        <select value={ui.libFilter} onChange={e => setUI({ libFilter: e.target.value })} title="Librería">
          <option value="all">Todas las librerías</option>
          {data.libraries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button className="btn icon" onClick={actions.newLibrary} title="Nueva librería">+</button>
        <button className="btn icon" onClick={() => actions.renameLibrary(ui.libFilter)} disabled={ui.libFilter === 'all'} title="Renombrar librería">✎</button>
        <button className="btn icon" onClick={() => actions.deleteLibrary(ui.libFilter)} disabled={ui.libFilter === 'all'} title="Eliminar librería">🗑</button>
      </div>
      <div className="tabs">
        <button className={'tab' + (ui.tab === 'comps' ? ' on' : '')} onClick={() => setUI({ tab: 'comps' })}>Componentes</button>
        <button className={'tab' + (ui.tab === 'types' ? ' on' : '')} onClick={() => setUI({ tab: 'types' })}>Tipos</button>
      </div>
      <div className="search-wrap">
        <span className="search-icon">🔍</span>
        <input className="search" placeholder={ui.tab === 'comps' ? 'Buscar componente, tipo, campo…' : 'Buscar tipo…'} value={ui.search}
          onChange={e => setUI({ search: e.target.value })} onKeyDown={e => { if (e.key === 'Escape') setUI({ search: '' }); }} />
        {ui.search && <button className="search-clear" onClick={() => setUI({ search: '' })} title="Limpiar">×</button>}
      </div>
      {q && <div className="search-count">{total} resultado{total === 1 ? '' : 's'}</div>}

      <div className="list">
        {libs.length === 0 && <div className="empty-sm">No hay librerías. Crea una con “+”.</div>}
        {ui.tab === 'comps' && libs.map(l => {
          const comps = l.components.filter(matchComp).sort((a, b) => a.name.localeCompare(b.name));
          return (
            <div key={l.id}>
              {libs.length > 1 && <div className="group">{l.name} <small>{comps.length}</small></div>}
              {comps.length === 0 && <div className="empty-sm">Sin componentes</div>}
              {comps.map(c => {
                const t = findType(data, c.typeId);
                const uses = d ? d.placements.filter(p => p.componentId === c.id).length : 0;
                const isSel = sel?.kind === 'component' && sel.id === c.id;
                return (
                  <div key={c.id}
                    className={'item comp-item' + (isSel ? ' selected' : '') + (hoverCid === c.id ? ' glow' : '')}
                    draggable
                    style={{ ['--c' as string]: t?.color ?? '#94a3b8' }}
                    onDragStart={e => startDrag(e, { t: 'comp', id: c.id }, 'copy')}
                    onDragEnd={() => setDragData(null)}
                    onClick={() => select({ kind: 'component', id: c.id })}
                    onMouseEnter={() => setHover(c.id)}
                    onMouseLeave={() => setHover(null)}
                    title="Arrastra a una celda del tablero"
                  >
                    <span className="icon">{t?.icon ?? '▫️'}</span>
                    <span className="txt"><b>{c.name}</b><small>{t?.name ?? 'Sin tipo'}</small></span>
                    {uses > 0 && <span className="uses" title="Instancias en este diagrama">{uses}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
        {ui.tab === 'types' && libs.map(l => {
          const types = l.types.filter(t => !qn || norm(t.name).includes(qn));
          return (
            <div key={l.id}>
              {libs.length > 1 && <div className="group">{l.name} <small>{types.length}</small></div>}
              {types.length === 0 && <div className="empty-sm">Sin tipos</div>}
              {types.map(t => (
                <div key={t.id}
                  className={'item type-item' + (sel?.kind === 'type' && sel.id === t.id ? ' selected' : '')}
                  style={{ ['--c' as string]: t.color }}
                  onClick={() => select({ kind: 'type', id: t.id })}
                >
                  <span className="icon">{t.icon}</span>
                  <span className="txt"><b>{t.name}</b><small>{t.fields.length} campo(s)</small></span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="side-foot">
        {ui.tab === 'comps'
          ? <><button className="btn primary" onClick={actions.addComponent}>+ Componente</button><small>Arrastra al tablero. Suelta aquí una instancia para quitarla. Ctrl+arrastrar en el tablero = clonar.</small></>
          : <><div className="row"><button className="btn primary" onClick={actions.addType}>+ Tipo</button><button className="btn" onClick={actions.addApiType} title="Tipo con el contrato completo de una API">+ Tipo API</button></div><small>Un tipo define color, icono y campos propios. “Tipo API” trae método, path, URLs por entorno, request/response…</small></>}
      </div>
    </aside>
  );
}
