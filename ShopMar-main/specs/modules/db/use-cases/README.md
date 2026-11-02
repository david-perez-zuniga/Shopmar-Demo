# Casos de uso

Un archivo por flujo de negocio de punta a punta. Cada uno sigue la misma forma: **Actor**, **Disparador**, **Flujo principal** (pasos numerados que tocan el esquema), **Datos involucrados**, **Alternativas y errores**, **Salida**.

## Actor único

Los ocho casos tienen el mismo actor: **la dueña de la tienda**, operando desde el panel administrativo. Desde D-024 el panel tiene dos roles —`seller` y `admin`—, pero los ocho flujos de negocio son los mismos para los dos: el único permiso que los distingue es el alta de usuarios, que no es un caso de uso del negocio y vive en `modules/api/07-auth.md`. El "cliente" y el "transportista" aparecen como texto en los campos, nunca como actores del sistema.

## Archivos

| Caso | Endpoint principal | Entidades que escribe | Entidades que lee |
|------|--------------------|------------------------|--------------------|
| [`01-registrar-venta-live.md`](01-registrar-venta-live.md) | `POST /api/v1/sales/live` | `sale` | — |
| [`02-registrar-venta-whatsapp-con-adicionales.md`](02-registrar-venta-whatsapp-con-adicionales.md) | `POST /api/v1/sales/whatsapp` | `sale`, `additional_sale` | — |
| [`03-actualizar-estado-venta.md`](03-actualizar-estado-venta.md) | `PATCH /api/v1/sales/:id/status` | `sale`, `sale_payment` (el cobro del mostrador) | `sale`, `additional_sale`, `sale_payment` |
| [`04-registrar-paquete-retirado.md`](04-registrar-paquete-retirado.md) | `POST /api/v1/packages` | `package` | `sale` (validación de la clave foránea) |
| [`05-registrar-gasto-diario.md`](05-registrar-gasto-diario.md) | `POST /api/v1/expenses`, `DELETE /api/v1/expenses/:id` | `expense` | `expense` |
| [`06-consultar-kpis-del-dashboard.md`](06-consultar-kpis-del-dashboard.md) | `GET /api/v1/dashboard/summary` | — | `sale`, `additional_sale`, `sale_payment`, `expense` |
| [`07-registrar-venta-a-credito.md`](07-registrar-venta-a-credito.md) | `POST /api/v1/sales/live`, `POST /api/v1/sales/whatsapp` con `payment_terms: "credit"` | `sale`, `additional_sale` | `customer` |
| [`08-registrar-pago-de-venta.md`](08-registrar-pago-de-venta.md) | `POST /api/v1/sales/:id/payments`, `DELETE /api/v1/sales/:id/payments/:paymentId` | `sale_payment`, `sale` | `sale`, `sale_payment` |

## Los módulos de negocio

Los casos de uso se agrupan en los módulos del backend:

| Módulo | Casos de uso |
|--------|--------------|
| `sales` | 01, 02, 03, 07, 08 |
| `customers` | 07 (alta del cliente, cuando no existe) |
| `expenses` | 05 |
| `dashboard` | 06 |

El caso 04 (paquetes) describe un módulo que ya no está en el esquema ni en la API; el documento se
conserva como historia.

El listado consolidado de ventas (`GET /api/v1/sales`) y el detalle (`GET /api/v1/sales/:id`) no tienen archivo propio porque no modifican datos: son lecturas puras, y su comportamiento está documentado endpoint por endpoint en `modules/api/02-sales.md`.

## Invariantes que atraviesan todos los casos

| Invariante | Dónde se verifica | Consecuencia si se rompe |
|------------|-------------------|--------------------------|
| Ningún importe se almacena como punto flotante. | `DECIMAL(10,2)` en el esquema, `MONEY_PATTERN` en Zod, `toMoneyString` en los mappers. | Pérdida de centavos. Decisión D-003. |
| El total de una venta es derivado, nunca almacenado. | Se calcula en `application/sales.service.ts` y `sales.mappers.ts`. | Imposible por construcción: no hay columna. Decisión D-003. |
| Nada se borra físicamente. | `softDelete` en los cuatro repositorios. | Se pierde el histórico. Decisión D-004. |
| Toda lectura excluye lo borrado lógicamente. | `deleted_at: null` en cada `where`. | Un registro anulado reaparece en un listado. Decisión D-004. |
| Una venta `live` no tiene artículos adicionales. | `.strict()` del DTO y `BadRequestError` del servicio. | El total sería ambiguo y el canal mentiría. |
| `payment_bank` existe solo con `credit_card`. | `superRefine` de Zod y `CHECK` de PostgreSQL. | Un pago quedaría sin trazabilidad bancaria. |
| Un paquete es independiente de una venta. | `sale_id` opcional con `onDelete: SetNull`. | Un envío podría perderse si se eliminara su venta. |
| Los agregados del dashboard solo excluyen lo borrado lógicamente. | `where` del repositorio de `dashboard`. | Los indicadores no cuadrarían con la operación real. Decisión D-008. |
