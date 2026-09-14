import type { AppData, Component, ComponentType, Diagram, Placement } from './types';
import { uid } from './lib/model';

/** Datos de ejemplo para la primera vez que se abre la app. */
export function seed(): AppData {
  const mkType = (name: string, color: string, icon: string, fields: ComponentType['fields']): ComponentType =>
    ({ id: uid(), name, color, icon, fields });
  const tServ = mkType('Servicio', '#2563eb', '⚙️', [
    { key: 'tec', label: 'Tecnología', kind: 'text' },
    { key: 'owner', label: 'Responsable', kind: 'text' },
    { key: 'critico', label: 'Crítico', kind: 'checkbox' },
  ]);
  const tDb = mkType('Base de datos', '#059669', '🗄️', [
    { key: 'motor', label: 'Motor', kind: 'select', options: 'PostgreSQL, MySQL, MongoDB, Redis' },
  ]);
  const tActor = mkType('Actor', '#d97706', '👤', [{ key: 'rol', label: 'Rol', kind: 'text' }]);
  const tUI = mkType('Interfaz', '#7c3aed', '🖥️', [{ key: 'url', label: 'URL', kind: 'url' }]);

  const comps: Component[] = [];
  const mk = (name: string, t: ComponentType, fields: Record<string, unknown> = {}): Component => {
    const c = { id: uid(), name, typeId: t.id, description: '', fields }; comps.push(c); return c;
  };
  const cCliente = mk('Cliente', tActor, { rol: 'Usuario final' });
  const cWeb = mk('Portal Web', tUI, { url: 'https://portal.ejemplo' });
  const cApi = mk('API Pedidos', tServ, { tec: 'Node.js', critico: true });
  const cPagos = mk('Servicio de Pagos', tServ, { tec: 'Go' });
  const cNotif = mk('Notificaciones', tServ, { tec: 'Python' });
  const cDb = mk('BD Pedidos', tDb, { motor: 'PostgreSQL' });
  const cCache = mk('Caché', tDb, { motor: 'Redis' });

  const d: Diagram = {
    id: uid(), name: 'Ejemplo: flujo de pedido', description: 'Diagrama de muestra. Puedes borrarlo.',
    layers: [
      { id: uid(), name: 'Actores', color: '#fef3c7' },
      { id: uid(), name: 'Presentación', color: '#ede9fe' },
      { id: uid(), name: 'Lógica', color: '#dbeafe' },
      { id: uid(), name: 'Datos', color: '#d1fae5' },
    ],
    stages: [{ id: uid(), name: 'Captura' }, { id: uid(), name: 'Proceso' }, { id: uid(), name: 'Entrega' }],
    placements: [], relations: [],
  };
  const P = (c: Component, li: number, si: number): Placement => {
    const n = d.placements.filter(x => x.layerId === d.layers[li].id && x.stageId === d.stages[si].id).length;
    const p = { id: uid(), componentId: c.id, layerId: d.layers[li].id, stageId: d.stages[si].id, x: 8, y: 8 + n * 40 };
    d.placements.push(p); return p;
  };
  const p1 = P(cCliente, 0, 0), p2 = P(cWeb, 1, 0), p3 = P(cApi, 2, 0), p4 = P(cDb, 3, 0);
  const p5 = P(cApi, 2, 1), p6 = P(cPagos, 2, 1), p7 = P(cCache, 3, 1);
  const p8 = P(cNotif, 2, 2), p9 = P(cCliente, 0, 2);
  const R = (a: Placement, b: Placement, style: 'solid' | 'dashed' | 'dotted', label: string, color = '#475569') =>
    d.relations.push({ id: uid(), from: a.id, to: b.id, style, dir: 'fwd', color, width: 2, label });
  R(p1, p2, 'solid', 'usa'); R(p2, p3, 'solid', 'POST /pedido'); R(p3, p4, 'dashed', 'persiste');
  R(p3, p5, 'dotted', 'continúa'); R(p5, p6, 'solid', 'cobra'); R(p6, p7, 'dashed', 'cachea');
  R(p6, p8, 'solid', 'evento'); R(p8, p9, 'dotted', 'email');
  R(p1, p4, 'dotted', 'consulta directa (salta capas)', '#dc2626');

  return {
    version: 1,
    libraries: [{ id: uid(), name: 'Base', types: [tServ, tDb, tActor, tUI], components: comps }],
    diagrams: [d],
    currentDiagramId: d.id,
  };
}
