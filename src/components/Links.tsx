import type { Relation, Selection } from '../types';
import { curveFrom, layoutAnchors, type Pt, type Rect } from '../lib/geometry';

export interface LinkingState { from: string; start: Pt; cur: Pt; target: string | null }

interface Props {
  rects: Record<string, Rect>;
  size: { w: number; h: number };
  relations: Relation[];
  sel: Selection | null;
  hoverPid: string | null;
  linking: LinkingState | null;
  onSelect(id: string): void;
  onContext?(id: string, e: React.MouseEvent): void;
}

const DASH: Record<Relation['style'], string | undefined> = { solid: undefined, dashed: '9 6', dotted: '2 6' };
const mid = (c: string) => 'm-' + c.replace('#', '');
/** Último tramo de la ruta de un campo, para que quepa sobre la flecha. */
const short = (p?: string) => !p ? '*' : p.split('.').slice(-2).join('.');

export function Links({ rects, size, relations, sel, hoverPid, linking, onSelect, onContext }: Props) {
  const colors = new Set(relations.map(r => r.color));
  const anchors = layoutAnchors(relations, rects);
  return (
    <svg id="links" width={size.w} height={size.h}>
      <defs>
        {[...colors].map(c => (
          <marker key={c} id={mid(c)} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={c} />
          </marker>
        ))}
      </defs>
      {relations.map(r => {
        const an = anchors[r.id];
        if (!an) return null;
        const { d, mid: m } = curveFrom(an.A, an.B);
        const isSel = sel?.kind === 'relation' && sel.id === r.id;
        const hot = hoverPid !== null && (r.from === hoverPid || r.to === hoverPid);
        return (
          <g key={r.id} className={'rel' + (isSel ? ' selected' : '') + (hot ? ' hot' : '')}
            onClick={e => { e.stopPropagation(); onSelect(r.id); }}
            onContextMenu={e => onContext?.(r.id, e)}>
            {/* `fill="none"` como atributo, no sólo en el CSS: al exportar la imagen se clona
                el SVG y una flecha sin relleno explícito saldría como un borrón negro */}
            <path className="hit" d={d} fill="none" />
            <path className="line" d={d} fill="none" stroke={r.color} strokeWidth={r.width}
              strokeDasharray={DASH[r.style]}
              markerEnd={r.dir !== 'none' ? `url(#${mid(r.color)})` : undefined}
              markerStart={r.dir === 'both' ? `url(#${mid(r.color)})` : undefined} />
            {r.label && <text x={m.x} y={m.y - 4}>{r.label}</text>}
            {(r.fromField || r.toField) && <text className="map" x={m.x} y={m.y + (r.label ? 9 : -4)}>{`${short(r.fromField)} → ${short(r.toField)}`}</text>}
          </g>
        );
      })}
      {linking && (
        <path className="temp" fill="none" d={`M${linking.start.x} ${linking.start.y} L${linking.cur.x} ${linking.cur.y}`} />
      )}
    </svg>
  );
}
