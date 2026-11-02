# Configuración de la base de datos

## Motor y versión

| Aspecto | Valor |
|---------|-------|
| Motor | PostgreSQL |
| Versión mínima | 16 |
| Esquema de PostgreSQL | `public` |
| Migraciones | `backend/drizzle/` (generadas por `drizzle-kit generate`) |
| Archivo de esquema | `backend/src/db/schema/*.ts` (`sales.ts`, `expenses.ts`, `index.ts`) |
| Cliente | `drizzle-orm` sobre un `Pool` de `pg`, en `backend/src/db/index.ts` |
| Aviso de consulta lenta | por Pino cuando una consulta supera `SLOW_QUERY_MS` |

## Conexión

La conexión se declara en `backend/drizzle.config.ts`, que lee `DATABASE_URL`:

```ts
export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

El runtime recibe el mismo DSN a través de `DATABASE_URL`, que es la única variable de entorno obligatoria del backend.

**Forma del DSN, sin secretos:**

```
postgresql://USUARIO:CONTRASENA@HOST:PUERTO/NOMBRE_BASE?schema=public
```

| Parte | Valor de desarrollo | Valor de producción |
|-------|---------------------|---------------------|
| `HOST` | `localhost` | `localhost` — **nunca una IP remota** |
| `PUERTO` | `5432` | `5432` |
| `NOMBRE_BASE` | nombre del proyecto | nombre del proyecto |
| `schema` | `public` | `public` |
| `USUARIO` / `CONTRASENA` | usuario local de desarrollo | usuario dedicado de la aplicación |

`backend/.env.example` trae el placeholder `postgresql://usuario:password@localhost:5432/example_project?schema=public`. Ese valor es un ejemplo, no una credencial.

**PostgreSQL no se expone.** En producción el servicio escucha en `localhost` y el puerto 5432 no está abierto en el firewall del host. Es el control compensatorio número 2 de `modules/backend/04-security.md`, y es la razón por la que la ausencia de autenticación en la API es aceptable.

El cliente se crea una sola vez, en `backend/src/db/index.ts`: un `Pool` de `pg` sobre `DATABASE_URL`, el `db` de Drizzle construido sobre ese pool (`drizzle({ client: pool, logger })`) y el tipo `Db`. Las factories de repositorio (`createSaleRepository(db)`, `createExpenseRepository(db)`, `createDashboardRepository(db)`) lo reciben por parámetro. `graceful-shutdown` cierra el pool con `pool.end()`.

## Workflow de migraciones

`drizzle-kit generate` compara el esquema de `backend/src/db/schema/` con la última fotografía del historial y escribe el SQL de la diferencia en `backend/drizzle/`; `drizzle-kit migrate` lo aplica y anota la migración en su tabla de control. Ver decisión D-016.

### Ciclo en desarrollo

1. Editar el esquema en `backend/src/db/schema/` (`sales.ts` o `expenses.ts`).
2. `pnpm run db:generate` — `drizzle-kit generate`. Compara el esquema con el historial y crea `backend/drizzle/<sello>_<nombre>/migration.sql` con su `snapshot.json`.
3. `pnpm run db:migrate` — `drizzle-kit migrate`. Aplica las migraciones pendientes contra la base de `DATABASE_URL`.
4. `pnpm test` — para confirmar que los cambios no rompieron la capa de aplicación.
5. Revisar el SQL generado antes de versionarlo.

**Renombrar una carpeta de migración no es un `mv`.** `drizzle-kit` 1.0.0-rc.4 anota cada migración aplicada por **nombre de carpeta** y por hash del SQL en `drizzle.__drizzle_migrations`. Si se renombra la carpeta después de aplicarla, el hash no cambia pero el nombre sí: en la próxima corrida la herramienta la considera pendiente y vuelve a ejecutar el `CREATE TYPE`/`CREATE TABLE`, que falla porque los objetos ya existen. Para renombrar hay que mover la carpeta **y** actualizar `name` en esa tabla en cada base donde ya se aplicó (`update drizzle.__drizzle_migrations set name = '<nombre-nuevo>' where name = '<nombre-viejo>'`). Una migración recién generada y todavía no aplicada en ningún otro entorno se renombra sin tocar bases.

**`drizzle-kit push` está prohibido.** Push diffea contra la base viva, no ve en el esquema los índices cubrientes escritos a mano y los borraría sin avisar. Un push accidental no lo detecta ningún test: solo lo detecta `scripts/verify-schema.sql`.

### Ciclo en producción

1. `pnpm run build` — `tsup` a secas; ya no hay un paso de generación de cliente en el build.
2. `pnpm run db:migrate` — aplica las migraciones pendientes del repositorio.
3. Arrancar el proceso de API.

La diferencia es deliberada: en producción nunca se genera una migración, solo se aplican las que ya están versionadas.

### Migraciones de este proyecto

`backend/drizzle/` contiene la migración base (tablas, enums nativos, claves foráneas y `CHECK`) y una migración con los índices cubrientes como SQL a mano, porque `drizzle-kit generate` no puede expresar `INCLUDE`. La base se regeneró desde cero: se creó vacía, se aplicaron las migraciones y después el seed. Una base nueva no tiene `_prisma_migrations`.

Para recrear una base local desde cero está `pnpm run db:reset`, que hace un respaldo, vacía el esquema `public` y vuelve a aplicar las migraciones; después se corre `pnpm run seed`.

## Seeds

| Aspecto | Detalle |
|---------|---------|
| Archivo | `backend/src/scripts/seed.ts` |
| Comando | `pnpm run seed`, que ejecuta `tsx src/scripts/seed.ts` |
| Ejecución | Manual. No hay gancho de seed en `db:migrate` ni en `package.json`. |
| Estilo actual del archivo | El cliente `db` compartido de `src/db/index.ts`, `TRUNCATE` de las cinco tablas del fixture, inserción por lotes de 50 filas, `console.log` de resumen, `catch` con `process.exit(1)` y `finally` con `pool.end()`. |
| Contenido | Fixture de volumen del dominio real, con la venta a crédito sembrada (S31): 40 clientes, 5000 ventas `live` y `whatsapp` con artículos adicionales, y 5000 gastos repartidos en dos meses. |

El seed genera en el script el `id` y el `updatedAt` de cada fila, porque ninguna de esas columnas tiene default en la base. La siembra es idempotente por truncado: volver a ejecutarla deja la base en el mismo estado, no en el doble.

El rango se calcula por **calendario local** —los días salen de `getFullYear/getMonth/getDate` y cada uno se construye con `Date.UTC(año, mes, día)`—, así el último día sembrado es el día local de hoy y no el «mañana» local que daba `getUTCDate()` después de las 18:00 en Nicaragua (UTC−6). `sale_date` y `expense_date` son días de negocio a medianoche UTC, incluidos los gastos fijos mensuales: con hora, un gasto registrado hoy a medianoche caía debajo de todos los del mismo día. Al final el seed se autoverifica y falla con un mensaje claro si alguna fecha quedó con hora o si el último día sembrado no es el día local de hoy; el resumen imprime el rango y ese día.

### Qué siembra

| Tabla | Contenido |
|-------|-----------|
| `customer` | Un cliente por nombre de comprador distinto, con el nombre recortado y sin repetir (la tabla no tiene `UNIQUE`: la unicidad es del fixture). Un tercio lleva teléfono nicaragüense de ocho dígitos agrupado como `8888 1234`; el resto queda nulo. |
| `sale` | 5000 ventas sobre los últimos dos meses. Toda venta queda enlazada por `customer_id` y conserva `customer_name` como instantánea de la factura (S5, S18). Alrededor de un 27 % son `payment_terms = 'credit'`: nacen `pending` con `due_date` entre 14 y 44 días después de la venta —cerca del 40 % ya vencido—, y sólo llegan a `completed` cuando los abonos cubren el total. El resto son `immediate`, con `due_date` nulo. |
| `sale_payment` | El libro de pagos de las dos condiciones: el cobro del mostrador de cada venta de contado `completed` y los abonos de las fiadas. De las ventas a crédito, la mitad no tiene abonos, un tercio tiene uno parcial (entre 20 % y 60 % del total, fechado después de la venta y nunca en el futuro) y el resto está pagada del todo, con la suma de sus abonos igual al total, `status = 'completed'` y `amount_paid` igual a esa suma. |
| `additional_sale`, `expense` | 5000 gastos, con la misma forma de siempre. Los gastos —diarios y fijos del mes— se fechan a medianoche UTC, como las ventas. Los renglones adicionales no son un total fijo: dependen de los días que cubre el rango (4718 con los 53 días de la última corrida). |

El resumen de consola informa, además de lo que ya informaba: clientes creados (y cuántos con teléfono), ventas a crédito desglosadas por abonos, saldo por cobrar y su parte vencida, y cuántos pagos de abonos se escribieron. Los importes se arman en centavos enteros y se escriben con el helper `money`, así que la suma de los abonos coincide exactamente con el total.

Los sorteos nuevos (condición de pago, vencimientos, abonos, clientes y teléfonos) usan secuencias propias derivadas de `SEED`, separadas del flujo original: los totales que el fixture ya prometía (5000 ventas, 5000 gastos, ingresos y gastos del rango) siguen dando exactamente igual. Los `id` son `randomUUID`, así que cambian entre corridas; lo que se repite es la forma y los agregados, no los identificadores.

## Scripts

Todos definidos en `backend/package.json`:

| Comando | Ejecuta | Efecto sobre la base de datos |
|---------|---------|-------------------------------|
| `pnpm run db:generate` | `drizzle-kit generate` | No toca la base. Escribe el SQL de la diferencia en `backend/drizzle/`. |
| `pnpm run db:migrate` | `drizzle-kit migrate` | Aplica las migraciones pendientes. |
| `pnpm run db:studio` | `drizzle-kit studio` | No modifica nada. Abre la interfaz web de inspección. |
| `pnpm run db:reset` | respaldo + `DROP SCHEMA public CASCADE` + `drizzle-kit migrate` | Respalda, vacía el esquema `public` y vuelve a aplicar las migraciones. |
| `pnpm run db:check` | `node scripts/db-check.mjs` | Verifica las tres tablas de dominio e imprime el DSN censurado. |
| `pnpm run db:verify` | `bash scripts/db-verify.sh` | Ejecuta `scripts/verify-schema.sql` contra la base. |
| `pnpm run db:url` | `node scripts/db-url.mjs` | Imprime las piezas del DSN y el `pg_dump` sin `?schema=`. |
| `pnpm run db:backup` | `bash scripts/db-backup.sh` | `pg_dump --format=custom` a `backend/backups/`. |
| `pnpm run seed` | `tsx src/scripts/seed.ts` | Trunca y siembra los datos de ejemplo. |
| `pnpm run build` | `tsup` | No modifica la base. Compila el servidor. |

**No hay un script separado de despliegue.** `pnpm run db:migrate` es el mismo comando en desarrollo y en producción: aplicar las migraciones versionadas sin interacción.

## Restricciones `CHECK`

`drizzle-kit generate` no deduce las restricciones `CHECK` por sí solo, así que se declaran explícitamente con `check()` en el esquema de Drizzle y viajan al SQL de la migración. Las ocho restricciones por nombre están en `scripts/verify-schema.sql`; las reglas del modelo son:

| Restricción | Tabla | SQL |
|-------------|-------|-----|
| `payment_bank` obligatorio solo con tarjeta | `sale` | `CHECK ((payment_method = 'credit_card' AND payment_bank IS NOT NULL) OR (payment_method = 'cash' AND payment_bank IS NULL))` |
| Importe no negativo | `sale`, `additional_sale`, `expense` | `CHECK ("cost" >= 0)`, `CHECK ("total" >= 0)` |
| Cantidad de al menos uno | `additional_sale` | `CHECK ("quantity" >= 1)` |

La primera es la defensa en profundidad de la regla que ya valida Zod con `superRefine`. Si alguien inserta una venta con tarjeta y sin banco saltándose la API, PostgreSQL lo rechaza. Ver `specs/tasks/db/02-indices-y-restricciones.md`.

## Copias de seguridad

El proyecto incluye `pnpm run db:backup` (`backend/scripts/db-backup.sh`), que hace un `pg_dump --format=custom --no-owner --no-privileges` a `backend/backups/` y falla si el respaldo queda vacío. **No automatiza** la programación del respaldo: eso sigue siendo una responsabilidad operativa del dueño del sistema, fuera de la aplicación. Lo razonable es correrlo diariamente contra un destino local.

```
pnpm run db:backup
pnpm run db:url          # imprime el pg_dump sin ?schema= si hace falta a mano
```

Ver `docs/05-requisitos-no-funcionales.md`, sección de disponibilidad.
