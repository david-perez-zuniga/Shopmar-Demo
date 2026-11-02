# fixtures/sales/

Líneas base congeladas del listado de ventas.

Cada archivo es la salida **byte a byte** de la implementación **previa al
refactor** del `<script>` de `src/pages/sales/index.astro`, capturada con un
arnés descartable. Son el contrato de los módulos que se extraerán a `src/lib/`
(`sale-list-row`, `sale-status`, `confirm-dialog`): el render nuevo tiene que
reproducirlos sin tocar una etiqueta, un atributo ni un espacio. Excepciones
deliberadas **de estas líneas base**, todas registradas en «Actualización
deliberada de fixtures»: `sale-confirm-dialog-cancel.html` y los cuatro
`sale-row-*.html` (los fixtures de paquetes y gastos tienen las suyas en
`../packages/README.md` y `../expenses/README.md`). Se generaron
desde el commit `fbb0b9d20b7f2d1c9e174a8834cdf0c120716fac` (rama
`refactor/sales-scripts`) y, por convención, **no llevan salto de línea final**
(la serialización de jsdom tampoco lo produce).

## Método del arnés

- jsdom, el mismo entorno de `vitest.config.ts`.
- Las funciones (`renderRow`, `buildStatusSelect`, `applySelectLocks`,
  `askConfirm` y su closure: `STATUS_STYLE`, `strong`, `formatReference`,
  `labelFor`, los iconos) se copiaron **verbatim** desde la página. Único ajuste
  mecánico: `askConfirm` recibe `overlay` y `dialogPrompt` por parámetro en vez
  de resolverlos con `qs()`. `onStatusChange` se stubeó porque el arnés nunca
  dispara el evento `change`.
- Serialización con `tr.outerHTML`, `select.outerHTML` y `overlay.outerHTML`.
- El markup estático del diálogo se leyó del propio `index.astro` para que los
  nodos de texto (saltos e indentación) fueran exactos; un test posterior del
  módulo tiene que alimentarle esa misma raíz.

## Casos de las filas (`sale-row-*.html`)

| Archivo | Caso | Qué discrimina |
|---|---|---|
| `sale-row-live-pending.html` | `live` / `pending`, sin adicionales | El camino plano: canal Live, celda de artículos con `—` y look sin tachaduras. |
| `sale-row-whatsapp-completed.html` | `whatsapp` / `completed`, 2 adicionales | La píldora Tienda, el chip `2 arts.` (plural) y el look completado. |
| `sale-row-live-cancelled.html` | `live` / `cancelled` | La clase `row--cancelled`, las celdas tachadas, el icono de recibo en vez de impresora y sus títulos de «venta cancelada». |
| `sale-row-whatsapp-additional.html` | `whatsapp` / `pending`, 1 adicional | La rama singular de la pluralización: `1 art.`. |

Misma fecha (`2025-03-14`) e id en las cuatro para que el diff sea mínimo;
solo varía lo que cada caso necesita discriminar.

## Casos de los selects (`sale-status-select-*.html`)

| Archivo | Caso | Qué discrimina |
|---|---|---|
| `sale-status-select-pending.html` | `pending` | Select desbloqueado con clase `status-select--pending` y `title` de confirmación rápida. |
| `sale-status-select-completed.html` | `completed` | Igual que el anterior con `status-select--completed`; prueba que el estado mueve la clase y no el resto. |
| `sale-status-select-cancelled-locked.html` | `cancelled` (final) | El bloqueo: `disabled`, `status-select--locked`, `title` definitivo y `aria-label` de cancelada. |

`buildStatusSelect` ya llama a `applySelectLocks` internamente, así que para
`cancelled` el mismo select sale bloqueado: **no existe un fixture «cancelled»
sin bloquear**; serían bytes idénticos al `-locked`.

## Casos del diálogo (`sale-confirm-dialog-*.html`)

| Archivo | Caso | Qué discrimina |
|---|---|---|
| `sale-confirm-dialog-cancel.html` | `next: cancelled`, sin pago | El aviso largo de cancelación y el `<strong class="modal-target--error">`; el bloque de pago queda oculto y el botón de confirmar queda habilitado. |
| `sale-confirm-dialog-payment.html` | `next: completed`, con pago | El bloque de pago visible con total y método, y el `<strong>` de completada sin clase de error. |

## Rarezas preexistentes que estos fixtures fijan

- `applySelectLocks` crea la nota `<p class="status-locked">` pero la descarta
  cuando el select todavía no está dentro de `.status-wrap` (el camino de
  `renderRow`). Por eso una fila cancelada recién pintada no trae la nota; la
  nota solo aparece tras un cambio de estado en una fila montada.
- jsdom **no serializa `option.selected`** como atributo: los fixtures de
  `<select>` fijan clase, `title`, `disabled` y `aria-label`, pero no qué
  opción queda elegida. El test nuevo tiene que comparar con la misma técnica de
  serialización; no se puede «arreglar» agregando `selected` a mano.

## Actualización deliberada de fixtures

**Quinta actualización** (columna «Cobro», venta a crédito): los cuatro
fixtures de fila quedaron capturados **antes** de que existiera la columna de
cobro (D-022). La fila real ahora tiene una celda más —saldo y «Vence …» en
crédito, «Pagada» cuando el saldo es cero, guion en contado— y un botón
«Registrar pago» en las acciones cuando la venta es a crédito y debe. La prueba
de equivalencia despega **esa celda** del `<tr>` antes de comparar y verifica la
celda nueva por separado, así que la línea base sigue cubriendo el resto de la
fila byte a byte; regenerar los archivos para que incluyan la celda es una
tarea pendiente y no un cambio de la regla.

**Cuarta actualización** (columna de precio eliminada, pedido de la dueña):
los cuatro fixtures de fila —`sale-row-live-pending.html`,
`sale-row-whatsapp-completed.html`, `sale-row-live-cancelled.html` y
`sale-row-whatsapp-additional.html`— cambiaron una vez más porque el
comportamiento cambió **a propósito**. La tabla del listado mostraba dos
columnas de dinero: la del precio (`cost`) y la del total. La del precio
repetía el mismo número que **Total** en toda venta sin artículos adicionales y
su encabezado había derivado en un segundo «Total», así que la dueña pidió
quitarla. El listado queda con una sola columna de dinero, y la fila pasa de
nueve a ocho celdas.

En los tres primeros archivos el diff es, exactamente, la eliminación de una
celda; en el cuarto cambia solo su clase, porque la fila está tachada:

```diff
-<td class="right num-sm cell-muted">C$ 1,250.00</td>
```

```diff
-<td class="right num-sm cell-outline cell-struck">C$ 1,250.00</td>
```

Nada más cambia: ni una etiqueta, ni un texto, ni el orden de los atributos, y
los archivos siguen **sin salto de línea final**.

**Tercera actualización** (D-017, detalle en el cliente): los cuatro fixtures de
fila volvieron a cambiar porque la forma de la URL del detalle cambió **a
propósito**. `src/pages/sales/[id].astro` dejó de existir y el detalle pasó a
`/sales/detail?id=<uuid>` (D-017 en `specs/docs/07-decisiones.md`). En los cuatro
archivos el diff es, exactamente, el valor de los dos `href`:

```diff
- href="/sales/s-20250314-001?print=1"
+ href="/sales/detail?id=s-20250314-001&amp;print=1"
- href="/sales/s-20250314-001"
+ href="/sales/detail?id=s-20250314-001"
```

El `&` del enlace de impresión va escapado como `&amp;` porque es lo que
serializa `outerHTML`; el archivo sigue **sin salto de línea final**. No cambia
ninguna otra etiqueta, ningún texto, ni el orden de los atributos.

**Segunda actualización** (fila clickeable): los cuatro fixtures de fila —
`sale-row-live-pending.html`, `sale-row-whatsapp-completed.html`,
`sale-row-live-cancelled.html` y `sale-row-whatsapp-additional.html`— cambiaron
una vez porque el comportamiento cambió a propósito: el enlace **Ver detalle**
necesita un gancho estable para que la fila pueda reemitirle el clic, y ese
gancho no puede ser una clase de estilo. `renderSaleListRow` ahora le pone
`data-detail` y `row-navigation.ts` busca ese atributo. Ver
`odd/tasks/filas-ventas-clicables.md`.

En los cuatro archivos el diff es, exactamente:

```diff
-<a class="text-btn" href="/sales/s-20250314-001">Ver detalle</a>
+<a class="text-btn" data-detail="" href="/sales/s-20250314-001">Ver detalle</a>
```

El atributo entra entre `class` y `href` porque así lo escribe el render (jsdom
serializa en orden de inserción). Nada más cambia: ni una etiqueta, ni un texto,
ni un salto de línea.

**Primera actualización** (diálogo de cancelación):
`fixtures/sales/sale-confirm-dialog-cancel.html` se actualizó en ese commit,
una sola vez y por una razón concreta: el diálogo sin paso de pago tenía un
defecto alcanzable que impedía confirmar una cancelación desde la UI. El botón
de confirmar quedaba `disabled` y, aun habilitado, `settle()` resolvía
`{ ok: false }` porque el input de pago vacío no daba centavos. Ambas causas se
arreglaron en `src/lib/sales/confirm-dialog.ts` y el comportamiento cambió **a
propósito**.

Por eso el diff de ese fixture es, exactamente, la eliminación de un único
atributo: `disabled=""` en `#confirm-state`. No hay ningún otro cambio, ni
reordenamiento de atributos ni atributos agregados o quitados. El fixture sigue
siendo la salida real del módulo, solo que de la salida **arreglada**.

**La regla de no regenerar sigue vigente para todos los demás fixtures** (y para
todos estos de aquí en adelante): no se tocan para que pase un test. Los cinco de
`../packages/` cambiaron por su propio motivo deliberado, registrado en
`../packages/README.md`, y los tres de `../expenses/` en el suyo, en
`../expenses/README.md`; todos cambiaron porque el comportamiento cambió, no para
maquillar un test rojo.

## Regla

**No se regeneran para que pase un test.** Si un test falla, el error está en el
módulo, no en el fixture. El diff de estos archivos es la mínima señal de que el
refactor cambió algo que no debía.

El Resumen tiene sus propias líneas base en `../` (bar-chart, donuts, tooltip);
son de otro slice de review y **no se tocan** desde acá.
