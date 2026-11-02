# `additional_sale` — Artículo adicional

## Propósito

Registra una prenda u objeto que se entrega como parte de una venta por WhatsApp y que se cobra por separado del importe principal. Es el único detalle del modelo que pertenece a otra entidad, y existe únicamente para que el total de una venta pueda ser mayor que su `cost`.

**Solo puede pertenecer a una venta de tipo `whatsapp`.** Una venta en mostrador no admite artículos adicionales, y la API rechaza el payload con `400 BAD_REQUEST`.

## Tabla

| Columna | Tipo Drizzle | Tipo SQL | Nulo | Por defecto | Notas |
|---------|--------------|----------|------|-------------|-------|
| `id` | `uuid("id").primaryKey()` | `UUID` | No | — | Clave primaria. El UUID lo genera la aplicación. |
| `sale_id` | `uuid("sale_id")` | `UUID` | No | — | Clave foránea a `sale.id`. |
| `name` | `text("name")` | `TEXT` | No | — | Nombre del artículo, texto libre. Cota de 200 caracteres en Zod. |
| `description` | `text("description")` | `TEXT` | **Sí** | `NULL` | Detalle opcional: talla, color, estado. Cota de 500 caracteres en Zod. |
| `quantity` | `integer("quantity").default(1)` | `INTEGER` | No | `1` | Cantidad de piezas iguales. Mínimo 1, garantizado por `CHECK`. |
| `total` | `numeric("total", { precision: 10, scale: 2 })` | `DECIMAL(10,2)` | No | — | **Importe total del renglón**, no el precio unitario. Con `quantity = 3` y total `"900.00"`, son tres piezas por `300.00` cada una. |
| `created_at` | `timestamp("created_at", { precision: 3 }).default(CURRENT_TIMESTAMP)` | `TIMESTAMP(3)` | No | `CURRENT_TIMESTAMP` | Auditoría. |
| `updated_at` | `timestamp("updated_at", { precision: 3 }).$onUpdate(() => new Date())` | `TIMESTAMP(3)` | No | — | Auditoría. |
| `deleted_at` | `timestamp("deleted_at", { precision: 3 })` | `TIMESTAMP(3)` | **Sí** | `NULL` | Borrado lógico (decisión D-004). |

### Restricciones `CHECK`

```sql
CONSTRAINT "additional_sale_total_non_negative" CHECK ("total" >= 0)
CONSTRAINT "additional_sale_quantity_min" CHECK ("quantity" >= 1)
```

Se declaran con `check()` en `src/db/schema/sales.ts` y viajan al SQL de la migración generada.

### `total` es por renglón, no unitario

Esta es la convención que con más facilidad se confunde al usar el sistema, así que queda explícita:

- Si se venden **tres unidades** del mismo artículo en el mismo renglón, se crea **una** fila con `quantity: 3` y `total: "900.00"`.
- Si los tres artículos cuestan distinto, se crean **tres** filas con `quantity: 1` cada una.
- El total de la venta suma los `total` de los renglones, nunca `total × quantity`.

La razón de que `total` sea por renglón y no unitario es que en una tienda de paca el precio de cada prenda es distinto, y la cantidad solo se usa cuando se agrupan prendas idénticas en una misma descripción.

## Relaciones

### Pertenece a una venta

La columna propietaria es `additionalSale.saleId`, declarada con `foreignKey({ name: "additional_sale_sale_id_fkey", columns: [table.saleId], foreignColumns: [sale.id] }).onDelete("cascade").onUpdate("cascade")` en `src/db/schema/sales.ts`.

Relación muchos a uno, **obligatoria**. `sale_id` es `NOT NULL`: un artículo adicional sin venta no tiene sentido y no se permite.

`onDelete: Cascade` es una red de contención para el caso de una eliminación física. Como el sistema no borra ventas (decisión D-004), esta cláusula **nunca se activa en la operación normal**: cancelar una venta escribe `status`, no `deleted_at`. La cascada se documenta y se prueba para el borrado lógico explícito de paquetes y gastos. El borrado lógico en cascada es una decisión de la capa de aplicación, no del motor de base de datos.

### No referencia nada más

No hay relaciones con `package` ni con `expense`. Un paquete no se asigna a un artículo adicional: se asigna a la venta.

## Índices

| Índice | Columnas | Por qué |
|--------|----------|---------|
| `additional_sale_sale_id_idx` | `sale_id` | **Obligatorio.** Toda carga de artículos de una venta es un `WHERE sale_id = ?`, tanto en `GET /api/v1/sales/:id` como en la selección anidada de `GET /api/v1/sales`. Sin este índice, cada fila del listado dispara una búsqueda en la tabla completa. |
| `additional_sale_active_idx` | `sale_id`, parcial (`deleted_at IS NULL`) con `INCLUDE (total)` | El agregado de renglones del dashboard. Con el rango por defecto (7 días) el planificador pasa de un hash join con recorrido completo a un nested loop con *index-only scan*: 29,6 ms → 5,2 ms con 200.000 filas. **En rangos largos sigue prefiriendo el hash join**, así que su justificación es el rango corto. Parcial: no se declara en el esquema de Drizzle (ver `01-sale.md`). |

```ts
index("additional_sale_sale_id_idx").on(table.saleId),
```

**No hay índice sobre `total` ni sobre `created_at`.** El importe se agrega, no se filtra ni se ordena; `created_at` solo se usa como criterio de desempate dentro de un conjunto que ya viene acotado por `sale_id`.

## Notas

### Se crea en la misma transacción que la venta

Una venta de WhatsApp con artículos adicionales es una **única operación de negocio indivisible**. `createSaleRepository(db).createWithAdditional` ejecuta `db.transaction` y, dentro de ella:

1. Inserta la fila de `sale` con `id` y `updatedAt` generados en el código.
2. Inserta los renglones de `additional_sale` con `tx.insert(additionalSale).values(...)`, todos apuntando al `id` de la venta recién creada, y los devuelve con `.returning()`.
3. No hace falta una relectura: los renglones insertados se devuelven en la misma sentencia.

Si la creación de cualquier renglón falla, PostgreSQL revierte la transacción completa y **no queda ninguna venta huérfana**. Este es el comportamiento que garantiza que el total derivado nunca se base en artículos que no existen.

### La invariante de tipo de venta

La tabla no puede verificar por sí sola que su venta sea de tipo `whatsapp`: eso requeriría un disparador en PostgreSQL o una clave foránea compuesta. La garantía vive en dos lugares de la aplicación:

| Ubicación | Mecanismo |
|-----------|-----------|
| `presentation/sales.dto.ts` | `CreateLiveSaleDtoSchema` es `.strict()`, así que la clave `additional_items` en el payload de una venta `live` produce `ZodError` y por tanto `400`. |
| `application/sales.service.ts` | `createLive` lanza `new BadRequestError("Live sales cannot include additional items")` si por cualquier vía se cuela la lista. |

Esta duplicación es intencional: la primera es una comprobación de formato en el borde, la segunda es una invariante de dominio. Si alguien agrega un cliente nuevo que no pase por el DTO, la segunda sigue protegiendo la regla.

### Sin endpoint propio

`additional_sale` **no tiene rutas propias**. No existe `GET /api/v1/sales/:id/additional-items` ni nada equivalente. Los artículos se crean exclusivamente junto con la venta, se leen exclusivamente anidados en `GET /api/v1/sales/:id` y se modifican exclusivamente con `PATCH /api/v1/sales/:id/status`, que no los toca.

El motivo es la inmutabilidad del cobro: si un artículo se pudiera modificar o borrar por separado, el total que ya se cobró dejaría de corresponder a lo que el cliente recibió. La forma de cancelar una venta con artículos es cambiar su estado a `cancelled`: los artículos quedan intactos y visibles en el detalle, y salen de los agregados del dashboard junto con la venta.
