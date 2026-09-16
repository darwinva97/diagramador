import { useHelp, useStore } from '../store';
import { actions } from '../actions';
import { openPopout, toggleFullscreen } from '../sync';
import { pedidoExample } from '../seed';
import { useAuth } from '../cloud';
import { useLocation, useNavigate } from 'react-router';
import { accountPath } from '../routes';
import { StorageChip } from './Storage';

const EXAMPLES: { key: string; name: string; data: unknown }[] = [
  { key: 'pedido', name: 'Ejemplo básico: flujo de pedido', data: pedidoExample() },
];

export function TopBar() {
  const diagrams = useStore(s => s.data.diagrams);
  const current = useStore(s => s.data.currentDiagramId);
  const canUndo = useStore(s => s.past.length > 0);
  const canRedo = useStore(s => s.future.length > 0);
  const ui = useStore(s => s.ui);
  const setUI = useStore(s => s.setUI);
  const auth = useAuth();
  const navigate = useNavigate();
  const inAccount = useLocation().pathname.startsWith('/cuenta');
  const themeNext = { system: 'light', light: 'dark', dark: 'system' } as const;
  const themeIcon = { system: '◐', light: '☀', dark: '☾' }[ui.theme];
  const themeLabel = { system: 'Tema: sistema', light: 'Tema: claro', dark: 'Tema: oscuro' }[ui.theme];
  return (
    <header id="topbar">
      <div className="brand">◫ Drawer</div>
      <select value={current ?? ''} onChange={e => actions.setCurrent(e.target.value)} title="Diagrama actual">
        {diagrams.length === 0 && <option value="">(sin diagramas)</option>}
        {diagrams.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <button className="btn" onClick={actions.newDiagram}>+ Nuevo</button>
      <button className="btn" onClick={actions.duplicateDiagram} disabled={!current}>Duplicar</button>
      <button className="btn danger" onClick={actions.deleteDiagram} disabled={!current}>Eliminar</button>
      <select className="examples" value="" onChange={e => { const ex = EXAMPLES.find(x => x.key === e.target.value); if (ex) actions.loadExample(ex.data); }} title="Cargar un ejemplo incluido">
        <option value="">Ejemplos…</option>
        {EXAMPLES.map(x => <option key={x.key} value={x.key}>{x.name}</option>)}
      </select>
      <span className="spacer" />
      <button className="btn" onClick={actions.undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)">↶</button>
      <button className="btn" onClick={actions.redo} disabled={!canRedo} title="Rehacer (Ctrl+Shift+Z)">↷</button>
      <span className="sep" />
      <button className="btn" onClick={actions.importJson} title="Importar JSON">⤓ Importar</button>
      <button className="btn" onClick={actions.exportCurrent} disabled={!current} title="Exportar el diagrama actual a JSON">⤒ Diagrama</button>
      <button className="btn" onClick={actions.exportAll} title="Exportar todo (librerías y diagramas) a JSON">⤒ Todo</button>
      <button className="btn" onClick={() => window.print()} disabled={!current} title="Imprimir el tablero">🖨</button>
      <span className="sep" />
      {/* vista */}
      <span className="btn-group" title="Librería: mostrar/ocultar (Ctrl+J) · abrir en otra ventana">
        <button className={'btn icon toggle' + (ui.sidebarOpen ? ' on' : '')} onClick={() => setUI({ sidebarOpen: !ui.sidebarOpen })} title={(ui.sidebarOpen ? 'Ocultar' : 'Mostrar') + ' librería (Ctrl+J)'}>◧</button>
        <button className="btn icon" onClick={() => openPopout('sidebar')} title="Abrir la librería en otra ventana">⧉</button>
      </span>
      <span className="btn-group" title="Inspector: mostrar/ocultar (Ctrl+B) · abrir en otra ventana">
        <button className={'btn icon toggle' + (ui.inspectorOpen ? ' on' : '')} onClick={() => setUI({ inspectorOpen: !ui.inspectorOpen })} title={(ui.inspectorOpen ? 'Ocultar' : 'Mostrar') + ' inspector (Ctrl+B)'}>◨</button>
        <button className="btn icon" onClick={() => openPopout('inspector')} title="Abrir el inspector en otra ventana">⧉</button>
      </span>
      <button className="btn icon" onClick={() => openPopout('board')} title="Abrir el tablero en otra ventana">▣⧉</button>
      <span className="btn-group" title="Fijar cabeceras al hacer scroll">
        <button className={'btn icon toggle' + (ui.pinLayers ? ' on' : '')} onClick={() => setUI({ pinLayers: !ui.pinLayers })}
          title={(ui.pinLayers ? 'Soltar' : 'Fijar') + ' la columna de capas'}>⇤</button>
        <button className={'btn icon toggle' + (ui.pinStages ? ' on' : '')} onClick={() => setUI({ pinStages: !ui.pinStages })}
          title={(ui.pinStages ? 'Soltar' : 'Fijar') + ' la fila de etapas y grupos'}>⤒</button>
      </span>
      <button className="btn icon" onClick={() => setUI({ zen: true })} title="Modo zen: sólo el tablero (Ctrl+Shift+F, Esc para salir)">◻ Zen</button>
      <button className="btn icon" onClick={toggleFullscreen} title="Pantalla completa">⤢</button>
      <button className="btn icon" onClick={() => useHelp.setState({ open: true })} title="Atajos de teclado (?)">⌨</button>
      <button className="btn icon" onClick={() => setUI({ theme: themeNext[ui.theme] })} title={themeLabel + ' · clic para cambiar'}>{themeIcon}</button>
      <StorageChip />
      <button className={'btn account-btn' + (inAccount ? ' on' : '')} onClick={() => navigate(inAccount ? '/' : accountPath())}
        title={auth.status === 'auth' ? `Cuenta: ${auth.user?.email}` : 'Cuenta, API keys, bibliotecas, diagramas y configuración'}>
        👤 {auth.status === 'auth' ? (auth.user?.email.split('@')[0] ?? 'Cuenta') : 'Cuenta'}{auth.status === 'auth' && auth.pending > 0 ? ' ●' : ''}
      </button>
    </header>
  );
}
