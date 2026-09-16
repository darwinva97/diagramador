/**
 * Indicador de dónde viven los datos y en qué estado están: este navegador, un archivo de
 * tu equipo (modo local) y la cuenta. Al pulsarlo se abre el menú con todas las acciones.
 */
import { useAuth } from '../cloud';
import { actions } from '../actions';
import { openMenu, type MenuItem } from './ContextMenu';
import {
  abrirArchivo, descargarApp, desvincular, enServidor, guardar, guardarComo, recargar, reconectar, setAuto, supportsFS, useLocal,
} from '../local';

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString() : '');

export function StorageChip() {
  const l = useLocal();
  const auth = useAuth();
  const fs = supportsFS();

  const menu = (e: React.MouseEvent) => {
    const items: MenuItem[] = [
      ...(l.handle
        ? [
          { label: '💾 Guardar en el archivo', hint: 'Ctrl+S', disabled: l.saving, onClick: () => void guardar(true) },
          { label: l.auto ? '✓ Autoguardado' : '　Autoguardado', title: 'Escribir el archivo solo, poco después de cada cambio', onClick: () => setAuto(!l.auto) },
          { label: '↻ Recargar desde el archivo', title: 'Descarta lo que hay aquí y vuelve a leer el archivo', onClick: () => void recargar() },
          { label: '⇲ Guardar una copia como…', onClick: () => void guardarComo() },
          { label: '✕ Desvincular el archivo', title: 'Deja de escribirlo. Lo guardado en este navegador se conserva.', onClick: desvincular },
          { sep: true as const },
        ]
        : fs
          ? [
            { label: '📄 Guardar en un archivo…', title: 'Trabaja sobre un archivo de tu equipo, como en draw.io', onClick: () => void guardarComo() },
            { sep: true as const },
          ]
          : []),
      ...(fs ? [{ label: '📂 Abrir un archivo…', hint: 'Ctrl+O', onClick: () => void abrirArchivo() }] : []),
      { label: '⤓ Importar y fusionar JSON…', hint: fs ? 'Ctrl+Shift+O' : 'Ctrl+O', onClick: () => void actions.importJson() },
      { label: '⤒ Descargar copia de todo', hint: 'Ctrl+Shift+E', onClick: actions.exportAll },
      ...(enServidor()
        ? [{ label: '⬇ Descargar Drawer como archivo', title: 'Un único .html que funciona sin servidor ni conexión', onClick: () => void descargarApp() }]
        : []),
    ];
    openMenu(e, items, l.handle ? l.name : 'Dónde se guarda');
  };

  // estado del archivo vinculado
  const estado = l.saving ? '⟳' : l.error ? '⚠' : l.blocked ? '🔒' : l.dirty ? '●' : '✓';
  const titulo = l.handle
    ? (l.blocked ? `Falta permiso para escribir en «${l.name}». Pulsa para reconectar.`
      : l.error ? `Error al guardar: ${l.error}`
        : l.dirty ? `Cambios sin escribir en «${l.name}»${l.auto ? ' (se guardará solo)' : ' · Ctrl+S'}`
          : `Guardado en «${l.name}»${l.lastSaved ? ` a las ${hora(l.lastSaved)}` : ''}`)
    : fs
      ? 'Los datos se guardan en este navegador y funcionan sin conexión. Pulsa para trabajar sobre un archivo de tu equipo.'
      : 'Los datos se guardan en este navegador y funcionan sin conexión. Este navegador no sabe escribir archivos del equipo: usa exportar e importar.';

  return (
    <>
      {!auth.online && (
        <span className="chip-state offline" title="Sin conexión: puedes seguir editando. Los cambios se guardan aquí y se sincronizan al volver la red.">
          ⚡ Sin conexión{auth.status === 'auth' && auth.pending > 0 ? ` · ${auth.pending}` : ''}
        </span>
      )}
      <button
        className={'chip-state store' + (l.handle ? ' linked' : '') + (l.dirty || l.blocked || l.error ? ' pend' : '')}
        title={titulo}
        onClick={e => (l.blocked ? void reconectar() : menu(e))}
        onContextMenu={menu}>
        {l.handle ? `📄 ${l.name} ${estado}` : '💾 Este navegador'}
      </button>
    </>
  );
}
