# 07 — Pantalla de gastos

## Estado Actual

`frontend/src/pages/expenses/` no existe. Los componentes que necesita —`TableState`, `DateRangeFilter` y `ConfirmDialog`— ya están en `frontend/src/components/`.

Es la pantalla más simple de las tres, y esa simplicidad es el requisito. Un gasto tiene un nombre, una descripción opcional, un importe y una fecha. No tiene estado, no tiene método, no se vincula a nada, y **no se edita**: si se registró mal, se borra lógicamente y se vuelve a crear.

Esa última decisión es la que define la pantalla. Sin un botón de editar, la lista de gastos es la lista de un libro contable: se lee, se agrega y se anula.

## Objetivo

El listado de gastos con su filtro por rango, el alta y el borrado lógico, sin ningún camino de edición.

## Alcance

- Crear `frontend/src/pages/expenses/index.astro`.
- Crear `frontend/src/pages/expenses/new.astro`.
- Crear `frontend/src/pages/expenses/new.css`.

**Archivos tocados:** `frontend/src/pages/expenses/index.astro` (nuevo), `frontend/src/pages/expenses/new.astro` (nuevo), `frontend/src/pages/expenses/new.css` (nuevo).

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| El formulario de venta | Es `tasks/frontend/05-formulario-de-venta.md`. |
| La pantalla de paquetes | Es `tasks/frontend/06-pantalla-de-paquetes.md`. |
| `api.ts` y los tipos | Es `tasks/frontend/08-estado-de-red-y-capa-api.md`. |
| **Un botón de editar o un formulario de edición** | El contrato no tiene `PUT` ni `PATCH` de gasto, y esa es una decisión, no un olvido. Editar un gasto cambia `total_expenses` en el resumen sin dejar rastro de cuál era antes, y el resumen es la única cuenta que la dueña mira. Un gasto mal registrado se borra y se vuelve a crear. |
| Agregar `PUT /expenses/:id` al backend | El contrato de 13 endpoints está cerrado. Agregarlo es cambiar la especificación del API, no esta tarea. |
| Un campo de categoría o de tipo de gasto | La mercadería y los gastos son texto libre (decisión D-002). Una lista cerrada obligaría a clasificar en algo que la dueña no piensa. |
| Filtrar por nombre o por importe | El contrato solo acepta `start_date` y `end_date`. Un mes de gastos cabe en una pantalla. |
| Buscar gastos con texto | No hay filtro de texto en el contrato. |
| Adjuntar el recibo o la factura del gasto | No hay almacenamiento de archivos. |
| Una columna de "recurrente" o "mensual" | Un alquiler se registra cada mes como un gasto más. Automatizarlo es una decisión de producto que no está tomada. |
| Un total de gastos del rango en la pantalla | El filtro ya muestra los gastos del rango, y sumarlos a mano es una resta que la dueña hace en un papel. El resumen tiene `total_expenses`. Ver la nota siguiente. |
| Paginación | Decisión D-006. |
| Exportar el gasto a PDF | La factura es de venta. Un gasto no se imprime. |
| Un gráfico de gastos por categoría | No hay categorías. |
| Un selector de venta en el gasto | Un gasto no pertenece a una venta. El flete de un envío es un gasto de la tienda, no un atributo de la venta. |

## Tareas

1. Crear `frontend/src/pages/expenses/index.astro` con el `Layout`, el título "Gastos", la prop `wide` y `activeSection="expenses"`.
2. En la pantalla, leer los dos filtros de `Astro.url.searchParams`: `start_date` y `end_date`. **El estado vive en la URL**, igual que en las otras dos pantallas.
3. Renderizar `DateRangeFilter` con esos dos valores. **No hay `select` de tipo ni de estado en esta pantalla**: no hay enumeraciones que filtrar, y un filtro vacío es ruido.
4. Llamar a `expensesApi.list({ start_date, end_date })` desde el `frontmatter`, **omitiendo los parámetros vacíos**.
5. En el caso de éxito, iterar sobre `data.expenses`, que es la clave de la respuesta del listado.
6. Crear la tabla con las columnas del gasto: fecha, nombre, descripción, importe y acciones. **Sin columna de estado**, porque el modelo no tiene ninguna y un gasto no se "anula": se borra.
7. En la celda de descripción, **mostrar un guion cuando es `null`**, y no la palabra "Sin descripción". Un guion es el dato ausente; la frase es una explicación que ocupa más espacio que el dato.
8. En la celda de importe, usar `formatMoney` y alineación a la derecha con cifras tabulares, de la primitiva de tabla de `tasks/frontend/02`.
9. En la celda de acciones, un botón "Eliminar" que usa `ConfirmDialog`.
10. En el borrado, **esperar la promesa del diálogo antes de llamar a la API**, y quitar la fila localmente en vez de recargar la página.
11. En el borrado, **el mensaje del diálogo tiene que decir que el gasto desaparece del resumen.** "Eliminar" sugiere que desaparece de la lista. Lo que ocurre es que también deja de contar en `total_expenses` del dashboard, y ese número es el que la dueña mira. Un diálogo que no lo dice deja el miedo de haber borrado algo que seguía contando.
12. En el borrado, si la llamada devuelve `404`, quitar la fila de todos modos: significa que otro sesión ya lo había borrado, y la lista local estaba desactualizada.
13. En el borrado, si la llamada falla con otro error, **no quitar la fila** y mostrar el mensaje de `getErrorMessage`.
14. En el encabezado de la tabla, un enlace a `/expenses/new` con el texto "Nuevo gasto".
15. En el estado vacío, `emptyMessage="Todavía no hay gastos registrados"` y `emptyLabel="Registrar el primero"`, con `emptyHref="/expenses/new"`. El `colSpan` es el número de columnas de la tabla.
16. En el estado vacío, **no ofrecer un botón de editar ni de restaurar.** No hay restauración en el contrato.
17. Crear `frontend/src/pages/expenses/new.astro` con el `Layout` y `activeSection="expenses"`, con los cuatro campos del gasto: `name`, `description`, `total` y `expense_date`.
18. En el campo de `name`, `required`, de 1 a 200 caracteres, y un texto de apoyo que diga que es texto libre: "Escribí el concepto como lo llamás". La etiqueta "Nombre" sola hace pensar en un catálogo.
19. En el campo de `description`, un `textarea` opcional con máximo de 500 caracteres, y **un contador de caracteres visibles**. El límite de Zod es 500, y un textarea que deja escribir 800 y falla al enviar es una trampa.
20. En el campo de `total`, usar `type="text"` con `inputmode="decimal"` y `pattern`, **nunca** `type="number"`. La razón está en `tasks/frontend/05`.
21. En el campo de `total`, **no aceptar un negativo.** El `CHECK` de la base lo rechaza y el DTO lo rechaza. Mostrar el error del backend junto al campo es suficiente; agregar una validación de signs en el cliente duplica la regla.
22. En el campo de `expense_date`, usar `type="date"` con la conversión a ISO UTC, y **precargar con hoy en hora local**. `expense_date` es la única fecha de negocio con valor por defecto en la base, pero el formulario lo manda explícitamente para que la fecha que se ve sea la fecha que se guarda.
23. En el `submit`, deshabilitar el botón y mostrar "Guardando..." durante la llamada.
24. En el `submit`, con éxito, **redirigir a `/expenses` con el rango de fechas que se estaba viendo**, no a la raíz del listado. Si la dueña estaba viendo septiembre, vuelve a septiembre.
25. En el `submit`, con error, mostrar el mensaje junto al campo correspondiente, con `getFieldErrors` de `tasks/frontend/05`.
26. En el error de negocio del `CHECK` de importe negativo, **mostrarlo junto al campo del total** y no como error general. Es un error de un campo, aunque venga de la base y no de Zod.
27. En el `submit`, **no limpiar el formulario antes de saber el resultado.** Un fallo de red con los datos escritos en pantalla es recuperable; uno con el formulario vacío no.
28. Crear `frontend/src/pages/expenses/new.css` con lo específico: el ancho del formulario, el `textarea` con su contador, y el espacio de los mensajes de error.
29. En el `new.css`, **no re-declarar tokens.**
30. En la pantalla, poner un enlace "Volver a gastos" con la clase `no-print`, arriba del formulario.
31. **Evaluar mostrar el total del rango en el encabezado de la lista.** Si se muestra, sale de la respuesta del listado, no de una segunda llamada, y su texto de apoyo tiene que decir "suma de los gastos visibles, no del mes completo si hay un filtro". Si el cálculo no es directo, **no mostrarlo**: un total que se calcula en el cliente con `parseFloat` es el error que `tasks/frontend/01` existe para evitar.
32. Ejecutar `pnpm --filter shpr-web build` y confirmar que las dos pantallas compilan.
33. Verificar en el navegador el flujo completo: registrar un gasto, filtrar por mes, eliminar uno con confirmación, y comprobar que el resumen del dashboard actualiza `total_expenses`.

## Criterios de Done

- [x] `frontend/src/pages/expenses/index.astro`, `new.astro` y `new.css` existen.
- [x] El listado se construye sobre `data.expenses`, y los filtros vacíos no se envían.
- [x] La tabla tiene cinco columnas y **ninguna** es de estado.
- [x] La pantalla **no** tiene botón de editar, ni enlace a una ruta de edición, ni `PUT` en ningún `fetch` de la pantalla.
- [x] `grep -c "PUT" frontend/src/pages/expenses/` devuelve `0`. No hay camino de edición.
- [x] La celda de descripción muestra un guion cuando es `null`, y no la frase "Sin descripción".
- [x] Los importes salen de `formatMoney`, con alineación a la derecha y cifras tabulares.
- [x] El diálogo de borrado dice que el gasto deja de contar en el resumen del dashboard.
- [x] Un borrado que devuelve `404` quita la fila igual, sin mostrar error.
- [x] Un borrado fallido con otro error **no quita la fila** y muestra el mensaje traducido.
- [x] La pantalla no tiene ningún `select` de filtro: solo las dos fechas.
- [x] El estado vacío ofrece registrar el primero, y su `colSpan` coincide con el número de columnas.
- [x] El campo de nombre tiene un texto de apoyo que aclara que es texto libre.
- [x] El `textarea` de descripción tiene contador de caracteres y un máximo de 500.
- [x] El campo de total es `type="text"` con `inputmode="decimal"`, y su `pattern` coincide con `MONEY_PATTERN`.
- [x] Un total negativo muestra el error del `CHECK` **junto al campo**.
- [x] `expense_date` se precarga con la fecha local de hoy, no con la de UTC — en el HTML va el snapshot de build y el script lo reemplaza por el hoy de cada visita (`[data-expense-date]` + `todayLocal()` de `src/lib/date.ts`), igual que `sales/new` y `packages/new`. **CORR-19**: la spec cumplía el criterio solo si se compilaba y visitaba en el mismo minuto.
- [x] Un alta exitosa redirige a `/expenses` conservando el rango de fechas que se estaba viendo.
- [x] Un fallo del alta **deja los datos escritos en el formulario**.
- [x] `grep -c "parseFloat" frontend/src/pages/expenses/` devuelve `0`.
- [x] `grep -c "#[0-9a-fA-F]\{3,6\}" frontend/src/pages/expenses/new.css` devuelve `0`.
- [x] `pnpm --filter shpr-web build` termina con código de salida `0`.
- [x] `pnpm --filter shpr-web typecheck` termina con código de salida `0`.

### Re-verificación por CORR-12 — el paquete correcto

Los criterios de comando de esta spec estaban marcados como cumplidos, pero se
verificaron con `pnpm --filter shpr`, que resuelve al **backend** (`shpr`), no al
frontend (`shpr-web`). Se volvieron a pasar contra el paquete correcto:

| Criterio | Resultado real |
| --- | --- |
| `pnpm --filter shpr-web test` | **56/56** en 5 archivos, incluidas `api`, `format` y `errors` |
| `pnpm --filter shpr-web typecheck` | `astro check` en 0, 0 hints |
| `pnpm --filter shpr-web build` | exit 0; **20 páginas** = 7 estáticas + una por venta |

Los tres cumplen. Lo que cambia no es el resultado sino la razón por la que se
sostienen: antes pasaban porque el backend estaba verde y ahora pasan porque el
frontend está verde. Para build y typecheck era casi lo mismo —un `tsc` en verde
dice lo mismo venga de donde venga— pero para el de test era falso: el frontend
tiene **56** pruebas y el backend **126**, y se estaba afirmando las primeras con
el número de las segundas.
