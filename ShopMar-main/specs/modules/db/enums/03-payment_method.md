# `payment_method` — Forma de pago

## Valores

| Valor | Significado | Etiqueta en el panel | Efecto en el sistema |
|-------|-------------|---------------------|----------------------|
| `cash` | La venta se pagó en efectivo. | "Efectivo" | `payment_bank` debe venir nulo, ausente o ser `null`. |
| `credit_card` | La venta se pagó con tarjeta de crédito. | "Tarjeta de crédito" | `payment_bank` es **obligatorio**. |

```ts
export const paymentMethod = pgEnum("payment_method", ["cash", "credit_card"])
```

## Dónde se usa

| Ubicación | Uso |
|-----------|-----|
| `sale` (tabla del esquema) | Columna `payment_method`, obligatoria, sin índice. |
| `POST /api/v1/sales/live` | Validado por el esquema base de la venta, con la regla condicional del banco. |
| `POST /api/v1/sales/whatsapp` | Igual que el anterior. |
| `GET /api/v1/sales/:id` | Devuelto en la respuesta, junto con `payment_bank`. |
| Frontend | Campo de selección del formulario de venta, con las opciones "Efectivo" y "Tarjeta de crédito". El selector de banco se muestra solo cuando la opción elegida es "Tarjeta de crédito". |

**No se expone en el listado.** `GET /api/v1/sales` devuelve `id`, `sale_date`, `customer_name`, `product_name`, `type`, `status`, `cost`, `additional_count` y `total`. La forma de pago solo aparece en el detalle de la venta, que es lo que la factura imprimible consume.

## Sin índice

`payment_method` **no tiene índice declarado** y ningún endpoint de la versión 1 filtra por él. Agregar un índice para una columna que nunca se busca sería un coste de escritura en cada alta de venta a cambio de nada. Si algún día se necesita filtrar el listado por forma de pago, el índice se agrega junto con el filtro.

## La regla condicional del banco

`payment_bank` no es un campo libre. Su presencia depende de la forma de pago, y esa dependencia se valida en tres capas distintas.

### Capa 1 — Zod, en el DTO

`CreateLiveSaleDtoSchema` y `CreateWhatsappSaleDtoSchema` comparten un `superRefine` que produce dos mensajes distintos según la dirección de la violación:

| Situación | `issue.path` | Mensaje | Respuesta |
|-----------|--------------|---------|-----------|
| `credit_card` sin `payment_bank` | `["payment_bank"]` | `"Payment bank is required for credit card payments"` | `400` con `message: "payment_bank: Payment bank is required for credit card payments"` |
| `cash` con `payment_bank` informado | `["payment_bank"]` | `"Payment bank is only allowed for credit card payments"` | `400` con `message: "payment_bank: Payment bank is only allowed for credit card payments"` |

El prefijo `payment_bank: ` lo agrega `formatZodIssueMessage` de `src/config/error-handler.ts`, que concatena la ruta del issue con su mensaje.

Se eligió `superRefine` en lugar de `z.discriminatedUnion` porque el resto de la venta tiene cinco campos comunes y componer una unión discriminada con un objeto común obliga a intersectar dos esquemas y vuelve el mensaje de error menos claro para la persona que lo lee.

### Capa 2 — La base de datos

```sql
CONSTRAINT "sale_payment_bank_check" CHECK (
  ("payment_method" = 'credit_card' AND "payment_bank" IS NOT NULL)
  OR ("payment_method" = 'cash' AND "payment_bank" IS NULL)
)
```

Si alguien inserta una fila saltándose la API, PostgreSQL la rechaza. La restricción se declara con `check()` en `src/db/schema/sales.ts` y viaja al SQL de la migración generada.

### Capa 3 — La interfaz

El formulario de venta **oculta** el selector de banco mientras la forma de pago sea "Efectivo" y lo **muestra** cuando es "Tarjeta de crédito", con una línea de JavaScript que alterna `hidden` en el contenedor del campo. Ocultar no es validar: si la dueña elige Efectivo con el banco ya escrito, el selector se oculta pero el valor sigue en el DOM, y la validación del navegador no lo revisa. Por eso la capa 1 es obligatoria y no se considera redundante.

## Por qué no hay otros medios de pago

La tienda opera en efectivo y con tarjeta. No hay transferencia, no hay pago móvil, no hay cobro a través de un proveedor externo. Agregar un valor futuro, por ejemplo `transfer`, es una migración de una sentencia, un valor más en el `z.literal` correspondiente del `superRefine` y una opción más en el `<select>` del formulario. La `CHECK` de la base también hay que extenderla, porque su forma actual es una disyunción de dos casos cerrados.
