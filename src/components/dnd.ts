/** Datos del arrastre HTML5 en curso (módulo compartido, no necesita estado React). */
export type DragData =
  | { t: 'comp'; id: string }   // componente desde la librería
  | { t: 'stage'; id: string }
  | { t: 'layer'; id: string };

export const dragData: { current: DragData | null } = { current: null };
export const setDragData = (d: DragData | null) => { dragData.current = d; };
