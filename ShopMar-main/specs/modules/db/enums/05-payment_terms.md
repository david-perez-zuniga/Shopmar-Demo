# `payment_terms` — Condición de pago

## Valores

| Valor | Significado | Etiqueta en el panel | Efecto en el sistema |
|-------|-------------|---------------------|----------------------|
| `immediate` | La venta se cobra al momento (contado). | "Contado" | `due_date` debe ser nulo. El cuerpo puede no traer `customer_id`, y entonces el servicio resuelve o crea el cliente con el nombre escrito (S18). Desde S63 el contado puede no llevar cliente en absoluto: el cuerpo omite las dos claves y el servicio guarda el genérico «Consumidor Final» con `customer_id NULL`, sin crear fila en `customer`. Se cobra con el flujo de siempre: `PATCH /sales/:id/status` a `completed` con `amount_paid`. |
| `credit` | El cliente se lleva la mercadería y paga después (fiado). | "Crédito" | `due_date` es **obligatorio**; el cliente se identifica con `customer_id` **o** con `customer_name` y el servidor resuelve o crea el cliente (S29). La venta nace `pending` y se cobra registrando pagos; `status` no puede pasar a `completed` ni a `pending` por el endpoint de estado. |

```ts
export const paymentTerms = pgEnum("payment_terms", ["immediate", "credit"])
```

## Dónde se usa

| Ubicación | Uso |
|-----------|-----|
| `sale` (tabla del esquema) | Columna `payment_terms`, obligatoria, por defecto `immediate`. |
| `POST /api/v1/sales/live` y `/whatsapp` | Opcional en el cuerpo; por defecto `immediate`. Con `credit` se exigen `customer_id` y `due_date`. |
| `GET /api/v1/sales` | Devuelto en cada fila y aceptado como filtro (`payment_terms=credit`). |
| `GET /api/v1/sales/:id` | Devuelto en el detalle, con `due_date`, `paid_total`, `balance` e `is_overdue`. |
| `PATCH /api/v1/sales/:id/status` | Decide qué transiciones se aceptan: sobre una venta a crédito, sólo `cancelled`. |
| Frontend (corte siguiente) | Selector "Condición de pago" del formulario de venta, común a live y WhatsApp. |

## Por qué no es un valor de `payment_method`

`payment_method` responde **con qué** pagó el cliente (`cash`, `credit_card`); `payment_terms` responde
**cuándo**. Un cliente puede deber hoy y pagar con tarjeta en tres semanas: con `credit` dentro de
`payment_method` no habría dónde registrar el medio del pago que efectivamente ocurrió. La decisión
completa está en D-022.

## La regla condicional del vencimiento

| Situación | Detección | Respuesta |
|-----------|-----------|-----------|
| `credit` sin `due_date` | Zod | `400` con `message: "due_date: A credit sale needs a due date"` |
| `credit` sin `customer_id` y sin `customer_name` | Zod | `400` con `message: "customer_id: Send customer_id or customer_name"` (S29) |
| `immediate` con `due_date` | Zod | `400` con `message: "due_date: Only a credit sale has a due date"` |
| `credit` con `status: "completed"` | Zod | `400` con `message: "status: A credit sale is created pending"` |
| `credit` con `amount_paid` | Zod | `400` con `message: "amount_paid: A credit sale does not take amount_paid; register payments instead"` |

La base de datos repite la regla como defensa en profundidad:

```sql
CONSTRAINT "sale_credito_exige_vencimiento" CHECK (
  ("payment_terms" = 'credit' AND "due_date" IS NOT NULL)
  OR ("payment_terms" = 'immediate' AND "due_date" IS NULL)
)

CONSTRAINT "sale_credito_exige_cliente" CHECK (
  "payment_terms" = 'immediate' OR "customer_id" IS NOT NULL
)
```

## Índice

`payment_terms` no tiene índice propio: el índice parcial `sale_por_cobrar_idx`, sobre `due_date` y
con predicado `deleted_at IS NULL AND status <> 'cancelled' AND payment_terms = 'credit'`, cubre la
única consulta que lo necesita (la lista de cuentas por cobrar y el agregado de vencidos).
