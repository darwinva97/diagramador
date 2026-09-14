import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Board } from './components/Board';
import { Inspector } from './components/Inspector';
import { PANEL_MAX, PANEL_MIN, useStore } from './store';
import { actions } from './actions';

/** Tirador vertical entre paneles: arrastra para cambiar el ancho del panel indicado. */
function Splitter({ panel }: { panel: 'sidebar' | 'inspector' }) {
  const width = useStore(s => panel === 'sidebar' ? s.ui.sidebarW : s.ui.inspectorW);
  const setUI = useStore(s => s.setUI);
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = width;
    document.body.classList.add('resizing-x');
    const move = (ev: PointerEvent) => {
      const delta = panel === 'sidebar' ? ev.clientX - x0 : x0 - ev.clientX; // el inspector crece hacia la izquierda
      const w = Math.min(PANEL_MAX, Math.max(PANEL_MIN[panel], Math.round(w0 + delta)));
      setUI(panel === 'sidebar' ? { sidebarW: w } : { inspectorW: w });
    };
    const up = () => { window.removeEventListener('pointermove', move); document.body.classList.remove('resizing-x'); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };
  const reset = () => setUI(panel === 'sidebar' ? { sidebarW: 280 } : { inspectorW: 320 });
  return <div className="splitter" onPointerDown={onPointerDown} onDoubleClick={reset} title="Arrastra para cambiar el ancho · doble clic = ancho por defecto" />;
}

export default function App() {
  const sidebarW = useStore(s => s.ui.sidebarW);
  const inspectorW = useStore(s => s.ui.inspectorW);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const inField = tgt.matches('input, textarea, select');
      if (e.key === 'Escape') { if (inField) tgt.blur(); else useStore.getState().select(null); return; }
      if (inField) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); actions.undo(); return; }
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
  return (
    <>
      <TopBar />
      <main style={{ ['--sidebar-w' as string]: `${sidebarW}px`, ['--inspector-w' as string]: `${inspectorW}px` }}>
        <Sidebar />
        <Splitter panel="sidebar" />
        <Board />
        <Splitter panel="inspector" />
        <Inspector />
      </main>
    </>
  );
}
