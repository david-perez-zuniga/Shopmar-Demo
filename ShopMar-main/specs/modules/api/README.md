# Contrato de la API

Siete documentos con el contrato público de los veintiún endpoints de negocio y de los cuatro de acceso. La Implementación de cada uno —qué función de qué módulo lo atiende— está en `modules/backend/03-api.md`. Aquí está lo que un cliente puede observar: rutas, cuerpos, respuestas y errores.

## Documentos

| Documento | Endpoints |
|-----------|-----------|
| [`01-dashboard.md`](01-dashboard.md) | `GET /api/v1/dashboard/summary` · `GET /api/v1/dashboard/packages/kpis` · `GET /api/v1/dashboard/daily-series` · `GET /api/v1/dashboard/by-channel` · `GET /api/v1/dashboard/by-shipment` |
| [`02-sales.md`](02-sales.md) | `POST /api/v1/sales/live` · `POST /api/v1/sales/whatsapp` · `GET /api/v1/sales` · `GET /api/v1/sales/with-details` · `GET /api/v1/sales/:id` · `PATCH /api/v1/sales/:id/status` · `PATCH /api/v1/sales/:id/shipment-method` · `POST /api/v1/sales/:id/payments` · `DELETE /api/v1/sales/:id/payments/:paymentId` |
| [`03-packages.md`](03-packages.md) | **Historia, no contrato vigente.** Documenta cuatro endpoints de paquetes que **no existen** en el código: no hay rutas de `/api/v1/packages` ni tabla `package`. Se conserva como registro de la versión anterior y **no cuenta** en el inventario de veintiún endpoints. |
| [`04-expenses.md`](04-expenses.md) | `POST /api/v1/expenses` · `GET /api/v1/expenses` · `DELETE /api/v1/expenses/:id` |
| [`05-convenciones.md`](05-convenciones.md) | Prefijo, envoltura, tipos compartidos, el sobre de error, códigos, CORS, límites y la lista completa |
| [`06-customers.md`](06-customers.md) | `POST /api/v1/customers` · `GET /api/v1/customers` · `PATCH /api/v1/customers/:id` · `DELETE /api/v1/customers/:id` |
| [`07-auth.md`](07-auth.md) | **Contrato de acceso, no cuenta en los veintiún endpoints.** `POST /api/v1/auth/login` · `POST /api/v1/auth/logout` · `GET /api/v1/auth/me` · `POST /api/v1/users`. Cookie de sesión, roles `seller` y `admin`, rate limit de 10/min en el login y el primer administrador por CLI (D-024). |

## Prefijo y alcance

Los veintiún endpoints cuelgan de `/api/v1` y solo hay veintiún, repartidos en cuatro módulos: **dashboard** (5), **ventas** (9), **clientes** (4) y **gastos** (3). No hay versión `v2`, no hay `/health` de negocio —el proceso expone `GET /health` fuera del prefijo, como control de vida, y no forma parte de este contrato—, no hay endpoints de diagnóstico, no hay carga masiva, no hay exportación, no hay búsqueda de ventas —la única búsqueda es `q` en `GET /api/v1/customers`—, no hay paginación salvo la opcional de `GET /api/v1/sales` (D-011), no hay ordenamiento configurable, no hay filtros combinables más allá de los documentados.

Los cuatro endpoints de paquetes que documenta [`03-packages.md`](03-packages.md) **no existen** en el código: no hay rutas de `/api/v1/packages`, no hay tabla `package` y el módulo `packages` no está registrado. Ese archivo se conserva como historia y no entra en el conteo.

**Los cuatro endpoints de acceso se suman a los veintiún de negocio, y no se mezclan con ellos.** `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` y `POST /users` viven en [`07-auth.md`](07-auth.md) y son el contrato de acceso: el inventario de negocio sigue siendo de veintiún endpoints y así se cuenta en todo el árbol de specs. La diferencia no es cosmética —un endpoint de acceso no devuelve datos del negocio y su contrato cambia con el mecanismo de sesión, no con el modelo de la tienda—.

**La ausencia de un endpoint es parte del contrato.** No hay `DELETE /api/v1/sales/:id`, no hay `PUT /api/v1/expenses/:id`, no hay `GET /api/v1/products`, no hay `GET /users`, ni `PATCH /users/:id`, ni `DELETE /users/:id`. Cada una de esas ausencias está justificada en el documento del módulo correspondiente.

## Convenciones que atraviesan todos los endpoints

| Convención | Regla |
|------------|-------|
| **Prefijo** | `/api/v1` en todas las rutas. |
| **Autenticación** | **Sesión por cookie.** `POST /auth/login` y `POST /auth/logout` son públicos (el logout es idempotente); el resto de `/api/v1` exige la cookie `shpr_session` (`HttpOnly`, token opaco, sin vencimiento) y responde `401` sin ella. `POST /users` exige además rol `admin`. Decisión D-024 y contrato en [`07-auth.md`](07-auth.md). |
| **Contenido** | Peticiones con cuerpo: `Content-Type: application/json`. Respuestas: `application/json; charset=utf-8`. |
| **Validación** | Todo cuerpo, query y parámetro se valida con Zod en el controlador. Un parámetro inválido produce `400`, nunca `500`. |
| **Dinero** | Cadena decimal en la entrada y en la salida. `"1250.50"`, nunca `1250.50`. Decisión D-003. |
| **Fechas** | Entrada en ISO 8601. Salida en ISO 8601 UTC con milisegundos: `"2026-09-28T15:30:00.000Z"`. |
| **Enumeraciones** | Valores en minúsculas y `snake_case`. El sistema habla inglés; la traducción a español es del frontend. |
| **Identificadores** | UUID v4 en todas las rutas con `:id`. Un valor que no sea UUID produce `400`, no `404`. |
| **Envoltura** | Los listados devuelven `{ "<recurso>": [...] }`. Los detalles devuelven el objeto directo. |
| **Paginación** | Opcional, y sólo en `GET /api/v1/sales`: `page` y `per_page` viajan juntos y la respuesta trae `total`. Con `include_kpis=true` trae además el conteo por `shipment_method` del conjunto filtrado. El resto de los listados devuelve el conjunto completo. Decisiones D-006, D-011 y D-012. |
| **Borrado** | `DELETE` es siempre lógico: escribe `deleted_at`. Nunca hay borrado físico. Decisión D-004. |
| **Errores** | Siempre el mismo sobre: `{ "code", "message" }` con `details` opcional. Ver `05-convenciones.md`. |

## Los veintiún endpoints

| # | Método | Ruta | Respuesta |
|---|--------|------|-----------|
| 1 | `GET` | `/api/v1/dashboard/summary` | `200` con los cuatro indicadores |
| 2 | `GET` | `/api/v1/dashboard/packages/kpis` | `200` con el conteo por `shipment_method` |
| 3 | `GET` | `/api/v1/dashboard/daily-series` | `200` con la serie diaria del rango |
| 4 | `GET` | `/api/v1/dashboard/by-channel` | `200` con el desglose por canal |
| 5 | `GET` | `/api/v1/dashboard/by-shipment` | `200` con el desglose por método de envío |
| 6 | `POST` | `/api/v1/sales/live` | `201` con el detalle de la venta |
| 7 | `POST` | `/api/v1/sales/whatsapp` | `201` con el detalle de la venta y sus artículos |
| 8 | `GET` | `/api/v1/sales` | `200` con `{ "sales": [...], "total": n }` |
| 9 | `GET` | `/api/v1/sales/with-details` | `200` con `{ "sales": [...], "total", "page", "per_page", "has_more" }` |
| 10 | `GET` | `/api/v1/sales/:id` | `200` con el detalle de la venta |
| 11 | `PATCH` | `/api/v1/sales/:id/status` | `200` con el detalle de la venta |
| 12 | `PATCH` | `/api/v1/sales/:id/shipment-method` | `200` con el detalle de la venta |
| 13 | `POST` | `/api/v1/sales/:id/payments` | `201` con el detalle de la venta y el libro actualizado |
| 14 | `DELETE` | `/api/v1/sales/:id/payments/:paymentId` | `200` con el detalle de la venta y el libro actualizado |
| 15 | `POST` | `/api/v1/customers` | `201` con el cliente creado |
| 16 | `GET` | `/api/v1/customers` | `200` con `{ "customers": [...] }` |
| 17 | `PATCH` | `/api/v1/customers/:id` | `200` con el cliente actualizado |
| 18 | `DELETE` | `/api/v1/customers/:id` | `200` con `{ "message": "..." }` |
| 19 | `POST` | `/api/v1/expenses` | `201` con el gasto creado |
| 20 | `GET` | `/api/v1/expenses` | `200` con `{ "expenses": [...] }` |
| 21 | `DELETE` | `/api/v1/expenses/:id` | `200` con `{ "message": "..." }` |

## Los códigos de estado que aparecen

| Código | Cuándo | Dónde se documenta |
|--------|--------|--------------------|
| `200 OK` | Lectura, actualización y borrado lógico | Cada endpoint |
| `201 Created` | Alta de venta, de pago, de cliente o de gasto | Cada endpoint |
| `400 BAD_REQUEST` | Violación de Zod: tipo, rango, enum, formato de fecha, formato de importe, clave desconocida, UUID inválido, regla condicional del banco | `05-convenciones.md` |
| `404 NOT_FOUND` | El recurso no existe **o** está borrado lógicamente | Cada endpoint |
| `409 CONFLICT` | La operación contradice un invariante: cambiar el estado de una venta cancelada, marcar cobrada una venta a crédito por el selector, pedir un pago sobre una venta de contado, borrar un cliente con saldo pendiente, dar de alta un usuario con un `username` o `email` que ya existe | `02-sales.md`, `06-customers.md` y `07-auth.md` |
| `401 UNAUTHORIZED` | Credenciales inválidas en el login, o pedido a `/api/v1` sin cookie válida, con token desconocido o con la sesión revocada | [`07-auth.md`](07-auth.md) |
| `403 FORBIDDEN` | Un `seller` llama a `POST /api/v1/users` | [`07-auth.md`](07-auth.md) |
| `429 TOO_MANY_REQUESTS` | Se superó el límite de 1000 peticiones por minuto. El 429 del login, con su límite propio de 10 por minuto, usa el código `RATE_LIMITED` | `05-convenciones.md` y [`07-auth.md`](07-auth.md) |
| `500 INTERNAL_ERROR` | Fallo no previsto. El detalle real solo va al log. | `05-convenciones.md` |

**401, 403 y 429 son parte del camino normal desde D-024.** Sin sesión válida todo `/api/v1` responde `401`; un `seller` que llama al alta de usuarios recibe `403`; y el login tiene su propio límite de 10 intentos por minuto. El `409` empezó a usarse con la venta a crédito (D-022), porque hay operaciones que chocan con un invariante del negocio y no con el formato de la entrada, y el alta de usuarios le sumó sus dos conflictos de unicidad.

## Códigos de error

Ocho códigos emite la API y uno más vive solo en el cliente. Todos salen de una clase de `src/core/errors/AppError.ts` salvo `TOO_MANY_REQUESTS`, que el manejador deriva del estado HTTP cuando el error no trae código propio (el caso del límite global de 1000 por minuto):

| Código | HTTP | Significado |
|--------|------|-------------|
| `BAD_REQUEST` | 400 | El cuerpo, el query o el parámetro no cumple el esquema. |
| `UNAUTHORIZED` | 401 | Credenciales inválidas en `POST /auth/login` o pedido sin sesión válida en cualquier otra ruta de `/api/v1`. |
| `FORBIDDEN` | 403 | `POST /api/v1/users` llamado por un `seller`. |
| `NOT_FOUND` | 404 | El recurso no existe o está borrado lógicamente. |
| `CONFLICT` | 409 | La operación contradice un invariante del negocio, o el alta de usuarios choca con `username` o `email` ya existentes. |
| `RATE_LIMITED` | 429 | Se superó el límite de 10 intentos por minuto de `POST /auth/login`. |
| `TOO_MANY_REQUESTS` | 429 | Se superó el límite global de 1000 peticiones por minuto. Es el que el manejador deriva del estado, sin código propio. |
| `INTERNAL_ERROR` | 500 | Fallo no previsto. El detalle va al log. |
| `NETWORK_ERROR` | — | Solo del lado del cliente. La API nunca lo emite. |

## Los recursos y sus formas

Seis recursos, seis formas JSON: las cinco del negocio y la del usuario de la sesión. Todas definidas en `modules/api/05-convenciones.md` —más la de usuario en [`07-auth.md`](07-auth.md)— y reflejadas como interfaces en el backend; el frontend las replica en `frontend/src/lib/core/types.ts`.

| Recurso | Forma | Dónde se serializa |
|---------|-------|--------------------|
| Resumen del dashboard | `IDashboardSummary` | `dashboard.mappers.ts` |
| Venta de listado | `ISaleListRow` | `sales.mappers.ts` |
| Venta de detalle | `ISaleDetail` | `sales.mappers.ts` |
| Cliente | `ICustomerResponse` (con saldos: `ICustomerWithBalancesResponse`) | `customers.mappers.ts` |
| Gasto | `IExpense` | `expenses.mappers.ts` |
| Usuario | `IUser` (`id`, `username`, `email`, `role`) y `IUserCreated` (lo mismo más `created_at`) | `auth.mappers.ts` · `users.mappers.ts`, contrato en [`07-auth.md`](07-auth.md) |

La venta tiene **dos** formas porque el listado y el detalle devuelven información distinta. El listado trae `additional_count`, `total`, `payment_terms`, `due_date`, `paid_total`, `balance` e `is_overdue` calculados; el detalle trae `additional_items` con los artículos completos y `payments` con el libro de la venta. Mezclarlas en una sola forma obligaría al listado a traer los artículos y los pagos de cada fila, y con veinte ventas en pantalla eso son veinte cargas anidadas que el panel no usa.

## Reglas de negocio visibles en el contrato

Estas reglas no son detalles de implementación: un cliente que no las conozca no puede deducirlas del código. Están garantizadas por el esquema y por la base de datos, y son observables desde fuera.

| Regla | Dónde se hace cumplir | Observable como |
|-------|----------------------|-----------------|
| Una venta `live` no admite artículos adicionales | `.strict()` del DTO y `BadRequestError` del servicio | `400` si el payload trae `additional_items` |
| `payment_bank` es obligatorio con `credit_card` y prohibido con `cash` | `superRefine` de Zod y `CHECK` de PostgreSQL | `400` con el mensaje dirigido al campo |
| Los importes tienen hasta ocho enteros y dos decimales, sin signo | `MONEY_PATTERN` | `400` con el prefijo del campo |
| Nada se borra físicamente | `softDelete` en los repositorios | El recurso desaparece de todo listado; la fila sigue en la base |
| Un recurso borrado lógicamente responde `404`, no `200` | `findById` filtra `deleted_at: null` | `404 NOT_FOUND` |
| El total de una venta es derivado | Se calcula en el mapper, no hay columna | `total` siempre es `cost + suma de artículos` |
| Una venta con artículos adicionales se crea atómicamente | Transacción de Drizzle (`db.transaction`) | O hay venta con todos sus renglones, o no hay venta |
| Una venta a crédito exige cliente registrado y vencimiento | `CHECK` de PostgreSQL y `superRefine` del DTO | `400` con el mensaje dirigido al campo (`customer_id`, `due_date`) |
| El saldo de una venta sale del libro de pagos | `paid_total` = suma de pagos vivos; `balance` = `total − paid_total` | `balance` cambia sólo cuando se registra o se borra un pago |
| La suma de pagos vivos nunca supera el total | `SELECT ... FOR UPDATE` y la suma dentro de la misma transacción | Un segundo cobro que excedería el saldo recibe `400` |
| Un cliente con saldo pendiente no se borra | Servicio de `customers` | `409` con el nombre del cliente |
| Los listados excluyen lo borrado lógicamente | `deleted_at: null` en cada `where` | Un registro borrado no aparece en ningún listado |
| Las agregaciones excluyen lo borrado lógicamente y lo cancelado | `deleted_at: null` y `status <> 'cancelled'` en el `where` del repositorio de `dashboard`, replicado en `salesKpi()` | Una venta `cancelled` no suma ni en `total_revenue` ni en `sales_count` (D-008) |
