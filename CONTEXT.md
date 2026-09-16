# CONTEXT — Drawer

Editor web de diagramas de arquitectura organizados en una cuadrícula de **capas (filas) × etapas (columnas)**,
con componentes reutilizables, subcomponentes y relaciones. Funciona en modo local (navegador o un archivo del
equipo) y sin conexión; con cuenta, como plataforma con sincronización y API REST.

## Dominio

- **Biblioteca (Library)**: contenedor global de *tipos* y *componentes*. Compartida por todos los diagramas del usuario.
- **Tipo de componente (ComponentType)**: nombre, color, icono y **campos** (`FieldDef`: text, textarea, number, select, checkbox, url, date, list, keyvalue, json). Plantilla especial "API" con el contrato completo (método, path, base URL por entorno, cabeceras, parámetros, request/response JSON, códigos…).
- **Componente (Component)**: pertenece a una biblioteca, tiene un tipo (opcional) y valores para sus campos.
- **Regla de estilo (StyleRule)**: `conditions[]` + `style` + `priority`. Decide cómo se pinta un componente según sus datos. Las que casan se fusionan de menor a mayor prioridad, así que la de mayor prioridad gana propiedad a propiedad. Evaluador puro en `lib/rules.ts`.
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
  - Tablero: zoom propio (`ui.zoom`, `zoom` de CSS sobre `#grid`); las conversiones de pantalla a coordenadas del diagrama dividen por el zoom (arrastre, soltar y redimensionar).
  - Tablero: el texto de los chips tiene un suelo de legibilidad. `--lf` (lo calcula `Board`: `min(2.5, max(1, 11 / (13 · zoom)))`) multiplica el tamaño de fuente del chip, y el resto de sus medidas van en `em` para acompañarlo. El tope existe porque el chip crece con la fuente y acabaría comiéndose la celda.
  - `lib/image.ts` imagen del diagrama (`html-to-image`): clona `#board` con sus estilos en un `foreignObject`. Antes de capturar pone zoom 1, suelta las cabeceras fijas y añade `body.exporting` (esconde tiradores, puertos y botones de edición); luego lo deja todo como estaba, scroll incluido. La escala se recorta si el lienzo pasa de 16 000 px de lado o 120 M de píxeles. Las flechas llevan `fill="none"` **como atributo** en `Links.tsx`: en el clon el CSS de `#links` no llega y saldrían como manchas negras.
  - Tablero: cabeceras fijas opcionales (`ui.pinLayers` / `ui.pinStages`, clases `pin-cols` / `pin-rows` en `#grid`) y nombres pegajosos dentro de su propio bloque (`.lh-stick`, `.sh-stick`); `--band-h`, `--head-h` y `--lane-w` se miden en vivo para escalonarlos.
  - `PublicView.tsx` vista `/p/:id` de sólo lectura: pide `/public/diagrams/:id` (ruta del Worker sin sesión, sólo si `diagram.public`), monta el tablero con `body.read-only` y persiste en otra clave para no pisar los datos del visitante.
  - Inspector de componente en pestañas (`ui.compTab`): datos · sitio · personas · estilo · más.
  - `Rules.tsx` editor de reglas (condiciones, qué se pinta, prioridad y qué reglas la pisan) · `lib/rules.ts` evaluación y resolución del estilo.
  - `People.tsx` avatar, chips de participación y el diálogo de asignación (`openAssign`).
  - `clipboard.ts` copiar/cortar/pegar instancias y componentes en la celda activa (`store.cell`); `paste(true)` pega ya desvinculado · `lib/schema.ts` reconocimiento de la estructura de un JSON y campos conectables de un componente.
  - `sync.ts` ventanas separadas (`/ventana/sidebar|inspector|board`) sincronizadas por `storage` + BroadcastChannel.
  - `cloud.ts` cuenta y sincronización con la API (la cuenta es la fuente de verdad; cambios locales se suben con debounce). **Sin conexión**: `esDeRed` distingue un fallo de red de un 401, la sesión conocida se guarda en `drawer.user` y la instantánea de sincronización en IndexedDB (`restored` marca si se sabe qué había); al volver la red se hace `flush()` *antes* de `pullAll()`, para no pisar lo editado sin conexión.
  - `local.ts` modo local sobre un archivo del equipo (File System Access): vincular, autoguardado con debounce, Ctrl+S, recargar, desvincular y reanudar tras recargar la página (el identificador del archivo vive en IndexedDB vía `lib/idb.ts`). `firma()` compara memoria y archivo sin la fecha de exportación, que cambiaría siempre. `descargarApp()` guarda la app entera en un `.html`; con `file://` el router pasa a hash (`main.tsx`).
  - `components/Storage.tsx` chip de la barra: dónde se guarda, estado del archivo y aviso de sin conexión; el menú reúne todas las acciones.
- `worker/` — Cloudflare Worker (Hono): API REST `/api/v1`, cookies de sesión firmadas (HMAC), contraseñas PBKDF2, API keys `dgk_…` (hash SHA-256). Persistencia en un **Durable Object con SQLite** (`Store`): tablas `users`, `api_keys`, `docs` (documentos JSON por usuario: `library` / `diagram`).
- `public/` — PWA (manifest, iconos, `sw.js`), `agent.md` (guía para agentes), `openapi.json`.
- Despliegue: Worker con assets estáticos (`wrangler.jsonc`), dominio `draw.bezenti.com`; CI en `.github/workflows/deploy.yml`.

## Convenciones

- Ids: cadenas cortas aleatorias (`uid()`); la plantilla y ejemplos usan ids fijos legibles para poder reimportar.
- El formato de exportación `{ app: 'diagramador', version: 1, libraries, diagrams }` es el mismo para la app, `/export`, `/import` y los archivos `.drawer` del modo local (que además llevan `currentDiagramId`).
- En `Board` no puede haber hooks después del `if (!d) return …`: sin diagramas (cuenta nueva, archivo vacío, se borró el último) React se quejaría de que faltan hooks.
- Textos de interfaz en español.
