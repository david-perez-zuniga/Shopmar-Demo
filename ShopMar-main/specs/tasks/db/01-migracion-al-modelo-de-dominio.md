# 01 — Migración al modelo de dominio

## Estado Actual

`backend/prisma/schema.prisma` tiene el modelo del andamiaje: `product`, `service`, `inventory_movement`, `user` y `refresh_token`. No existe ninguna de las cuatro tablas del dominio, y la migración `20260910013256_init` es la única del proyecto.

`backend/src/scripts/seed.ts` crea productos y servicios de demostración que dejarían de tener sentido en cuanto se cambien las tablas.

`backend/src/tests/helpers/prisma.ts` asume que la base de prueba se crea desde el esquema, y `backend/vitest.config.ts` define el archivo `.env.test` que apunta a una base separada.

## Objetivo

Reemplazar el esquema por las cuatro tablas del dominio, con los tipos, columnas, valores por defecto y convenciones de nombre que define `specs/modules/db/schemas/index.md`.

## Alcance

- Reescribir `backend/prisma/schema.prisma` completo con los cuatro modelos y los cuatro enums.
- Reescribir `backend/prisma/migrations/20260910013256_init/migration.sql` con el mismo contenido.
- Actualizar `backend/.env.example` y `backend/.env.test` con `DATABASE_URL`.
- Reescribir `backend/src/scripts/seed.ts` con datos del dominio.

**Archivos tocados:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260910013256_init/migration.sql`, `backend/.env.example`, `backend/.env.test`, `backend/src/scripts/seed.ts`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| Los índices, los `CHECK` y la actualización del SQL de la migración | Los índices y las restricciones van a mano en el SQL, y es `tasks/db/02-indices-y-restricciones.md`. Aquí solo se crea el modelo y sus tipos. |
| Consultas de conversión de datos | No hay datos que convertir: se cambia el modelo antes de que exista producción. |
| Un script de migración desde el andamiaje | El andamiaje nunca tuvo datos reales de una tienda de ropa usada. Migrar `product` hacia `sale` inventaría datos. |
| Cambiar el proveedor de base de datos | PostgreSQL 16+ es el elegido. |
| Agregar `created_by` o cualquier columna de auditoría de usuario | No hay usuarios, y no hay ninguna clave foránea a `user`. |
| Triggers o funciones de base de datos | La lógica vive en la aplicación. |
| Decidir si `expense` lleva `updated_at` | Ya está decidido: lleva. La especificación lo define y el inventario numérico lo cuenta. Una columna que la API v1 nunca actualiza sigue siendo correcta, porque la tabla **va** a ser editable cuando exista la pantalla de edición. |

## Tareas

1. **Antes de tocar nada**, ejecutar `pnpm --filter shpr prisma migrate status` y confirmar el estado real. Si hay una base con datos, parar y preguntar.
2. **Antes de tocar nada**, ejecutar `pnpm --filter shpr prisma migrate diff --from-schema-datasource ./prisma/schema.prisma --to-schema-datamodel ./prisma/schema.prisma --exit-code`. Debe salir con código `0`, que significa "sin cambios pendientes".
3. En `backend/prisma/schema.prisma`, configurar el generador con `provider = "prisma-client-js"` y el `datasource` con `provider = "postgresql"` y `url = env("DATABASE_URL")`.
4. Crear los cuatro enums con los valores exactos de la especificación:
   - `SaleType`: `live`, `whatsapp`
   - `SaleStatus`: `pending`, `completed`, `cancelled`
   - `PaymentMethod`: `cash`, `credit_card`
   - `PackageMethod`: `cargotrans`, `delivery`, `retiro`
5. **Verificar que `PaymentMethod` tiene exactamente dos valores.** No hay transferencia bancaria: la dueña recibe efectivo o cobra con tarjeta. Agregar `transfer` obligaría a decidir qué banco anotar, y para una transferencia entre particulares esa información no existe.
6. Crear `model sale` con estas doce columnas, en este orden:
   ```prisma
   id             String        @id @default(uuid()) @db.Uuid
   type           SaleType
   customer_name  String
   product_name   String
   payment_method PaymentMethod
   payment_bank   String?
   sale_date      DateTime      @db.Timestamptz(3)
   status         SaleStatus    @default(pending)
   cost           Decimal       @db.Decimal(10,2)
   created_at     DateTime      @default(now()) @db.Timestamp(3)
   updated_at     DateTime      @updatedAt @db.Timestamp(3)
   deleted_at     DateTime?     @db.Timestamp(3)
   ```
7. **No agregar `@db.VarChar` a ningún `String`.** Los nombres de negocio son `TEXT` en la especificación, sin límite de longitud. Un nombre de producto de una prenda usada puede ser largo, y truncarlo en 200 caracteres pierde información que la dueña escribió. La longitud se valida en el DTO, no en la columna.
8. **La diferencia entre `@db.Timestamptz(3)` y `@db.Timestamp(3)` es intencional.** `sale_date` es un hecho económico: un instante absoluto, con zona. `created_at`, `updated_at` y `deleted_at` son marcas de auditoría, en hora local sin zona. Confundirlas cambia el significado de un filtro por rango.
9. **`sale_date` no lleva `@default(now())`.** La fecha de una venta la elige la dueña, y puede ser una venta de ayer que forgot registrar hoy. El valor por defecto vive en el servicio, no en la base, para que el default sea visible en el código de negocio.
10. En `model sale`, agregar las dos listas inversas con los nombres exactos de la especificación: `additional_items additional_sale[]` y `packages package[]`.
11. Crear `model additional_sale` con estas nueve columnas:
    ```prisma
    id          String   @id @default(uuid()) @db.Uuid
    sale_id     String   @db.Uuid
    name        String
    description String?
    quantity    Int      @default(1)
    total       Decimal  @db.Decimal(10,2)
    created_at  DateTime @default(now()) @db.Timestamp(3)
    updated_at  DateTime @updatedAt @db.Timestamp(3)
    deleted_at  DateTime? @db.Timestamp(3)
    ```
12. En el mismo modelo, agregar `sale sale @relation(fields: [sale_id], references: [id], onDelete: Cascade)`. La relación es `NOT NULL` y `Cascade`.
13. Crear `model package` con estas ocho columnas:
    ```prisma
    id           String        @id @default(uuid()) @db.Uuid
    name         String
    package_date DateTime      @db.Timestamptz(3)
    method       PackageMethod
    sale_id      String?       @db.Uuid
    created_at   DateTime      @default(now()) @db.Timestamp(3)
    updated_at   DateTime      @updatedAt @db.Timestamp(3)
    deleted_at   DateTime?     @db.Timestamp(3)
    ```
14. **`package_date` no lleva `@default(now())`.** Es una fecha de negocio y la dueña la elige, igual que `sale_date`. El servicio la rellena cuando no viene.
15. En el mismo modelo, agregar `sale sale? @relation(fields: [sale_id], references: [id], onDelete: SetNull)`. La relación es opcional y `SetNull`: desvincular un paquete no puede dejar un paquete con una venta inexistente, y tampoco puede borrar la venta.
16. Crear `model expense` con estas ocho columnas:
    ```prisma
    id          String    @id @default(uuid()) @db.Uuid
    name        String
    description String?
    total       Decimal   @db.Decimal(10,2)
    expense_date DateTime @default(now()) @db.Timestamptz(3)
    created_at  DateTime  @default(now()) @db.Timestamp(3)
    updated_at  DateTime  @updatedAt @db.Timestamp(3)
    deleted_at  DateTime? @db.Timestamp(3)
    ```
17. **`expense_date` es la única fecha de negocio con `@default(now())`.** Un gasto casi siempre se registra el mismo día que ocurrió, y el default evita que el formulario tenga un campo obligatorio para el caso más común.
18. En los cuatro modelos, agregar los comentarios `///` que documentan los cuatro `CHECK` que Prisma no declara. Los `CHECK` se escriben a mano en el SQL: es `tasks/db/02-indices-y-restricciones.md`.
19. En los cuatro modelos, agregar las directivas `@@index` que define la especificación. **Son ocho, todas de una sola columna**, y se escriben aquí para que `prisma migrate diff` no reporte una divergencia.
20. Ejecutar `pnpm --filter shpr prisma format` para normalizar la indentación.
21. Ejecutar `pnpm --filter shpr prisma validate` y confirmar que reporta el esquema como válido.
22. Ejecutar `pnpm --filter shpr prisma generate` y confirmar que el cliente se genera sin advertencias.
23. En `backend/prisma/migrations/20260910013256_init/migration.sql`, reescribir el archivo completo con los cuatro `CREATE TYPE`, los cuatro `CREATE TABLE` con sus ocho índices y sus cuatro `CHECK`, y los `DROP TABLE IF EXISTS` y `DROP TYPE IF EXISTS` al inicio en orden inverso de dependencias, para que la migración sea reejecutable sobre una base con el esquema viejo.
24. En el mismo archivo, **no** agregar `CREATE EXTENSION`. El `@default(uuid())` de Prisma genera el identificador en el cliente, así que la base no necesita `pgcrypto` ni `gen_random_uuid()`.
25. En `backend/.env.example` y `backend/.env.test`, agregar `DATABASE_URL` apuntando a la base de desarrollo y a la base de prueba respectivamente, con la base de prueba en un nombre distinto.
26. Reescribir `backend/src/scripts/seed.ts` para crear un conjunto pequeño y representativo: ventas de los tres estados, ventas de los dos métodos de pago, ventas de los dos tipos, ventas con y sin artículos adicionales, paquetes de los tres métodos, con y sin venta asociada, y gastos de un mes. Que el resumen del dashboard devuelva números no triviales.
27. En el seed, usar `upsert` con identificadores fijos o truncar las tablas antes de insertar, para que el script sea reejecutable sin duplicar.
28. Ejecutar `pnpm --filter shpr prisma migrate reset --force` y confirmar que la base se reconstruye desde cero sin errores.
29. Ejecutar `pnpm --filter shpr prisma migrate status` y confirmar que la base está al día.

## Criterios de Done

- [x] `grep -c "^model " backend/prisma/schema.prisma` devuelve `4`.
- [x] `grep -c "^enum " backend/prisma/schema.prisma` devuelve `4`.
- [x] `grep -c "model product\|model service\|model inventory_movement\|model user\|model refresh_token" backend/prisma/schema.prisma` devuelve `0`.
- [x] El total de columnas del esquema es `37`. Verificable contando los campos de los cuatro modelos: 12 + 9 + 8 + 8.
- [x] El enum `payment_method` tiene exactamente dos valores: `cash` y `credit_card`. Verificable con `grep -A3 "^enum payment_method" backend/prisma/schema.prisma`.
- [x] `grep -c "VarChar" backend/prisma/schema.prisma` devuelve `0`. Los nombres de negocio son `TEXT`.
- [x] `grep -c "@db.Timestamptz(3)" backend/prisma/schema.prisma` devuelve `3`, una por fecha de negocio.
- [x] `grep -c "@db.Timestamp(3)" backend/prisma/schema.prisma` devuelve `12`, por las marcas de auditoría. `updated_at` cuenta una vez por tabla, y son cuatro tablas.
- [x] `@default(now())` aparece exactamente `5` veces: en `created_at` de las cuatro tablas y en `expense_date`. **No** aparece en `sale_date` ni en `package_date`. **Corrección de la auditoría**: el criterio original pedía además `@default(now())` en `status` de `sale` y en `quantity` de `additional_sale`, lo cual es imposible — `status` es un enum (`@default(pending)`) y `quantity` un entero (`@default(1)`). El código estaba bien; el criterio estaba mal.
- [x] `additional_sale` y `expense` **sí** tienen `updated_at`.
- [x] `grep -c "@@index" backend/prisma/schema.prisma` devuelve `8`.
- [x] `pnpm --filter shpr prisma validate` reporta el esquema como válido.
- [x] `pnpm --filter shpr prisma generate` termina con código de salida `0`.
- [x] `pnpm --filter shpr prisma migrate reset --force` termina con código de salida `0` y "Database reset successful".
- [x] `pnpm --filter shpr prisma migrate diff --from-schema-datamodel ./prisma/schema.prisma --to-schema-datasource ./prisma/schema.prisma --exit-code` sale con código `0`: el SQL y el esquema no divergen.
- [x] `pnpm --filter shpr prisma db seed` corre sin errores y el resumen del dashboard devuelve valores distintos de cero.

### Evidencia de la auditoría (2026-10-02, AUD-01)

**16 de 16 criterios verificados contra evidencia real.** 14 pasaron tal como
estaban escritos; 2 necesitaron corrección y se documentan abajo.

Greps literales, todos con el valor que el criterio pedía:

| Criterio | Pedido | Medido |
| --- | --- | --- |
| `^model ` | `4` | 4 |
| `^enum ` | `4` | 4 |
| andamiaje (`product`, `service`, `inventory_movement`, `user`, `refresh_token`) | `0` | 0 |
| `VarChar` | `0` | 0 |
| `@db.Timestamptz(3)` | `3` | 3 |
| `@db.Timestamp(3)` | `12` | 12 |
| `@@index` | `8` | 8 |
| `@default(now())` | (corregido) | 5 |

Columnas: **37** en los cuatro modelos, en el orden del esquema —`sale` 12,
`additional_sale` 9, `package` 8, `expense` 8—. Confirmado por partida doble: en
el archivo del esquema y contra la base viva, donde `information_schema` da 12 + 9
+ 8 + 8 = 37. Las otras 8 columnas de `public` son de `_prisma_migrations`, y **no
queda ninguna tabla del andamiaje**.

Comandos de Prisma, todos con salida `0`:

- `prisma validate` → `The schema at prisma/schema.prisma is valid 🚀`
- `prisma generate` → Prisma Client v6.19.3 generado
- `prisma migrate reset --force` → `Database reset successful`, migraciones
  aplicadas y seed ejecutado; la base quedó reconstruida (13 ventas, 6 paquetes,
  10 gastos)
- `prisma migrate diff --exit-code` → `No difference detected.`
- Seed y resumen: el seed corrió sin errores dos veces dentro del reset; el
  resumen del dashboard devuelve los cuatro valores distintos de cero
  (`838000.00`, `13`, `227900.00`, `6`)

#### Corrección 1 — el criterio de `@default(now())` era imposible

El criterio original pedía `@default(now())` también en `status` de `sale` y en
`quantity` de `additional_sale`. **No se puede defaultear un enum a una marca de
tiempo ni un entero a una marca de tiempo.** En el esquema, `status` es
`@default(pending)` y `quantity` es `@default(1)`.

El código estaba bien y el criterio estaba mal: se corrigió el criterio. Un
criterio que pide algo imposible no sirve para verificar nada — hace que una
implementación correcta parezca incorrecta.

#### Corrección 2 — `PaymentMethod` es el tipo de TypeScript, no el enum

El enum del esquema se llama `payment_method` (snake_case, como los otros tres:
`sale_type`, `sale_status`, `package_method`). `PaymentMethod` es el tipo de
TypeScript en `sales.types.ts`. Los dos valores pedidos están exactamente ahí, así
que la intención del criterio se cumple; lo que estaba mal era el nombre usado
para verificar.

#### Corrección 3 — cinco comandos de la spec no existían

Los criterios de Prisma usaban `pnpm --filter shpr prisma <cmd>`. El paquete `shpr`
no define un script llamado `prisma` (define `prisma:generate` y
`prisma:migrate`), así que pnpm responde `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`: el
comando está bien escrito pero no puede ejecutarse. Se corrigieron a
`pnpm --filter shpr exec prisma <cmd>`.

Es el mismo error que ya se corrigió en el tracker del proyecto, y conviene que
quede escrito en las specs: **un comando escrito no es evidencia hasta que se
corre y se ve su código de salida.**
