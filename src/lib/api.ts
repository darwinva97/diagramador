/**
 * Catálogo de APIs.
 *
 * Una API se define una sola vez (repositorio, base URL por entorno, operaciones con su
 * contrato) y se usa en tantas celdas como haga falta. La diferencia con un componente
 * normal es el tipo de vínculo: **la instancia no edita la API**, sólo elige qué operación
 * usa ahí y escribe su propia nota. Editar la API cambia lo que ven todos sus usos.
 *
 * Para que el tablero, las flechas, las reglas y las personas sigan funcionando sin
 * cambios, cada API tiene un **componente espejo** en una librería propia del catálogo
 * (`API_LIB_ID`): las instancias apuntan a ese componente como a cualquier otro. El espejo
 * lo mantiene el código, no el usuario, y la interfaz no lo ofrece para editar.
 */
import type { Api, ApiOperation, AppData, Component, Diagram, KeyValue, Library, Placement } from '../types';
import { uid } from './model';

/** Id fijo de la librería del catálogo: así se reconoce siempre, venga de donde venga. */
export const API_LIB_ID = 'lib-apis';
export const API_LIB_NAME = 'APIs (catálogo)';
/** Id del componente espejo de una API. */
export const apiCompId = (apiId: string) => `api-${apiId}`;

export const isApiLib = (l: Library) => l.id === API_LIB_ID;
/** Librerías que el usuario edita a mano (todas menos el catálogo). */
export const userLibs = (d: AppData) => d.libraries.filter(l => !isApiLib(l));

export const findApi = (d: AppData, id: string | null | undefined): Api | null =>
  d.apis?.find(a => a.id === id) ?? null;
export const findOp = (api: Api | null, id: string | null | undefined): ApiOperation | null =>
  api?.operations.find(o => o.id === id) ?? null;

/** La API de un componente, si es un espejo del catálogo. */
export const apiOfComp = (d: AppData, c: Component | null | undefined): Api | null =>
  c?.apiId ? findApi(d, c.apiId) : null;

/** ¿Esta instancia es de una API? Devuelve la API y la operación elegida aquí. */
export function apiOfPlacement(d: AppData, p: Placement): { api: Api; op: ApiOperation | null } | null {
  const c = d.libraries.flatMap(l => l.components).find(x => x.id === p.componentId);
  const api = apiOfComp(d, c);
  return api ? { api, op: findOp(api, p.operationId) } : null;
}

/** «GET /v1/clientes/{id}» */
export const opLabel = (o: ApiOperation | null): string =>
  o ? [o.method, o.path].filter(Boolean).join(' ') : '';
/** Nombre de la operación, o su método y ruta si no tiene. */
export const opName = (o: ApiOperation | null): string => (o ? o.name || opLabel(o) || 'Operación' : '');

// ---------------------------------------------------------------- crear
export const emptyOperation = (n = 1): ApiOperation => ({
  id: uid(), name: `Operación ${n}`, method: 'GET', path: '/', summary: '',
  headers: [], pathParams: [], queryParams: [], requestBody: '', responseBody: '', codes: [], notes: '',
});

export const emptyApi = (name = 'API nueva'): Api => ({
  id: uid(), name, description: '', repoUrl: '', docsUrl: '', version: 'v1', auth: '',
  baseUrls: [{ key: 'dev', value: '' }, { key: 'prod', value: '' }],
  operations: [emptyOperation()], color: '#2563eb', icon: '🔌', tags: '',
});

// ---------------------------------------------------------------- componente espejo
/** La librería del catálogo, creándola si hace falta. */
export function apiLib(d: AppData): Library {
  let l = d.libraries.find(x => x.id === API_LIB_ID);
  if (!l) { l = { id: API_LIB_ID, name: API_LIB_NAME, types: [], components: [] }; d.libraries.push(l); }
  return l;
}

/**
 * Deja el componente espejo al día con su API. Se llama al crear o editar una API; el
 * usuario nunca toca este componente directamente.
 */
export function syncApiComponent(d: AppData, api: Api): Component {
  const lib = apiLib(d);
  const id = apiCompId(api.id);
  let c = lib.components.find(x => x.id === id);
  if (!c) { c = { id, name: api.name, typeId: null, description: '', fields: {}, apiId: api.id }; lib.components.push(c); }
  c.apiId = api.id;
  c.name = api.name;
  c.description = api.description;
  // los campos son sólo para que las reglas de estilo puedan mirar una API como a cualquier
  // otro componente ("si repo está vacío, píntalo en rojo"); no se editan a mano
  c.fields = {
    api: api.name, repo: api.repoUrl, docs: api.docsUrl, version: api.version, auth: api.auth,
    entornos: api.baseUrls.map(b => b.key).join(', '),
    operaciones: api.operations.length,
    tags: api.tags,
  };
  return c;
}

/** Quita del catálogo una API y su componente espejo (y todas sus instancias). */
export function removeApi(d: AppData, apiId: string) {
  d.apis = (d.apis ?? []).filter(a => a.id !== apiId);
  const lib = d.libraries.find(x => x.id === API_LIB_ID);
  const cid = apiCompId(apiId);
  if (lib) lib.components = lib.components.filter(c => c.id !== cid);
  for (const g of d.diagrams) {
    const fuera = new Set(g.placements.filter(p => p.componentId === cid).map(p => p.id));
    if (!fuera.size) continue;
    g.placements = g.placements.filter(p => !fuera.has(p.id));
    g.relations = g.relations.filter(r => !fuera.has(r.from) && !fuera.has(r.to));
  }
}

/** Dónde se está usando una API: instancias por diagrama. */
export function apiUsage(d: AppData, apiId: string): { diagram: Diagram; placements: Placement[] }[] {
  const cid = apiCompId(apiId);
  return d.diagrams
    .map(g => ({ diagram: g, placements: g.placements.filter(p => p.componentId === cid) }))
    .filter(x => x.placements.length > 0);
}

// ---------------------------------------------------------------- OpenAPI
const parseJson = (t: string): unknown => { try { return t.trim() ? JSON.parse(t) : undefined; } catch { return undefined; } };

/** Documento OpenAPI 3.1 con lo que tenemos: suficiente para leerlo o importarlo en otra herramienta. */
export function toOpenApi(api: Api): unknown {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const o of api.operations) {
    const ruta = o.path || '/';
    const metodo = (o.method || 'get').toLowerCase();
    const ejemploReq = parseJson(o.requestBody);
    const ejemploRes = parseJson(o.responseBody);
    const params = [
      ...o.pathParams.filter(p => p.key).map(p => ({ name: p.key, in: 'path', required: true, description: p.value, schema: { type: 'string' } })),
      ...o.queryParams.filter(p => p.key).map(p => ({ name: p.key, in: 'query', required: false, description: p.value, schema: { type: 'string' } })),
      ...o.headers.filter(p => p.key).map(p => ({ name: p.key, in: 'header', required: false, description: p.value, schema: { type: 'string' } })),
    ];
    const respuestas: Record<string, unknown> = {};
    for (const c of o.codes.filter(c => c.key)) respuestas[c.key] = { description: c.value || '' };
    if (ejemploRes !== undefined) {
      respuestas['200'] = { description: (o.codes.find(c => c.key === '200')?.value) || 'OK', content: { 'application/json': { example: ejemploRes } } };
    }
    if (!Object.keys(respuestas).length) respuestas['200'] = { description: 'OK' };
    paths[ruta] ??= {};
    paths[ruta][metodo] = {
      operationId: o.id,
      summary: o.name || o.summary || undefined,
      description: [o.summary, o.notes].filter(Boolean).join('\n\n') || undefined,
      deprecated: o.deprecated || undefined,
      parameters: params.length ? params : undefined,
      requestBody: ejemploReq !== undefined ? { content: { 'application/json': { example: ejemploReq } } } : undefined,
      responses: respuestas,
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: api.name, version: api.version || '1.0.0',
      description: [api.description, api.repoUrl && `Repositorio: ${api.repoUrl}`, api.docsUrl && `Documentación: ${api.docsUrl}`]
        .filter(Boolean).join('\n\n') || undefined,
    },
    servers: api.baseUrls.filter(b => b.value).map(b => ({ url: b.value, description: b.key })),
    paths,
    ...(api.auth ? { 'x-auth': api.auth } : {}),
  };
}

const ejemploDe = (content: Record<string, { example?: unknown; schema?: unknown }> | undefined): string => {
  const j = content?.['application/json'];
  const v = j?.example ?? j?.schema;
  return v === undefined ? '' : JSON.stringify(v, null, 2);
};

/** Lee un OpenAPI (2, 3.0 o 3.1) y saca de él una API del catálogo. */
export function fromOpenApi(raw: unknown, nombrePorDefecto = 'API importada'): Api {
  const doc = raw as {
    openapi?: string; swagger?: string;
    info?: { title?: string; version?: string; description?: string };
    servers?: { url?: string; description?: string }[];
    host?: string; basePath?: string; schemes?: string[];
    paths?: Record<string, Record<string, unknown>>;
  };
  if (!doc || typeof doc !== 'object' || (!doc.paths && !doc.info))
    throw new Error('No parece un OpenAPI: falta `info` y `paths`.');

  const base: KeyValue[] = (doc.servers ?? [])
    .map(s => ({ key: String(s.description ?? 'servidor'), value: String(s.url ?? '') }))
    .filter(x => x.value);
  if (!base.length && doc.host) base.push({ key: 'servidor', value: `${doc.schemes?.[0] ?? 'https'}://${doc.host}${doc.basePath ?? ''}` });

  const operations: ApiOperation[] = [];
  const METODOS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
  for (const [ruta, item] of Object.entries(doc.paths ?? {})) {
    for (const [metodo, valor] of Object.entries(item ?? {})) {
      if (!METODOS.includes(metodo.toLowerCase())) continue;
      const op = valor as {
        summary?: string; description?: string; operationId?: string; deprecated?: boolean;
        parameters?: { name?: string; in?: string; description?: string }[];
        requestBody?: { content?: Record<string, { example?: unknown; schema?: unknown }> };
        responses?: Record<string, { description?: string; content?: Record<string, { example?: unknown; schema?: unknown }> }>;
      };
      const params = op.parameters ?? [];
      const porSitio = (sitio: string): KeyValue[] =>
        params.filter(p => p.in === sitio && p.name).map(p => ({ key: String(p.name), value: String(p.description ?? '') }));
      const respuestas = Object.entries(op.responses ?? {});
      const ok = respuestas.find(([c]) => c.startsWith('2'));
      operations.push({
        id: uid(),
        name: op.summary || op.operationId || `${metodo.toUpperCase()} ${ruta}`,
        method: metodo.toUpperCase(),
        path: ruta,
        summary: op.summary ?? '',
        deprecated: op.deprecated === true || undefined,
        headers: porSitio('header'),
        pathParams: porSitio('path'),
        queryParams: porSitio('query'),
        requestBody: ejemploDe(op.requestBody?.content),
        responseBody: ok ? ejemploDe(ok[1]?.content) : '',
        codes: respuestas.map(([c, v]) => ({ key: c, value: String(v?.description ?? '') })),
        notes: op.description && op.description !== op.summary ? op.description : '',
      });
    }
  }
  return {
    ...emptyApi(doc.info?.title || nombrePorDefecto),
    description: doc.info?.description ?? '',
    version: doc.info?.version ?? 'v1',
    baseUrls: base.length ? base : [{ key: 'dev', value: '' }, { key: 'prod', value: '' }],
    operations: operations.length ? operations : [emptyOperation()],
  };
}
