import { useStore, useHover } from '../store';
import { actions } from '../actions';
import { curDiagram, findType } from '../lib/model';
import { setDragData, startDrag } from './dnd';
import { openMenu, type MenuItem } from './ContextMenu';
import { copySelection, paste, targetCell } from '../clipboard';

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
  const collapsed = new Set(ui.collapsedLibs);
  /** Menú contextual de un componente de la librería. */
  const compMenu = (e: React.MouseEvent, cid: string, name: string) => {
    select({ kind: 'component', id: cid });
    const cell = targetCell();
    const aqui = actions.instancesHere(cid), diagramas = actions.usedInDiagrams(cid);
    const items: MenuItem[] = [
      { label: 'Copiar', hint: 'Ctrl+C', onClick: () => { select({ kind: 'component', id: cid }); copySelection(); } },
      { label: cell ? 'Colocar en la celda activa' : 'Colocar (elige antes una celda)', hint: 'Ctrl+V', disabled: !cell,
        onClick: () => { select({ kind: 'component', id: cid }); copySelection(); paste(); } },
      { label: 'Colocar como copia independiente', disabled: !cell,
        onClick: () => { select({ kind: 'component', id: cid }); copySelection(); paste(true); } },
      { sep: true },
      { label: 'Duplicar componente', onClick: () => actions.duplicateComponent(cid) },
      { label: `Separar sus ${aqui} instancias de este diagrama`, disabled: aqui < 2,
        title: aqui < 2 ? 'Sólo tiene una instancia en este diagrama: no hay nada que separar.' : 'Cada instancia pasa a tener su propia copia del componente y dejan de ser clones entre sí.',
        onClick: () => actions.splitInstances(cid) },
      { label: 'Desvincular en este diagrama', disabled: diagramas < 2,
        title: diagramas < 2 ? 'Sólo se usa en este diagrama, así que no hay de qué desvincularlo. Usa “Separar sus instancias”.' : 'Las instancias de este diagrama pasan a una copia; los demás diagramas conservan el original.',
        onClick: () => actions.detachComponent(cid, undefined) },
      { label: 'Editar en el inspector', hint: 'F2', onClick: () => setUI({ inspectorOpen: true }) },
      { sep: true },
      { label: 'Eliminar de la librería', danger: true, onClick: () => actions.deleteComponent(cid) },
    ];
    openMenu(e, items, name);
  };
  /** Menú contextual de un tipo. */
  const typeMenu = (e: React.MouseEvent, tid: string, name: string) => {
    select({ kind: 'type', id: tid });
    openMenu(e, [
      { label: 'Editar en el inspector', onClick: () => setUI({ inspectorOpen: true }) },
      { label: '+ Campos de contrato API', onClick: () => actions.addContractFields(tid) },
      { label: '+ Añadir campo', onClick: () => actions.addField(tid) },
      { sep: true },
      { label: 'Eliminar tipo', danger: true, onClick: () => actions.deleteType(tid) },
    ], name);
  };
  /** Menú contextual del título de una librería. */
  const libMenu = (e: React.MouseEvent, lid: string, name: string) => {
    const allIds = data.libraries.map(l => l.id);
    openMenu(e, [
      { label: collapsed.has(lid) ? 'Desplegar' : 'Plegar', onClick: () => toggleLib(lid) },
      { label: 'Plegar todas', onClick: () => setUI({ collapsedLibs: allIds }) },
      { label: 'Desplegar todas', onClick: () => setUI({ collapsedLibs: [] }) },
      { sep: true },
      { label: 'Ver sólo esta librería', onClick: () => setUI({ libFilter: lid }) },
      { label: 'Renombrar librería', onClick: () => actions.renameLibrary(lid) },
      { label: 'Nueva librería', onClick: actions.newLibrary },
      { sep: true },
      { label: 'Eliminar librería', danger: true, onClick: () => actions.deleteLibrary(lid) },
    ], name);
  };
  const toggleLib = (id: string) => setUI({ collapsedLibs: collapsed.has(id) ? ui.collapsedLibs.filter(x => x !== id) : [...ui.collapsedLibs, id] });
  const GroupHead = ({ id, name, n }: { id: string; name: string; n: number }) => (
    <button className={'group' + (collapsed.has(id) ? ' closed' : '')} onClick={() => toggleLib(id)}
      onContextMenu={e => libMenu(e, id, name)} title={collapsed.has(id) ? 'Desplegar' : 'Plegar'}>
      <span className="caret">{collapsed.has(id) ? '▸' : '▾'}</span> {name} <small>{n}</small>
    </button>
  );
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
        <input id="lib-search" className="search" placeholder={ui.tab === 'comps' ? 'Buscar componente, tipo, campo…' : 'Buscar tipo…'} value={ui.search}
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
              <GroupHead id={l.id} name={l.name} n={comps.length} />
              {!collapsed.has(l.id) && comps.length === 0 && <div className="empty-sm">Sin componentes</div>}
              {!collapsed.has(l.id) && comps.map(c => {
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
                    onContextMenu={e => compMenu(e, c.id, c.name)}
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
              <GroupHead id={l.id} name={l.name} n={types.length} />
              {!collapsed.has(l.id) && types.length === 0 && <div className="empty-sm">Sin tipos</div>}
              {!collapsed.has(l.id) && types.map(t => (
                <div key={t.id}
                  className={'item type-item' + (sel?.kind === 'type' && sel.id === t.id ? ' selected' : '')}
                  style={{ ['--c' as string]: t.color }}
                  onClick={() => select({ kind: 'type', id: t.id })}
                  onContextMenu={e => typeMenu(e, t.id, t.name)}
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
