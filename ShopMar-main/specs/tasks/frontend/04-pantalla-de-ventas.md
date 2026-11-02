# 04 — Pantalla de ventas

## Estado Actual

`frontend/src/pages/sales.astro` no existe. Los componentes que la pantalla necesita —`TableState`, `StatusBadge`, `DateRangeFilter`, `ConfirmDialog` e `InvoicePrint`— ya están en `frontend/src/components/`, creados en `tasks/frontend/03`.

El endpoint `GET /api/v1/sales` devuelve un arreglo dentro de una clave: `{"sales": [...]}`. Cada fila tiene nueve campos y **no** trae `payment_method` ni `additional_items`. La forma de pago solo existe en el detalle.

## Objetivo

La pantalla de `/sales`: listado con filtros, cambio de estado en línea y factura imprimible desde el detalle.

## Alcance

- Crear `frontend/src/pages/sales/index.astro`.
- Crear `frontend/src/pages/sales/[id].astro`.
- Crear `frontend/src/pages/sales/sales.css`.

**Archivos tocados:** `frontend/src/pages/sales/index.astro` (nuevo), `frontend/src/pages/sales/[id].astro` (nuevo), `frontend/src/pages/sales/sales.css` (nuevo).

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| El formulario de alta de venta | Es `tasks/frontend/05-formulario-de-venta.md`. `/sales/new` tiene su propia ruta dedicada, no es una parte de esta. |
| El resumen con las cuatro cifras | Es `tasks/frontend/04-pantalla-de-ventas.md` del módulo de resumen, que en este proyecto es `/`. Ver la nota de la siguiente fila. |
| La pantalla de paquetes y la de gastos | Es `tasks/frontend/06` y `07`. |
| `api.ts` y los tipos | Es `tasks/frontend/08-estado-de-red-y-capa-api.md`. Aquí se consume lo que esa tarea define. |
| Editar una venta | El contrato no tiene `PUT` ni `PATCH` general de venta. Los importes cobrados no se editan. |
| Borrar una venta | No existe `DELETE /sales/:id`. Se cancela cambiando el estado. |
| Filtrar por forma de pago | El listado no trae ese campo, y no es un filtro que la dueña necesite para encontrar una venta. |
| Buscar por nombre de cliente o de producto | El listado no tiene filtro de texto en el contrato. Es el filtro más pedido, y el candidato número uno a una versión 2. |
| Paginación | Decisión D-006. Un mes de ventas cabe en una pantalla. |
| Exportar a Excel o CSV | La factura se imprime. |
| Un gráfico de ventas | El resumen es cuatro cifras. |
| Editar artículos adicionales | Un artículo de una venta cobrada no se edita. Se cancela la venta. |
| Reordenar columnas o cambiar el orden de clasificación | El orden es `sale_date` descendente con `id` de desempate, y es determinista. Un control para cambiarlo sería una preferencia que hay que guardar en algún lado, y no hay dónde. |

## Tareas

1. Crear `frontend/src/pages/sales/index.astro` con el `Layout`, el título "Ventas", la prop `wide` y `activeSection="sales"`.
2. En la pantalla, leer los cuatro filtros de `Astro.url.searchParams`: `start_date`, `end_date`, `type` y `status`. **El estado de la pantalla vive en la URL**, no en memoria, porque la dueña recarga la página y espera ver lo mismo.
3. En la misma pantalla, pasar esos cuatro valores a `DateRangeFilter` como `initialStart` e `initialEnd`, y renderizar dos `select` con `type` y `status` dentro del mismo `form method="get"`.
4. **Los `select` de tipo y estado van dentro del mismo formulario que las fechas**, no en uno aparte. Tres formularios en una pantalla obligan a la dueña a apretar "Filtrar" tres veces, y el resultado de los tres se pierde en el segundo.
5. En la pantalla, llamar a `salesApi.list({ start_date, end_date, type, status })` desde el `frontmatter` de Astro. **El fetch va en el `frontmatter`, no en un `onLoad`**: la pantalla es estática y el dato se resuelve en el servidor de build o en el de desarrollo.
6. En el mismo `frontmatter`, **quitar de los parámetros los que estén vacíos** antes de llamar a la API. Un `status=` vacío haría que el `.strict()` de Zod lo rechace con `400`.
7. En el `frontmatter`, manejar los tres estados de la respuesta: `loading` no aplica aquí porque el `fetch` bloquea el render, y los dos estados que sí existen son `data` y `error`. Pasar el estado a `TableState` con `state="error"` y `errorMessage={getErrorMessage(error)}` cuando el `fetch` falla.
8. En el caso de éxito, **desenvolver la respuesta**: el endpoint devuelve `{"sales": [...]}`, y la fila de la tabla itera sobre `data.sales`, no sobre `data`. Iterar sobre el objeto entero renderiza una tabla con una fila que dice `[object Object]`.
9. Crear la tabla con los encabezados de las **nueve columnas del listado**, en el orden de la especificación: fecha, cliente, producto, tipo, estado, costo, artículos, total y acciones.
10. **No agregar columnas de forma de pago.** El listado no trae el dato, y una columna que siempre muestra un guion es ruido en una tabla de veinte filas.
11. En la celda de costo y en la de total, aplicar `formatMoney`. En la de artículos, mostrar `additional_count` como número, y **no** como lista de nombres: el nombre de los artículos está en el detalle, y la tabla no tiene ancho para eso.
12. En la celda de estado, usar `StatusBadge`.
13. En la celda de acciones, un enlace a `/sales/{id}` con el texto "Ver". **La fila completa no es un enlace**: en una tabla con botones dentro, hacer la fila clicable obliga a distinguir el clic del botón del clic del enlace, y ese es el origen clásico de un "no me guarda" reportado por la dueña.
14. En el encabezado de la tabla, poner un enlace a `/sales/new` con el texto "Nueva venta". El estado vacío de `TableState` apunta a la misma ruta.
15. En el estado vacío, `emptyMessage="Todavía no hay ventas registradas"` y `emptyLabel="Registrar la primera venta"`. **El mensaje dice qué falta, no que la tabla está vacía.**
16. En el estado de error, `colSpan` vale nueve, que es el número de columnas de la tabla. Un `colSpan` incorrecto hace que la fila de estado se desalinee.
17. Crear `frontend/src/pages/sales/[id].astro` con el detalle de la venta, envuelto en `InvoicePrint`.
18. En el detalle, leer el `id` de `Astro.params.id` y llamar a `salesApi.getById(id)`.
19. En el detalle, **si la respuesta es `404`, redirigir a `/sales`** con `Astro.redirect`. Una venta que no existe desde una URL directa es un enlace viejo o un error de tipeo, y ninguno de los dos casos se resuelven con una pantalla de error: se resuelve volviendo al listado.
20. En el detalle, mostrar las quince claves de la respuesta con sus etiquetas, incluyendo `payment_method` y `payment_bank` juntos cuando sea tarjeta.
21. En el detalle, renderizar los artículos adicionales con su cantidad, nombre, descripción e importe, y su suma antes del total.
22. En el detalle, renderizar los paquetes vinculados con su nombre, fecha y método. **Si no hay paquetes, no mostrar la sección**, en vez de mostrar una sección vacía con "Sin envíos".
23. En el detalle, poner un botón "Imprimir" que llame a `window.print()`. El botón tiene la clase `no-print` de `print.css`.
24. En el detalle, poner un enlace "Volver a ventas" con la clase `no-print`.
25. **No poner el cambio de estado en el detalle.** El cambio de estado es una acción de lista, y en el detalle ocuparía el lugar de los datos. Ver el paso siguiente.
26. En el listado, agregar el cambio de estado **en línea**, en la columna de acciones: un `select` con los tres estados que, al cambiar, hace el `PATCH /sales/{id}/status`.
27. En el cambio de estado en línea, **no pedir confirmación para pasar a `completed`.** Marcar una venta como cobrada es la operación más frecuente del día, y un diálogo en cada una la vuelve lenta. La confirmación solo se pide para `cancelled`, que sí es una decisión con consecuencia.
28. En el cambio de estado en línea, al confirmar una cancelación, usar `ConfirmDialog` y **esperar su promesa** antes de llamar a la API.
29. En el cambio de estado en línea, **actualizar solo la fila, no recargar la página.** Con veinte ventas, recargar por cada cambio hace que la pantalla salte y la dueña pierda de vista dónde estaba. La fila se repinta con el valor devuelto por el `PATCH`, que trae el detalle completo.
30. En el cambio de estado en línea, si la llamada falla, **revertir el `select` a su valor anterior** y mostrar el mensaje de `getErrorMessage`. Un `select` que muestra un estado que el servidor no aceptó es peor que no haberlo cambiado.
31. En el cambio de estado en línea, **deshabilitar el `select` mientras la llamada está en vuelo**, y rehabilitarlo en el `finally`. Sin eso, un doble clic envía dos `PATCH` y el segundo compite con el primero.
32. Crear `frontend/src/pages/sales/sales.css` con los estilos **específicos** de estas dos pantallas: el ancho de la columna de acciones, el tratamiento de la fila que está cambiando de estado, y el espacio de la tabla de artículos del detalle.
33. En el `sales.css`, **no re-declarar colores, espaciados ni tipografías.** Todo eso sale de los tokens de `global.css`. Un `#0f172a` en esta hoja es un token duplicado que se desincroniza en el primer cambio de tema.
34. En el `sales.css`, usar una transición breve en la fila que cambia de estado, para que el cambio sea visible. Con `prefers-reduced-motion` activo, la transición no se ejecuta.
35. Ejecutar `pnpm --filter shpr-web build` y confirmar que la pantalla compila.
36. Verificar en el navegador el flujo completo: filtrar por mes, ver el listado, cambiar un estado a completada sin diálogo, cancelar una venta con confirmación y ver el selector quedar inerte, abrir el detalle, imprimir.

## Criterios de Done

- [x] `frontend/src/pages/sales/index.astro` y `frontend/src/pages/sales/[id].astro` existen, con su `sales.css`.
- [x] El listado lee la propiedad `.sales` del sobre de la respuesta, no asume un array desnudo. En el código el sobre se consume en la llamada, no en una variable llamada `data`: `(await salesApi.list(params)).sales`, y la capa lo tipa como `Promise<{ sales: ISaleListRow[] }>`. Un `.sales` ausente es el error más probable de esta pantalla.
- [x] Los cuatro filtros viajan en la URL y sobreviven a una recarga.
- [x] Los filtros vacíos **no** se envían a la API, y un filtro de tipo o estado inválido produce el estado de error con el mensaje traducido.
- [x] La tabla tiene exactamente nueve columnas, y ninguna es la forma de pago.
- [x] La columna de artículos muestra el conteo, no los nombres.
- [x] Los importes salen de `formatMoney` y las fechas de `formatDate`.
- [x] El estado vacío dice "Todavía no hay ventas registradas" y ofrece registrar la primera.
- [x] El `colSpan` del estado es nueve.
- [x] Un `GET /sales/:id` que devuelve `404` redirige a `/sales` en vez de mostrar un error.
- [x] El `PATCH` de estado se hace en línea, sin recargar la página.
- [x] Pasar a `completed` **no** pide confirmación; pasar a `cancelled` sí.
- [x] Un `PATCH` fallido **revierte** el `select` al valor anterior y muestra el mensaje traducido.
- [x] El `select` queda deshabilitado durante la llamada y se rehabilita al terminar.
- [x] `window.print()` imprime la factura sin `Nav` ni botones, en una sola hoja.
- [x] `grep -c "#[0-9a-fA-F]\{3,6\}" frontend/src/pages/sales/sales.css` devuelve `0`. Los colores salen de los tokens.
- [x] `pnpm --filter shpr-web build` termina con código de salida `0`.
- [x] `pnpm --filter shpr-web typecheck` termina con código de salida `0`.

### Evidencia — AUD-15 (`frontend/04`)

#### CORR-16 — el criterio 81 nombraba una variable que no existe

"El listado se construye sobre `data.sales`, no sobre `data`."

En el código no hay ninguna variable `data`. La lista se trae así:

```astro
sales = (await salesApi.list(params)).sales
```

El sobre se consume en la llamada, y la capa lo declara como
`Promise<{ sales: ISaleListRow[] }>`. Lo que el criterio quería decir —que la
respuesta es un sobre y hay que leer `.sales`, no asumir un array— es
exactamente lo que hace, y el riesgo sigue latente si algún día el backend
devuelve el array pelado. Lo que estaba mal era el nombre: un criterio que
exige una variable que el proyecto nunca tuvo no se puede verificar, solo
suponer.

Se reescribió para exigir el comportamiento —leer `.sales` del sobre— y
nombrar dónde se hace.

#### Un criterio que parecía violado y no lo estaba

El 84 pide **nueve** columnas. `grep -c '<th'` devuelve **10**.

La décima es `<thead>`: el grep cuenta etiquetas que empiezan igual. Las columnas
son nueve, de `Fecha` a `Acciones`, y ninguna es la forma de pago —que en la
factura sí aparece, y en el listado no porque no es lo que se decide desde
allá—. La tabla tiene nueve columnas con `colSpan={9}` en los dos `TableState`.

#### `type` contra "Canal": el nombre canónico y la etiqueta

El 83 habla de "un filtro de tipo o estado". La columna se llama `Canal`, el
comentario de `DateRangeFilter` habla de "canal y estado", y la URL lleva `type`.
No hay contradicción: el contrato usa `type` de punta a punta —

```ts
// backend/src/modules/sales/presentation/sales.dto.ts:75
type: z.enum(["live", "whatsapp"]).optional(),
```

— y `canalLabels[row.type]` traduce a la etiqueta visible. "Canal" es lo que lee
la dueña; `type` es lo que viaja.

#### Lo verificado sin hallazgos

| Criterio | Evidencia |
| --- | --- |
| 80 | `index.astro`, `[id].astro` y `sales.css` presentes |
| 82 | los cuatro filtros salen de `url.searchParams`; el script los reinyecta desde `location.search` porque en build estático el frontmatter los ve vacíos |
| 83 | `params.x` solo si `x !== ""`; el `catch` guarda `getErrorMessage(err)` y la pantalla 118 pinta `<TableState state="error">` |
| 85 | `{row.additional_count}`, el conteo — nunca los nombres |
| 86 | 6 `formatMoney`, 4 `formatDate`, **0** `toFixed` |
| 87 | `"Todavía no hay ventas registradas"` con `emptyHref="/sales/new"` |
| 89 | `ApiError && code === "NOT_FOUND"` → `Astro.redirect("/sales", 301)` |
| 90 | `salesApi.updateStatus(...)` por fetch, **0** `location.reload()` |
| 91 | `if (next === "cancelled")` y solo ahí: a `completed` va directo |
| 92 | `select.value = previous` + `setText(rowError, getErrorMessage(err))` |
| 93 | `select.disabled = true` al arrancar, `false` al terminar, incluso en el error |
| 94 | el botón solo llama `window.print()`; `print.css` esconde `Nav` y botones y aplica `page-break-inside: avoid` (ver `frontend/02`) |
| 95 | `grep -cE '#[0-9a-fA-F]{3,6}' sales.css` → **0** |
| 96-97 | `build` → exit 0, 20 páginas; `astro check` → 0 errores, 0 hints |

`frontend/04` queda **18/18**.
