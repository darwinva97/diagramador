import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Board } from './components/Board';
import { Inspector } from './components/Inspector';
import { PANEL_MAX, PANEL_MIN, useStore } from './store';
import { actions } from './actions';
import { currentView, initSync, toggleFullscreen } from './sync';
import { initCloud } from './cloud';
import { Account } from './components/Account';

/** Tirador vertical entre paneles: arrastra para cambiar el ancho del panel indicado. */
function Splitter({ panel }: { panel: 'sidebar' | 'inspector' }) {
  const width = useStore(s => panel === 'sidebar' ? s.ui.sidebarW : s.ui.inspectorW);
  const setUI = useStore(s => s.setUI);
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = width;
    document.body.classList.add('resizing-panel');
    const move = (ev: PointerEvent) => {
      const delta = panel === 'sidebar' ? ev.clientX - x0 : x0 - ev.clientX; // el inspector crece hacia la izquierda
      const w = Math.min(PANEL_MAX, Math.max(PANEL_MIN[panel], Math.round(w0 + delta)));
      setUI(panel === 'sidebar' ? { sidebarW: w } : { inspectorW: w });
    };
    const up = () => { window.removeEventListener('pointermove', move); document.body.classList.remove('resizing-panel'); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };
  const reset = () => setUI(panel === 'sidebar' ? { sidebarW: 280 } : { inspectorW: 320 });
  return <div className="splitter" onPointerDown={onPointerDown} onDoubleClick={reset} title="Arrastra para cambiar el ancho · doble clic = ancho por defecto" />;
}

const VIEW = currentView();

export default function App() {
  const ui = useStore(s => s.ui);
  const setUI = useStore(s => s.setUI);

  // sincronización entre ventanas + tema + título
  useEffect(() => { initSync(); void initCloud(); }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (ui.theme === 'system') delete root.dataset.theme; else root.dataset.theme = ui.theme;
  }, [ui.theme]);
  useEffect(() => {
    document.body.classList.toggle('zen', ui.zen && !VIEW);
    document.title = VIEW ? `Diagramador · ${{ sidebar: 'Librería', inspector: 'Inspector', board: 'Tablero' }[VIEW]}` : 'Diagramador';
  }, [ui.zen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const inField = tgt.matches('input, textarea, select');
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') {
        if (inField) { tgt.blur(); return; }
        if (useStore.getState().ui.page) { useStore.getState().setUI({ page: null }); return; }
        if (useStore.getState().ui.zen) { useStore.getState().setUI({ zen: false }); return; }
        useStore.getState().select(null); return;
      }
      if (inField) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); actions.undo(); return; }
      // Ctrl+B: librería · Ctrl+J: inspector · Ctrl+Shift+F: zen · F11: pantalla completa (del navegador)
      if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); const u = useStore.getState().ui; useStore.getState().setUI({ sidebarOpen: !u.sidebarOpen }); return; }
      if (mod && e.key.toLowerCase() === 'j') { e.preventDefault(); const u = useStore.getState().ui; useStore.getState().setUI({ inspectorOpen: !u.inspectorOpen }); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); const u = useStore.getState().ui; useStore.getState().setUI({ zen: !u.zen }); return; }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key]) {
        const sel = useStore.getState().sel; if (sel?.kind !== 'placement') return;
        e.preventDefault();
        if (!e.repeat) useStore.getState().snapshot();
        const step = e.shiftKey ? 1 : 8;
        actions.nudge(sel.id, arrows[e.key][0] * step, arrows[e.key][1] * step);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = useStore.getState().sel; if (!sel) return;
        if (sel.kind === 'placement') actions.removePlacement(sel.id);
        else if (sel.kind === 'relation') actions.deleteRelation(sel.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- ventana separada: sólo una parte
  if (VIEW === 'sidebar') return <div className="popout"><Sidebar /></div>;
  if (VIEW === 'inspector') return <div className="popout"><Inspector /></div>;
  if (VIEW === 'board') return <div className="popout"><Board /></div>;

  if (ui.page === 'cuenta') return <><TopBar /><Account /></>;

  return (
    <>
      <TopBar />
      <main style={{ ['--sidebar-w' as string]: `${ui.sidebarW}px`, ['--inspector-w' as string]: `${ui.inspectorW}px` }}>
        {ui.sidebarOpen
          ? <><Sidebar /><Splitter panel="sidebar" /></>
          : <button className="edge-tab left" onClick={() => setUI({ sidebarOpen: true })} title="Mostrar librería (Ctrl+B)">▸ Librería</button>}
        <Board />
        {ui.inspectorOpen
          ? <><Splitter panel="inspector" /><Inspector /></>
          : <button className="edge-tab right" onClick={() => setUI({ inspectorOpen: true })} title="Mostrar inspector (Ctrl+J)">◂ Inspector</button>}
      </main>
      {ui.zen && (
        <div className="zen-bar">
          <button className="btn" onClick={toggleFullscreen} title="Pantalla completa">⤢</button>
          <button className="btn" onClick={() => setUI({ zen: false })} title="Salir del modo zen (Esc)">✕ Salir de zen</button>
        </div>
      )}
    </>
  );
}
