import type { AppData, Diagram, Library, Person, StyleRule } from '../types';
import { cloneDiagram, findLib, normalize, slugify, stamp } from './model';

export interface ExportFile {
  app: 'diagramador';
  version: 1;
  exportedAt: string;
  libraries: Library[];
  diagrams: Diagram[];
  people?: Person[];
  rules?: StyleRule[];
}

export function download(name: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportAll(data: AppData) {
  const f: ExportFile = { app: 'diagramador', version: 1, exportedAt: new Date().toISOString(), libraries: data.libraries, diagrams: data.diagrams, people: data.people, rules: data.rules };
  download(`drawer-todo-${stamp()}.json`, f);
}

/** Exporta un diagrama con sólo los componentes y tipos que usa. */
export function exportDiagram(data: AppData, d: Diagram) {
  const usedComp = new Set(d.placements.map(p => p.componentId));
  const usedType = new Set<string>();
  for (const l of data.libraries) for (const c of l.components) if (usedComp.has(c.id) && c.typeId) usedType.add(c.typeId);
  const libraries = data.libraries
    .map(l => ({ ...l, components: l.components.filter(c => usedComp.has(c.id)), types: l.types.filter(t => usedType.has(t.id)) }))
    .filter(l => l.components.length || l.types.length);
  const f: ExportFile = { app: 'diagramador', version: 1, exportedAt: new Date().toISOString(), libraries, diagrams: [d] };
  download(`diagrama-${slugify(d.name)}-${stamp()}.json`, f);
}

export function pickFile(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json,.json';
    input.onchange = () => {
      const f = input.files?.[0]; if (!f) return reject(new Error('Sin archivo'));
      f.text().then(t => resolve(JSON.parse(t))).catch(reject);
    };
    input.click();
  });
}

/** Fusiona un JSON importado en los datos. Devuelve el id del último diagrama importado. */
export function mergeImport(data: AppData, raw: unknown): string | null {
  const obj = raw as Partial<ExportFile> & { diagram?: Diagram };
  if (!obj || typeof obj !== 'object' || (!Array.isArray(obj.libraries) && !Array.isArray(obj.diagrams) && !obj.diagram))
    throw new Error('Formato no reconocido: se esperaba un JSON exportado por Drawer.');
  const inc = normalize({ libraries: obj.libraries ?? [], diagrams: obj.diagrams ?? (obj.diagram ? [obj.diagram] : []), people: obj.people ?? [], rules: obj.rules ?? [] });

  for (const l of inc.libraries) {
    const ex = findLib(data, l.id);
    if (!ex) { data.libraries.push(l); continue; }
    for (const t of l.types) { const i = ex.types.findIndex(x => x.id === t.id); if (i >= 0) ex.types[i] = t; else ex.types.push(t); }
    for (const c of l.components) { const i = ex.components.findIndex(x => x.id === c.id); if (i >= 0) ex.components[i] = c; else ex.components.push(c); }
  }
  for (const r of inc.rules) {
    const i = data.rules.findIndex(x => x.id === r.id);
    if (i >= 0) data.rules[i] = r; else data.rules.push(r);
  }
  for (const p of inc.people) {
    const i = data.people.findIndex(x => x.id === p.id);
    if (i >= 0) data.people[i] = p; else data.people.push(p);
  }
  let last: string | null = null;
  for (const d of inc.diagrams) {
    const i = data.diagrams.findIndex(x => x.id === d.id);
    if (i >= 0) {
      if (confirm(`Ya existe el diagrama "${data.diagrams[i].name}". ¿Reemplazarlo?\n(Cancelar = importar como copia)`)) {
        data.diagrams[i] = d; last = d.id;
      } else {
        const copy = cloneDiagram(d, d.name + ' (importado)');
        data.diagrams.push(copy); last = copy.id;
      }
    } else { data.diagrams.push(d); last = d.id; }
  }
  return last;
}
