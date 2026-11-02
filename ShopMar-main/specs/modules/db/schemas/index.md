# Índice del modelo de datos

## Modelo completo

Siete tablas y ocho enumeraciones. Las tablas describen una tienda de paca: la venta, sus artículos
adicionales, sus pagos, el cliente registrado y el gasto diario; más las dos del acceso al panel —`user`
y `session`—, que no son del negocio y ninguna otra tabla referencia (D-024). La tabla `package` y su
enum `package_method` ya no existen en el esquema.

### `sale` — Venta

| Campo | Tipo SQL | Nulo | Por defecto |
|-------|----------|------|-------------|
| `id` | `UUID` | No | `uuid()` |
| `type` | `sale_type` | No | — |
| `customer_name` | `TEXT` | No | — |
| `customer_id` | `UUID` → `customer.id` | Sí | `NULL` |

`customer_id` es nulo sólo en ventas históricas: toda venta nueva resuelve o crea su cliente por nombre (S18, D-022).
| `payment_terms` | `payment_terms` | No | `immediate` |
| `due_date` | `TIMESTAMP(3) WITH TIME ZONE` | Sí | `NULL` |
| `product_name` | `TEXT` | No | — |
| `category` | `sale_category[]` | No | — |
| `payment_method` | `payment_method` | No | — |
| `payment_bank` | `TEXT` | Sí | `NULL` |
| `sale_date` | `TIMESTAMP(3) WITH TIME ZONE` | No | — |
| `status` | `sale_status` | No | `pending` |
| `cost` | `DECIMAL(10,2)` | No | — |
| `amount_paid` | `DECIMAL(10,2)` | Sí | `NULL` |
| `change_given` | `DECIMAL(10,2)` | Sí | `NULL` |
| `shipment_method` | `shipment_method` | No | `unassigned` |
| `created_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | — |
| `deleted_at` | `TIMESTAMP(3) WITH TIME ZONE` | Sí | `NULL` |

Índices: `sale_sale_date_idx`, `sale_type_idx`, `sale_status_idx`, `sale_deleted_at_idx`,
`sale_customer_id_idx`, `sale_active_date_idx`, `sale_list_idx`, `sale_active_shipment_idx`,
`sale_por_cobrar_idx`. Los cuatro últimos son parciales y viven como SQL escrito a mano.

### `additional_sale` — Artículo adicional

| Campo | Tipo SQL | Nulo | Por defecto |
|-------|----------|------|-------------|
| `id` | `UUID` | No | `uuid()` |
| `sale_id` | `UUID` → `sale.id` | No | — |
| `name` | `TEXT` | No | — |
| `description` | `TEXT` | Sí | `NULL` |
| `quantity` | `INTEGER` | No | `1` |
| `total` | `DECIMAL(10,2)` | No | — |
| `kind` | `additional_sale_kind` | No | `additional` |
| `created_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | — |
| `deleted_at` | `TIMESTAMP(3) WITH TIME ZONE` | Sí | `NULL` |

Índices: `additional_sale_sale_id_idx`, `additional_sale_active_idx`.

### `sale_payment` — Pago de una venta

| Campo | Tipo SQL | Nulo | Por defecto |
|-------|----------|------|-------------|
| `id` | `UUID` | No | `uuid()` |
| `sale_id` | `UUID` → `sale.id` (`Cascade`) | No | — |
| `amount` | `DECIMAL(10,2)` | No | — |
| `paid_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | — |
| `payment_method` | `payment_method` | No | — |
| `payment_bank` | `TEXT` | Sí | `NULL` |
| `note` | `TEXT` | Sí | `NULL` |
| `created_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | — |
| `deleted_at` | `TIMESTAMP(3) WITH TIME ZONE` | Sí | `NULL` |

Índices: `sale_payment_sale_id_paid_at_idx`, parcial sobre los pagos vivos.

### `customer` — Cliente

| Campo | Tipo SQL | Nulo | Por defecto |
|-------|----------|------|-------------|
| `id` | `UUID` | No | `uuid()` |
| `name` | `TEXT` | No | — |
| `phone` | `TEXT` | Sí | `NULL` |
| `note` | `TEXT` | Sí | `NULL` |
| `created_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | — |
| `deleted_at` | `TIMESTAMP(3) WITH TIME ZONE` | Sí | `NULL` |

Sin índices propios: la búsqueda del alta es un `ILIKE` sobre una tabla de unos cientos de filas.

### `expense` — Gasto diario

| Campo | Tipo SQL | Nulo | Por defecto |
|-------|----------|------|-------------|
| `id` | `UUID` | No | `uuid()` |
| `name` | `TEXT` | No | — |
| `description` | `TEXT` | Sí | `NULL` |
| `total` | `DECIMAL(10,2)` | No | — |
| `expense_date` | `TIMESTAMP(3) WITH TIME ZONE` | No | `CURRENT_TIMESTAMP` |
| `created_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | — |
| `deleted_at` | `TIMESTAMP(3) WITH TIME ZONE` | Sí | `NULL` |

Índices: `expense_expense_date_idx`, `expense_active_idx`.

### `user` — Cuenta del panel

| Campo | Tipo SQL | Nulo | Por defecto |
|-------|----------|------|-------------|
| `id` | `UUID` | No | `uuid()` |
| `username` | `TEXT` (único, 3–32, `^[a-z0-9._-]+$`) | No | — |
| `email` | `TEXT` (único, normalizado a minúsculas) | No | — |
| `password_hash` | `TEXT` (`scrypt$N$r$p$sal$hash`) | No | — |
| `role` | `user_role` | No | — |
| `created_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | — |
| `deleted_at` | `TIMESTAMP(3) WITH TIME ZONE` | Sí | `NULL` |

Restricciones: `username` y `email` únicos, más los dos `CHECK` de minúsculas (`user_username_lowercase`, `user_email_lowercase`). Sin tabla `role` aparte: el rol es una columna.

### `session` — Sesión abierta

| Campo | Tipo SQL | Nulo | Por defecto |
|-------|----------|------|-------------|
| `id` | `UUID` | No | `uuid()` |
| `user_id` | `UUID` → `user.id` (`Cascade`) | No | — |
| `token_hash` | `TEXT` (único) | No | — |
| `created_at` | `TIMESTAMP(3) WITH TIME ZONE` | No | `CURRENT_TIMESTAMP` |
| `revoked_at` | `TIMESTAMP(3) WITH TIME ZONE` | Sí | `NULL` |

Índices: `session_token_hash_key` (único), `session_user_id_idx`, y la FK `session_user_id_user_id_fkey`
(`Cascade`). **No tiene columna de vencimiento**, y no tiene `deleted_at`: una sesión no vence ni se
borra, se revoca (D-024).

### Enumeraciones

| Enum | Valores |
|------|---------|
| `sale_type` | `live`, `whatsapp` |
| `sale_status` | `pending`, `completed`, `cancelled` |
| `payment_terms` | `immediate`, `credit` |
| `payment_method` | `cash`, `credit_card` |
| `shipment_method` | `cargotrans`, `delivery`, `pickup`, `unassigned` |
| `sale_category` | `pantalones`, `camisas`, `chaquetas`, `sudaderas` |
| `additional_sale_kind` | `merchandise`, `additional` |
| `user_role` | `seller`, `admin` |

## Resumen de relaciones

```
┌──────────────────────┐
│      customer        │   (sin relación a otras tablas)
│ id · name · phone    │
│ note · marcas        │
└──────────┬───────────┘
           │ 1:N  (Restrict, opcional)
           ▼
  ┌────────────────────────────────────────────┐
  │                  sale                      │
  │  id · type · customer_name · customer_id   │
  │  payment_terms · due_date · product_name   │
  │  category · payment_method · payment_bank  │
  │  sale_date · status · cost                 │
  │  amount_paid · change_given                │
  │  shipment_method · marcas                  │
  └───┬───────────────────────┬────────────────┘
      │ 1:N  (Cascade)        │ 1:N  (Cascade)
      ▼                       ▼
┌──────────────────────┐   ┌──────────────────────┐
│   additional_sale    │   │    sale_payment      │
│ id · sale_id · name  │   │ id · sale_id         │
│ description          │   │ amount · paid_at     │
│ quantity · total     │   │ payment_method       │
│ kind · marcas        │   │ payment_bank · note  │
└──────────────────────┘   │ marcas               │
                           └──────────────────────┘

                       ┌──────────────────────┐
                       │       expense        │   (sin relaciones)
                       └──────────────────────┘
```

El acceso al panel vive aparte, y a propósito: ninguna tabla de negocio lo referencia.

```
┌──────────────────────┐
│        user          │
│ id · username        │
│ email · password_hash│
│ role · marcas        │
└──────────┬───────────┘
           │ 1:N  (Cascade)
           ▼
┌──────────────────────┐
│       session        │
│ id · user_id         │
│ token_hash           │
│ created_at           │
│ revoked_at           │
└──────────────────────┘
```

| Relación | Tipo | Propietario | Obligatoriedad | `onDelete` |
|----------|------|-------------|----------------|------------|
| `additional_sale` pertenece a `sale` | N:1 | `additional_sale.sale_id` | Obligatoria (`NOT NULL`) | `Cascade` |
| `sale_payment` pertenece a `sale` | N:1 | `sale_payment.sale_id` | Obligatoria (`NOT NULL`) | `Cascade` |
| `sale` pertenece a `customer` | N:1 | `sale.customer_id` | Opcional (`NULL`); obligatoria en ventas a crédito | `Restrict` |
| `session` pertenece a `user` | N:1 | `session.user_id` | Obligatoria (`NOT NULL`) | `Cascade` |
| `expense` | — | — | — | — |

**Nombres de las relaciones en Drizzle:** la pertenencia se declara en la columna hija
(`additionalSale.saleId`, `salePayment.saleId`, `sale.customerId`, `session.userId`); Drizzle no declara
arrays inversos en la tabla padre.

### Lo que no existe

| Ausencia | Consecuencia en las relaciones |
|----------|--------------------------------|
| Ninguna tabla de negocio referencia a `sale` salvo `additional_sale` y `sale_payment`. | No hay citas, devoluciones, notas ni historial de cambios de estado. |
| Ninguna tabla de negocio referencia a `user`. | La autenticación es aditiva: no hay dueño de una venta ni aislamiento por usuario, y no hubo que migrar filas existentes (D-024). |
| No hay columna de vencimiento en `session`. | La sesión solo termina con el logout (`revoked_at`); no hay proceso que expire filas ni comparación contra el reloj en el guard (D-024). |
| No hay tabla `role`. | El rol es una columna (`user.role`) de un conjunto cerrado de dos valores. |
| No hay clave foránea a `product`. | `product_name` y `additional_sale.name` son texto libre, no referencias. |
| No hay columna `sale.total`. | El total se deriva en la aplicación. No hay forma de que se desincronice. |
| No hay columna `paid_total` ni `balance`. | Son derivados del libro de `sale_payment` (D-022). |
| No hay columna `is_overdue`. | Se calcula contra la fecha de hoy; guardar «vencida» obligaría a un proceso que la mantuviera al día. |
| No hay tabla `package`. | Los envíos los resolvía una versión anterior; hoy `shipment_method` vive en la venta. |

## Convenciones

### Nombres

| Elemento | Convención | Ejemplos |
|----------|------------|----------|
| Tabla | Minúsculas, singular, `snake_case` | `sale`, `additional_sale`, `sale_payment`, `customer`, `expense`, `user`, `session` |
| Columna | `snake_case` | `customer_name`, `payment_terms`, `deleted_at` |
| Clave primaria | Siempre `id` | `sale.id`, `customer.id` |
| Clave foránea | `<tabla>_id` | `additional_sale.sale_id`, `sale.customer_id` |
| Marca de tiempo | `<verbo>_at` | `created_at`, `updated_at`, `deleted_at`, `paid_at` |
| Fecha de negocio | `<sustantivo>_date` | `sale_date`, `due_date`, `expense_date` |
| Enum | Minúsculas, singular, `<tabla>_<atributo>` | `sale_type`, `sale_status`, `payment_terms` |
| Índice | `<tabla>_<columnas>_idx` | `sale_sale_date_idx`, `sale_payment_sale_id_paid_at_idx` |

### Marcas de tiempo

| Columna | Tipo | Quién la escribe | Significado |
|---------|------|-------------------|-------------|
| `created_at` | `TIMESTAMP(3) WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | Momento de la inserción. Inmutable. |
| `updated_at` | `TIMESTAMP(3) WITH TIME ZONE` | La aplicación, con `$onUpdate` de Drizzle (no hay default en la base) | Momento de la última modificación. Automático, no se envía. |
| `deleted_at` | `TIMESTAMP(3) WITH TIME ZONE`, `NULL` | La capa de aplicación, con `new Date()` | Momento del borrado lógico. `NULL` significa que el registro está vivo. |

Las fechas de negocio (`sale_date`, `due_date`, `paid_at`, `expense_date`) son datos del hecho
económico, no marcas de auditoría: admiten corrección y no las modifica el `updated_at`. `paid_at` es
además la fecha con la que un pago entra en la caja (`collected_revenue`).

**Las tres marcas de auditoría son `TIMESTAMP(3) WITH TIME ZONE` en todas las tablas (S33).** Un
`timestamp` sin zona guarda una hora de reloj sin decir de qué reloj: el navegador la leía como si ya
fuera local y una venta registrada de noche aparecía con la fecha del día siguiente. La conversión de
la migración `20261020155935_cute_nova` usa `USING "<columna>" AT TIME ZONE 'UTC'`, que preserva el
instante asumiendo que los valores existentes se escribieron como hora de pared UTC —que es lo que
hacían `CURRENT_TIMESTAMP` y el driver—. `updated_at` lo sigue escribiendo la aplicación con
`$onUpdate`, sin default en la base; el tipo no cambia esa regla.

### Zona horaria y formato

| Aspecto | Decisión |
|---------|----------|
| Tipo en la base | `TIMESTAMP(3) WITH TIME ZONE` (`timestamp(..., { withTimezone: true, precision: 3 })`). |
| Formato en la API | ISO 8601 en UTC, por ejemplo `2026-09-28T15:30:00.000Z`. |
| Entrada del formulario | `YYYY-MM-DD` de `<input type="date">`, que el frontend convierte a ISO antes de enviar. |
| Zona horaria de la tienda | No se almacena. La conversión a la hora local la hace el navegador: `toLocaleDateString` para los días de negocio y `toLocaleString` para los instantes de auditoría, que son los únicos que se muestran con hora (S33). |

### Importe

| Aspecto | Decisión |
|---------|----------|
| Tipo | `DECIMAL(10,2)`. Máximo `99999999.99`. |
| En Drizzle | `numeric(..., { precision: 10, scale: 2 })`; el driver `pg` lo devuelve como `string` y la entidad de dominio lo envuelve con `Decimal` de `decimal.js`. |
| En la API | **Cadena decimal**: `"1250.50"`. Nunca un número JSON. |
| Patrón de validación | `/^\d{1,8}(\.\d{1,2})?$/` en `MONEY_PATTERN`. |
| En la aplicación | `toMoneyString()` con `Decimal.toFixed(2)`. Suma con `new Decimal(a).plus(b)` de `decimal.js`. |
| En el frontend | Formato por concatenación y expresión regular. **Prohibido `parseFloat` sobre un importe.** |

### Borrado lógico

| Regla | Detalle |
|-------|---------|
| Ninguna tabla se borra físicamente. | `DELETE` HTTP escribe `deleted_at`. |
| `session` no se borra: se revoca. | No tiene `deleted_at`; el logout escribe `revoked_at` y la fila queda como registro de cuándo se cerró (D-024). |
| Toda lectura filtra. | `deleted_at: null` en listados, lecturas por id, agregaciones y relaciones anidadas. |
| Las relaciones anidadas también filtran. | El `select` anidado de `additional_items` y `payments` lleva su propio `where deleted_at IS NULL`. |
| Las agregaciones filtran. | Las del dashboard excluyen lo borrado lógicamente, incluidos los pagos borrados. |
| Las claves foráneas son de contención. | `Cascade` y `Restrict` solo se activarían ante una eliminación física, que no ocurre. |
| No hay restauración. | Ningún endpoint devuelve una fila con `deleted_at` informado. |

### Restricciones `CHECK`

| # | Restricción | Tabla |
|---|-------------|-------|
| 1 | `CHECK ((payment_method = 'credit_card' AND payment_bank IS NOT NULL) OR (payment_method = 'cash' AND payment_bank IS NULL))` | `sale` |
| 2 | `CHECK ("cost" >= 0)` | `sale` |
| 3 | `CHECK ("amount_paid" IS NULL OR "amount_paid" >= 0)` | `sale` |
| 4 | `CHECK ("change_given" IS NULL OR "change_given" >= 0)` | `sale` |
| 5 | `CHECK ("change_given" IS NULL OR ("amount_paid" IS NOT NULL AND "change_given" <= "amount_paid"))` | `sale` |
| 6 | `CHECK (("payment_terms" = 'credit' AND "due_date" IS NOT NULL) OR ("payment_terms" = 'immediate' AND "due_date" IS NULL))` | `sale` |
| 7 | `CHECK ("payment_terms" = 'immediate' OR "customer_id" IS NOT NULL)` | `sale` |
| 8 | `CHECK ("total" >= 0)` | `additional_sale` |
| 9 | `CHECK ("quantity" >= 1)` | `additional_sale` |
| 10 | `CHECK ("amount" > 0)` | `sale_payment` |
| 11 | `CHECK ((payment_method = 'credit_card' AND payment_bank IS NOT NULL) OR (payment_method = 'cash' AND payment_bank IS NULL))` | `sale_payment` |
| 12 | `CHECK ("total" >= 0)` | `expense` |
| 13 | `CHECK ("username" = lower("username"))` | `user` |
| 14 | `CHECK ("email" = lower("email"))` | `user` |

Son **catorce** restricciones `CHECK` sobre cinco tablas: `customer` y `session` no tienen ninguna.

Se declaran con `check()` en `src/db/schema/` y viajan al SQL de la migración generada.
`backend/scripts/verify-schema.sql` afirma las tablas, los enums, los índices y las restricciones contra
la base real.

## Inventario

| Recuento | Cantidad |
|----------|----------|
| Tablas | 7 (5 de negocio y `user` y `session`) |
| Enumeraciones | 8 |
| Claves foráneas | 4 |
| Restricciones `CHECK` | 14 |
| Módulos de dominio de la API | 4 de negocio (ventas, clientes, gastos, dashboard) y 2 de acceso (`auth`, `users`) |
| Endpoints | 21 de negocio + 4 de acceso |
