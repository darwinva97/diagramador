/**
 * Cuenta y sincronización con la plataforma (API REST del Worker).
 * - Sesión por cookie. Al iniciar sesión, la cuenta es la fuente de verdad: se descargan
 *   librerías y diagramas y, desde entonces, cada cambio local se sube (con debounce).
 * - Si la cuenta está vacía y hay datos locales, se suben los locales.
 */
import { create } from 'zustand';
import { useStore } from './store';
import { normalize } from './lib/model';
import type { AppData, Diagram, Library, Person, StyleRule } from './types';

export interface CloudUser { id: string; email: string; createdAt: string; settings: Record<string, unknown> }
export interface ApiKeyInfo { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }
export interface NewApiKey extends ApiKeyInfo { key: string }

interface AuthState {
  user: CloudUser | null;
  status: 'unknown' | 'anon' | 'auth';
  syncing: boolean;
  pending: number;       // cambios locales aún no subidos
  lastSync: string | null;
  error: string | null;
}
export const useAuth = create<AuthState>(() => ({ user: null, status: 'unknown', syncing: false, pending: 0, lastSync: null, error: null }));

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
    useAuth.setState({ user, status: 'auth', error: null });
    return user;
  } catch { useAuth.setState({ user: null, status: 'anon' }); return null; }
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
  useAuth.setState({ user: null, status: 'anon', lastSync: null, pending: 0 });
}
export const changePassword = (current: string, next: string) => api('/auth/password', { method: 'PUT', json: { current, next } });
export async function deleteAccount() { stopSync(); await api('/auth/account', { method: 'DELETE' }); useAuth.setState({ user: null, status: 'anon' }); }

// ------------------------------------------------------------------ API keys
export const listKeys = () => api<{ apiKeys: ApiKeyInfo[] }>('/api-keys').then(r => r.apiKeys);
export const createKey = (name: string) => api<NewApiKey>('/api-keys', { method: 'POST', json: { name } });
export const deleteKey = (id: string) => api('/api-keys/' + id, { method: 'DELETE' });

// ------------------------------------------------------------------ sincronización
type Kind = 'library' | 'diagram' | 'person' | 'rule';
/** Ruta REST de cada tipo de documento. */
const PATH: Record<Kind, string> = { library: 'libraries', diagram: 'diagrams', person: 'people', rule: 'rules' };
let snapshot = new Map<string, string>(); // `${kind}:${id}` -> JSON tal como está en la nube
let unsub: (() => void) | null = null;
let timer: number | null = null;

const key = (k: Kind, id: string) => `${k}:${id}`;
const docsOf = (d: AppData): { k: Kind; doc: Library | Diagram | Person | StyleRule }[] => [
  ...d.libraries.map(l => ({ k: 'library' as Kind, doc: l })),
  ...d.diagrams.map(g => ({ k: 'diagram' as Kind, doc: g })),
  ...d.people.map(p => ({ k: 'person' as Kind, doc: p })),
  ...d.rules.map(r => ({ k: 'rule' as Kind, doc: r })),
];
const strip = (doc: object) => { const { updatedAt: _u, ...rest } = doc as { updatedAt?: string }; return JSON.stringify(rest); };

function takeSnapshot(d: AppData) {
  snapshot = new Map(docsOf(d).map(({ k, doc }) => [key(k, doc.id), strip(doc)]));
}

/** Descarga todo de la cuenta y reemplaza los datos locales. */
export async function pullAll() {
  const r = await api<{ libraries: Library[]; diagrams: Diagram[]; people?: Person[]; rules?: StyleRule[] }>('/export');
  const cur = useStore.getState().data;
  const data = normalize({ libraries: r.libraries, diagrams: r.diagrams, people: r.people ?? [], rules: r.rules ?? [], currentDiagramId: r.diagrams.some(g => g.id === cur.currentDiagramId) ? cur.currentDiagramId : r.diagrams[0]?.id ?? null });
  takeSnapshot(data);
  useStore.setState({ data, sel: null });
  useAuth.setState({ lastSync: new Date().toISOString(), pending: 0 });
}
/** Sube todos los datos locales a la cuenta (upsert por id). */
export async function pushAll() {
  const d = useStore.getState().data;
  await api('/import', { method: 'POST', json: { libraries: d.libraries, diagrams: d.diagrams, people: d.people, rules: d.rules } });
  takeSnapshot(d);
  useAuth.setState({ lastSync: new Date().toISOString(), pending: 0 });
}

async function flush() {
  timer = null;
  if (useAuth.getState().status !== 'auth') return;
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
    useAuth.setState({ syncing: false, pending: 0, lastSync: new Date().toISOString(), error: null });
  } catch (e) {
    useAuth.setState({ syncing: false, error: (e as Error).message });
    timer = window.setTimeout(flush, 5000); // reintentar
  }
}
function schedule() {
  const d = useStore.getState().data;
  const changed = docsOf(d).filter(({ k, doc }) => snapshot.get(key(k, doc.id)) !== strip(doc)).length
    + [...snapshot.keys()].filter(k => !docsOf(d).some(({ k: kk, doc }) => key(kk, doc.id) === k)).length;
  useAuth.setState({ pending: changed });
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
  const cloud = await api<{ libraries: Library[]; diagrams: Diagram[]; people?: Person[]; rules?: StyleRule[] }>('/export');
  const local = useStore.getState().data;
  const cloudEmpty = cloud.libraries.length === 0 && cloud.diagrams.length === 0 && (cloud.people?.length ?? 0) === 0 && (cloud.rules?.length ?? 0) === 0;
  if (cloudEmpty && (local.libraries.length || local.diagrams.length || local.people.length || local.rules.length)) {
    await pushAll(); // primera vez: los datos locales pasan a la cuenta
  } else {
    await pullAll();
  }
  startSync();
}

/** Al arrancar la app: si hay sesión, cargar la cuenta y sincronizar. */
export async function initCloud() {
  const user = await checkSession();
  if (!user) return;
  try { await pullAll(); startSync(); } catch (e) { useAuth.setState({ error: (e as Error).message }); }
}
