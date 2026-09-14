import type { AppData, Component, ComponentType, Diagram, Placement } from './types';
import { normalize } from './lib/model';
import aliados from '../ejemplos/aliados.json';

/** Datos iniciales (primera vez que se abre la app): la plantilla "Aliados". */
export function seed(): AppData {
  const src = JSON.parse(JSON.stringify(aliados)) as { libraries: AppData['libraries']; diagrams: Diagram[] };
  return normalize({ libraries: src.libraries, diagrams: src.diagrams, currentDiagramId: src.diagrams[0]?.id ?? null });
}

/** Capas por defecto para un diagrama nuevo (misma estructura que la plantilla Aliados). */
export const DEFAULT_LAYERS: { name: string; color: string }[] = [
  { name: 'Sub Procesos', color: '#fef9c3' },
  { name: 'APIs Experiencia', color: '#e0f2fe' },
  { name: 'APIs Proceso', color: '#ccfbf1' },
  { name: 'APIs Negocio', color: '#e0f2fe' },
  { name: 'APIs Sistema (SYS)', color: '#ccfbf1' },
  { name: 'BACKEND', color: '#ede9fe' },
];
export const DEFAULT_STAGES = ['Etapa 1', 'Etapa 2', 'Etapa 3'];

/** Ejemplo secundario y sencillo: flujo de pedido (ids fijos para poder reimportarlo). */
export function pedidoExample(): { libraries: AppData['libraries']; diagrams: Diagram[] } {
  const mkType = (id: string, name: string, color: string, icon: string, fields: ComponentType['fields']): ComponentType =>
    ({ id, name, color, icon, fields });
  const tServ = mkType('ped-ty-servicio', 'Servicio', '#2563eb', '⚙️', [
    { key: 'tec', label: 'Tecnología', kind: 'text' },
    { key: 'owner', label: 'Responsable', kind: 'text' },
    { key: 'critico', label: 'Crítico', kind: 'checkbox' },
  ]);
  const tDb = mkType('ped-ty-bd', 'Base de datos', '#059669', '🗄️', [
    { key: 'motor', label: 'Motor', kind: 'select', options: 'PostgreSQL, MySQL, MongoDB, Redis' },
  ]);
  const tActor = mkType('ped-ty-actor', 'Actor', '#d97706', '👤', [{ key: 'rol', label: 'Rol', kind: 'text' }]);
  const tUI = mkType('ped-ty-ui', 'Interfaz', '#7c3aed', '🖥️', [{ key: 'url', label: 'URL', kind: 'url' }]);

  const comps: Component[] = [];
  const mk = (id: string, name: string, t: ComponentType, fields: Record<string, unknown> = {}): Component => {
    const c = { id, name, typeId: t.id, description: '', fields }; comps.push(c); return c;
  };
  const cCliente = mk('ped-c-cliente', 'Cliente', tActor, { rol: 'Usuario final' });
  const cWeb = mk('ped-c-web', 'Portal Web', tUI, { url: 'https://portal.ejemplo' });
  const cApi = mk('ped-c-api', 'API Pedidos', tServ, { tec: 'Node.js', critico: true });
  const cPagos = mk('ped-c-pagos', 'Servicio de Pagos', tServ, { tec: 'Go' });
  const cNotif = mk('ped-c-notif', 'Notificaciones', tServ, { tec: 'Python' });
  const cDb = mk('ped-c-db', 'BD Pedidos', tDb, { motor: 'PostgreSQL' });
  const cCache = mk('ped-c-cache', 'Caché', tDb, { motor: 'Redis' });

  const d: Diagram = {
    id: 'ped-diag', name: 'Ejemplo básico: flujo de pedido', description: 'Diagrama de muestra sencillo.',
    layers: [
      { id: 'ped-ly-actores', name: 'Actores', color: '#fef3c7' },
      { id: 'ped-ly-pres', name: 'Presentación', color: '#ede9fe' },
      { id: 'ped-ly-logica', name: 'Lógica', color: '#dbeafe' },
      { id: 'ped-ly-datos', name: 'Datos', color: '#d1fae5' },
    ],
    stages: [{ id: 'ped-st-captura', name: 'Captura' }, { id: 'ped-st-proceso', name: 'Proceso' }, { id: 'ped-st-entrega', name: 'Entrega' }],
    placements: [], relations: [],
  };
  const P = (id: string, c: Component, li: number, si: number, row = 0): Placement => {
    const p = { id, componentId: c.id, layerId: d.layers[li].id, stageId: d.stages[si].id, x: 8, y: 8 + row * 40, parentId: null };
    d.placements.push(p); return p;
  };
  const p1 = P('ped-p1', cCliente, 0, 0), p2 = P('ped-p2', cWeb, 1, 0), p3 = P('ped-p3', cApi, 2, 0), p4 = P('ped-p4', cDb, 3, 0);
  const p5 = P('ped-p5', cApi, 2, 1), p6 = P('ped-p6', cPagos, 2, 1, 1), p7 = P('ped-p7', cCache, 3, 1);
  const p8 = P('ped-p8', cNotif, 2, 2), p9 = P('ped-p9', cCliente, 0, 2);
  const R = (a: Placement, b: Placement, style: 'solid' | 'dashed' | 'dotted', label: string, color = '#475569') =>
    d.relations.push({ id: `ped-r-${a.id}-${b.id}`, from: a.id, to: b.id, style, dir: 'fwd', color, width: 2, label });
  R(p1, p2, 'solid', 'usa'); R(p2, p3, 'solid', 'POST /pedido'); R(p3, p4, 'dashed', 'persiste');
  R(p3, p5, 'dotted', 'continúa'); R(p5, p6, 'solid', 'cobra'); R(p6, p7, 'dashed', 'cachea');
  R(p6, p8, 'solid', 'evento'); R(p8, p9, 'dotted', 'email');
  R(p1, p4, 'dotted', 'consulta directa (salta capas)', '#dc2626');

  return { libraries: [{ id: 'ped-lib', name: 'Ejemplo pedido', types: [tServ, tDb, tActor, tUI], components: comps }], diagrams: [d] };
}
