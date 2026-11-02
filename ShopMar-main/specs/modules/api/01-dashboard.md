# Dashboard — `GET /api/v1/dashboard/summary` · `GET /api/v1/dashboard/daily-series`

Devuelve los seis indicadores de la pantalla principal. Un solo endpoint, una lectura, seis números.

## `GET /api/v1/dashboard/summary`

Sin autenticación. Sin cuerpo de petición.

### Parámetros de query

Todos opcionales e independientes.

| Parámetro | Tipo | Formato | Efecto |
|-----------|------|---------|--------|
| `start_date` | Fecha | ISO 8601, `YYYY-MM-DD` o completo | Límite inferior **inclusivo** sobre la fecha de negocio, a las `00:00:00.000` UTC. |
| `end_date` | Fecha | ISO 8601, `YYYY-MM-DD` o completo | Límite superior **inclusivo** sobre la fecha de negocio, hasta las `23:59:59.999` UTC. |

| Combinación | Rango resultante |
|-------------|------------------|
| Ninguno | Todos los registros no borrados lógicamente |
| Solo `start_date` | Desde las `00:00:00.000` de ese día hasta el final |
| Solo `end_date` | Desde el origen hasta las `23:59:59.999` de ese día |
| Ambos | Rango cerrado, ambos extremos incluidos |
| `start_date` posterior a `end_date` | Rango vacío. Los seis indicadores vuelven en cero. |

La fecha de negocio es distinta en cada recurso: `sale_date` para ventas y `expense_date` para gastos. El mismo par de parámetros acota los dos, cada uno con su propia columna, salvo la caja (`collected_revenue`), que se acota por `paid_at` (ver *Caja y devengado*).

El rango se aplica **siempre** a la fecha de negocio, nunca a `created_at`. Una venta registrada hoy con `sale_date` de la semana pasada pertenece a la semana pasada, que es como la dueña piensa.

### Respuesta `200`

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

| Campo | Tipo | Definición |
|-------|------|------------|
| `total_revenue` | Cadena decimal | `SUM(sale.cost)` + `SUM(additional_sale.total)` de las ventas del rango. Incluye los artículos adicionales de las ventas de WhatsApp. |
| `sales_count` | Entero | Número de ventas del rango. |
| `total_expenses` | Cadena decimal | `SUM(expense.total)` de los gastos del rango. |
| `collected_revenue` | Cadena decimal | `SUM(sale_payment.amount)` de los pagos **vivos** cuyo `paid_at` cae en el rango, de ventas vivas y no canceladas. |
| `outstanding_receivables` | Cadena decimal | Suma de `total − paid_total` de las ventas **a crédito** del rango (`sale_date`) que todavía deben algo. |
| `overdue_receivables` | Cadena decimal | El mismo saldo, restringido a las ventas cuyo `due_date` ya pasó. |

Los tres agregados de crédito son **cadena decimal con dos decimales** y valen `"0.00"` cuando no hay nada que sumar, igual que `total_revenue` y `total_expenses`. `overdue_receivables` es siempre un subconjunto de `outstanding_receivables`: la venta vencida ya está contada en el total por cobrar, sólo que además se muestra aparte.

**Los seis campos son obligatorios y ninguno puede ser `null`.** Cuando un rango no tiene datos, los importes son `"0.00"` y los conteos son `0`.

### Qué incluye y qué excluye cada número

Esta tabla es la parte más importante del contrato, porque los seis números se presentan sin más contexto en la pantalla.

| Indicador | Excluye | Incluye |
|-----------|---------|---------|
| `total_revenue` | Ventas borradas lógicamente. Ventas `cancelled`. Artículos adicionales borrados lógicamente. Artículos adicionales de ventas `cancelled`. | Ventas `pending` y `completed`. Artículos adicionales de ventas de cualquier canal, mientras la venta no esté cancelada. |
| `sales_count` | Ventas borradas lógicamente. Ventas `cancelled`. | Ventas `pending` y `completed` de cualquier canal. |
| `total_expenses` | Gastos borrados lógicamente. | Todos los gastos del rango. |
| `collected_revenue` | Pagos borrados lógicamente. Pagos de ventas borradas lógicamente. Pagos de ventas `cancelled`. Pagos cuyo `paid_at` cae fuera del rango, aunque la venta sea del rango. | Pagos vivos de ventas vivas y no canceladas, con `paid_at` dentro del rango. **El filtro de `sale_date` no aplica.** |
| `outstanding_receivables` | Ventas borradas lógicamente. Ventas `cancelled`. Ventas de contado. Ventas a crédito con `sale_date` fuera del rango. Saldos iguales a cero o negativos. Artículos adicionales borrados lógicamente. Pagos borrados lógicamente. | Ventas a crédito vivas, no canceladas, con `sale_date` en el rango y saldo **estrictamente positivo**, donde `total = cost + SUM(additional_sale.total)` y `paid_total = SUM(sale_payment.amount)`. |
| `overdue_receivables` | Todo lo que excluye `outstanding_receivables`, más las ventas cuyo `due_date` todavía no pasó. | El subconjunto de `outstanding_receivables` con `due_date` anterior a hoy. |

### Caja y devengado son dos preguntas distintas

`total_revenue` es **devengado** y `collected_revenue` es **caja**, y por eso no comparten la columna de fecha: el devengado se imputa a `sale_date` y la caja a `paid_at`. Una venta a crédito de enero cobrada en marzo suma en el devengado de enero y en la caja de marzo, y ninguna de las dos cifras miente (decisión D-022, punto 6).

De ahí la consecuencia que más sorprende al leer el contrato: `collected_revenue` **ignora deliberadamente el filtro de `sale_date`**. Si lo respetara, un rango de marzo no vería el pago de una venta de enero y la caja del mes quedaría en cero justo cuando la dueña cobró. Los saldos (`outstanding_receivables` y `overdue_receivables`) sí son devengados y por eso sí se filtran por `sale_date`.

Las dos primeras filas son la consecuencia directa de la decisión D-008, revertida en su parte del filtro por estado el 2026-10-04: **las agregaciones aplican dos exclusiones, `deleted_at: null` y `status <> 'cancelled'`**. Una venta cancelada no suma ingresos ni cuenta en `sales_count`, y sus artículos adicionales tampoco.

Que salga de las dos cifras y no solo del importe es deliberado: el conteo acompaña al importe y un panel que dice "5 ventas" con dos que no se cobraron está mintiendo en la misma línea. `pending` **sí** cuenta: una venta pendiente puede cobrarse hoy.

El frontend traduce estas definiciones en el texto de apoyo de cada tarjeta, de modo que la dueña nunca ve un número sin su definición.

### Errores

| Situación | Código | `message` |
|-----------|--------|-----------|
| `start_date` no parsea como fecha | `BAD_REQUEST` | `"start_date: <mensaje de Zod>"` |
| `end_date` no parsea como fecha | `BAD_REQUEST` | `"end_date: <mensaje de Zod>"` |
| Viene un parámetro no declarado | `BAD_REQUEST` | `"value: Unrecognized key(s) in object: '<clave>'"` |
| Fallo en la base de datos | `INTERNAL_ERROR` | `"Internal server error"` |
| Más de 1000 peticiones en un minuto | `TOO_MANY_REQUESTS` | El mensaje de `@fastify/rate-limit` |

`start_date` posterior a `end_date` **no es un error**: devuelve `200` con los seis indicadores en cero, y el frontend lo muestra como "Sin datos en el rango seleccionado". Validar el orden del rango agregaría un `400` por un error que el usuario ve corregido en la interfaz.

### Ejemplos

Sin filtros, con una semana de datos:

```bash
curl http://localhost:3000/api/v1/dashboard/summary
```

```json
{
  "total_revenue": "1245800.00",
  "sales_count": 34,
  "total_expenses": "42500.00",
  "collected_revenue": "1150000.00",
  "outstanding_receivables": "320000.00",
  "overdue_receivables": "45000.00"
}
```

Con un mes acotado:

```bash
curl "http://localhost:3000/api/v1/dashboard/summary?start_date=2026-09-01&end_date=2026-09-30"
```

Rango vacío, con `start_date` posterior a `end_date`:

```bash
curl "http://localhost:3000/api/v1/dashboard/summary?start_date=2026-09-30&end_date=2026-09-01"
```

```json
{
  "total_revenue": "0.00",
  "sales_count": 0,
  "total_expenses": "0.00",
  "collected_revenue": "0.00",
  "outstanding_receivables": "0.00",
  "overdue_receivables": "0.00"
}
```

Sin ventas ni artículos en el rango, la suma es cero y no `null`:

```json
{
  "total_revenue": "0.00",
  "sales_count": 0,
  "total_expenses": "0.00",
  "collected_revenue": "0.00",
  "outstanding_receivables": "0.00",
  "overdue_receivables": "0.00"
}
```

## `GET /api/v1/dashboard/daily-series`

La serie que dibuja el gráfico de barras del Resumen. Comparte el par de parámetros del resumen (`start_date`, `end_date`, ambos inclusivos y en UTC), suma un parámetro propio y devuelve puntos con la misma forma en las dos granularidades: `date`, `income`, `expense`, `label`.

| Parámetro | Tipo | Formato | Efecto |
|-----------|------|---------|--------|
| `start_date` | Fecha | ISO 8601, `YYYY-MM-DD` o completo | Mismo límite inferior que el resumen. |
| `end_date` | Fecha | ISO 8601, `YYYY-MM-DD` o completo | Mismo límite superior que el resumen. |
| `tz_offset` | Entero | Minutos al este de UTC, `-840`…`840` | El reloj del navegador que pide la serie (`Nicaragua = -360`). Sólo lo usa la granularidad horaria; sin él la hora es UTC. |

| Rango | Granularidad | Puntos | `date` | `label` |
|-------|--------------|--------|--------|---------|
| `start_date` y `end_date` en el **mismo día** UTC | Hora | Siempre **24**: `00:00` … `23:00` | Hora del día del período, `"2026-10-21T19:00:00.000Z"` | `"19:00"` |
| Cualquier otro rango con los dos extremos | Día | Un punto por **día del período**, con `"0.00"` donde no hubo movimiento | Día UTC, `"2026-10-21"` | `"Mié 21"` |
| Rango abierto, invertido, o de más de 366 días | Día | Un punto por día **con movimiento** | Día UTC, `"2026-10-21"` | `"Mié 21"` |

Las dos granularidades son la misma pregunta con distinto paso: el día de negocio es el día UTC, igual que en el resumen, y el gráfico no dibuja barra para un cero. Con un solo día la serie trae las 24 horas completas aunque todavía no haya pasado el día; rellenar el período entero (y no sólo los días con datos) es lo que evita que una semana con un solo día de ventas se dibuje como una única barra que ocupa media tarjeta.

### La hora de la barra es la hora de registro

`sale_date` y `expense_date` son **días de negocio**: el formulario los escribe como `T00:00:00.000Z` y el servicio los defaultea al instante del alta sin normalizar la hora del día. Agrupar la serie horaria por esas columnas pondría todas las barras en `00:00`. Por eso la granularidad horaria agrupa `created_at` —el instante real del alta— visto con el desplazamiento `tz_offset` del navegador, y la población filtrada no cambia: el rango sigue acotando `sale_date`/`expense_date` como en las tarjetas, así que el total del gráfico es el mismo que el de «Vendido» y «Gastos».

Consecuencia observable: una venta registrada hoy con fecha de negocio de otro día se dibuja en la hora en la que se registró, y no en la hora del día al que pertenece contablemente.

Cuando la serie diaria queda sin ningún punto (rango abierto sin datos), la respuesta trae los últimos siete días en cero para que el eje no quede vacío. Con granularidad horaria eso no aplica: las 24 horas ya son el eje.

## Notas de implementación

La Implementación completa está en `modules/backend/03-api.md` y el flujo de datos paso a paso en `modules/db/use-cases/06-consultar-kpis-del-dashboard.md`. Tres detalles del contrato que el cliente puede deducir de la base:

| Detalle | Consecuencia observable |
|---------|------------------------|
| El repositorio ejecuta seis consultas en un mismo `Promise.all` (un `count`, cuatro `sum` y una agregación de cartera) | Un cambio en una tabla puede hacer que un indicador se actualice y otro no, dentro de la misma respuesta. No hay transacción de lectura, y no la hay a propósito: los indicadores son un resumen, no un estado consistente. |
| El saldo por venta se calcula con subconsultas correlacionadas, no con `JOIN` | `outstanding_receivables` y `overdue_receivables` salen de la **misma** expresión de saldo (`cost + SUM(additional_sale.total) − SUM(sale_payment.amount)`), evaluada una vez por venta a crédito. Unir dos relaciones uno-a-muchos multiplicaría filas y el saldo saldría inflado. |
| Sólo los saldos **estrictamente positivos** entran en la cartera | Una venta sobrepagada por error no resta del agregado: el total por cobrar nunca queda por debajo de cero. |
| La agregación de artículos adicionales filtra `deleted_at: null` en la propia tabla además del filtro de venta | Un artículo borrado de una venta viva no suma ingresos. |
| La agregación de artículos adicionales hereda el filtro `status <> 'cancelled'` de la venta | Los artículos de una venta cancelada no suman ingresos aunque la venta sea visible. |
| Los conteos son `number` y los importes son `string` | La API no normaliza los tipos: un conteo es un entero y un importe es un decimal de precisión fija. Los tipos de `frontend/src/lib/types.ts` reflejan esa diferencia. |
