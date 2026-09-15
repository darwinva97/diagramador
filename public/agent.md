# Diagramador — guía para agentes (API REST)

Diagramador es un editor de diagramas de arquitectura por **capas (filas) × etapas (columnas)**.
Toda la funcionalidad de la app está disponible por API. Sólo necesitas una **API key** del usuario.

- **Base URL:** `https://draw.bezenti.com/api/v1`
- **Autenticación:** cabecera `Authorization: Bearer dgk_...` en todas las peticiones.
- **Formato:** JSON en request y response. Errores: `{ "error": "mensaje" }` con código HTTP 400/401/404/409/500.
- **OpenAPI:** `https://draw.bezenti.com/openapi.json`
- Los **ids** los genera el servidor (cadenas cortas). Guarda los ids que te devuelve cada creación: los necesitas para relacionar recursos.

Comprueba la clave: `GET /auth/me` → `{ "user": { "id", "email" }, "via": "apikey" }`.

## Modelo de datos (léelo antes de crear nada)

```
Library (biblioteca, global para todos los diagramas)
 ├─ types[]        ComponentType { id, name, color, icon, fields[] }
 │                  fields[]: FieldDef { key, label, kind, options? }
 │                  kind ∈ text | textarea | number | select | checkbox | url | date | list | keyvalue | json
 │                  options: 'select' → "A, B, C"; 'keyvalue' → "Etiqueta clave|Etiqueta valor"
 └─ components[]   Component { id, name, typeId|null, description, fields: { [key]: valor } }
                    valor según kind: list → string[]; keyvalue → [{key,value}]; json → string JSON; checkbox → boolean

Diagram
 ├─ layers[]       Layer { id, name, color, height? }          ← filas
 ├─ stages[]       Stage { id, name, width? }                  ← columnas
 ├─ placements[]   Placement { id, componentId, layerId, stageId, x, y, parentId|null }
 │                  = una INSTANCIA de un componente en una celda (capa × etapa).
 │                  Un mismo componente puede tener varias instancias (clones) en distintas celdas.
 │                  parentId = instancia contenedora (subcomponente, p. ej. microservicio dentro de su API).
 │                  x, y = posición en px dentro de la celda (rejilla de 8); se ignoran si tiene parentId.
 └─ relations[]    Relation { id, from, to, style, dir, color, width, label }
                    from/to son ids de PLACEMENTS (instancias), no de componentes.
                    style ∈ solid | dashed | dotted · dir ∈ fwd | both | none
```

Reglas: un componente vive en una biblioteca; para dibujarlo se crea un placement en un diagrama.
Las relaciones pueden unir cualquier par de instancias, aunque estén en capas o etapas no contiguas.

## Flujo típico para crear un diagrama desde cero

1. `POST /libraries` `{ "name": "Mi arquitectura" }` → `libId`
2. `POST /libraries/{libId}/types` `{ "name": "API", "color": "#2563eb", "icon": "🔌", "fields": [ { "key": "method", "label": "Método", "kind": "select", "options": "GET, POST, PUT, DELETE" }, { "key": "path", "label": "Path", "kind": "text" } ] }` → `typeId`
3. `POST /libraries/{libId}/components` `{ "name": "API Pedidos", "typeId": "<typeId>", "fields": { "method": "POST", "path": "/pedidos" } }` → `componentId`
4. `POST /diagrams` `{ "name": "Flujo de pedido", "layers": [ { "name": "Presentación" }, { "name": "Lógica" }, { "name": "Datos" } ], "stages": [ { "name": "Captura" }, { "name": "Proceso" } ] }`
   → respuesta con los ids de `layers[]` y `stages[]`. (Si omites layers/stages se usan las capas de la plantilla Aliados.)
5. `POST /diagrams/{diagId}/placements` `{ "componentId": "<componentId>", "layerId": "<layerId>", "stageId": "<stageId>" }` → `placementId`
   - Posición opcional `x`, `y`. Sin posición se apila automáticamente.
   - Subcomponente: añade `"parentId": "<placementId del contenedor>"` (debe estar en la misma celda; el servidor lo mueve si no).
6. `POST /diagrams/{diagId}/relations` `{ "from": "<placementId A>", "to": "<placementId B>", "style": "dashed", "label": "persiste" }`

Atajo: `POST /templates/aliados/apply` `{ "name": "Mi copia" }` crea una biblioteca y un diagrama completos de ejemplo (APIs con microservicios anidados, subprocesos y backends).

## Endpoints

| Recurso | Métodos |
|---|---|
| `/auth/me` | GET |
| `/libraries` | GET (lista completa), POST |
| `/libraries/{id}` | GET, PUT (reemplazo completo), PATCH (parcial), DELETE |
| `/libraries/{id}/types` · `/types/{typeId}` | POST · PUT, DELETE |
| `/libraries/{id}/components` · `/components/{componentId}` | POST · PUT, DELETE (también quita sus instancias de todos los diagramas) |
| `/diagrams` | GET (resúmenes con contadores), POST |
| `/diagrams/{id}` | GET (completo), PUT, PATCH (p. ej. `{ "name": ... }`), DELETE |
| `/diagrams/{id}/layers` · `/layers/{layerId}` | POST `{ name, color? }` · PUT, DELETE |
| `/diagrams/{id}/stages` · `/stages/{stageId}` | POST `{ name, width? }` · PUT, DELETE |
| `/diagrams/{id}/placements` · `/placements/{pid}` | POST · PUT (mover: layerId/stageId/x/y/parentId), DELETE (borra subcomponentes y relaciones) |
| `/diagrams/{id}/relations` · `/relations/{rid}` | POST · PUT, DELETE |
| `/diagrams/{id}/export` | GET → `{ libraries (sólo lo usado), diagrams: [diagrama] }` |
| `/export` | GET → todo (bibliotecas y diagramas) |
| `/import` | POST `{ libraries?, diagrams? }` → upsert por id (formato de exportación de la app) |
| `/templates` · `/templates/aliados/apply` | GET · POST `{ name? }` |
| `/api-keys` · `/api-keys/{id}` | GET, POST `{ name }` · DELETE |

PUT sobre un sub-recurso hace merge de los campos enviados (no hace falta reenviar el objeto completo).
PUT sobre `/diagrams/{id}` o `/libraries/{id}` reemplaza el documento entero: úsalo con lo devuelto por GET.

## Consejos

- Lee `GET /diagrams/{id}` antes de modificar: obtén ids reales de capas, etapas e instancias.
- Para "el mismo componente en dos etapas" crea dos placements con el mismo `componentId`; la app los resalta como clones.
- Colores: hex `#rrggbb`. Colores de capa sugeridos (pastel): `#fef9c3 #e0f2fe #ccfbf1 #ede9fe #fce7f3`.
- Iconos de tipo: un emoji. Campos `json`: envía el JSON como **string**.
- Todo lo que hagas por API aparece en la app del usuario en cuanto recargue o, si tiene la sesión abierta, al volver a sincronizar.
- Sé conservador: no borres bibliotecas o diagramas que no hayas creado salvo que el usuario lo pida.
