import { useEffect } from 'react';
import { useHelp } from '../store';

const MOD = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl';
const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: 'Tablero', items: [
    ['Clic en una celda', 'Activa la celda (destino de pegar y de nuevos componentes)'],
    [`${MOD}+C / ${MOD}+X`, 'Copiar / cortar la instancia o el componente seleccionado'],
    [`${MOD}+V`, 'Pegar en la celda activa (o junto a la instancia seleccionada)'],
    [`${MOD}+Shift+V`, 'Pegar como copia independiente (pega y desvincula de una vez)'],
    [`${MOD}+D`, 'Duplicar la instancia seleccionada en su celda'],
    [`${MOD}+Shift+D`, 'Desvincular: la instancia pasa a una copia independiente del componente'],
    [`${MOD}+Enter`, 'Nuevo componente en la celda activa'],
    ['Flechas · Shift+flechas', 'Mover la instancia 8 px · 1 px'],
    ['Supr / Retroceso', 'Borrar la instancia o relación seleccionada'],
    ['F2', 'Editar el nombre de lo seleccionado (en el inspector)'],
    ['Doble clic', 'Abrir el inspector sobre ese componente'],
    ['Clic derecho', 'Menú contextual del componente, celda, capa, etapa o flecha'],
    [`${MOD}+arrastrar`, 'Clonar la instancia al soltarla'],
    ['Arrastrar desde ●', 'Crear una relación hasta otro componente'],
    ['Esc', 'Quitar selección · cerrar ayuda / cuenta / zen'],
  ] },
  { title: 'Edición', items: [
    [`${MOD}+Z`, 'Deshacer'],
    [`${MOD}+Shift+Z · ${MOD}+Y`, 'Rehacer'],
    [`${MOD}+O`, 'Importar JSON'],
    [`${MOD}+E · ${MOD}+Shift+E`, 'Exportar el diagrama actual · exportar todo'],
    ['Alt+N', 'Nuevo diagrama'],
  ] },
  { title: 'Paneles y vista', items: [
    [`${MOD}+B · ${MOD}+J`, 'Mostrar/ocultar inspector · librería'],
    [`${MOD}+\\`, 'Mostrar/ocultar ambos paneles'],
    [`${MOD}+K`, 'Buscar en la librería'],
    ['Alt+1 · Alt+2', 'Pestaña Componentes · Tipos de la librería'],
    ['Clic en el título de una librería', 'Plegar / desplegar esa librería'],
    [`${MOD}+Shift+F`, 'Modo zen (sólo el tablero)'],
    ['?', 'Esta ayuda'],
  ] },
];

export function Shortcuts() {
  const open = useHelp(h => h.open);
  const close = () => useHelp.setState({ open: false });
  useEffect(() => { document.body.classList.toggle('modal-open', open); }, [open]);
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal" role="dialog" aria-label="Atajos de teclado" onClick={e => e.stopPropagation()}>
        <div className="row between"><h2>Atajos de teclado</h2><button className="btn" onClick={close} title="Cerrar (Esc)">✕</button></div>
        <div className="shortcuts">
          {GROUPS.map(g => (
            <section key={g.title}>
              <h4>{g.title}</h4>
              <table><tbody>{g.items.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
