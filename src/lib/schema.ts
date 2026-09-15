/** Reconocimiento de la estructura de un JSON (request/response de un contrato): lista plana de campos. */
export interface SchemaField { path: string; type: string; example: string; leaf: boolean }

/** Recorre un valor JSON y devuelve sus campos como rutas (`a.b`, `items[].id`), con tipo y ejemplo. */
export function jsonFields(value: unknown, max = 300): SchemaField[] {
  const out: SchemaField[] = [];
  const walk = (v: unknown, path: string, depth: number) => {
    if (out.length >= max || depth > 10) return;
    if (Array.isArray(v)) {
      if (path) out.push({ path, type: `array[${v.length}]`, example: '', leaf: false });
      if (v.length) walk(v[0], path + '[]', depth + 1);
      return;
    }
    if (v && typeof v === 'object') {
      if (path) out.push({ path, type: 'object', example: '', leaf: false });
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, depth + 1);
      return;
    }
    const type = v === null ? 'null' : typeof v;
    out.push({ path: path || '$', type, example: JSON.stringify(v), leaf: true });
  };
  walk(value, '', 0);
  return out;
}

/** Campos (hojas) de un texto JSON, o null si no es JSON válido / está vacío. */
export function parseJsonFields(text: unknown): SchemaField[] | null {
  const s = String(text ?? '').trim(); if (!s) return null;
  try { return jsonFields(JSON.parse(s)); } catch { return null; }
}

/** Campo de un componente que se puede usar como extremo de una relación. */
export interface ConnectableField { path: string; label: string; group: string; type: string }

/**
 * Campos conectables de un componente: cada campo de su tipo, y para los de tipo JSON
 * una entrada por cada campo hoja reconocido dentro del JSON (`request_body.cliente.id`).
 */
export function connectableFields(
  fields: { key: string; label: string; kind: string }[] | undefined,
  values: Record<string, unknown> | undefined,
): ConnectableField[] {
  const out: ConnectableField[] = [];
  for (const f of fields ?? []) {
    if (f.kind === 'json') {
      const parsed = parseJsonFields(values?.[f.key]);
      if (parsed) { for (const s of parsed) out.push({ path: `${f.key}.${s.path}`, label: `${f.label} · ${s.path}`, group: f.label, type: s.type }); continue; }
    }
    out.push({ path: f.key, label: f.label, group: 'Campos', type: f.kind });
  }
  return out;
}
