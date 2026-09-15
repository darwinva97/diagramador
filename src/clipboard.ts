/**
 * Portapapeles interno (Ctrl+C / Ctrl+X / Ctrl+V): copia una instancia del tablero (con sus
 * subcomponentes) o un componente de la librería, y lo pega en la celda activa.
 */
import { useStore } from './store';
import { actions } from './actions';
import { curDiagram, findComp, rootOf } from './lib/model';

type Clip = { kind: 'placement'; pid: string; componentId: string } | { kind: 'component'; componentId: string };
let clip: Clip | null = null;

export const hasClip = () => clip !== null;

/** Copia lo seleccionado. Devuelve una descripción o null si no había nada copiable. */
export function copySelection(): string | null {
  const s = useStore.getState(); const d = curDiagram(s.data); const sel = s.sel;
  if (!sel) return null;
  if (sel.kind === 'placement' && d) {
    const p = d.placements.find(x => x.id === sel.id); if (!p) return null;
    clip = { kind: 'placement', pid: p.id, componentId: p.componentId };
    return findComp(s.data, p.componentId)?.name ?? null;
  }
  if (sel.kind === 'component') { clip = { kind: 'component', componentId: sel.id }; return findComp(s.data, sel.id)?.name ?? null; }
  return null;
}

export function cutSelection(): string | null {
  const name = copySelection(); if (!name) return null;
  if (clip?.kind === 'placement') { const pid = clip.pid; clip = { kind: 'component', componentId: clip.componentId }; actions.removePlacement(pid); }
  return name;
}

/** Celda destino: la celda activa; si no hay, la de la instancia seleccionada. */
export function targetCell(): { layerId: string; stageId: string } | null {
  const s = useStore.getState(); const d = curDiagram(s.data); if (!d) return null;
  const c = s.cell;
  if (c && d.layers.some(l => l.id === c.layerId) && d.stages.some(x => x.id === c.stageId)) return c;
  if (s.sel?.kind === 'placement') { const r = rootOf(d, s.sel.id); if (r) return { layerId: r.layerId, stageId: r.stageId }; }
  return null;
}

/** Pega en la celda destino. Devuelve false si no hay nada que pegar o dónde. */
export function paste(): boolean {
  const c = clip; const cell = targetCell(); if (!c || !cell) return false;
  const d = curDiagram(useStore.getState().data); if (!d) return false;
  // si la instancia copiada sigue existiendo se clona con sus subcomponentes; si no, se coloca el componente
  if (c.kind === 'placement' && d.placements.some(p => p.id === c.pid)) actions.clonePlacement(c.pid, cell.layerId, cell.stageId);
  else actions.place(c.componentId, cell.layerId, cell.stageId);
  return true;
}
