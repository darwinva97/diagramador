import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, useValidSel, useHover } from '../store';
import { actions } from '../actions';
import { CELL_DEFAULT_W, CELL_MIN_H, CELL_MIN_W, CHIP_ROW, childrenOf, curDiagram, descendantIds, findComp, findType, participants, rootOf, stageSpans } from '../lib/model';
import { rectsEqual, type Rect } from '../lib/geometry';
import { dragKind, readDrag, setDragData, startDrag } from './dnd';
import { Links, type LinkingState } from './Links';
import { openMenu, type MenuItem } from './ContextMenu';
import { Avatar, openAssign } from './People';
import { resolveStyle, styleToCss } from '../lib/rules';
import { copySelection, cutSelection, hasClip, paste } from '../clipboard';
import type { Diagram, Layer, Placement, Stage, StageGroup } from '../types';

/** Ancho de la columna de cabeceras de capa. */
const LANE_W = 210;
/** Límites y paso del zoom del tablero. */
export const ZOOM_MIN = 0.25, ZOOM_MAX = 2;
/** Límites del zoom de los títulos, relativo al tamaño normal en pantalla. */
export const TZ_MIN = 0.5, TZ_MAX = 3;
/** Texto de los chips: tamaño base, mínimo legible en pantalla y cuánto puede crecer. */
const COMP_FONT = 13, COMP_MIN = 11, COMP_GROW_MAX = 2.5;
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

/** Arrastre libre de una instancia (posición en vivo, relativa a su celda de origen). */
interface ChipDrag { pid: string; x: number; y: number }

export function Board() {
  const data = useStore(s => s.data);
  const sel = useValidSel();
  const select = useStore(s => s.select);
  const setCell = useStore(s => s.setCell);
  const snapshot = useStore(s => s.snapshot);
  const hover = useHover();
  const ui = useStore(s => s.ui);
  const setUI = useStore(s => s.setUI);
  const zoom = ui.zoom || 1;
  /**
   * La columna de capas se fija con sticky horizontal, y Chrome calcula mal qué hay
   * bajo el cursor cuando eso se combina con zoom por encima del 100 % (el arrastre
   * deja de funcionar). Al acercar se suelta sólo esa columna; la fila de etapas y la
   * banda de grupos se quedan fijas en todos los niveles.
   */
  const columnaFija = ui.pinLayers && zoom <= 1;
  /**
   * Los títulos tienen su propio zoom, independiente del contenido: se dibujan dentro
   * de la rejilla (que ya lleva el zoom del diagrama), así que hay que compensarlo para
   * que su tamaño en pantalla sea el que pide el usuario.
   */
  const tz = ui.titleZoom || 1;
  const tf = tz / zoom;
  /**
   * Suelo de legibilidad de los chips: 13 px al 25 % serían 3 px en pantalla, ilegibles.
   * Por debajo de `COMP_MIN` píxeles en pantalla el texto crece para compensar el zoom.
   * El crecimiento se limita porque el chip se ensancha con él y acabaría comiéndose la
   * celda: a partir de ahí el texto vuelve a menguar, pero desde un tamaño mucho mayor.
   */
  const lf = Math.min(COMP_GROW_MAX, Math.max(1, COMP_MIN / (COMP_FONT * zoom)));

  const d = curDiagram(data);

  const wrapRef = useRef<HTMLElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [bandH, setBandH] = useState(0); // alto de la banda de grupos, para fijar debajo las etapas
  const [headH, setHeadH] = useState(0); // alto de la fila de cabeceras de etapa
  const [linking, setLinking] = useState<LinkingState | null>(null);
  const [drag, setDrag] = useState<ChipDrag | null>(null);
  const overRef = useRef<HTMLElement | null>(null);
  const suppressClick = useRef(false); // el click que sigue a un arrastre/enlace no debe cambiar la selección
  const [space, setSpace] = useState(false); // barra espaciadora mantenida = mover el lienzo

  // ---- barra espaciadora: pasa a modo "mover el lienzo", como en Figma
  useEffect(() => {
    const enCampo = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el?.matches?.('input, textarea, select') || !!el?.isContentEditable;
    };
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !enCampo(e.target)) { e.preventDefault(); setSpace(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false); };
    const blur = () => setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);
  useEffect(() => { document.body.classList.toggle('pan-ready', space); return () => document.body.classList.remove('pan-ready'); }, [space]);

  // ---- medir posiciones de los chips para dibujar las flechas
  const measure = useCallback(() => {
    const b = boardRef.current, g = gridRef.current; if (!b || !g) return;
    const br = b.getBoundingClientRect();
    const out: Record<string, Rect> = {};
    g.querySelectorAll<HTMLElement>('.comp[data-pid]').forEach(el => {
      const r = el.getBoundingClientRect();
      out[el.dataset.pid!] = { x: r.left - br.left, y: r.top - br.top, w: r.width, h: r.height };
    });
    setRects(prev => rectsEqual(prev, out) ? prev : out);
    setSize(prev => (prev.w === b.scrollWidth && prev.h === b.scrollHeight) ? prev : { w: b.scrollWidth, h: b.scrollHeight });
    const band = g.querySelector<HTMLElement>('.corner-gap.start');
    const bh = band ? band.offsetHeight : 0;
    setBandH(prev => prev === bh ? prev : bh);
    const head = g.querySelector<HTMLElement>('.stage-h');
    const hh = head ? head.offsetHeight : 0;
    setHeadH(prev => prev === hh ? prev : hh);
  }, []);
  // `lf` cambia el tamaño de los chips, así que las flechas hay que volver a medirlas
  useLayoutEffect(() => { measure(); }, [data, drag, measure, lf]);
  useEffect(() => {
    const g = gridRef.current; if (!g) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(g);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure]);

  /** Ajusta el zoom para que el diagrama quepa de ancho en la ventana. */
  const ajustar = useCallback(() => {
    const wrap = wrapRef.current, g = gridRef.current; if (!wrap || !g) return;
    const anchoReal = g.offsetWidth;          // ancho en px CSS, sin el zoom aplicado
    const disponible = wrap.clientWidth - 32; // menos el relleno del tablero
    if (anchoReal <= 0) return;
    useStore.getState().setUI({ zoom: clampZoom(disponible / anchoReal) });
    requestAnimationFrame(() => { wrap.scrollLeft = 0; });
  }, []);

  /**
   * Cambia el zoom manteniendo bajo el puntero el mismo punto del diagrama.
   * Sin punto de referencia (botones y atajos) se conserva el centro de la vista.
   */
  const zoomA = useCallback((nuevo: number, cx?: number, cy?: number) => {
    const wrap = wrapRef.current; if (!wrap) return;
    const z0 = useStore.getState().ui.zoom || 1;
    const z1 = clampZoom(nuevo);
    if (z1 === z0) return;
    const r = wrap.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left;
    const py = (cy ?? r.top + r.height / 2) - r.top;
    const cl = wrap.scrollLeft, ct = wrap.scrollTop;
    useStore.getState().setUI({ zoom: z1 });
    const k = z1 / z0;
    requestAnimationFrame(() => {
      wrap.scrollLeft = (cl + px) * k - px;
      wrap.scrollTop = (ct + py) * k - py;
    });
  }, []);

  // Ctrl/⌘ + rueda sobre el tablero: hace zoom sólo del diagrama, no de la página
  useEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomA((useStore.getState().ui.zoom || 1) * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY);
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [zoomA]);

  // Ctrl + / Ctrl − / Ctrl 0
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.matches?.('input, textarea, select')) return;
      const z = useStore.getState().ui.zoom || 1;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomA(z * 1.25); }
      else if (e.key === '-') { e.preventDefault(); zoomA(z / 1.25); }
      else if (e.key === '0') { e.preventDefault(); zoomA(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomA]);

  // Ojo: a partir de aquí no puede haber hooks. Sin diagramas (cuenta recién creada,
  // archivo vacío, se borró el último) el tablero se va por este camino corto.
  if (!d) return <section id="canvasWrap"><div className="empty">No hay diagramas. Crea uno con “+ Nuevo”.</div></section>;

  /** Celda bajo un punto de pantalla (geométrico, para ignorar lo que haya encima). */
  const cellAt = (cx: number, cy: number): HTMLElement | null => {
    const cells = gridRef.current?.querySelectorAll<HTMLElement>('.cell') ?? [];
    for (const c of cells) { const r = c.getBoundingClientRect(); if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return c; }
    return null;
  };

  // ---- Drag & drop HTML5: componentes desde la librería, asas de capas/etapas
  const clearOver = () => { overRef.current?.classList.remove('over'); overRef.current = null; };
  const dropTarget = (el: HTMLElement, kind: string | null): HTMLElement | null => {
    if (kind === 'comp') return el.closest<HTMLElement>('.comp') ?? el.closest<HTMLElement>('.cell');
    if (kind === 'stage') return el.closest<HTMLElement>('.stage-h');
    if (kind === 'layer') return el.closest<HTMLElement>('.layer-h');
    return null;
  };
  const onDragStart = (e: React.DragEvent) => {
    if (soloLectura) { e.preventDefault(); return; }
    const handle = (e.target as HTMLElement).closest<HTMLElement>('.handle');
    if (!handle || linking || drag) { e.preventDefault(); return; }
    startDrag(e, { t: handle.dataset.drag as 'stage' | 'layer', id: handle.dataset.id! });
  };
  const onDragOver = (e: React.DragEvent) => {
    const kind = dragKind(e);
    const tgt = dropTarget(e.target as HTMLElement, kind); if (!tgt) { clearOver(); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = kind === 'comp' ? 'copy' : 'move';
    if (overRef.current !== tgt) { clearOver(); tgt.classList.add('over'); overRef.current = tgt; }
  };
  const onDrop = (e: React.DragEvent) => {
    if (soloLectura) return;
    const dd = readDrag(e); const tgt = dropTarget(e.target as HTMLElement, dd?.t ?? null);
    clearOver(); setDragData(null);
    if (!dd || !tgt) return;
    e.preventDefault();
    if (dd.t === 'comp') {
      if (tgt.classList.contains('comp')) { actions.placeInto(dd.id, tgt.dataset.pid!); return; }
      const r = tgt.getBoundingClientRect();
      actions.place(dd.id, tgt.dataset.lid!, tgt.dataset.sid!, { x: (e.clientX - r.left) / zoom - 24, y: (e.clientY - r.top) / zoom - 16 });
    } else if (dd.t === 'stage') actions.reorder('stages', dd.id, tgt.dataset.sid!);
    else if (dd.t === 'layer') actions.reorder('layers', dd.id, tgt.dataset.lid!);
  };
  const onDragEnd = () => { clearOver(); setDragData(null); };

  // ---- Puntero: crear relación (desde ●) o mover libremente una instancia
  /** Índice de la cabecera de etapa que hay bajo el puntero (para el arrastre de la banda). */
  const stageIndexAt = (cx: number): number | null => {
    let best: number | null = null;
    d.stages.forEach((s, i) => {
      const h = gridRef.current?.querySelector<HTMLElement>(`.stage-h[data-sid="${s.id}"]`);
      if (!h) return;
      const r = h.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right) best = i;
    });
    return best;
  };

  /**
   * Arrastre en la banda superior: desde un hueco crea un grupo que abarca las columnas
   * recorridas; desde el borde de un grupo lo extiende o lo reduce.
   */
  const onBandPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || space || soloLectura) return;
    const el = e.target as HTMLElement;
    const edge = el.closest<HTMLElement>('.sg-edge');
    const gap = el.closest<HTMLElement>('.group-gap');
    if (!edge && !gap) return;
    e.preventDefault(); e.stopPropagation();

    const start = stageIndexAt(e.clientX); if (start === null) return;
    snapshot();

    let gid: string;
    let anchor: number;
    if (edge) {
      gid = edge.dataset.gid!;
      const idx = d.stages.map((s, i) => ({ s, i })).filter(x => x.s.groupId === gid).map(x => x.i);
      // el extremo contrario al que se arrastra queda fijo
      anchor = edge.classList.contains('left') ? Math.max(...idx) : Math.min(...idx);
    } else {
      const id = actions.addStageGroup([d.stages[start].id]); if (!id) return;
      gid = id; anchor = start;
    }

    document.body.classList.add('resizing-x');
    const move = (ev: PointerEvent) => {
      const j = stageIndexAt(ev.clientX); if (j === null) return;
      actions.setStageGroupRange(gid, anchor, j);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      document.body.classList.remove('resizing-x');
      suppressClick.current = true;
      // al crear uno nuevo, el nombre queda listo para escribirlo
      if (gap) setTimeout(() => gridRef.current?.querySelector<HTMLInputElement>(`.stage-group[data-gid="${gid}"] input`)?.select(), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || space) return; // con espacio se mueve el lienzo
    const el = e.target as HTMLElement;
    if (el.closest('.stage-group, .group-gap')) return; // lo gestiona onBandPointerDown

    // ----- redimensionar columna (ancho de etapa) o fila (alto de capa)
    const rs = soloLectura ? null : el.closest<HTMLElement>('.rs-x, .rs-y');
    if (rs) {
      e.preventDefault(); e.stopPropagation();
      const isX = rs.classList.contains('rs-x');
      const owner = rs.parentElement!; const id = isX ? owner.dataset.sid! : owner.dataset.lid!;
      const s0 = isX ? e.clientX : e.clientY; const size0 = isX ? owner.offsetWidth : owner.offsetHeight;
      snapshot();
      document.body.classList.add(isX ? 'resizing-x' : 'resizing-y');
      const move = (ev: PointerEvent) => {
        const v = Math.round(size0 + ((isX ? ev.clientX : ev.clientY) - s0) / zoom);
        if (isX) actions.setStageWidth(id, Math.max(CELL_MIN_W, v)); else actions.setLayerHeight(id, Math.max(60, v));
      };
      const up = () => { window.removeEventListener('pointermove', move); document.body.classList.remove('resizing-x', 'resizing-y'); suppressClick.current = true; };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
      return;
    }

    const port = soloLectura ? null : el.closest('.port');
    const comp = el.closest<HTMLElement>('.comp');
    if (!comp) return;
    const board = boardRef.current!;
    const pid = comp.dataset.pid!;

    if (port) { // ----- relación
      e.preventDefault(); e.stopPropagation();
      const br = board.getBoundingClientRect(); const r = comp.getBoundingClientRect();
      const start = { x: r.right - br.left, y: r.top + r.height / 2 - br.top };
      const chipUnder = (ev: PointerEvent) => {
        const c = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.comp');
        return c && c.dataset.pid !== pid ? c.dataset.pid! : null;
      };
      setLinking({ from: pid, start, cur: start, target: null });
      document.body.classList.add('linking');
      const move = (ev: PointerEvent) => {
        const br = board.getBoundingClientRect();
        setLinking({ from: pid, start, cur: { x: ev.clientX - br.left, y: ev.clientY - br.top }, target: chipUnder(ev) });
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        document.body.classList.remove('linking');
        const to = chipUnder(ev);
        setLinking(null);
        suppressClick.current = true;
        if (to) actions.addRelation(pid, to);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
      return;
    }

    // ----- mover instancia (posición libre)
    const pOrig = d.placements.find(x => x.id === pid);
    // En la vista pública se puede recolocar dentro de la propia celda, pero nada más: un
    // subcomponente lo coloca su contenedor, así que ése no se toca.
    if (soloLectura && (!pOrig || pOrig.parentId)) return;
    const cell = comp.closest<HTMLElement>('.cell')!;
    const cr = cell.getBoundingClientRect(); const r = comp.getBoundingClientRect();
    const offX = e.clientX - r.left, offY = e.clientY - r.top;
    const sx = e.clientX, sy = e.clientY;
    /** Dentro de la celda de origen, sin asomar por ningún borde. */
    const dentroDeLaCelda = (cx: number, cy: number) => ({
      x: Math.min(Math.max(0, (cx - offX - cr.left) / zoom), Math.max(0, (cr.width - r.width) / zoom)),
      y: Math.min(Math.max(0, (cy - offY - cr.top) / zoom), Math.max(0, (cr.height - r.height) / zoom)),
    });
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; started = true; document.body.classList.add('dragging-chip'); }
      setDrag(soloLectura
        ? { pid, ...dentroDeLaCelda(ev.clientX, ev.clientY) }
        : { pid, x: (ev.clientX - offX - cr.left) / zoom, y: (ev.clientY - offY - cr.top) / zoom });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      if (!started) return; // fue un click: lo gestiona onGridClick
      document.body.classList.remove('dragging-chip');
      suppressClick.current = true;
      setDrag(null);
      if (soloLectura) {
        const { x, y } = dentroDeLaCelda(ev.clientX, ev.clientY);
        actions.movePlacement(pid, pOrig!.layerId, pOrig!.stageId, x, y);
        return;
      }
      const underEl = document.elementFromPoint(ev.clientX, ev.clientY);
      if (underEl?.closest('#sidebar')) { actions.removePlacement(pid); return; }
      const overChip = underEl?.closest<HTMLElement>('.comp');
      // soltar sobre otro componente lo anida; sobre sí mismo o sobre un hijo suyo
      // no tiene sentido anidar, así que se trata como un movimiento normal a la celda
      const tpid0 = overChip?.dataset.pid;
      const anidar = !!tpid0 && tpid0 !== pid && !descendantIds(d, pid).includes(tpid0);
      if (overChip && anidar) {
        const tpid = tpid0!;
        const tp = d.placements.find(x => x.id === tpid)!;
        // sobre un subcomponente => hermano suyo (antes de él); sobre uno de nivel superior => dentro de él
        if (tp.parentId) actions.nestPlacement(pid, tp.parentId, tpid, ev.ctrlKey || ev.altKey);
        else actions.nestPlacement(pid, tpid, null, ev.ctrlKey || ev.altKey);
        return;
      }
      const target = cellAt(ev.clientX, ev.clientY); if (!target) return;
      const tr = target.getBoundingClientRect();
      const x = Math.min(Math.max(0, (ev.clientX - offX - tr.left) / zoom), Math.max(0, (tr.width - r.width) / zoom));
      const y = Math.max(0, (ev.clientY - offY - tr.top) / zoom);
      actions.movePlacement(pid, target.dataset.lid!, target.dataset.sid!, x, y, ev.ctrlKey || ev.altKey);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  /** Menú contextual del tablero: instancia, celda, capa o etapa según dónde se haga clic derecho. */
  const onGridContextMenu = (e: React.MouseEvent) => {
    if (soloLectura) return;
    const el = e.target as HTMLElement;
    const st = useStore.getState();
    const comp = el.closest<HTMLElement>('.comp');
    const cellEl = el.closest<HTMLElement>('.cell');

    if (comp?.dataset.pid) {
      const pid = comp.dataset.pid;
      const p = d.placements.find(x => x.id === pid); if (!p) return;
      const c = findComp(data, p.componentId);
      select({ kind: 'placement', id: pid });
      setCell({ layerId: p.layerId, stageId: p.stageId });
      const items: MenuItem[] = [
        { label: 'Copiar', hint: 'Ctrl+C', onClick: () => copySelection() },
        { label: 'Cortar', hint: 'Ctrl+X', onClick: () => cutSelection() },
        { label: 'Duplicar aquí', hint: 'Ctrl+D', onClick: () => actions.clonePlacement(pid, p.layerId, p.stageId) },
        { label: 'Pegar en esta celda', hint: 'Ctrl+V', disabled: !hasClip(), onClick: () => paste() },
        { sep: true },
        { label: 'Desvincular esta instancia', hint: 'Ctrl+Shift+D', disabled: !actions.canDetach(p.componentId),
          title: actions.canDetach(p.componentId) ? 'Esta instancia pasa a tener su propia copia del componente.' : 'El componente sólo tiene esta instancia: ya es independiente.',
          onClick: () => actions.detachSelected() },
        { label: 'Separar todas las instancias de este componente', disabled: actions.instancesHere(p.componentId) < 2,
          title: 'Cada instancia de este diagrama pasa a tener su propia copia.',
          onClick: () => actions.splitInstances(p.componentId) },
        { label: 'Editar en el inspector', hint: 'F2', onClick: () => st.setUI({ inspectorOpen: true }) },
        { label: 'Personas…', onClick: () => openAssign('component', p.componentId, c?.name ?? 'Componente') },
        { label: '+ Subcomponente', onClick: () => actions.quickAddChild(pid) },
        ...(p.parentId ? [{ label: 'Sacar del contenedor', onClick: () => actions.unnest(pid) }] : []),
        { label: 'Ordenar celda', onClick: () => actions.tidyCell(p.layerId, p.stageId) },
        { sep: true },
        { label: 'Quitar de la celda', hint: 'Supr', danger: true, onClick: () => actions.removePlacement(pid) },
        { label: 'Eliminar de la librería', danger: true, onClick: () => actions.deleteComponent(p.componentId) },
      ];
      openMenu(e, items, c?.name);
      return;
    }

    if (cellEl?.dataset.lid) {
      const lid = cellEl.dataset.lid, sid = cellEl.dataset.sid!;
      setCell({ layerId: lid, stageId: sid });
      const L = d.layers.find(l => l.id === lid), S = d.stages.find(s => s.id === sid);
      const n = d.placements.filter(p => p.layerId === lid && p.stageId === sid && !p.parentId).length;
      openMenu(e, [
        { label: 'Pegar aquí', hint: 'Ctrl+V', disabled: !hasClip(), onClick: () => paste() },
        { label: 'Pegar aquí como copia independiente', hint: 'Ctrl+Shift+V', disabled: !hasClip(), onClick: () => paste(true) },
        { label: 'Nuevo componente aquí', hint: 'Ctrl+Entrar', onClick: () => actions.quickAdd(lid, sid) },
        { sep: true },
        { label: 'Ordenar celda', disabled: n < 2, onClick: () => actions.tidyCell(lid, sid) },
        { label: 'Ancho de la etapa automático', onClick: () => { snapshot(); actions.setStageWidth(sid, undefined); } },
        { label: 'Alto de la capa automático', onClick: () => { snapshot(); actions.setLayerHeight(lid, undefined); } },
      ], `${L?.name ?? '?'} · ${S?.name ?? '?'}`);
      return;
    }

    const layerEl = el.closest<HTMLElement>('.layer-h');
    if (layerEl?.dataset.lid) {
      const lid = layerEl.dataset.lid;
      openMenu(e, [
        { label: 'Renombrar', onClick: () => layerEl.querySelector<HTMLInputElement>('input.name')?.select() },
        { label: 'Personas…', onClick: () => openAssign('layer', lid, d.layers.find(l => l.id === lid)?.name ?? 'Capa') },
        { label: st.ui.pinLayers ? 'Soltar la columna de capas' : 'Fijar la columna de capas', onClick: () => st.setUI({ pinLayers: !st.ui.pinLayers }) },
        { label: 'Añadir capa', onClick: actions.addLayer },
        { label: 'Alto automático', onClick: () => { snapshot(); actions.setLayerHeight(lid, undefined); } },
        { sep: true },
        { label: 'Eliminar capa', danger: true, onClick: () => actions.deleteLayer(lid) },
      ], d.layers.find(l => l.id === lid)?.name);
      return;
    }

    const stageEl = el.closest<HTMLElement>('.stage-h');
    if (stageEl?.dataset.sid) {
      const sid = stageEl.dataset.sid;
      const st2 = d.stages.find(s => s.id === sid);
      const groups = d.stageGroups ?? [];
      openMenu(e, [
        { label: 'Renombrar', onClick: () => stageEl.querySelector<HTMLInputElement>('input.name')?.select() },
        { label: 'Personas…', onClick: () => openAssign('stage', sid, st2?.name ?? 'Etapa') },
        { label: st.ui.pinStages ? 'Soltar la fila de etapas' : 'Fijar la fila de etapas', onClick: () => st.setUI({ pinStages: !st.ui.pinStages }) },
        { label: 'Añadir etapa', onClick: actions.addStage },
        { label: 'Ancho automático', onClick: () => { snapshot(); actions.setStageWidth(sid, undefined); } },
        { sep: true },
        ...groups.filter(g => g.id !== st2?.groupId).map(g => ({ label: `Poner en «${g.name}»`, onClick: () => actions.setStageGroup(sid, g.id) })),
        { label: 'Nuevo grupo con esta etapa', onClick: () => {
            const id = actions.addStageGroup([sid]);
            if (id) setTimeout(() => gridRef.current?.querySelector<HTMLInputElement>(`.stage-group[data-gid="${id}"] input`)?.select(), 0);
          } },
        ...(st2?.groupId ? [{ label: 'Sacar del grupo', onClick: () => actions.setStageGroup(sid, null) }] : []),
        { sep: true },
        { label: 'Eliminar etapa', danger: true, onClick: () => actions.deleteStage(sid) },
      ], st2?.name);
      return;
    }

    const groupEl = el.closest<HTMLElement>('.stage-group');
    if (groupEl?.dataset.gid) {
      const gid = groupEl.dataset.gid;
      const grp = (d.stageGroups ?? []).find(x => x.id === gid);
      const idx = d.stages.map((s, i) => ({ s, i })).filter(x => x.s.groupId === gid).map(x => x.i);
      const izq = d.stages[Math.min(...idx) - 1], der = d.stages[Math.max(...idx) + 1];
      openMenu(e, [
        { label: 'Renombrar', onClick: () => groupEl.querySelector<HTMLInputElement>('input.name')?.select() },
        ...(izq ? [{ label: `Añadir «${izq.name}» por la izquierda`, onClick: () => actions.setStageGroup(izq.id, gid) }] : []),
        ...(der ? [{ label: `Añadir «${der.name}» por la derecha`, onClick: () => actions.setStageGroup(der.id, gid) }] : []),
        { label: 'Editar grupos en el inspector', onClick: () => { select(null); useStore.getState().setUI({ inspectorOpen: true }); } },
        { sep: true },
        { label: 'Deshacer el grupo', danger: true, onClick: () => actions.deleteStageGroup(gid) },
      ], grp?.name);
    }
  };

  /** Menú contextual de una flecha. */
  const onRelationContextMenu = (id: string, e: React.MouseEvent) => {
    if (soloLectura) return;
    const r = d.relations.find(x => x.id === id); if (!r) return;
    select({ kind: 'relation', id });
    openMenu(e, [
      { label: 'Editar en el inspector', onClick: () => useStore.getState().setUI({ inspectorOpen: true }) },
      { label: 'Invertir sentido', onClick: () => actions.swapRelation(id) },
      { label: 'Quitar conexión por campos', disabled: !r.fromField && !r.toField,
        onClick: () => actions.updateRelation(id, { fromField: undefined, toField: undefined }, true) },
      { sep: true },
      { label: 'Eliminar flecha', danger: true, onClick: () => actions.deleteRelation(id) },
    ], r.label || 'Relación');
  };

  /**
   * Mover el lienzo arrastrando, como en Figma: con la barra espaciadora, con el botón
   * central, o arrastrando sobre una zona libre (un clic sin mover sigue deseleccionando).
   */
  /** En la vista pública sólo se mira: ni arrastrar, ni menús, ni redimensionar. */
  const soloLectura = typeof document !== 'undefined' && document.body.classList.contains('read-only');

  const onWrapPointerDown = (e: React.PointerEvent) => {
    const el = e.target as HTMLElement;
    const central = e.button === 1;
    // sobre elementos que ya tienen su propio arrastre no se panea salvo con espacio o botón central
    const ocupado = el.closest('.comp, .handle, .rs-x, .rs-y, .sg-edge, .stage-group, .group-gap, button, input, select, textarea, .splitter');
    if (!central && !space && ocupado) return;
    if (e.button !== 0 && !central) return;
    const wrap = wrapRef.current; if (!wrap) return;
    e.preventDefault();
    if (central || space) e.stopPropagation();

    const x0 = e.clientX, y0 = e.clientY;
    const left0 = wrap.scrollLeft, top0 = wrap.scrollTop;
    let movido = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!movido) {
        if (Math.hypot(dx, dy) < 4) return;
        movido = true; document.body.classList.add('panning');
      }
      wrap.scrollLeft = left0 - dx;
      wrap.scrollTop = top0 - dy;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      document.body.classList.remove('panning');
      if (movido) suppressClick.current = true;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const onGridDoubleClick = (e: React.MouseEvent) => {
    const comp = (e.target as HTMLElement).closest<HTMLElement>('.comp');
    if (comp) { select({ kind: 'placement', id: comp.dataset.pid! }); useStore.getState().setUI({ inspectorOpen: true }); return; }
    const rs = (e.target as HTMLElement).closest<HTMLElement>('.rs-x, .rs-y'); if (!rs) return;
    const owner = rs.parentElement!;
    if (rs.classList.contains('rs-x')) { useStore.getState().snapshot(); actions.setStageWidth(owner.dataset.sid!, undefined); }
    else { useStore.getState().snapshot(); actions.setLayerHeight(owner.dataset.lid!, undefined); }
  };

  const onGridClick = (e: React.MouseEvent) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (space) return;
    const el = e.target as HTMLElement;
    const comp = el.closest<HTMLElement>('.comp');
    if (comp) { select({ kind: 'placement', id: comp.dataset.pid! }); return; }
    if (el.closest('button, input, select, .handle')) return;
    select(null);
    const cell = el.closest<HTMLElement>('.cell');
    setCell(cell ? { layerId: cell.dataset.lid!, stageId: cell.dataset.sid! } : null);
  };

  // la columna de títulos crece con su propio zoom para que el texto siga cabiendo
  const cols = `${Math.round(LANE_W * tf)}px ${d.stages.map(s => s.width ? `${s.width}px` : `minmax(${CELL_DEFAULT_W}px, 1fr)`).join(' ')} ${Math.round(44 * tf)}px`;
  const spans = stageSpans(d);
  return (
    <section id="canvasWrap" ref={wrapRef} onPointerDown={onWrapPointerDown} onAuxClick={e => e.preventDefault()}
      onClick={e => { if (e.target === e.currentTarget) { select(null); setCell(null); } }}>
      <div id="board" ref={boardRef}>
        <div id="grid" ref={gridRef}
          className={(columnaFija ? 'pin-cols' : '') + (ui.pinStages ? ' pin-rows' : '')}
          style={{ gridTemplateColumns: cols, zoom, ['--band-h' as string]: `${bandH + 6}px`, ['--head-h' as string]: `${headH + 6}px`, ['--lane-w' as string]: `${Math.round(LANE_W * tf)}px`, ['--tf' as string]: tf, ['--lf' as string]: lf }}
          onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
          onPointerDown={e => { onBandPointerDown(e); onPointerDown(e); }} onClick={onGridClick} onDoubleClick={onGridDoubleClick} onContextMenu={onGridContextMenu}>
          {spans.map((sp, k) => sp.group
            ? <StageGroupHeader key={sp.key} g={sp.group} count={sp.count} col={2 + spans.slice(0, k).reduce((n, x) => n + x.count, 0)} snapshot={snapshot} />
            : <div key={sp.key} className="group-gap" data-sid={sp.sid}
                style={{ gridRow: 1, gridColumn: `${2 + spans.slice(0, k).reduce((n, x) => n + x.count, 0)} / span ${sp.count}` }}
                title="Arrastra sobre las columnas para agruparlas">
                <span className="gap-hint">+ agrupar</span>
              </div>)}
          <div className="group-gap corner-gap end" style={{ gridRow: 1, gridColumn: d.stages.length + 2 }} />
          <div className="group-gap corner-gap start" style={{ gridRow: 1, gridColumn: 1 }} />
          {d.stages.map((s, j) => <StageHeader key={s.id} s={s} col={j + 2} snapshot={snapshot} />)}
          <div className="add-col" style={{ gridRow: 2, gridColumn: d.stages.length + 2 }}><button className="btn icon" onClick={actions.addStage} title="Añadir etapa">+</button></div>
          <div className="corner" style={{ gridRow: 2, gridColumn: 1 }}><span>Capas ╲ Etapas</span></div>
          {d.layers.map((l, i) => (
            <Fragment key={l.id}>
              {d.stages.map((s, j) => (
                <Cell key={s.id} d={d} l={l} s={s} sel={sel} drag={drag} rects={rects} linkTarget={linking?.target ?? null} hoverCid={hover.cid}
                  row={i + 3} col={j + 2} onHover={(cid, pid) => hover.set(cid, pid)} />
              ))}
              <div className="filler" style={{ gridRow: i + 3, gridColumn: d.stages.length + 2 }} />
              <LayerHeader l={l} row={i + 3} snapshot={snapshot} />
            </Fragment>
          ))}
          <div className="add-row" style={{ gridRow: d.layers.length + 3 }}><button className="btn" onClick={actions.addLayer}>+ Capa</button></div>
        </div>
        <Links rects={rects} size={size} relations={d.relations} sel={sel} hoverPid={hover.pid} linking={linking}
          onSelect={id => select({ kind: 'relation', id })} onContext={onRelationContextMenu} />
      </div>
      <div className={'zoom-bar' + (ui.pinLayers && !columnaFija ? ' warn-pin' : '')}
        title={'Zoom sólo del diagrama · Ctrl + rueda, Ctrl +, Ctrl −, Ctrl 0'
          + (ui.pinLayers && !columnaFija ? '\nPor encima del 100 % la columna de capas deja de estar fija' : '')}>
        <button className="btn icon" onClick={() => zoomA(zoom / 1.25)} disabled={zoom <= ZOOM_MIN} title="Alejar (Ctrl −)">−</button>
        <button className="btn zoom-val" onClick={() => zoomA(1)} title="Volver al 100 % (Ctrl 0)">{Math.round(zoom * 100)}%</button>
        <button className="btn icon" onClick={() => zoomA(zoom * 1.25)} disabled={zoom >= ZOOM_MAX} title="Acercar (Ctrl +)">+</button>
        <button className="btn icon" onClick={ajustar} title="Ajustar el ancho a la ventana">⤢</button>
        <span className="zoom-sep" />
        <button className="btn icon" onClick={() => setUI({ titleZoom: Math.max(TZ_MIN, Math.round(tz / 1.25 * 100) / 100) })}
          disabled={tz <= TZ_MIN} title="Títulos más pequeños">A−</button>
        <button className="btn zoom-val" onClick={() => setUI({ titleZoom: 1 })}
          title="Zoom de los títulos de capas, etapas y grupos · clic para volver al 100 %">{Math.round(tz * 100)}%</button>
        <button className="btn icon" onClick={() => setUI({ titleZoom: Math.min(TZ_MAX, Math.round(tz * 1.25 * 100) / 100) })}
          disabled={tz >= TZ_MAX} title="Títulos más grandes">A+</button>
      </div>
    </section>
  );
}

/** Cabecera de un grupo de etapas: abarca las columnas de sus etapas. */
function StageGroupHeader({ g, count, col, snapshot }: { g: StageGroup; count: number; col: number; snapshot(): void }) {
  return (
    <div className="stage-group" data-gid={g.id} style={{ gridRow: 1, gridColumn: `${col} / span ${count}`, ['--gc' as string]: g.color ?? '#94a3b8' }}
      title="Grupo de etapas · arrastra los bordes para abarcar más o menos columnas · clic derecho para más acciones">
      <div className="sg-edge left" data-gid={g.id} title="Arrastra para cambiar dónde empieza el grupo" />
      <input className="name" value={g.name} onFocus={snapshot} onChange={e => actions.renameStageGroup(g.id, e.target.value)} />
      <div className="sg-edge right" data-gid={g.id} title="Arrastra para cambiar dónde acaba el grupo" />
    </div>
  );
}

function StageHeader({ s, col, snapshot }: { s: Stage; col: number; snapshot(): void }) {
  return (
    <div className="stage-h" data-sid={s.id} style={{ gridRow: 2, gridColumn: col }}>
      <span className="sh-stick">
        <span className="handle" draggable data-drag="stage" data-id={s.id} title="Arrastrar para reordenar">⋮⋮</span>
        <input className="name" value={s.name} onFocus={snapshot} onChange={e => actions.renameStage(s.id, e.target.value)} />
      </span>
      <button className="btn icon ghost" onClick={() => actions.deleteStage(s.id)} title="Eliminar etapa">×</button>
      <div className="rs-x" title="Arrastra para cambiar el ancho · doble clic = automático" />
    </div>
  );
}

function LayerHeader({ l, row, snapshot }: { l: Layer; row: number; snapshot(): void }) {
  return (
    <div className="layer-h" data-lid={l.id} style={{ gridRow: row, gridColumn: 1, ['--lc' as string]: l.color }}>
      <div className="lh-stick">
        <div className="lh-top">
          <span className="handle" draggable data-drag="layer" data-id={l.id} title="Arrastrar para reordenar">⋮⋮</span>
          <input className="name" value={l.name} onFocus={snapshot} onChange={e => actions.renameLayer(l.id, e.target.value)} />
          <button className="btn icon ghost" onClick={() => actions.deleteLayer(l.id)} title="Eliminar capa">×</button>
        </div>
        <input type="color" className="lcolor" value={l.color} onFocus={snapshot} onChange={e => actions.colorLayer(l.id, e.target.value)} title="Color de la capa" />
      </div>
      <div className="rs-y" title="Arrastra para cambiar el alto · doble clic = automático" />
    </div>
  );
}

interface CellProps {
  d: Diagram; l: Layer; s: Stage; sel: ReturnType<typeof useValidSel>; drag: ChipDrag | null; rects: Record<string, Rect>;
  linkTarget: string | null; hoverCid: string | null; row: number; col: number;
  onHover(cid: string | null, pid?: string | null): void;
}
function Cell({ d, l, s, sel, drag, rects, linkTarget, hoverCid, row, col, onHover }: CellProps) {
  const data = useStore(st => st.data);
  const active = useStore(st => st.cell?.layerId === l.id && st.cell?.stageId === s.id);
  const ps = d.placements.filter(p => p.layerId === l.id && p.stageId === s.id && !p.parentId);
  const minHeight = Math.max(l.height ?? CELL_MIN_H, ...ps.map(p => p.y + (rects[p.id]?.h ?? CHIP_ROW - 8) + 20));
  // fantasma del chip que se está arrastrando, si su raíz está en esta celda
  const dragRoot = drag ? rootOf(d, drag.pid) : null;
  const ghost = drag && dragRoot && dragRoot.layerId === l.id && dragRoot.stageId === s.id ? d.placements.find(p => p.id === drag.pid) : null;
  const common = { d, data, sel, linkTarget, hoverCid, onHover, dragPid: drag?.pid ?? null };
  return (
    <div className={'cell' + (active ? ' active' : '')} data-lid={l.id} data-sid={s.id} style={{ gridRow: row, gridColumn: col, ['--lc' as string]: l.color, minHeight }}>
      {ps.map(p => <Chip key={p.id} p={p} {...common} />)}
      {ghost && <Chip p={ghost} {...common} ghost={drag!} />}
      <div className="cell-tools">
        {ps.length > 1 && <button className="quick" onClick={() => actions.tidyCell(l.id, s.id)} title="Ordenar (apilar) los componentes de esta celda">⊞</button>}
        <button className="quick" onClick={() => actions.quickAdd(l.id, s.id)} title="Nuevo componente aquí">+</button>
      </div>
      <div className="rs-x" title="Arrastra para cambiar el ancho de la etapa · doble clic = automático" />
      <div className="rs-y" title="Arrastra para cambiar el alto de la capa · doble clic = automático" />
    </div>
  );
}

interface ChipProps {
  p: Placement; d: Diagram; data: ReturnType<typeof useStore.getState>['data'];
  sel: ReturnType<typeof useValidSel>; linkTarget: string | null; hoverCid: string | null; dragPid: string | null;
  onHover(cid: string | null, pid?: string | null): void;
  /** Si se pasa, este chip es la copia flotante que sigue al puntero. */
  ghost?: ChipDrag;
}
function Chip(props: ChipProps) {
  const { p, d, data, sel, linkTarget, hoverCid, dragPid, onHover, ghost } = props;
  const c = findComp(data, p.componentId); if (!c) return null;
  const t = findType(data, c.typeId);
  const clones = d.placements.filter(x => x.componentId === c.id).length;
  const kids = childrenOf(d, p.id);
  const gente = participants(data, 'component', c.id);
  const { style: rstyle } = resolveStyle(data, c, d.id);
  const rcss = styleToCss(rstyle);
  const top = !p.parentId || !!ghost;
  const selected = sel?.kind === 'placement' && sel.id === p.id;
  const cls = 'comp' + (selected ? ' selected' : '') + (hoverCid === c.id ? ' glow' : '') + (linkTarget === p.id ? ' link-target' : '')
    + (ghost ? ' dragging' : '') + (!ghost && dragPid === p.id ? ' drag-src' : '') + (kids.length ? ' group' : '') + (p.parentId && !ghost ? ' child' : '')
    + (rcss.className ? ' ' + rcss.className : '');
  const style: React.CSSProperties = { ['--c' as string]: t?.color ?? '#94a3b8', ...rcss.style };
  if (ghost) { style.left = ghost.x; style.top = ghost.y; }
  else if (top) { style.left = p.x; style.top = p.y; style.maxWidth = `calc(100% - ${Math.max(0, p.x) + 4}px)`; }
  return (
    <div className={cls} data-pid={ghost ? undefined : p.id} data-cid={c.id} style={style}
      onMouseEnter={ghost ? undefined : e => { e.stopPropagation(); onHover(c.id, p.id); }}
      onMouseLeave={ghost ? undefined : () => onHover(null)}
      title={c.description || c.name}>
      <div className="comp-head">
        <span className="icon">{rstyle.icon || t?.icon || '▫️'}</span>
        <span className="txt">
          <span className="label">{c.name}</span>
          {(c.fields.method || c.fields.path) ? <span className="sub">{[c.fields.method, c.fields.path].filter(Boolean).join(' ')}</span> : null}
        </span>
        {rstyle.badge && <span className="r-badge" style={{ background: rstyle.badge }} title={rstyle.badgeText || undefined}>{rstyle.badgeText ?? ''}</span>}
        {gente.length > 0 && (
          <span className="chip-people" title={gente.map(x => `${x.person.name} · ${x.assignment.role}`).join('\n')}>
            {gente.slice(0, 3).map(({ person, assignment }) => <Avatar key={assignment.id} p={person} size={16} />)}
            {gente.length > 3 && <span className="more">+{gente.length - 3}</span>}
          </span>
        )}
        {clones > 1 && <span className="clone-badge" title={`${clones} instancias en este diagrama`}>×{clones}</span>}
        <span className="port" title="Arrastra hasta otro componente para relacionarlos" />
      </div>
      {kids.length > 0 && (
        <div className="children">
          {kids.map(k => <Chip key={k.id} {...props} p={k} ghost={undefined} />)}
        </div>
      )}
    </div>
  );
}
