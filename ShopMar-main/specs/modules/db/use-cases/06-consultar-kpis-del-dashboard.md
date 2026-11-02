# Caso de uso: consultar los indicadores del dashboard

## Actor

La dueña de la tienda, al abrir el panel o al cambiar los filtros de fecha.

## Disparador

Navega a `/` o ajusta el rango de fechas en la barra de filtros.

## Flujo principal

1. **El panel arma la consulta.** `frontend/src/pages/index.astro` lee `Astro.url.searchParams` para obtener `start_date` y `end_date` opcionales, y los pasa como query a `api.ts`.
2. **El panel pide los indicadores.** `api.ts` ejecuta `fetch` contra `GET /api/v1/dashboard/summary` con los parámetros presentes. Sin parámetros, la petición es la ruta pelada.
3. **El controlador valida el query.** `DashboardQuerySchema.parse(request.query)`: `start_date` y `end_date` con `z.coerce.date().optional()`, ambas opcionales e independientes. **No hay ningún parámetro de estado**: los seis indicadores no se pueden filtrar por `sale_status` en la versión 1 (decisión D-008). El usuario no elige qué estados ver; el filtro por estado es una regla fija del sistema.
4. **El servicio delega.** `createDashboardService(...).summary(params)` no aplica ninguna lógica de negocio: delega en el repositorio. Es un caso de uso de solo lectura.
5. **El repositorio construye un único `where` de venta.** `buildSaleWhere(params)` devuelve una condición `SQL`:

   ```ts
   return and(
     isNull(sale.deletedAt),
     ne(sale.status, "cancelled"),
     params.start_date ? gte(sale.saleDate, params.start_date) : undefined,
     params.end_date ? lte(sale.saleDate, endOfDay(params.end_date)) : undefined,
   )
   ```

   El filtro de fecha se aplica **siempre sobre `sale_date`**, nunca sobre `created_at`. El rango es inclusivo en ambos extremos: `start_date` a las `00:00:00.000` y `end_date` al final del día (`23:59:59.999`) en UTC. Con solo `start_date`, el rango va de ese día hasta el final de los tiempos; con solo `end_date`, desde el origen de los tiempos hasta ese día.
6. **El repositorio cuenta las ventas.** `db.select({ value: count() }).from(sale).where(saleFilter)` con el mismo filtro, que ya incluye `deleted_at IS NULL` y `status <> 'cancelled'`.
7. **El repositorio suma ingresos, caja y cartera en cinco consultas.** Los ingresos de una venta son `sale.cost` más la suma de sus artículos adicionales, y esos dos datos viven en tablas distintas; la caja vive en `sale_payment` y la cartera se deriva de las tres tablas. El repositorio ejecuta cinco consultas en paralelo con `Promise.all`, además del conteo del paso 6, y las combina:

   | Consulta | Qué trae | Filtro |
   |----------|----------|--------|
   | `db.select({ value: sum(sale.cost) }).from(sale).where(saleFilter)` | Suma de `cost` de las ventas del rango | `saleFilter` |
   | `db.select({ value: sum(additionalSale.total) }).from(additionalSale).innerJoin(sale, ...).where(and(isNull(additionalSale.deletedAt), saleFilter))` | Suma de los artículos adicionales de esas mismas ventas | **`deleted_at IS NULL` en la propia tabla** y `saleFilter` en la venta unida |
   | `db.select({ value: sum(expense.total) }).from(expense).where(expenseFilter)` | Suma de los gastos del rango | `expenseFilter`, con `deleted_at IS NULL` y el mismo rango sobre `expense_date` |
   | `db.select({ value: sum(salePayment.amount) }).from(salePayment).innerJoin(sale, ...).where(collectedFilter)` | Suma de los pagos vivos del rango: **la caja** | `deleted_at IS NULL` en el pago y en la venta, `status <> 'cancelled'` y el rango sobre `paid_at`, **nunca** sobre `sale_date` |
   | `db.select({ outstanding, overdue }).from(cuentasPorCobrar).where(balance > 0)` | Saldo vivo de las ventas a crédito del rango y su parte vencida | `saleFilter` + `payment_terms = 'credit'`, y `balance > 0` |
8. **La segunda consulta es donde está la trampa.** Unir `additional_sale` contra `sale` filtra las ventas por su `where`, y **eso no excluye los artículos borrados lógicamente**. Sin el `deleted_at IS NULL` explícito en la propia tabla, un artículo borrado de una venta viva seguiría sumando ingresos. El filtro dual es obligatorio: la venta debe estar viva **y** el artículo debe estar vivo.
9. **El servicio combina los importes.** `createDashboardService(...).summary` suma con `sumMoney([saleCost, additionalTotal])`, que usa `new Decimal(a).plus(b)` de `decimal.js`, y pasa el resultado por `toMoneyString`. `sum()` de Drizzle devuelve `string` o `null`; cuando las dos sumas son `null` —un rango sin ventas y sin artículos— el mapper las reemplaza por `"0"` y el resultado es `"0.00"`, nunca `null` ni una cadena vacía.
10. **El panel pinta seis tarjetas.** Cada una con su cifra y su texto de apoyo: total vendido, número de ventas, total de gastos, cobrado, por cobrar y vencido. Los importes llegan como cadena y se formatean con expresiones regulares en `src/lib/format.ts`, sin `parseFloat`.

## Datos involucrados

### Las agregaciones del resumen

| Indicador | Tabla(s) | Qué suma o cuenta | Filtros aplicados |
|-----------|-----------|-------------------|-------------------|
| `total_revenue` | `sale` + `additional_sale` | `SUM(sale.cost) + SUM(additional_sale.total)` | `deleted_at: null` en ambas tablas, `status <> 'cancelled'`, rango sobre `sale_date`. |
| `sales_count` | `sale` | `COUNT(*)` | `deleted_at: null`, `status <> 'cancelled'`, rango sobre `sale_date`. |
| `total_expenses` | `expense` | `SUM(expense.total)` | `deleted_at: null`, rango sobre `expense_date` |
| `collected_revenue` | `sale_payment` + `sale` | `SUM(sale_payment.amount)` | `deleted_at: null` en el pago y en la venta, `sale.status <> 'cancelled'`, rango sobre **`paid_at`** |
| `outstanding_receivables` | `sale` + `additional_sale` + `sale_payment` | `SUM(cost + SUM(additional_sale.total) − SUM(sale_payment.amount))` | `deleted_at: null` en las tres tablas, `status <> 'cancelled'`, `payment_terms = 'credit'`, rango sobre `sale_date`, y **sólo saldos `> 0`** |
| `overdue_receivables` | las mismas tres | El mismo saldo, con `SUM(...) FILTER (WHERE due_date < now())` | Idénticos a `outstanding_receivables` más `due_date < now()` |

### De dónde sale el saldo de una venta a crédito

`total = cost + SUM(additional_sale.total)` con `additional_sale.deleted_at IS NULL`, y
`paid_total = SUM(sale_payment.amount)` con `sale_payment.deleted_at IS NULL`; el saldo es `total − paid_total`
(D-022, punto 3). Ni `total` ni `paid_total` ni el saldo se guardan: se derivan en la consulta.

La expresión se escribe **una sola vez** en el repositorio (`creditBalanceExpression`) y alimenta los dos
agregados de cartera. Se resuelve con **subconsultas correlacionadas** y no con `JOIN`s: la venta tiene
dos relaciones uno-a-muchos (renglones y pagos) y unirlas en la misma sentencia multiplica las filas, con
lo que la suma saldría inflada. La consulta envuelve esa expresión en una tabla derivada
(`cuentas_por_cobrar`) para evaluarla una vez por venta, filtrar los saldos positivos y agregar el total
y el vencido con un `FILTER` en la misma pasada.

Tres consecuencias que el contrato ya fija y que esta consulta respeta al pie de la letra:

| Regla | Cómo se ve en el SQL |
|-------|----------------------|
| Una venta `cancelled` no aporta aunque tenga pagos en el libro | `sale.status <> 'cancelled'` en la caja y en la cartera. |
| Una venta sobrepagada no resta | `WHERE balance > 0` deja afuera el saldo negativo. |
| La caja no se filtra por `sale_date` | El rango de `collected_revenue` va sobre `paid_at`; una venta de enero cobrada en marzo entra en marzo. |

### Ninguna escritura

Este caso de uso **no modifica ninguna fila**. No hay transacción, no hay escritura, no hay riesgo de conflicto. Es el único caso de uso del modelo que es completamente de solo lectura.

### Salida: el resumen

```json
{
  "total_revenue": "4837500.00",
  "sales_count": 128,
  "total_expenses": "124530.00",
  "collected_revenue": "5120000.00",
  "outstanding_receivables": "860000.00",
  "overdue_receivables": "240000.00"
}
```

Los seis campos son obligatorios y ninguno puede ser `null`. Los cinco importes viajan como cadena decimal; el conteo (`sales_count`) como número entero JSON, porque un conteo no tiene riesgo de coma flotante y es lo que el panel necesita para pintar un número.

## Alternativas y errores

| Situación | Detección | Respuesta |
|-----------|-----------|-----------|
| `start_date` no parsea | `z.coerce.date()` | `400` con el prefijo `start_date` |
| `end_date` no parsea | `z.coerce.date()` | `400` con el prefijo `end_date` |
| `start_date` es posterior a `end_date` | No se comprueba | `200` con los seis indicadores en cero. El panel lo señala con el texto de apoyo "Sin datos en el rango seleccionado". |
| Viene un parámetro `status` o `page` | `DashboardQuerySchema` es `.strict()` | `400` con la lista de claves no reconocidas |
| El rango no tiene ventas | `sum()` devuelve `null` | `200` con `"total_revenue": "0.00"`. **Nunca `null`.** |
| El rango no tiene gastos | `sum()` devuelve `null` | `200` con `"total_expenses": "0.00"` |
| La API no está disponible | Fallo de red en `api.ts` | El panel muestra el sobre de error con `NETWORK_ERROR` y el botón "Reintentar" |
| El backend responde `500` | Sobre de error de la API | El panel muestra `INTERNAL_ERROR` sin revelar el detalle técnico |

### Por qué los conteos son números y los importes son cadenas

Una decisión deliberada que vale la pena explicitar. `sales_count` es un entero que no supera con holgura `2^53`, así que un número JSON los representa sin pérdida y el panel los puede pintar directamente. Los importes usan `DECIMAL(10,2)` y deben viajar como cadena para no pasar por un `double` en el `JSON.stringify` (decisión D-003). Mezclar los dos criterios en un mismo objeto es correcto: cada tipo se serializa como lo que realmente es.

### Lo que este caso de uso deliberadamente no hace

| Lo que no hace | Razón |
|---------------|-------|
| No acepta un parámetro de estado | Decisión D-008. El usuario no elige qué estados ver: el filtro es fijo. |
| Excluye las ventas `cancelled` del ingreso y del conteo | Decisión D-008, revertida el 2026-10-04. Una venta cancelada no se cobró, y sus artículos adicionales tampoco cuentan. `pending` sí cuenta. |
| No devuelve series temporales ni gráficos | El dashboard es cuatro cifras, no un informe. Agregar series es un endpoint nuevo, no un parámetro. |
| No devuelve el detalle de lo que compone cada número | La dueña necesita cifras, no auditorías. |
| No persiste snapshots | Una tabla de snapshots sería una segunda fuente de verdad. Decisión D-003. |
| No pagina | Devuelve seis valores. No hay nada que paginar. |

## Salida

| Elemento | Resultado |
|----------|-----------|
| Estado HTTP | `200 OK` |
| Cuerpo | Los seis indicadores, con los cinco importes como cadena decimal y `sales_count` como entero |
| Ubicación en el panel | Las seis tarjetas de `/` |
| Consultas a la base | Seis en un mismo `Promise.all`: `count` de ventas, `sum` de `cost`, `sum` de renglones, `sum` de gastos, `sum` de pagos (caja) y la agregación de cartera (por cobrar y vencido) |
| Efecto en el esquema | Ninguno |
