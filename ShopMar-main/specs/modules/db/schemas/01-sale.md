# `sale` — Venta

## Propósito

La venta es la entidad central del sistema. Registra una operación de venta con su canal de origen, su cliente, la mercadería en texto libre, la forma de pago, la fecha, el estado y el importe del artículo principal. De ella cuelgan los artículos adicionales que solo puede tener una venta de WhatsApp, y de ella puede colgar un paquete de salida.

**La tabla `sale` no tiene columna `total`.** El total de la venta es un valor derivado: `sale.cost + SUM(additional_sale.total)`. Es la invariante central del modelo y la razón por la que existe un módulo de aplicación que la calcula. Ver la decisión D-003.

## Tabla

| Columna | Tipo Drizzle | Tipo SQL | Nulo | Por defecto | Notas |
|---------|--------------|----------|------|-------------|-------|
| `id` | `uuid("id").primaryKey()` | `UUID` | No | — | Clave primaria. El UUID lo genera la aplicación. |
| `type` | `saleType("type")` | `sale_type` | No | — | Enum. `live` o `whatsapp`. Determina si admite artículos adicionales. |
| `customer_name` | `text("customer_name")` | `TEXT` | No | — | Nombre del cliente. Texto libre. Cota de 200 caracteres en Zod. |
| `customer_id` | `uuid("customer_id")` | `UUID` → `customer.id` | **Sí** | `NULL` | Cliente registrado. **Obligatorio** en una venta a crédito. En una de contado el cuerpo puede no traerlo, y entonces el servicio resuelve o crea el cliente con el nombre escrito (S18) y la fila queda con `customer_id` cargado. Desde S63 una venta de contado puede no llevar cliente en absoluto: ahí queda `customer_id NULL` y `customer_name` lleva el genérico «Consumidor Final», **sin crear fila en `customer`**. Las ventas a crédito siguen exigiendo un cliente real. La factura sigue imprimiendo `customer_name`, que es la instantánea del nombre (D-022). |
| `payment_terms` | `paymentTerms("payment_terms")` | `payment_terms` | No | `immediate` | Enum. `immediate` (contado) o `credit` (crédito). Decide si la venta se cobra por el endpoint de estado o por el libro de pagos. |
| `due_date` | `timestamp("due_date", { withTimezone: true, precision: 3 })` | `TIMESTAMP(3) WITH TIME ZONE` | **Sí** | `NULL` | Fecha de pago prometida. Obligatoria con `credit`, prohibida con `immediate`. Es la que hace que una venta esté vencida: `is_overdue` se calcula, no se guarda. |
| `product_name` | `text("product_name")` | `TEXT` | No | — | Mercadería principal, **texto libre**. No hay catálogo (decisión D-002). Cota de 200 caracteres en Zod. |
| `category` | `saleCategory("category").array()` | `sale_category[]` | No | — | **Lista** del enum, **sin repetidos**. La unicidad vive en Zod. Desde S47 es **opcional en el alta**: cuando el cuerpo no la manda, el repositorio escribe un **arreglo vacío**, que es lo que satisface el `NOT NULL` de la columna —por eso no hubo migración—. Las filas ya guardadas conservan sus categorías. La migración original va escrita a mano porque `drizzle-kit` no detecta cambios de dimensiones en columnas enum, y `scripts/verify-schema.sql` (sección 2b) guarda el tipo (D-021). |
| `payment_method` | `paymentMethod("payment_method")` | `payment_method` | No | — | Enum. `cash` o `credit_card`. En una venta a **crédito** guarda **`cash` sin banco** como **valor de registro**: no hubo cobro en el momento y el método real de cada abono vive en `sale_payment` (S57, D-022). |
| `payment_bank` | `text("payment_bank")` | `TEXT` | **Sí** | `NULL` | Entidad financiera de la tarjeta. Obligatorio con `credit_card`; nulo o ausente con `cash`. |
| `sale_date` | `timestamp("sale_date", { withTimezone: true, precision: 3 })` | `TIMESTAMP(3) WITH TIME ZONE` | No | — | Fecha de la operación. Por defecto el instante de la creación si no se envía. |
| `status` | `saleStatus("status")` | `sale_status` | No | `pending` | Enum. `pending`, `completed` o `cancelled`. |
| `cost` | `numeric("cost", { precision: 10, scale: 2 })` | `DECIMAL(10,2)` | No | — | Importe cobrado por el artículo principal. Máximo `99999999.99`. |
| `created_at` | `timestamp("created_at", { withTimezone: true, precision: 3 }).default(CURRENT_TIMESTAMP)` | `TIMESTAMP(3) WITH TIME ZONE` | No | `CURRENT_TIMESTAMP` | Auditoría. Es un **instante**, no un día: viaja como ISO en UTC y el navegador lo muestra en hora local (S33). |
| `updated_at` | `timestamp("updated_at", { withTimezone: true, precision: 3 }).$onUpdate(() => new Date())` | `TIMESTAMP(3) WITH TIME ZONE` | No | — | Auditoría. No tiene default en la base: la aplicación lo escribe en cada `update` (y en el `INSERT`, porque `$onUpdate` sólo corre en `update()`). |
| `deleted_at` | `timestamp("deleted_at", { withTimezone: true, precision: 3 })` | `TIMESTAMP(3) WITH TIME ZONE` | **Sí** | `NULL` | Borrado lógico (decisión D-004). |

### Restricción `CHECK` del banco

```sql
CONSTRAINT "sale_payment_bank_check" CHECK (
  ("payment_method" = 'credit_card' AND "payment_bank" IS NOT NULL)
  OR ("payment_method" = 'cash' AND "payment_bank" IS NULL)
)
```

La restricción se declara con `check()` en `src/db/schema/sales.ts` y viaja al SQL de la migración generada. Es la defensa en profundidad de la regla que valida Zod con `superRefine`.

### Restricción `CHECK` de importe

```sql
CONSTRAINT "sale_cost_check" CHECK ("cost" >= 0)
```

## Relaciones

### Sale tiene muchos additional_sale

La columna propietaria es `additionalSale.saleId`, declarada con `foreignKey({ name: "additional_sale_sale_id_fkey", columns: [table.saleId], foreignColumns: [sale.id] }).onDelete("cascade").onUpdate("cascade")` en `src/db/schema/sales.ts`. El nombre de la FK se fija explícito porque el que genera Drizzle por defecto no coincide con el de la base.

**Regla de negocio que la relación no puede expresar por sí sola:** solo las ventas de tipo `whatsapp` pueden tener artículos adicionales. Una venta `live` con artículos devuelve `400 BAD_REQUEST` en la API, y el módulo de aplicación no crea esa combinación. La base de datos no puede verificarlo con una `CHECK` de una sola tabla; la garantía vive en la capa de aplicación y en el `.strict()` del DTO, que rechaza el campo entero.

### Sale pertenece a un customer (opcional)

La columna propietaria es `sale.customer_id`, con
`foreignKey({ name: "sale_customer_id_fkey", columns: [table.customerId], foreignColumns: [customer.id] }).onDelete("restrict").onUpdate("cascade")`.
Es **opcional**: las ventas de contado y todas las ventas anteriores a la versión con crédito no tienen
cliente registrado, y no se migraron (D-022).

### Lo que esta tabla no referencia

No hay clave foránea a ninguna otra tabla de negocio más que `customer`. En particular **no hay `user_id`**: no se registra quién cargó la venta, y la autenticación no dejó dueño en las tablas de negocio (D-024). No hay `product_id`: la mercadería es texto libre (decisión D-002).

## Índices

| Índice | Columnas | Por qué |
|--------|----------|---------|
| `sale_sale_date_idx` | `sale_date` | Es el filtro y el orden por defecto de `GET /api/v1/sales` y de las agregaciones del dashboard. |
| `sale_type_idx` | `type` | Filtro del listado de ventas por canal. |
| `sale_status_idx` | `status` | Filtro del listado de ventas por estado. |
| `sale_deleted_at_idx` | `deleted_at` | **En toda consulta.** Es la condición `deleted_at: null`, y sin índice PostgreSQL recorre la tabla completa. |
| `sale_active_date_idx` | `sale_date`, parcial (`deleted_at IS NULL AND status <> 'cancelled'`) con `INCLUDE (cost)` | **El dashboard entero.** Es el predicado compartido por sus cinco endpoints y resuelve el `SUM(cost)` como *index-only scan*, sin visitar el heap. |
| `sale_active_shipment_idx` | `shipment_method, sale_date`, parcial (`deleted_at IS NULL AND status <> 'cancelled'`) | **El agregado por método de envío.** Lo comparten `GET /api/v1/dashboard/packages/kpis` y `GET /api/v1/sales?include_kpis=true` (D-012). Resuelve el `GROUP BY shipment_method` como *index-only scan*; con rango de fechas, el `sale_date` de la clave entra como condición del índice. Medido con 5.000 ventas: 2,4 ms y 96 buffers pasan a 1,5 ms y 20 buffers sin fechas, y a 0,85 ms con el rango. |
| `sale_customer_id_idx` | `customer_id` | Cuentas por cobrar de un cliente y el chequeo de borrado del cliente. |
| `sale_por_cobrar_idx` | `due_date`, parcial (`deleted_at IS NULL AND status <> 'cancelled' AND payment_terms = 'credit'`) | **La lista de cuentas por cobrar y el agregado de vencidos.** Sólo contiene las filas con deuda posible, así que es mucho más chico que un índice completo sobre `due_date`. Se escribe a mano, como los otros parciales. |
| `sale_list_idx` | `sale_date DESC, created_at DESC, id DESC`, parcial (`deleted_at IS NULL`) con `INCLUDE (cost)` | El orden por defecto del listado, que es `sale_date` descendente y, dentro del mismo día, hora de registro descendente (S32). La clave del índice replica el `ORDER BY` completo —incluido `created_at`, que antes no estaba— porque con `(sale_date, id)` el planificador tenía que ordenar en memoria todas las filas del mismo día. Sin él PostgreSQL escanea y ordena (`top-N heapsort`); con él recorre el índice y no hay nodo `Sort`. |

Declaración en Drizzle:

```ts
index("sale_sale_date_idx").on(table.saleDate),
index("sale_type_idx").on(table.type),
index("sale_status_idx").on(table.status),
index("sale_deleted_at_idx").on(table.deletedAt),
```

**Los índices con `INCLUDE` no se declaran en el esquema, deliberadamente.** `drizzle-kit generate` no expresa `INCLUDE`, así que `sale_active_date_idx`, `sale_active_shipment_idx` y `sale_list_idx` viven únicamente en una migración como SQL escrito a mano —los dos primeros en `backend/drizzle/*indices_cubrientes/`, y `sale_list_idx` además recreado en `backend/drizzle/*sale_list_idx_orden/` cuando cambió la clave (S32)—, y `scripts/verify-schema.sql` verifica que existan con sus columnas, su `INCLUDE` y su predicado. `sale_por_cobrar_idx` sí se declara con `index(...).where(sql\`...\`)` porque sólo necesita un `WHERE`; `db:verify` comprueba el predicado en la base real de todos modos. Son la respuesta al patrón de acceso real —ventas no borradas, no canceladas, ordenadas por fecha en un rango— y por eso son más chicos que un índice completo: sólo contienen las filas que esas consultas leen. Medidos con 200.000 ventas: el `SUM(cost)` de 30 días pasa de 33,6 ms a 0,95 ms y el listado de 50 filas de 35,6 ms a 0,17 ms. **`drizzle-kit push` está prohibido** porque diffea contra la base viva, no ve estos índices y los borraría (decisión D-016). El costo de escritura de un índice parcial es proporcional a las filas que incluye, y acá casi todas califican, así que `sale_type_idx` y `sale_deleted_at_idx` quedan **en revisión para dropearse** cuando `pg_stat_user_indexes` de producción muestre que no se usan.

## Notas

### El total no existe como columna

```ts
// En la respuesta, nunca en la tabla:
total = sale.cost + SUM(additional_sale.total)
```

La cadena completa de cálculo:

1. `GET /api/v1/sales` trae el `cost` de la venta y el `total` de cada renglón de `additional_sale` en la **misma** consulta (`leftJoin` explícito), sin una segunda vuelta a la base.
2. `mapSaleListRow` suma con `sumMoney([cost, ...adicionales])` de `src/core/money/money.ts`, que usa `new Decimal(a).plus(b)` de `decimal.js`.
3. El resultado se serializa con `toFixed(2)` y viaja como **cadena decimal** en la respuesta JSON.

El total **no se puede ordenar ni filtrar en SQL**, porque no está en la base. El listado se ordena por `sale_date` descendente, después por `created_at` descendente y por último por `id` descendente como desempate único. Ver decisión D-003.

### Soft delete

`deleted_at` es `NULL` en toda venta viva.

**Cancelar una venta no la borra.** `PATCH /api/v1/sales/:id/status` a `cancelled` escribe `status`, no `deleted_at`: no existe forma de dar de baja una venta desde el sistema, porque el borrado lógico de ventas no es una operación del negocio. Ver `use-cases/03-actualizar-estado-venta.md`.

La cascada en `additional_sale` sigue documentada y probada para el caso de un borrado lógico explícito, que es lo que hacen los paquetes y los gastos. Ver la decisión D-004.

Aunque nada se borra físicamente, la relación `additional_sale.sale_id` declara `onDelete: Cascade`. Es una red de contención: si alguna vez una eliminación física se ejecutara (por ejemplo, una restauración manual de una base desde un respaldo), los artículos adicionales no quedarían huérfanos apuntando a una venta inexistente.

### Estado con una transición prohibida

`sale_status` es un enum abierto, no una máquina de estados: cualquier transición es válida **salvo las que salen de `cancelled`**. El motivo es práctico: la dueña necesita poder corregir un estado mal tipeado sin intervención técnica, y un sistema de un solo usuario no tiene el volumen de concurrencia que exigiría un control de transiciones.

Hay una segunda excepción, que no depende del estado sino de la condición de pago: sobre una venta con
`payment_terms = 'credit'`, `PATCH /api/v1/sales/:id/status` sólo acepta `cancelled`. Las transiciones a
`completed` y a `pending` se rechazan con `409` porque el estado de cobro de una venta a crédito lo
deciden los pagos, no el selector del listado (D-022).

La excepción es `cancelled`, y no arbitraria: es el único estado que afirma algo que no se puede deshacer. `pending -> completed` y `completed -> pending` siguen permitidos, y `completed -> cancelled` también, porque una venta cobrada y revertida es plata que de verdad entró. Ver `enums/02-sale_status.md` y `use-cases/03-actualizar-estado-venta.md`.

### Nombre de cliente

`customer_name` es un texto libre y **no tiene índice**. No hay búsqueda de ventas por cliente en ningún
endpoint de la versión 1. La búsqueda por nombre vive en `GET /api/v1/customers`, sobre la tabla
`customer`, no acá.

`customer_name` es además una **instantánea**: cuando la venta referencia un `customer_id`, el servidor
copia el nombre del cliente en la venta al crearla y **no lo actualiza** si el cliente se renombra. La
factura de una venta vieja sigue diciendo lo que decía el día que se emitió, que es lo que un comprobante
tiene que hacer.
