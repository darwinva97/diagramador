import type { AppData, Component, ComponentType, Diagram, Library, Placement, StageGroup } from '../types';

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
    currentDiagramId: raw?.currentDiagramId ?? null,
  };
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
export function stageSpans(g: Diagram): { group: StageGroup | null; count: number; key: string }[] {
  const groups = g.stageGroups ?? [];
  const out: { group: StageGroup | null; count: number; key: string }[] = [];
  g.stages.forEach(s => {
    const grp = s.groupId ? groups.find(x => x.id === s.groupId) ?? null : null;
    const last = out[out.length - 1];
    if (grp && last && last.group?.id === grp.id) { last.count++; return; }
    out.push({ group: grp, count: 1, key: grp ? `${grp.id}-${s.id}` : `s-${s.id}` });
  });
  return out;
}
