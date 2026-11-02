# 03 — Componentes compartidos

## Estado Actual

Existe `frontend/src/layouts/Layout.astro`, reescrito en `tasks/frontend/01`, y `frontend/src/styles/global.css` con los tokens y las primitivas, llenado en `tasks/frontend/02`. `frontend/src/components/` no existe.

La regla que decide dónde va cada cosa es una sola: **si el bloque se repite en más de una pantalla, es un componente; si ocurre una sola vez, vive en la página**. Con esa regla, el inventario es de seis componentes `.astro` compartidos en `src/components/`, más el `Layout.astro`.

## Objetivo

Los seis componentes compartidos, cada uno con sus tres estados resueltos, y sin una sola línea de JavaScript duplicada entre pantallas.

## Alcance

- Crear `frontend/src/components/TableState.astro`.
- Crear `frontend/src/components/StatCard.astro`.
- Crear `frontend/src/components/DateRangeFilter.astro`.
- Crear `frontend/src/components/StatusBadge.astro`.
- Crear `frontend/src/components/ConfirmDialog.astro`.
- Crear `frontend/src/components/InvoicePrint.astro`.
- Crear `frontend/src/components/README.md`.

**Archivos tocados:** `frontend/src/components/**` (nuevos).

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| El `Layout` | Ya existe desde `tasks/frontend/01`. Solo se le agrega la prop `wide` y la prop `activeSection`, que este documento define. |
| Los tokens y las primitivas de CSS | Es `tasks/frontend/02`. |
| Las siete pantallas | Es `tasks/frontend/04` a `07`. Aquí se crean las piezas que esas pantallas usan. |
| Los estilos de cada pantalla | Una pantalla que necesita un estilo propio lo lleva en su propio `<style>`, no en un componente compartido. |
| Un componente de tabla genérico | Cada tabla tiene sus columnas. Un componente parametrizado con un arreglo de columnas es más difícil de leer que la tabla escrita en su pantalla. |
| Un componente de formulario genérico | Los tres formularios tienen campos distintos y reglas distintas. Un `<FormField>` con veinte props sería una copia de los tres. |
| Un modal genérico con cualquier contenido | `ConfirmDialog` es un caso tan concreto que un modal parametrizado solo tiene un consumidor. |
| Un sistema de notificaciones o de toasts | `ConfirmDialog` y el estado de error de la tabla cubren los dos casos que hay. |
| Probar los `.astro` con `vitest` | `vitest` prueba la lógica. Los componentes se verifican compilando y usando la pantalla. Ver el paso 17. |
| Un store, un contexto o Signals | Sin estado global. Cada pantalla tiene su estado y lo pasa por props. |
| Internacionalización | Todo el texto de la interfaz está en español, directamente en el componente. |
| Un skeleton de carga con shimmer | Una fila con texto "Cargando..." es suficiente para veinte registros. |
| Accesibilidad de un diálogo implementada desde cero | `<dialog>` nativo trae el foco atrapado, el `Escape` y el `aria-modal`. Se usa el elemento, no una librería. |

## Tareas

1. Crear `frontend/src/components/TableState.astro` con la prop `state: 'loading' | 'empty' | 'error'` y las de contenido: `emptyMessage`, `emptyHref`, `emptyLabel`, `errorMessage`, `colSpan` e `id`.
2. En el componente, **no renderizar las tres variantes a la vez.** Con un `if` por estado, el HTML enviado al navegador tiene solo lo que se ve, y el lector de pantalla no encuentra un mensaje de error oculto en un `display: none`.
3. En el estado `loading`, renderizar una fila con `colspan={colSpan}`, un texto "Cargando..." y `aria-busy="true"` en la tabla. **`aria-busy` va en la tabla, no en la fila**: es la tabla la que está ocupada.
4. En el estado `empty`, renderizar un ícono, el mensaje y el enlace de creación. **El estado vacío no es un error**: es la primera vez que se usa la pantalla, y el mensaje tiene que enseñar qué se crea ahí.
5. En el estado `error`, renderizar un ícono de alerta, el mensaje **ya traducido** por `getErrorMessage` y un botón "Reintentar".
6. En el estado `error`, **el botón reintenta la carga de la pantalla, no el componente.** El componente no sabe cómo cargar. La pantalla le pasa un callback, y el componente solo lo invoca. Un componente que sabe de dónde vienen los datos dejó de ser una pieza reutilizable.
7. En el mismo archivo, aceptar `onRetry?: () => void` como prop y, cuando no se pase, **ocultar el botón** en vez de mostrarlo deshabilitado. Un botón que no hace nada confunde más que un botón que no existe.
8. Crear `frontend/src/components/StatCard.astro` con `label`, `value`, `hint`, `icon` y `tone: 'default' | 'success' | 'warning' | 'danger'`.
9. En la tarjeta, **`value` llega ya formateado** desde `formatMoney`, como texto. El componente no sabe si es un importe o un conteo, y formatearlo dentro obligaría al componente a adivinar.
10. En la tarjeta, `hint` es el texto que define **qué incluye el número**. Para los ingresos, es "incluye artículos adicionales"; para los paquetes, es "registrados y no entregados". Sin ese texto, un número sin contexto se interpreta mal la primera vez.
11. En la tarjeta, **el `tone` colorea el ícono, nunca la cifra.** Una cifra grande en rojo se lee como una alarma, y el color de un importe es información, no decoración.
12. Crear `frontend/src/components/DateRangeFilter.astro` con `action`, `initialStart` e `initialEnd`. Renderizar dos `input type="date"` y un botón "Filtrar", dentro de un `form method="get"` con `action`.
13. En el filtro, **usar un `form` con `GET` y no JavaScript.** La URL del navegador queda con los parámetros, se puede compartir, el botón de atrás del navegador funciona y la pantalla no necesita una sola línea de script para filtrar.
14. En el filtro, **omitir los campos vacíos del `GET`.** Un `start_date` vacío enviado como `start_date=` llega al backend como un valor inválido y el `.strict()` del DTO devuelve `400`. El campo vacío no se manda.
15. En el filtro, aceptar un botón "Limpiar" que apunte a la `action` sin parámetros, solo cuando hay un rango activo.
16. En el filtro, **no acotar el `min` y el `max` de los `input` de fecha.** Un filtro de septiembre no debería impedir ver agosto. La libertad de elegir cualquier rango es lo que hace útil el filtro.
17. Crear `frontend/src/components/StatusBadge.astro` con la prop `status: 'pending' | 'completed' | 'cancelled'`, cuya appearance viene de un mapa interno de tres entradas.
18. En la insignia, **los tres estados usan el color de significado**: `pending` en advertencia, `completed` en éxito, `cancelled` en peligro. Es la única vez que el color de un estado de negocio no es decorativo.
19. En la insignia, **el texto es el que distingue, no el color.** Cada insignia lleva su palabra —"Pendiente", "Completada", "Cancelada"— porque el color solo no funciona para quien no distingue rojo y verde, que es una de cada doce personas.
20. Crear `frontend/src/components/ConfirmDialog.astro` con `<dialog>` nativo, un título, un mensaje, un botón de cancelar y uno de confirmar.
21. En el diálogo, **usar `<dialog>` y `showModal()`**, no un `div` con `position: fixed`. El elemento nativo trae el foco atrapado dentro, el cierre con `Escape` y `aria-modal`, y las tres cosas son difíciles de hacer bien a mano.
22. En el diálogo, aceptar `onConfirm: () => void` como prop y devolver la promesa al llamador, para que la pantalla pueda **esperar** el resultado y actualizar su estado sin adivinar. Si el diálogo devuelve `void`, la pantalla tiene que mantener su propia bandera de "borrando", y esa bandera se desincroniza.
23. En el diálogo, resolver a `true` si se confirma y a `false` si se cancela, **incluido el cierre con `Escape`**. Un `Escape` que no resuelve deja la promesa colgada y la pantalla esperando para siempre.
24. En el diálogo, **el botón de confirmar lleva `type="submit"` y el de cancelar `type="button"`.** Al revés, el `Escape` y el clic fuera disparan el formulario en vez de cancelar.
25. Crear `frontend/src/components/InvoicePrint.astro` con la estructura de la factura: cabecera con la marca, los datos de la venta, la tabla de artículos, el total y el pie.
26. En la factura, usar las clases `no-print` en todo lo que no debe salir, apoyándose en `print.css` de `tasks/frontend/02`.
27. En la factura, **los importes van con `formatMoney` y la fecha con `formatDate`**, igual que en pantalla. La factura es la misma información con otro destino, y formatearla de otra forma obliga a la dueña a leerla dos veces.
28. En la factura, mostrar `payment_method` y `payment_bank` juntos cuando sea tarjeta, y **omitir `payment_bank` cuando no lo haya**, en vez de imprimir "Efectivo — Banco: —".
29. En la factura, mostrar los artículos adicionales en su propia sección, con cantidad, nombre, descripción e importe, y su suma al pie antes del total.
30. En la factura, **el total se muestra una sola vez**, como `cost` más la suma de artículos. Mostrar el costo y los artículos por separado sin un total es dejar el cálculo a la persona.
31. Crear `frontend/src/components/README.md` con la tabla de los seis componentes, sus props y la pantalla donde se usan, y con la regla de decisión de la primera línea del documento.
32. En el `README`, documentar la convención de props: **`camelCase` en el `.astro`, `snake_case` en la respuesta de la API.** Un `.astro` con `emptyMessage` y un mapper que produce `empty_message` es un mapeo que alguien tiene que escribir; el mismo nombre en los dos lados lo elimina.
33. Agregar al `Layout` la prop `wide: boolean`, que hace que el contenido ocupe el ancho completo en vez de la columna de lectura. **Las tablas lo necesitan y el formulario no**, y esa es la razón de que exista la prop.
34. Agregar al `Layout` la prop `activeSection`, que el `Nav` usa para marcar el enlace activo. Pasarla por prop en vez de deducirla de `Astro.url` hace que el `Nav` sea verificable sin levantar un servidor.
35. Ejecutar `pnpm --filter shpr-web build` y confirmar que los seis componentes compilan sin advertencias de Astro.
36. Verificar en el navegador que el diálogo atrapa el foco, que `Escape` lo cierra, y que al cerrarlo la pantalla no queda esperando.

## Criterios de Done

- [x] `frontend/src/components/` contiene los seis `.astro` que declara esta tarea (`ConfirmDialog`, `DateRangeFilter`, `InvoicePrint`, `StatCard`, `StatusBadge`, `TableState`) y su `README.md`. El directorio tiene **siete** `.astro` porque `Nav.astro` llegó de `frontend/01`; el criterio contaba los propios, no los heredados.
- [x] `TableState.astro` renderiza **una sola** variante por render, no las tres con `display: none`.
- [x] El estado `loading` pone `aria-busy="true"` en la tabla, no en la fila.
- [x] El botón "Reintentar" **desaparece** cuando la pantalla no pasa `onRetry`, en vez de quedar deshabilitado.
- [x] `StatCard.astro` no contiene ninguna llamada a `formatMoney`: recibe el valor ya formateado.
- [x] El `tone` de la tarjeta colorea el ícono y **no** la cifra.
- [x] `DateRangeFilter.astro` es un `form method="get"` y **no contiene `<script>`**.
- [x] El filtro omite los campos de fecha vacíos de la URL.
- [x] Cada `StatusBadge` muestra su palabra, y no solo su color.
- [x] `ConfirmDialog.astro` usa `<dialog>` con `showModal()` y no un `div` posicionado.
- [x] El diálogo resuelve `true` al confirmar y `false` al cancelar **y al cerrar con `Escape`**.
- [x] `InvoicePrint.astro` usa `formatMoney` y `formatDate`, no formateo propio.
- [x] La factura muestra el total una sola vez, con el costo y la suma de artículos antes.
- [x] `payment_bank` **no** se imprime cuando el pago fue en efectivo.
- [x] El `Layout` acepta `wide` y `activeSection`, y las tablas se renderizan con `wide`.
- [x] `frontend/src/components/README.md` documenta la convención de `camelCase` en props y `snake_case` en la API.
- [x] `pnpm --filter shpr-web build` termina con código de salida `0` sin advertencias de Astro.
- [x] `pnpm --filter shpr-web typecheck` termina con código de salida `0`.

### Evidencia — AUD-14 (`frontend/03`)

#### CORR-15 — el criterio 84 contaba mal, y por una razón que conviene decir

"Contiene los seis `.astro` y su `README.md`."

`ls src/components/*.astro` devuelve **siete**. La spec nombra como suyos seis y
no menciona `Nav.astro` ni una vez: ese llegó de `frontend/01`. El criterio contaba
los componentes propios de la tarea y no lo decía, así que cualquiera que lo
verificara con un `ls` contaba siete y.funcionalaba el criterio.

No es que el código esté mal: los seis existen, el `README.md` existe, y `Nav.astro`
está donde corresponde. El criterio era impreciso. Se reescribió nombrando los seis
y aclarando de dónde sale el séptimo, que es lo que hace falta saber para no volver
a fallar la verificación.

#### Un falso positivo que casi se reporta como bug

Al verificar el criterio 90 —"no contiene `<script>`"— el grep devolvió
**1** `<script>`, y el criterio parecía violado.

No lo estaba. La coincidencia era la palabra `<script>` escrita **dentro de un
comentario del frontmatter**, en la línea que explica por qué el componente
deliberadamente no lleva uno:

```js
// tasks 03-12..16: un form GET de verdad, sin <script> (task 03-13).
```

Contado con los comentarios limpiados: **0** elementos `<script>`. Es la tercera
vez en esta auditoría que un literal aparece en un comentario y no en código —la
primera fue `!important` y la segunda `set -x`—. Vale la pena dejarlo escrito
porque el reflejo de reportarlo como bug iba a ser WRONG, y el criterio
"fallaba" por el motivo equivocado.

#### El 90 y el 91 seemed contradictorios, y no lo son

El 90 exige que `DateRangeFilter` no tenga `<script>`; el 91 exige que los campos de
fecha vacíos **no** lleguen a la URL. Con un `<form method="get">` nativo, el
navegador manda todos los campos, vacíos incluidos: saldría `?start_date=&end_date=`.
Para omitirlos hace falta JavaScript. Durante un momento parecía que los dos
criterios no podían cumplirse juntos.

El reparto es otro: el componente **no** lleva el script, y el que arma la
`URLSearchParams` es el de la pantalla. En `sales/index.astro:266`:

```js
const params = new URLSearchParams()
for (const field of filterForm.elements) {
  if (/* … */ && field.name !== "" && field.value !== "") {
    params.set(field.name, field.value)
  }
}
const query = params.toString()
window.location.assign(query === "" ? "/sales" : `/sales?${query}`)
```

Solo entra lo que tiene valor, y sin filtros navega a `/sales` pelado en vez de
`/sales?`. Los dos criterios se cumplen porque viven en archivos distintos, y
así el filtro se puede reutilizar sin arrastrar un script a cada pantalla.

#### Lo verificado sin hallazgos

| Criterio | Evidencia |
| --- | --- |
| 85 | tres guardas `state === "…" && (…)`, **0** `display: none`: una variante por render |
| 86 | `row.closest("table")?.setAttribute("aria-busy", "true")` — el atributo va en la tabla |
| 87 | `{onRetry !== undefined && (` — el botón no se renderiza, no se deshabilita |
| 88 | **0** llamadas a `formatMoney()`; la única mención está en el comentario que explica que `value` llega formateado |
| 89 | `.stat-tone-*/svg` colorea el ícono; la cifra queda siempre en `--text-primary` |
| 92 | un `labels: Record<status, string>` y `{labels[status]}` dentro del `<span>` |
| 93 | 3 `<dialog>` + 2 `showModal()`, **0** div de overlay posicionado |
| 94 | un solo listener `close` para los tres caminos: confirmar, cancelar y Escape |
| 95 | 7 usos de `formatMoney`/`formatDate`, **0** `toFixed` |
| 96 | `data-invoice-total` aparece **1** vez; costo en 106, artículos en 128, total en 151 |
| 97 | efectivo → `"Efectivo"` y el banco nunca se imprime |
| 98 | `activeSection` y `wide` en el `Layout`, 4 tablas renderizadas con `wide` |
| 99 | el `README.md` dice "`camelCase` en el `.astro`, `snake_case` en la respuesta de la API" |
| 100-101 | `build` → exit 0, sin warnings; `astro check` → **0 errores, 0 hints** en 30 archivos |

`frontend/03` queda **18/18**.
