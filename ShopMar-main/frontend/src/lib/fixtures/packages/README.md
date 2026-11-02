# fixtures/packages/

Líneas base congeladas del listado de paquetes.

Cada archivo es la salida **byte a byte** de la implementación **previa a la
extracción** del `<script>` de `src/pages/packages/index.astro`: la fila
(`buildRow`), el select de envío (`buildShipmentSelect`), el paginador
(`paintPager`) y la banda KPI (`paintPackageKpis` + `paintKpiFilter`). Son el
contrato de los módulos que después se mueven a `src/lib/`.

El estado de tabla **ya no tiene fixtures acá**: los tres que había
(`state-loading.html`, `state-empty.html`, `state-error.html`) describían el
pintor local `package-state.ts`, que se borró en T6 cuando la vista pasó a usar
`lists/list-state.ts` en su modo fila; esa rama la cubren las pruebas de
`src/lib/lists/list-state.test.ts`. Las demás líneas base siguen intactas y son
el contrato de `package-row.ts`, `shipment-status.ts`, `package-pager.ts` y
`kpi-band.ts`. Se generaron desde el commit
`60aede93debecc856f54de6c9804bb4dff09ad61` (rama
`refactor/listados-restantes`) y, por convención, **no llevan salto de línea
final** (la serialización de jsdom tampoco lo produce). Única excepción
deliberada: los cinco fixtures que corrigió el commit del `<td>` anidado (ver
«Actualización deliberada de fixtures»).

## Método del arnés

- jsdom, el mismo entorno de `vitest.config.ts`.
- Las funciones se copiaron **verbatim** desde la página. Únicos ajustes
  mecánicos: `colspan={COLS}` → `colspan="5"` en el HTML inyectado (lo que
  Astro ya compiló) y stubs de `goToPage` / `filtersFromSearch` / `loadKpis` /
  `salesApi.updateShipmentMethod`, porque el arnés no navega ni pide red.
- El HTML de la página se cortó del propio `.astro` (entre el fin del
  frontmatter y el `<script>`) y se inyectó en jsdom: el `[data-row-template]`,
  el `[data-state-template]`, el tbody y el ledger son los nodos reales. Sin
  eso `buildRow` no tiene plantilla que clonar.
- `window.location.search` se fijó con `history.replaceState` para elegir la
  rama de la banda KPI con y sin filtro de método.
- Serialización con `tr.outerHTML` (fila y estado), `div.outerHTML` (el
  `<div class="shipment-wrap">` del select, el paginador y la banda KPI).

## Casos

| Archivo | Caso | Qué discrimina |
|---|---|---|
| `package-row-cargotrans.html` | `shipment_method: cargotrans` | El mapa de estilos del select: `shipment-select--cargotrans`. |
| `package-row-delivery.html` | `delivery` | Igual que el anterior con `shipment-select--delivery`; prueba que el método mueve la clase y no el resto. |
| `package-row-pickup.html` | `pickup` | La rama donde la clave y la etiqueta no coinciden (`pickup` → «En tienda»). |
| `package-row-unassigned.html` | `unassigned` | El cuarto token del mapa, `shipment-select--unassigned`. |
| `shipment-select-pickup.html` | `buildShipmentSelect` con `pickup` | El control construido: las cuatro opciones, el `aria-label` con el nombre de la clienta, el envoltorio `.shipment-wrap` y el caret SVG inline. |
| `pager-first-page.html` | página 1 de 12 | «Anterior» `disabled` y el hueco a la derecha (`page-gap`) antes de la 12. |
| `pager-middle-page-gaps.html` | página 6 de 12 | Los dos `page-gap` (elipsis) y el botón actual con `page-btn--current` + `aria-current="page"`. |
| `pager-last-page.html` | página 12 de 12 | «Siguiente» `disabled` y el hueco a la izquierda. |
| `pager-short-window.html` | página 3 de 5 | La rama `pages <= 7`: todas las páginas visibles, sin elipsis, y «Anterior»/«Siguiente» habilitados. |
| `kpi-band-no-method-filter.html` | sin filtro de método | Las cinco tarjetas visibles y la nota `[data-kpi-note]` sin texto y con su `hidden` inicial **intacto**: sin filtro la nota no se muestra. |
| `kpi-band-method-filter.html` | `shipment_method=delivery` | `data-kpi-filtered` en la banda, las tarjetas de otros métodos con `hidden` y la nota con el texto del aviso. |

## Rarezas preexistentes que estos fixtures fijan y que el refactor debe conservar

- jsdom **no serializa `option.selected`** como atributo. Por eso las cuatro
  filas difieren solo en la clase del select: qué opción queda elegida está en
  la propiedad, no en los bytes. El test nuevo tiene que comparar con la misma
  técnica de serialización; no se puede «arreglar» agregando `selected` a mano.
- `additional_count` **nunca se pinta**: la plantilla de fila solo tiene
  date/customer/product/method/total y `buildRow` no lee ese campo. Una fila con
  `additional_count: 9` es byte a byte idéntica a una con `2`; por eso no hay
  fixture de conteo de artículos.
- La banda KPI de paquetes queda con `aria-busy="true"` **para siempre**:
  `paintPackageKpis`/`paintKpiFilter` nunca la apagan (solo el ledger recibe
  `markBusy`). El `aria-busy="true"` del HTML inicial sobrevive en los dos
  fixtures.
- `paintKpiFilter` **oculta** la nota cuando **no** hay filtro (`note.hidden = !view.filtered` en `kpi-band.ts`) y solo la muestra con un filtro de método activo. Por eso
  `kpi-band-no-method-filter.html` conserva el `hidden` del HTML inicial y
  `kpi-band-method-filter.html` trae la nota visible con el texto del aviso.
  **La autoridad es el fixture:** si el código y estos bytes discrepan, el error está en el código, no en el fixture.

## Actualización deliberada de fixtures

**Segunda actualización** (arreglo de la alineación): los mismos cuatro fixtures de
fila —`package-row-cargotrans.html`, `package-row-delivery.html`,
`package-row-pickup.html`, `package-row-unassigned.html`— cambiaron una vez más,
por otra razón concreta: `cell-clamp` se aplicaba **directo sobre el `<td>` de
mercadería**. Esa clase define `display: -webkit-box` para poder recortar a una
línea, y un `<td>` con otro `display` deja de ser `table-cell`: el navegador lo
computa `flow-root`, `vertical-align: middle` deja de aplicar (el texto quedaba
pegado arriba de la fila) y la celda pierde el `min-width` de `col-product`.
Ahora el recorte vive en un `<span>` hijo, igual que en `sale-list-row.ts`, y el
`<td>` conserva su clase de columna.

En los cuatro archivos el diff es, exactamente:

```diff
-        <td class="cell-clamp" data-cell="product">Sudadera oversize bordada</td>
+        <td class="col-product" data-cell="product"><span class="cell-clamp">Sudadera oversize bordada</span></td>
```

La clase del `<td>` sale de la plantilla de `packages/index.astro`, que también
cambió (`col-product` en vez de `cell-clamp`) para no mentir sobre lo que la fila
produce.

**Primera actualización** (corrección del `<td>` anidado): cinco fixtures se
actualizaron en ese commit, una sola vez y por una razón concreta: la fila
anidaba un `<td>` dentro de `<td class="col-channel">`. La extracción había
conservado ese defecto a propósito —`buildShipmentSelect` devolvía una celda
descartable y `buildRow` la insertaba dentro de la celda de método, HTML
inválido— y este commit lo corrige: el constructor devuelve ahora el
`<div class="shipment-wrap">` que realmente arma y la fila lo inserta directo en
la celda de método.

Los archivos son `package-row-cargotrans.html`, `package-row-delivery.html`,
`package-row-pickup.html`, `package-row-unassigned.html` y
`shipment-select-pickup.html`. En los cuatro de fila el diff es, exactamente, la
eliminación del par `<td>` / `</td>` interno de la celda de método; en
`shipment-select-pickup.html` —que guarda el valor de retorno del constructor— es
la eliminación del par externo, porque ese valor ahora es el `<div>`. No hay
ningún otro cambio: ninguna clase, atributo, texto ni salto de línea se movió.

El otro defecto congelado —el modelo de fila que el manejador del `change` no
actualizaba— no toca fixtures: su corrección y su regresión viven en
`src/lib/packages/shipment-status.test.ts`.

**La regla de no regenerar sigue vigente para todos los demás fixtures** (y para
estos de aquí en adelante): no se tocan para que pase un test. Estos nueve
cambiaron porque el comportamiento cambió, no para maquillar un test rojo.

## Regla

**No se regeneran para que pase un test.** Si un test falla, el error está en el
módulo, no en el fixture. El diff de estos archivos es la mínima señal de que el
refactor cambió algo que no debía.

Las otras pantallas tienen sus propias líneas base y **no se tocan** desde acá:
ventas en `../sales/README.md` y el resumen en `../README.md`. Los gastos están
en `../expenses/README.md`.
