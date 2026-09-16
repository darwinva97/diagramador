/**
 * Exportar el diagrama como imagen.
 *
 * El tablero es HTML normal (chips, celdas, cabeceras) con las flechas en un SVG encima, así
 * que la imagen se saca del propio DOM: se clona con sus estilos dentro de un `foreignObject`
 * y se dibuja en un lienzo. Lo que ves es lo que sale.
 *
 * Antes de capturar hay que dejar el tablero "en limpio": zoom al 100 % (si no, la imagen
 * saldría a la resolución de la pantalla y no a la del diagrama), cabeceras sueltas (las fijas
 * se dibujarían flotando donde estuviera el scroll) y sin los mandos que sólo sirven para
 * editar (tiradores, puntos de enlace, botones de añadir y borrar).
 */
import { toBlob, toSvg } from 'html-to-image';
import { create } from 'zustand';
import { useStore } from '../store';
import { curDiagram, slugify, stamp } from './model';

/** Chrome no dibuja lienzos de más de 16 384 px de lado ni de demasiados píxeles en total. */
const LADO_MAX = 16_000;
const PIXELES_MAX = 120_000_000;

export type ImgFormat = 'png' | 'svg';

interface ExportState { busy: boolean; error: string | null; aviso: string | null }
export const useExport = create<ExportState>(() => ({ busy: false, error: null, aviso: null }));

const esperarPintado = () => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())));

/** Deja el tablero listo para la foto y devuelve la función que lo deja como estaba. */
async function prepararTablero(): Promise<() => Promise<void>> {
  const st = useStore.getState();
  const { zoom, pinLayers, pinStages } = st.ui;
  const wrap = document.getElementById('canvasWrap');
  const scroll = { left: wrap?.scrollLeft ?? 0, top: wrap?.scrollTop ?? 0 };
  document.body.classList.add('exporting');
  st.setUI({ zoom: 1, pinLayers: false, pinStages: false });
  await esperarPintado();
  return async () => {
    document.body.classList.remove('exporting');
    useStore.getState().setUI({ zoom, pinLayers, pinStages });
    await esperarPintado();
    if (wrap) { wrap.scrollLeft = scroll.left; wrap.scrollTop = scroll.top; }
  };
}

/** Escala que de verdad cabe en un lienzo, avisando si hay que bajarla. */
function escalaPosible(w: number, h: number, pedida: number): { escala: number; aviso: string | null } {
  let escala = pedida;
  if (w * escala > LADO_MAX || h * escala > LADO_MAX) escala = Math.min(LADO_MAX / w, LADO_MAX / h);
  if (w * h * escala * escala > PIXELES_MAX) escala = Math.sqrt(PIXELES_MAX / (w * h));
  escala = Math.max(1, Math.floor(escala * 10) / 10);
  return { escala, aviso: escala < pedida ? `El diagrama es muy grande: la imagen se ha generado a ×${escala} en vez de ×${pedida}.` : null };
}

function nombreArchivo(ext: string): string {
  const d = curDiagram(useStore.getState().data);
  return `${d ? slugify(d.name) : 'diagrama'}-${stamp()}.${ext}`;
}

function descargar(url: string, nombre: string, revocar: boolean) {
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  a.click();
  if (revocar) setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Imagen del tablero. `escala` 2 = el doble de píxeles que en pantalla al 100 %. */
export async function exportImage(formato: ImgFormat = 'png', escala = 2): Promise<boolean> {
  const board = document.getElementById('board');
  if (!board) { useExport.setState({ error: 'No hay ningún tablero que exportar.' }); return false; }
  useExport.setState({ busy: true, error: null, aviso: null });
  const restaurar = await prepararTablero();
  try {
    const w = board.scrollWidth, h = board.scrollHeight;
    const fondo = getComputedStyle(document.body).backgroundColor || '#ffffff';
    const opciones = { backgroundColor: fondo, width: w, height: h, cacheBust: true };
    if (formato === 'svg') {
      const url = await toSvg(board, opciones);
      descargar(url, nombreArchivo('svg'), false);
    } else {
      const { escala: real, aviso } = escalaPosible(w, h, escala);
      const blob = await toBlob(board, { ...opciones, pixelRatio: real });
      if (!blob) throw new Error('El navegador no pudo generar la imagen.');
      descargar(URL.createObjectURL(blob), nombreArchivo('png'), true);
      useExport.setState({ aviso });
    }
    return true;
  } catch (e) {
    useExport.setState({ error: (e as Error).message });
    return false;
  } finally {
    await restaurar();
    useExport.setState({ busy: false });
  }
}

/** Copia el tablero al portapapeles como PNG, para pegarlo en un chat o un documento. */
export async function copyImage(escala = 2): Promise<boolean> {
  const board = document.getElementById('board');
  if (!board || !navigator.clipboard?.write) {
    useExport.setState({ error: 'Este navegador no deja copiar imágenes al portapapeles.' });
    return false;
  }
  useExport.setState({ busy: true, error: null, aviso: null });
  const restaurar = await prepararTablero();
  try {
    const w = board.scrollWidth, h = board.scrollHeight;
    const { escala: real } = escalaPosible(w, h, escala);
    const blob = await toBlob(board, {
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
      width: w, height: h, pixelRatio: real, cacheBust: true,
    });
    if (!blob) throw new Error('El navegador no pudo generar la imagen.');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    useExport.setState({ aviso: 'Imagen copiada al portapapeles.' });
    return true;
  } catch (e) {
    useExport.setState({ error: (e as Error).message });
    return false;
  } finally {
    await restaurar();
    useExport.setState({ busy: false });
  }
}
