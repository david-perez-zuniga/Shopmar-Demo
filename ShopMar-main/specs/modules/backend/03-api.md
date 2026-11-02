# Implementación de la API

Este documento contiene las **notas de implementación** de los veintiún endpoints de negocio y de los **cuatro endpoints de acceso** (`/auth/login`, `/auth/logout`, `/auth/me` y `/users`). Los primeros no cuentan en el inventario de veintiún endpoints: son el contrato de acceso y viven en `src/modules/auth/` y `src/modules/users/`. El contrato completo, con cuerpos tipados, respuestas de ejemplo y el sobre de error, está en `modules/api/`. Aquí se documenta qué módulo y qué función atienden cada ruta.

## Prefijo y convenciones

- Todos los endpoints de negocio cuelgan de `/api/v1`, registrado en `src/http/routes.ts`.
- **Todo `/api/v1` exige sesión válida salvo `POST /api/v1/auth/login` y `POST /api/v1/auth/logout` (idempotente).** El guard vive en un `preHandler` a nivel del prefijo y deja el usuario de la sesión en la petición; `POST /api/v1/users` verifica además el rol. Ver *Guard de sesión* más abajo y `modules/api/07-auth.md`.
- Todo cuerpo, query y parámetro de ruta se valida con un esquema de Zod dentro del controlador. Nunca se accede a `request.body` sin validar.
- Los importes de entrada y de salida son **cadenas decimales** (`"1250.50"`), nunca números. Ver decisión D-003.
- Las fechas de entrada son cadenas ISO 8601; Drizzle las persiste como `TIMESTAMP(3)` con zona horaria y el driver `pg` las devuelve en UTC.
- Los endpoints de listado devuelven el conjunto completo dentro de una clave de recurso (decisión D-006), salvo `GET /api/v1/sales`, que acepta `page` y `per_page` opcionales y siempre acompaña la lista con `total` (decisión D-011).
- El `DELETE` nunca borra físicamente: escribe `deleted_at` (decisión D-004).

## Tabla de rutas

| Método | Ruta | Archivo de rutas | Controlador | Servicio | Repositorio |
|--------|------|------------------|-------------|----------|-------------|
| `POST` | `/api/v1/auth/login` | `auth/presentation/auth.routes.ts` | `authController.login` | `createAuthService(...).login` | `UserRepository.findByUsernameOrEmail` · `SessionRepository.create` |
| `POST` | `/api/v1/auth/logout` | `auth/presentation/auth.routes.ts` | `authController.logout` | `createAuthService(...).logout` | `SessionRepository.revoke` |
| `GET` | `/api/v1/auth/me` | `auth/presentation/auth.routes.ts` | `authController.me` | `createAuthService(...).me` | `SessionRepository.findByTokenHash` |
| `POST` | `/api/v1/users` | `users/presentation/users.routes.ts` | `usersController.create` | `createUserService(...).create` | `UserRepository.create` |
| `GET` | `/api/v1/dashboard/summary` | `dashboard/presentation/dashboard.routes.ts` | `dashboardController.getSummary` | `createDashboardService(DashboardRepository).getSummary` | `DashboardRepository.getSummary` |
| `GET` | `/api/v1/dashboard/packages/kpis` | `dashboard/presentation/dashboard.routes.ts` | `dashboardController.getPackageKpis` | `createDashboardService(...).getPackageKpis` | `DashboardRepository.getPackageKpis` |
| `GET` | `/api/v1/dashboard/daily-series` | `dashboard/presentation/dashboard.routes.ts` | `dashboardController.getDailySeries` | `createDashboardService(...).getDailySeries` | `DashboardRepository.getDailySeries` |
| `GET` | `/api/v1/dashboard/by-channel` | `dashboard/presentation/dashboard.routes.ts` | `dashboardController.getChannelBreakdown` | `createDashboardService(...).getChannelBreakdown` | `DashboardRepository.getChannelBreakdown` |
| `GET` | `/api/v1/dashboard/by-shipment` | `dashboard/presentation/dashboard.routes.ts` | `dashboardController.getShipmentBreakdown` | `createDashboardService(...).getShipmentBreakdown` | `DashboardRepository.getShipmentBreakdown` |
| `POST` | `/api/v1/sales/live` | `sales/presentation/sales.routes.ts` | `salesController.createLive` | `createSaleService(...).createLive` | `SaleRepository.createWithNoAdditional` |
| `POST` | `/api/v1/sales/whatsapp` | `sales/presentation/sales.routes.ts` | `salesController.createWhatsapp` | `createSaleService(...).createWhatsapp` | `SaleRepository.createWithAdditional` |
| `GET` | `/api/v1/sales` | `sales/presentation/sales.routes.ts` | `salesController.list` | `createSaleService(...).list` | `SaleRepository.findAll` || `GET` | `/api/v1/sales/:id` | `sales/presentation/sales.routes.ts` | `salesController.getById` | `createSaleService(...).getById` | `SaleRepository.findById` |
| `PATCH` | `/api/v1/sales/:id/status` | `sales/presentation/sales.routes.ts` | `salesController.updateStatus` | `createSaleService(...).updateStatus` | `SaleRepository.updateStatus` |
| `PATCH` | `/api/v1/sales/:id/shipment-method` | `sales/presentation/sales.routes.ts` | `salesController.updateShipmentMethod` | `createSaleService(...).updateShipmentMethod` | `SaleRepository.updateShipmentMethod` |
| `POST` | `/api/v1/sales/:id/payments` | `sales/presentation/sales.routes.ts` | `salesController.createPayment` | `createSaleService(...).createPayment` | `SaleRepository.createPayment` |
| `DELETE` | `/api/v1/sales/:id/payments/:paymentId` | `sales/presentation/sales.routes.ts` | `salesController.deletePayment` | `createSaleService(...).deletePayment` | `SaleRepository.deletePayment` |
| `POST` | `/api/v1/customers` | `customers/presentation/customers.routes.ts` | `customersController.create` | `createCustomerService(...).create` | `CustomerRepository.create` |
| `GET` | `/api/v1/customers` | `customers/presentation/customers.routes.ts` | `customersController.list` | `createCustomerService(...).list` | `CustomerRepository.findAll` |
| `PATCH` | `/api/v1/customers/:id` | `customers/presentation/customers.routes.ts` | `customersController.update` | `createCustomerService(...).update` | `CustomerRepository.update` |
| `DELETE` | `/api/v1/customers/:id` | `customers/presentation/customers.routes.ts` | `customersController.delete` | `createCustomerService(...).delete` | `CustomerRepository.softDelete` |
| `POST` | `/api/v1/packages` | `packages/presentation/packages.routes.ts` | `packagesController.create` | `createPackageService(...).create` | `PackageRepository.create` |
| `GET` | `/api/v1/packages` | `packages/presentation/packages.routes.ts` | `packagesController.list` | `createPackageService(...).list` | `PackageRepository.findAll` |
| `PUT` | `/api/v1/packages/:id` | `packages/presentation/packages.routes.ts` | `packagesController.update` | `createPackageService(...).update` | `PackageRepository.update` |
| `DELETE` | `/api/v1/packages/:id` | `packages/presentation/packages.routes.ts` | `packagesController.delete` | `createPackageService(...).delete` | `PackageRepository.softDelete` |
| `POST` | `/api/v1/expenses` | `expenses/presentation/expenses.routes.ts` | `expensesController.create` | `createExpenseService(...).create` | `ExpenseRepository.create` |
| `GET` | `/api/v1/expenses` | `expenses/presentation/expenses.routes.ts` | `expensesController.list` | `createExpenseService(...).list` | `ExpenseRepository.findAll` |
| `DELETE` | `/api/v1/expenses/:id` | `expenses/presentation/expenses.routes.ts` | `expensesController.delete` | `createExpenseService(...).delete` | `ExpenseRepository.softDelete` |

El módulo `customers` se registra en `src/app.ts` con `{ prefix: "/customers" }`, junto a `dashboard`, `sales` y `expenses`; `auth` y `users` se registran como `authRoutes` con `{ prefix: "/auth" }` y `usersRoutes` con `{ prefix: "/users" }`. **No existe un módulo `packages`** y no se registra ninguna ruta de `/api/v1/packages`: la sección *Paquetes* de este documento y `modules/api/03-packages.md` quedan como historia.

## Guard de sesión

**Alcance.** Todo `/api/v1` salvo dos rutas declaradas públicas: `POST /api/v1/auth/login`, que es la puerta de entrada, y `POST /api/v1/auth/logout`, que es idempotente por contrato —con la cookie ausente o ya revocada responde `200` igual, así que un guard lo convertiría en `401`—. El guard es un `preHandler` registrado en el mismo bloque que monta el prefijo, así que una ruta nueva queda protegida por el solo hecho de colgar de `/api/v1`; las dos excepciones se declaran como rutas públicas, no desactivando el guard.

**Qué hace, en orden:**

1. Lee la cookie `shpr_session`. Sin cookie → `401 UNAUTHORIZED` con `message: "Authentication required"`.
2. Calcula el `sha256` del token y busca la sesión por `token_hash`, comparando con `timingSafeEqual`.
3. Rechaza la sesión si no existe o si `revoked_at` no es nulo (`401`, mismo mensaje) y rechaza al usuario si está borrado lógicamente.
4. Deja el usuario de la sesión en la petición para que los controladores no vuelvan a consultarlo.

**Lo que el guard no hace.** No renueva la cookie ni escribe nada: la sesión no vence, así que un pedido no tiene por qué tocar la fila. Tampoco verifica roles; eso es del alta de usuarios, y es una comprobación aparte (`403`) para que un permiso nuevo sea una decisión explícita y no un efecto del guard.

**Respuestas.** `401` en las tres causas de rechazo —sin cookie, token desconocido, sesión revocada— con el mismo mensaje. `GET /health` no pasa por el guard: se registra antes del prefijo y sigue siendo liveness.

## Alta de usuarios

**Solo administradores.** `POST /api/v1/users` responde `403 FORBIDDEN` con `message: "Only an administrator can create users"` cuando la sesión tiene `role: "seller"`. Es el único permiso del sistema además de «estar autenticado».

**Por qué no hay listado ni edición.** `GET`, `PATCH` y `DELETE` de `/users` **no existen**: administrar usuarios fuera del alta es una tarea de terminal, no del panel. Consecuencia práctica: un `admin` puede crear cuentas pero no puede borrar a nadie desde la interfaz; el borrado lógico de `user` y la revocación de sesiones se hacen desde la base.

**El primer administrador** se crea con `pnpm create-admin -- --username … --email … --password …`, porque sin nadie autenticado no hay quién llame al alta. El script valida las mismas reglas que el DTO y usa el mismo servicio de hashing y el mismo repositorio de usuarios: no hay un segundo camino de escritura que pueda quedar fuera de las invariantes.

## Fuera del prefijo: `GET /health`

`GET /health` es el único endpoint que no cuelga de `/api/v1`. No es contrato de negocio: es control de vida del proceso, y por eso no entra en la tabla anterior ni en el conteo de los veintiún endpoints.

**Archivo** — `src/modules/health/presentation/health.routes.ts`, registrado en `src/app.ts` con `app.register(healthRoutes)` **antes** del registro de las rutas de negocio, para que quede fuera del alcance con caché condicional.

**Sin capas** — No hay `domain/`, `application/` ni `infrastructure/` en `src/modules/health/`: no hay regla de negocio que aplicar ni dato que consultar. La ruta responde directamente.

**Respuesta `200`** —

```json
{ "status": "ok", "uptime_seconds": 42, "timestamp": "2026-10-23T17:15:48.123Z" }
```

`uptime_seconds` es `Math.floor(process.uptime())`: un entero de segundos desde que arrancó el proceso. `timestamp` sale en ISO 8601 UTC con milisegundos, igual que el resto de las fechas de la API.

**Liveness, no readiness** — La ruta no consulta PostgreSQL ni ninguna dependencia. Devuelve `200` mientras el proceso pueda atender HTTP. Esa es la señal que un supervisor usa para decidir si reinicia: si midiera la base, un hipo de conexión devolvería un estado de falla y el supervisor reiniciaría un servidor sano en bucle.

**Sin caché** — Como vive fuera de `/api/v1`, no pasa por `registerHttpCache` ni emite `ETag` ni `Cache-Control` de revalidación: un monitor siempre recibe el estado actual.

**Sin efecto en el contrato** — No acepta query, no acepta cuerpo, no valida entrada y no aparece en `modules/api/`. No hay `GET /api/v1/health`: esa ruta responde `404`, porque dentro del prefijo la lista cerrada sigue intacta.

---

## Dashboard

### `GET /api/v1/dashboard/summary`

**DTO** — `DashboardQuerySchema` en `dashboard/presentation/dashboard.dto.ts`. Declara `start_date` y `end_date` como `z.coerce.date().optional()`, ambos en ISO 8601. Si no llegan, el servicio usa el rango por defecto documentado en `modules/api/01-dashboard.md`.

**Servicio** — `createDashboardService(repository).getSummary(query)`. No transforma nada: delega en el repositorio y devuelve el resultado ya mapeado a cadenas decimales.

**Repositorio** — `createDashboardRepository(db).getSummary`. Ejecuta cuatro consultas de agregación en paralelo con `Promise.all`:

```ts
const [[countRow], [costRow], [itemsRow], [expenseRow]] = await Promise.all([
  db.select({ value: count() }).from(sale).where(saleFilter),
  db.select({ value: sum(sale.cost) }).from(sale).where(saleFilter),
  db.select({ value: sum(additionalSale.total) }).from(additionalSale)
    .innerJoin(sale, eq(additionalSale.saleId, sale.id))
    .where(and(isNull(additionalSale.deletedAt), saleFilter)),
  db.select({ value: sum(expense.total) }).from(expense).where(expenseWhere),
])
```

`total_revenue` se obtiene sumando los dos importes con `sumMoney([saleCost, additionalTotal])`, que usa `new Decimal(a).plus(b)` de `decimal.js`. **Nunca** `a + b`, que en JavaScript produciría un número de punto flotante. `sum()` de Drizzle devuelve `string` (o `null`); cuando el agregado es `null` (no hay filas en el rango), el mapper lo reemplaza por `"0"` antes de sumar, y el resultado se serializa como `"0.00"`.

`pending_packages_count` sigue la definición de la decisión D-007: paquetes no borrados lógicamente con `package_date` dentro del rango.

**Regla de exclusión** — Solo se excluyen registros con `deleted_at` no nulo. El `status` de la venta no filtra los agregados. Ver decisión D-008.

**Errores** — `400 BAD_REQUEST` si las fechas no parsean.

---

## Ventas

### `POST /api/v1/sales/live`

**DTO** — `CreateLiveSaleDtoSchema`. Es `z.object({...}).strict().superRefine(bankRule)`. El `.strict()` es lo que rechaza un payload con `additional_items`: Zod produce el issue `unrecognized_keys` y el `errorHandler` responde `400` con el mensaje `value: Unrecognized key(s) in object: 'additional_items'`.

**El cliente es opcional de contado y obligatorio a crédito (S63).** Las dos altas comparten el `superRefine` de las reglas cruzadas y la misma regla del cliente. `customer_id` y `customer_name` siguen siendo excluyentes —mandar las dos responde `400` con `customer_name: Send customer_name or customer_id, not both`— pero ya no son obligatorias en una venta de contado: sin ninguna de las dos claves el alta es válida. Con `payment_terms: "credit"` el cliente sigue siendo obligatorio, porque una deuda sin cliente no tiene a quién cobrarle: sin las dos claves responde `400` con `customer_id: Send customer_id or customer_name`.

**Sin cliente, el servidor pone el nombre de la factura y no toca el padrón (S63).** `prepareCreate` guarda `customer_name: "Consumidor Final"` —la constante `GENERIC_CUSTOMER_NAME` de `sales/domain/sales.entities.ts`— y deja `customer_id` en `NULL` **sin resolver ni crear una fila en `customer`**: la lista de clientes sigue siendo de gente con nombre, no de ventas anónimas. Es la razón por la que la pantalla no manda el nombre genérico: si viajara como `customer_name`, el servicio lo resolvería contra el padrón —`resolveCustomerByName`— y crearía el cliente «Consumidor Final» que la regla prohíbe. Un `customer_name` escrito que queda vacío al recortarlo sigue siendo `400 customer_name: Customer name is required`, y un `customer_id` inexistente sigue siendo `400 customer_id: Customer not found`.

**Con `customer_id` nulo y el nombre genérico, los consumidores no cambian.** El listado y el detalle devuelven las dos columnas tal como están —`customer_name` es la instantánea de la factura y `customer_id` ya era nullable en el contrato—, la factura imprime el nombre, el detalle deja el nombre como texto sin enlace al padrón (`customerLink` ya trataba el `null`, que era el caso de las ventas históricas) y el dashboard no usa el cliente. Los saldos por cliente tampoco lo ven: una venta a crédito siempre lleva cliente, así que la proyección de `customers` no tiene una venta anónima que agrupar.

**Servicio** — `createSaleService(...).createLive(data)`. Valida la invariante de dominio en el servicio además de la del DTO: si por cualquier vía llegaran adicionales, lanza `new BadRequestError("Live sales cannot include additional items")`.

**Repositorio** — `createSaleRepository(db).createWithNoAdditional(data)`. Un `db.insert(sale).values(...).returning()` con las columnas del listado. No hay transacción porque hay una sola escritura; el `id` y el `updatedAt` se generan en el código porque ninguna de las dos columnas tiene default en la base.

### `POST /api/v1/sales/whatsapp`

**DTO** — `CreateWhatsappSaleDtoSchema`. Igual que el anterior más `additional_items: z.array(AdditionalItemDtoSchema).min(1).optional()`. Cada artículo valida `name` (string, 1 a 200 caracteres), `description` (string opcional, hasta 500), `quantity` (`z.coerce.number().int().min(1)`, por defecto 1) y `total` (`MONEY_PATTERN`). El arreglo acepta hasta 50 elementos.

La lista es **opcional** porque la regla de negocio dice "puede tener" artículos adicionales, no "debe tener". Cuando viene presente, debe traer al menos uno.

**Servicio** — `createSaleService(...).createWhatsapp(data)`. Pasa los artículos al repositorio y calcula el total derivado para la respuesta.

**Repositorio** — `createSaleRepository(db).createWithAdditional(data)`. Una sola transacción:

```ts
return db.transaction(async (tx) => {
  const [row] = await tx.insert(sale)
    .values({ ...data, id: randomUUID(), updatedAt: now })
    .returning()
  if (data.additional_items?.length) {
    const items = await tx.insert(additionalSale)
      .values(data.additional_items.map((item) => ({ ...item, saleId: row.id, id: randomUUID(), updatedAt: now })))
      .returning()
    return toSaleEntity(row, items)
  }
  return toSaleEntity(row, [])
})
```

Los renglones se devuelven con `.returning()` dentro de la misma transacción, de modo que no hace falta una relectura posterior.

**Errores** — `400 BAD_REQUEST` con el campo cuando `payment_method` es `credit_card` y falta `payment_bank`, o cuando es `cash` y viene informado. `400 BAD_REQUEST` con `value: Unrecognized key(s) in object: 'additional_items'` en la variante `live`.

### `GET /api/v1/sales`

**DTO** — `SalesQuerySchema`: `start_date`, `end_date` (fechas opcionales), `type: z.enum(["live", "whatsapp"]).optional()`, `status: z.enum(["pending", "completed", "cancelled"]).optional()`. Sin `page` ni `limit`.

**Repositorio** — `createSaleRepository(db).findAll(params)`. Arma la lista de condiciones (`SQL[]`) siempre con `isNull(sale.deletedAt)`, agrega los filtros presentes, y hace un `leftJoin` con `additional_sale` (`deleted_at IS NULL` en la condición del JOIN) para traer el `cost` de la venta y el `total` de cada renglón en la **misma** consulta, sin una segunda vuelta a la base. Ordena por `sale_date` y luego por `id`, ambos descendentes, para que el resultado sea determinista.

**Mapper** — `mapSaleToDetailResponse(sale)`. Devuelve las columnas de la venta más `category`, `shipment_method`, `amount_paid`, `change_given`, `additional_items`, `additional_count`, `total`, `customer_id`, `payment_terms`, `due_date`, `paid_total`, `balance`, `is_overdue`, `payments` y `payments_count`. `paid_total` es la suma del libro vivo y `balance` es `total − paid_total` en una venta a crédito o `null` en una de contado: los dos se calculan acá, no se leen de la base.

**Mapper del listado** — `mapSaleListRow(row)`. Devuelve `id`, `sale_date`, `customer_name`, `product_name`, `type`, `status`, `cost`, `payment_method`, `shipment_method`, `additional_count`, `total`, `customer_id`, `payment_terms`, `due_date`, `paid_total`, `balance` e `is_overdue`. No devuelve `category` ni `payment_bank` ni los artículos ni los pagos: el listado es compacto y la tabla del panel no los muestra.

### `GET /api/v1/sales/:id`

**DTO** — `SaleIdParamSchema`: `id: z.string().uuid("Sale id must be a valid UUID")`. Un identificador que no sea UUID produce `400`, no `404`.

**Repositorio** — `SaleRepository.findById(id)` con `where: { id, deleted_at: null }` y el `saleSelect` completo, que incluye `additional_items` y `payments` (los dos filtrados por `deleted_at: null`), con `additional_items` ordenado por `created_at, id` y `payments` por `paid_at, id`. **No hay `packages`**: la tabla no existe y la selección no la menciona.

**Servicio** — Si el repositorio devuelve `null`, lanza `new NotFoundError("Sale not found")`. Nunca devuelve una venta parcialmente poblada.

### `PATCH /api/v1/sales/:id/status`

**DTO** — `SaleIdParamSchema` y `UpdateSaleStatusDtoSchema: z.object({ status: z.enum(["pending", "completed", "cancelled"]), amount_paid: z.string().refine(isMoneyString, MONEY_MESSAGE).optional() })`, ambos `.strict()`.

Con la venta a crédito, este endpoint dejó de ser el único que modifica una venta: el método de envío tiene su propia sub-ruta y el libro de pagos tiene `POST` y `DELETE`. Sigue siendo el **único** que cambia el estado, y el que registra el cobro del mostrador. No hay `PUT /api/v1/sales/:id` ni `PATCH /api/v1/sales/:id` general, deliberadamente: el importe y los artículos de una venta registrada no se editan, se cancelan. Editarlos sería la vía para que el total derivado quedara inconsistente con lo que el cliente ya pagó.

**Servicio** — Primero `findById` para confirmar que existe y no está borrada (`NotFoundError` si no). Después resuelve el cobro y llama a `updateStatus`:

| Situación | Resultado |
|-----------|-----------|
| La venta está `cancelled` | `ConflictError` con el mensaje de venta cancelada, antes de resolver el cobro: un `409` no deja efectos secundarios |
| `payment_terms = 'credit'` y el estado pedido no es `cancelled` | `ConflictError` con `La venta de "<nombre>" es a crédito: se cobra registrando pagos, no cambiando el estado.` |
| `status = 'completed'` sin `amount_paid` | `BadRequestError("amount_paid is required to complete a sale")` |
| `completed` con `credit_card` y `amount_paid ≠ total` | `BadRequestError("amount_paid must equal the total for a card sale: expected <total>")` |
| `completed` con `cash` y `amount_paid < total` | `BadRequestError("amount_paid is insufficient: short by <monto>")`. Con `amount_paid > total` el vuelto se deriva en `change_given` |

El repositorio escribe el estado y, en la **misma transacción**, el pago de mostrador en `sale_payment`: lo crea o lo actualiza al pasar a `completed` y lo borra lógicamente al salir de `completed`. Devuelve el detalle completo con el total recalculado, para que el frontend pueda imprimir sin una segunda petición.

**Semántica de transiciones** — El endpoint acepta cualquier valor del enum, incluidas las transiciones a un estado ya ocupado, **salvo dos excepciones**: desde `cancelled` no se sale (`409`), y sobre una venta a crédito sólo se acepta `cancelled` (`409` en `completed` y en `pending`). No hay máquina de estados más allá de esas dos: la razón es que la dueña necesita poder corregir un estado mal tipeado sin intervención técnica, y el estado de cobro de una venta a crédito lo deciden los pagos.

---

### `PATCH /api/v1/sales/:id/shipment-method`

**DTO** — `SaleIdParamSchema` y `UpdateShipmentMethodDtoSchema: z.object({ shipment_method: z.enum(["cargotrans", "delivery", "pickup", "unassigned"]) })`, ambos `.strict()`. Un cuerpo con otra clave produce `400`.

**Servicio** — `findById` primero y `NotFoundError("Sale not found")` si la venta no existe o está borrada; después `updateShipmentMethod`. No hay regla de estado: una venta cancelada también puede corregir su método de envío.

**Repositorio** — `SaleRepository.updateShipmentMethod` escribe `shipment_method` y `updated_at` y devuelve la entidad completa. El controlador responde `200` con `mapSaleToDetailResponse`, el mismo detalle del resto de las sub-rutas. Es el endpoint que consume el `change` del select de la pantalla de paquetes (`frontend/src/lib/packages/shipment-status.ts`).

---

### `POST /api/v1/sales/:id/payments`

**DTO** — `SaleIdParamSchema` y `CreateSalePaymentDtoSchema`, `.strict()`: `amount` con `MONEY_PATTERN`, `paid_at: z.coerce.date().optional()` (por defecto el instante del alta), `payment_method: z.enum(["cash", "credit_card"])`, `payment_bank: z.string().max(100).optional()` y `note: z.string().max(500).nullish()`. Reutiliza el mismo `superRefine` de la regla condicional del banco que el alta de la venta.

**Servicio** — `createSaleService(...).createPayment(id, data)` abre una transacción, bloquea la fila de la venta (`SELECT ... FOR UPDATE`) y aplica las guardas en este orden: venta viva (`NotFoundError("Sale not found")`), no cancelada (`ConflictError` con el mensaje de venta cancelada), a crédito (`ConflictError` con el mensaje de venta de contado), monto mayor que cero y menor o igual al saldo (`BadRequestError` con el saldo esperado). La suma del libro se hace **dentro** de la transacción que tiene el lock, que es lo que impide que dos cobros simultáneos superen el total.

**Repositorio** — `SaleRepository.createPayment` inserta el renglón en `sale_payment`, vuelve a sumar los pagos vivos, escribe `sale.amount_paid` con esa suma y pone `status = 'completed'` si el saldo llegó a cero. `change_given` no se toca: un abono nunca genera vuelto. Responde `201` con el detalle completo.

---

### `DELETE /api/v1/sales/:id/payments/:paymentId`

**DTO** — `SaleIdParamSchema` y `SalePaymentIdParamSchema: z.object({ paymentId: z.string().uuid("Payment id must be a valid UUID") })`, los dos `.strict()`.

**Servicio** — Mismas guardas que el alta —venta viva, no cancelada, a crédito— y además el pago tiene que pertenecer a esa venta y estar vivo (`NotFoundError("Payment not found")` si no). No existe un `PATCH` de un pago: corregir un monto es borrarlo y volver a registrarlo.

**Repositorio** — `SaleRepository.deletePayment` escribe `deleted_at` en el pago, vuelve a sumar el libro y escribe `sale.amount_paid`; si el saldo deja de ser cero y la venta estaba `completed`, la devuelve a `pending` en la misma transacción. Responde `200` con el detalle completo.

---

## Paquetes (historia)

**Este módulo no existe en el código.** No hay `backend/src/modules/packages/`, no hay rutas de `/api/v1/packages` y no hay tabla `package` en el esquema. Lo que sigue se conserva como registro de la versión anterior del sistema y **no** forma parte de los veintiún endpoints.

### `POST /api/v1/packages`

**DTO** — `CreatePackageDtoSchema`: `name: z.string().min(1).max(200)`, `package_date: z.coerce.date().optional()` (por defecto el instante actual), `method: z.enum(["cargotrans", "delivery", "retiro"])`, `sale_id: z.string().uuid().nullish()`. Con `.strict()`.

**Repositorio** — `PackageRepository.create`. Si `sale_id` viene informado y no corresponde a una venta existente, PostgreSQL viola la clave foránea (código `23503`) y el manejador la traduce a `400 BAD_REQUEST` con `"Sale not found"`. La comprobación previa con una consulta extra se evita a propósito: la clave foránea ya garantiza la integridad y una consulta extra duplicaría la latencia de una escritura.

### `GET /api/v1/packages`

**DTO** — `PackagesQuerySchema`: `start_date`, `end_date`, `method: z.enum([...]).optional()`, `sale_id: z.string().uuid().optional()`.

**Repositorio** — `PackageRepository.findAll` con `deleted_at: null`, orden `package_date: "desc"` y luego `id: "desc"`. El `saleSelect` equivalente trae `id`, `name`, `package_date`, `method`, `sale_id`, `created_at`, `updated_at`.

**Nota de contrato** — El listado no incluye el nombre de la venta enlazada. El panel muestra el identificador corto de la venta (`sale_id` truncado a 8 caracteres) como enlace. Incorporar el `customer_name` de la venta exigiría un `include` anidado que no aporta a la tabla del panel.

### `PUT /api/v1/packages/:id`

**DTO** — `UpdatePackageDtoSchema`, con la **misma forma que el de alta**: `name` (1 a 200), `package_date` (opcional, por defecto el instante actual), `method` (enum) y `sale_id` (`nullish`). Es `.strict()` y **todos los campos son obligatorios salvo `sale_id`**. El método es, por tanto, un **reemplazo completo**, no un parche: un `PUT` con un solo campo produce `400` con la lista de claves faltantes.

`PUT` con reemplazo completo y no `PATCH` con actualización parcial es una decisión consciente. La operación que la dueña necesita es "corregir el registro del paquete", y el caso real de error —un paquete vinculado a la venta equivocada— se resuelve enviando `sale_id: null` o el identificador correcto dentro de un cuerpo completo. Un `PATCH` obligaría a distinguir "no enviado" de "enviado como `null`", que es exactamente la ambigüedad que `sale_id: nullish()` ya resuelve.

**Servicio** — `findById` primero, `NotFoundError` si no existe o está borrado lógicamente, después `update`.

**Efecto colateral explícito** — Enviar `sale_id: null` **desvincula** el paquete de su venta. Es intencional: la dueña puede haberse equivocado al vincularlo.

### `DELETE /api/v1/packages/:id`

**Servicio** — `findById` y luego `softDelete`, que ejecuta `prisma.package.update({ where: { id }, data: { deleted_at: new Date() } })`. Responde `200` con `{ "message": "Package deleted successfully" }`, siguiendo la forma del `delete` del andamiaje. Un `204` sin cuerpo también sería válido; se elige `200` con mensaje para que el frontend pueda mostrar confirmación sin inventar el texto.

**El paquete sobrevivía a su venta.** Como nada se borra físicamente (decisión D-004), la regla `onDelete: SetNull` de `package.sale_id` nunca llegaba a activarse. Esta sección describe el comportamiento de la versión anterior del sistema; hoy no hay paquetes que sobrevivan a nada porque no hay paquetes.

---

## Clientes

El módulo `customers` se registra en `src/app.ts` con `{ prefix: "/customers" }` y sigue el mismo esqueleto que los otros cuatro: `domain` (entidades y puerto), `application` (servicio), `infrastructure` (repositorio de Drizzle) y `presentation` (rutas, controlador, DTO y mapper).

### `POST /api/v1/customers`

**DTO** — `CreateCustomerDtoSchema`: `name: z.string().min(1).max(200)`, `phone: z.string().max(30).nullish()`, `note: z.string().max(500).nullish()`. Con `.strict()`. No hay restricción de unicidad: dos clientes con el mismo nombre son dos clientes.

**Repositorio** — `CustomerRepository.create` inserta la fila con `id` y `updatedAt` generados en el código, porque ninguna de las dos columnas tiene default en la base. Responde `201` con el cliente.

### `GET /api/v1/customers`

**DTO** — `CustomersQuerySchema`: `q: z.string().optional()` e `include_balances: z.enum(["true", "false"]).optional()`, con `.strict()`. `include_balances` se transforma a booleano en el DTO, igual que `include_kpis` en el listado de ventas.

**Repositorio** — `CustomerRepository.findAll({ q, include_balances })` filtra `deleted_at: null`, aplica `q` como `ILIKE '%q%'` sobre `name` **o** `phone` —escapando `%` y `_`— y ordena por `name` y después por `id`, los dos ascendentes. Con `include_balances` agrega los dos saldos con una subconsulta sobre las ventas a crédito no borradas, no canceladas y con saldo positivo, sumando `total − paid_total` y, para `overdue_balance`, filtrando `due_date` en el pasado. Los dos saldos se serializan como cadena decimal con `toMoneyString`; cuando no hay deuda el agregado es `null` y el mapper lo reemplaza por `"0.00"`.

### `PATCH /api/v1/customers/:id`

**DTO** — `CustomerIdParamSchema` y `UpdateCustomerDtoSchema`: las tres claves del alta, todas opcionales, con `.strict()` y un `refine` que exige **al menos una** clave. Un `{}` produce `400`.

**Servicio** — `findById` primero (`NotFoundError("Customer not found")`) y después `update`. Devuelve el cliente completo con `updated_at` nuevo. Las ventas no se tocan: `sale.customer_name` es una instantánea y renombrar no reescribe facturas.

### `DELETE /api/v1/customers/:id`

**Servicio** — `findById`, despuís una consulta de saldo pendiente y después `softDelete`. Si el cliente tiene ventas a crédito con saldo pendiente, lanza `ConflictError` con `El cliente "<nombre>" tiene ventas a crédito con saldo pendiente: cobralas o cancelalas antes de borrarlo.` El cálculo del saldo es el mismo del listado, así que el `409` y el número que se ve en pantalla no pueden discrepar.

**Repositorio** — `CustomerRepository.softDelete` escribe `deleted_at` y nada más. No toca `sale.customer_id` ni `sale.customer_name`. Responde `200` con `{ "message": "Customer deleted successfully" }`, la misma forma del borrado de gastos.

---

## Gastos

### `POST /api/v1/expenses`

**DTO** — `CreateExpenseDtoSchema`: `name: z.string().min(1).max(200)`, `description: z.string().max(500).nullish()`, `total` con `MONEY_PATTERN`, `expense_date: z.coerce.date().optional()` (por defecto el instante actual, igual que el `default(now())` de la columna). Con `.strict()`.

### `GET /api/v1/expenses`

**DTO** — `ExpensesQuerySchema`: `start_date` y `end_date` opcionales. Sin paginación.

**Repositorio** — `ExpenseRepository.findAll` con `deleted_at: null`, orden `expense_date: "desc"` y luego `id: "desc"`.

### `DELETE /api/v1/expenses/:id`

Idéntico en forma al borrado de paquetes. `ExpenseRepository.softDelete` escribe `deleted_at`. Responde `200` con `{ "message": "Expense deleted successfully" }`.

**No existe `PUT /api/v1/expenses/:id`.** Un gasto registrado por error se borra lógicamente y se vuelve a crear. La lista de los veintiún endpoints es cerrada y esta ausencia es intencional.

---

## Manejo de errores

Un solo manejador, en `src/config/error-handler.ts`, registrado con `app.setErrorHandler(errorHandler)` en `src/app.ts`. Orden de resolución:

| Origen | Estado | Código | Mensaje |
|--------|--------|--------|---------|
| `ZodError` | `400` | `BAD_REQUEST` | `<campo>: <mensaje del primer issue>`; si el issue no tiene ruta, el prefijo es `value`. |
| `AppError` | el de la marca | el de la marca | El mensaje de la marca, más `details` si lo tiene. |
| Cualquier otro | `500` | `INTERNAL_ERROR` | `"Internal server error"`, fijo. El detalle va solo al log. |

Los códigos `UNAUTHORIZED` y `FORBIDDEN` existen en `AppError.ts` y en `ErrorMessages` y **los emiten los endpoints**: `UNAUTHORIZED` en el login (credenciales inválidas) y en el guard de sesión (sin cookie, token desconocido o sesión revocada); `FORBIDDEN` en `POST /users` cuando la sesión no es de un administrador. El `429` del plugin de rate limit —el global de 1000 por minuto y el de 10 que declara el login— pasa por este mismo manejador, así que también sale con la forma `{ "code", "message" }`.
