/**
 * Menú contextual (clic derecho). Cada zona de la interfaz construye su lista de acciones
 * con `openMenu(evento, items)`; aquí sólo se dibuja, se coloca dentro de la ventana y se cierra.
 */
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

export type MenuItem =
  | { sep: true }
  | { label: string; hint?: string; danger?: boolean; disabled?: boolean; onClick(): void };

interface MenuState { x: number; y: number; title?: string; items: MenuItem[] }
const useMenu = create<{ menu: MenuState | null }>(() => ({ menu: null }));

/** Abre el menú en la posición del puntero con las acciones indicadas (ignora la lista vacía). */
export function openMenu(e: React.MouseEvent | MouseEvent, items: MenuItem[], title?: string) {
  if (!items.length) return;
  e.preventDefault(); e.stopPropagation();
  useMenu.setState({ menu: { x: e.clientX, y: e.clientY, items, title } });
}
export const closeMenu = () => useMenu.setState({ menu: null });

export function ContextMenu() {
  const menu = useMenu(s => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // colocar dentro de la ventana (si no cabe abajo o a la derecha, se voltea)
  useEffect(() => {
    setPos(null);
    if (!menu) return;
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); closeMenu(); } };
    const onDown = () => closeMenu();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', onDown);
    window.addEventListener('resize', onDown);
    document.addEventListener('scroll', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', onDown);
      window.removeEventListener('resize', onDown);
      document.removeEventListener('scroll', onDown, true);
    };
  }, [menu]);

  if (!menu) return null;
  return (
    <div ref={ref} className="ctx-menu" role="menu"
      style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? 'visible' : 'hidden' }}
      onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
      {menu.title && <div className="ctx-title">{menu.title}</div>}
      {menu.items.map((it, i) => 'sep' in it
        ? <div key={i} className="ctx-sep" />
        : (
          <button key={i} role="menuitem" className={'ctx-item' + (it.danger ? ' danger' : '')} disabled={it.disabled}
            onClick={() => { closeMenu(); it.onClick(); }}>
            <span>{it.label}</span>{it.hint && <kbd>{it.hint}</kbd>}
          </button>
        ))}
    </div>
  );
}
