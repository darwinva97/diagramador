import type { AppData, AssignKind, Assignment, Component, ComponentType, Diagram, Library, Person, Placement, StageGroup, StyleRule } from '../types';
import { API_LIB_ID, emptyApi, syncApiComponent } from './api';

export const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const PALETTE = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#dc2626', '#65a30d', '#4f46e5', '#0d9488'];
export const LAYER_COLORS = ['#fef3c7', '#ede9fe', '#dbeafe', '#d1fae5', '#fce7f3', '#e0f2fe', '#fee2e2', '#ecfccb'];

export const curDiagram = (d: AppData): Diagram | null =>
  d.diagrams.find(x => x.id === d.currentDiagramId) ?? null;

export const findLib = (d: AppData, id: string | null): Library | null =>
  d.libraries.find(l => l.id === id) ?? null;

export function findComp(d: AppData, id: string | null): Component | null {
  for (const l of d.libraries) { const c = l.components.find(c => c.id === id); if (c) return c; }
  return null;
}
export const libOfComp = (d: AppData, id: string): Library | null =>
  d.libraries.find(l => l.components.some(c => c.id === id)) ?? null;

export function findType(d: AppData, id: string | null): ComponentType | null {
  if (!id) return null;
  for (const l of d.libraries) { const t = l.types.find(t => t.id === id); if (t) return t; }
  return null;
}
export const libOfType = (d: AppData, id: string): Library | null =>
  d.libraries.find(l => l.types.some(t => t.id === id)) ?? null;

export const placementsOf = (dg: Diagram, componentId: string): Placement[] =>
  dg.placements.filter(p => p.componentId === componentId);

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

/** Layout dentro de la celda */
export const CELL_PAD = 8;
export const CHIP_ROW = 40;      // separación vertical al apilar
export const SNAP = 8;           // rejilla de ajuste
export const CELL_MIN_H = 92;
export const CELL_MIN_W = 160;
export const CELL_DEFAULT_W = 240;
export const snap = (n: number) => Math.round(n / SNAP) * SNAP;

/** Ids de todos los descendientes (subcomponentes) de una instancia. */
export function descendantIds(dg: Diagram, pid: string): string[] {
  const out: string[] = []; const stack = [pid];
  while (stack.length) { const cur = stack.pop()!; for (const p of dg.placements) if (p.parentId === cur) { out.push(p.id); stack.push(p.id); } }
  return out;
}
export const childrenOf = (dg: Diagram, pid: string): Placement[] => dg.placements.filter(p => p.parentId === pid);
/** Instancia raíz (nivel de celda) de una instancia posiblemente anidada. */
/** Instancias de un componente en todos los diagramas (para saber si está compartido). */
export const instanceCount = (d: AppData, componentId: string) =>
  d.diagrams.reduce((n, g) => n + g.placements.filter(p => p.componentId === componentId).length, 0);

export function rootOf(dg: Diagram, pid: string): Placement | null {
  let p = dg.placements.find(x => x.id === pid) ?? null; const seen = new Set<string>();
  while (p && p.parentId && !seen.has(p.id)) { seen.add(p.id); p = dg.placements.find(x => x.id === p!.parentId) ?? null; }
  return p;
}
/** Cambia de celda una instancia y todos sus descendientes. */
export function setCell(dg: Diagram, pid: string, layerId: string, stageId: string) {
  for (const id of [pid, ...descendantIds(dg, pid)]) { const p = dg.placements.find(x => x.id === id); if (p) { p.layerId = layerId; p.stageId = stageId; } }
}

/** Siguiente posición libre (apilada) en una celda (sólo nivel superior). */
export function nextStackPos(dg: Diagram, layerId: string, stageId: string): { x: number; y: number } {
  const n = dg.placements.filter(p => p.layerId === layerId && p.stageId === stageId && !p.parentId).length;
  return { x: CELL_PAD, y: CELL_PAD + n * CHIP_ROW };
}

/** Apila ordenadamente los componentes de una celda. */
export function tidyCell(dg: Diagram, layerId: string, stageId: string) {
  dg.placements.filter(p => p.layerId === layerId && p.stageId === stageId && !p.parentId)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((p, i) => { p.x = CELL_PAD; p.y = CELL_PAD + i * CHIP_ROW; });
}

export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/** Rellena valores por defecto de datos antiguos/importados. */
export function normalize(raw: Partial<AppData> | null | undefined): AppData {
  const d: AppData = {
    version: 1,
    libraries: Array.isArray(raw?.libraries) ? raw!.libraries : [],
    diagrams: Array.isArray(raw?.diagrams) ? raw!.diagrams : [],
    people: Array.isArray(raw?.people) ? raw!.people : [],
    rules: Array.isArray(raw?.rules) ? raw!.rules : [],
    apis: Array.isArray(raw?.apis) ? raw!.apis : [],
    currentDiagramId: raw?.currentDiagramId ?? null,
  };
  // catálogo de APIs: operaciones con lo mínimo y componente espejo al día
  for (const a of d.apis) {
    a.id ||= uid(); a.name ||= 'API'; a.description ??= ''; a.repoUrl ??= ''; a.docsUrl ??= '';
    a.version ||= 'v1'; a.auth ??= ''; a.color ||= '#2563eb'; a.icon ||= '🔌'; a.tags ??= '';
    a.baseUrls = Array.isArray(a.baseUrls) ? a.baseUrls : [];
    a.operations = (Array.isArray(a.operations) ? a.operations : []).map(o => ({
      ...o, id: o.id || uid(), name: o.name ?? '', method: o.method || 'GET', path: o.path ?? '',
      summary: o.summary ?? '', notes: o.notes ?? '', requestBody: o.requestBody ?? '', responseBody: o.responseBody ?? '',
      headers: Array.isArray(o.headers) ? o.headers : [],
      pathParams: Array.isArray(o.pathParams) ? o.pathParams : [],
      queryParams: Array.isArray(o.queryParams) ? o.queryParams : [],
      codes: Array.isArray(o.codes) ? o.codes : [],
    }));
    syncApiComponent(d, a);
  }
  /*
   * Espejo sin su API: pasa al importar un diagrama suelto, que lleva los componentes pero
   * no el catálogo. En vez de borrar las instancias (perdiendo el trabajo de quien importa),
   * se reconstruye una API mínima con lo que el espejo guarda: se recupera dónde se usaba y
   * queda a la vista para completarla.
   */
  const espejos = d.libraries.find(l => l.id === API_LIB_ID);
  for (const c of espejos?.components ?? []) {
    const apiId = c.apiId || c.id.replace(/^api-/, '');
    if (!apiId || d.apis.some(a => a.id === apiId)) continue;
    const f = c.fields ?? {};
    d.apis.push({
      ...emptyApi(c.name || 'API'), id: apiId, description: c.description ?? '',
      repoUrl: String(f.repo ?? ''), docsUrl: String(f.docs ?? ''), version: String(f.version || 'v1'),
      auth: String(f.auth ?? ''), tags: String(f.tags ?? ''), operations: [],
    });
  }

  for (const l of d.libraries) {
    l.id ||= uid(); l.name ||= 'Librería'; l.types ||= []; l.components ||= [];
    for (const t of l.types) { t.id ||= uid(); t.fields ||= []; t.color ||= '#64748b'; t.icon ||= '▫️'; }
    for (const c of l.components) { c.id ||= uid(); c.fields ||= {}; c.description ||= ''; c.typeId ??= null; }
  }
  for (const g of d.diagrams) {
    g.id ||= uid(); g.name ||= 'Diagrama'; g.description ||= '';
    g.layers ||= []; g.stages ||= []; g.placements ||= []; g.relations ||= []; g.stageGroups ||= [];
    // etapas que apuntan a un grupo inexistente quedan sueltas
    const gids = new Set(g.stageGroups.map(x => x.id));
    for (const s of g.stages) if (s.groupId && !gids.has(s.groupId)) s.groupId = null;
    g.layers.forEach((l, i) => { l.color ||= LAYER_COLORS[i % LAYER_COLORS.length]; });
    // instancias sin posición (datos antiguos): apilarlas en su celda
    const counts = new Map<string, number>();
    const ids = new Set(g.placements.map(p => p.id));
    for (const p of g.placements) {
      if (!p.parentId || !ids.has(p.parentId) || p.parentId === p.id) p.parentId = null;
      const k = p.layerId + '|' + p.stageId;
      const n = counts.get(k) ?? 0;
      if (typeof p.x !== 'number' || typeof p.y !== 'number') { p.x = CELL_PAD; p.y = CELL_PAD + n * CHIP_ROW; }
      counts.set(k, n + 1);
    }
    for (const r of g.relations) { r.style ||= 'solid'; r.dir ||= 'fwd'; r.color ||= '#475569'; r.width ||= 2; r.label ||= ''; }
    // limpiar referencias rotas
    const pids = new Set(g.placements.map(p => p.id));
    g.relations = g.relations.filter(r => pids.has(r.from) && pids.has(r.to));
  }
  // personas: ids válidos y asignaciones que sigan apuntando a algo que existe
  const alive: Record<AssignKind, Set<string>> = {
    component: new Set(d.libraries.flatMap(l => l.components.map(c => c.id))),
    type: new Set(d.libraries.flatMap(l => l.types.map(t => t.id))),
    diagram: new Set(d.diagrams.map(g => g.id)),
    layer: new Set(d.diagrams.flatMap(g => g.layers.map(l => l.id))),
    stage: new Set(d.diagrams.flatMap(g => g.stages.map(s => s.id))),
  };
  for (const p of d.people) {
    p.id ||= uid(); p.name ||= 'Sin nombre'; p.color ||= PALETTE[0];
    p.assignments = (Array.isArray(p.assignments) ? p.assignments : [])
      .filter(a => a && alive[a.kind]?.has(a.targetId))
      .map(a => ({ ...a, id: a.id || uid(), role: a.role || 'Participante' }));
  }
  for (const r of d.rules) {
    r.id ||= uid(); r.name ||= 'Regla'; r.match ||= 'all';
    r.enabled = r.enabled !== false;
    r.priority = typeof r.priority === 'number' ? r.priority : 0;
    r.conditions = Array.isArray(r.conditions) ? r.conditions : [];
    r.style = (r.style ?? {}) as StyleRule['style'];
  }
  if (!d.diagrams.some(g => g.id === d.currentDiagramId)) d.currentDiagramId = d.diagrams[0]?.id ?? null;
  return d;
}

/** Copia profunda de un diagrama con ids nuevos. */
export function cloneDiagram(src: Diagram, name?: string): Diagram {
  const map = new Map<string, string>();
  const nid = (old: string) => { const n = uid(); map.set(old, n); return n; };
  const layers = src.layers.map(l => ({ ...l, id: nid(l.id) }));
  const stageGroups = (src.stageGroups ?? []).map(x => ({ ...x, id: nid(x.id) }));
  const stages = src.stages.map(s => ({ ...s, id: nid(s.id), groupId: s.groupId ? map.get(s.groupId) ?? null : null }));
  src.placements.forEach(p => nid(p.id));
  const placements = src.placements.map(p => ({ ...p, id: map.get(p.id)!, layerId: map.get(p.layerId)!, stageId: map.get(p.stageId)!, parentId: p.parentId ? map.get(p.parentId) ?? null : null }));
  const relations = src.relations.map(r => ({ ...r, id: uid(), from: map.get(r.from)!, to: map.get(r.to)! }));
  return { id: uid(), name: name ?? src.name + ' (copia)', description: src.description, layers, stages, stageGroups, placements, relations };
}

/**
 * Tramos de la banda superior: etapas consecutivas del mismo grupo se funden en un tramo;
 * las que no tienen grupo quedan como hueco de una columna.
 */
export function stageSpans(g: Diagram): { group: StageGroup | null; count: number; key: string; sid: string }[] {
  const groups = g.stageGroups ?? [];
  const out: { group: StageGroup | null; count: number; key: string; sid: string }[] = [];
  g.stages.forEach(s => {
    const grp = s.groupId ? groups.find(x => x.id === s.groupId) ?? null : null;
    const last = out[out.length - 1];
    if (grp && last && last.group?.id === grp.id) { last.count++; return; }
    out.push({ group: grp, count: 1, key: grp ? `${grp.id}-${s.id}` : `s-${s.id}`, sid: s.id });
  });
  return out;
}

// ---------------------------------------------------------------- Personas
export const findPerson = (d: AppData, id: string | null | undefined) =>
  id ? d.people.find(p => p.id === id) ?? null : null;

/** Iniciales para el avatar ("César Lama" → "CL"). */
export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';

/** Quién participa en algo, con su papel. */
export function participants(d: AppData, kind: AssignKind, targetId: string): { person: Person; assignment: Assignment }[] {
  const out: { person: Person; assignment: Assignment }[] = [];
  for (const person of d.people)
    for (const assignment of person.assignments)
      if (assignment.kind === kind && assignment.targetId === targetId) out.push({ person, assignment });
  return out.sort((a, b) => a.assignment.role.localeCompare(b.assignment.role) || a.person.name.localeCompare(b.person.name));
}

/** Nombre legible de aquello a lo que apunta una asignación (o null si ya no existe). */
export function targetName(d: AppData, a: Assignment): string | null {
  switch (a.kind) {
    case 'component': return d.libraries.flatMap(l => l.components).find(c => c.id === a.targetId)?.name ?? null;
    case 'type': return d.libraries.flatMap(l => l.types).find(t => t.id === a.targetId)?.name ?? null;
    case 'diagram': return d.diagrams.find(g => g.id === a.targetId)?.name ?? null;
    case 'layer': return d.diagrams.flatMap(g => g.layers).find(l => l.id === a.targetId)?.name ?? null;
    case 'stage': return d.diagrams.flatMap(g => g.stages).find(s => s.id === a.targetId)?.name ?? null;
  }
}

/** Diagrama en el que vive aquello a lo que apunta una asignación (para poder saltar allí). */
export function targetDiagram(d: AppData, a: Assignment): Diagram | null {
  if (a.kind === 'diagram') return d.diagrams.find(g => g.id === a.targetId) ?? null;
  if (a.kind === 'layer') return d.diagrams.find(g => g.layers.some(l => l.id === a.targetId)) ?? null;
  if (a.kind === 'stage') return d.diagrams.find(g => g.stages.some(s => s.id === a.targetId)) ?? null;
  if (a.kind === 'component') return d.diagrams.find(g => g.placements.some(p => p.componentId === a.targetId)) ?? null;
  return null;
}

/** Personas que comparten alguna asignación con ésta, y en cuántas cosas coinciden. */
export function collaborators(d: AppData, personId: string): { person: Person; shared: number }[] {
  const me = findPerson(d, personId); if (!me) return [];
  const mine = new Set(me.assignments.map(a => `${a.kind}:${a.targetId}`));
  return d.people
    .filter(p => p.id !== personId)
    .map(person => ({ person, shared: new Set(person.assignments.filter(a => mine.has(`${a.kind}:${a.targetId}`)).map(a => `${a.kind}:${a.targetId}`)).size }))
    .filter(x => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.person.name.localeCompare(b.person.name));
}
