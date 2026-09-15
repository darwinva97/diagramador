/**
 * API REST de Diagramador (Cloudflare Worker + Hono).
 * Autenticación: cookie de sesión (web) o `Authorization: Bearer dgk_...` (API key para agentes).
 * Datos: Durable Object `Store` (SQLite). Los diagramas y librerías se guardan como documentos JSON.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { setCookie, deleteCookie } from 'hono/cookie';
import type { Store } from './store';
import { hashPassword, newApiKey, nowIso, randomId, sha256, signSession, verifyPassword, verifySession } from './auth';
import aliados from '../ejemplos/aliados.json';

export { Store } from './store';

type Env = { STORE: DurableObjectNamespace<Store>; SESSION_SECRET: string; ASSETS: Fetcher };
type User = { id: string; email: string; created_at: string; settings: string };
/** Acceso tipado al Durable Object (el stub RPC pierde los genéricos). */
interface DB {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  batch(stmts: { sql: string; params?: unknown[] }[]): Promise<{ changes: number }>;
}
const wrap = (stub: DurableObjectStub<Store>): DB => ({
  all: (sql, params = []) => stub.all(sql, params) as unknown as Promise<never[]>,
  run: (sql, params = []) => stub.run(sql, params) as unknown as Promise<{ changes: number }>,
  batch: stmts => stub.batch(stmts) as unknown as Promise<{ changes: number }>,
});
type Vars = { user: User; store: DB; via: 'session' | 'apikey' };

const COOKIE = 'dg_session';
const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath('/api/v1');

app.use('*', cors({ origin: o => o ?? '*', credentials: true, allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use('*', async (c, next) => { c.set('store', wrap(c.env.STORE.get(c.env.STORE.idFromName('main')))); await next(); });
app.onError((err, c) => { console.error(err); return c.json({ error: (err as Error).message || 'Error interno' }, 500); });
app.notFound(c => c.json({ error: 'Ruta no encontrada' }, 404));

const bad = (c: { json: (o: unknown, s: 400) => Response }, msg: string) => c.json({ error: msg }, 400);
const publicUser = (u: User) => ({ id: u.id, email: u.email, createdAt: u.created_at, settings: safeJson(u.settings, {}) });
function safeJson<T>(s: string, fallback: T): T { try { return JSON.parse(s) as T; } catch { return fallback; } }
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

// ------------------------------------------------------------------ auth
async function currentUser(c: { req: { header(n: string): string | undefined }; env: Env }, store: DB): Promise<{ user: User; via: Vars['via'] } | null> {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    const key = auth.slice(7).trim();
    const rows = await store.all<{ user_id: string; id: string }>('SELECT user_id, id FROM api_keys WHERE key_hash = ?', [await sha256(key)]);
    if (!rows.length) return null;
    await store.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', [nowIso(), rows[0].id]);
    const users = await store.all<User>('SELECT * FROM users WHERE id = ?', [rows[0].user_id]);
    return users.length ? { user: users[0], via: 'apikey' } : null;
  }
  const cookie = c.req.header('Cookie') ?? '';
  const token = cookie.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const userId = await verifySession(c.env.SESSION_SECRET, token);
  if (!userId) return null;
  const users = await store.all<User>('SELECT * FROM users WHERE id = ?', [userId]);
  return users.length ? { user: users[0], via: 'session' } : null;
}

const requireAuth = app.use('*', async (c, next) => {
  const path = c.req.path;
  if (/\/auth\/(register|login)$/.test(path) || path.endsWith('/health') || path.endsWith('/templates')) return next();
  const r = await currentUser(c, c.get('store'));
  if (!r) return c.json({ error: 'No autenticado. Usa la cookie de sesión o Authorization: Bearer <api key>.' }, 401);
  c.set('user', r.user); c.set('via', r.via);
  await next();
});
void requireAuth;

async function setSession(c: { env: Env; header: (n: string, v: string) => void; req: { url: string } }, userId: string) {
  const token = await signSession(c.env.SESSION_SECRET, userId);
  const secure = new URL(c.req.url).protocol === 'https:';
  // @ts-expect-error hono cookie helper acepta el contexto completo
  setCookie(c, COOKIE, token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 30 * 86400 });
}

app.get('/health', c => c.json({ ok: true, time: nowIso() }));

app.post('/auth/register', async c => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>().catch(() => ({} as { email?: string; password?: string }));
  const em = (email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return bad(c, 'Correo no válido');
  if (!password || password.length < 8) return bad(c, 'La contraseña debe tener al menos 8 caracteres');
  const store = c.get('store');
  if ((await store.all('SELECT id FROM users WHERE email = ?', [em])).length) return c.json({ error: 'Ya existe una cuenta con ese correo' }, 409);
  const { hash, salt } = await hashPassword(password);
  const id = randomId();
  await store.run('INSERT INTO users (id, email, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)', [id, em, hash, salt, nowIso()]);
  await setSession(c, id);
  const u = (await store.all<User>('SELECT * FROM users WHERE id = ?', [id]))[0];
  return c.json({ user: publicUser(u) }, 201);
});

app.post('/auth/login', async c => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>().catch(() => ({} as { email?: string; password?: string }));
  const em = (email ?? '').trim().toLowerCase();
  const store = c.get('store');
  const rows = await store.all<User & { pass_hash: string; salt: string }>('SELECT * FROM users WHERE email = ?', [em]);
  if (!rows.length || !password || !(await verifyPassword(password, rows[0].pass_hash, rows[0].salt))) return c.json({ error: 'Correo o contraseña incorrectos' }, 401);
  await setSession(c, rows[0].id);
  return c.json({ user: publicUser(rows[0]) });
});

app.post('/auth/logout', c => { deleteCookie(c, COOKIE, { path: '/' }); return c.json({ ok: true }); });
app.get('/auth/me', c => c.json({ user: publicUser(c.get('user')), via: c.get('via') }));

app.put('/auth/password', async c => {
  const { current, next } = await c.req.json<{ current?: string; next?: string }>();
  if (!next || next.length < 8) return bad(c, 'La nueva contraseña debe tener al menos 8 caracteres');
  const store = c.get('store'); const u = c.get('user');
  const row = (await store.all<{ pass_hash: string; salt: string }>('SELECT pass_hash, salt FROM users WHERE id = ?', [u.id]))[0];
  if (!current || !(await verifyPassword(current, row.pass_hash, row.salt))) return c.json({ error: 'La contraseña actual no es correcta' }, 401);
  const { hash, salt } = await hashPassword(next);
  await store.run('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?', [hash, salt, u.id]);
  return c.json({ ok: true });
});

app.put('/auth/settings', async c => {
  const settings = await c.req.json<Record<string, unknown>>();
  await c.get('store').run('UPDATE users SET settings = ? WHERE id = ?', [JSON.stringify(settings ?? {}), c.get('user').id]);
  return c.json({ settings });
});

app.delete('/auth/account', async c => {
  const u = c.get('user'); const store = c.get('store');
  await store.batch([
    { sql: 'DELETE FROM docs WHERE user_id = ?', params: [u.id] },
    { sql: 'DELETE FROM api_keys WHERE user_id = ?', params: [u.id] },
    { sql: 'DELETE FROM users WHERE id = ?', params: [u.id] },
  ]);
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ API keys
app.get('/api-keys', async c => {
  const rows = await c.get('store').all<{ id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }>(
    'SELECT id, name, prefix, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC', [c.get('user').id]);
  return c.json({ apiKeys: rows.map(r => ({ id: r.id, name: r.name, prefix: r.prefix, createdAt: r.created_at, lastUsedAt: r.last_used_at })) });
});
app.post('/api-keys', async c => {
  const { name } = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }));
  const key = newApiKey(); const id = randomId(8);
  await c.get('store').run('INSERT INTO api_keys (id, user_id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, c.get('user').id, (name ?? 'API key').slice(0, 80), key.slice(0, 12), await sha256(key), nowIso()]);
  return c.json({ id, name: name ?? 'API key', prefix: key.slice(0, 12), key, note: 'Guarda esta clave: no se volverá a mostrar.' }, 201);
});
app.delete('/api-keys/:id', async c => {
  const r = await c.get('store').run('DELETE FROM api_keys WHERE id = ? AND user_id = ?', [c.req.param('id'), c.get('user').id]);
  return r.changes ? c.json({ ok: true }) : c.json({ error: 'No existe' }, 404);
});

// ------------------------------------------------------------------ documentos (librerías y diagramas)
type Kind = 'library' | 'diagram' | 'person';
type DocRow = { id: string; name: string; data: string; updated_at: string };
interface Library { id: string; name: string; types: Record<string, unknown>[]; components: Record<string, unknown>[] }
interface Person { id: string; name: string; email?: string; title?: string; team?: string; color?: string; notes?: string; assignments: Record<string, unknown>[] }
const ASSIGN_KINDS = ['component', 'diagram', 'layer', 'stage', 'type'];
const normPerson = (p: Partial<Person>, id?: string): Person => ({
  ...p,
  id: id ?? p.id ?? uid(),
  name: String(p.name ?? 'Sin nombre'),
  assignments: (p.assignments ?? [])
    .filter(a => ASSIGN_KINDS.includes(a.kind as string) && typeof a.targetId === 'string')
    .map(a => ({ ...a, id: (a.id as string) ?? uid(), role: String(a.role ?? 'Participante') })),
});
interface Diagram { id: string; name: string; description: string; layers: Record<string, unknown>[]; stages: Record<string, unknown>[]; stageGroups: Record<string, unknown>[]; placements: Record<string, unknown>[]; relations: Record<string, unknown>[]; stageWidths?: unknown }

const DEFAULT_LAYERS = [
  { name: 'Sub Procesos', color: '#fef9c3' }, { name: 'APIs Experiencia', color: '#e0f2fe' }, { name: 'APIs Proceso', color: '#ccfbf1' },
  { name: 'APIs Negocio', color: '#e0f2fe' }, { name: 'APIs Sistema (SYS)', color: '#ccfbf1' }, { name: 'BACKEND', color: '#ede9fe' },
];

async function listDocs<T>(store: DB, userId: string, kind: Kind): Promise<(T & { updatedAt: string })[]> {
  const rows = await store.all<DocRow>('SELECT id, name, data, updated_at FROM docs WHERE user_id = ? AND kind = ? ORDER BY updated_at DESC', [userId, kind]);
  return rows.map(r => ({ ...(JSON.parse(r.data) as T), updatedAt: r.updated_at }));
}
async function getDoc<T>(store: DB, userId: string, kind: Kind, id: string): Promise<(T & { updatedAt: string }) | null> {
  const rows = await store.all<DocRow>('SELECT id, name, data, updated_at FROM docs WHERE user_id = ? AND kind = ? AND id = ?', [userId, kind, id]);
  return rows.length ? { ...(JSON.parse(rows[0].data) as T), updatedAt: rows[0].updated_at } : null;
}
async function putDoc(store: DB, userId: string, kind: Kind, doc: { id: string; name: string }) {
  const { updatedAt: _u, ...clean } = doc as { id: string; name: string; updatedAt?: string };
  await store.run('INSERT INTO docs (user_id, kind, id, name, data, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, kind, id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at',
    [userId, kind, doc.id, doc.name, JSON.stringify(clean), nowIso()]);
}
async function delDoc(store: DB, userId: string, kind: Kind, id: string) {
  return (await store.run('DELETE FROM docs WHERE user_id = ? AND kind = ? AND id = ?', [userId, kind, id])).changes > 0;
}

const normLib = (l: Partial<Library>, id?: string): Library => ({
  id: id ?? l.id ?? uid(), name: String(l.name ?? 'Librería'),
  types: (l.types ?? []).map(t => ({ fields: [], color: '#64748b', icon: '▫️', ...t, id: (t.id as string) ?? uid() })),
  components: (l.components ?? []).map(c => ({ typeId: null, description: '', fields: {}, ...c, id: (c.id as string) ?? uid() })),
});
const normDiag = (d: Partial<Diagram>, id?: string): Diagram => {
  const layers = ((d.layers?.length ? d.layers : DEFAULT_LAYERS) as Record<string, unknown>[]).map(l => ({ ...l, id: (l.id as string) ?? uid() }));
  const stageGroups = (d.stageGroups ?? []).map((g: Record<string, unknown>) => ({ ...g, id: (g.id as string) ?? uid() }));
  const gids = new Set(stageGroups.map(g => g.id as string));
  const stages = (d.stages?.length ? d.stages : [{ name: 'Etapa 1' }, { name: 'Etapa 2' }, { name: 'Etapa 3' }])
    .map(s => ({ ...s, id: (s.id as string) ?? uid(), groupId: gids.has(s.groupId as string) ? (s.groupId as string) : null }));
  const cellCount = new Map<string, number>();
  const placements = (d.placements ?? []).map(p => {
    const k = `${p.layerId}|${p.stageId}`; const n = cellCount.get(k) ?? 0; cellCount.set(k, n + 1);
    return { x: 8, y: 8 + n * 40, parentId: null, ...p, id: (p.id as string) ?? uid() };
  });
  const relations = (d.relations ?? []).map(r => ({ style: 'solid', dir: 'fwd', color: '#475569', width: 2, label: '', ...r, id: (r.id as string) ?? uid() }));
  return { id: id ?? d.id ?? uid(), name: String(d.name ?? 'Diagrama'), description: String(d.description ?? ''), layers, stages, stageGroups, placements, relations };
};
const summary = (d: Diagram & { updatedAt: string }) => ({
  id: d.id, name: d.name, description: d.description, updatedAt: d.updatedAt,
  counts: { layers: d.layers.length, stages: d.stages.length, placements: d.placements.length, relations: d.relations.length },
});

// ---- personas
app.get('/people', async c => c.json({ people: await listDocs<Person>(c.get('store'), c.get('user').id, 'person') }));
app.post('/people', async c => {
  const body = await c.req.json<Partial<Person>>().catch(() => ({}) as never);
  if (!body.name) return bad(c, 'Falta "name"');
  const p = normPerson(body);
  await putDoc(c.get('store'), c.get('user').id, 'person', p);
  return c.json(p, 201);
});
app.get('/people/:id', async c => {
  const p = await getDoc<Person>(c.get('store'), c.get('user').id, 'person', c.req.param('id'));
  return p ? c.json(p) : c.json({ error: 'Persona no encontrada' }, 404);
});
app.put('/people/:id', async c => {
  const body = await c.req.json<Partial<Person>>().catch(() => ({}) as never);
  const p = normPerson(body, c.req.param('id'));
  await putDoc(c.get('store'), c.get('user').id, 'person', p);
  return c.json(p);
});
app.patch('/people/:id', async c => {
  const cur = await getDoc<Person>(c.get('store'), c.get('user').id, 'person', c.req.param('id'));
  if (!cur) return c.json({ error: 'Persona no encontrada' }, 404);
  const body = await c.req.json<Partial<Person>>();
  const p = normPerson({ ...cur, ...body }, cur.id);
  await putDoc(c.get('store'), c.get('user').id, 'person', p);
  return c.json(p);
});
app.delete('/people/:id', async c => (await delDoc(c.get('store'), c.get('user').id, 'person', c.req.param('id')))
  ? c.json({ ok: true }) : c.json({ error: 'Persona no encontrada' }, 404));
/** Añade una participación a una persona. */
app.post('/people/:id/assignments', async c => {
  const store = c.get('store'); const u = c.get('user').id;
  const cur = await getDoc<Person>(store, u, 'person', c.req.param('id'));
  if (!cur) return c.json({ error: 'Persona no encontrada' }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as never);
  for (const f of ['kind', 'targetId', 'role']) if (body[f] === undefined) return bad(c, `Falta "${f}"`);
  if (!ASSIGN_KINDS.includes(body.kind as string)) return bad(c, `"kind" debe ser uno de: ${ASSIGN_KINDS.join(', ')}`);
  const item = { ...body, id: uid() };
  const p = normPerson({ ...cur, assignments: [...cur.assignments, item] }, cur.id);
  await putDoc(store, u, 'person', p);
  return c.json(p.assignments.find(a => a.id === item.id), 201);
});
app.delete('/people/:id/assignments/:aid', async c => {
  const store = c.get('store'); const u = c.get('user').id;
  const cur = await getDoc<Person>(store, u, 'person', c.req.param('id'));
  if (!cur) return c.json({ error: 'Persona no encontrada' }, 404);
  const rest = cur.assignments.filter(a => a.id !== c.req.param('aid'));
  if (rest.length === cur.assignments.length) return c.json({ error: 'Participación no encontrada' }, 404);
  await putDoc(store, u, 'person', normPerson({ ...cur, assignments: rest }, cur.id));
  return c.json({ ok: true });
});

// ---- librerías
app.get('/libraries', async c => c.json({ libraries: await listDocs<Library>(c.get('store'), c.get('user').id, 'library') }));
app.post('/libraries', async c => {
  const body = await c.req.json<Partial<Library>>().catch(() => ({}) as never);
  const lib = normLib(body);
  await putDoc(c.get('store'), c.get('user').id, 'library', lib);
  return c.json(lib, 201);
});
app.get('/libraries/:id', async c => {
  const lib = await getDoc<Library>(c.get('store'), c.get('user').id, 'library', c.req.param('id'));
  return lib ? c.json(lib) : c.json({ error: 'Librería no encontrada' }, 404);
});
app.put('/libraries/:id', async c => {
  const body = await c.req.json<Partial<Library>>().catch(() => ({}) as never);
  const lib = normLib(body, c.req.param('id'));
  await putDoc(c.get('store'), c.get('user').id, 'library', lib);
  return c.json(lib);
});
app.patch('/libraries/:id', async c => {
  const cur = await getDoc<Library>(c.get('store'), c.get('user').id, 'library', c.req.param('id'));
  if (!cur) return c.json({ error: 'Librería no encontrada' }, 404);
  const body = await c.req.json<Partial<Library>>();
  const lib = normLib({ ...cur, ...body }, cur.id);
  await putDoc(c.get('store'), c.get('user').id, 'library', lib);
  return c.json(lib);
});
app.delete('/libraries/:id', async c => (await delDoc(c.get('store'), c.get('user').id, 'library', c.req.param('id'))) ? c.json({ ok: true }) : c.json({ error: 'Librería no encontrada' }, 404));

/** Sub-recursos de una librería: tipos y componentes. */
for (const sub of ['types', 'components'] as const) {
  app.post(`/libraries/:id/${sub}`, async c => {
    const store = c.get('store'); const uidUser = c.get('user').id;
    const lib = await getDoc<Library>(store, uidUser, 'library', c.req.param('id'));
    if (!lib) return c.json({ error: 'Librería no encontrada' }, 404);
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as never);
    if (!body.name) return bad(c, 'Falta "name"');
    const item = sub === 'types' ? { fields: [], color: '#64748b', icon: '▫️', ...body, id: uid() } : { typeId: null, description: '', fields: {}, ...body, id: uid() };
    (lib[sub] as Record<string, unknown>[]).push(item);
    await putDoc(store, uidUser, 'library', lib);
    return c.json(item, 201);
  });
  app.put(`/libraries/:id/${sub}/:itemId`, async c => {
    const store = c.get('store'); const uidUser = c.get('user').id;
    const lib = await getDoc<Library>(store, uidUser, 'library', c.req.param('id'));
    if (!lib) return c.json({ error: 'Librería no encontrada' }, 404);
    const arr = lib[sub] as Record<string, unknown>[]; const i = arr.findIndex(x => x.id === c.req.param('itemId'));
    if (i < 0) return c.json({ error: 'No encontrado' }, 404);
    const body = await c.req.json<Record<string, unknown>>();
    arr[i] = { ...arr[i], ...body, id: arr[i].id };
    await putDoc(store, uidUser, 'library', lib);
    return c.json(arr[i]);
  });
  app.delete(`/libraries/:id/${sub}/:itemId`, async c => {
    const store = c.get('store'); const uidUser = c.get('user').id;
    const lib = await getDoc<Library>(store, uidUser, 'library', c.req.param('id'));
    if (!lib) return c.json({ error: 'Librería no encontrada' }, 404);
    const arr = lib[sub] as Record<string, unknown>[]; const n = arr.length;
    lib[sub] = arr.filter(x => x.id !== c.req.param('itemId')) as never;
    if ((lib[sub] as unknown[]).length === n) return c.json({ error: 'No encontrado' }, 404);
    if (sub === 'components') {
      // quitar sus instancias (y relaciones) de todos los diagramas
      const diags = await listDocs<Diagram>(store, uidUser, 'diagram');
      for (const d of diags) {
        const gone = new Set(d.placements.filter(p => p.componentId === c.req.param('itemId')).map(p => p.id as string));
        if (!gone.size) continue;
        d.placements = d.placements.filter(p => !gone.has(p.id as string));
        d.relations = d.relations.filter(r => !gone.has(r.from as string) && !gone.has(r.to as string));
        await putDoc(store, uidUser, 'diagram', d);
      }
    }
    await putDoc(store, uidUser, 'library', lib);
    return c.json({ ok: true });
  });
}

// ---- diagramas
app.get('/diagrams', async c => c.json({ diagrams: (await listDocs<Diagram>(c.get('store'), c.get('user').id, 'diagram')).map(summary) }));
app.post('/diagrams', async c => {
  const body = await c.req.json<Partial<Diagram>>().catch(() => ({}) as never);
  const d = normDiag(body);
  await putDoc(c.get('store'), c.get('user').id, 'diagram', d);
  return c.json(d, 201);
});
app.get('/diagrams/:id', async c => {
  const d = await getDoc<Diagram>(c.get('store'), c.get('user').id, 'diagram', c.req.param('id'));
  return d ? c.json(d) : c.json({ error: 'Diagrama no encontrado' }, 404);
});
app.put('/diagrams/:id', async c => {
  const body = await c.req.json<Partial<Diagram>>().catch(() => ({}) as never);
  const d = normDiag(body, c.req.param('id'));
  await putDoc(c.get('store'), c.get('user').id, 'diagram', d);
  return c.json(d);
});
app.patch('/diagrams/:id', async c => {
  const cur = await getDoc<Diagram>(c.get('store'), c.get('user').id, 'diagram', c.req.param('id'));
  if (!cur) return c.json({ error: 'Diagrama no encontrado' }, 404);
  const body = await c.req.json<Partial<Diagram>>();
  const d = normDiag({ ...cur, ...body }, cur.id);
  await putDoc(c.get('store'), c.get('user').id, 'diagram', d);
  return c.json(d);
});
app.delete('/diagrams/:id', async c => (await delDoc(c.get('store'), c.get('user').id, 'diagram', c.req.param('id'))) ? c.json({ ok: true }) : c.json({ error: 'Diagrama no encontrado' }, 404));

/** Sub-recursos de un diagrama: capas, etapas, instancias (placements) y relaciones. */
const SUBS: Record<string, { key: 'layers' | 'stages' | 'stageGroups' | 'placements' | 'relations'; required: string[] }> = {
  layers: { key: 'layers', required: ['name'] }, stages: { key: 'stages', required: ['name'] },
  stageGroups: { key: 'stageGroups', required: ['name'] },
  placements: { key: 'placements', required: ['componentId', 'layerId', 'stageId'] }, relations: { key: 'relations', required: ['from', 'to'] },
};
for (const [path, { key, required }] of Object.entries(SUBS)) {
  app.post(`/diagrams/:id/${path}`, async c => {
    const store = c.get('store'); const uidUser = c.get('user').id;
    const d = await getDoc<Diagram>(store, uidUser, 'diagram', c.req.param('id'));
    if (!d) return c.json({ error: 'Diagrama no encontrado' }, 404);
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as never);
    for (const r of required) if (body[r] === undefined) return bad(c, `Falta "${r}"`);
    if (key === 'placements') {
      if (!d.layers.some(l => l.id === body.layerId)) return bad(c, 'layerId no existe en el diagrama');
      if (!d.stages.some(s => s.id === body.stageId)) return bad(c, 'stageId no existe en el diagrama');
    }
    if (key === 'relations') {
      const ids = new Set(d.placements.map(p => p.id));
      if (!ids.has(body.from) || !ids.has(body.to)) return bad(c, '"from" y "to" deben ser ids de instancias (placements) del diagrama');
    }
    const item = { ...body, id: uid() };
    (d[key] as Record<string, unknown>[]).push(item);
    const nd = normDiag(d, d.id);
    await putDoc(store, uidUser, 'diagram', nd);
    return c.json((nd[key] as Record<string, unknown>[]).find(x => x.id === item.id), 201);
  });
  app.put(`/diagrams/:id/${path}/:itemId`, async c => {
    const store = c.get('store'); const uidUser = c.get('user').id;
    const d = await getDoc<Diagram>(store, uidUser, 'diagram', c.req.param('id'));
    if (!d) return c.json({ error: 'Diagrama no encontrado' }, 404);
    const arr = d[key] as Record<string, unknown>[]; const i = arr.findIndex(x => x.id === c.req.param('itemId'));
    if (i < 0) return c.json({ error: 'No encontrado' }, 404);
    const body = await c.req.json<Record<string, unknown>>();
    arr[i] = { ...arr[i], ...body, id: arr[i].id };
    await putDoc(store, uidUser, 'diagram', normDiag(d, d.id));
    return c.json(arr[i]);
  });
  app.delete(`/diagrams/:id/${path}/:itemId`, async c => {
    const store = c.get('store'); const uidUser = c.get('user').id;
    const d = await getDoc<Diagram>(store, uidUser, 'diagram', c.req.param('id'));
    if (!d) return c.json({ error: 'Diagrama no encontrado' }, 404);
    const itemId = c.req.param('itemId');
    const arr = d[key] as Record<string, unknown>[];
    if (!arr.some(x => x.id === itemId)) return c.json({ error: 'No encontrado' }, 404);
    if (key === 'layers') { const gone = new Set(d.placements.filter(p => p.layerId === itemId).map(p => p.id)); d.placements = d.placements.filter(p => !gone.has(p.id)); d.relations = d.relations.filter(r => !gone.has(r.from) && !gone.has(r.to)); }
    if (key === 'stages') { const gone = new Set(d.placements.filter(p => p.stageId === itemId).map(p => p.id)); d.placements = d.placements.filter(p => !gone.has(p.id)); d.relations = d.relations.filter(r => !gone.has(r.from) && !gone.has(r.to)); }
    if (key === 'placements') {
      const gone = new Set<string>([itemId]);
      let grew = true; while (grew) { grew = false; for (const p of d.placements) if (p.parentId && gone.has(p.parentId as string) && !gone.has(p.id as string)) { gone.add(p.id as string); grew = true; } }
      d.placements = d.placements.filter(p => !gone.has(p.id as string)); d.relations = d.relations.filter(r => !gone.has(r.from as string) && !gone.has(r.to as string));
    }
    if (key !== 'placements') (d as unknown as Record<string, unknown>)[key] = arr.filter(x => x.id !== itemId); // placements ya filtrado en cascada
    await putDoc(store, uidUser, 'diagram', normDiag(d, d.id));
    return c.json({ ok: true });
  });
}

// ---- exportar / importar / plantillas
app.get('/export', async c => {
  const store = c.get('store'); const u = c.get('user').id;
  return c.json({ app: 'diagramador', version: 1, exportedAt: nowIso(), libraries: await listDocs<Library>(store, u, 'library'), diagrams: await listDocs<Diagram>(store, u, 'diagram'), people: await listDocs<Person>(store, u, 'person') });
});
app.get('/diagrams/:id/export', async c => {
  const store = c.get('store'); const u = c.get('user').id;
  const d = await getDoc<Diagram>(store, u, 'diagram', c.req.param('id'));
  if (!d) return c.json({ error: 'Diagrama no encontrado' }, 404);
  const used = new Set(d.placements.map(p => p.componentId));
  const libs = (await listDocs<Library>(store, u, 'library'))
    .map(l => ({ ...l, components: l.components.filter(x => used.has(x.id)) }))
    .map(l => ({ ...l, types: l.types.filter(t => l.components.some(x => x.typeId === t.id)) }))
    .filter(l => l.components.length);
  return c.json({ app: 'diagramador', version: 1, exportedAt: nowIso(), libraries: libs, diagrams: [d] });
});
app.post('/import', async c => {
  const body = await c.req.json<{ libraries?: Partial<Library>[]; diagrams?: Partial<Diagram>[]; people?: Partial<Person>[] }>().catch(() => ({}) as never);
  const store = c.get('store'); const u = c.get('user').id;
  const libs: Library[] = []; const diags: Diagram[] = []; const ppl: Person[] = [];
  for (const l of body.libraries ?? []) { const lib = normLib(l); await putDoc(store, u, 'library', lib); libs.push(lib); }
  for (const d of body.diagrams ?? []) { const dg = normDiag(d); await putDoc(store, u, 'diagram', dg); diags.push(dg); }
  for (const p of body.people ?? []) { const per = normPerson(p); await putDoc(store, u, 'person', per); ppl.push(per); }
  return c.json({ imported: { libraries: libs.map(l => l.id), diagrams: diags.map(d => d.id), people: ppl.map(p => p.id) } }, 201);
});
app.get('/templates', c => c.json({ templates: [{ key: 'aliados', name: 'Plantilla Aliados (APIs y microservicios por capas)' }] }));
app.post('/templates/:key/apply', async c => {
  if (c.req.param('key') !== 'aliados') return c.json({ error: 'Plantilla no encontrada' }, 404);
  const store = c.get('store'); const u = c.get('user').id;
  const src = JSON.parse(JSON.stringify(aliados)) as { libraries: Library[]; diagrams: Diagram[] };
  const { name } = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }));
  // ids nuevos para no chocar con una aplicación anterior de la plantilla
  const map = new Map<string, string>(); const nid = (old: string) => { const n = map.get(old) ?? uid(); map.set(old, n); return n; };
  for (const l of src.libraries) { l.id = nid(l.id); for (const t of l.types) t.id = nid(t.id as string); for (const cpt of l.components) { cpt.id = nid(cpt.id as string); if (cpt.typeId) cpt.typeId = nid(cpt.typeId as string); } }
  for (const d of src.diagrams) {
    d.id = nid(d.id); if (name) d.name = name;
    for (const l of d.layers) l.id = nid(l.id as string); for (const s of d.stages) s.id = nid(s.id as string);
    for (const p of d.placements) p.id = nid(p.id as string);
    for (const p of d.placements) { p.componentId = nid(p.componentId as string); p.layerId = nid(p.layerId as string); p.stageId = nid(p.stageId as string); if (p.parentId) p.parentId = nid(p.parentId as string); }
    for (const r of d.relations) { r.id = nid(r.id as string); r.from = nid(r.from as string); r.to = nid(r.to as string); }
  }
  for (const l of src.libraries) await putDoc(store, u, 'library', l);
  for (const d of src.diagrams) await putDoc(store, u, 'diagram', d);
  return c.json({ libraries: src.libraries.map(l => l.id), diagrams: src.diagrams.map(d => d.id) }, 201);
});

export default app;
