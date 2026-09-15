---
name: diagramador
description: Crear y editar diagramas de arquitectura por capas × etapas en Diagramador (draw.bezenti.com) mediante su API REST con una API key. Úsalo cuando el usuario pida crear/modificar diagramas, bibliotecas de componentes, tipos, componentes, instancias o relaciones en Diagramador.
---

# Diagramador (API)

Necesitas la **API key** del usuario (`dgk_…`). Todas las llamadas van a `https://draw.bezenti.com/api/v1`
con `Authorization: Bearer <key>` y JSON.

Antes de operar, lee la guía completa (modelo de datos, flujo y endpoints):
`https://draw.bezenti.com/agent.md` (también en `public/agent.md` de este repo) y, si necesitas detalle de
esquemas, `https://draw.bezenti.com/openapi.json`.

Resumen del modelo: **Biblioteca** → tipos y componentes. **Diagrama** → capas (filas), etapas (columnas),
**instancias** (`placements`: componente en una celda, con `parentId` para subcomponentes) y **relaciones**
(entre ids de instancias). Flujo: crear biblioteca → tipos → componentes → diagrama → placements → relations.
