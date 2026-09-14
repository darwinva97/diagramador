import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Board } from './components/Board';
import { Inspector } from './components/Inspector';
import { useStore } from './store';
import { actions } from './actions';

export default function App() {
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
      <main>
        <Sidebar />
        <Board />
        <Inspector />
      </main>
    </>
  );
}
