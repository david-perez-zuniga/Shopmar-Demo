# Módulo de base de datos

PostgreSQL 16 o superior, accedido con Drizzle mediante `drizzle-kit` para las migraciones (decisión D-016). Siete tablas, ocho enumeraciones y los índices que necesitan las consultas reales (los cubrientes y los parciales viven como SQL a mano porque `drizzle-kit` no los expresa). El modelo es deliberadamente pequeño porque el negocio lo es: una tienda de paca necesita registrar ventas, artículos adicionales que acompañan a una venta por WhatsApp, los pagos de una venta a crédito, el cliente al que se le fía y los gastos. Las dos tablas restantes —`user` y `session`— no son del negocio: son el acceso al panel (D-024).

## Archivos

| Archivo | Contenido |
|---------|-----------|
| `setup.md` | Motor, cadena de conexión, flujo de migraciones, seeds y comandos. |
| `schemas/README.md` | Índice de las siete tablas y reglas transversales del esquema. |
| `schemas/01-sale.md` | La venta: campos, índices, relaciones, invariantes. |
| `schemas/02-additional_sale.md` | Artículo adicional de una venta por WhatsApp. |
| `schemas/03-package.md` | Paquete retirado, con enlace opcional a su venta. |
| `schemas/04-expense.md` | Gasto diario, sin relaciones. |
| `schemas/05-customer.md` | Cliente registrado: nombre, teléfono, nota y borrado lógico. |
| `schemas/06-sale_payment.md` | Libro de pagos de una venta: monto aplicado, fecha y forma de pago. |
| `schemas/07-auth.md` | `user` y `session`: cuenta con rol, hash `scrypt` y sesión sin vencimiento (D-024). |
| `schemas/index.md` | El modelo completo en un archivo y el resumen de relaciones. |
| `enums/README.md` | Las ocho enumeraciones y dónde se usa cada una. |
| `enums/01-sale_type.md` | `live`, `whatsapp`. |
| `enums/02-sale_status.md` | `pending`, `completed`, `cancelled`. |
| `enums/03-payment_method.md` | `cash`, `credit_card`. |
| `enums/04-package_method.md` | `cargotrans`, `delivery`, `retiro` (enum retirado con la tabla `package`). |
| `enums/05-payment_terms.md` | `immediate`, `credit`. |
| `schemas/07-auth.md` (enum `user_role`) | `seller`, `admin`. Vive con sus dos tablas porque no lo usa ninguna tabla de negocio. |
| `use-cases/README.md` | Índice de los flujos de negocio. |
| `use-cases/01-registrar-venta-live.md` | Alta de venta en mostrador. |
| `use-cases/02-registrar-venta-whatsapp-con-adicionales.md` | Alta de venta con artículos adicionales, en transacción. |
| `use-cases/03-actualizar-estado-venta.md` | Cambio de estado. |
| `use-cases/04-registrar-paquete-retirado.md` | Alta de paquete, con enlace opcional a venta. |
| `use-cases/05-registrar-gasto-diario.md` | Alta y borrado lógico de un gasto. |
| `use-cases/06-consultar-kpis-del-dashboard.md` | Las agregaciones del período, incluidos cobrado y por cobrar. |
| `use-cases/07-registrar-venta-a-credito.md` | Alta de una venta fiada, con cliente y vencimiento. |
| `use-cases/08-registrar-pago-de-venta.md` | Registro y borrado de pagos, con saldo y cierre automático. |

## Convenciones del esquema

Estas reglas se aplican a las siete tablas y son la base de las decisiones D-003, D-004 y D-024.

| Convención | Detalle |
|------------|---------|
| Nombre de tabla | Minúsculas y en singular: `sale`, `additional_sale`, `customer`, `expense`, `user`, `session`. |
| Nombre de columna | `snake_case`. |
| Clave primaria | `id` de tipo `UUID`, generado por la aplicación (ninguna columna `id` tiene default en la base). |
| Marcas de tiempo | `created_at` con default `CURRENT_TIMESTAMP`, `updated_at` escrito por la aplicación (`$onUpdate`), `deleted_at` opcional. |
| Zona horaria | `timestamp(..., { withTimezone: true, precision: 3 })` en todas las fechas de negocio. Precisión de milisegundos, con zona horaria explícita. |
| Importe | `numeric(..., { precision: 10, scale: 2 })`. Máximo `99999999.99`, dos decimales exactos. |
| Texto libre | `String` de PostgreSQL (`TEXT`) para nombres y descripciones. Sin longitudes fijas en la base; la cota vive en los esquemas de Zod. |
| Borrado | Lógico. Columna `deleted_at` y filtro `deleted_at: null` en toda lectura. |
| Enumeraciones | Nombres en minúsculas y singular: `sale_type`, `sale_status`, `payment_method`, `payment_terms`, `user_role`. |
| Índices | Comunes, no únicos, salvo que una restricción de integridad exija unicidad (`user.username`, `user.email`, `session.token_hash`). |
| Restricciones `CHECK` | `drizzle-kit generate` no las deduce solo; se declaran con `check()` en el esquema de Drizzle y generan el `CHECK` en el SQL de la migración. |

## Modelo en una línea

```
expense  (independiente)

package ──(opcional, SetNull)──► sale ──(Cascade)──► additional_sale

user ──(Cascade)──► session        (acceso al panel, fuera del negocio)
```

`package` y `expense` son tablas independientes. `sale` es la raíz de la operación comercial. `additional_sale` es el único detalle que pertenece a otra entidad, y solo puede colgar de una venta de tipo `whatsapp`. `user` y `session` forman un árbol aparte que ninguna tabla de negocio referencia.

## Lo que este módulo no tiene

| Ausencia | Motivo |
|----------|--------|
| Tabla de productos | La mercadería es texto libre. Decisión D-002. |
| Tabla de servicios | No se venden servicios. |
| Movimientos de inventario | No hay control de stock. Decisión D-002. |
| Tabla de roles | El rol es una columna (`user.role`) de un conjunto cerrado de dos valores. Decisión D-024. |
| Tabla de Refresh tokens | El token es opaco y la sesión no se renueva: no hay nada que refrescar. Decisión D-024. |
| Columna de vencimiento en `session` | La sesión solo termina con el logout (`revoked_at`). Decisión D-024. |
| Columna `user_id` en las tablas de negocio | No hay auditoría de actor: los datos son de la tienda, no de quien los cargó. Decisión D-024. |
| Columna `sale.total` | El total es derivado. Decisión D-003. |
| Columna `package.status` | Un paquete no tiene estado en la versión 1. Decisión D-007. |
| Tabla de artículos o de Prendas | No hay catálogo. Decisión D-002. |

El andamiaje de `fwinit` traía siete tablas —`role`, `user`, `session`, `product`, `service`, `inventory_movement` y una más— que la versión 1 redujo a cuatro. D-024 devolvió dos de ellas, `user` y `session`, **con otro esquema**: sin tabla `role`, sin `refresh_token` y sin `expires_at`. Hoy el modelo tiene siete tablas: cinco de negocio (`sale`, `additional_sale`, `sale_payment`, `customer` y `expense`) y dos de acceso (`user` y `session`). El detalle de la retirada original está en `specs/tasks/db/01-migracion-al-modelo-de-dominio.md`.

## Estado actual del código

`backend/src/db/schema/sales.ts` declara las tablas `sale`, `additional_sale` y `sale_payment` con sus enums nativos, `customers.ts` declara `customer`, `expenses.ts` declara `expense` y `auth.ts` declara `user`, `session` y el enum `user_role`; `index.ts` los reexporta. Los índices cubrientes viven como SQL escrito a mano en `backend/drizzle/*indices_cubrientes/`.
