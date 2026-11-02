# Clientes — cuatro endpoints

Alta, listado con búsqueda y saldos, edición parcial y borrado lógico del cliente registrado.

## Índice

| Método | Ruta | Qué hace |
|--------|------|----------|
| `POST` | `/api/v1/customers` | Registra un cliente. |
| `GET` | `/api/v1/customers` | Lista los clientes y, si se pide, sus saldos por cobrar. |
| `PATCH` | `/api/v1/customers/:id` | Edita el nombre, el teléfono o la nota. |
| `DELETE` | `/api/v1/customers/:id` | Borra lógicamente el cliente. |

El cliente registrado existe porque una **venta a crédito** necesita un sujeto al que deberle plata y una cuenta por cobrar que se pueda mirar por persona (D-022). Sin él, dos «María González» son el mismo renglón y no hay forma de saber quién debe.

**El nombre de la venta sigue siendo texto.** `sale.customer_name` es una **instantánea** del nombre al momento de la venta: renombrar un cliente **no** reescribe las facturas viejas, que siguen diciendo lo que decían el día que se emitieron. `sale.customer_id` es la referencia viva, y toda venta nueva la lleva: si el alta trae sólo `customer_name`, el servicio resuelve el cliente o lo crea (S18).

**Un cliente también nace de una venta.** Cuando el alta de una venta trae `customer_name` y no hay ningún cliente **vivo** con ese nombre —comparado recortado y sin distinguir mayúsculas—, la venta crea el cliente con el nombre recortado y queda enlazada a él. Si ya existe, lo reutiliza y la factura imprime el nombre guardado. Desde una venta sólo se puede dar de alta el nombre: el teléfono y la nota se completan después con `PATCH /api/v1/customers/:id`.

---

## `POST /api/v1/customers`

### Cuerpo

```json
{
  "name": "María González",
  "phone": "8888 1234",
  "note": "Vive en el barrio San Judas, paga los viernes"
}
```

| Campo | Tipo | Requerido | Regla |
|-------|------|-----------|-------|
| `name` | Cadena | **Sí** | De 1 a 200 caracteres. Texto libre. |
| `phone` | Cadena o `null` | No | Hasta 30 caracteres. Tal como lo escribe la dueña, sin formato impuesto. |
| `note` | Cadena o `null` | No | Hasta 500 caracteres. |

**Ninguna clave distinta de estas es aceptada.** El esquema es estricto.

No hay restricción de unicidad: ni el nombre ni el teléfono identifican a una persona. Una familia comparte teléfono y dos clientes pueden llamarse igual, así que dos altas con el mismo nombre son dos clientes distintos y las dos se aceptan. Por la misma razón, dos ventas **simultáneas** con un nombre que todavía no existe pueden crear dos clientes: es un duplicado inofensivo y visible, no un dato perdido, y nunca se resuelve con un `UNIQUE` (S18).

### Respuesta `201`

```json
{
  "id": "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16",
  "name": "María González",
  "phone": "8888 1234",
  "note": "Vive en el barrio San Judas, paga los viernes",
  "created_at": "2026-09-28T15:12:44.318Z",
  "updated_at": "2026-09-28T15:12:44.318Z"
}
```

Si se omitieron el teléfono y la nota, las dos claves viajan igual, con `null`:

```json
{
  "id": "c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42",
  "name": "Jorge Medina",
  "phone": null,
  "note": null,
  "created_at": "2026-09-28T15:20:07.004Z",
  "updated_at": "2026-09-28T15:20:07.004Z"
}
```

La forma del recurso es estable: un cliente siempre tiene las seis claves. El cliente no tiene estado ni saldo propio —el saldo es una lectura de sus ventas, no un campo del cliente.

### Errores

| Situación | Código | `message` |
|-----------|--------|-----------|
| `name` vacío o de más de 200 caracteres | `BAD_REQUEST` | `"name: <mensaje de Zod sobre la longitud>"` |
| `phone` de más de 30 caracteres | `BAD_REQUEST` | `"phone: <mensaje de Zod sobre la longitud>"` |
| `note` de más de 500 caracteres | `BAD_REQUEST` | `"note: <mensaje de Zod sobre la longitud>"` |
| Clave desconocida | `BAD_REQUEST` | `"value: Unrecognized key(s) in object: '<clave>'"` |

No hay `404` —no se referencia ningún otro recurso— ni `409`: `customer` no tiene ninguna restricción de unicidad.

---

## `GET /api/v1/customers`

Lista los clientes. Devuelve el conjunto completo, sin paginación.

### Parámetros de query

Todos opcionales y estrictos: un parámetro desconocido produce `400` en vez de ignorarse.

| Parámetro | Tipo | Efecto |
|-----------|------|--------|
| `q` | Cadena | Filtra por nombre **o** teléfono, sin distinguir mayúsculas, con `ILIKE '%q%'`. |
| `include_balances` | `"true"` o `"false"` | Agrega `outstanding_balance` y `overdue_balance` a cada fila. Por defecto `"false"`. |

El orden es `name` ascendente, con `id` ascendente como segundo criterio. Es determinista entre llamadas, y es el orden en que la dueña busca a alguien en una lista alfabética.

Los clientes borrados lógicamente **no aparecen nunca**, con o sin filtros.

`q` busca en el nombre y en el teléfono a la vez porque en el mostrador la dueña identifica al cliente con lo que tiene a mano: a veces el nombre, a veces el número que quedó en el chat. El `%` y el `_` que vengan dentro de `q` son texto, no comodines: se escapan antes de armar el patrón.

### Respuesta `200`

Sin `include_balances`:

```json
{
  "customers": [
    {
      "id": "c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42",
      "name": "Jorge Medina",
      "phone": null,
      "note": null,
      "created_at": "2026-09-28T15:20:07.004Z",
      "updated_at": "2026-09-28T15:20:07.004Z"
    },
    {
      "id": "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16",
      "name": "María González",
      "phone": "8888 1234",
      "note": "Vive en el barrio San Judas, paga los viernes",
      "created_at": "2026-09-28T15:12:44.318Z",
      "updated_at": "2026-09-28T15:12:44.318Z"
    }
  ]
}
```

Con `include_balances=true`, cada fila suma los dos saldos:

```json
{
  "customers": [
    {
      "id": "c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42",
      "name": "Jorge Medina",
      "phone": null,
      "note": null,
      "created_at": "2026-09-28T15:20:07.004Z",
      "updated_at": "2026-09-28T15:20:07.004Z",
      "outstanding_balance": "0.00",
      "overdue_balance": "0.00"
    },
    {
      "id": "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16",
      "name": "María González",
      "phone": "8888 1234",
      "note": "Vive en el barrio San Judas, paga los viernes",
      "created_at": "2026-09-28T15:12:44.318Z",
      "updated_at": "2026-09-28T15:12:44.318Z",
      "outstanding_balance": "1600.50",
      "overdue_balance": "1600.50"
    }
  ]
}
```

Los dos saldos son **cadenas decimales** con dos decimales, igual que cualquier importe de la API: `"0.00"` cuando no hay deuda, nunca `0` ni `null`.

### Cómo se calculan los saldos

| Pregunta | Campo | Definición |
|----------|-------|------------|
| ¿Cuánto debe este cliente? | `outstanding_balance` | Suma de `total − paid_total` de sus ventas a crédito cobrables |
| ¿Cuánto de eso está vencido? | `overdue_balance` | La parte de ese saldo cuyo `due_date` ya pasó |

Una venta cuenta para el saldo sólo si cumple **las cuatro** condiciones:

| Condición | Por qué |
|-----------|---------|
| `payment_terms = 'credit'` | Un pendiente de contado no es una deuda |
| `deleted_at IS NULL` | Lo borrado lógicamente no existe para el sistema |
| `status <> 'cancelled'` | Una venta cancelada no se cobra |
| `balance > 0` | Una venta ya cobrada no aporta saldo |

`total` es `cost` más la suma de sus artículos adicionales, y `paid_total` es la suma de los pagos vivos del libro: los dos son derivados y ninguno se guarda (D-022). `overdue_balance` usa la misma definición de vencida que el listado de ventas —`balance > 0` y `due_date` anterior a hoy—, así que el número del cliente y la fila del listado siempre coinciden.

Los saldos son una **lectura agregada**, no un campo del cliente: no se escriben en `customer`, y por eso no hay nada que quede desactualizado cuando se registra o se borra un pago.

### Errores

| Situación | Código | `message` |
|-----------|--------|-----------|
| `q` de más de 200 caracteres | `BAD_REQUEST` | `"q: q must be at most 200 characters"` |
| `include_balances` con un valor distinto de `true`/`false` | `BAD_REQUEST` | `"include_balances: include_balances must be \"true\" or \"false\""` |
| Parámetro desconocido (`page`, `limit`, `sort`) | `BAD_REQUEST` | `"value: Unrecognized key(s) in object: '<clave>'"` |

Una búsqueda sin resultados devuelve `200` con `{"customers": []}`.

---

## `PATCH /api/v1/customers/:id`

Edita el cliente. Es un parche parcial: viajan sólo los campos que cambian.

### Parámetro de ruta

| Parámetro | Tipo | Regla |
|-----------|------|-------|
| `id` | Cadena | UUID. Un valor que no sea UUID produce `400`, no `404`. |

### Cuerpo

```json
{ "phone": "8777 4321" }
```

| Campo | Tipo | Requerido | Regla |
|-------|------|-----------|-------|
| `name` | Cadena | No | De 1 a 200 caracteres. |
| `phone` | Cadena o `null` | No | Hasta 30 caracteres. `null` borra el teléfono. |
| `note` | Cadena o `null` | No | Hasta 500 caracteres. `null` borra la nota. |

**Al menos una clave.** Un cuerpo vacío `{}` produce `400` con `"value: At least one field must be provided"`: un `PATCH` que no cambia nada es un error del cliente, no un éxito silencioso.

**Solo esas tres claves.** `id`, `created_at` y `updated_at` no se editan: son del servidor.

### Respuesta `200`

El cliente completo, con la misma forma que la respuesta del alta:

```json
{
  "id": "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16",
  "name": "María González",
  "phone": "8777 4321",
  "note": "Vive en el barrio San Judas, paga los viernes",
  "created_at": "2026-09-28T15:12:44.318Z",
  "updated_at": "2026-10-02T09:41:10.776Z"
}
```

`updated_at` cambia en cada edición. **Las ventas del cliente no cambian**: renombrarlo no reescribe `sale.customer_name` en ninguna factura, que es exactamente el comportamiento buscado (D-022).

### Errores

| Situación | Código | `message` |
|-----------|--------|-----------|
| `id` no es un UUID | `BAD_REQUEST` | `"id: Customer id must be a valid UUID"` |
| Cuerpo vacío | `BAD_REQUEST` | `"value: At least one field must be provided"` |
| `name` vacío o de más de 200 caracteres | `BAD_REQUEST` | `"name: <mensaje de Zod sobre la longitud>"` |
| `phone` de más de 30 caracteres | `BAD_REQUEST` | `"phone: <mensaje de Zod sobre la longitud>"` |
| `note` de más de 500 caracteres | `BAD_REQUEST` | `"note: <mensaje de Zod sobre la longitud>"` |
| Otra clave en el cuerpo (`created_at`, `outstanding_balance`, …) | `BAD_REQUEST` | `"value: Unrecognized key(s) in object: '<clave>'"` |
| El cliente no existe | `NOT_FOUND` | `"Customer not found"` |
| El cliente está borrado lógicamente | `NOT_FOUND` | `"Customer not found"` |

---

## `DELETE /api/v1/customers/:id`

Borra lógicamente el cliente: escribe la fecha actual en `deleted_at` y nada más.

### Parámetro de ruta

| Parámetro | Tipo | Regla |
|-----------|------|-------|
| `id` | Cadena | UUID. Un valor que no sea UUID produce `400`, no `404`. |

### Respuesta `200`

```json
{
  "message": "Customer deleted successfully"
}
```

Misma forma que el borrado de gastos: `200` con un mensaje en lugar de `204` sin cuerpo, para que el frontend pueda confirmar sin inventar el texto.

### El cliente con deuda no se borra

Si el cliente tiene **ventas a crédito con saldo pendiente**, el borrado se rechaza con `409 CONFLICT`:

```
El cliente "María González" tiene ventas a crédito con saldo pendiente: cobralas o cancelalas antes de borrarlo.
```

La regla es la misma que la del saldo del listado: cuentan las ventas a crédito no borradas, no canceladas y con `balance > 0`. Cobrar la deuda o cancelar la venta es la salida; borrar el cliente para esconder una cuenta por cobrar no es una operación del negocio.

### Qué se borra y qué no

| Efecto | Detalle |
|--------|---------|
| `customer.deleted_at` | Se escribe la fecha actual. Es el **único** cambio. |
| Las ventas del cliente | **No se tocan.** `sale.customer_id` sigue apuntando a la fila borrada lógicamente y `sale.customer_name` sigue con el nombre que tenía la factura. |
| `GET /api/v1/customers` | El cliente desaparece de la lista de inmediato. |
| `GET /api/v1/sales` y el detalle | Las ventas siguen ahí, con su `customer_id` y su `customer_name`, y se pueden cobrar y cancelar como siempre. |
| Registro de pagos de sus ventas | Funciona: los pagos escriben en la venta y en el libro, no en el cliente. |
| `POST /api/v1/sales/live` con ese `customer_id` | `400` con `"customer_id: Customer not found"`: un cliente borrado no recibe ventas nuevas. |

Borrar un cliente es sacarlo del alta, no reescribir la historia. Es el mismo criterio que el resto del sistema: nada se borra físicamente (D-004).

### Idempotencia

Reintentar el borrado sobre el mismo identificador responde `404`, no `200`. El cliente ya no existe para el sistema.

### Errores

| Situación | Código | `message` |
|-----------|--------|-----------|
| `id` no es un UUID | `BAD_REQUEST` | `"id: Customer id must be a valid UUID"` |
| El cliente no existe | `NOT_FOUND` | `"Customer not found"` |
| El cliente está borrado lógicamente | `NOT_FOUND` | `"Customer not found"` |
| El cliente tiene ventas a crédito con saldo pendiente | `CONFLICT` | `El cliente "<nombre>" tiene ventas a crédito con saldo pendiente: cobralas o cancelalas antes de borrarlo.` |

---

## Qué no existe en clientes

| Ausente | Razón |
|---------|-------|
| `GET /api/v1/customers/:id` | El listado trae todos los campos y el panel busca con `q`. Un cliente suelto se lee de la lista, y el detalle que importa —sus ventas y su saldo— ya se lee en `GET /api/v1/sales?customer_id=…`. |
| `PUT /api/v1/customers/:id` | El `PATCH` parcial alcanza para lo que se edita: nombre, teléfono y nota. Un reemplazo completo obligaría a reenviar los tres campos para cambiar uno. |
| Un campo `outstanding_balance` en la tabla `customer` | El saldo se deriva de las ventas y de los pagos. Guardarlo sería una segunda fuente del mismo número (D-022). |
| `DELETE` físico o restauración | Nada se borra físicamente (D-004) y no hay operación de negocio que devuelva un cliente borrado: se da de alta otra vez. |
