/**
 * Sincronización entre ventanas del mismo navegador (ventanas separadas de librería,
 * inspector y tablero):
 *  - datos y preferencias: cada ventana persiste en localStorage; las demás escuchan el
 *    evento `storage` y se rehidratan.
 *  - selección y hover (no persistidos): se difunden por BroadcastChannel.
 */
import { useHover, useStore } from './store';

const LS_KEY = 'diagramador.v2';
let remote = false; // evita re-difundir lo que acabamos de recibir

export function initSync() {
  window.addEventListener('storage', e => {
    if (e.key === LS_KEY && e.newValue) void useStore.persist.rehydrate();
  });
  if (!('BroadcastChannel' in window)) return;
  const bc = new BroadcastChannel('diagramador');
  bc.onmessage = (ev: MessageEvent) => {
    const m = ev.data as { type: 'sel'; sel: unknown } | { type: 'hover'; cid: string | null; pid: string | null };
    remote = true;
    try {
      if (m.type === 'sel') useStore.setState({ sel: m.sel as ReturnType<typeof useStore.getState>['sel'] });
      else if (m.type === 'hover') useHover.setState({ cid: m.cid, pid: m.pid });
    } finally { remote = false; }
  };
  useStore.subscribe((s, prev) => { if (!remote && s.sel !== prev.sel) bc.postMessage({ type: 'sel', sel: s.sel }); });
  useHover.subscribe((h, prev) => { if (!remote && (h.cid !== prev.cid || h.pid !== prev.pid)) bc.postMessage({ type: 'hover', cid: h.cid, pid: h.pid }); });
}

/** Vista de esta ventana: completa (null) o una parte separada. */
export type View = 'sidebar' | 'inspector' | 'board';
export function currentView(): View | null {
  const v = new URLSearchParams(location.search).get('view');
  return v === 'sidebar' || v === 'inspector' || v === 'board' ? v : null;
}

const SIZES: Record<View, [number, number]> = { sidebar: [360, 820], inspector: [420, 900], board: [1400, 900] };
const popups: Partial<Record<View, Window | null>> = {};

/** Abre una parte en una ventana aparte y la oculta en esta; al cerrarla, vuelve a mostrarse. */
export function openPopout(view: View) {
  const existing = popups[view];
  if (existing && !existing.closed) { existing.focus(); return; }
  const [w, h] = SIZES[view];
  const url = `${location.pathname}?view=${view}`;
  const win = window.open(url, `diagramador-${view}`, `popup=yes,width=${w},height=${h}`);
  if (!win) { alert('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio.'); return; }
  popups[view] = win;
  const setUI = useStore.getState().setUI;
  if (view === 'sidebar') setUI({ sidebarOpen: false });
  if (view === 'inspector') setUI({ inspectorOpen: false });
  const t = window.setInterval(() => {
    if (win.closed) {
      window.clearInterval(t); popups[view] = null;
      if (view === 'sidebar') setUI({ sidebarOpen: true });
      if (view === 'inspector') setUI({ inspectorOpen: true });
    }
  }, 800);
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}
