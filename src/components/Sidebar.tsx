import { useStore, useHover } from '../store';
import { actions } from '../actions';
import { curDiagram, findType } from '../lib/model';
import { setDragData } from './dnd';

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
      <input className="search" placeholder="Buscar…" value={ui.search} onChange={e => setUI({ search: e.target.value })} />

      <div className="list">
        {libs.length === 0 && <div className="empty-sm">No hay librerías. Crea una con “+”.</div>}
        {ui.tab === 'comps' && libs.map(l => {
          const comps = l.components.filter(c => !q || c.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
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
                    onDragStart={e => { setDragData({ t: 'comp', id: c.id }); e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', c.name); }}
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
          const types = l.types.filter(t => !q || t.name.toLowerCase().includes(q));
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
          : <><button className="btn primary" onClick={actions.addType}>+ Tipo</button><small>Un tipo define color, icono y campos propios.</small></>}
      </div>
    </aside>
  );
}
