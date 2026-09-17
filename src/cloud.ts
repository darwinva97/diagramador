/**
 * Cuenta y sincronización con la plataforma (API REST del Worker).
 * - Sesión por cookie. Al iniciar sesión, la cuenta es la fuente de verdad: se descargan
 *   librerías y diagramas y, desde entonces, cada cambio local se sube (con debounce).
 * - Si la cuenta está vacía y hay datos locales, se suben los locales.
 * - **Sin conexión se sigue trabajando**: la sesión conocida se recuerda, los cambios quedan
 *   pendientes y, al volver la red, se suben *antes* de descargar nada, para no perderlos.
 */
import { create } from 'zustand';
import { useStore } from './store';
import { normalize } from './lib/model';
import { idbDel, idbGet, idbSet } from './lib/idb';
import type { Api, AppData, Diagram, Library, Person, StyleRule } from './types';

export interface CloudUser { id: string; email: string; createdAt: string; settings: Record<string, unknown> }
export interface ApiKeyInfo { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }
export interface NewApiKey extends ApiKeyInfo { key: string }

interface AuthState {
  user: CloudUser | null;
  status: 'unknown' | 'anon' | 'auth';
  /** ¿Se llega a la plataforma? Falso mientras se trabaja sin conexión. */
  online: boolean;
  syncing: boolean;
  pending: number;       // cambios locales aún no subidos
  lastSync: string | null;
  error: string | null;
}
export const useAuth = create<AuthState>(() => ({ user: null, status: 'unknown', online: true, syncing: false, pending: 0, lastSync: null, error: null }));

/** Un fallo de red (sin conexión, servidor inalcanzable) no es lo mismo que un 401. */
const esDeRed = (e: unknown) => e instanceof TypeError || !navigator.onLine;

const USER_KEY = 'drawer.user'; // último usuario conocido, para poder seguir sin conexión
const leerUsuario = (): CloudUser | null => {
  try { const t = localStorage.getItem(USER_KEY); return t ? (JSON.parse(t) as CloudUser) : null; } catch { return null; }
};

export const API_BASE = '/api/v1';
export const apiUrl = (path: string) => `${location.origin}${API_BASE}${path}`;

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new Error((data.error as string) || `Error ${res.status}`);
  return data as T;
}

/** ¿Estamos en un origen con backend? (en file:// o vite dev sin worker no hay API) */
export const platformAvailable = () => location.protocol.startsWith('http');

// ------------------------------------------------------------------ sesión
export async function checkSession(): Promise<CloudUser | null> {
  if (!platformAvailable()) { useAuth.setState({ status: 'anon' }); return null; }
  try {
    const { user } = await api<{ user: CloudUser }>('/auth/me');
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    useAuth.setState({ user, status: 'auth', online: true, error: null });
    return user;
  } catch (e) {
    if (esDeRed(e)) {
      // sin red: se mantiene la sesión que ya conocíamos para poder seguir editando
      const user = leerUsuario();
      useAuth.setState({ user, status: user ? 'auth' : 'anon', online: false });
      return user;
    }
    localStorage.removeItem(USER_KEY);
    useAuth.setState({ user: null, status: 'anon', online: true });
    return null;
  }
}
export async function register(email: string, password: string) {
  const { user } = await api<{ user: CloudUser }>('/auth/register', { method: 'POST', json: { email, password } });
  useAuth.setState({ user, status: 'auth', error: null });
  await afterLogin();
}
export async function login(email: string, password: string) {
  const { user } = await api<{ user: CloudUser }>('/auth/login', { method: 'POST', json: { email, password } });
  useAuth.setState({ user, status: 'auth', error: null });
  await afterLogin();
}
export async function logout() {
  stopSync();
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignorar */ }
  await olvidarSesion();
  useAuth.setState({ user: null, status: 'anon', lastSync: null, pending: 0 });
}
export const changePassword = (current: string, next: string) => api('/auth/password', { method: 'PUT', json: { current, next } });
export async function deleteAccount() {
  stopSync();
  await api('/auth/account', { method: 'DELETE' });
  await olvidarSesion();
  useAuth.setState({ user: null, status: 'anon' });
}

async function olvidarSesion() {
  localStorage.removeItem(USER_KEY);
  await idbDel(SNAP_KEY);
  snapshot = new Map();
  restored = false;
}

// ------------------------------------------------------------------ API keys
export const listKeys = () => api<{ apiKeys: ApiKeyInfo[] }>('/api-keys').then(r => r.apiKeys);
export const createKey = (name: string) => api<NewApiKey>('/api-keys', { method: 'POST', json: { name } });
export const deleteKey = (id: string) => api('/api-keys/' + id, { method: 'DELETE' });

// ------------------------------------------------------------------ sincronización
type Kind = 'library' | 'diagram' | 'person' | 'rule' | 'api';
/** Ruta REST de cada tipo de documento. */
const PATH: Record<Kind, string> = { library: 'libraries', diagram: 'diagrams', person: 'people', rule: 'rules', api: 'apis' };
let snapshot = new Map<string, string>(); // `${kind}:${id}` -> JSON tal como está en la nube
let unsub: (() => void) | null = null;
let timer: number | null = null;

/**
 * La instantánea se guarda en IndexedDB: es lo que permite saber, tras trabajar sin conexión
 * (o sin más, tras cerrar la pestaña), qué cambió de este lado y está aún sin subir.
 * `restored` distingue "no había nada pendiente" de "no sé qué había": sin instantánea previa
 * no se sube nada a ciegas, que sería pisar la cuenta con datos viejos.
 */
const SNAP_KEY = 'sync';
let restored = false;

const guardarSnapshot = () => idbSet(SNAP_KEY, { userId: useAuth.getState().user?.id ?? '', entries: [...snapshot] });

async function restoreSnapshot(userId: string) {
  const s = await idbGet<{ userId: string; entries: [string, string][] }>(SNAP_KEY);
  if (s && s.userId === userId) { snapshot = new Map(s.entries); restored = true; }
  else { snapshot = new Map(); restored = false; }
}

const key = (k: Kind, id: string) => `${k}:${id}`;
const docsOf = (d: AppData): { k: Kind; doc: Library | Diagram | Person | StyleRule | Api }[] => [
  ...d.libraries.map(l => ({ k: 'library' as Kind, doc: l })),
  ...d.diagrams.map(g => ({ k: 'diagram' as Kind, doc: g })),
  ...d.people.map(p => ({ k: 'person' as Kind, doc: p })),
  ...d.rules.map(r => ({ k: 'rule' as Kind, doc: r })),
  ...(d.apis ?? []).map(a => ({ k: 'api' as Kind, doc: a })),
];
const strip = (doc: object) => { const { updatedAt: _u, ...rest } = doc as { updatedAt?: string }; return JSON.stringify(rest); };

function takeSnapshot(d: AppData) {
  snapshot = new Map(docsOf(d).map(({ k, doc }) => [key(k, doc.id), strip(doc)]));
  restored = true;
  void guardarSnapshot();
}

/** Cuántos documentos locales difieren de la instantánea (creados, cambiados o borrados). */
function contarPendientes(): number {
  const d = useStore.getState().data;
  const ahora = new Map(docsOf(d).map(({ k, doc }) => [key(k, doc.id), strip(doc)]));
  let n = 0;
  for (const [k, v] of ahora) if (snapshot.get(k) !== v) n++;
  for (const k of snapshot.keys()) if (!ahora.has(k)) n++;
  return n;
}

/** Descarga todo de la cuenta y reemplaza los datos locales. */
export async function pullAll() {
  const r = await api<{ libraries: Library[]; diagrams: Diagram[]; people?: Person[]; rules?: StyleRule[]; apis?: Api[] }>('/export');
  const cur = useStore.getState().data;
  const data = normalize({ libraries: r.libraries, diagrams: r.diagrams, people: r.people ?? [], rules: r.rules ?? [], apis: r.apis ?? [], currentDiagramId: r.diagrams.some(g => g.id === cur.currentDiagramId) ? cur.currentDiagramId : r.diagrams[0]?.id ?? null });
  takeSnapshot(data);
  useStore.setState({ data, sel: null });
  useAuth.setState({ lastSync: new Date().toISOString(), pending: 0 });
}
/** Sube todos los datos locales a la cuenta (upsert por id). */
export async function pushAll() {
  const d = useStore.getState().data;
  await api('/import', { method: 'POST', json: { libraries: d.libraries, diagrams: d.diagrams, people: d.people, rules: d.rules, apis: d.apis } });
  takeSnapshot(d);
  useAuth.setState({ lastSync: new Date().toISOString(), pending: 0 });
}

async function flush() {
  timer = null;
  if (useAuth.getState().status !== 'auth') return;
  // sin red no se intenta: los cambios se quedan contados y se suben al volver (evento `online`)
  if (!navigator.onLine) { useAuth.setState({ online: false, pending: contarPendientes() }); return; }
  const d = useStore.getState().data;
  const now = new Map(docsOf(d).map(({ k, doc }) => [key(k, doc.id), { k, doc, json: strip(doc) }]));
  const ops: Promise<unknown>[] = [];
  for (const [k, v] of now) if (snapshot.get(k) !== v.json) {
    ops.push(api(`/${PATH[v.k]}/${v.doc.id}`, { method: 'PUT', json: JSON.parse(v.json) }));
  }
  for (const k of snapshot.keys()) if (!now.has(k)) {
    const [kind, id] = k.split(':') as [Kind, string];
    ops.push(api(`/${PATH[kind]}/${id}`, { method: 'DELETE' }).catch(() => undefined));
  }
  if (!ops.length) { useAuth.setState({ pending: 0 }); return; }
  useAuth.setState({ syncing: true, pending: ops.length });
  try {
    await Promise.all(ops);
    snapshot = new Map([...now].map(([k, v]) => [k, v.json]));
    restored = true;
    void guardarSnapshot();
    useAuth.setState({ syncing: false, online: true, pending: 0, lastSync: new Date().toISOString(), error: null });
  } catch (e) {
    const red = esDeRed(e);
    useAuth.setState({ syncing: false, online: !red, error: red ? null : (e as Error).message });
    if (!red) timer = window.setTimeout(flush, 5000); // reintentar (sin red ya avisa el evento `online`)
  }
}
function schedule() {
  useAuth.setState({ pending: contarPendientes() });
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(flush, 1200);
}
export function startSync() {
  stopSync();
  unsub = useStore.subscribe((s, prev) => { if (s.data !== prev.data) schedule(); });
  window.addEventListener('beforeunload', beforeUnload);
}
export function stopSync() {
  unsub?.(); unsub = null;
  if (timer) { window.clearTimeout(timer); timer = null; }
  window.removeEventListener('beforeunload', beforeUnload);
}
function beforeUnload(e: BeforeUnloadEvent) { if (useAuth.getState().pending > 0) { e.preventDefault(); e.returnValue = ''; } }

/** Tras iniciar sesión: decide entre subir lo local o bajar lo de la cuenta. */
export async function afterLogin() {
  const cloud = await api<{ libraries: Library[]; diagrams: Diagram[]; people?: Person[]; rules?: StyleRule[]; apis?: Api[] }>('/export');
  const local = useStore.getState().data;
  const cloudEmpty = cloud.libraries.length === 0 && cloud.diagrams.length === 0 && (cloud.people?.length ?? 0) === 0 && (cloud.rules?.length ?? 0) === 0 && (cloud.apis?.length ?? 0) === 0;
  if (cloudEmpty && (local.libraries.length || local.diagrams.length || local.people.length || local.rules.length || local.apis.length)) {
    await pushAll(); // primera vez: los datos locales pasan a la cuenta
  } else {
    await pullAll();
  }
  startSync();
}

/** Primero se sube lo que quedó pendiente (edición sin conexión) y sólo después se baja la cuenta. */
async function sincronizar() {
  if (restored && contarPendientes() > 0) await flush();
  await pullAll();
}

async function alVolverLaRed() {
  useAuth.setState({ online: true });
  if (useAuth.getState().status !== 'auth') return;
  if (!await checkSession()) return; // la sesión pudo caducar mientras tanto
  try { await sincronizar(); } catch (e) { useAuth.setState({ error: (e as Error).message }); }
}
const alPerderLaRed = () => useAuth.setState({ online: false });

/** Al arrancar la app: si hay sesión, cargar la cuenta y sincronizar. */
export async function initCloud() {
  useAuth.setState({ online: navigator.onLine });
  window.addEventListener('online', () => void alVolverLaRed());
  window.addEventListener('offline', alPerderLaRed);
  const user = await checkSession();
  if (!user) return;
  await restoreSnapshot(user.id);
  startSync(); // desde ya, para que los cambios cuenten como pendientes aunque no haya red
  if (!useAuth.getState().online) { useAuth.setState({ pending: contarPendientes() }); return; }
  try { await sincronizar(); } catch (e) { useAuth.setState({ error: (e as Error).message }); }
}
