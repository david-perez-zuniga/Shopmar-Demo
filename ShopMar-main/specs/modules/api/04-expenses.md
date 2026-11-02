# Gastos — tres endpoints

Alta, listado y borrado lógico de gastos del día a día.

## Índice

| Método | Ruta | Qué hace |
|--------|------|----------|
| `POST` | `/api/v1/expenses` | Registra un gasto. |
| `GET` | `/api/v1/expenses` | Lista los gastos. |
| `DELETE` | `/api/v1/expenses/:id` | Borra lógicamente el gasto. |

**No hay `PUT /api/v1/expenses/:id`.** Un gasto mal registrado se borra lógicamente y se vuelve a crear.

---

## `POST /api/v1/expenses`

### Cuerpo

```json
{
  "name": "Transporte del local",
  "description": "Gasolina de la camioneta",
  "total": "85.00",
  "expense_date": "2026-09-28T00:00:00.000Z"
}
```

| Campo | Tipo | Requerido | Regla |
|-------|------|-----------|-------|
| `name` | Cadena | **Sí** | De 1 a 200 caracteres. Texto libre. |
| `description` | Cadena o `null` | No | Hasta 500 caracteres. |
| `total` | Cadena decimal | **Sí** | `MONEY_PATTERN`: de 1 a 8 enteros y hasta 2 decimales, sin signo. |
| `expense_date` | Fecha ISO 8601 | No | **Es un día de negocio, no un instante.** Por defecto, el día del registro. Si viene con hora, el alta la trunca a la medianoche UTC de ese mismo día: dos gastos del mismo día empatan en la fecha y el listado desempata por la hora de registro. |

Cualquier otra clave produce `400`. El esquema es estricto.

### Respuesta `201`

```json
{
  "id": "e4b90c15-7d38-4a26-bf70-1c93d5e80248",
  "name": "Transporte del local",
  "description": "Gasolina de la camioneta",
  "total": "85.00",
  "expense_date": "2026-09-28T00:00:00.000Z",
  "created_at": "2026-09-28T19:45:00.512Z",
  "updated_at": "2026-09-28T19:45:00.512Z"
}
```

Si la descripción se omitió, vuelve `null`:

```json
{
  "id": "a71f3c28-6e04-4b19-9d73-5c8e2a0f6b34",
  "name": "Agua",
  "description": null,
  "total": "24.50",
  "expense_date": "2026-09-28T00:00:00.000Z",
  "created_at": "2026-09-28T20:10:01.221Z",
  "updated_at": "2026-09-28T20:10:01.221Z"
}
```

Un cliente debe manejar `description: null` explícitamente. La clave **siempre viaja** en la respuesta, aunque su valor sea `null`: la forma del recurso es estable, y eso evita que el cliente tenga que distinguir "no vino" de "vino vacío".

### Errores

| Situación | `message` |
|-----------|-----------|
| `name` vacío o de más de 200 caracteres | `"name: <mensaje de Zod sobre la longitud>"` |
| `description` de más de 500 caracteres | `"description: <mensaje de Zod sobre la longitud>"` |
| `total` con formato inválido | `"total: <mensaje de Zod sobre el patrón>"` |
| `total` con signo negativo | `"total: <mensaje de Zod sobre el patrón>"` |
| `total` como número JSON | `"total: <mensaje de Zod sobre el patrón>"` |
| `expense_date` no parsea | `"expense_date: <mensaje de Zod>"` |
| Clave desconocida | `"value: Unrecognized key(s) in object: '<clave>'"` |

`expense` no tiene clave foránea, así que **no hay** un `400` por referencia a otro recurso.

No hay `409`: `expense` no tiene restricciones de unicidad. Dos gastos con el mismo nombre y el mismo importe en el mismo día son dos gastos distintos, y pueden existir legítimamente.

---

## `GET /api/v1/expenses`

Lista los gastos. Devuelve el conjunto completo, sin paginación.

### Parámetros de query

| Parámetro | Tipo | Efecto |
|-----------|------|--------|
| `start_date` | Fecha ISO 8601 | Límite inferior inclusivo sobre `expense_date`, a las `00:00:00.000` UTC |
| `end_date` | Fecha ISO 8601 | Límite superior inclusivo sobre `expense_date`, hasta las `23:59:59.999` UTC |

**No hay filtro por `name` ni por `total`.** Se filtra por fecha, que es como la dueña busca un gasto. Un rango de un mes cabe en una pantalla sin búsqueda.

El orden es `expense_date` descendente, después `created_at` descendente y por último `id` descendente como desempate único. Dos gastos del mismo día aparecen del más reciente al más antiguo —un gasto recién registrado encabeza la tabla— y el resultado es determinista entre llamadas: el `id` es un UUID aleatorio y no sirve como criterio de orden.

Los gastos borrados lógicamente **no aparecen nunca**.

### Respuesta `200`

```json
{
  "expenses": [
    {
      "id": "e4b90c15-7d38-4a26-bf70-1c93d5e80248",
      "name": "Transporte del local",
      "description": "Gasolina de la camioneta",
      "total": "85.00",
      "expense_date": "2026-09-28T00:00:00.000Z",
      "created_at": "2026-09-28T19:45:00.512Z",
      "updated_at": "2026-09-28T19:45:00.512Z"
    },
    {
      "id": "a71f3c28-6e04-4b19-9d73-5c8e2a0f6b34",
      "name": "Agua",
      "description": null,
      "total": "24.50",
      "expense_date": "2026-09-27T00:00:00.000Z",
      "created_at": "2026-09-27T08:15:00.884Z",
      "updated_at": "2026-09-27T08:15:00.884Z"
    }
  ]
}
```

La forma de cada fila es **idéntica** a la del alta. Un gasto no tiene dos formas, a diferencia de la venta, que sí las tiene porque su listado omite datos que el detalle trae.

`total` viaja como cadena decimal. `created_at` y `updated_at` viajan aunque el panel no los muestre, para que la forma del recurso sea la misma en todos los endpoints.

### Errores

| Situación | `message` |
|-----------|-----------|
| `start_date` no parsea | `"start_date: <mensaje de Zod>"` |
| `end_date` no parsea | `"end_date: <mensaje de Zod>"` |
| Parámetro desconocido (`name`, `min_total`, `page`) | `"value: Unrecognized key(s) in object: '<clave>'"` |

Viene `page` o `limit` produce `400` en vez de ignorarse, por la misma razón que en ventas: un cliente que cree que está paginando tomó una decisión sobre el tamaño de la respuesta que en realidad no tomó.

Un rango sin resultados devuelve `200` con `{"expenses": []}`.

---

## `DELETE /api/v1/expenses/:id`

Borra lógicamente el gasto: escribe la fecha actual en `deleted_at` y nada más.

### Parámetro de ruta

| Parámetro | Tipo | Regla |
|-----------|------|-------|
| `id` | Cadena | UUID. Un valor que no sea UUID produce `400`, no `404`. |

### Respuesta `200`

```json
{
  "message": "Expense deleted successfully"
}
```

Misma forma que el borrado de paquetes: `200` con un mensaje en lugar de `204` sin cuerpo, para que el frontend pueda confirmar sin inventar el texto.

### Qué se borra y qué no

| Efecto | Detalle |
|--------|---------|
| `expense.deleted_at` | Se escribe la fecha actual. Es el **único** cambio. |
| La fila en la base | Sigue existiendo, con nombre, importe y fecha. |
| `GET /api/v1/expenses` | El gasto desaparece de la lista de inmediato. |
| `total_expenses` del dashboard | Deja de contar ese importe. |
| `created_at` | **No se toca.** Sigue siendo el de la alta. |
| `expense_date` | **No se toca.** Sigue siendo el día en que ocurrió el gasto. |

El borrado lógico es lo que permite corregir un error de registro sin destruir la información de que ese gasto existió. Un `DELETE` físico dejaría el mismo número en el dashboard que un borrado lógico, pero sin dejar rastro de por qué cambió.

### Idempotencia

Reintentar el borrado sobre el mismo identificador responde `404`, no `200`. El recurso ya no existe para el sistema, y decirlo con `404` es más honesto que devolver un éxito sobre algo que ya estaba borrado.

### Errores

| Situación | Código | `message` |
|-----------|--------|-----------|
| `id` no es un UUID | `BAD_REQUEST` | `"id: Expense id must be a valid UUID"` |
| El gasto no existe | `NOT_FOUND` | `"Expense not found"` |
| El gasto está borrado lógicamente | `NOT_FOUND` | `"Expense not found"` |

---

## Por qué no hay edición de gastos

No existe `PUT /api/v1/expenses/:id` ni `PATCH /api/v1/expenses/:id`. La salida para un gasto mal registrado es **borrarlo lógicamente y registrarlo de nuevo**.

Es la misma decisión que aplica a las ventas, y la razón es la misma: los registros creados no se editan, se anulan o se borran. En gastos, el borrado lógico es la única operación disponible, y por eso la ruta de corrección es rehacer el registro.

Hay una diferencia de consecuencia que vale la pena señalar:

| | Venta | Gasto |
|---|-------|-------|
| Cómo se retira de la vista operativa | `PATCH .../status` a `cancelled`, sin borrar el registro | `DELETE` lógico, que además lo saca de los números |
| Afecta las agregaciones del dashboard | **Sí.** Una venta `cancelled` deja de sumar en el importe y en el conteo (D-008) | **Sí.** Deja de sumar de inmediato |
| Tiene alternativa de corrección | Ninguna: `cancelled` es definitiva. Hay que registrar una venta nueva | Ninguna: hay que rehacer el registro |

Las dos exclusiones de D-008 se comportan igual: un gasto borrado desaparece de los números, y una venta `cancelled` también. La asimetría que queda es entre gastos y ventas, y es de otro tipo: **el gasto no tiene estado**, así que la única forma de sacarlo de los números es borrarlo, mientras que la venta tiene un estado que dice que no se cobró y por eso no necesita borrarse. Eso es lo que hace que `cancelled` sea irreversible por diseño: no hay forma de deshacer una cancelación sin volver a registrar la venta.

## Qué no existe en gastos

| Ausente | Razón |
|---------|-------|
| `GET /api/v1/expenses/:id` | El listado trae todos los campos. Un endpoint de lectura individual no aporta nada que la lista no dé, y no hay ninguna pantalla que necesite leer un gasto suelto. |
| `PUT /api/v1/expenses/:id` | Un gasto mal registrado se borra y se vuelve a crear. |
| `PATCH /api/v1/expenses/:id` | Por la misma razón. |
| `?name=` de filtro | Se filtra por fecha. El volumen de un mes cabe en una pantalla. |
| `?min_total=` o `?max_total=` | No hay una pregunta de negocio que requiera filtrar gastos por importe. |
| Un tipo o categoría de gasto | La mercadería y los gastos son texto libre (decisión D-002). Una tabla de categorías obligaría a elegir de una lista cerrada algo que la dueña ya sabe escribir. |
| `POST /api/v1/expenses/bulk` | No hay operaciones masivas en ningún recurso del sistema. |
