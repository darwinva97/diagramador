import { useStore } from '../store';
import { actions } from '../actions';
import aliados from '../../ejemplos/aliados.json';

const EXAMPLES: { key: string; name: string; data: unknown }[] = [
  { key: 'aliados', name: 'Arquitectura Aliados (APIs y microservicios por capas)', data: aliados },
];

export function TopBar() {
  const diagrams = useStore(s => s.data.diagrams);
  const current = useStore(s => s.data.currentDiagramId);
  const canUndo = useStore(s => s.past.length > 0);
  return (
    <header id="topbar">
      <div className="brand">◫ Diagramador</div>
      <select value={current ?? ''} onChange={e => actions.setCurrent(e.target.value)} title="Diagrama actual">
        {diagrams.length === 0 && <option value="">(sin diagramas)</option>}
        {diagrams.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <button className="btn" onClick={actions.newDiagram}>+ Nuevo</button>
      <button className="btn" onClick={actions.duplicateDiagram} disabled={!current}>Duplicar</button>
      <button className="btn danger" onClick={actions.deleteDiagram} disabled={!current}>Eliminar</button>
      <select value="" onChange={e => { const ex = EXAMPLES.find(x => x.key === e.target.value); if (ex) actions.loadExample(ex.data); }} title="Cargar un ejemplo incluido">
        <option value="">Ejemplos…</option>
        {EXAMPLES.map(x => <option key={x.key} value={x.key}>{x.name}</option>)}
      </select>
      <span className="spacer" />
      <button className="btn" onClick={actions.undo} disabled={!canUndo} title="Ctrl+Z">↶ Deshacer</button>
      <span className="sep" />
      <button className="btn" onClick={actions.importJson}>⤓ Importar JSON</button>
      <button className="btn" onClick={actions.exportCurrent} disabled={!current}>⤒ Exportar diagrama</button>
      <button className="btn" onClick={actions.exportAll}>⤒ Exportar todo</button>
      <button className="btn" onClick={() => window.print()} disabled={!current}>🖨 Imprimir</button>
    </header>
  );
}
