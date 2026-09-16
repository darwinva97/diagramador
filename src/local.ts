/**
 * Modo local: el espacio de trabajo en un archivo de tu equipo.
 *
 * Drawer siempre guarda en este navegador (localStorage) y funciona sin conexión. Además,
 * aquí se puede **vincular un archivo** del disco, como el modo "Device" de draw.io: a partir
 * de ese momento cada cambio se escribe en él (autoguardado, o a mano con Ctrl+S) y el archivo
 * es tuyo: lo copias, lo pones en tu Drive, lo metes en un repositorio o se lo pasas a alguien.
 *
 * El identificador del archivo se recuerda en IndexedDB, así que al volver a abrir Drawer se
 * reanuda donde estabas. El navegador puede pedir permiso otra vez: eso exige un gesto del
 * usuario, así que en ese caso se queda "bloqueado" y la barra ofrece reconectar.
 *
 * Sin File System Access (Firefox, Safari) queda el camino de siempre: exportar e importar.
 */
import { create } from 'zustand';
import { useStore } from './store';
import { curDiagram, normalize, slugify } from './lib/model';
import { idbDel, idbGet, idbSet } from './lib/idb';
import type { ExportFile } from './lib/io';
import type { AppData } from './types';

// ---------------------------------------------------------------- tipos del navegador
// El File System Access API todavía no está en las definiciones estándar de TypeScript.
type PermMode = { mode: 'read' | 'readwrite' };
type PermState = 'granted' | 'denied' | 'prompt';
export interface Handle extends FileSystemFileHandle {
  queryPermission?(o?: PermMode): Promise<PermState>;
  requestPermission?(o?: PermMode): Promise<PermState>;
}
interface PickerOpts {
  suggestedName?: string;
  multiple?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
}
declare global {
  interface Window {
    showOpenFilePicker?(o?: PickerOpts): Promise<Handle[]>;
    showSaveFilePicker?(o?: PickerOpts): Promise<Handle>;
    launchQueue?: { setConsumer(cb: (p: { files?: Handle[] }) => void): void };
  }
}

/** ¿Este navegador sabe escribir en archivos del equipo? (Chrome y Edge sí; Firefox y Safari no) */
export const supportsFS = () =>
  typeof window !== 'undefined' && !!window.showSaveFilePicker && window.isSecureContext;

const TIPOS = [{ description: 'Espacio de trabajo de Drawer', accept: { 'application/json': ['.drawer', '.json'] } }];
const KEY = 'archivo';          // IndexedDB: identificador del archivo vinculado
const AUTO = 'drawer.autosave'; // localStorage: autoguardado sí/no
const ESPERA = 900;             // ms de reposo antes de escribir

export interface LocalState {
  /** Archivo vinculado, si lo hay. */
  handle: Handle | null;
  name: string;
  /** Hay archivo pero el navegador aún no ha concedido permiso en esta sesión. */
  blocked: boolean;
  auto: boolean;
  dirty: boolean;
  saving: boolean;
  lastSaved: string | null;
  error: string | null;
}

export const useLocal = create<LocalState>(() => ({
  handle: null, name: '', blocked: false, auto: true, dirty: false, saving: false, lastSaved: null, error: null,
}));

/** Firma del contenido que hay ahora mismo en el archivo: evita reescribirlo sin motivo. */
let ultimo: string | null = null;

// ---------------------------------------------------------------- contenido del archivo
/**
 * Firma canónica de unos datos. Deja fuera la fecha de exportación, que cambia en cada
 * escritura y haría que memoria y archivo nunca parecieran iguales.
 */
const firma = (d: AppData) => JSON.stringify({
  libraries: d.libraries, diagrams: d.diagrams, people: d.people, rules: d.rules, currentDiagramId: d.currentDiagramId,
});

/** El archivo lleva lo mismo que "Exportar todo", así que sirve también para importar. */
function fileText(): string {
  const d = useStore.getState().data;
  const f: ExportFile = {
    app: 'diagramador', version: 1, exportedAt: new Date().toISOString(),
    libraries: d.libraries, diagrams: d.diagrams, people: d.people, rules: d.rules,
    currentDiagramId: d.currentDiagramId,
  };
  return JSON.stringify(f, null, 2);
}

/** Datos de un archivo ya leído, normalizados y listos para sustituir el espacio de trabajo. */
function parse(txt: string): AppData {
  const raw = JSON.parse(txt) as Partial<ExportFile> & { diagram?: unknown };
  if (!raw || typeof raw !== 'object' || (!Array.isArray(raw.libraries) && !Array.isArray(raw.diagrams)))
    throw new Error('El archivo no parece un espacio de trabajo de Drawer.');
  const inc = normalize({
    libraries: raw.libraries ?? [], diagrams: raw.diagrams ?? [],
    people: raw.people ?? [], rules: raw.rules ?? [],
  });
  const pedido = raw.currentDiagramId;
  inc.currentDiagramId = pedido && inc.diagrams.some(d => d.id === pedido) ? pedido : inc.diagrams[0]?.id ?? null;
  return inc;
}

// ---------------------------------------------------------------- permisos y vínculo
async function permitir(h: Handle, pedir: boolean): Promise<boolean> {
  if (!h.queryPermission) return true; // navegador sin permisos por archivo
  if (await h.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
  if (!pedir || !h.requestPermission) return false;
  return await h.requestPermission({ mode: 'readwrite' }) === 'granted';
}

/** Deja el archivo como destino de los cambios y arranca el autoguardado. */
export async function vincular(h: Handle) {
  await idbSet(KEY, h);
  useLocal.setState({ handle: h, name: h.name, blocked: false, error: null });
  arrancar();
}

/** Deja de usar el archivo. Lo guardado en este navegador se conserva tal cual. */
export function desvincular() {
  parar();
  void idbDel(KEY);
  ultimo = null;
  useLocal.setState({ handle: null, name: '', blocked: false, dirty: false, saving: false, lastSaved: null, error: null });
}

// ---------------------------------------------------------------- guardar
/** Escribe el espacio de trabajo en el archivo vinculado. `forzar` = petición explícita (Ctrl+S). */
export async function guardar(forzar = false): Promise<boolean> {
  const { handle, saving } = useLocal.getState();
  if (!handle || saving) return false;
  if (!await permitir(handle, forzar)) {
    useLocal.setState({ blocked: true, error: forzar ? 'El navegador no dio permiso para escribir en el archivo.' : null });
    return false;
  }
  const marca = firma(useStore.getState().data);
  if (!forzar && marca === ultimo) { useLocal.setState({ dirty: false }); return true; }
  useLocal.setState({ saving: true, blocked: false });
  try {
    const w = await handle.createWritable();
    await w.write(fileText());
    await w.close();
    ultimo = marca;
    useLocal.setState({ saving: false, dirty: false, lastSaved: new Date().toISOString(), error: null });
    return true;
  } catch (e) {
    useLocal.setState({ saving: false, error: (e as Error).message });
    return false;
  }
}

/** Elige un archivo nuevo, escribe ahí el espacio de trabajo y lo deja vinculado. */
export async function guardarComo(): Promise<boolean> {
  if (!window.showSaveFilePicker) return false;
  const nombre = curDiagram(useStore.getState().data)?.name ?? 'drawer';
  try {
    const h = await window.showSaveFilePicker({ suggestedName: `${slugify(nombre)}.drawer`, types: TIPOS });
    await vincular(h);
    return await guardar(true);
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return false; // el usuario canceló
    useLocal.setState({ error: (e as Error).message });
    return false;
  }
}

// ---------------------------------------------------------------- abrir
/** Carga el contenido de un archivo en el espacio de trabajo (se puede deshacer con Ctrl+Z). */
async function cargar(h: Handle, preguntar: boolean): Promise<boolean> {
  const txt = await (await h.getFile()).text();
  const inc = parse(txt);
  const actual = useStore.getState().data;
  const hayDatos = actual.diagrams.length > 0 || actual.libraries.some(l => l.components.length > 0);
  if (preguntar && hayDatos && !confirm(
    `Se abrirá «${h.name}» y sustituirá lo que tienes ahora en este navegador `
    + `(${actual.diagrams.length} diagrama(s)).\n\nPodrás deshacerlo con Ctrl+Z. ¿Continuar?`)) return false;
  useStore.getState().mutate(d => { Object.assign(d, inc); });
  useStore.setState({ sel: null, cell: null });
  ultimo = firma(inc);
  await vincular(h);
  useLocal.setState({ dirty: false, lastSaved: new Date().toISOString() });
  return true;
}

/** Abrir un archivo del equipo y trabajar sobre él. */
export async function abrirArchivo(): Promise<boolean> {
  if (!window.showOpenFilePicker) return false;
  try {
    const [h] = await window.showOpenFilePicker({ types: TIPOS, multiple: false });
    return h ? await cargar(h, true) : false;
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return false;
    useLocal.setState({ error: (e as Error).message });
    return false;
  }
}

/** Vuelve a leer el archivo vinculado y descarta lo que haya en memoria. */
export async function recargar(): Promise<boolean> {
  const h = useLocal.getState().handle;
  if (!h || !await permitir(h, true)) return false;
  try { return await cargar(h, true); }
  catch (e) { useLocal.setState({ error: (e as Error).message }); return false; }
}

/**
 * Reanuda el vínculo tras recargar la página. Lo normal es que el archivo y el navegador
 * tengan lo mismo (el autoguardado los mantiene a la par); si no, se pregunta, porque
 * elegir por nuestra cuenta significaría perder el trabajo de alguno de los dos lados.
 */
async function reanudar(h: Handle): Promise<void> {
  try {
    const marca = firma(parse(await (await h.getFile()).text()));
    if (marca === firma(useStore.getState().data)) {
      ultimo = marca;
      await vincular(h);
      useLocal.setState({ dirty: false });
      return;
    }
    const cargarlo = confirm(
      `«${h.name}» tiene un contenido distinto al de este navegador.\n\n`
      + 'Aceptar: cargar el archivo (lo de aquí se recupera con Ctrl+Z).\n'
      + 'Cancelar: conservar lo de este navegador (se escribirá en el archivo al siguiente cambio).');
    if (cargarlo) await cargar(h, false);
    else { ultimo = null; await vincular(h); useLocal.setState({ dirty: true }); }
  } catch (e) {
    useLocal.setState({ handle: h, name: h.name, blocked: true, error: (e as Error).message });
  }
}

/** Pide permiso (hace falta un gesto del usuario) y reanuda el archivo recordado. */
export async function reconectar(): Promise<void> {
  const h = useLocal.getState().handle;
  if (!h) return;
  if (!await permitir(h, true)) {
    useLocal.setState({ blocked: true, error: 'El navegador no dio permiso para el archivo.' });
    return;
  }
  await reanudar(h);
}

// ---------------------------------------------------------------- la app en un archivo
/** ¿Estamos ya dentro de la copia suelta? (abierta con file://, sin servidor) */
export const enServidor = () => location.protocol.startsWith('http');

/**
 * Descarga Drawer entero en un archivo HTML. Ese archivo se abre con doble clic, sin
 * servidor y sin conexión: la app se compila en una sola pieza, así que no le falta nada.
 * Los datos van entonces al almacenamiento del navegador para `file://`, aparte del de la web.
 */
export async function descargarApp(): Promise<boolean> {
  if (!enServidor()) return false;
  try {
    const res = await fetch(location.origin + '/', { headers: { accept: 'text/html' } });
    const html = await res.text();
    if (!/<div id="root">/.test(html)) throw new Error('No se pudo leer la aplicación.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = 'drawer.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  } catch (e) {
    useLocal.setState({ error: (e as Error).message });
    return false;
  }
}

// ---------------------------------------------------------------- autoguardado
let unsub: (() => void) | null = null;
let timer: number | null = null;

function antesDeSalir(e: BeforeUnloadEvent) {
  if (useLocal.getState().dirty) { e.preventDefault(); e.returnValue = ''; }
}

function arrancar() {
  parar();
  unsub = useStore.subscribe((s, prev) => {
    if (s.data === prev.data) return;
    if (firma(s.data) === ultimo) { useLocal.setState({ dirty: false }); return; }
    useLocal.setState({ dirty: true });
    if (!useLocal.getState().auto) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => { timer = null; void guardar(); }, ESPERA);
  });
  window.addEventListener('beforeunload', antesDeSalir);
}

function parar() {
  unsub?.(); unsub = null;
  if (timer) { window.clearTimeout(timer); timer = null; }
  window.removeEventListener('beforeunload', antesDeSalir);
}

export function setAuto(auto: boolean) {
  localStorage.setItem(AUTO, auto ? '1' : '0');
  useLocal.setState({ auto });
  if (auto && useLocal.getState().dirty) void guardar();
}

// ---------------------------------------------------------------- arranque
/** Al abrir la app: recuperar el archivo recordado y atender los archivos que abra el sistema. */
export async function initLocal(): Promise<void> {
  useLocal.setState({ auto: localStorage.getItem(AUTO) !== '0' });
  if (!supportsFS()) return;

  // doble clic en un .drawer con Drawer instalado como aplicación
  window.launchQueue?.setConsumer(p => {
    const h = p.files?.[0];
    if (h) void cargar(h, true).catch(e => useLocal.setState({ error: (e as Error).message }));
  });

  const h = await idbGet<Handle>(KEY);
  if (!h) return;
  useLocal.setState({ handle: h, name: h.name });
  if (await permitir(h, false)) await reanudar(h);
  else useLocal.setState({ blocked: true });
}
