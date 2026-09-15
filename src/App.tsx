import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useStore } from './store';
import { actions } from './actions';
import { initSync } from './sync';
import { initCloud } from './cloud';
import { AppRoutes } from './routes';

export default function App() {
  const theme = useStore(s => s.ui.theme);
  const navigate = useNavigate();
  const location = useLocation();
  const inAccount = location.pathname.startsWith('/cuenta');

  // sincronización entre ventanas + nube + tema
  useEffect(() => { initSync(); void initCloud(); }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme; else root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const inField = tgt.matches('input, textarea, select');
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') {
        if (inField) { tgt.blur(); return; }
        if (inAccount) { navigate('/'); return; }
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
  }, [inAccount, navigate]);

  return <AppRoutes />;
}
