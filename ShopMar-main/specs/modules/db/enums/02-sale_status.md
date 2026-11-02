# `sale_status` — Estado de la venta

## Valores

| Valor | Significado | Etiqueta en el panel | Efecto en el sistema |
|-------|-------------|---------------------|----------------------|
| `pending` | La venta está registrada pero todavía no se confirma como cobrada o entregada. Es el valor por defecto de la columna. | "Pendiente" | Suma en los agregados del dashboard. |
| `completed` | La venta se cobró y se entregó. | "Completada" | Suma en los agregados del dashboard. |
| `cancelled` | La venta se canceló: no se cobró y no se revive. Estado de ida. | "Cancelada" | **No** suma en los agregados del dashboard. Sale del ingreso y del conteo. Borra el cobro y no admite ninguna transición de salida. |

```ts
export const saleStatus = pgEnum("sale_status", ["pending", "completed", "cancelled"])
```

## Dónde se usa

| Ubicación | Uso |
|-----------|-----|
| `sale` (tabla del esquema) | Columna `status`, obligatoria, con `.default("pending")`. Indexada con `index("sale_status_idx").on(table.status)`. |
| `POST /api/v1/sales/live` | Aceptado en el cuerpo por `CreateLiveSaleSchemaBase`, opcional. Si no se envía, el servicio lo fija en `pending`. |
| `POST /api/v1/sales/whatsapp` | Igual que el anterior, con `CreateWhatsappSaleDtoSchema`. |
| `PATCH /api/v1/sales/:id/status` | **Único** punto del sistema donde se modifica el estado. El DTO es `z.object({ status: z.enum([...]) }).strict()`. |
| `GET /api/v1/sales` | Filtro opcional `?status=pending`, `?status=completed` o `?status=cancelled`, validado por `SalesQuerySchema`. |
| `GET /api/v1/sales/:id` | Devuelto en la respuesta. |
| Frontend | Insignia de color en la columna "Estado" del listado de ventas. Colores en `modules/frontend/02-design.md`: `success` para `completed`, `warning` para `pending`, `text-muted` sobre `bg-muted` para `cancelled`. |

## Transiciones

El enum es un conjunto de valores, no un grafo de transiciones. **Cualquier transición es válida, con una sola excepción**: desde `cancelled` no hay ninguna.

| Transición | Permitida | Razón |
|------------|-----------|--------|
| `pending` → `completed` | Sí | Flujo normal. |
| `pending` → `cancelled` | Sí | Venta que no se concretó. |
| `completed` → `pending` | Sí | Se cobró y vuelve a pendiente: el cobro se borra y hay que cobrar de nuevo. |
| `completed` → `cancelled` | Sí | Corregir una venta recién cobrada. Bloquear esto dejaba grabada una venta con el importe equivocado para siempre, sin nota de crédito que la corrigiera. |
| `completed` → `completed` | Sí | Sin efecto, responde `200` con el detalle. |
| `cancelled` → cualquiera | **No** | `cancelled` es definitiva. `409 CONFLICT` y la venta sigue `cancelled`. |

La decisión es práctica: el sistema tiene un solo usuario y no hay concurrencia entre operadores, así que la regla general es que cualquier transición sea válida. Un sistema de transiciones válidas impediría corregir un error de tipeo sin acceso a la base de datos. La excepción es `cancelled` porque es el único estado que afirma algo que no se puede deshacer —que la operación no ocurrió— y porque una venta que no ocurrió no puede volver a ser una venta que ocurrió.

`cancelled` → `cancelled` tampoco se permite: no es un no-op inofensivo, es una transición desde `cancelled`, y la regla no admite ninguna. Quien necesite el dato lo pide con un `GET`.

La regla vive en el servicio de ventas (`sales.service.ts`), no en la presentación: el panel deja el selector de estado inerte en las filas canceladas, pero un cliente que llame la API tiene que encontrar el mismo rechazo.

## Relación con las agregaciones

`sale_status` **sí** filtra los agregados del dashboard, y por el mismo motivo por el que es un estado de ida. `total_revenue` y `sales_count` incluyen las ventas `pending` y `completed` no borradas lógicamente; una venta `cancelled` **no** cuenta en ninguna de las dos cifras, y sus artículos adicionales tampoco. La razón está argumentada en la decisión D-008, revertida en su parte del filtro por estado el 2026-10-04.

Que salga de las dos cifras y no solo del importe es deliberado: un panel que dice "ingresos de 5 ventas" con dos que no se cobraron está mintiendo en la misma línea.

`pending` no se excluye: una venta pendiente puede cobrarse hoy, y contarla es lo que hace que el número cuadre con la caja.

## Por qué el estado se cambia en un endpoint aparte

Existe `PATCH /api/v1/sales/:id/status` y **no** existe `PUT /api/v1/sales/:id` ni un `PATCH /api/v1/sales/:id` general. Dos razones:

1. **El cobro es inmutable.** Una vez que la dueña registra una venta, el importe cobrado y los artículos entregados ya no se editan. Si se pudiera, el total derivado podría dejar de corresponder a lo que el cliente pagó. La forma de cancelar es cambiar el estado a `cancelled`.
2. **Un endpoint de una sola intención es más simple de usar.** El formulario del panel tiene una acción de una sola cosa: "cambiar el estado". No hay que decidir qué campos se envían.

Como consecuencia, el conjunto de operaciones sobre una venta es: crear, leer, listar y cambiar de estado. No hay edición parcial ni eliminación directa.
