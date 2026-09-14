import { useStore } from './store';
import { API_CONTRACT_FIELDS, type AppData, type Component, type ComponentType, type Diagram, type FieldDef, type Placement, type Relation } from './types';
import { LAYER_COLORS, PALETTE, cloneDiagram, curDiagram, descendantIds, findComp, findLib, findType, libOfComp, libOfType, nextStackPos, setCell, snap, tidyCell, uid } from './lib/model';
import { exportAll, exportDiagram, mergeImport, pickFile } from './lib/io';
import { DEFAULT_LAYERS, DEFAULT_STAGES } from './seed';

const S = () => useStore.getState();
const mutate = (fn: (d: AppData) => void, snap = true) => S().mutate(fn, snap);
const select = (sel: Parameters<ReturnType<typeof useStore.getState>['select']>[0]) => S().select(sel);

function newDiagramData(name: string): Diagram {
  return {
    id: uid(), name, description: '',
    layers: DEFAULT_LAYERS.map(l => ({ id: uid(), name: l.name, color: l.color })),
    stages: DEFAULT_STAGES.map(n => ({ id: uid(), name: n })),
    placements: [], relations: [],
  };
}

/** Librería destino para crear cosas nuevas: la filtrada, o la primera (se crea "Base" si no hay). */
function targetLib(d: AppData) {
  const f = S().ui.libFilter;
  let lib = f !== 'all' ? findLib(d, f) : null;
  lib ??= d.libraries[0] ?? null;
  if (!lib) { lib = { id: uid(), name: 'Base', types: [], components: [] }; d.libraries.push(lib); }
  return lib;
}

function removePlacementsIn(d: Diagram, pred: (p: Placement) => boolean) {
  const gone = new Set<string>();
  for (const p of d.placements) if (pred(p)) { gone.add(p.id); descendantIds(d, p.id).forEach(id => gone.add(id)); }
  d.placements = d.placements.filter(p => !gone.has(p.id));
  d.relations = d.relations.filter(r => !gone.has(r.from) && !gone.has(r.to));
}

export const actions = {
  // ---------- Diagramas
  newDiagram() {
    const name = prompt('Nombre del diagrama', 'Nuevo diagrama'); if (!name) return;
    mutate(d => { const g = newDiagramData(name); d.diagrams.push(g); d.currentDiagramId = g.id; });
    select(null);
  },
  duplicateDiagram() {
    mutate(d => { const g = curDiagram(d); if (!g) return; const c = cloneDiagram(g); d.diagrams.push(c); d.currentDiagramId = c.id; });
    select(null);
  },
  deleteDiagram() {
    const g = curDiagram(S().data); if (!g) return;
    if (!confirm(`¿Eliminar el diagrama "${g.name}"? Los componentes de las librerías se conservan.`)) return;
    mutate(d => { d.diagrams = d.diagrams.filter(x => x.id !== g.id); d.currentDiagramId = d.diagrams[0]?.id ?? null; });
    select(null);
  },
  setCurrent(id: string) { mutate(d => { d.currentDiagramId = id; }, false); select(null); },

  // ---------- Capas / etapas
  addStage() { mutate(d => { const g = curDiagram(d); if (g) g.stages.push({ id: uid(), name: `Etapa ${g.stages.length + 1}` }); }); },
  addLayer() {
    mutate(d => { const g = curDiagram(d); if (g) g.layers.push({ id: uid(), name: `Capa ${g.layers.length + 1}`, color: LAYER_COLORS[g.layers.length % LAYER_COLORS.length] }); });
  },
  deleteStage(id: string) {
    const g = curDiagram(S().data); if (!g) return;
    const n = g.placements.filter(p => p.stageId === id).length;
    if (n && !confirm(`La etapa tiene ${n} componente(s). ¿Eliminarla igualmente?`)) return;
    mutate(d => { const g = curDiagram(d)!; g.stages = g.stages.filter(s => s.id !== id); removePlacementsIn(g, p => p.stageId === id); });
  },
  deleteLayer(id: string) {
    const g = curDiagram(S().data); if (!g) return;
    const n = g.placements.filter(p => p.layerId === id).length;
    if (n && !confirm(`La capa tiene ${n} componente(s). ¿Eliminarla igualmente?`)) return;
    mutate(d => { const g = curDiagram(d)!; g.layers = g.layers.filter(l => l.id !== id); removePlacementsIn(g, p => p.layerId === id); });
  },
  /** Reordena: mueve `id` a la posición de `targetId` (después si iba antes, antes si iba después). */
  reorder(kind: 'stages' | 'layers', id: string, targetId: string) {
    if (id === targetId) return;
    mutate(d => {
      const g = curDiagram(d)!; const arr = g[kind] as { id: string }[];
      const i = arr.findIndex(x => x.id === id), j = arr.findIndex(x => x.id === targetId);
      if (i < 0 || j < 0) return;
      const [it] = arr.splice(i, 1); arr.splice(j, 0, it);
    });
  },
  renameStage(id: string, name: string) { mutate(d => { const s = curDiagram(d)?.stages.find(s => s.id === id); if (s) s.name = name; }, false); },
  renameLayer(id: string, name: string) { mutate(d => { const l = curDiagram(d)?.layers.find(l => l.id === id); if (l) l.name = name; }, false); },
  /** Tamaño manual de columna / fila (undefined = automático). */
  setStageWidth(id: string, width: number | undefined) {
    mutate(d => { const s = curDiagram(d)?.stages.find(s => s.id === id); if (s) s.width = width; }, false);
  },
  setLayerHeight(id: string, height: number | undefined) {
    mutate(d => { const l = curDiagram(d)?.layers.find(l => l.id === id); if (l) l.height = height; }, false);
  },
  colorLayer(id: string, color: string) { mutate(d => { const l = curDiagram(d)?.layers.find(l => l.id === id); if (l) l.color = color; }, false); },

  // ---------- Instancias (placements)
  /** Coloca un componente en una celda. Sin posición => apilado al final. */
  place(componentId: string, layerId: string, stageId: string, pos?: { x: number; y: number }) {
    const id = uid();
    mutate(d => {
      const g = curDiagram(d)!;
      const { x, y } = pos ? { x: Math.max(0, snap(pos.x)), y: Math.max(0, snap(pos.y)) } : nextStackPos(g, layerId, stageId);
      g.placements.push({ id, componentId, layerId, stageId, x, y, parentId: null });
    });
    select({ kind: 'placement', id });
  },
  /** Coloca un componente de la librería dentro de otra instancia (subcomponente). */
  placeInto(componentId: string, parentPid: string) {
    const id = uid();
    mutate(d => {
      const g = curDiagram(d)!; const parent = g.placements.find(p => p.id === parentPid); if (!parent) return;
      g.placements.push({ id, componentId, layerId: parent.layerId, stageId: parent.stageId, x: 0, y: 0, parentId: parentPid });
    });
    select({ kind: 'placement', id });
  },
  /** Copia una instancia con todos sus subcomponentes. Devuelve el id de la copia raíz. */
  _cloneTree(g: Diagram, pid: string, layerId: string, stageId: string, x: number, y: number, parentId: string | null): string {
    const src = g.placements.find(p => p.id === pid)!; const id = uid();
    g.placements.push({ id, componentId: src.componentId, layerId, stageId, x, y, parentId });
    for (const ch of g.placements.filter(p => p.parentId === pid)) actions._cloneTree(g, ch.id, layerId, stageId, 0, 0, id);
    return id;
  },
  /** Mueve (o clona con `clone`) una instancia al nivel superior de una celda, en una posición. */
  movePlacement(pid: string, layerId: string, stageId: string, x: number, y: number, clone = false) {
    let newId = pid;
    x = Math.max(0, snap(x)); y = Math.max(0, snap(y));
    mutate(d => {
      const g = curDiagram(d)!;
      const src = g.placements.find(p => p.id === pid); if (!src) return;
      if (clone) { newId = actions._cloneTree(g, pid, layerId, stageId, x, y, null); }
      else { src.parentId = null; src.x = x; src.y = y; setCell(g, pid, layerId, stageId); }
    });
    select({ kind: 'placement', id: newId });
  },
  /**
   * Mete una instancia dentro de otra (subcomponente). Si `beforePid` es un hermano,
   * se inserta antes de él (orden visual); si no, al final.
   */
  nestPlacement(pid: string, parentPid: string, beforePid: string | null = null, clone = false) {
    if (pid === parentPid) return;
    let newId = pid;
    mutate(d => {
      const g = curDiagram(d)!;
      const src = g.placements.find(p => p.id === pid), parent = g.placements.find(p => p.id === parentPid);
      if (!src || !parent) return;
      if (descendantIds(g, pid).includes(parentPid)) return; // evitar ciclos
      let p = src;
      if (clone) { newId = actions._cloneTree(g, pid, parent.layerId, parent.stageId, 0, 0, parentPid); p = g.placements.find(x => x.id === newId)!; }
      else { p.parentId = parentPid; setCell(g, pid, parent.layerId, parent.stageId); }
      // orden entre hermanos: mover al final o antes de `beforePid`
      const i = g.placements.indexOf(p); g.placements.splice(i, 1);
      const j = beforePid ? g.placements.findIndex(x => x.id === beforePid) : -1;
      if (j >= 0) g.placements.splice(j, 0, p); else g.placements.push(p);
    });
    select({ kind: 'placement', id: newId });
  },
  /** Saca una instancia de su contenedor y la deja apilada en la celda. */
  unnest(pid: string) {
    mutate(d => {
      const g = curDiagram(d)!; const p = g.placements.find(x => x.id === pid); if (!p || !p.parentId) return;
      p.parentId = null; Object.assign(p, nextStackPos(g, p.layerId, p.stageId));
    });
  },
  /** Crear un componente nuevo como subcomponente de una instancia. */
  quickAddChild(parentPid: string) {
    const name = prompt('Nombre del nuevo subcomponente'); if (!name) return;
    const c: Component = { id: uid(), name, typeId: null, description: '', fields: {} };
    const pid = uid();
    mutate(d => {
      const g = curDiagram(d)!; const parent = g.placements.find(p => p.id === parentPid); if (!parent) return;
      targetLib(d).components.push(c);
      g.placements.push({ id: pid, componentId: c.id, layerId: parent.layerId, stageId: parent.stageId, x: 0, y: 0, parentId: parentPid });
    });
    select({ kind: 'placement', id: pid });
  },
  /** Desplaza una instancia con el teclado. */
  nudge(pid: string, dx: number, dy: number) {
    mutate(d => { const p = curDiagram(d)?.placements.find(p => p.id === pid); if (p) { p.x = Math.max(0, p.x + dx); p.y = Math.max(0, p.y + dy); } }, false);
  },
  setPos(pid: string, x: number, y: number) {
    mutate(d => { const p = curDiagram(d)?.placements.find(p => p.id === pid); if (p) { p.x = Math.max(0, x); p.y = Math.max(0, y); } }, false);
  },
  tidyCell(layerId: string, stageId: string) {
    mutate(d => { const g = curDiagram(d); if (g) tidyCell(g, layerId, stageId); });
  },
  removePlacement(pid: string) {
    mutate(d => { const g = curDiagram(d)!; removePlacementsIn(g, p => p.id === pid); });
    select(null);
  },
  /** Crear componente nuevo directamente en una celda. */
  quickAdd(layerId: string, stageId: string) {
    const name = prompt('Nombre del nuevo componente'); if (!name) return;
    const c: Component = { id: uid(), name, typeId: null, description: '', fields: {} };
    const pid = uid();
    mutate(d => {
      targetLib(d).components.push(c);
      const g = curDiagram(d)!; const { x, y } = nextStackPos(g, layerId, stageId);
      g.placements.push({ id: pid, componentId: c.id, layerId, stageId, x, y });
    });
    select({ kind: 'placement', id: pid });
  },

  // ---------- Relaciones
  addRelation(from: string, to: string) {
    if (from === to) return;
    const L = S().ui.link;
    const r: Relation = { id: uid(), from, to, style: L.style, dir: L.dir, color: L.color, width: L.width, label: '' };
    mutate(d => { curDiagram(d)!.relations.push(r); });
    select({ kind: 'relation', id: r.id });
  },
  updateRelation(id: string, patch: Partial<Relation>, snap = false) {
    mutate(d => { const r = curDiagram(d)?.relations.find(r => r.id === id); if (r) Object.assign(r, patch); }, snap);
    // recordar como estilo por defecto para la siguiente flecha
    const { style, dir, color, width } = patch;
    const link = { ...S().ui.link };
    if (style) link.style = style; if (dir) link.dir = dir; if (color) link.color = color; if (width) link.width = width;
    S().setUI({ link });
  },
  swapRelation(id: string) {
    mutate(d => { const r = curDiagram(d)?.relations.find(r => r.id === id); if (r) [r.from, r.to] = [r.to, r.from]; });
  },
  deleteRelation(id: string) {
    mutate(d => { const g = curDiagram(d)!; g.relations = g.relations.filter(r => r.id !== id); });
    select(null);
  },

  // ---------- Librerías
  newLibrary() {
    const name = prompt('Nombre de la librería', 'Nueva librería'); if (!name) return;
    const l = { id: uid(), name, types: [], components: [] };
    mutate(d => { d.libraries.push(l); });
    S().setUI({ libFilter: l.id });
  },
  renameLibrary(id: string) {
    const lib = findLib(S().data, id); if (!lib) return;
    const name = prompt('Nuevo nombre', lib.name); if (!name) return;
    mutate(d => { const l = findLib(d, id); if (l) l.name = name; });
  },
  deleteLibrary(id: string) {
    const lib = findLib(S().data, id); if (!lib) return;
    if (!confirm(`¿Eliminar la librería "${lib.name}" con ${lib.components.length} componente(s) y ${lib.types.length} tipo(s)? Se quitarán sus componentes de todos los diagramas.`)) return;
    mutate(d => {
      const cids = new Set(lib.components.map(c => c.id)), tids = new Set(lib.types.map(t => t.id));
      d.libraries = d.libraries.filter(l => l.id !== id);
      for (const g of d.diagrams) removePlacementsIn(g, p => cids.has(p.componentId));
      for (const l of d.libraries) for (const c of l.components) if (c.typeId && tids.has(c.typeId)) c.typeId = null;
    });
    S().setUI({ libFilter: 'all' }); select(null);
  },

  // ---------- Componentes
  addComponent() {
    const name = prompt('Nombre del componente'); if (!name) return;
    const c: Component = { id: uid(), name, typeId: null, description: '', fields: {} };
    mutate(d => { targetLib(d).components.push(c); });
    select({ kind: 'component', id: c.id });
  },
  updateComponent(id: string, patch: Partial<Component>, snap = false) {
    mutate(d => { const c = findComp(d, id); if (c) Object.assign(c, patch); }, snap);
  },
  setField(id: string, key: string, value: unknown) {
    mutate(d => { const c = findComp(d, id); if (c) c.fields[key] = value; }, false);
  },
  moveComponentToLib(id: string, libId: string) {
    mutate(d => {
      const from = libOfComp(d, id), to = findLib(d, libId); if (!from || !to || from.id === to.id) return;
      const i = from.components.findIndex(c => c.id === id); const [c] = from.components.splice(i, 1); to.components.push(c);
    });
  },
  deleteComponent(id: string) {
    const c = findComp(S().data, id); if (!c) return;
    const uses = S().data.diagrams.reduce((n, g) => n + g.placements.filter(p => p.componentId === id).length, 0);
    if (!confirm(`¿Eliminar "${c.name}" de la librería? Se quitará de todos los diagramas (${uses} instancia(s)).`)) return;
    mutate(d => {
      const lib = libOfComp(d, id); if (lib) lib.components = lib.components.filter(x => x.id !== id);
      for (const g of d.diagrams) removePlacementsIn(g, p => p.componentId === id);
    });
    select(null);
  },

  // ---------- Tipos
  addType() {
    const name = prompt('Nombre del tipo de componente'); if (!name) return;
    const t: ComponentType = { id: uid(), name, color: PALETTE[Math.floor(Math.random() * PALETTE.length)], icon: '▫️', fields: [] };
    mutate(d => { targetLib(d).types.push(t); });
    S().setUI({ tab: 'types' }); select({ kind: 'type', id: t.id });
  },
  /** Tipo "API" con todos los campos del contrato (método, path, URLs por entorno, request/response…). */
  addApiType() {
    const name = prompt('Nombre del tipo', 'API'); if (!name) return;
    const t: ComponentType = { id: uid(), name, color: '#2563eb', icon: '🔌', fields: API_CONTRACT_FIELDS.map(f => ({ ...f })) };
    mutate(d => { targetLib(d).types.push(t); });
    S().setUI({ tab: 'types' }); select({ kind: 'type', id: t.id });
  },
  /** Añade a un tipo existente los campos de contrato API que aún no tenga. */
  addContractFields(typeId: string) {
    mutate(d => { const t = findType(d, typeId); if (!t) return; for (const f of API_CONTRACT_FIELDS) if (!t.fields.some(x => x.key === f.key)) t.fields.push({ ...f }); });
  },
  updateType(id: string, patch: Partial<ComponentType>, snap = false) {
    mutate(d => { const t = findType(d, id); if (t) Object.assign(t, patch); }, snap);
  },
  addField(typeId: string) {
    mutate(d => { const t = findType(d, typeId); if (t) t.fields.push({ key: 'f' + uid(), label: `Campo ${t.fields.length + 1}`, kind: 'text' }); });
  },
  updateField(typeId: string, idx: number, patch: Partial<FieldDef>, snap = false) {
    mutate(d => { const t = findType(d, typeId); if (t && t.fields[idx]) Object.assign(t.fields[idx], patch); }, snap);
  },
  deleteField(typeId: string, idx: number) {
    mutate(d => { const t = findType(d, typeId); if (t) t.fields.splice(idx, 1); });
  },
  deleteType(id: string) {
    const t = findType(S().data, id); if (!t) return;
    if (!confirm(`¿Eliminar el tipo "${t.name}"? Los componentes de ese tipo quedarán sin tipo.`)) return;
    mutate(d => {
      const lib = libOfType(d, id); if (lib) lib.types = lib.types.filter(x => x.id !== id);
      for (const l of d.libraries) for (const c of l.components) if (c.typeId === id) c.typeId = null;
    });
    select(null);
  },

  // ---------- Import / export
  exportAll() { exportAll(S().data); },
  exportCurrent() { const g = curDiagram(S().data); if (g) exportDiagram(S().data, g); },
  async importJson() {
    try {
      const raw = await pickFile();
      let last: string | null = null;
      mutate(d => { last = mergeImport(d, raw); if (last) d.currentDiagramId = last; });
      select(null);
    } catch (e) { alert('No se pudo importar: ' + (e as Error).message); }
  },
  /** Carga un ejemplo incluido en la app (mismo flujo que importar). */
  loadExample(obj: unknown) {
    try {
      let last: string | null = null;
      mutate(d => { last = mergeImport(d, obj); if (last) d.currentDiagramId = last; });
      select(null);
    } catch (e) { alert('No se pudo cargar el ejemplo: ' + (e as Error).message); }
  },
  undo() { S().undo(); },
};

