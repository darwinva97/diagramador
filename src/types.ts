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
