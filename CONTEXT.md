# CONTEXT — Diagramador

Editor web de diagramas de arquitectura organizados en una cuadrícula de **capas (filas) × etapas (columnas)**,
con componentes reutilizables, subcomponentes y relaciones. Funciona en modo local (localStorage) y, con cuenta,
como plataforma con sincronización y API REST.

## Dominio

- **Biblioteca (Library)**: contenedor global de *tipos* y *componentes*. Compartida por todos los diagramas del usuario.
- **Tipo de componente (ComponentType)**: nombre, color, icono y **campos** (`FieldDef`: text, textarea, number, select, checkbox, url, date, list, keyvalue, json). Plantilla especial "API" con el contrato completo (método, path, base URL por entorno, cabeceras, parámetros, request/response JSON, códigos…).
- **Componente (Component)**: pertenece a una biblioteca, tiene un tipo (opcional) y valores para sus campos.
- **Persona (Person)**: nombre, cargo, equipo, correo, color y `assignments[]`. Cada `Assignment { kind, targetId, role }` dice en qué participa (componente, diagrama, capa, etapa o tipo) y con qué papel. Las personas son globales, como las bibliotecas, y se sincronizan como documentos propios (`kind: 'person'`, rutas `/people`).
- **Diagrama (Diagram)**: capas, etapas, **grupos de etapas** (`StageGroup`: banda sobre las columnas; `Stage.groupId` indica a cuál pertenece y sólo se funden las contiguas), **instancias** (`Placement`) y **relaciones** (`Relation`).
- **Instancia (Placement)**: un componente colocado en una celda con posición libre (x, y). Varias instancias del mismo componente = clones (se iluminan juntas). `parentId` anida una instancia dentro de otra (subcomponente).
- **Relación (Relation)**: flecha entre dos instancias (`from`/`to` son ids de placement), estilo solid/dashed/dotted, dirección fwd/both/none, color, grosor, etiqueta. `fromField`/`toField` (opcional) conectan un **campo** concreto de cada extremo; para campos JSON la ruta llega hasta la hoja (`response_body.datos.id`). Puede saltar capas y etapas.
- Un componente editado cambia en todos los diagramas donde esté; "Duplicar" y "Desvincular" crean copias independientes.

## Arquitectura

- `src/` — React 19 + TypeScript + Vite + React Router (declarativo, `routes.tsx`: `/d/:id`, `/cuenta/:tab`, `/ventana/:view`), estado con Zustand (immer + persist en `localStorage`, clave `diagramador.v2`).
  - `types.ts` modelo · `store.ts` estado/undo/UI · `actions.ts` operaciones · `lib/model.ts` normalización y árbol · `lib/geometry.ts` flechas · `lib/io.ts` import/export.
  - `components/` Board (cuadrícula, DnD, enlaces), Sidebar (bibliotecas plegables), Inspector, TopBar, Account (perfil, API keys, listados, configuración, docs de agentes), Shortcuts (ayuda de atajos).
  - `ContextMenu.tsx` menú de clic derecho (instancia, celda, capa, etapa, flecha, componente, tipo y librería); cada zona arma sus acciones con `openMenu`.
  - `People.tsx` avatar, chips de participación y el diálogo de asignación (`openAssign`).
  - `clipboard.ts` copiar/cortar/pegar instancias y componentes en la celda activa (`store.cell`); `paste(true)` pega ya desvinculado · `lib/schema.ts` reconocimiento de la estructura de un JSON y campos conectables de un componente.
  - `sync.ts` ventanas separadas (`/ventana/sidebar|inspector|board`) sincronizadas por `storage` + BroadcastChannel.
  - `cloud.ts` cuenta y sincronización con la API (la cuenta es la fuente de verdad; cambios locales se suben con debounce).
- `worker/` — Cloudflare Worker (Hono): API REST `/api/v1`, cookies de sesión firmadas (HMAC), contraseñas PBKDF2, API keys `dgk_…` (hash SHA-256). Persistencia en un **Durable Object con SQLite** (`Store`): tablas `users`, `api_keys`, `docs` (documentos JSON por usuario: `library` / `diagram`).
- `public/` — PWA (manifest, iconos, `sw.js`), `agent.md` (guía para agentes), `openapi.json`.
- `ejemplos/aliados.json` — plantilla por defecto, generada por `scripts/gen-aliados.mjs`.
- Despliegue: Worker con assets estáticos (`wrangler.jsonc`), dominio `draw.bezenti.com`; CI en `.github/workflows/deploy.yml`.

## Convenciones

- Ids: cadenas cortas aleatorias (`uid()`); la plantilla y ejemplos usan ids fijos legibles para poder reimportar.
- El formato de exportación `{ app: 'diagramador', version: 1, libraries, diagrams }` es el mismo para la app, `/export` e `/import`.
- Textos de interfaz en español.
