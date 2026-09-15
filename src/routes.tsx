/**
 * Rutas de la aplicación (react-router, modo declarativo):
 *  /                 → redirige al diagrama actual (o editor vacío si no hay ninguno)
 *  /d/:id            → editor con el diagrama :id
 *  /cuenta/:tab      → cuenta y administración (perfil, keys, diagramas, bibliotecas, tipos, config, agentes)
 *  /ventana/:view    → una parte (sidebar | inspector | board) en ventana separada
 * No importa el SEO: la app es un SPA servido con fallback a index.html.
 */
import { useEffect, useRef } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate, useParams } from 'react-router';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Board } from './components/Board';
import { Inspector } from './components/Inspector';
import { Account } from './components/Account';
import { PANEL_MAX, PANEL_MIN, useStore } from './store';
import { actions } from './actions';
import { toggleFullscreen, type View } from './sync';

export const diagramPath = (id: string | null | undefined) => (id ? `/d/${id}` : '/');
export const accountPath = (tab = 'perfil') => `/cuenta/${tab}`;
export const popoutPath = (view: View) => `/ventana/${view}`;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/ventana/:view" element={<Popout />} />
      <Route element={<Shell />}>
        <Route index element={<Editor />} />
        <Route path="d/:id" element={<Editor />} />
        <Route path="cuenta" element={<Navigate to={accountPath()} replace />} />
        <Route path="cuenta/:tab" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

/** Barra superior + contenido (editor o cuenta). */
function Shell() {
  const zen = useStore(s => s.ui.zen);
  useEffect(() => { document.body.classList.toggle('zen', zen); return () => document.body.classList.remove('zen'); }, [zen]);
  return <><TopBar /><Outlet /></>;
}

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

/**
 * Editor. La URL y `data.currentDiagramId` se mantienen sincronizados en ambos sentidos:
 *  - cambia la URL (enlace, atrás/adelante) → se activa ese diagrama;
 *  - cambia el diagrama actual (nuevo, duplicar, eliminar, importar, selector) → cambia la URL.
 */
function Editor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const current = useStore(s => s.data.currentDiagramId);
  const exists = useStore(s => !!id && s.data.diagrams.some(d => d.id === id));
  const name = useStore(s => s.data.diagrams.find(d => d.id === s.data.currentDiagramId)?.name);
  const ui = useStore(s => s.ui);
  const setUI = useStore(s => s.setUI);
  const lastUrlId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const urlChanged = lastUrlId.current !== id;
    lastUrlId.current = id;
    if (id === (current ?? undefined)) return;
    if (urlChanged && id && exists) { actions.setCurrent(id); return; } // manda la URL
    // manda el estado: entrada nueva en el historial salvo que la URL fuera inválida (/, id inexistente)
    navigate(diagramPath(current), { replace: !exists });
  }, [id, current, exists, navigate]);

  useEffect(() => { document.title = name ? `${name} · Diagramador` : 'Diagramador'; }, [name]);

  return (
    <>
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

const POPOUT_TITLE: Record<View, string> = { sidebar: 'Librería', inspector: 'Inspector', board: 'Tablero' };

/** Una parte de la interfaz en una ventana separada (comparte datos y selección con las demás). */
function Popout() {
  const { view } = useParams<{ view: string }>();
  const v = view === 'sidebar' || view === 'inspector' || view === 'board' ? view : null;
  useEffect(() => { if (v) document.title = `Diagramador · ${POPOUT_TITLE[v]}`; }, [v]);
  if (!v) return <Navigate to="/" replace />;
  return (
    <div className="popout">
      {v === 'sidebar' && <Sidebar />}
      {v === 'inspector' && <Inspector />}
      {v === 'board' && <Board />}
    </div>
  );
}
