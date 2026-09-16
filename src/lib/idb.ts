/**
 * Almacén clave→valor mínimo sobre IndexedDB.
 *
 * Hace falta para dos cosas que no caben en localStorage: los identificadores de archivo
 * del sistema (`FileSystemFileHandle`, que sólo se pueden guardar con clonado estructurado)
 * y la instantánea de sincronización, que duplicaría el cupo de localStorage.
 *
 * Si IndexedDB no está disponible (ventana privada, permisos), todo devuelve vacío en vez
 * de fallar: se pierde la comodidad, no los datos.
 */
const DB = 'drawer';
const STORE = 'kv';

let abierta: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  abierta ??= new Promise<IDBDatabase>((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return abierta;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(d => new Promise<T>((res, rej) => {
    const r = fn(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => res(r.result as T);
    r.onerror = () => rej(r.error);
  }));
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try { return await tx<T | undefined>('readonly', s => s.get(key)); } catch { return undefined; }
}
export async function idbSet(key: string, value: unknown): Promise<boolean> {
  try { await tx('readwrite', s => s.put(value, key)); return true; } catch { return false; }
}
export async function idbDel(key: string): Promise<void> {
  try { await tx('readwrite', s => s.delete(key)); } catch { /* da igual */ }
}
