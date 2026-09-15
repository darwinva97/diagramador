export type FieldKind = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'url' | 'date'
  | 'list'      // array de textos
  | 'keyvalue'  // array de pares { key, value } (p. ej. entorno → URL, cabecera → valor)
  | 'json';     // texto JSON (esquema / ejemplo de request o response)
export interface KeyValue { key: string; value: string }

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  /** 'select': opciones separadas por coma. 'keyvalue': "Etiqueta clave|Etiqueta valor". */
  options?: string;
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
/** `groupId`: etapa incluida en un grupo, que se dibuja como cabecera por encima de las etapas. */
export interface Stage { id: string; name: string; width?: number; groupId?: string | null }
/** Agrupación de etapas contiguas (una banda sobre las columnas), p. ej. "Evaluación rápida". */
export interface StageGroup { id: string; name: string; color?: string }

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
  /** Mapeo a nivel de campo: ruta de un campo del origen y del destino (p. ej. "response_body.id"). */
  fromField?: string;
  toField?: string;
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
  /** Grupos de etapas (opcional; si está vacío no se dibuja la banda superior). */
  stageGroups?: StageGroup[];
  /** Publicado: cualquiera con el enlace puede verlo (sólo lectura). */
  public?: boolean;
  placements: Placement[];
  relations: Relation[];
}

export interface AppData {
  version: 1;
  libraries: Library[];
  diagrams: Diagram[];
  /** Personas del espacio de trabajo, compartidas por todos los diagramas. */
  people: Person[];
  /** Reglas de estilo condicional para los componentes. */
  rules: StyleRule[];
  currentDiagramId: string | null;
}

// ---------------------------------------------------------------- Reglas de estilo
/** De dónde sale el dato que se compara. */
export type RuleSource = 'field' | 'name' | 'description' | 'type' | 'library' | 'people' | 'role';
export type RuleOp = 'eq' | 'ne' | 'contains' | 'notContains' | 'in' | 'empty' | 'notEmpty' | 'gt' | 'lt' | 'regex';
export const RULE_SOURCES: Record<RuleSource, string> = {
  field: 'Campo del componente', name: 'Nombre', description: 'Descripción',
  type: 'Tipo', library: 'Librería', people: 'Persona asignada', role: 'Papel asignado',
};
export const RULE_OPS: Record<RuleOp, string> = {
  eq: 'es igual a', ne: 'no es igual a', contains: 'contiene', notContains: 'no contiene',
  in: 'es alguno de', empty: 'está vacío', notEmpty: 'tiene algún valor',
  gt: 'es mayor que', lt: 'es menor que', regex: 'cumple la expresión regular',
};
/** Los operadores que no necesitan valor de comparación. */
export const OPS_SIN_VALOR: RuleOp[] = ['empty', 'notEmpty'];

export interface Condition {
  source: RuleSource;
  /** Clave del campo cuando `source` es 'field'. */
  key?: string;
  op: RuleOp;
  value?: string;
  /** Distinguir mayúsculas y tildes (por defecto no). */
  caseSensitive?: boolean;
}

/** Qué se pinta. Todo es opcional: una regla sólo toca lo que define. */
export interface RuleStyle {
  bg?: string;
  text?: string;
  /** Borde completo del componente. */
  border?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  /** Franja de color del lado izquierdo (la que ya lleva el color del tipo). */
  accent?: string;
  accentWidth?: number;
  /** Segunda franja, en el borde superior, para combinar dos colores. */
  top?: string;
  topWidth?: number;
  opacity?: number;
  /** Sombra de color alrededor ("brillo"). */
  glow?: string;
  /** Punto de color a la derecha del nombre, con texto corto opcional. */
  badge?: string;
  badgeText?: string;
  /** Emoji que sustituye al icono del tipo. */
  icon?: string;
  /** Tachar o poner en negrita el nombre. */
  bold?: boolean;
  strike?: boolean;
}
export const STYLE_PARTS: { key: keyof RuleStyle; label: string; kind: 'color' | 'number' | 'text' | 'bool' | 'select' }[] = [
  { key: 'bg', label: 'Fondo', kind: 'color' },
  { key: 'text', label: 'Color del texto', kind: 'color' },
  { key: 'border', label: 'Borde', kind: 'color' },
  { key: 'borderWidth', label: 'Grosor del borde', kind: 'number' },
  { key: 'borderStyle', label: 'Estilo del borde', kind: 'select' },
  { key: 'accent', label: 'Franja izquierda', kind: 'color' },
  { key: 'accentWidth', label: 'Ancho de la franja', kind: 'number' },
  { key: 'top', label: 'Franja superior', kind: 'color' },
  { key: 'topWidth', label: 'Alto de la franja superior', kind: 'number' },
  { key: 'opacity', label: 'Opacidad', kind: 'number' },
  { key: 'glow', label: 'Brillo', kind: 'color' },
  { key: 'badge', label: 'Punto', kind: 'color' },
  { key: 'badgeText', label: 'Texto del punto', kind: 'text' },
  { key: 'icon', label: 'Icono', kind: 'text' },
  { key: 'bold', label: 'Negrita', kind: 'bool' },
  { key: 'strike', label: 'Tachado', kind: 'bool' },
];

export interface StyleRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Mayor prioridad gana cuando dos reglas pintan lo mismo. */
  priority: number;
  match: 'all' | 'any';
  conditions: Condition[];
  style: RuleStyle;
  /** Limitar la regla a un diagrama (null = todos). */
  diagramId?: string | null;
}

/** A qué se puede asignar una persona. */
export type AssignKind = 'component' | 'diagram' | 'layer' | 'stage' | 'type';
export const ASSIGN_LABEL: Record<AssignKind, string> = {
  component: 'Componente', diagram: 'Diagrama', layer: 'Capa', stage: 'Etapa', type: 'Tipo',
};
/** Papeles sugeridos; el campo es libre, así que se puede escribir cualquier otro. */
export const ROLES = [
  'Owner', 'Stakeholder', 'Líder técnico', 'Product Owner', 'Arquitecto',
  'Analista funcional', 'Desarrollo', 'QA', 'Seguridad', 'Infraestructura', 'Contacto',
];
/** Participación de una persona en una parte concreta (con su papel). */
export interface Assignment {
  id: string;
  role: string;
  kind: AssignKind;
  targetId: string;
  notes?: string;
}
export interface Person {
  id: string;
  name: string;
  email?: string;
  /** Cargo o puesto ("Arquitecto de soluciones"). */
  title?: string;
  team?: string;
  color?: string;
  notes?: string;
  assignments: Assignment[];
}

export type Selection =
  | { kind: 'person'; id: string }
  | { kind: 'rule'; id: string }
  | { kind: 'placement'; id: string }
  | { kind: 'component'; id: string }
  | { kind: 'relation'; id: string }
  | { kind: 'type'; id: string };

export interface LinkDefaults { style: LineStyle; dir: Dir; color: string; width: number }

export const KINDS: Record<FieldKind, string> = {
  text: 'Texto', textarea: 'Texto largo', number: 'Número', select: 'Lista',
  checkbox: 'Casilla', url: 'URL', date: 'Fecha',
  list: 'Lista de textos', keyvalue: 'Clave → valor', json: 'JSON',
};

/** Campos de un tipo "API" con su contrato de request/response. */
export const API_CONTRACT_FIELDS: FieldDef[] = [
  { key: 'capa', label: 'Capa', kind: 'select', options: 'EXP, PROC, SD, SYS' },
  { key: 'estado', label: 'Estado', kind: 'select', options: 'Existente, Nuevo, Modificado' },
  { key: 'version', label: 'Versión', kind: 'text' },
  { key: 'method', label: 'Método HTTP', kind: 'select', options: 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS' },
  { key: 'path', label: 'Path', kind: 'text' },
  { key: 'base_url_entornos', label: 'Base URL por entorno', kind: 'keyvalue', options: 'Entorno|Base URL' },
  { key: 'auth', label: 'Autenticación', kind: 'select', options: 'Ninguna, API Key, Basic, Bearer JWT, OAuth2 client credentials, mTLS' },
  { key: 'content_type', label: 'Content-Type', kind: 'text' },
  { key: 'headers', label: 'Cabeceras de request', kind: 'keyvalue', options: 'Cabecera|Valor / descripción' },
  { key: 'path_params', label: 'Parámetros de path', kind: 'keyvalue', options: 'Parámetro|Tipo / descripción' },
  { key: 'query_params', label: 'Parámetros de query', kind: 'keyvalue', options: 'Parámetro|Tipo / descripción' },
  { key: 'request_body', label: 'Request body (JSON)', kind: 'json' },
  { key: 'response_body', label: 'Response body (JSON)', kind: 'json' },
  { key: 'response_codes', label: 'Códigos de respuesta', kind: 'keyvalue', options: 'Código|Significado' },
  { key: 'errores', label: 'Errores / contrato de error (JSON)', kind: 'json' },
  { key: 'timeout_ms', label: 'Timeout (ms)', kind: 'number' },
  { key: 'tags', label: 'Etiquetas', kind: 'list' },
  { key: 'documentacion', label: 'Documentación (URL)', kind: 'url' },
  { key: 'notas', label: 'Notas', kind: 'textarea' },
];
export const STYLES: Record<LineStyle, string> = {
  solid: 'Directa (continua)', dashed: 'Troceada', dotted: 'Punteada',
};
export const DIRS: Record<Dir, string> = {
  fwd: '→ Una dirección', both: '↔ Ambas', none: '— Sin flecha',
};
