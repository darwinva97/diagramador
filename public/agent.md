# Drawer — guía para agentes (API REST)

Drawer (antes “Diagramador”) es un editor de diagramas de arquitectura por **capas (filas) × etapas (columnas)**.
El identificador técnico no cambió: el fichero de exportación sigue llevando `"app": "diagramador"` y la base URL es la misma.
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

StyleRule (regla de estilo: pinta los componentes según sus datos)
 ├─ conditions[]   Condition { source, key?, op, value? }
 │                  source ∈ field | name | description | type | library | people | role
 │                  op ∈ eq | ne | contains | notContains | in | empty | notEmpty | gt | lt | regex
 │                  match: 'all' (todas) | 'any' (alguna)
 ├─ style          RuleStyle: bg, text, border, borderWidth, borderStyle, accent, accentWidth,
 │                  top, topWidth, opacity, glow, badge, badgeText, icon, bold, strike.
 │                  Sólo lo que defina; el resto lo aportan reglas de menor prioridad.
 └─ priority       Mayor número manda cuando dos reglas pintan lo MISMO. Las que casan se
                    aplican de menor a mayor, propiedad a propiedad.

Person (persona del espacio de trabajo, compartida por todos los diagramas)
 └─ assignments[]  Assignment { id, kind, targetId, role, notes? }
                    kind ∈ component | diagram | layer | stage | type
                    targetId = id de eso · role = "Owner", "Líder técnico"… (texto libre)
                    Responde a "quién participa en cada parte y con qué papel".

Diagram
 ├─ layers[]       Layer { id, name, color, height? }          ← filas
 ├─ stages[]       Stage { id, name, width?, groupId? }        ← columnas
 │                  groupId = grupo al que pertenece la etapa (o null).
 ├─ stageGroups[]  StageGroup { id, name, color? }
 │                  Banda por encima de las columnas ("Evaluación rápida" sobre 6 etapas).
 │                  Sólo se dibujan juntas las etapas CONTIGUAS del mismo grupo.
 ├─ placements[]   Placement { id, componentId, layerId, stageId, x, y, parentId|null }
 │                  = una INSTANCIA de un componente en una celda (capa × etapa).
 │                  Un mismo componente puede tener varias instancias (clones) en distintas celdas.
 │                  parentId = instancia contenedora (subcomponente, p. ej. microservicio dentro de su API).
 │                  x, y = posición en px dentro de la celda (rejilla de 8); se ignoran si tiene parentId.
 └─ relations[]    Relation { id, from, to, style, dir, color, width, label, fromField?, toField? }
                    from/to son ids de PLACEMENTS (instancias), no de componentes.
                    style ∈ solid | dashed | dotted · dir ∈ fwd | both | none
                    fromField/toField = conexión a nivel de CAMPO (opcional). Ruta del campo:
                    la clave del campo, y dentro de un campo JSON la ruta hasta la hoja:
                    "response_body.datos.id", "request_body.items[].sku". La app la dibuja
                    sobre la flecha y la ofrece en un desplegable generado desde el JSON.
```

Reglas: un componente vive en una biblioteca; para dibujarlo se crea un placement en un diagrama.
Las relaciones pueden unir cualquier par de instancias, aunque estén en capas o etapas no contiguas.

## Flujo típico para crear un diagrama desde cero

1. `POST /libraries` `{ "name": "Mi arquitectura" }` → `libId`
2. `POST /libraries/{libId}/types` `{ "name": "API", "color": "#2563eb", "icon": "🔌", "fields": [ { "key": "method", "label": "Método", "kind": "select", "options": "GET, POST, PUT, DELETE" }, { "key": "path", "label": "Path", "kind": "text" } ] }` → `typeId`
3. `POST /libraries/{libId}/components` `{ "name": "API Pedidos", "typeId": "<typeId>", "fields": { "method": "POST", "path": "/pedidos" } }` → `componentId`
4. `POST /diagrams` `{ "name": "Flujo de pedido", "layers": [ { "name": "Presentación" }, { "name": "Lógica" }, { "name": "Datos" } ], "stages": [ { "name": "Captura" }, { "name": "Proceso" } ] }`
   → respuesta con los ids de `layers[]` y `stages[]`. (Si omites layers/stages se usan las capas por defecto: Sub Procesos, APIs Experiencia, APIs Proceso, APIs Negocio, APIs Sistema (SYS) y BACKEND.)
5. `POST /diagrams/{diagId}/placements` `{ "componentId": "<componentId>", "layerId": "<layerId>", "stageId": "<stageId>" }` → `placementId`
   - Posición opcional `x`, `y`. Sin posición se apila automáticamente.
   - Subcomponente: añade `"parentId": "<placementId del contenedor>"` (debe estar en la misma celda; el servidor lo mueve si no).
6. `POST /diagrams/{diagId}/relations` `{ "from": "<placementId A>", "to": "<placementId B>", "style": "dashed", "label": "persiste" }`
   - Conexión por campos (opcional): `"fromField": "response_body.aliadoId", "toField": "request_body.aliadoId"`.


## Endpoints

| Recurso | Métodos |
|---|---|
| `/auth/me` | GET |
| `/rules` | GET (lista completa), POST `{ name, conditions, style, priority? }` |
| `/rules/{id}` | GET, PUT, PATCH, DELETE |
| `/people` | GET (lista completa), POST `{ name, email?, title?, team?, color? }` |
| `/people/{id}` | GET, PUT (reemplazo), PATCH (parcial), DELETE |
| `/people/{id}/assignments` · `/people/{id}/assignments/{assignmentId}` | POST `{ kind, targetId, role }` · DELETE |
| `/libraries` | GET (lista completa), POST |
| `/libraries/{id}` | GET, PUT (reemplazo completo), PATCH (parcial), DELETE |
| `/libraries/{id}/types` · `/libraries/{id}/types/{typeId}` | POST · PUT, DELETE |
| `/libraries/{id}/components` · `/libraries/{id}/components/{componentId}` | POST · PUT, DELETE (también quita sus instancias de todos los diagramas) |
| `/diagrams` | GET (resúmenes con contadores), POST |
| `/diagrams/{id}` | GET (completo), PUT, PATCH (p. ej. `{ "name": ... }`), DELETE |
| `/diagrams/{id}/layers` · `/diagrams/{id}/layers/{layerId}` | POST `{ name, color? }` · PUT, DELETE |
| `/diagrams/{id}/stages` · `/diagrams/{id}/stages/{stageId}` | POST `{ name, width?, groupId? }` · PUT, DELETE |
| `/diagrams/{id}/stageGroups` · `/diagrams/{id}/stageGroups/{groupId}` | POST `{ name, color? }` · PUT, DELETE |
| `/diagrams/{id}/placements` · `/diagrams/{id}/placements/{placementId}` | POST · PUT (mover: layerId/stageId/x/y/parentId), DELETE (borra subcomponentes y relaciones) |
| `/diagrams/{id}/relations` · `/diagrams/{id}/relations/{relationId}` | POST · PUT, DELETE |
| `/diagrams/{id}/export` | GET → `{ libraries (sólo lo usado), diagrams: [diagrama] }` |
| `/export` | GET → todo (bibliotecas, diagramas, personas y reglas) |
| `/import` | POST `{ libraries?, diagrams?, people?, rules? }` → upsert por id (formato de exportación de la app) |
| `/api-keys` · `/api-keys/{id}` | GET, POST `{ name }` · DELETE |

Todas las rutas son absolutas tal cual aparecen aquí: un sub-recurso **siempre** lleva el prefijo de su padre
(`PUT /libraries/{id}/components/{componentId}`, no `PUT /components/{componentId}`).

PUT sobre un sub-recurso hace merge de los campos enviados (no hace falta reenviar el objeto completo).
En un componente, `fields` se reemplaza entero: manda el objeto completo, no sólo las claves que cambian.
PUT sobre `/diagrams/{id}` o `/libraries/{id}` reemplaza el documento entero: úsalo con lo devuelto por GET.

## Consejos

- Lee `GET /diagrams/{id}` antes de modificar: obtén ids reales de capas, etapas e instancias.
- Para "el mismo componente en dos etapas" crea dos placements con el mismo `componentId`; la app los resalta como clones.
- **Reglas de estilo:** para "si el campo estado vale CONFIRMADO, píntalo verde" basta
  `POST /rules` `{ "name": "Estado: CONFIRMADO", "priority": 10,
  "conditions": [{ "source": "field", "key": "estado", "op": "eq", "value": "CONFIRMADO" }],
  "style": { "accent": "#16a34a", "accentWidth": 5 } }`. Reparte prioridades de 10 en 10 para
  poder intercalar después, y usa números altos para las reglas que deban mandar.
- **Personas:** crea la persona con `POST /people` `{ "name": "Cesar Lama", "title": "Líder técnico" }` y luego
  añade participaciones con `POST /people/{id}/assignments` `{ "kind": "component", "targetId": "<componentId>", "role": "Owner" }`.
  Un mismo `targetId` puede tener varias personas y una persona varios papeles.
- Colores: hex `#rrggbb`. Colores de capa sugeridos (pastel): `#fef9c3 #e0f2fe #ccfbf1 #ede9fe #fce7f3`.
- **Agrupar etapas:** crea el grupo con `POST /diagrams/{id}/stageGroups` `{ "name": "Evaluación rápida" }` y luego
  pon `groupId` en cada etapa con `PUT /diagrams/{id}/stages/{stageId}`. Ordena las etapas de forma que las del
  grupo queden seguidas: si se intercala una etapa ajena, la banda se parte en dos tramos.
- Iconos de tipo: un emoji. Campos `json`: envía el JSON como **string**.
- **Contratos de API:** usa campos `json` para `request_body` / `response_body`. La app reconoce su estructura
  (campos, tipos y ejemplos, incluidos objetos anidados y arrays) y esos campos son los que se pueden elegir
  en `fromField` / `toField` de una relación. Escribe JSON de **ejemplo** con valores representativos:
  de ahí salen el tipo y el ejemplo que ve el usuario.
- Todo lo que hagas por API aparece en la app del usuario en cuanto recargue o, si tiene la sesión abierta, al volver a sincronizar.
- Sé conservador: no borres bibliotecas o diagramas que no hayas creado salvo que el usuario lo pida.
