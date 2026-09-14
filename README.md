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
- Subcomponentes: un componente puede contener otros (p. ej. microservicios dentro de su API). Suelta un chip encima de otro para anidarlo; arrástralo a la celda para sacarlo.
- Redimensionar: arrastra el borde derecho de una celda (ancho de la etapa) o el inferior (alto de la capa); doble clic = automático.
- Posición libre dentro de la celda (rejilla de 8 px). Flechas del teclado mueven la instancia seleccionada (Shift = 1 px); ⊞ apila los componentes de una celda.
- Un componente puede estar en varias etapas/capas: al pasar el ratón **brillan todos sus clones**.
- Relaciones: arrastra desde el punto ● de un componente hasta otro (puede saltar capas y etapas).
  Estilos **directa / troceada / punteada**, dirección (→, ↔, ninguna), color, grosor y etiqueta.
- Exportar todo, exportar sólo el diagrama actual (con los componentes/tipos que usa) e importar JSON (fusiona).
- Deshacer (Ctrl+Z), Supr borra la instancia o relación seleccionada, Esc deselecciona, impresión sólo del tablero.

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
