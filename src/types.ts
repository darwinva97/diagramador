export type FieldKind = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'url' | 'date';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  options?: string; // para 'select': opciones separadas por coma
}

export interface ComponentType {
  id: string;
  name: string;
  color: string;
  icon: string;
  fields: FieldDef[];
}

export interface Component {
  id: string;
  name: string;
  typeId: string | null;
  description: string;
  fields: Record<string, unknown>;
}

export interface Library {
  id: string;
  name: string;
  types: ComponentType[];
  components: Component[];
}

/** `height` / `width` opcionales: tamaño fijado por el usuario (px); si faltan, automático. */
export interface Layer { id: string; name: string; color: string; height?: number }
export interface Stage { id: string; name: string; width?: number }

/** Instancia de un componente en una celda (capa × etapa). Un componente puede tener varias. */
export interface Placement {
  id: string;
  componentId: string;
  layerId: string;
  stageId: string;
  /** Posición libre dentro de la celda (px). Ignorada si tiene `parentId`. */
  x: number;
  y: number;
  /** Instancia contenedora (misma celda). null = nivel superior. */
  parentId?: string | null;
}

export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type Dir = 'fwd' | 'both' | 'none';

export interface Relation {
  id: string;
  from: string; // placement id
  to: string;   // placement id
  style: LineStyle;
  dir: Dir;
  color: string;
  width: number;
  label: string;
}

export interface Diagram {
  id: string;
  name: string;
  description: string;
  layers: Layer[];
  stages: Stage[];
  placements: Placement[];
  relations: Relation[];
}

export interface AppData {
  version: 1;
  libraries: Library[];
  diagrams: Diagram[];
  currentDiagramId: string | null;
}

export type Selection =
  | { kind: 'placement'; id: string }
  | { kind: 'component'; id: string }
  | { kind: 'relation'; id: string }
  | { kind: 'type'; id: string };

export interface LinkDefaults { style: LineStyle; dir: Dir; color: string; width: number }

export const KINDS: Record<FieldKind, string> = {
  text: 'Texto', textarea: 'Texto largo', number: 'Número', select: 'Lista',
  checkbox: 'Casilla', url: 'URL', date: 'Fecha',
};
export const STYLES: Record<LineStyle, string> = {
  solid: 'Directa (continua)', dashed: 'Troceada', dotted: 'Punteada',
};
export const DIRS: Record<Dir, string> = {
  fwd: '→ Una dirección', both: '↔ Ambas', none: '— Sin flecha',
};
