/**
 * Datos del arrastre HTML5 en curso. Se guardan en memoria (misma ventana) y también en
 * `dataTransfer` con un MIME propio por tipo, para poder soltar entre ventanas distintas
 * (p. ej. desde la librería abierta en otra ventana hasta el tablero).
 */
export type DragKind = 'comp' | 'stage' | 'layer' | 'api';
export type DragData = { t: DragKind; id: string };

export const MIME = (t: DragKind) => `application/x-diagramador-${t}`;
const KINDS: DragKind[] = ['comp', 'stage', 'layer', 'api'];

export const dragData: { current: DragData | null } = { current: null };
export const setDragData = (d: DragData | null) => { dragData.current = d; };

/** Inicia un arrastre: memoria + dataTransfer. */
export function startDrag(e: React.DragEvent, d: DragData, effect: 'copy' | 'move' = 'move') {
  setDragData(d);
  e.dataTransfer.effectAllowed = effect === 'copy' ? 'copyMove' : 'move';
  e.dataTransfer.setData(MIME(d.t), d.id);
  e.dataTransfer.setData('text/plain', d.id);
}

/** Tipo del arrastre durante dragover (sin acceso al contenido). */
export function dragKind(e: React.DragEvent): DragKind | null {
  if (dragData.current) return dragData.current.t;
  const types = Array.from(e.dataTransfer.types ?? []);
  return KINDS.find(k => types.includes(MIME(k))) ?? null;
}

/** Datos completos en el drop (misma ventana u otra). */
export function readDrag(e: React.DragEvent): DragData | null {
  if (dragData.current) return dragData.current;
  for (const k of KINDS) { const id = e.dataTransfer.getData(MIME(k)); if (id) return { t: k, id }; }
  return null;
}
