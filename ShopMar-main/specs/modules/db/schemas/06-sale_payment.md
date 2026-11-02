# `sale_payment` — Pago de una venta

## Propósito

El **libro de pagos** de una venta. Un renglón por cada pago que el cliente hizo, con su fecha, su monto
aplicado y su forma de pago. Existe porque una venta a crédito se cobra en partes y el saldo tiene que
salir de los hechos, no de un número que alguien escribe a mano (D-022).

**`amount` es el monto aplicado a la deuda, no lo que el cliente entregó.** Si la venta es de 1.200 y el
cliente entrega 1.500 en efectivo, el pago es de `1200.00` y los 300 de vuelto viven en
`sale.change_given`. Para un abono parcial de 500 sobre 1.200, el pago es `500.00`.

**El saldo no se guarda en ningún lado.** `paid_total` es `SUM(amount)` de los pagos vivos de la venta y
`balance` es `total − paid_total`, donde `total = cost + SUM(additional_sale.total)`. Los dos son
derivados y viajan como cadena decimal en la respuesta (D-003).

## Tabla

| Columna | Tipo Drizzle | Tipo SQL | Nulo | Por defecto | Notas |
|---------|--------------|----------|------|-------------|-------|
| `id` | `uuid("id").primaryKey()` | `UUID` | No | — | Clave primaria. El UUID lo genera la aplicación. |
| `sale_id` | `uuid("sale_id")` | `UUID` | No | — | Venta a la que pertenece el pago. |
| `amount` | `numeric("amount", { precision: 10, scale: 2 })` | `DECIMAL(10,2)` | No | — | Monto **aplicado**. Estrictamente mayor que cero. |
| `paid_at` | `timestamp("paid_at", { withTimezone: true, precision: 3 })` | `TIMESTAMP(3) WITH TIME ZONE` | No | — | Cuándo pagó. Por defecto el instante del alta. Es la fecha con la que el pago entra en la caja (`collected_revenue`). |
| `payment_method` | `paymentMethod("payment_method")` | `payment_method` | No | — | `cash` o `credit_card`. Puede **no** coincidir con la forma de pago de la venta: la venta se registró de una forma y el cliente puede pagar de otra. |
| `payment_bank` | `text("payment_bank")` | `TEXT` | **Sí** | `NULL` | Obligatorio con `credit_card`, prohibido con `cash`. Misma regla que la venta. |
| `note` | `text("note")` | `TEXT` | **Sí** | `NULL` | Nota libre. Cota de 500 caracteres en Zod. |
| `created_at` | `timestamp("created_at", { precision: 3 }).default(CURRENT_TIMESTAMP)` | `TIMESTAMP(3)` | No | `CURRENT_TIMESTAMP` | Auditoría. |
| `updated_at` | `timestamp("updated_at", { precision: 3 }).$onUpdate(() => new Date())` | `TIMESTAMP(3)` | No | — | Auditoría. Se escribe en cada `update`. |
| `deleted_at` | `timestamp("deleted_at", { precision: 3 })` | `TIMESTAMP(3)` | **Sí** | `NULL` | Borrado lógico (D-004). Un pago mal tipeado se borra lógicamente y se vuelve a registrar. |

### Restricciones `CHECK`

```sql
CONSTRAINT "sale_payment_amount_positive" CHECK ("amount" > 0)

CONSTRAINT "sale_payment_bank_check" CHECK (
  ("payment_method" = 'credit_card' AND "payment_bank" IS NOT NULL)
  OR ("payment_method" = 'cash' AND "payment_bank" IS NULL)
)
```

### Índices

| Índice | Columnas | Predicado | Para qué |
|--------|----------|-----------|----------|
| `sale_payment_sale_id_paid_at_idx` | `sale_id`, `paid_at` | `deleted_at IS NULL` | Sumar el saldo de una venta y listar su historial en orden. |

## Relaciones

### Sale payment pertenece a una sale

```ts
foreignKey({
  name: "sale_payment_sale_id_fkey",
  columns: [table.saleId],
  foreignColumns: [sale.id],
}).onDelete("cascade").onUpdate("cascade")
```

El borrado físico de una venta arrastra sus pagos, como ya pasa con `additional_sale`. El borrado real
del proyecto es lógico, así que en la práctica la cascada no se ejerce.

## Reglas de negocio que la tabla no puede expresar sola

| Regla | Dónde vive |
|-------|------------|
| Sólo una venta a crédito recibe pagos | Servicio de ventas: `409` sobre una venta de contado. |
| Una venta cancelada no recibe pagos ni los pierde | Servicio de ventas: `409`, antes de tocar nada. |
| La suma de pagos vivos nunca supera el total | Servicio de ventas, dentro de la transacción que bloquea la fila de la venta con `SELECT ... FOR UPDATE`. |
| Cero pagos con `status = completed` es imposible en una venta a crédito | Servicio: al registrar un pago que deja el saldo en cero, la venta pasa a `completed` en la misma transacción; al borrar un pago que reabre el saldo, vuelve a `pending`. |
| Sin pagos vivos, `sale.amount_paid` es `NULL` | Servicio: al borrar el último pago, la venta vuelve a `pending` y el monto entregado vuelve a `NULL`, nunca `"0.00"`. |
| Un total cero no lleva renglón en el libro | Servicio: una venta de contado de importe cero se marca `completed` sin pago, porque `amount > 0` es un `CHECK` y un pago de cero no es un pago. Una venta a crédito de total cero se rechaza en el alta. |
