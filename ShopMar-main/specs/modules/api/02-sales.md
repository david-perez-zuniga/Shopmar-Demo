# Ventas — nueve endpoints

Alta de venta en mostrador, alta de venta por WhatsApp con artículos adicionales, listado con filtros de condición de pago y vencimiento, detalle, detalle en lote, cambio de estado, cambio de método de envío, registro de un pago y borrado de un pago.

## Índice

| Método | Ruta | Qué hace |
|--------|------|----------|
| `POST` | `/api/v1/sales/live` | Registra una venta de mostrador. Sin artículos adicionales. |
| `POST` | `/api/v1/sales/whatsapp` | Registra una venta de WhatsApp. Admite artículos adicionales. |
| `GET` | `/api/v1/sales` | Lista todas las ventas con total y conteo de artículos. |
| `GET` | `/api/v1/sales/with-details` | Devuelve el detalle completo de muchas ventas, paginado. |
| `GET` | `/api/v1/sales/:id` | Devuelve el detalle completo de una venta, para la factura. |
| `PATCH` | `/api/v1/sales/:id/status` | Cambia el estado de una venta y, en una venta de contado, registra el cobro del mostrador. |
| `PATCH` | `/api/v1/sales/:id/shipment-method` | Cambia el método de envío de una venta. |
| `POST` | `/api/v1/sales/:id/payments` | Registra un pago (total o parcial) de una venta a crédito. |
| `DELETE` | `/api/v1/sales/:id/payments/:paymentId` | Borra lógicamente un pago mal registrado. |

**No hay `PUT /api/v1/sales/:id` ni `PATCH /api/v1/sales/:id`.** Los importes de una venta registrada no se editan: se cancelan cambiando el estado a `cancelled`. La razón está en el caso de uso 03.

Los dos `PATCH` de arriba son sub-rutas con un cuerpo de un solo campo y no una edición libre de la venta. **Tampoco hay `PATCH` de un pago:** un pago mal cargado se borra lógicamente y se vuelve a registrar.

---

## `POST /api/v1/sales/live`

Registra una venta en mostrador. El canal lo determina la ruta: **el cuerpo no lleva `type`**.

### Cuerpo

```json
{
  "customer_name": "María González",
  "product_name": "Abrigo de lana gris",
  "payment_method": "credit_card",
  "payment_bank": "BAC Credomatic",
  "sale_date": "2026-09-28T00:00:00.000Z",
  "status": "completed",
  "amount_paid": "1250.50",
  "cost": "1250.50"
}
```

| Campo | Tipo | Requerido | Regla |
|-------|------|-----------|-------|
| `customer_name` | Cadena | Condicional | De 1 a 200 caracteres. **Obligatorio si no viene `customer_id`**, en contado y en crédito. El servicio lo recorta y lo resuelve contra la tabla `customer`: reutiliza el cliente vivo con ese nombre o lo crea, y la venta guarda su `customer_id` (S18, S29). |
| `product_name` | Cadena | **Sí** | De 1 a 200 caracteres. Texto libre. |
| `category` | Arreglo de enum | No | **Opcional.** Si viene, tiene que ser una lista de `sale_category` (`pantalones`, `camisas`, `chaquetas`, `sudaderas`) **sin repetidas**. Ausente —o vacía— se guarda como arreglo vacío: el campo se retiró del formulario (S47) y la API dejó de exigir «al menos una» (S48). La venta puede llevar varias y no se muestra en ninguna pantalla (D-021, enmendada). |
| `payment_method` | Enum | Condicional | `"cash"` o `"credit_card"`. **Obligatorio con `immediate`** (o sin `payment_terms`, que es contado). **Prohibido con `credit`**: una venta fiada no se cobra en el momento, así que no hay método que elegir —el de cada abono se registra con el pago—; si viaja, la respuesta es `400`. La columna `sale.payment_method` es `NOT NULL`, así que el alta de un crédito guarda **`cash`** como **valor de registro**, con `payment_bank` nulo; lo que el cliente pague se lee del libro, no de la venta (S57, D-022). |
| `payment_bank` | Cadena | Condicional | Obligatorio con `credit_card` (1 a 100). Prohibido con `cash` (debe venir nulo, ausente o ser `null`). **Prohibido con `credit`**, con `payment_method` o sin él. El formulario ofrece una lista cerrada de bancos de Nicaragua, pero la API acepta cualquier texto: los valores ya guardados se siguen imprimiendo y agregar un banco no pide migración (D-021). |
| `payment_terms` | Enum | No | `"immediate"` (contado) o `"credit"` (crédito). Por defecto `"immediate"` (D-022). |
| `due_date` | Fecha ISO 8601 | Condicional | **Obligatorio con `credit`** y no puede ser anterior a `sale_date`. Prohibido con `immediate`. Es un día de negocio: si viene con hora, el alta la trunca a la medianoche UTC de ese mismo día. |
| `customer_id` | Cadena UUID | Condicional | Prohibido junto con `customer_name`. **Con `credit` se exige uno de los dos**: el id del cliente registrado o el nombre escrito, que el servicio resuelve o crea (S29). Sin `customer_id`, el nombre escrito resuelve o crea el cliente en las dos condiciones. |
| `customer_phone` | Cadena | No | Teléfono del cliente, de 1 a 30 caracteres, recortado. Se guarda en el cliente: si es nuevo, nace con él; si ya existía sin teléfono, se completa; si tenía otro, **se reemplaza** —el número que se escribe a propósito gana—. Viaja con la venta y no en una llamada aparte (S23). |
| `sale_date` | Fecha ISO 8601 | No | **Es un día de negocio, no un instante.** Por defecto, el día del registro. Si viene con hora, el alta la trunca a la medianoche UTC de ese mismo día: todas las ventas del día empatan en la fecha y el listado desempata por hora de registro. |
| `status` | Enum | No | `"pending"` o `"completed"`. Por defecto `"pending"`. `"cancelled"` no se acepta en el alta: una venta no nace cancelada. Con `credit` solo se acepta `"pending"`. |
| `amount_paid` | Cadena decimal | Condicional | **Obligatorio con `status: "completed"`** y prohibido en cualquier otro caso. Con `credit` siempre prohibido: se cobra registrando pagos. |
| `cost` | Cadena decimal | **Sí** | `MONEY_PATTERN`: de 1 a 8 enteros y hasta 2 decimales, sin signo. Ejemplo: `"1250.50"`. |

**Ninguna clave distinta de estas es aceptada.** El esquema es estricto: una clave desconocida produce `400` con la lista completa.

**`additional_items` está prohibido.** Es una de las siete claves que este endpoint rechaza, y la respuesta dice exactamente cuál.

### Respuesta `201`

```json
{
  "id": "3f1c9a52-7b48-4d1e-9a06-5c2b8e4f1d70",
  "type": "live",
  "customer_name": "María González",
  "product_name": "Abrigo de lana gris",
  "payment_method": "credit_card",
  "payment_bank": "BAC Credomatic",
  "sale_date": "2026-09-28T00:00:00.000Z",
  "status": "completed",
  "cost": "1250.50",
  "customer_id": "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16",
  "payment_terms": "immediate",
  "due_date": null,
  "amount_paid": "1250.50",
  "change_given": null,
  "additional_items": [],
  "additional_count": 0,
  "total": "1250.50",
  "paid_total": "1250.50",
  "balance": null,
  "is_overdue": false,
  "payments": [
    {
      "id": "a1d4c0f2-3b87-4c59-9e14-6f2b8d0c7a31",
      "sale_id": "3f1c9a52-7b48-4d1e-9a06-5c2b8e4f1d70",
      "amount": "1250.50",
      "paid_at": "2026-09-28T00:00:00.000Z",
      "payment_method": "credit_card",
      "payment_bank": "BAC Credomatic",
      "note": null,
      "created_at": "2026-09-28T15:30:02.184Z",
      "updated_at": "2026-09-28T15:30:02.184Z"
    }
  ],
  "payments_count": 1,
  "created_at": "2026-09-28T15:30:02.184Z",
  "updated_at": "2026-09-28T15:30:02.184Z"
}
```

| Campo | Nota |
|-------|------|
| `type` | Siempre `"live"`. Lo fija el servidor. |
| `additional_items` | Siempre `[]` en este endpoint. |
| `additional_count` | Siempre `0`. |
| `total` | Siempre igual a `cost`, como cadena. Es derivado, no almacenado. |
| `payment_terms` · `due_date` · `customer_id` | Condición de pago y, si es a crédito, vencimiento y cliente (D-022). `customer_id` **nunca es `null` en un alta nueva**: el nombre escrito resuelve o crea el cliente (S18). |
| `paid_total` | Suma de los pagos vivos. El alta con `status: "completed"` escribe **un** pago por el total en la misma transacción, salvo que el total sea cero: un pago de cero no existe. |
| `balance` | `null` en una venta de contado; en una venta a crédito, `total − paid_total`. |
| `is_overdue` | `true` sólo si la venta es a crédito, no está cancelada, tiene `balance > 0` y `due_date` ya pasó. Se calcula, no se guarda. |
| `payments` | Los pagos vivos, ordenados por `paid_at` y `id` ascendentes. |
| `payments_count` | Conteo de esos pagos. |
| `created_at` · `updated_at` | Marcas de auditoría en ISO 8601 UTC. |

### El cliente de la venta: se resuelve o se crea

Toda venta guarda su cliente en la tabla `customer` (S18). El nombre escrito a mano no queda como
texto suelto: el servicio lo **recorta** y lo resuelve contra el padrón. La regla es la misma en
**contado y en crédito**: con `credit` el id dejó de ser obligatorio y basta el nombre, que se resuelve
como en cualquier otra venta (S29).

| Situación | Resultado |
|-----------|-----------|
| Viene `customer_id` | Se usa ese cliente y `customer_name` se copia de su fila (D-022). |
| Viene `customer_name` y hay un cliente vivo con ese nombre | Se reutiliza: la venta guarda **su** `customer_id` y **su** nombre guardado. La comparación es exacta sobre el nombre recortado y **sin distinguir mayúsculas** (`lower(name) = lower(nombre recortado)`). |
| Viene `customer_name` y no hay ningún cliente vivo con ese nombre | Se crea un cliente con el nombre recortado, sin teléfono ni nota, y la venta queda enlazada a él. |
| Viene `customer_name` y el único cliente con ese nombre está borrado lógicamente | No se reutiliza: se crea uno nuevo. Un cliente borrado no vuelve a recibir ventas. |

Consecuencias que el contrato asume:

- **La instantánea sigue siendo la instantánea.** `customer_name` en la respuesta y en la factura es el nombre
  **como está guardado** en el cliente, así que conserva la capitalización del primer registro: dos ventas con
  `"maría gonzález"` y `"María González"` imprimen lo que diga la fila reutilizada.
- **La respuesta mantiene su forma.** `customer_id` deja de viajar `null` en las altas nuevas; no aparece
  ninguna clave nueva. Las ventas registradas antes de S18 siguen con `customer_id: null` y se leen igual.
- **Dos altas simultáneas con un nombre nuevo pueden crear dos clientes.** Es un duplicado inofensivo y
  visible —la tabla no tiene `UNIQUE` sobre el nombre, y no lo va a tener—, no un dato perdido: las dos
  ventas quedan enlazadas a un cliente real.
- **El alta vive en el backend**, no en cada consumidor de la API, para que la regla valga igual en `/live`, en
  `/whatsapp` y en cualquier cliente futuro.

### Errores

| Situación | `message` |
|-----------|-----------|
| Viene `additional_items` | `"value: Unrecognized key(s) in object: 'additional_items'"` |
| `credit_card` sin `payment_bank` | `"payment_bank: Payment bank is required for credit card payments"` |
| `cash` con `payment_bank` | `"payment_bank: Payment bank is only allowed for credit card payments"` |
| `immediate` sin `payment_method` | `"payment_method: Required"` |
| `credit` con `payment_method` | `"payment_method: A credit sale does not take payment_method; register the method with each payment"` |
| `credit` con `payment_bank` | `"payment_bank: A credit sale does not take payment_bank; register the bank with each payment"` |
| `cost` con formato inválido | `"cost: <mensaje de Zod sobre el patrón>"` |
| `category` con una categoría fuera del catálogo | `"category: <mensaje de Zod sobre el enum>"` |
| `category` con una categoría repetida | `"category: No se puede repetir una categoría"` |
| `customer_name` vacío o largo | `"customer_name: <mensaje de Zod sobre la longitud>"` |
| `customer_name` con sólo espacios | `"customer_name: Customer name is required"` |
| `sale_date` no parsea | `"sale_date: <mensaje de Zod>"` |
| `status` fuera del enum | `"status: <mensaje de Zod>"` |
| `status: "cancelled"` en el alta | `"status: A sale is created pending or completed"` |
| `amount_paid` sin `status: "completed"` | `"amount_paid: A pending sale does not take amount_paid"` |
| `status: "completed"` sin `amount_paid` | `"amount_paid: amount_paid is required to complete a sale"` |
| `credit` sin `due_date` | `"due_date: A credit sale needs a due date"` |
| `due_date` anterior a `sale_date` | `"due_date: The due date cannot be before the sale date"` |
| `immediate` con `due_date` | `"due_date: Only a credit sale has a due date"` |
| `credit` sin `customer_id` ni `customer_name` | `"customer_id: Send customer_id or customer_name"` |
| `credit` con `status` distinto de `pending` | `"status: A credit sale is created pending"` |
| `credit` con `amount_paid` | `"amount_paid: A credit sale does not take amount_paid; register payments instead"` |
| `customer_id` junto con `customer_name` | `"customer_name: Send customer_name or customer_id, not both"` |
| `customer_id` que no existe o está borrado | `"customer_id: Customer not found"` |
| `customer_phone` con sólo espacios | `"customer_phone: Phone is required"` |
| `customer_phone` de más de 30 caracteres | `"customer_phone: Phone must be at most 30 characters"` |
| `credit` con total derivado cero (`cost` `"0.00"` y sin artículos) | `"cost: A credit sale needs a total greater than zero"` |
| Cualquier otra clave desconocida | `"value: Unrecognized key(s) in object: '<clave>'"` |

No hay `409`: `sale` no tiene ninguna restricción de unicidad.

### Un total de cero no escribe pago del libro

`cost: "0.00"` es un importe válido, así que una venta de total cero existe. Con `status: "completed"` la venta se marca cobrada y `amount_paid` y `change_given` se resuelven con la misma regla del mostrador —con efectivo los dos quedan en `"0.00"`—, pero **no se escribe ningún renglón en `sale_payment`**: la tabla exige `amount > 0`, y un pago de cero no es un pago. `paid_total` queda en `"0.00"`.

En una venta a **crédito** el total cero se rechaza antes de escribir nada: cualquier pago es mayor que cero y el saldo ya es cero, así que esa venta no se podría cobrar nunca. El mensaje es `"cost: A credit sale needs a total greater than zero"`.

---

## `POST /api/v1/sales/whatsapp`

Registra una venta coordinada por WhatsApp. Admite artículos adicionales, y todos se crean en la misma transacción que la venta.

### Cuerpo

```json
{
  "customer_name": "Laura Ramírez",
  "product_name": "Vestido de algodón",
  "payment_method": "cash",
  "payment_bank": null,
  "sale_date": "2026-09-28T00:00:00.000Z",
  "status": "pending",
  "cost": "1250.50",
  "additional_items": [
    { "name": "Pantalón de mezclilla", "description": "Talla 30, azul", "quantity": 1, "total": "850.00" },
    { "name": "Cinturón de cuero", "description": null, "quantity": 1, "total": "100.00" }
  ]
}
```

Los campos comunes son idénticos a los de `POST /api/v1/sales/live`, con una diferencia: `payment_bank` puede venir explícitamente como `null`, que es el equivalente de omitirlo. La regla de `payment_method` es la misma en los dos canales: obligatorio en contado, prohibido en crédito (S57).

### `additional_items`

Arreglo opcional. Si viene, debe tener **entre 1 y 50** elementos.

| Campo | Tipo | Requerido | Regla |
|-------|------|-----------|-------|
| `additional_items` | Arreglo | No | Entre 1 y 50 elementos. Si se omite, la venta se crea sin artículos. |
| `additional_items[].name` | Cadena | **Sí** | De 1 a 200 caracteres. |
| `additional_items[].description` | Cadena o `null` | No | Hasta 500 caracteres. |
| `additional_items[].quantity` | Entero | No | Mínimo 1. Por defecto 1. |
| `additional_items[].total` | Cadena decimal | **Sí** | `MONEY_PATTERN`. **Importe del renglón completo**, no el precio unitario. |

Un arreglo vacío `[]` produce `400`: si se decide incluir artículos adicionales, hay al menos uno.

Cada renglón se valida con su propia ruta en el mensaje de error, así que un error en el segundo artículo se reporta como `additional_items.1.total: ...`.

### Respuesta `201`

```json
{
  "id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
  "type": "whatsapp",
  "customer_name": "Laura Ramírez",
  "product_name": "Vestido de algodón",
  "payment_method": "cash",
  "payment_bank": null,
  "sale_date": "2026-09-28T00:00:00.000Z",
  "status": "pending",
  "cost": "1250.50",
  "additional_items": [
    {
      "id": "0c5f1e88-1a47-4b92-8d3e-77b0c5a1e640",
      "name": "Pantalón de mezclilla",
      "description": "Talla 30, azul",
      "quantity": 1,
      "total": "850.00"
    },
    {
      "id": "9a2e7b31-64d0-4f18-95c7-3e8b1d604a2f",
      "name": "Cinturón de cuero",
      "description": null,
      "quantity": 1,
      "total": "100.00"
    }
  ],
  "additional_count": 2,
  "total": "2200.50",
  "created_at": "2026-09-28T17:05:01.442Z",
  "updated_at": "2026-09-28T17:05:01.442Z"
}
```

`total` es `1250.50 + 850.00 + 100.00 = "2200.50"`, calculado con aritmética de `Decimal` en el servidor. El cliente no lo calcula ni lo envía.

**Atomicidad.** La venta y sus artículos se crean en una sola transacción. Si algún renglón falla, no queda ninguna venta registrada. Un cliente que reintenta obtiene un error de validación, nunca una venta huérfana.

### Errores

Además de los errores comunes del alta de mostrador:

| Situación | `message` |
|-----------|-----------|
| `additional_items: []` | `"additional_items: Array must contain at least 1 element(s)"` |
| Más de 50 renglones | `"additional_items: Array must contain at most 50 element(s)"` |
| `quantity: 0` | `"additional_items.0.quantity: Number must be greater than or equal to 1"` |
| `quantity: 1.5` | `"additional_items.0.quantity: Expected integer, received float"` |
| `total` de un renglón inválido | `"additional_items.0.total: <mensaje de Zod>"` |
| Clave desconocida en un renglón | `"value: Unrecognized key(s) in object: '<clave>'"` con la ruta del renglón |

---

## `GET /api/v1/sales`

Lista las ventas. Devuelve el conjunto completo salvo que se pida una página con `page` y `per_page`, en cuyo caso devuelve sólo esa página y el `total` del conjunto filtrado (decisión D-011).

### Parámetros de query

Todos opcionales. `page` y `per_page` viajan juntos y son la única pareja interdependiente.

| Parámetro | Tipo | Efecto |
|-----------|------|--------|
| `start_date` | Fecha ISO 8601 | Límite inferior inclusivo sobre `sale_date`, a las `00:00:00.000` UTC |
| `end_date` | Fecha ISO 8601 | Límite superior inclusivo sobre `sale_date`, hasta las `23:59:59.999` UTC |
| `type` | Enum | `"live"` o `"whatsapp"` |
| `status` | Enum | `"pending"`, `"completed"` o `"cancelled"` |
| `shipment_method` | Enum | `"cargotrans"`, `"delivery"`, `"pickup"` o `"unassigned"` |
| `payment_terms` | Enum | `"immediate"` (contado) o `"credit"` (crédito) |
| `customer_id` | Cadena UUID | Ventas del cliente registrado indicado |
| `overdue` | `"true"` o `"false"` | Sólo las ventas vencidas (`"true"`) o sólo las no vencidas (`"false"`). Ver abajo |
| `page` | Entero ≥ 1 | Página pedida. Requiere `per_page` |
| `per_page` | Entero entre 1 y 100 | Filas por página. Requiere `page` |
| `include_kpis` | `"true"` o `"false"` | Agrega `kpis` a la respuesta: el conteo del rango de fechas por `shipment_method`, sin canceladas (decisión D-012) |

El orden es siempre `sale_date` descendente, después `created_at` descendente y por último `id` descendente como desempate único. Dos ventas del mismo día aparecen de la más reciente a la más antigua —una venta nueva encabeza la tabla— y el resultado es determinista entre llamadas. El orden lo cubre `sale_list_idx (sale_date DESC, created_at DESC, id DESC) INCLUDE (cost)`.

Las ventas borradas lógicamente **no aparecen nunca**, con o sin filtros.

### Qué significa `overdue`

Vencida es una venta a crédito, no cancelada, con `balance > 0` y `due_date` anterior a hoy. Una venta cancelada no es deuda y nunca sale como vencida. `overdue=true` devuelve exactamente esas ventas; `overdue=false` devuelve las demás, incluidas todas las de contado y las de crédito ya cobradas.

| Combinación | Resultado |
|-------------|-----------|
| `overdue=true` solo | Las ventas a crédito vencidas |
| `overdue=false` solo | Todo lo que no está vencido, contado incluido |
| `overdue=true` con `payment_terms=immediate` | `200` con `{"sales": [], "total": 0}`: una venta de contado no puede estar vencida, y una lista vacía lo dice sin inventar un error |
| `overdue=true` con `status=cancelled` | Lista vacía, por la misma razón: una venta cancelada no es una deuda |

Ninguna combinación de filtros es un error. Los filtros se acumulan con `AND`, y el conjunto que no tiene sentido de negocio devuelve vacío.

### Respuesta `200`

```json
{
  "sales": [
    {
      "id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
      "sale_date": "2026-09-28T00:00:00.000Z",
      "customer_name": "Laura Ramírez",
      "product_name": "Vestido de algodón",
      "type": "whatsapp",
      "status": "pending",
      "cost": "1250.50",
      "payment_method": "cash",
      "shipment_method": "cargotrans",
      "additional_count": 2,
      "total": "2200.50",
      "customer_id": "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16",
      "payment_terms": "credit",
      "due_date": "2026-10-28T00:00:00.000Z",
      "paid_total": "0.00",
      "balance": "2200.50",
      "is_overdue": false
    },
    {
      "id": "3f1c9a52-7b48-4d1e-9a06-5c2b8e4f1d70",
      "sale_date": "2026-09-28T00:00:00.000Z",
      "customer_name": "María González",
      "product_name": "Abrigo de lana gris",
      "type": "live",
      "status": "completed",
      "cost": "1250.50",
      "payment_method": "credit_card",
      "shipment_method": "pickup",
      "additional_count": 0,
      "total": "1250.50",
      "customer_id": null,
      "payment_terms": "immediate",
      "due_date": null,
      "paid_total": "1250.50",
      "balance": null,
      "is_overdue": false
    }
  ],
  "total": 512
}
```

`total` es la cantidad de ventas que matchean los filtros, sin paginar. Viene siempre, con o sin `page`/`per_page`.

Cuando `include_kpis=true`, la respuesta suma `kpis`: el conteo del **rango de fechas** por método de envío. Sigue la regla de las agregaciones (D-008): excluye las ventas canceladas y las borradas, e **ignora los filtros de estado, canal y método de envío** —los mismos que sí aplican a la lista—, igual que `GET /api/v1/dashboard/packages/kpis`. Los dos endpoints devuelven el mismo número para el mismo rango.

```json
{
  "sales": [],
  "total": 5000,
  "kpis": {
    "total": 5000,
    "cargotrans": 626,
    "delivery": 778,
    "pickup": 863,
    "unassigned": 2733
  }
}
```

### Qué devuelve y qué no

| Campo | ¿Viene? | Razón |
|-------|---------|-------|
| `id` · `sale_date` · `customer_name` · `product_name` · `type` · `status` · `cost` | Sí | Son las columnas de la tabla del panel |
| `payment_method` | Sí | La pantalla de ventas lo usa para validar el importe cobrado de una venta con tarjeta |
| `shipment_method` | Sí | Es la columna que la pantalla de paquetes edita por fila |
| `additional_count` | Sí | Se calcula de la selección anidada de artículos |
| `total` | Sí | Se calcula como `cost` más la suma de artículos |
| `payment_terms` | Sí | La condición de pago decide si la fila es una cuenta por cobrar (D-022) |
| `customer_id` | Sí | El cliente registrado de la venta, o `null` en una venta de contado sin cliente |
| `due_date` | Sí | La fecha de pago prometida, o `null` en una venta de contado |
| `paid_total` | Sí | Suma de los pagos vivos del libro. Es la única fuente del saldo |
| `balance` | Sí | `null` en una venta de contado —un pendiente de contado no es una deuda— y `total − paid_total` en una venta a crédito |
| `is_overdue` | Sí | Venta a crédito, no cancelada, con `balance > 0` y `due_date` en el pasado. Se calcula contra la fecha de hoy, no se guarda |
| `category` | **No** | Ninguna tabla del panel la muestra. La venta guarda una lista de categorías —vacía si el alta no las manda— y el endpoint de detalle la devuelve, pero ninguna pantalla la imprime (S3 de D-021, enmendada por S47) |
| `payment_bank` | **No** | El listado es compacto. El banco solo aparece en el detalle, que es lo que consume la factura. En el formulario se elige de una lista cerrada de bancos de Nicaragua (D-021). |
| `additional_items` | **No** | Solo el conteo. Traer los artículos de cada fila serían veinte cargas anidadas que el panel no usa |
| `amount_paid` · `change_given` | **No** | El listado es compacto: el monto entregado y el vuelto solo aparecen en el detalle, que es lo que consume la factura |
| Paquetes | **No** | No hay tabla `package` ni recurso de paquetes en la API: la columna no existe |
| `created_at` · `updated_at` | **No** | La tabla no muestra marcas de auditoría |
| `deleted_at` | **No** | Nunca se expone. Un registro borrado no aparece |

La selección de la consulta refleja exactamente esta tabla: no se traen de la base las columnas que no viajan.

La forma del listado es deliberadamente distinta de la del detalle. Mezclarlas obligaría al listado a traer todo, y el total se puede calcular sin traer los artículos completos: basta con sus importes.

### Errores

| Situación | `message` |
|-----------|-----------|
| `start_date` no parsea | `"start_date: <mensaje de Zod>"` |
| `end_date` no parsea | `"end_date: <mensaje de Zod>"` |
| `type` fuera del enum | `"type: <mensaje de Zod>"` |
| `status` fuera del enum | `"status: <mensaje de Zod>"` |
| `payment_terms` fuera del enum | `"payment_terms: <mensaje de Zod>"` |
| `customer_id` que no es UUID | `"customer_id: <mensaje de Zod sobre el UUID>"` |
| `overdue` con un valor distinto de `true`/`false` | `"overdue: <mensaje de Zod>"` |
| `page` sin `per_page`, o al revés | `"per_page: page and per_page must be sent together"` |
| `page` menor a 1 o no entero | `"page: <mensaje de Zod>"` |
| `per_page` fuera de `1..100` | `"per_page: <mensaje de Zod>"` |
| `include_kpis` con un valor distinto de `true`/`false` | `"include_kpis: <mensaje de Zod>"` |
| Parámetro desconocido (`limit`, `q`) | `"value: Unrecognized key(s) in object: '<clave>'"` |

Un parámetro desconocido produce `400` en vez de ignorarse: un cliente que cree que está paginando o filtrando y no lo está está tomando una decisión sobre la respuesta que en realidad no tomó, y es mejor que se entere. Por la misma razón, `page` sin `per_page` (o al revés) se rechaza en vez de devolver la lista completa en silencio.

Un rango sin resultados devuelve `200` con `{"sales": [], "total": 0}`, incluso si la página pedida excede el total.

---

## `GET /api/v1/sales/:id`

Devuelve el detalle completo de una venta, con sus artículos adicionales y su libro de pagos. Es el endpoint que consume la factura.

### Parámetro de ruta

| Parámetro | Tipo | Regla |
|-----------|------|-------|
| `id` | Cadena | UUID. Un valor que no sea UUID produce `400`, no `404`. |

### Respuesta `200`

La misma forma que devuelve el alta. Con los artículos y el libro de pagos poblados:

```json
{
  "id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
  "type": "whatsapp",
  "customer_name": "Laura Ramírez",
  "customer_id": "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16",
  "product_name": "Vestido de algodón",
  "category": ["camisas"],
  "payment_method": "cash",
  "payment_bank": null,
  "payment_terms": "credit",
  "due_date": "2026-10-28T00:00:00.000Z",
  "sale_date": "2026-09-28T00:00:00.000Z",
  "status": "pending",
  "cost": "1250.50",
  "shipment_method": "cargotrans",
  "amount_paid": "500.00",
  "change_given": null,
  "additional_items": [
    {
      "id": "0c5f1e88-1a47-4b92-8d3e-77b0c5a1e640",
      "sale_id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
      "name": "Pantalón de mezclilla",
      "description": "Talla 30, azul",
      "quantity": 1,
      "total": "850.00",
      "kind": "additional",
      "created_at": "2026-09-28T17:05:01.442Z",
      "updated_at": "2026-09-28T17:05:01.442Z"
    }
  ],
  "additional_count": 1,
  "total": "2100.50",
  "paid_total": "500.00",
  "balance": "1600.50",
  "is_overdue": false,
  "payments": [
    {
      "id": "a1d4c0f2-3b87-4c59-9e14-6f2b8d0c7a31",
      "sale_id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
      "amount": "500.00",
      "paid_at": "2026-10-05T14:20:00.000Z",
      "payment_method": "cash",
      "payment_bank": null,
      "note": "Abono de la quincena",
      "created_at": "2026-10-05T14:20:03.118Z",
      "updated_at": "2026-10-05T14:20:03.118Z"
    }
  ],
  "payments_count": 1,
  "created_at": "2026-09-28T17:05:01.442Z",
  "updated_at": "2026-10-05T14:20:03.118Z"
}
```

| Campo | Nota |
|-------|------|
| `additional_items` | Artículos **no borrados lógicamente** de la venta, cada uno con `sale_id`, `kind`, `created_at` y `updated_at` además de sus datos |
| `additional_count` | Conteo de los mismos artículos, no borrados |
| `total` | `cost` más la suma de los artículos no borrados |
| `customer_id` | Cliente registrado. En las ventas registradas antes de S18 —y en una venta de contado que nunca tuvo cliente— puede ser `null`. El nombre de la factura sigue siendo `customer_name`, la instantánea (D-022) |
| `payment_terms` · `due_date` | Condición de pago y, en una venta a crédito, la fecha prometida. `due_date` es `null` en una venta de contado |
| `amount_paid` | Lo que el cliente **entregó** en el mostrador, que puede incluir el vuelto. En una venta de contado se escribe al marcarla `completed`; en una venta a crédito viaja `null` mientras no haya pagos y después refleja la suma del libro. **No** es la fuente del saldo |
| `change_given` | El vuelto entregado, derivado de `amount_paid − total`. Sólo tiene valor en un cobro de mostrador en efectivo |
| `paid_total` | Suma de los pagos vivos del libro. Es **la única fuente del saldo** (D-022) |
| `balance` | `null` en una venta de contado; en una venta a crédito, `total − paid_total` |
| `is_overdue` | `true` sólo si `balance > 0` y `due_date` ya pasó. Se calcula, no se guarda |
| `payments` | Los pagos vivos de la venta, ordenados por `paid_at` ascendente con `id` ascendente como desempate |
| `payments_count` | Conteo de esos pagos |
| `updated_at` | Distinto de `created_at` si la venta cambió de estado, de método de envío o de libro de pagos |

El filtro `deleted_at: null` se aplica **también** a las relaciones. Un artículo borrado lógicamente no aparece en `additional_items` ni suma en `total`, y un pago borrado lógicamente no aparece en `payments` ni suma en `paid_total`. Un cliente que sume `cost` más lo que ve en `additional_items` obtiene exactamente el `total` que devuelve la API; uno que sume los `amount` de `payments` obtiene exactamente `paid_total`.

**Los paquetes no viajan.** El detalle no devuelve ningún campo de paquetes: no hay tabla `package` en el esquema ni rutas de `/api/v1/packages` en el código (ver `api/README.md`).

**Orden de `additional_items`.** Los renglones vienen en orden de inserción —`created_at` ascendente— con `id` como desempate único y determinista. No es un detalle accesorio: la factura se imprime en el orden del arreglo, y el build estático genera una página por venta, así que un orden no determinista produciría HTML distinto para la misma venta entre corridas. Lo garantiza el `ORDER BY additional_sale.created_at, additional_sale.id` que `findById` aplica en `backend/src/modules/sales/infrastructure/sale.drizzle.repository.ts`. Dentro de un mismo lote de alta todos los renglones comparten `created_at` (la transacción usa el mismo `CURRENT_TIMESTAMP`), así que entre ellos desempata `id`.

**Orden de `payments`.** El libro viaja ordenado por `paid_at` ascendente y, entre pagos del mismo instante, por `id` ascendente. El orden es determinista por la misma razón que el de los artículos: el panel imprime el historial y dos corridas sobre la misma venta tienen que dar el mismo documento.

### Errores

| Situación | Código | `message` |
|-----------|--------|-----------|
| `id` no es un UUID | `BAD_REQUEST` | `"id: Sale id must be a valid UUID"` |
| La venta no existe | `NOT_FOUND` | `"Sale not found"` |
| La venta está borrada lógicamente | `NOT_FOUND` | `"Sale not found"` |

Un registro borrado lógicamente y uno inexistente son indistinguibles desde fuera, y esa indistinguibilidad es intencional: un cliente no debe poder distinguir "nunca existió" de "ya no está".

---

## `GET /api/v1/sales/with-details`

Devuelve el detalle completo de **muchas ventas a la vez**, con la misma forma que `GET /api/v1/sales/:id`: cada elemento de `sales` es byte a byte la respuesta del detalle, con `additional_items`, `additional_count`, `total`, `payments` y `payments_count`. Esa igualdad exacta **no es incidental**: ambos endpoints comparten el mapper del detalle y ordenan `additional_items` con el mismo criterio (`created_at` ascendente, `id` de desempate), aplicado en `findById` y en `findAllWithDetails` del repositorio. Sin ese `ORDER BY` en el lote, la misma venta podría salir con los renglones en otro orden según el planificador de Postgres. Se creó para que el build de las páginas `/sales/[id]` bajara el detalle en lotes en vez de pedir una venta por HTTP por cada página generada. **Ese consumidor ya no existe**: desde D-017 el detalle es una sola página estática que pide su venta desde el navegador, así que hoy el endpoint no tiene ningún consumidor en el frontend. El motivo original pasa a ser histórico y el contrato se mantiene tal como está: sigue siendo una ruta de la API con su especificación y sus pruebas, y retirarlo sería una decisión de backend, no de esta área.

El nombre `with-details` no puede confundirse con un `:id`: find-my-way resuelve las rutas estáticas antes que las paramétricas, así que nunca cae en `/:id`; y aun si cayera, `SaleIdParamSchema` lo rechazaría porque no es un UUID. Los ids de venta son UUID y jamás valdrían `"with-details"`.

### Parámetros de query

Ambos opcionales y con valor por defecto. A diferencia de `GET /api/v1/sales`, no viajan juntos: el cliente que pagina en lote no tiene por qué declarar el tamaño en cada llamada.

| Parámetro | Tipo | Efecto |
|-----------|------|--------|
| `page` | Entero ≥ 1 | Página pedida. Por defecto `1` |
| `per_page` | Entero entre 1 y 200 | Ventas por página. Por defecto `100` |

El tope de `per_page` es **200**, más alto que el `100` del listado porque este endpoint existe para bajar volumen en pocas llamadas, pero sigue siendo un tope: un cliente no puede pedir la tabla entera en un solo pedido.

El orden es el mismo del listado: `sale_date` descendente, después `created_at` descendente y por último `id` descendente para desempatar. Es determinista entre llamadas, así que recorrer `page = 1, 2, 3…` no repite ni salta ventas. También como el listado, las ventas borradas lógicamente no aparecen.

Como todo `GET` de la API, respeta la revalidación condicional: sale con un `ETag` débil y `Cache-Control: private, no-cache`, y responde `304` si el cuerpo no cambió (ver *Convenciones*).

### Respuesta `200`

```json
{
  "sales": [
    {
      "id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
      "type": "whatsapp",
      "customer_name": "Laura Ramírez",
      "customer_id": null,
      "product_name": "Vestido de algodón",
      "category": ["camisas", "pantalones"],
      "payment_method": "credit_card",
      "payment_bank": "BAC Credomatic",
      "payment_terms": "immediate",
      "due_date": null,
      "sale_date": "2026-09-28T00:00:00.000Z",
      "status": "completed",
      "cost": "1250.50",
      "shipment_method": "cargotrans",
      "amount_paid": "2200.50",
      "change_given": null,
      "additional_items": [],
      "additional_count": 0,
      "total": "2200.50",
      "paid_total": "2200.50",
      "balance": null,
      "is_overdue": false,
      "payments": [
        {
          "id": "a1d4c0f2-3b87-4c59-9e14-6f2b8d0c7a31",
          "sale_id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
          "amount": "2200.50",
          "paid_at": "2026-09-28T00:00:00.000Z",
          "payment_method": "credit_card",
          "payment_bank": "BAC Credomatic",
          "note": null,
          "created_at": "2026-09-28T17:05:01.442Z",
          "updated_at": "2026-09-28T17:05:01.442Z"
        }
      ],
      "payments_count": 1,
      "created_at": "2026-09-28T17:05:01.442Z",
      "updated_at": "2026-09-29T09:12:33.008Z"
    }
  ],
  "total": 5000,
  "page": 1,
  "per_page": 100,
  "has_more": true
}
```

| Campo | Nota |
|-------|------|
| `sales` | Mismo mapper que el detalle: cada venta es **idéntica** a la de `GET /api/v1/sales/:id`, sin un segundo mapeo |
| `sales[].payments` | Mismo orden que en el detalle: `paid_at` ascendente y `id` de desempate |
| `total` | Cantidad de ventas que existen, sin paginar. Con `total` y `per_page` el cliente sabe cuántas páginas faltan |
| `page` · `per_page` | Los valores efectivos usados, ya resueltos con sus valores por defecto |
| `has_more` | `true` mientras `page * per_page < total`. `false` en la última página |

El cliente pagina hasta que `has_more` es `false` y luego comprueba que la cantidad acumulada sea igual a `total`; si no coincide, no completó el lote.

### Errores

| Situación | `message` |
|-----------|-----------|
| `page` menor a 1 o no entero | `"page: <mensaje de Zod>"` |
| `per_page` menor a 1, no entero, o mayor a 200 | `"per_page: <mensaje de Zod>"` |
| Parámetro desconocido (`limit`, `q`) | `"value: Unrecognized key(s) in object: '<clave>'"` |

---

## `PATCH /api/v1/sales/:id/status`

Cambia el estado de una venta. Es el único endpoint que modifica el **estado**, y el que registra el cobro del mostrador de una venta de contado; el método de envío y el libro de pagos tienen sus propias sub-rutas.

### Parámetro de ruta

| Parámetro | Tipo | Regla |
|-----------|------|-------|
| `id` | Cadena | UUID. Un valor que no sea UUID produce `400`. |

### Cuerpo

```json
{ "status": "completed", "amount_paid": "1250.50" }
```

| Campo | Tipo | Requerido | Regla |
|-------|------|-----------|-------|
| `status` | Enum | **Sí** | `"pending"`, `"completed"` o `"cancelled"` |
| `amount_paid` | Cadena decimal | Condicional | **Obligatorio con `status: "completed"` en una venta de contado** y prohibido en cualquier otro caso. `MONEY_PATTERN` |

**Solo esos dos campos.** Cualquier otra clave produce `400`.

### Respuesta `200`

El detalle completo de la venta, idéntico a `GET /api/v1/sales/:id`, con el `status` nuevo. El `total` se recalcula y viaja en la respuesta para que el frontend actualice la fila sin una segunda petición.

### Transiciones

**Todas las transiciones son válidas, con una sola excepción**: desde `cancelled` no hay ninguna.

| De | A | Permitida |
|----|---|-----------|
| `pending` | `completed` | Sí |
| `pending` | `cancelled` | Sí |
| `completed` | `cancelled` | Sí |
| `completed` | `pending` | Sí |
| `completed` | `completed` | Sí, sin efecto más allá de `updated_at` |
| `cancelled` | `completed` | **No**, `409 CONFLICT` |
| `cancelled` | `pending` | **No**, `409 CONFLICT` |
| `cancelled` | `cancelled` | **No**, `409 CONFLICT` |

No hay máquina de estados. Con un solo usuario y sin concurrencia entre operadores, un control de transiciones impediría corregir un estado mal tipeado sin acceso a la base de datos, y ese coste supera el beneficio del modelo más elegante.

La excepción es `cancelled`, y no es una excepción de gusto: es el único estado que afirma algo que no se puede deshacer. Una venta que no ocurrió no puede volver a ser una venta que ocurrió. El rechazo ocurre **antes** de resolver el cobro, así que un `409` no deja efectos secundarios: el `amount_paid` de la venta cancelada sigue en `null`.

`completed` → `cancelled` sí se permite a propósito: sin ese camino, corregir una venta recién cobrada solo era posible interviniendo la base de datos.

### El cobro del mostrador de una venta de contado

En una venta `immediate`, el paso a `completed` **es** el cobro, y por eso exige `amount_paid`. La regla depende de la forma de pago, igual que en el alta:

| Forma de pago | `amount_paid` | Vuelto |
|---------------|---------------|--------|
| `cash` | Mayor o igual al total | Sí: `change_given = amount_paid − total`, derivado por el servidor |
| `credit_card` | **Igual** al total | No: con tarjeta no se entrega vuelto |

El endpoint no se limita a escribir el estado: en la **misma transacción** escribe **un solo** pago de mostrador en `sale_payment`, por el importe **aplicado** (el total para la tarjeta; el total para el efectivo, con el vuelto en `change_given`). Volver a marcar `completed` una venta ya completada **actualiza** ese pago en lugar de duplicarlo —corrige `amount`, `payment_method` y `payment_bank`, y **no** mueve `paid_at`—, y mover la venta a `pending` o a `cancelled` lo **borra lógicamente**. Es lo que mantiene el invariante de D-022: `paid_total` es la suma del libro, y la caja se calcula desde el libro.

**La fecha del pago no se reescribe.** `paid_at` es la fecha con la que el cobro entra en `collected_revenue`, y volver a marcar `completed` no puede correr esa plata de un mes a otro: `completed → completed` no tiene más efecto que `updated_at`. La fecha del cobro del mostrador sólo se escribe cuando el pago se inserta.

**Con un total derivado cero no se escribe ningún pago.** El estado pasa a `completed` y `amount_paid` y `change_given` se resuelven igual que siempre —con efectivo los dos quedan en `"0.00"`—, pero el renglón del libro no existe, porque `sale_payment.amount` exige un importe positivo. Si la venta tenía un pago de mostrador vivo, se borra lógicamente: un total cero no tiene nada que cobrar. `paid_total` queda en `"0.00"`.

El método corre dentro de una transacción que bloquea la fila de la venta con `SELECT ... FOR UPDATE` antes de leerla y sincronizar el pago, igual que registrar y borrar un pago. Dos `PATCH .../status` simultáneos se resuelven en serie y no pueden dejar dos pagos de mostrador para la misma venta.

### La venta a crédito no se cobra por acá

Sobre una venta `credit`, este endpoint **sólo acepta `cancelled`**. `completed` y `pending` se rechazan con `409` por la misma razón por la que existe el libro: el estado de cobro lo deciden los pagos, no el selector del listado.

| De (venta a crédito) | A | Permitida |
|----------------------|---|-----------|
| `pending` | `cancelled` | Sí |
| `completed` | `cancelled` | Sí |
| `pending` | `completed` | **No**, `409 CONFLICT` |
| `pending` | `pending` | **No**, `409 CONFLICT` |
| `completed` | `completed` | **No**, `409 CONFLICT` |
| `completed` | `pending` | **No**, `409 CONFLICT` |

La salida para cobrar es `POST /api/v1/sales/:id/payments`, y para deshacer un cobro, `DELETE /api/v1/sales/:id/payments/:paymentId`. `cancelled` sigue siendo la excepción aceptada porque una venta que no ocurrió puede cancelarse aunque tenga pagos: el libro queda como historia de lo que se cobró, sin contar como ingreso ni como caja (D-008).

### Errores

| Situación | Código | `message` |
|-----------|--------|-----------|
| `id` no es un UUID | `BAD_REQUEST` | `"id: Sale id must be a valid UUID"` |
| `status` no viene | `BAD_REQUEST` | `"<campo>: <mensaje de Zod>"` |
| `status` fuera del enum | `BAD_REQUEST` | `"status: <mensaje de Zod>"` |
| Otra clave en el cuerpo | `BAD_REQUEST` | `"value: Unrecognized key(s) in object: '<clave>'"` |
| La venta no existe | `NOT_FOUND` | `"Sale not found"` |
| La venta está borrada lógicamente | `NOT_FOUND` | `"Sale not found"` |
| La venta está `cancelled` y se pide cualquier estado | `CONFLICT` | ``"La venta de \"<cliente>\" está cancelada y no se le puede cambiar el estado: cancelada es definitiva. Si la operación ocurrió, registrala como una venta nueva."`` |
| `status: "completed"` en una venta de contado sin `amount_paid` | `BAD_REQUEST` | `"amount_paid is required to complete a sale"` |
| `amount_paid` distinto del total con `credit_card` | `BAD_REQUEST` | `"amount_paid must equal the total for a card sale: expected <total>"` |
| `amount_paid` menor al total con `cash` | `BAD_REQUEST` | `"amount_paid is insufficient: short by <monto>"` |
| `amount_paid` con formato inválido | `BAD_REQUEST` | `"amount_paid: <mensaje de Zod sobre el patrón>"` |
| `status: "completed"` o `"pending"` en una venta a crédito | `CONFLICT` | `La venta de "<nombre>" es a crédito: se cobra registrando pagos, no cambiando el estado.` |

## `PATCH /api/v1/sales/:id/shipment-method`

Cambia el método de envío de una venta, que es la columna por la que agrupan el dashboard y el `kpis` del listado. Es la única edición de un campo de la venta que no sea el estado ni el libro de pagos.

### Parámetro de ruta

| Parámetro | Tipo | Regla |
|-----------|------|-------|
| `id` | Cadena | UUID. Un valor que no sea UUID produce `400`. |

### Cuerpo

```json
{ "shipment_method": "delivery" }
```

| Campo | Tipo | Requerido | Regla |
|-------|------|-----------|-------|
| `shipment_method` | Enum | **Sí** | `"cargotrans"`, `"delivery"`, `"pickup"` o `"unassigned"` |

**Solo ese campo.** Cualquier otra clave produce `400`.

`unassigned` es un valor de primera clase y no un «sin dato»: una venta nace con él cuando nadie eligió método de envío, y ponerlo explícitamente devuelve la venta al grupo de las no clasificadas en lugar de vaciar la columna.

### Respuesta `200`

El detalle completo de la venta, idéntico a `GET /api/v1/sales/:id`, con el `shipment_method` nuevo. Cambiar el método no toca `sale_date`, ni el estado, ni el libro de pagos: `GET /api/v1/dashboard/by-shipment` y el `kpis` del listado cuentan la venta en el grupo nuevo desde la siguiente lectura.

### Errores

Los mismos casos que el cambio de estado, sin el `409` de la venta cancelada: cancelar una venta no congela su método de envío, porque el paquete ya salió o no salió igual.

| Situación | Código | `message` |
|-----------|--------|-----------|
| `id` no es un UUID | `BAD_REQUEST` | `"id: Sale id must be a valid UUID"` |
| `shipment_method` no viene o no es del enum | `BAD_REQUEST` | `"shipment_method: <mensaje de Zod>"` |
| Otra clave en el cuerpo | `BAD_REQUEST` | `"value: Unrecognized key(s) in object: '<clave>'"` |
| La venta no existe | `NOT_FOUND` | `"Sale not found"` |
| La venta está borrada lógicamente | `NOT_FOUND` | `"Sale not found"` |

---

## `POST /api/v1/sales/:id/payments`

Registra un pago —total o parcial— de una venta a crédito. Cada pago es un renglón del libro `sale_payment`; el saldo y el estado de la venta se recalculan en la misma transacción.

### Parámetro de ruta

| Parámetro | Tipo | Regla |
|-----------|------|-------|
| `id` | Cadena | UUID de la venta. Un valor que no sea UUID produce `400`, no `404`. |

### Cuerpo

```json
{
  "amount": "500.00",
  "paid_at": "2026-09-28T17:05:00.000Z",
  "payment_method": "cash",
  "payment_bank": null,
  "note": "Abono de la quincena"
}
```

| Campo | Tipo | Requerido | Regla |
|-------|------|-----------|-------|
| `amount` | Cadena decimal | **Sí** | `MONEY_PATTERN`. Estrictamente mayor que cero y menor o igual al saldo pendiente. Es el monto **aplicado** a la deuda, no lo que el cliente entregó: si entrega 1.500 sobre una deuda de 1.200, el pago es de `"1200.00"`. |
| `paid_at` | Fecha ISO 8601 | No | Cuándo pagó. Por defecto el instante del alta. Es la fecha con la que el pago entra en la caja (`collected_revenue`). |
| `payment_method` | Enum | **Sí** | `"cash"` o `"credit_card"`. Puede **no** coincidir con la forma de pago con la que se registró la venta. |
| `payment_bank` | Cadena | Condicional | Obligatorio con `credit_card` (1 a 100 caracteres) y prohibido con `cash`. Es la misma regla condicional del alta de la venta. |
| `note` | Cadena o `null` | No | Hasta 500 caracteres. |

**Ninguna clave distinta de estas es aceptada.** El esquema es estricto.

### Respuesta `201`

El detalle completo de la venta, con el mismo mapper de `GET /api/v1/sales/:id`. El ejemplo muestra el segundo abono de una venta a crédito de `2100.50`:

```json
{
  "id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
  "type": "whatsapp",
  "customer_name": "Laura Ramírez",
  "customer_id": "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16",
  "product_name": "Vestido de algodón",
  "category": ["camisas"],
  "payment_method": "cash",
  "payment_bank": null,
  "payment_terms": "credit",
  "due_date": "2026-10-28T00:00:00.000Z",
  "sale_date": "2026-09-28T00:00:00.000Z",
  "status": "pending",
  "cost": "1250.50",
  "shipment_method": "cargotrans",
  "amount_paid": "2000.50",
  "change_given": null,
  "additional_items": [
    {
      "id": "0c5f1e88-1a47-4b92-8d3e-77b0c5a1e640",
      "sale_id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
      "name": "Pantalón de mezclilla",
      "description": "Talla 30, azul",
      "quantity": 1,
      "total": "850.00",
      "kind": "additional",
      "created_at": "2026-09-28T17:05:01.442Z",
      "updated_at": "2026-09-28T17:05:01.442Z"
    }
  ],
  "additional_count": 1,
  "total": "2100.50",
  "paid_total": "2000.50",
  "balance": "100.00",
  "is_overdue": false,
  "payments": [
    {
      "id": "a1d4c0f2-3b87-4c59-9e14-6f2b8d0c7a31",
      "sale_id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
      "amount": "500.00",
      "paid_at": "2026-10-05T14:20:00.000Z",
      "payment_method": "cash",
      "payment_bank": null,
      "note": "Abono de la quincena",
      "created_at": "2026-10-05T14:20:03.118Z",
      "updated_at": "2026-10-05T14:20:03.118Z"
    },
    {
      "id": "7e2b9c40-15d3-4a86-bf27-9c1d5e3a8402",
      "sale_id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
      "amount": "1500.50",
      "paid_at": "2026-10-19T16:40:00.000Z",
      "payment_method": "credit_card",
      "payment_bank": "BAC Credomatic",
      "note": null,
      "created_at": "2026-10-19T16:40:02.501Z",
      "updated_at": "2026-10-19T16:40:02.501Z"
    }
  ],
  "payments_count": 2,
  "created_at": "2026-09-28T17:05:01.442Z",
  "updated_at": "2026-10-19T16:40:02.501Z"
}
```

`paid_total` es la suma del libro, `balance` es lo que falta e `is_overdue` se recalcula contra la fecha de hoy. El pago nuevo aparece en `payments` **según su `paid_at`**: un abono cargado con fecha anterior se ubica en el medio del historial, no al final. Repetir la llamada con otro monto es un abono más: el libro acumula y el saldo baja.

### Reglas del libro

| Regla | Cómo se garantiza |
|-------|-------------------|
| Sólo una venta a crédito recibe pagos | Servicio: `409` si `payment_terms = "immediate"` |
| Una venta cancelada no recibe pagos | Servicio: `409` antes de tocar nada |
| La suma de pagos vivos nunca supera el total | `SELECT ... FOR UPDATE` sobre la fila de la venta y la suma del libro **dentro de la misma transacción** |
| Saldo cero ⇒ `status = "completed"` | Servicio, en la misma transacción que inserta el pago. Es el único camino por el que una venta a crédito se marca cobrada |
| El saldo no se guarda | `paid_total` = `SUM(amount)` de los pagos vivos; `balance` = `total − paid_total` |
| `sale.amount_paid` se reescribe con la suma del libro | Repositorio; `change_given` queda `null`, porque un abono nunca genera vuelto. Si el libro queda vacío, `amount_paid` vuelve a `null` |

El bloqueo de fila no es decorativo: **dos cobros simultáneos no pueden dejar el saldo negativo**. El segundo espera el lock, lee el libro con el pago del primero ya adentro y, si juntos superan el total, recibe `400` de saldo insuficiente. Tampoco puede quedar una venta `completed` con saldo pendiente, porque el estado se escribe en la misma transacción que el pago que lleva el saldo a cero.

### Errores

| Situación | Código | `message` |
|-----------|--------|-----------|
| `id` no es un UUID | `BAD_REQUEST` | `"id: Sale id must be a valid UUID"` |
| `amount` en cero | `BAD_REQUEST` | `"amount: Payment amount must be greater than zero"` |
| `amount` mayor al saldo | `BAD_REQUEST` | `"amount: Payment exceeds the outstanding balance: expected at most <saldo>"` |
| `amount` con formato inválido | `BAD_REQUEST` | `"amount: <mensaje de Zod sobre el patrón>"` |
| `payment_method` fuera del enum | `BAD_REQUEST` | `"payment_method: <mensaje de Zod>"` |
| `credit_card` sin `payment_bank` | `BAD_REQUEST` | `"payment_bank: Payment bank is required for credit card payments"` |
| `cash` con `payment_bank` | `BAD_REQUEST` | `"payment_bank: Payment bank is only allowed for credit card payments"` |
| `paid_at` no parsea | `BAD_REQUEST` | `"paid_at: <mensaje de Zod>"` |
| Clave desconocida en el cuerpo | `BAD_REQUEST` | `"value: Unrecognized key(s) in object: '<clave>'"` |
| La venta no existe | `NOT_FOUND` | `"Sale not found"` |
| La venta está borrada lógicamente | `NOT_FOUND` | `"Sale not found"` |
| La venta está `cancelled` | `CONFLICT` | ``"La venta de \"<cliente>\" está cancelada y no se le puede cambiar el estado: cancelada es definitiva. Si la operación ocurrió, registrala como una venta nueva."`` |
| La venta es de contado | `CONFLICT` | `La venta de "<nombre>" es de contado: para marcarla cobrada usá el cambio de estado con el monto recibido.` |

---

## `DELETE /api/v1/sales/:id/payments/:paymentId`

Borra lógicamente un pago mal registrado. Corregir un monto es **borrar y volver a registrar**: no hay `PATCH` de un pago, por el mismo criterio con el que un gasto se borra y se vuelve a crear (D-004).

### Parámetros de ruta

| Parámetro | Tipo | Regla |
|-----------|------|-------|
| `id` | Cadena | UUID de la venta. Un valor que no sea UUID produce `400`. |
| `paymentId` | Cadena | UUID del pago. Un valor que no sea UUID produce `400`, no `404`. |

Sin cuerpo. El borrado es lógico: escribe `deleted_at`, no quita la fila.

### Respuesta `200`

El detalle completo de la venta, idéntico a `GET /api/v1/sales/:id`, con el libro y el saldo recalculados. Los campos que cambian respecto de la respuesta anterior:

```json
{
  "status": "pending",
  "amount_paid": "500.00",
  "paid_total": "500.00",
  "balance": "1600.50",
  "is_overdue": false,
  "payments_count": 1
}
```

El pago borrado ya no aparece en `payments`. Si el borrado reabre el saldo de una venta que estaba `completed`, la respuesta la devuelve a `pending`: el estado no puede afirmar algo que el libro desmiente. Si el pago borrado era el último, la venta queda `pending` con `paid_total: "0.00"`, `amount_paid: null` y `balance` igual al total.

### Efectos

| Elemento | Cambio |
|----------|--------|
| `sale_payment.deleted_at` | Se escribe la fecha actual. Es el **único** cambio en el pago. |
| `sale.amount_paid` | Pasa a ser la suma del libro vivo, o `null` si el libro queda vacío: sin pagos no hay monto entregado que informar. |
| `sale.status` | Vuelve a `pending` si el saldo deja de ser cero; si no cambia, se queda como estaba. |
| `sale.updated_at` | Se escribe en la misma sentencia. |
| `collected_revenue` del dashboard | Deja de contar ese pago. |
| Los datos del pago | El importe, la fecha, la forma de pago, el banco y la nota siguen en la fila, con `deleted_at` marcado. |

### Errores

| Situación | Código | `message` |
|-----------|--------|-----------|
| `id` no es un UUID | `BAD_REQUEST` | `"id: Sale id must be a valid UUID"` |
| `paymentId` no es un UUID | `BAD_REQUEST` | `"paymentId: Payment id must be a valid UUID"` |
| El pago no existe, está borrado lógicamente o pertenece a otra venta | `NOT_FOUND` | `"Payment not found"` |
| La venta no existe | `NOT_FOUND` | `"Sale not found"` |
| La venta está borrada lógicamente | `NOT_FOUND` | `"Sale not found"` |
| La venta está `cancelled` | `CONFLICT` | ``"La venta de \"<cliente>\" está cancelada y no se le puede cambiar el estado: cancelada es definitiva. Si la operación ocurrió, registrala como una venta nueva."`` |
| La venta es de contado | `CONFLICT` | `La venta de "<nombre>" es de contado: para marcarla cobrada usá el cambio de estado con el monto recibido.` |

Reintentar el borrado del mismo pago responde `404`, no `200`: el pago ya no existe para el sistema.

## Qué no existe en ventas

| Ausente | Razón |
|---------|-------|
| `DELETE /api/v1/sales/:id` | Una venta se cancela con `PATCH .../status` a `cancelled`. El borrado lógico de ventas no es una operación del negocio, y por eso no hay propagación de borrado hacia los artículos adicionales que implementar. |
| `PUT /api/v1/sales/:id` | El importe cobrado y los artículos entregados no se editan. Editarlos dejaría el total derivado sin relación con lo que el cliente pagó. |
| `PATCH /api/v1/sales/:id` general | Por la misma razón. `PATCH .../status` y `PATCH .../shipment-method` son sub-rutas de un solo campo, y el libro de pagos se escribe con `POST` y `DELETE`, no con un parche. |
| `PATCH` de un pago | Un abono mal cargado se borra lógicamente y se vuelve a registrar: es el mismo criterio que un gasto (D-004). Un `PATCH` obligaría a decidir qué pasa con el saldo y el estado en cada edición, y el libro ya resuelve el caso. |
| Edición de `payment_terms` o de `due_date` después del alta | La condición de pago y el vencimiento se fijan al crear la venta, porque cambian el significado de los pagos ya registrados. Para pasarla de contado a crédito —o al revés— se cancela y se registra de nuevo. |
| `DELETE /api/v1/sales/:id` de una venta a crédito con pagos | Una venta no se borra: se cancela. En una venta a crédito con pagos, borrarla dejaría el libro sin dueño y la caja contando plata de una venta que ya no existe. |
| `?limit=` | Decisión D-011: el tamaño de página se llama `per_page` y viaja junto con `page`. |
| `?q=` de búsqueda | No hay búsqueda de ventas. Los filtros disponibles son fecha, canal, estado, condición de pago, cliente y vencimiento. La búsqueda por nombre o teléfono vive en `GET /api/v1/customers?q=`. |
| `?sort=` | El orden es `sale_date` descendente, luego hora de registro y luego `id`, siempre. |
| `POST /api/v1/sales` genérico con `type` en el cuerpo | El canal lo determina la ruta. Ver `modules/db/enums/01-sale_type.md`. |
