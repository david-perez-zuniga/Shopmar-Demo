# Convenciones de la API

Las reglas que atraviesan todos los endpoints: prefijo, envoltura, tipos compartidos, el sobre de error, códigos, CORS, límites y la lista cerrada de endpoints.

## Prefijo

Todos los endpoints cuelgan de `/api/v1`, registrado en `src/app.ts`:

```ts
await app.register(
  async (api) => {
    api.register(authRoutes, { prefix: "/auth" })
    api.register(usersRoutes, { prefix: "/users" })
    api.register(dashboardRoutes, { prefix: "/dashboard" })
    api.register(salesRoutes, { prefix: "/sales" })
    api.register(customersRoutes, { prefix: "/customers" })
    api.register(expensesRoutes, { prefix: "/expenses" })
  },
  { prefix: "/api/v1" },
)
```

Seis módulos registrados: los cuatro de negocio —`dashboard`, `sales`, `customers` y `expenses`— y los dos de acceso, `auth` y `users`. Los dos últimos no cuentan en los veintiún endpoints: son el contrato de acceso (D-024). **No hay `packagesRoutes`**: los cuatro endpoints de paquetes que documenta `03-packages.md` no existen en el código y ese archivo se conserva como historia.

**El prefijo es también el alcance del guard.** El guard de sesión se registra en ese mismo bloque, así que salvo las dos excepciones declaradas —`POST /auth/login` y el logout idempotente—, todo lo que cuelga de `/api/v1` exige cookie válida. No hay forma de agregar una ruta pública sin declararla como tal.

Un cliente llama a `/api/v1/sales` y nunca a `/sales`. La versión va en la ruta, no en una cabecera, y no hay otra versión.

## Envoltura de respuestas

| Tipo de endpoint | Envoltura |
|------------------|-----------|
| Listado | `{ "<recurso>": [...] }` |
| Detalle | El objeto directamente, sin envolver |
| Borrado lógico | `{ "message": "<texto>" }` |
| Error | `{ "code": "<CÓDIGO>", "message": "<texto>", "details"?: [...] }` |

El nombre de la clave es el del recurso en plural: `sales`, `customers`, `expenses`. El detalle y el alta no llevan envoltura, porque un objeto ya es un objeto y envolverlo obligaría al cliente a hacer `response.sale` para leer un `id`.

La envoltura de los listados no es un capricho de estilo: es el lugar donde van los metadatos cuando el sistema los necesite. Hoy no hay ninguno, y la forma sigue siendo la misma que cualquier cliente de API espera.

## Tipos compartidos

Cuatro tipos que aparecen en varios endpoints y que no se redefinen por endpoint.

### `IMoney`

```ts
type IMoney = string  // "1250.50"
```

Un alias, no una interfaz, y vale la pena. Un alias deja el nombre en la firma de la función, así que un `mapSaleToDetailResponse` declara que devuelve `IMoney` y no `string`, y un revisor lee "esto es dinero" sin abrir el archivo. Dentro de un mismo archivo, la firma con el alias comunica la intención igual de bien.

El alias también hace imposible la confusión: no hay forma de pasar un `number` donde se espera `IMoney` sin que TypeScript lo rechace.

### `IDateString`

```ts
type IDateString = string  // "2026-09-28T15:30:00.000Z"
```

Misma razón. La fecha **siempre** sale de la API en ISO 8601 UTC con milisegundos, con la `Z` final, y nunca en un formato local.

### `IErrorEnvelope`

```ts
interface IErrorEnvelope {
  code: string
  message: string
  details?: unknown[]
}
```

### `IMessageResponse`

```ts
interface IMessageResponse {
  message: string
}
```

La forma de los tres `DELETE`. El texto es siempre `"<Recurso> deleted successfully"`: `"Customer deleted successfully"`, `"Expense deleted successfully"`.

## El sobre de error

### Forma

```json
{
  "code": "BAD_REQUEST",
  "message": "payment_bank: Payment bank is required for credit card payments",
  "details": []
}
```

| Campo | Presente | Qué es |
|-------|----------|--------|
| `code` | Siempre | Uno de los seis valores de `ErrorCodes`. Es el campo estable, el que un cliente usa para ramificar. |
| `message` | Siempre | Texto en inglés, pensado para developers. No se muestra crudo en el panel. |
| `details` | Opcional | Lista de issues de Zod cuando hay varios. Vacía o ausente si el error no es de validación. |

### Por qué el mensaje es un texto y no un código

Hay dos philosophies y el proyecto elige la segunda para `message`:

| Enfoque | Ventaja | Problema |
|---------|---------|----------|
| Mensajes como códigos (`"PAYMENT_BANK_REQUIRED"`) | El cliente ramifica sin parsear texto | Cada error nuevo es un código nuevo, y hay que mantener una tabla de equivalencia |
| Mensajes en texto con el campo prefijado | El mensaje dice exactamente qué pasó y dónde | El cliente no puede ramificar por texto, y no debe |

La razón de que funcione es que el `code` general **sí** es estable: `BAD_REQUEST` no cambia. El detalle fino del mensaje es para la persona que lee el log y para el panel, que muestra el texto directamente en un sobre de error legible.

Y hay una razón técnica que no es de diseño: Zod produce mensajes en inglés con una estructura propia, y traducirlos o recodificarlos sería escribir un segundo vocabulario de errores que solo se usaría en el camino de error.

### El prefijo del campo

`formatZodIssueMessage` de `src/config/error-handler.ts` concatena la ruta del issue con su mensaje:

```
payment_bank: Payment bank is required for credit card payments
additional_items.0.quantity: Expected number, received string
value: Unrecognized key(s) in object: 'additional_items'
```

| Forma de la ruta | Ejemplo | Cuándo |
|------------------|---------|---------|
| `campo: mensaje` | `cost: Invalid money format` | El issue está en un campo del cuerpo |
| `campo.subcampo.índice: mensaje` | `additional_items.0.total: Invalid money format` | El issue está en un arreglo |
| `value: mensaje` | `value: Unrecognized key(s) in object: 'unknown_field'` | El issue no tiene ruta: `.strict()` rechaza una clave |

La ruta con el índice numérico es la que más ayuda: dice no solo qué renglón del formulario falló, sino cuál. En un formulario con hasta cincuenta artículos, esa diferencia evita que la dueña busque el error a ojo.

### Los mensajes de los errores que no son de Zod

| Código | HTTP | Mensaje | Cuándo |
|--------|------|---------|--------|
| `BAD_REQUEST` | 400 | `"<campo>: <mensaje de Zod>"` o `"value: <mensaje de Zod>"` | Violación de esquema |
| `NOT_FOUND` | 404 | `"<Recurso> not found"` | `findById` devuelve `null`. Ejemplos: `"Sale not found"`, `"Payment not found"`, `"Customer not found"`, `"Expense not found"`. |
| `BAD_REQUEST` | 400 | `"Live sales cannot include additional items"` | Regla del canal, desde `BadRequestError` del servicio |
| `BAD_REQUEST` | 400 | `"<FK> not found"` | Clave foránea inválida, desde la traducción del código `23503` de `pg`. Ejemplo: `"Sale not found"` cuando el `sale_id` de un artículo adicional o de un pago no existe. |
| `INTERNAL_ERROR` | 500 | `"Internal server error"` | Cualquier otra cosa. Fijo, sin detalles. |
| `TOO_MANY_REQUESTS` | 429 | El mensaje de `@fastify/rate-limit` | Límite de peticiones superado |

Los mensajes son en inglés porque son técnicos y porque el frontend los muestra dentro de un sobre de error, no como texto de negocio. Cuando el mensaje necesita ser de negocio —el texto de un `confirm()`, el `hint` de una tarjeta— ese texto vive en el frontend, en español.

## Códigos de error

Códigos. La API emite ocho, y todos salen de una clase de `src/core/errors/AppError.ts` salvo `TOO_MANY_REQUESTS`, que el manejador deriva del estado HTTP cuando el error no trae código propio. `NETWORK_ERROR` es solo del cliente.

| Código | HTTP | Lo emite |
|--------|------|----------|
| `BAD_REQUEST` | 400 | El manejador de errores, por `ZodError` y por `BadRequestError` |
| `UNAUTHORIZED` | 401 | `UnauthorizedError`: el guard de sesión (sin cookie, token desconocido, sesión revocada) y el login con credenciales inválidas |
| `FORBIDDEN` | 403 | `ForbiddenError`, desde el alta de usuarios cuando la sesión no es de un `admin` |
| `NOT_FOUND` | 404 | `NotFoundError`, desde los servicios |
| `CONFLICT` | 409 | `ConflictError`, desde los servicios: venta cancelada, venta a crédito cobrada por el selector, pago sobre una venta de contado, cliente con saldo pendiente, `username` o `email` ya tomados |
| `RATE_LIMITED` | 429 | `RateLimitedError`, en el login: es el del límite propio de 10 intentos por minuto |
| `TOO_MANY_REQUESTS` | 429 | El manejador de errores, al respetar el `statusCode` 4xx que transporta el error del límite global de `@fastify/rate-limit` |
| `INTERNAL_ERROR` | 500 | El manejador de errores, para cualquier error no reconocido |
| `NETWORK_ERROR` | — | **Solo el frontend.** `ApiError` de `frontend/src/lib/core/api.ts`, cuando el `fetch` falla. La API nunca lo emite porque no puede observar su propia inaccesibilidad. |

`UNAUTHORIZED` y `FORBIDDEN` dejaron de ser una reserva del contrato de error cuando llegó D-024: son el resultado normal de un pedido sin sesión y de un `seller` llamando al alta de usuarios. Los dos `429` no son intercambiables: el del login lo lanza la ruta con su código propio y su mensaje (`Too many login attempts, try again in a minute`), y el global conserva el código derivado del estado.

## Traducción de errores de `pg`

El driver `pg` marca las violaciones de clave foránea con `code = "23503"` y el nombre de la restricción en `constraint`. Drizzle envuelve el error del driver en un `DrizzleQueryError`, así que el manejador busca el `code` también en el `cause`. Traduce el único caso que el modelo puede producir:

| `23503` — Violación de clave foránea | Traducción |
|-----------------------------------|------------|
| Contexto | Una clave foránea a `sale` que no corresponde a ninguna fila. Las restricciones reconocidas empiezan por `additional_sale_sale_id_fkey` o `sale_payment_sale_id_fkey`; `expense` no tiene ninguna y `customer` tampoco. |
| Origen | La clave foránea de PostgreSQL. |
| Traducción | `400 BAD_REQUEST` con el mensaje `"Sale not found"`. |
| Razón | Es un error del cliente, no del servidor. Un `404` sería más preciso semánticamente, pero el contrato elige `400` para las violaciones de integridad. |

El driver usa **`23505`** para una violación de unicidad. Hay dos restricciones que pueden dispararlo desde que existen los usuarios: `user.username` y `user.email` (y `session.token_hash`, que no puede chocar salvo un improbable empate de 32 bytes al azar). La traducción del alta de usuarios es **`409 CONFLICT`** con el mensaje del campo —`username: That username is already taken` o `email: That email is already registered`—, y el servicio comprueba antes para poder decir cuál de los dos campos choca: el `23505` queda como red de la carrera entre dos altas simultáneas. El resto de los códigos de la clase `23` **no se traducen**: si aparecen, es un error del servidor y se ve en el log.

## CORS

Configurado en `src/app.ts` con `@fastify/cors`:

```ts
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(",") ?? ["*"],
  credentials: true,
})
```

| Aspecto | Regla |
|---------|-------|
| Variable | `CORS_ORIGIN`, obligatoria. Separada por comas para varios orígenes. |
| Desarrollo | `CORS_ORIGIN=http://localhost:4321` (el puerto de Astro en dev) |
| Producción | El origen exacto desde el que se sirve el panel. Nada de comodines. |
| Credenciales | `true`, y es obligatorio: la cookie de sesión viaja con `credentials: "include"` y el navegador descarta la respuesta si falta `Access-Control-Allow-Credentials`. |
| Comodín | `*` **solo en desarrollo**, y nunca con la cookie en juego: con credenciales reflejar cualquier origen equivale a entregar la sesión a cualquiera. |
| Pre-flight | Automático. Los métodos que no son simples (`PATCH`, `PUT`, `DELETE`) disparan un `OPTIONS` que el plugin responde con los encabezados correctos. |

**`CORS_ORIGIN` es obligatoria y sin valor por defecto.** El andamiaje la trae con un valor de ejemplo. El sistema no arranca sin las seis variables de entorno documentadas en `modules/backend/06-configuracion.md`; una de ellas es `CORS_ORIGIN` y otra es `NODE_ENV`. Un backend que arranca sin saber de dónde viene el navegador es un backend con la puerta abierta.

Desde D-024 CORS dejó de ser un detalle: la sesión es una cookie, y la lista cerrada de orígenes con `credentials: true` es una de las dos barreras —junto con `SameSite`— que impiden que un sitio ajeno use la cookie del panel.

## Límite de peticiones

`@fastify/rate-limit` registrado en `src/app.ts`:

```ts
await fastify.register(rateLimit, {
  max: 1000,
  timeWindow: "1 minute",
})
```

| Aspecto | Valor |
|---------|-------|
| Máximo | 1000 peticiones |
| Ventana | 1 minuto |
| Ámbito | Por dirección IP |
| Al superar | `429` con la forma `{ "code", "message" }`, a través del mismo manejador de errores |
| Configurable | No. El valor está en el código, no en una variable de entorno. |
| Excepción | `POST /api/v1/auth/login` agrega su propio límite de **10 intentos por minuto por IP**, porque es la única ruta donde repetir un pedido es adivinar una contraseña. |

El límite general es de 1000 peticiones porque el panel lo usa una persona con unas decenas de peticiones por sesión de trabajo; el margen es amplio a propósito, para no frenar el uso real. No es un límite de seguridad: es una red que evita que un bucle en el frontend golpee la API sin parar. El del login sí lo es, y por eso es dos órdenes de magnitud más chico.

## Revalidación condicional

Todos los `GET` que responden `2xx` llevan dos cabeceras:

| Cabecera | Valor | Para qué |
|----------|-------|----------|
| `ETag` | `W/"<hash>"` del cuerpo serializado, en base64url | Identifica esta representación. Si el cuerpo cambia, cambia. |
| `Cache-Control` | `private, no-cache` | El navegador puede guardar la respuesta, pero **debe revalidarla** antes de usarla, y ninguna caché compartida la guarda. |

Si la petición trae `If-None-Match` y coincide con el `ETag` —comparación débil: se ignoran el prefijo `W/` y las comillas, y se admite `*` y listas separadas por comas—, la respuesta es `304 Not Modified` sin cuerpo, con el mismo `ETag`. Las escrituras y los errores no llevan ninguna de las dos cabeceras.

No es una caché de datos: el servidor recalcula el cuerpo en cada llamada y sólo decide si lo retransmite. La lista completa de ventas, que ronda 1,5 MB, responde `304` con 0 bytes cuando no cambió. Ver la decisión D-014.

## Códigos de estado por endpoint

| Endpoint | `200` | `201` | `400` | `404` | `409` |
|----------|-------|-------|-------|-------|-------|
| `GET /dashboard/summary` | Sí | — | Sí | — | — |
| `GET /dashboard/packages/kpis` | Sí | — | Sí | — | — |
| `GET /dashboard/daily-series` | Sí | — | Sí | — | — |
| `GET /dashboard/by-channel` | Sí | — | Sí | — | — |
| `GET /dashboard/by-shipment` | Sí | — | Sí | — | — |
| `POST /sales/live` | — | Sí | Sí | — | — |
| `POST /sales/whatsapp` | — | Sí | Sí | — | — |
| `GET /sales` | Sí | — | Sí | — | — |
| `GET /sales/with-details` | Sí | — | Sí | — | — |
| `GET /sales/:id` | Sí | — | Sí | Sí | — |
| `PATCH /sales/:id/status` | Sí | — | Sí | Sí | Sí |
| `PATCH /sales/:id/shipment-method` | Sí | — | Sí | Sí | — |
| `POST /sales/:id/payments` | — | Sí | Sí | Sí | Sí |
| `DELETE /sales/:id/payments/:paymentId` | Sí | — | Sí | Sí | Sí |
| `POST /customers` | — | Sí | Sí | — | — |
| `GET /customers` | Sí | — | Sí | — | — |
| `PATCH /customers/:id` | Sí | — | Sí | Sí | — |
| `DELETE /customers/:id` | Sí | — | Sí | Sí | Sí |
| `POST /expenses` | — | Sí | Sí | — | — |
| `GET /expenses` | Sí | — | Sí | — | — |
| `DELETE /expenses/:id` | Sí | — | Sí | Sí | — |

`500` y `429` son posibles en los veintiún. No hay ningún endpoint que devuelva `204`, aunque sea válido: los `DELETE` responden `200` con un mensaje para que el frontend pueda confirmar sin inventar el texto.

Los cuatro endpoints de acceso tienen su propia tabla, porque sus estados no son los del negocio:

| Endpoint | `200` | `201` | `400` | `401` | `403` | `409` | `429` |
|----------|-------|-------|-------|-------|-------|-------|-------|
| `POST /auth/login` | Sí | — | Sí | Sí | — | — | Sí (10/min) |
| `POST /auth/logout` | Sí | — | — | — | — | — | Sí |
| `GET /auth/me` | Sí | — | — | Sí | — | — | Sí |
| `POST /users` | — | Sí | Sí | Sí | Sí | Sí | Sí |

El `401` de los tres protegidos sale del guard de sesión con el mismo mensaje, `"Authentication required"`; el del login es `"Invalid credentials"` y no distingue entre usuario inexistente, contraseña incorrecta y usuario borrado. El logout **no** puede responder `401`: es idempotente y sin cookie responde `200` igual. El `403` solo puede venir del alta de usuarios. El `409` son los dos conflictos de unicidad del alta: `username` y `email`.

`304 Not Modified` es la excepción a esta tabla: cualquier `GET` que responda `2xx` puede responder `304` si el `If-None-Match` coincide (ver *Revalidación condicional*).

## Formato de dinero

El patrón que valida y normaliza todo importe de entrada y de salida:

```ts
export const MONEY_PATTERN = /^\d{1,8}(\.\d{1,2})?$/
```

| Regla | Detalle |
|-------|---------|
| Enteros | De 1 a 8 dígitos. Máximo `99999999.99`, coherente con `DECIMAL(10,2)`. |
| Decimales | De 1 a 2 dígitos. Cero decimales es válido; tres no. |
| Signo | No hay signo. Un importe negativo no es representable en el modelo. |
| Notación exponencial | Rechazada: `1e3` no pasa el patrón. |
| Separador de miles | Rechazado: `"1,250.50"` no pasa el patrón. El cliente debe enviar el número, formateado o no. |
| Entrada | Siempre cadena. `z.string().regex(MONEY_PATTERN)`. Un `number` JSON falla la validación. |
| Salida | Siempre cadena con dos decimales, producido por `toMoneyString`. |

La normalización en la salida es lo que garantiza que `"80"` y `"80.00"` no aparezcan como dos importes distintos en la misma columna: `toMoneyString` siempre produce dos decimales.

## Formato de fecha

| Dirección | Formato | Ejemplo |
|-----------|---------|---------|
| Entrada | ISO 8601, varios formatos aceptados por `z.coerce.date()` | `"2026-09-28"`, `"2026-09-28T15:30:00Z"`, `"2026-09-28T15:30:00.000Z"` |
| Salida | ISO 8601 UTC con milisegundos y `Z` | `"2026-09-28T15:30:00.000Z"` |

`z.coerce.date()` acepta la fecha de un `<input type="date">` (`"2026-09-28"`) y la de un `datetime-local` completo, y normaliza ambas a un `Date`. La salida es siempre UTC porque el esquema de Drizzle declara `sale_date` y `expense_date` como `timestamp(..., { withTimezone: true, precision: 3 })` y el driver `pg` devuelve las fechas en UTC.

Una fecha de negocio como `sale_date` es un dato del hecho económico, no una marca de auditoría: el cliente puede corregirla y el sistema la acepta. `created_at` y `updated_at` son marcas de auditoría y el cliente no las envía nunca.

## La lista cerrada

Veintiún endpoints de negocio, ni uno más, más los cuatro de acceso que documenta `07-auth.md` y que no entran en ese conteo. La lista es exhaustiva y cada ausencia tiene una razón:

| Ausente | Razón |
|---------|-------|
| `DELETE /sales/:id` | Una venta se cancela con `PATCH .../status` a `cancelled`, no se borra. El borrado lógico de ventas no es una operación del negocio. |
| `PUT /sales/:id` · `PATCH /sales/:id` | Los importes de una venta cobrada no se editan. Editar el total derivado de una venta ya cobrada es la vía para que el sistema deje de reflejar lo que el cliente pagó. Las dos sub-rutas de un solo campo (`status`, `shipment-method`) y el libro de pagos cubren las correcciones legítimas. |
| `PATCH /sales/:id/payments/:paymentId` | Un pago mal registrado se borra lógicamente y se vuelve a registrar, igual que un gasto. |
| `PUT /expenses/:id` · `PATCH /expenses/:id` | Un gasto mal registrado se borra lógicamente y se vuelve a crear. |
| `GET /customers/:id` | El listado trae todos los campos. Las ventas y el saldo de un cliente se leen con `GET /sales?customer_id=…`. |
| Todo `/packages` | El recurso ya no existe: no hay tabla `package` ni módulo `packages` registrado. |
| `GET /products` y familia | No hay catálogo (D-002). La mercadería es texto libre. |
| `GET /users` · `PATCH /users/:id` · `DELETE /users/:id` | Los usuarios se administran desde la terminal, no desde el panel: el único endpoint de usuarios es el alta, y es solo para un `admin` (D-024). |
| `POST /auth/register` · `POST /auth/forgot-password` · `POST /auth/reset-password` | No hay registro público ni recuperación de contraseña. El primer administrador se crea con `pnpm create-admin` y una contraseña olvidada la reemplaza un administrador desde la terminal (D-024). |
| `GET /sales/export` | La factura se imprime desde el navegador. |
| `POST /sales/bulk` | No hay carga masiva. La dueña registra una venta a la vez. |
| `GET /sales/search?q=` | No hay búsqueda de ventas. El listado se filtra por fecha, canal, estado, condición de pago y vencimiento. La búsqueda por nombre o teléfono vive en `GET /customers?q=`. |
| `GET /dashboard/*` más allá de los cinco documentados | Cada endpoint del panel responde una pregunta concreta: resumen, KPIs de paquetes, serie diaria, desglose por canal y desglose por envío. Un sexto agregado sería inventar una pregunta que nadie hizo. |
| `GET /api/v1/health` | El control de vida no es contrato de negocio y por eso no lleva el prefijo. Sí existe, fuera de `/api/v1`, como `GET /health`: responde `200` con el estado del proceso y no consulta la base. Ver `modules/backend/03-api.md`. |

El único endpoint fuera de `/api/v1` es `GET /health`. Es liveness, no readiness: devuelve `200` mientras el proceso pueda atender HTTP, con `{ "status": "ok", "uptime_seconds", "timestamp" }`. No mide PostgreSQL a propósito —un hipo de conexión se convertiría en un reinicio en bucle del proceso sano— y no se revalida ni se cachea: no emite `ETag` ni `Cache-Control`. Como no es contrato de negocio, no cuenta en los veintiún endpoints ni en ninguno de los cómputos de este documento.
