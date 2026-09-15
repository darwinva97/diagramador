# Drawer

Editor local de diagramas por **capas (filas) × etapas (columnas)**. Sin servidor: todo se guarda en el
`localStorage` del navegador y se puede exportar/importar como JSON.

Stack: React 19 + TypeScript + Vite + Zustand (immer/persist) + React Router.

## Rutas

- `/d/:id` — editor con ese diagrama (`/` redirige al diagrama actual). Cambiar de diagrama cambia la URL y el historial del navegador funciona.
- `/cuenta/:tab` — cuenta y administración: `perfil`, `keys`, `diagramas`, `bibliotecas`, `tipos`, `config`, `agentes`.
- `/ventana/:view` — una parte en ventana separada: `sidebar`, `inspector` o `board`.
- Cualquier otra ruta redirige a `/`. No hay SEO: todo se sirve desde el mismo `index.html`.

## Uso

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm run build      # genera dist/index.html (un único archivo; necesita un servidor con fallback SPA, p. ej. `npm run preview` o el Worker)
```

## Funciones

- Varios diagramas (crear, duplicar, eliminar, cambiar entre ellos). Guardado automático.
- Capas y etapas: añadir, renombrar (escribe en la cabecera), reordenar (arrastra ⋮⋮), color por capa.
- Librerías de componentes y tipos, compartidas entre todos los diagramas.
  - Un tipo define icono, color y **campos específicos** (texto, número, lista, casilla, URL, fecha…).
  - Un componente puede moverse de librería y usar tipos de cualquier librería.
- Drag & drop: librería → celda, celda → celda, Ctrl+arrastrar = clonar, soltar en la librería = quitar.
- **PWA**: instalable desde el navegador (icono, `manifest.webmanifest`) y funciona sin conexión gracias a un service worker (`public/sw.js`).
- **Tema** claro / oscuro / sistema (botón ☀ ☾ ◐ de la barra superior).
- **Modo zen** (botón Zen o Ctrl+Shift+F): sólo el tablero; Esc para salir. Botón ⤢ de pantalla completa.
- **Ventanas separadas**: botones ⧉ abren la librería, el inspector o el tablero en otra ventana del navegador (`/ventana/sidebar|inspector|board`). Todas las ventanas comparten datos y selección en tiempo real (localStorage + BroadcastChannel) y se puede arrastrar de una ventana a otra.
- Paneles laterales plegables: botones ◧ ◨ en la barra superior, Ctrl+J (librería) y Ctrl+B (inspector); doble clic en un componente reabre el inspector.
- Paneles laterales redimensionables: arrastra la barra entre paneles (mínimo 200 px la librería, 260 px el inspector; doble clic = ancho por defecto).
- Tipos de campo: texto, texto largo, número, lista desplegable, casilla, URL, fecha, **lista de textos**, **clave → valor** y **JSON** (con validación y formateo).
- Plantilla **Tipo API** (pestaña Tipos): capa, estado, versión, método HTTP, path, base URL por entorno, autenticación, content-type, cabeceras, parámetros de path y query, request/response body en JSON, códigos de respuesta, contrato de error, timeout, etiquetas, documentación y notas. El chip muestra `MÉTODO /path` bajo el nombre. “+ Campos de contrato API” añade esos campos a un tipo existente.
- Subcomponentes: un componente puede contener otros (p. ej. microservicios dentro de su API). Suelta un chip encima de otro para anidarlo; arrástralo a la celda para sacarlo.
- Redimensionar: arrastra el borde derecho de una celda (ancho de la etapa) o el inferior (alto de la capa); doble clic = automático.
- Posición libre dentro de la celda (rejilla de 8 px). Flechas del teclado mueven la instancia seleccionada (Shift = 1 px); ⊞ apila los componentes de una celda.
- Un componente puede estar en varias etapas/capas: al pasar el ratón **brillan todos sus clones**.
- Relaciones: arrastra desde el punto ● de un componente hasta otro (puede saltar capas y etapas).
  Estilos **directa / troceada / punteada**, dirección (→, ↔, ninguna), color, grosor y etiqueta.
- Exportar todo, exportar sólo el diagrama actual (con los componentes/tipos que usa) e importar JSON (fusiona).
- Deshacer (Ctrl+Z) y rehacer (Ctrl+Shift+Z), Supr borra la instancia o relación seleccionada, Esc deselecciona, impresión sólo del tablero.
- **Copiar y pegar**: Ctrl+C / Ctrl+X sobre una instancia o un componente de la librería, clic en la celda destino y Ctrl+V. Ctrl+D duplica en la misma celda, Ctrl+Shift+D desvincula (copia independiente) y Ctrl+Shift+V pega ya desvinculado.
- **Inspector por pestañas** en un componente: Datos (tipo, descripción y campos), Sitio (instancias, subcomponentes, posición y relaciones), Personas, Estilo (reglas que lo pintan) y Más (librería, uso en diagramas, copias y vínculos). El nombre queda siempre a la vista y cada pestaña lleva su contador.
- **Diagramas públicos**: marca “Público para lectura” en el inspector del diagrama y cualquiera con el enlace `/p/<id>` lo ve sin cuenta y sin poder editarlo. Se publica sólo lo necesario para dibujarlo (el diagrama, sus componentes, las personas asignadas sin su correo y las reglas de estilo); el resto de diagramas y las claves siguen siendo privados. Requiere que el diagrama esté sincronizado con una cuenta.
- **Dos zooms independientes**, en los controles de abajo a la izquierda:
  - **Diagrama** (25 %–200 %): escala el contenido sin tocar la interfaz. Ctrl + rueda centrado en el puntero, Ctrl +, Ctrl −, Ctrl 0 y ajuste al ancho de la ventana.
  - **Títulos** (50 %–300 %): el tamaño de los nombres de capas, etapas y grupos, compensado para que no dependa del zoom del diagrama. Así puedes alejar el contenido para verlo entero y seguir leyendo los títulos.
  - La fila de etapas y la banda de grupos siguen fijas en todos los niveles. La columna de capas se suelta por encima del 100 %: usa `position: sticky` horizontal y Chrome calcula mal qué hay bajo el cursor al combinarlo con `zoom`, lo que rompería el arrastre.
- **Cabeceras fijas**: la columna de capas y la fila de etapas y grupos se quedan a la vista al desplazarse. Además, el nombre de cada capa, etapa y grupo acompaña a su bloque: mientras quede algo de esa capa o etapa en pantalla, su nombre sigue siendo legible en lugar de irse con el borde. Se activan por separado con los botones ⇤ y ⤒ de la barra superior, o desde el clic derecho en una capa o una etapa. Vienen activadas.
- **Mover el lienzo** arrastrando: barra espaciadora + arrastre, botón central del ratón, o arrastre desde una zona libre.
- **Menú contextual** con clic derecho sobre un componente, una celda, una capa, una etapa, una flecha, un tipo o el título de una librería.
- **Reglas de estilo**: pintan cada componente según sus datos. Una regla tiene condiciones (campo, nombre, tipo, librería, persona o papel, con operadores como igual, contiene, está vacío o expresión regular) y define qué pinta: fondo, color del texto, borde con su grosor y estilo, franja izquierda, franja superior, opacidad, brillo, punto de color, icono, negrita o tachado. Cuando varias reglas coinciden, se aplican de menor a mayor prioridad y la de más prioridad manda propiedad a propiedad. El botón ⚡ crea de golpe una regla por cada valor de un campo de lista (p. ej. “estado”).
- **Personas**: registro de personas (nombre, cargo, equipo, correo) en la pestaña “Personas” del panel lateral. Se asignan con un papel (Owner, Stakeholder, Líder técnico… texto libre) a un componente, un diagrama, una capa, una etapa o un tipo. El tablero muestra los avatares sobre cada componente, la ficha de cada persona lista dónde participa y con quién coincide, y la pestaña Personas de la cuenta da la vista global y el reparto por papel.
- **Grupos de etapas**: una banda por encima de las columnas (p. ej. “Evaluación rápida” sobre varias etapas).
  - Arrastra sobre la franja gris de la banda para crear un grupo que abarque esas columnas; al soltar, el nombre queda listo para escribirlo.
  - Arrastra los bordes de una banda para abarcar más o menos columnas.
  - También desde el menú contextual de una etapa, o con casillas en el inspector del diagrama.
- **Atajos de teclado** para casi todo; pulsa `?` (o el botón ⌨) para ver la lista completa.
- **Librerías plegables** en el panel lateral: clic en el título para plegar o desplegar.
- **Contratos de API**: los campos JSON muestran la estructura reconocida (campo, tipo y ejemplo) y una relación puede conectar un campo concreto del origen con uno del destino.

## Plataforma: cuentas, sincronización y API

- **Cuenta** (botón 👤 de la barra superior): registro e inicio de sesión con correo y contraseña. Con sesión, los
  diagramas y bibliotecas se guardan en la nube y se sincronizan (cada cambio local se sube automáticamente).
  Al entrar por primera vez, si la cuenta está vacía se suben los datos del navegador; si no, se cargan los de la cuenta.
- **Páginas de administración**: perfil, API keys, diagramas, bibliotecas, tipos, configuración y guía para agentes.
- **API REST** en `/api/v1` (Hono en el Worker). Autenticación por cookie o `Authorization: Bearer dgk_…` (API key).
  Todo lo que hace la app se puede hacer por API: bibliotecas, tipos, componentes, diagramas, capas, etapas, instancias,
  relaciones e import/export.
  - Guía para agentes: [`public/agent.md`](public/agent.md) → https://draw.bezenti.com/agent.md
  - OpenAPI: [`public/openapi.json`](public/openapi.json) → https://draw.bezenti.com/openapi.json
  - Skill para agentes: [`SKILL.md`](SKILL.md) · contexto del dominio: [`CONTEXT.md`](CONTEXT.md)
- **Persistencia**: Durable Object con SQLite (`worker/store.ts`): tablas `users`, `api_keys` y `docs` (JSON por usuario).
  Contraseñas con PBKDF2, sesiones firmadas con HMAC (`SESSION_SECRET`, secreto del Worker) y API keys guardadas como hash.
- Desarrollo local del backend: `npm run dev:worker` (compila y levanta `wrangler dev` con `.dev.vars`).

## Despliegue (draw.bezenti.com)

La app se publica como **Cloudflare Worker de archivos estáticos** (`wrangler.jsonc`) con dominio propio
`draw.bezenti.com`; wrangler crea el DNS y el certificado en la zona `bezenti.com` al desplegar.

- **CI/CD:** `.github/workflows/deploy.yml`. En cada push a `main` compila y despliega; en pull requests sólo compila.
- **Secretos del repositorio** (Settings → Secrets and variables → Actions):
  - `CLOUDFLARE_ACCOUNT_ID`: id de la cuenta que tiene la zona bezenti.com.
  - `CLOUDFLARE_API_TOKEN`: token de API creado en <https://dash.cloudflare.com/profile/api-tokens>
    con la plantilla **“Edit Cloudflare Workers”** (incluye Workers Scripts, Workers Routes, Account Settings y Zone/DNS de la zona).
    Si falta, el job de deploy se omite con un aviso.
- **Despliegue manual:** `npm run deploy` (requiere `npx wrangler login`). El secreto `SESSION_SECRET` se crea una vez con `wrangler secret put SESSION_SECRET`.

## Ejemplos

Al abrir la app por primera vez se crea un diagrama vacío con las capas por defecto: Sub Procesos, APIs Experiencia, APIs Proceso, APIs Negocio, APIs Sistema (SYS) y BACKEND. Los diagramas nuevos usan esas mismas capas.

En `ejemplos/` hay diagramas listos para importar (menú **Ejemplos…** de la barra superior o **Importar JSON**).
IGNORAR
(subprocesos → APIs/microservicios de experiencia, proceso, negocio y sistema → backend) con 5 etapas.

## Estructura

```
src/
  types.ts            modelo de datos (Library, ComponentType, Component, Diagram, Placement, Relation…)
  store.ts            estado global (zustand + immer + persist) y undo
  actions.ts          todas las operaciones sobre el modelo
  seed.ts             datos de ejemplo del primer arranque
  lib/model.ts        búsquedas, normalización, clonado
  lib/geometry.ts     anclajes y curvas de las flechas
  lib/io.ts           exportar / importar JSON
  components/         TopBar, Sidebar (librerías), Board (tablero + DnD + enlaces), Links (SVG), Inspector, Account (plataforma)
  cloud.ts            cuenta y sincronización con la API · sync.ts ventanas separadas
worker/
  index.ts            API REST (Hono) · store.ts Durable Object SQLite · auth.ts PBKDF2 / HMAC / API keys
```
