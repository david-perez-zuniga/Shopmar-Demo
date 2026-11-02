# fixtures/expenses/

Líneas base congeladas del listado de gastos.

Cada archivo es la salida **byte a byte** de la implementación **previa a la
extracción** del `<script>` de `src/pages/expenses/index.astro`: la fila de la
tabla (`renderRow`) y la banda KPI (`paintKpi`). Son el contrato de los módulos
que después se mueven a `src/lib/`: el render nuevo tiene que reproducirlas sin
tocar una etiqueta, un atributo ni un espacio. Se generaron desde el commit
`60aede93debecc856f54de6c9804bb4dff09ad61` (rama
`refactor/listados-restantes`) y, por convención, **no llevan salto de línea
final** (la serialización de jsdom tampoco lo produce).

## Método del arnés

- jsdom, el mismo entorno de `vitest.config.ts`.
- `paintKpi` y `renderRow` se copiaron **verbatim** desde la página, sin
  reescribir expresiones ni reordenar sentencias.
- El HTML de la página se cortó del propio `.astro` (entre el fin del
  frontmatter y el `<script>`) y se inyectó en jsdom: la banda KPI, el
  `[data-kpi-label]`, el `[data-kpi-note]` y el `[data-kpi='total']` son los
  nodos reales de la página, no una imitación. No hubo ningún ajuste mecánico al
  cortar el HTML: a diferencia del listado de paquetes, `pages/expenses/index.astro`
  no declara `colspan` ni `COLS`, así que lo inyectado es literal.
- `window.location.search` se fijó con `history.replaceState` para elegir la
  rama con y sin filtro de fechas.
- Serialización con `section.outerHTML` (banda) y `tr.outerHTML` (filas).
- Limitación anotada: dentro de `.kpi-icon` el fixture guarda el parseo que
  jsdom hace de la etiqueta Astro `<Wallet size={18} />`
  (`<wallet size="{18}">`), **no** el SVG renderizado que sirve la página:
  jsdom no evalúa componentes de Astro. `paintKpi` nunca escribe en ese
  subárbol, así que el resto de los bytes sí es la salida real.

## Casos

| Archivo | Caso | Qué discrimina |
|---|---|---|
| `expense-row-with-description.html` | descripción presente | El camino normal: la celda `col-desc` lleva el texto como nodo de texto plano dentro del `<span class="cell-clamp">` que lo recorta. |
| `expense-row-without-description.html` | `description: null` | La rama del guion: `<span class="cell-muted">—</span>` dentro del `<span class="cell-clamp">`. |
| `expense-row-long-description.html` | descripción larga (con `&`) | El recorte visual **no** cambia el marcado: `cell-clamp` es incondicional, así que solo difieren los bytes del texto (y el escape `&amp;`). |
| `kpi-band-no-date-filter.html` | sin filtro de fechas | Etiqueta «Total Gastos (Mes)», nota «Sin filtro de fechas: todo el historial», `aria-busy="false"` en la banda y el total `C$ 16,901.25` (suma de los tres gastos). |
| `kpi-band-date-filter.html` | `start_date=2025-03-01&end_date=2025-03-31` | Etiqueta «Total Gastos (Rango)» y nota «Entre 01/03/2025 y 31/03/2025»; mismo total y mismo `aria-busy="false"`. |

## Actualización deliberada de fixtures

Los tres fixtures de fila se actualizaron una sola vez, y por una razón concreta:
`cell-clamp` se aplicaba **directo sobre el `<td>` de descripción**. Esa clase
define `display: -webkit-box` para poder recortar a una línea, y un `<td>` con
otro `display` deja de ser `table-cell`: el navegador lo computa `flow-root`,
`vertical-align: middle` deja de aplicar (el texto quedaba pegado arriba de la
fila) y la celda perdía el `min-width` de `col-desc`. Ahora el recorte vive en un
`<span>` hijo, igual que en `sale-list-row.ts`, y el `<td>` conserva su clase de
columna.

En los tres archivos el diff es, exactamente:

```diff
-<td class="cell-clamp col-desc">Reposición de sudaderas para la temporada.</td>
+<td class="col-desc"><span class="cell-clamp">Reposición de sudaderas para la temporada.</span></td>

-<td class="cell-clamp col-desc"><span class="cell-muted">—</span></td>
+<td class="col-desc"><span class="cell-clamp"><span class="cell-muted">—</span></span></td>
```

El mismo `<td>` era, además, la razón por la que la hoja no lograba ocultar la
columna en móvil: `.cell-clamp` tiene la misma especificidad que `.col-desc` y
aparecía después, así que el `display: none` del `@media (max-width: 767px)`
solo alcanzaba al `<th>`. Esa regla se eliminó: en móvil la tabla se desplaza en
horizontal, como las otras listas.

**La regla de no regenerar sigue vigente para todos los demás fixtures** (y para
estos de aquí en adelante): no se tocan para que pase un test. Estos tres
cambiaron porque el comportamiento cambió, no para maquillar un test rojo.

## Regla

**No se regeneran para que pase un test.** Si un test falla, el error está en el
módulo, no en el fixture. El diff de estos archivos es la mínima señal de que el
refactor cambió algo que no debía.

Las otras pantallas tienen sus propias líneas base y **no se tocan** desde acá:
ventas en `../sales/README.md` (filas, selects de estado y diálogo de
confirmación) y el resumen en `../README.md` (gráficos de barras, donuts y
tooltip). Los paquetes están en `../packages/README.md`.

## Actualización deliberada (S36)

`kpi-band-no-date-filter.html` cambió una vez porque el comportamiento cambió **a
propósito**: el filtro de fechas ahora arranca en **Hoy** en todas las pantallas,
así que el caso «sin query» ya no es «sin rango». La banda rotula
`Total Gastos (Rango)` donde antes decía `Total Gastos (Mes)`, porque ahora hay un
rango aplicado: hoy y solo hoy. El único diff es ese rótulo.
