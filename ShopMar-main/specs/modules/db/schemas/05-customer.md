# `customer` — Cliente

## Propósito

El cliente registrado de la tienda. Existe porque una **venta a crédito** necesita un sujeto al que
deberle plata y una cuenta por cobrar que se pueda mirar por cliente (D-022). Sin cliente registrado,
dos «María González» son el mismo renglón y no hay forma de saber quién debe.

**El nombre en la venta sigue siendo texto.** `sale.customer_name` es una **instantánea** del nombre al
momento de la venta y no se actualiza cuando el cliente se renombra: la factura de una venta vieja
imprime lo que decía el día que se emitió. `sale.customer_id` es la referencia viva, y **toda venta
nueva la lleva**: cuando el alta trae sólo el nombre, el servicio reutiliza el cliente vivo con ese
nombre —recortado y sin distinguir mayúsculas— o lo crea (S18). La referencia **nula** queda sólo para
las ventas registradas antes de ese cambio, que se siguen leyendo igual.

## Tabla

| Columna | Tipo Drizzle | Tipo SQL | Nulo | Por defecto | Notas |
|---------|--------------|----------|------|-------------|-------|
| `id` | `uuid("id").primaryKey()` | `UUID` | No | — | Clave primaria. El UUID lo genera la aplicación. |
| `name` | `text("name")` | `TEXT` | No | — | Nombre del cliente. Cota de 200 caracteres en Zod. |
| `phone` | `text("phone")` | `TEXT` | **Sí** | `NULL` | Teléfono tal como lo escribe la dueña. Cota de 30 caracteres en Zod. Sin formato impuesto. |
| `note` | `text("note")` | `TEXT` | **Sí** | `NULL` | Nota libre. Cota de 500 caracteres en Zod. |
| `created_at` | `timestamp("created_at", { precision: 3 }).default(CURRENT_TIMESTAMP)` | `TIMESTAMP(3)` | No | `CURRENT_TIMESTAMP` | Auditoría. |
| `updated_at` | `timestamp("updated_at", { precision: 3 }).$onUpdate(() => new Date())` | `TIMESTAMP(3)` | No | — | Auditoría. Se escribe en cada `update`, no tiene default en la base. |
| `deleted_at` | `timestamp("deleted_at", { precision: 3 })` | `TIMESTAMP(3)` | **Sí** | `NULL` | Borrado lógico (decisión D-004). Borrar un cliente **no** borra sus ventas. |

### Índices

| Índice | Columnas | Predicado | Para qué |
|--------|----------|-----------|----------|
| `customer_pkey` | `id` | — | Búsqueda por identificador. |

**No hay índice sobre `name` ni sobre `phone`.** La búsqueda del alta (`q`) es un `ILIKE '%texto%'`
que un índice B-tree no puede usar, y la tabla es del tamaño de los clientes de una tienda de paca: unos
cientos de filas. Un índice trigram sería la respuesta correcta si algún día la tabla crece; agregarlo
hoy sería escritura extra en cada alta a cambio de nada. Mismo criterio que `payment_method` en el enum
03.

**No hay restricción de unicidad.** Ni el nombre ni el teléfono identifican a una persona: una familia
comparte teléfono y dos clientes pueden llamarse igual. Un `UNIQUE` sobre `phone` rompería el alta en el
mostrador, que es exactamente lo que esta tabla viene a facilitar.

## Relaciones

### Customer tiene muchas sale

La columna propietaria es `sale.customer_id`, con
`foreignKey({ name: "sale_customer_id_fkey", columns: [table.customerId], foreignColumns: [customer.id] }).onDelete("restrict").onUpdate("cascade")`.

`restrict` es deliberado: **una fila de `customer` nunca se borra físicamente** (D-004), y si alguna vez
alguien intenta un `DELETE` físico, la base lo frena en vez de dejar ventas huérfanas. El borrado real
es lógico y lo resuelve la aplicación.

### Lo que esta tabla no referencia

Nada. El cliente no depende de ninguna otra tabla.

## Reglas de negocio que la tabla no puede expresar sola

| Regla | Dónde vive |
|-------|------------|
| Una venta a crédito queda enlazada a un cliente | El `customer_id` es obligatorio en la fila: `CHECK sale_credito_exige_cliente` en `sale`. El alta exige **uno de los dos** identificadores —`customer_id` o el nombre escrito— en el `superRefine` del DTO; el nombre se resuelve o se crea antes de insertar, así que la columna nunca queda nula (S29). |
| Una venta con `customer_name` resuelve o crea el cliente | Servicio de `sales`: busca con `findAll({ name })` —nombre recortado, `lower(name) = lower(nombre)`— y, si no hay cliente vivo, llama al `create` del repositorio de `customers` (S18). |
| Una venta de contado **sin** `customer_name` ni `customer_id` no toca el padrón (S63) | El servicio guarda `customer_name = "Consumidor Final"` (`GENERIC_CUSTOMER_NAME`) con `customer_id NULL` y no llama ni a `findAll` ni a `create`: el cliente genérico no es una fila. Con `payment_terms: "credit"` esa rama no existe —el cuerpo tiene que traer uno de los dos—, porque una deuda sin cliente no tiene a quién cobrarle. |
| Un cliente con saldo pendiente no se puede borrar lógicamente | Servicio de `customers`: `409` con el nombre del cliente. |
| Borrar un cliente no toca sus ventas | Borrado lógico del cliente: `sale.customer_id` sigue apuntando a una fila con `deleted_at`. La factura sigue imprimiendo `sale.customer_name`. |
| El teléfono se puede cargar desde el formulario de venta | Servicio de ventas (S23): `customer_phone` en el alta completa el teléfono que faltaba y reemplaza el que había, porque el número escrito a propósito gana. |
