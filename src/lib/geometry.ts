export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }
type Side = 'l' | 'r' | 't' | 'b';

const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Punto en el borde de `a` que mira hacia `b`. */
function anchor(a: Rect, b: Rect): Pt & { side: Side } {
  const ca = center(a), cb = center(b);
  const dx = cb.x - ca.x, dy = cb.y - ca.y;
  if (Math.abs(dx) * a.h > Math.abs(dy) * a.w) {
    return dx > 0 ? { x: a.x + a.w + 2, y: ca.y, side: 'r' } : { x: a.x - 2, y: ca.y, side: 'l' };
  }
  return dy > 0 ? { x: ca.x, y: a.y + a.h + 2, side: 'b' } : { x: ca.x, y: a.y - 2, side: 't' };
}

function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

export interface Anchor extends Pt { side: Side }
export const anchorOf = (a: Rect, b: Rect): Anchor => anchor(a, b);

/** Desplaza un anclaje a lo largo de su borde (para repartir varias flechas en el mismo lado). */
export function shiftAnchor(p: Anchor, offset: number): Anchor {
  return p.side === 'l' || p.side === 'r' ? { ...p, y: p.y + offset } : { ...p, x: p.x + offset };
}

export function curveFrom(A: Anchor, B: Anchor): { d: string; mid: Pt } {
  const dist = Math.hypot(B.x - A.x, B.y - A.y);
  const k = Math.max(24, Math.min(140, dist * 0.4));
  const v = (s: Side): Pt => s === 'r' ? { x: k, y: 0 } : s === 'l' ? { x: -k, y: 0 } : s === 'b' ? { x: 0, y: k } : { x: 0, y: -k };
  const va = v(A.side), vb = v(B.side);
  const c1 = { x: A.x + va.x, y: A.y + va.y }, c2 = { x: B.x + vb.x, y: B.y + vb.y };
  const mid = bez(A, c1, c2, B, 0.5);
  const f = (n: number) => Math.round(n * 10) / 10;
  return { d: `M${f(A.x)} ${f(A.y)} C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(B.x)} ${f(B.y)}`, mid };
}

export function curve(a: Rect, b: Rect): { d: string; mid: Pt } {
  return curveFrom(anchor(a, b), anchor(b, a));
}

/**
 * Calcula anclajes para todas las relaciones repartiendo las que comparten
 * el mismo lado de un mismo componente, para que no se solapen.
 */
export function layoutAnchors(rels: { id: string; from: string; to: string }[], rects: Record<string, Rect>): Record<string, { A: Anchor; B: Anchor }> {
  const out: Record<string, { A: Anchor; B: Anchor }> = {};
  const groups = new Map<string, { relId: string; end: 'A' | 'B'; other: Pt }[]>();
  for (const r of rels) {
    const a = rects[r.from], b = rects[r.to]; if (!a || !b) continue;
    const A = anchor(a, b), B = anchor(b, a);
    out[r.id] = { A, B };
    const push = (pid: string, side: Side, end: 'A' | 'B', other: Pt) => {
      const k = pid + '|' + side; if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push({ relId: r.id, end, other });
    };
    push(r.from, A.side, 'A', center(b)); push(r.to, B.side, 'B', center(a));
  }
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const pid = k.split('|')[0]; const side = k.split('|')[1] as Side; const rect = rects[pid];
    const horizontal = side === 'l' || side === 'r'; // borde vertical -> repartir en y
    // ordenar por la posición del otro extremo para minimizar cruces
    list.sort((p, q) => horizontal ? p.other.y - q.other.y : p.other.x - q.other.x);
    const extent = horizontal ? rect.h : rect.w;
    const step = Math.min(16, (extent - 8) / list.length);
    list.forEach((it, i) => {
      const off = (i - (list.length - 1) / 2) * step;
      const e = out[it.relId]; e[it.end] = shiftAnchor(e[it.end], off);
    });
  }
  return out;
}

export function rectsEqual(a: Record<string, Rect>, b: Record<string, Rect>): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    const x = a[k], y = b[k];
    if (!y || x.x !== y.x || x.y !== y.y || x.w !== y.w || x.h !== y.h) return false;
  }
  return true;
}
