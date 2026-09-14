# Diagramador

Editor local de diagramas por **capas (filas) × etapas (columnas)**. Sin servidor: todo se guarda en el
`localStorage` del navegador y se puede exportar/importar como JSON.

Stack: React 18 + TypeScript + Vite + Zustand (immer/persist).

## Uso

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm run build      # genera dist/index.html (un único archivo, se abre directamente con doble clic)
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
- **Ventanas separadas**: botones ⧉ abren la librería, el inspector o el tablero en otra ventana del navegador (`?view=sidebar|inspector|board`). Todas las ventanas comparten datos y selección en tiempo real (localStorage + BroadcastChannel) y se puede arrastrar de una ventana a otra.
- Paneles laterales plegables: botones ◧ ◨ en la barra superior, Ctrl+B (librería) y Ctrl+J (inspector); doble clic en un componente reabre el inspector.
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
- Deshacer (Ctrl+Z), Supr borra la instancia o relación seleccionada, Esc deselecciona, impresión sólo del tablero.

## Despliegue (draw.bezenti.com)

La app se publica como **Cloudflare Worker de archivos estáticos** (`wrangler.jsonc`) con dominio propio
`draw.bezenti.com`; wrangler crea el DNS y el certificado en la zona `bezenti.com` al desplegar.

- **CI/CD:** `.github/workflows/deploy.yml`. En cada push a `main` compila y despliega; en pull requests sólo compila.
- **Secretos del repositorio** (Settings → Secrets and variables → Actions):
  - `CLOUDFLARE_ACCOUNT_ID`: id de la cuenta que tiene la zona bezenti.com.
  - `CLOUDFLARE_API_TOKEN`: token de API creado en <https://dash.cloudflare.com/profile/api-tokens>
    con la plantilla **“Edit Cloudflare Workers”** (incluye Workers Scripts, Workers Routes, Account Settings y Zone/DNS de la zona).
    Si falta, el job de deploy se omite con un aviso.
- **Despliegue manual:** `npm run deploy` (requiere `npx wrangler login`).

## Ejemplos

En `ejemplos/` hay diagramas listos para importar (menú **Ejemplos…** de la barra superior o **Importar JSON**).
`ejemplos/aliados.json` se genera con `node scripts/gen-aliados.mjs` y reproduce una arquitectura por capas
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
  components/         TopBar, Sidebar (librerías), Board (tablero + DnD + enlaces), Links (SVG), Inspector
```
