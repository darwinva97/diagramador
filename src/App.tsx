import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useHelp, useStore } from './store';
import { copySelection, cutSelection, paste, targetCell } from './clipboard';
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
      const inField = tgt.matches('input, textarea, select') || tgt.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const st = useStore.getState();
      if (e.key === 'Escape') {
        if (useHelp.getState().open) { useHelp.setState({ open: false }); return; }
        if (inField) { tgt.blur(); return; }
        if (inAccount) { navigate('/'); return; }
        if (st.ui.zen) { st.setUI({ zen: false }); return; }
        st.select(null); st.setCell(null); return;
      }
      // atajos que valen también dentro de un campo
      if (mod && k === 'k') { e.preventDefault(); if (!st.ui.sidebarOpen) st.setUI({ sidebarOpen: true }); setTimeout(() => { const i = document.querySelector<HTMLInputElement>('#lib-search'); i?.focus(); i?.select(); }, 0); return; }
      if (mod && k === 'b') { e.preventDefault(); st.setUI({ sidebarOpen: !st.ui.sidebarOpen }); return; }
      if (mod && k === 'j') { e.preventDefault(); st.setUI({ inspectorOpen: !st.ui.inspectorOpen }); return; }
      if (mod && e.key === '\\') { e.preventDefault(); const both = st.ui.sidebarOpen || st.ui.inspectorOpen; st.setUI({ sidebarOpen: !both, inspectorOpen: !both }); return; }
      if (mod && e.shiftKey && k === 'f') { e.preventDefault(); st.setUI({ zen: !st.ui.zen }); return; }
      if (inField) return;
      if (e.key === '?' ) { e.preventDefault(); useHelp.setState({ open: !useHelp.getState().open }); return; }
      if (inAccount) return;
      // ---- edición
      if (mod && k === 'z' && e.shiftKey) { e.preventDefault(); actions.redo(); return; }
      if (mod && k === 'z') { e.preventDefault(); actions.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); actions.redo(); return; }
      if (mod && k === 'c') { if (copySelection()) e.preventDefault(); return; }
      if (mod && k === 'x') { if (cutSelection()) e.preventDefault(); return; }
      if (mod && k === 'v') { if (paste()) e.preventDefault(); return; }
      if (mod && k === 'd') { e.preventDefault(); const sel = st.sel; const cell = targetCell(); if (sel?.kind === 'placement' && cell) actions.clonePlacement(sel.id, cell.layerId, cell.stageId); return; }
      if (mod && e.key === 'Enter') { e.preventDefault(); const cell = targetCell(); if (cell) actions.quickAdd(cell.layerId, cell.stageId); else actions.addComponent(); return; }
      if (e.key === 'F2') { e.preventDefault(); if (!st.sel) return; if (!st.ui.inspectorOpen) st.setUI({ inspectorOpen: true }); setTimeout(() => { const i = document.querySelector<HTMLInputElement>('#inspector input'); i?.focus(); i?.select(); }, 0); return; }
      if (mod && k === 'o') { e.preventDefault(); void actions.importJson(); return; }
      if (mod && k === 'e') { e.preventDefault(); if (e.shiftKey) actions.exportAll(); else actions.exportCurrent(); return; }
      if (e.altKey && !mod && k === 'n') { e.preventDefault(); actions.newDiagram(); return; }
      if (e.altKey && !mod && (e.key === '1' || e.key === '2')) { e.preventDefault(); st.setUI({ tab: e.key === '1' ? 'comps' : 'types', sidebarOpen: true }); return; }
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
