# 06 — Pantalla de paquetes

## Estado Actual

`frontend/src/pages/packages/` no existe. Los componentes que necesita —`TableState`, `DateRangeFilter`, `StatusBadge` y `ConfirmDialog`— ya están en `frontend/src/components/`.

El modelo de paquete tiene tres particularidades que la pantalla tiene que respetar:

1. **No hay columna de estado.** "Pendiente" significa "registrado y no borrado lógicamente" (decisión D-007). Un paquete enviado sigue apareciendo en la lista hasta que se borre, y no hay forma de marcarlo como entregado.
2. **No hay `GET /packages/:id`.** Los cuatro endpoints son `POST`, listado, `PUT` y `DELETE`. El detalle de un paquete no existe.
3. **`PUT` es reemplazo completo.** Mandar solo `name` devuelve `400` con la lista de campos faltantes.

## Objetivo

El listado de paquetes con su filtro, y el formulario de alta y edición con el selector de venta, resolviendo la edición sin endpoint de detalle.

## Alcance

- Crear `frontend/src/pages/packages/index.astro`.
- Crear `frontend/src/pages/packages/new.astro`.
- Crear `frontend/src/pages/packages/new.css`.

**Archivos tocados:** `frontend/src/pages/packages/index.astro` (nuevo), `frontend/src/pages/packages/new.astro` (nuevo), `frontend/src/pages/packages/new.css` (nuevo).

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| El formulario de venta | Es `tasks/frontend/05-formulario-de-venta.md`. |
| La pantalla de gastos | Es `tasks/frontend/07-pantalla-de-gastos.md`. |
| `api.ts` y los tipos | Es `tasks/frontend/08-estado-de-red-y-capa-api.md`. |
| Agregar un `GET /packages/:id` al backend | El contrato de 13 endpoints está cerrado, y ver la nota siguiente. |
| Una columna de estado o un filtro "entregado" | El modelo no la tiene. Agregarla es cambiar la decisión D-007 y el esquema. |
| Marcar un paquete como entregado | Sería un `PATCH` de estado, y no existe. La operación real es borrar el registro cuando deja de importar. |
| Filtrar paquetes por venta | El listado acepta `start_date`, `end_date` y `method`. Filtrar por `sale_id` sería un cuarto parámetro en el contrato. |
| Buscar paquetes por nombre | No hay filtro de texto en el contrato. |
| Un formulario de edición separado del de alta | Es la misma pantalla con dos modos: `/packages/new` y `/packages/new?id={uuid}`. |
| Editar un paquete ya vinculado a una venta cobrada | El `PUT` permite cambiar el `sale_id`. Lo que no tiene sentido es cambiar el nombre de un envío que ya salió, y eso es una cuestión de criterio de la dueña, no del sistema. |
| Paginación | Decisión D-011. La pantalla pide `page` y `per_page` a `GET /sales` y usa el `total` de la respuesta para el paginador y el pie de tabla. |
| KPIs | Decisión D-012. La pantalla pide `include_kpis=true` y pinta las tarjetas con el `kpis` de la misma respuesta. Después de cambiar el método de envío de una fila pide sólo `GET /dashboard/packages/kpis`. |
| Navegación | Decisión D-013. Paginador, tamaño de página y filtros mueven la URL con `history.pushState` y repintan la lista sin recargar el documento; `popstate` cubre atrás/adelante. |
| Imprimir un listado de envíos | No se hace. |
| Un resumen de envíos en el dashboard | `pending_packages_count` ya está en las cuatro cifras. |
| Adjuntar una imagen del envío | No hay almacenamiento de archivos. |

## Tareas

1. Crear `frontend/src/pages/packages/index.astro` con el `Layout`, el título "Paquetes", la prop `wide` y `activeSection="packages"`.
2. En la pantalla, leer los tres filtros de `Astro.url.searchParams`: `start_date`, `end_date` y `method`. **El estado vive en la URL**, igual que en ventas.
3. Renderizar `DateRangeFilter` con esos dos valores de fecha, más un `select` con los tres métodos de envío en el mismo `form method="get"`.
4. Llamar a `packagesApi.list({ start_date, end_date, method })` desde el `frontmatter`, **omitiendo los parámetros vacíos**.
5. En el caso de éxito, iterar sobre `data.packages`. La respuesta del listado es un objeto con esa clave, igual que en ventas.
6. Crear la tabla con las ocho columnas del paquete: nombre, fecha, método, venta vinculada, y las de acciones. **Sin columna de estado**, porque el modelo no tiene ninguna.
7. En la celda de método, mostrar el texto en español —"Cargotrans", "Delivery", "Retiro"— y **no el valor crudo del enum**. `cargotrans` en la celda le dice a la dueña que la pantalla muestra un código, no información.
8. En la celda de fecha, usar `formatDate`.
9. En la celda de venta vinculada, **desenvolver la relación**: el listado trae el `id` de la venta, y para mostrar un nombre hace falta el nombre del cliente. Ver los pasos 10 y 11 antes de decidir.
10. **Decidir explícitamente qué se muestra en la columna de venta vinculada.** La opción A es mostrar el `id` corto de la venta, con un enlace a `/sales/{id}`. La opción B es enrichir el listado pidiendo además `GET /sales` y cruzando por `id` en el cliente. **La opción A es la correcta**, y la razón es concreta: la opción B trae veinte ventas para mostrar un nombre en una columna, duplica la fuente de verdad en el cliente, y el nombre queda desactualizado en cuanto cambie la venta.
11. En la columna de venta vinculada, cuando `sale_id` es `null`, **mostrar un guion y no un enlace**. "Sin venta" es un dato, no una ausencia que haya que rellenar.
12. En la celda de acciones, un enlace a `/packages/new?id={uuid}` con el texto "Editar", y un botón "Eliminar" que usa `ConfirmDialog`.
13. En el borrado, **esperar la promesa del diálogo antes de llamar a la API**, y actualizar la fila localmente en lugar de recargar. Con veinte paquetes, recargar por cada borrado pierde la posición de scroll.
14. En el borrado, si la llamada falla, **no quitar la fila de la lista** y mostrar el mensaje de `getErrorMessage`.
15. En el encabezado de la tabla, un enlace a `/packages/new` con el texto "Nuevo paquete".
16. En el estado vacío, `emptyMessage="Todavía no hay paquetes registrados"` y `emptyLabel="Registrar el primero"`, con `emptyHref="/packages/new"`. El `colSpan` es el número de columnas de la tabla.
17. En el estado vacío, **el texto no dice "pendientes".** No hay estado, y un mensaje que dice "pendiente" promete un filtro que no existe.
18. Crear `frontend/src/pages/packages/new.astro` con el `Layout` y `activeSection="packages"`, con los dos modos en la misma ruta: alta en `/packages/new`, y edición en `/packages/new?id={uuid}`.
19. En la edición, **cargar el paquete desde el listado filtrado por identificador**, no desde un endpoint de detalle que no existe. Ver la sección siguiente, que es la parte difícil de esta tarea.
20. Crear `frontend/src/pages/packages/new.astro` con los cuatro campos del paquete: `name`, `package_date`, `method` y `sale_id`.
21. En el campo de `package_date`, usar `type="date"` con la conversión a ISO UTC de `tasks/frontend/05`, y **precargar con hoy en hora local**.
22. En el campo de `method`, un `select` con los tres métodos.
23. En el campo de `sale_id`, un `select` con las ventas del rango actual, obtenido de `salesApi.list({ start_date, end_date })`, más una primera opción vacía con el texto "Sin venta".
24. En el `select` de ventas, **mostrar cliente, producto y fecha**, que es lo que permite distinguir dos ventas parecidas. Con veinte ventas de la misma persona, el nombre solo no alcanza.
25. En el `select` de ventas, **limitar a un rango y documentarlo.** El `select` muestra las ventas del rango del filtro, no todas las ventas de la historia. Si la venta que se quiere vincular está fuera del rango, hay que ampliar el filtro primero. Decirlo en una nota debajo del campo es más honesto que mostrar mil opciones.
26. En el `select` de ventas, **la opción "Sin venta" envía `null`, no cadena vacía.** El DTO usa `z.string().uuid().nullish()`, y una cadena vacía no es un UUID.
27. En el `submit`, en modo alta, llamar a `packagesApi.create(payload)` y responder `201`.
28. En el `submit`, en modo edición, **enviar el formulario completo**, no solo los campos cambiados. `PUT` es reemplazo completo, y un `PATCH` mental devuelve `400`.
29. En el `submit`, deshabilitar el botón y mostrar "Guardando...", igual que en el formulario de venta.
30. En el `submit`, con éxito, redirigir a `/packages` con el listado ya filtrado. A diferencia de la venta, un paquete no tiene detalle que mostrar, así que no hay pantalla de confirmación.
31. En el `submit`, con error, mostrar el mensaje junto al campo correspondiente, con el mismo criterio de `getFieldErrors` de `tasks/frontend/05`.
32. En el error de negocio "Sale not found", mostrarlo junto al `select` de ventas. Es el `400` que traduce el `P2003`, y la dueña necesita saber que la venta elegida ya no existe.
33. En el modo edición, **preservar el `sale_id` que ya tenía el paquete si el `select` no se tocó.** El `select` se arma con las ventas del rango, y si el paquete está vinculado a una venta de otro rango, esa venta **no aparece en la lista** y el formulario la mandaría como `null`, desvinculando el paquete por accidente.
34. En el modo edición, agregar al `select` una opción de cabecera con la venta actual cuando no esté en la lista, marcada como "Venta actual". Es la defensa directa contra el paso 33.
35. Crear `frontend/src/pages/packages/new.css` con lo específico: el ancho del formulario, el `select` de ventas con su nota de rango, y el tratamiento del título en modo edición.
36. En el `new.css`, **no re-declarar tokens.**
37. En el título de la pantalla, cambiar el texto según el modo: "Nuevo paquete" o "Editar paquete". La dueña tiene que saber en cuál está antes de leer los campos.
38. Ejecutar `pnpm --filter shpr-web build` y confirmar que las dos pantallas compilan.
39. Verificar en el navegador el flujo completo: dar de alta un paquete sin venta, dar de alta uno con venta, editar un paquete conservando su `sale_id`, editar uno de un rango antiguo, y eliminar uno con confirmación.

## Criterios de Done

- [x] `frontend/src/pages/packages/index.astro`, `new.astro` y `new.css` existen.
- [x] El listado lee la propiedad `.packages` del sobre de la respuesta —en el código `(await packagesApi.list(params)).packages`, sin variable `data`— y no hay ninguna columna de estado.
- [x] Los tres filtros viajan en la URL y los vacíos no se envían.
- [x] La celda de método muestra "Cargotrans", "Delivery" o "Retiro", **nunca** el valor crudo del enum.
- [x] La columna de venta vinculada muestra el enlace a `/sales/{id}`, y **no** hace un segundo `GET /sales` para enrichir nombres.
- [x] Un paquete con `sale_id: null` muestra un guion, sin enlace.
- [x] El estado vacío no dice "pendiente" en ningún texto.
- [x] El `colSpan` del estado coincide con el número de columnas.
- [x] `/packages/new?id={uuid}` carga el paquete para edición y el título dice "Editar paquete".
- [x] El `PUT` de edición envía **el formulario completo**, no solo los campos tocados.
- [x] La opción "Sin venta" envía `null`, y no una cadena vacía.
- [x] Editar un paquete vinculado a una venta **fuera del rango** conserva su `sale_id` y no lo desvincula.
- [x] El `select` de ventas muestra cliente, producto y fecha, y tiene la opción de cabecera con la venta actual cuando no está en la lista.
- [x] El `select` de ventas tiene una nota que dice que muestra las ventas del rango actual.
- [x] El botón de envío se deshabilita durante la llamada y se rehabilita en el `finally`.
- [x] Un `DELETE` fallido **no quita la fila** de la lista.
- [x] Un `POST` con un `sale_id` inexistente muestra "Sale not found" junto al `select` de ventas.
- [x] `grep -c "GET /packages/" specs/tasks/frontend/06-pantalla-de-paquetes.md` documenta que no existe tal endpoint: la edición no depende de un detalle.
- [x] `grep -c "#[0-9a-fA-F]\{3,6\}" frontend/src/pages/packages/new.css` devuelve `0`.
- [x] `pnpm --filter shpr-web build` termina con código de salida `0`.
- [x] `pnpm --filter shpr-web typecheck` termina con código de salida `0`.

### Evidencia — AUD-17 (`frontend/06`)

Última spec de la ronda. Con esta queda cerrado el ciclo de 262 criterios.

#### CORR-18 — el mismo `data.` que en `frontend/04`

"El listado se construye sobre `data.packages`."

Otra vez una variable `data` que el proyecto no tiene. El sobre se lee en la
propia llamada, `(await packagesApi.list(params)).packages`, igual que las ventas
leen `.sales`. Es el mismo criterio mal escrito que CORR-16, y conviene que quede
registrado como patrón y no como casualidad: **las dos specs de listado inventan
un nombre de variable que el código nunca usa.** Un criterio escrito contra una
suposición de nombres no se puede verificar; uno escrito contra el comportamiento
—leer la propiedad del sobre— se verifica en dos líneas.

#### El 99, el más interesante de esta spec

Editar un paquete cuya venta quedó fuera del rango de fechas no lo desvincula, y
no porque el backend lo defienda: porque el `select` incluye la venta actual
como opción de cabecera cuando la lista no la trae.

```js
if (currentSaleId !== null && !rows.some((s) => s.id === currentSaleId)) {
  const current = document.createElement("option")
  // "Venta actual (fuera del rango) — {fecha}"
  options.push(current)
}
```

Si esa opción no existiera, el `select` caería en la primera —"Sin venta"— al
sincronizar, el formulario enviaría `null` y el paquete se desvincularía en
silencio al guardar. El criterio no dice "el backend preserva el vínculo": dice que
la **interfaz** lo preserva, y la interfaz lo hace incluyendo la opción.

#### El 105, comprobado contra el backend y no contra el spec

El criterio pide que el spec documente que no existe `GET /packages/:id`. El
spec lo dice en su línea 10, pero documentarlo no es demostrarlo, así que se
comprobó la superficie real del backend:

```
app.post("/")      controller.create
app.get("/")       controller.list
app.put("/:id")    controller.update
app.delete("/:id") controller.delete
```

Cuatro rutas. No hay `GET /:id`, y por eso la edición funciona con los datos que
el listado ya trajo. La decisión de diseño de esta spec —no crear un endpoint de
detalle— es real, no una promesa.

#### Lo verificado sin hallazgos

| Criterio | Evidencia |
| --- | --- |
| 88 | `index.astro`, `new.astro` y `new.css` presentes |
| 90 | tres filtros (`start_date`, `end_date`, `method`); los vacíos no se envían |
| 91 | `methodLabels` traduce los tres enums; **0** `status` en toda la pantalla |
| 92 | el enlace sale del `sale_id` que ya viene en la fila; **0** llamadas a `salesApi` |
| 93 | `sale_id === null` → `<span class="muted">—</span>` sin enlace |
| 94 | `"Todavía no hay paquetes registrados"`; dos comentarios prohíben decir "pendientes" |
| 95 | `const COLS = 7` y 7 `<th>`, con `colSpan={COLS}` en los dos estados |
| 96 | `data-form-title` pasa a "Editar paquete" en runtime; el default es "Nuevo paquete" |
| 97 | `packagesApi.update(editId, payload)` con el formulario completo |
| 98 | `sale_id_raw === "" ? null : sale_id_raw` |
| 100 | cada opción lleva cliente, producto y fecha; la cabecera añade la actual si falta |
| 101 | `data-range-note` con "El selector muestra las ventas del rango actual…" |
| 102 | `disabled = true` antes del `await`, y `finally { disabled = false }` |
| 103 | `row.remove()` dentro del `try`; si el `remove` lanza, el `catch` impide la fila |
| 104 | `message.toLowerCase().includes("sale not found")` → `fieldErrors = { sale_id: message }` |
| 106 | `grep -cE '#[0-9a-fA-F]{3,6}' new.css` → **0** |
| 107-108 | `build` → exit 0, 20 páginas; `astro check` → 0 errores, 0 hints |

`frontend/06` queda **21/21**.
