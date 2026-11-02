# Enumeraciones

Siete enumeraciones, todas definidas como `pgEnum` en `backend/src/db/schema/` (en `sales.ts`) y tipadas por Drizzle. Ninguna tiene valores dinámicos: son conjuntos cerrados y cualquier valor fuera de ellos produce `400 BAD_REQUEST` en la API.

## Archivos

| Enum | Valores | Tabla |
|------|---------|-------|
| [`01-sale_type.md`](01-sale_type.md) | `sale_type` | `live`, `whatsapp` |
| [`02-sale_status.md`](02-sale_status.md) | `sale_status` | `pending`, `completed`, `cancelled` |
| [`03-payment_method.md`](03-payment_method.md) | `payment_method` | `cash`, `credit_card` |
| [`05-payment_terms.md`](05-payment_terms.md) | `payment_terms` | `immediate`, `credit` |
| [`04-package_method.md`](04-package_method.md) | `package_method` | `cargotrans`, `delivery`, `retiro` — **retirado** junto con la tabla `package` |

## Declaración en Drizzle

```ts
export const saleType = pgEnum("sale_type", ["live", "whatsapp"])
export const saleStatus = pgEnum("sale_status", ["pending", "completed", "cancelled"])
export const paymentMethod = pgEnum("payment_method", ["cash", "credit_card"])
export const paymentTerms = pgEnum("payment_terms", ["immediate", "credit"])
export const shipmentMethod = pgEnum("shipment_method", ["cargotrans", "delivery", "pickup", "unassigned"])
export const saleCategory = pgEnum("sale_category", ["pantalones", "camisas", "chaquetas", "sudaderas"])
export const additionalSaleKind = pgEnum("additional_sale_kind", ["merchandise", "additional"])
```

`sale_category` es el único enum del panel que se usa **como lista**: la columna `sale.category` es `sale_category[] NOT NULL`, con al menos una categoría y sin repetidos (decisión D-021). Ojo al tocarlo: `drizzle-kit` no detecta cambios de dimensiones en una columna enum —con el esquema en `.array()` sigue respondiendo "No schema changes"—, así que ese tipo lo guarda `backend/scripts/verify-schema.sql`, sección 2b.

## Convenciones

| Regla | Detalle |
|-------|---------|
| Nombre | Minúsculas y singular. `sale_type`, no `SaleType` ni `sale_types`. |
| Valores | Minúsculas y en `snake_case`. |
| Nomenclatura de la base | El enum se materializa como un tipo de PostgreSQL con el mismo nombre. PostgreSQL lo guarda como texto, con la comparación sensible a mayúsculas. |
| Serialización | JSON, con el valor exacto: `"whatsapp"`, `"credit_card"`. |
| Etiquetas en la interfaz | La traducción a español (`Mostrador`, `WhatsApp`, `Efectivo`, `Tarjeta de crédito`, `Contado`, `Crédito`, `Cargotrans`, `Delivery`, `Retiro`, `Pendiente`, `Completada`, `Cancelada`) vive **exclusivamente** en el frontend, en `frontend/src/lib/format.ts`. Las tablas de PostgreSQL y la API hablan inglés. |
| Cambio de valores | Agregar un valor a un enum de PostgreSQL es una migración de una sola sentencia. Quitar un valor que ya está en uso no es posible sin antes migrar los datos. |

## Cuál enum usa cada endpoint

| Endpoint | Enum | Dónde se valida |
|----------|------|-----------------|
| `POST /api/v1/sales/live` | `sale_type` implícito (la ruta lo define), `payment_method`, `payment_terms`, `sale_status` | `CreateLiveSaleDtoSchema` |
| `POST /api/v1/sales/whatsapp` | `sale_type` implícito, `payment_method`, `sale_status` | `CreateWhatsappSaleDtoSchema` |
| `GET /api/v1/sales` | `sale_type`, `sale_status` y `payment_terms` como filtros | `SalesQuerySchema` |
| `PATCH /api/v1/sales/:id/status` | `sale_status` | `UpdateSaleStatusDtoSchema` |
| `POST /api/v1/sales/:id/payments` | `payment_method` | `CreateSalePaymentDtoSchema` |
| `POST /api/v1/expenses` | Ninguno | `CreateExpenseDtoSchema` |

`sale_type` **nunca viaja en el cuerpo de una petición**. El canal lo determina la ruta: `POST /api/v1/sales/live` crea una venta `live` y `POST /api/v1/sales/whatsapp` crea una venta `whatsapp`. El enum existe en la base para indexar y filtrar, y aparece en las respuestas del listado y del detalle. Esa es la razón por la que las dos tablas de DTO son distintas en lugar de ser una sola con un campo discriminador.
