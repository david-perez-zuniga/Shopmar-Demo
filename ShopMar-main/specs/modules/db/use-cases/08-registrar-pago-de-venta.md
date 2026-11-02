# Caso de uso: registrar y borrar el pago de una venta a crédito

## Actor

La dueña de la tienda, desde el listado de ventas, o un cliente de la API.

## Disparador

El cliente de una venta a crédito viene a pagar, entero o en parte.

## Flujo principal — registrar un pago

1. **La dueña elige la venta** en el listado y escribe el monto que el cliente entrega, la fecha y con
   qué pagó (efectivo o tarjeta, con banco).
2. **El panel pide `POST /api/v1/sales/:id/payments`** con `{ amount, paid_at?, payment_method,
   payment_bank?, note? }`.
3. **El controlador valida.** `SaleIdParamSchema` exige UUID; `CreateSalePaymentDtoSchema` es
   `.strict()` y aplica el patrón de dinero y la regla condicional del banco.
4. **El servicio abre una transacción y bloquea la venta.** `SELECT ... FOR UPDATE` sobre la fila de
   `sale`:

   | Situación | Detección | Respuesta |
   |-----------|-----------|-----------|
   | La venta no existe o está borrada | `findById` | `404` con `message: "Sale not found"` |
   | La venta está `cancelled` | Servicio | `409` con el mensaje de venta cancelada de siempre |
   | La venta es de contado | `payment_terms = 'immediate'` | `409` con `message: "La venta de \"<nombre>\" es de contado: para marcarla cobrada usá el cambio de estado con el monto recibido."` |
   | El monto es cero | Zod / servicio | `400` con `message: "amount: Payment amount must be greater than zero"` |
   | El monto supera el saldo | Servicio, después de sumar el libro | `400` con `message: "amount: Payment exceeds the outstanding balance: expected at most <saldo>"` |

5. **El repositorio escribe el pago y actualiza la venta en la misma transacción.** Inserta el renglón
   en `sale_payment` con `amount` igual al monto **aplicado**; suma el libro vivo de la venta; escribe
   `sale.amount_paid` con esa suma y, si la suma iguala el total, `sale.status = 'completed'`; si no, la
   deja `pending`. `change_given` sigue en `NULL`: un abono nunca genera vuelto.
6. **La respuesta es `201`** con el detalle completo de la venta: `paid_total` nuevo, `balance`
   restante, `is_overdue` recalculado y el historial en `payments`.

Repetir el paso con otro monto es un abono más: el libro acumula y el saldo baja.

## Flujo alternativo — borrar un pago mal tipeado

1. **`DELETE /api/v1/sales/:id/payments/:paymentId`.** Mismas guardas: venta viva, no cancelada, de
   crédito; el pago tiene que pertenecer a esa venta y estar vivo (`404` con `message: "Payment not
   found"` si no).
2. **El repositorio hace borrado lógico** (`deleted_at = new Date()`), vuelve a sumar el libro y
   escribe `sale.amount_paid`. Si el saldo deja de ser cero y la venta estaba `completed`, la devuelve a
   `pending`: el estado no puede afirmar algo que el libro desmiente. Si el borrado deja el libro vacío,
   `sale.amount_paid` vuelve a `NULL`: sin pagos no hay monto entregado que informar, y una venta a
   crédito sin pagos reporta `null`, nunca `"0.00"` (D-022).
3. **La respuesta es `200`** con el detalle completo actualizado.

No hay `PATCH` de un pago: corregir un monto es borrarlo y volver a registrarlo, el mismo criterio que
un gasto (D-004).

## Datos involucrados

### `sale_payment` — una fila insertada o marcada como borrada

| Columna | Valor |
|---------|-------|
| `sale_id` | La venta cobrada. |
| `amount` | El monto aplicado. Estrictamente mayor que cero y menor o igual al saldo. |
| `paid_at` | La fecha del pago. Si no se envía, el instante del alta. |
| `payment_method`, `payment_bank` | Con qué pagó. Puede no coincidir con la forma de pago de la venta. |
| `note` | Nota libre, opcional. |
| `deleted_at` | `NULL` al crear; la fecha del borrado lógico al borrar. |

### `sale` — una fila actualizada

| Columna | Cambio |
|---------|--------|
| `amount_paid` | Pasa a ser la suma del libro vivo, o `NULL` si el libro queda vacío. |
| `status` | `completed` cuando el saldo llega a cero; `pending` cuando un borrado lo reabre. |
| `updated_at` | `new Date()` en la misma sentencia. |
| `change_given` | Sin cambios (nulo en una venta a crédito). |
| `due_date`, `customer_id`, `payment_terms`, `cost` | Sin cambios. |

### Invariantes

| Invariante | Dónde se garantiza |
|------------|--------------------|
| La suma de pagos vivos nunca supera el total | Servicio + `SELECT ... FOR UPDATE` sobre la venta dentro de la transacción |
| `status = 'completed'` ⇔ saldo cero | Servicio, en la misma transacción que escribe el pago |
| `amount > 0` | `CHECK sale_payment_amount_positive` y Zod |
| Sin pagos vivos ⇒ `amount_paid = NULL` | Repositorio, al borrar el último pago del libro |
| El banco es obligatorio con tarjeta y prohibido con efectivo | `CHECK sale_payment_bank_check` y `superRefine` del DTO |

## Alternativas y errores

| Situación | Detección | Respuesta |
|-----------|-----------|-----------|
| `:id` que no es UUID | `SaleIdParamSchema` | `400` con `message: "id: Sale id must be a valid UUID"` |
| `:paymentId` que no es UUID | `SalePaymentIdParamSchema` | `400` con `message: "paymentId: Payment id must be a valid UUID"` |
| Claves desconocidas en el cuerpo | `.strict()` | `400` con la lista de claves |
| `payment_method` fuera del enum | Zod | `400` |
| `paid_at` que no parsea | Zod | `400` con `message: "paid_at: ..."` |
| Dos cobros simultáneos que juntos superan el total | Bloqueo de fila + suma dentro de la transacción | El segundo recibe `400` de saldo insuficiente; la base no queda inconsistente |

## Salida

| Elemento | Resultado |
|----------|-----------|
| Estado HTTP | `201` al registrar, `200` al borrar |
| Cuerpo | Detalle completo de la venta, con `paid_total`, `balance`, `is_overdue` y `payments` |
| Ubicación en el panel (corte siguiente) | Botón «Registrar pago» en la fila y en el detalle; el estado de la fila pasa a `Completada` solo cuando el saldo llega a cero |
| Efecto en el dashboard | `collected_revenue` suma el pago en el rango de `paid_at`. `outstanding_receivables` baja el saldo del rango de `sale_date`. `overdue_receivables` deja de contar la venta si el saldo llega a cero. `total_revenue` **no cambia**: el devengado no depende de cuándo se cobra. |
