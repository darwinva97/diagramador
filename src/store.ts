import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { AppData, LinkDefaults, Selection } from './types';
import { curDiagram, findComp, findType, normalize } from './lib/model';
import { seed } from './seed';

export interface UIState {
  libFilter: string; // 'all' | libraryId
  tab: 'comps' | 'types';
  search: string;
  link: LinkDefaults;
  /** Anchos de los paneles laterales (px). */
  sidebarW: number;
  inspectorW: number;
  /** Paneles visibles */
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  /** Modo zen: sólo el tablero, sin barras ni paneles. */
  zen: boolean;
  /** Librerías plegadas en el panel lateral. */
  collapsedLibs: string[];
}

/** Celda activa del tablero (destino de pegar / nuevo componente). */
export interface CellRef { layerId: string; stageId: string }
export const PANEL_MIN = { sidebar: 200, inspector: 260 };
export const PANEL_MAX = 720;

interface Store {
  data: AppData;
  sel: Selection | null;
  cell: CellRef | null;
  ui: UIState;
  past: string[];
  future: string[];
  /** Mutación con snapshot para deshacer (snap=false para edición de texto continua). */
  mutate(fn: (d: AppData) => void, snap?: boolean): void;
  snapshot(): void;
  undo(): void;
  redo(): void;
  select(sel: Selection | null): void;
  setCell(cell: CellRef | null): void;
  setUI(patch: Partial<UIState>): void;
}

const MAX_UNDO = 80;

export const useStore = create<Store>()(
  persist(
    immer((set, get) => ({
      data: seed(),
      sel: null,
      cell: null,
      past: [],
      future: [],
      ui: { libFilter: 'all', tab: 'comps', search: '', link: { style: 'solid', dir: 'fwd', color: '#475569', width: 2 }, sidebarW: 280, inspectorW: 320, sidebarOpen: true, inspectorOpen: true, theme: 'system', zen: false, collapsedLibs: [] },
      mutate(fn, snap = true) {
        const snapStr = snap ? JSON.stringify(get().data) : null;
        set(s => {
          if (snapStr) { s.past.push(snapStr); s.future = []; if (s.past.length > MAX_UNDO) s.past.shift(); }
          fn(s.data as AppData);
        });
      },
      snapshot() {
        const snapStr = JSON.stringify(get().data);
        set(s => { s.past.push(snapStr); s.future = []; if (s.past.length > MAX_UNDO) s.past.shift(); });
      },
      undo() {
        const cur = JSON.stringify(get().data);
        set(s => {
          const p = s.past.pop();
          if (p) { s.future.push(cur); s.data = JSON.parse(p); s.sel = null; }
        });
      },
      redo() {
        const cur = JSON.stringify(get().data);
        set(s => {
          const f = s.future.pop();
          if (f) { s.past.push(cur); s.data = JSON.parse(f); s.sel = null; }
        });
      },
      select(sel) { set(s => { s.sel = sel; }); },
      setCell(cell) { set(s => { s.cell = cell; }); },
      setUI(patch) { set(s => { Object.assign(s.ui, patch); }); },
    })),
    {
      name: 'diagramador.v2',
      version: 1,
      partialize: s => ({ data: s.data, ui: { ...s.ui, zen: false } }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Pick<Store, 'data' | 'ui'>>;
        return {
          ...current,
          ui: { ...current.ui, ...(p.ui ?? {}), link: { ...current.ui.link, ...(p.ui?.link ?? {}) } },
          data: p.data ? normalize(p.data) : current.data,
        };
      },
    },
  ),
);

/** Selección validada contra los datos actuales (evita apuntar a algo borrado). */
export function useValidSel(): Selection | null {
  return useStore(s => {
    const sel = s.sel; if (!sel) return null;
    const d = curDiagram(s.data);
    switch (sel.kind) {
      case 'placement': return d?.placements.some(p => p.id === sel.id) ? sel : null;
      case 'relation': return d?.relations.some(r => r.id === sel.id) ? sel : null;
      case 'component': return findComp(s.data, sel.id) ? sel : null;
      case 'type': return findType(s.data, sel.id) ? sel : null;
    }
  });
}

/** Ayuda de atajos (no persistido). */
export const useHelp = create<{ open: boolean }>(() => ({ open: false }));

/** Estado transitorio de hover (no persistido). */
interface HoverState { cid: string | null; pid: string | null; set(cid: string | null, pid?: string | null): void }
export const useHover = create<HoverState>(set => ({
  cid: null, pid: null,
  set(cid, pid = null) { set({ cid, pid }); },
}));
