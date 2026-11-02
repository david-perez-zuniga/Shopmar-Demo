# Arquitectura del backend

## Capas

El backend sigue arquitectura limpia por módulos. Cada módulo de negocio es autonomous: tiene sus capas, su repositorio, sus pruebas y no comparte tablas ni DTO con otro módulo, salvo el `additional_sale`, que es parte de `sales` por diseño.

```
                      ┌─────────────────────────────────────────┐
   petición HTTP ───► │  presentation/                          │
                      │  routes.ts · controller.ts · dto.ts     │
                      │  Zod valida, el controller orquesta    │
                      └──────────────────┬──────────────────────┘
                                         │  recibe el puerto
                      ┌──────────────────▼──────────────────────┐
                      │  application/                          │
                      │  sales.service.ts · common/mappers.ts   │
                      │  reglas de negocio, sin framework      │
                      └──────────────────┬──────────────────────┘
                                         │  usa ISaleRepository
                      ┌──────────────────▼──────────────────────┐
                      │  domain/                               │
                      │  entities.ts · interface.ts · types.ts │
                      │  formas de datos, sin el ORM           │
                      └──────────────────┬──────────────────────┘
                                         │  implementa el puerto
                      ┌──────────────────▼──────────────────────┐
                      │  infrastructure/                       │
                      │  sale.drizzle.repository.ts            │
                      │  Drizzle + PostgreSQL                  │
                      └─────────────────────────────────────────┘
```

La flecha apunta **siempre hacia adentro**. El dominio no importa el ORM ni Fastify. La aplicación no importa Fastify. Solo `presentation/` conoce el framework y solo `infrastructure/` conoce el ORM. Por eso la capa de aplicación se puede probar con un objeto que implemente la interfaz del repositorio, sin base de datos.

## Responsabilidad por capa

| Capa | Carpeta | Responsabilidad | No debe |
|------|---------|-----------------|--------|
| Dominio | `domain/` | Declarar las entidades (`ISaleEntity`, `IAdditionalSaleEntity`), los tipos de entrada (`CreateSaleData`, `UpdatePackageData`), los puertos (`ISaleRepository`, `IListSalesParams`) y los tipos de respuesta (`ISaleResponse`). | Importar el ORM, importar Fastify, ejecutar consultas, lanzar errores HTTP. |
| Aplicación | `application/` | Aplicar las reglas de negocio, calcular el total derivado, decidir el orden y el agrupamiento, transformar entidades en respuestas con los mappers, lanzar `BadRequestError`, `NotFoundError` y `ConflictError`. | Importar Fastify, importar el ORM, construir objetos de respuesta HTTP. |
| Infraestructura | `infrastructure/` | Implementar los puertos con Drizzle, filtrar `deleted_at IS NULL`, tipar las filas desde el esquema, envolver los códigos de error de `pg` (`23503`, `23505`) en errores de dominio. | Contener reglas de negocio, decidir códigos de estado HTTP. |
| Presentación | `presentation/` | Declarar las rutas, validar con los esquemas de Zod, extraer `params`/`query`/`body`, instanciar el servicio con su repositorio, responder con `reply.status(n).send(...)`. | Aplicar reglas de negocio, escribir SQL, calcular totales. |

## Estructura de carpetas

Estado objetivo del árbol del backend:

```
backend/
├── drizzle/                                   # migraciones de drizzle-kit
│   └── *indices_cubrientes/                   # INCLUDE en SQL a mano (push prohibido)
├── drizzle.config.ts                          # out: ./drizzle, schema: ./src/db/schema/index.ts
├── src/
│   ├── app.ts                                 # buildApp()
│   ├── server.ts                              # listen + gracefulShutdown
│   ├── db/
│   │   ├── index.ts                           # Pool de pg + db de Drizzle + tipo Db
│   │   └── schema/                            # tablas y enums por dominio
│   ├── config/
│   │   ├── env.ts                             # esquema Zod del entorno (6 variables)
│   │   ├── logger.ts                          # opciones de Pino y export de logger
│   │   ├── error-handler.ts                   # setErrorHandler global
│   │   ├── slow-query.ts                      # aviso de consulta lenta sobre el Pool
│   │   └── graceful-shutdown.ts               # SIGTERM / SIGINT
│   ├── core/
│   │   ├── errors/
│   │   │   ├── AppError.ts                    # AppError + BadRequest/Unauthorized/
│   │   │   │                                  #   Forbidden/NotFound/Conflict
│   │   │   └── error-messages.ts              # textos canónicos por código
│   │   └── money/
│   │       └── money.ts                       # MONEY_PATTERN, toMoneyString, sumMoney
│   ├── http/
│   │   └── routes.ts                          # registerRoutes: 4 prefijos
│   ├── modules/
│   │   ├── dashboard/
│   │   ├── sales/
│   │   ├── packages/
│   │   └── expenses/
│   ├── scripts/
│   │   └── seed.ts
│   ├── tests/
│   │   └── fakes.ts                           # makeP2002, makeP2003
│   └── types/
│       └── fastify.d.ts                       # (se simplifica: ya no hay request.userId)
└── tsup.config.ts
```

## Patrones en uso

### 1. Servicios como fábrica con repositorio inyectado

El servicio no importa el repositorio. Lo recibe por parámetro en la llamada que lo crea.

```ts
// application/sales.service.ts
export const createSaleService = (repository: ISaleRepository) => ({
  async createLive(data: CreateLiveSaleData): Promise<ISaleDetailResponse> { /* ... */ },
  async createWhatsapp(data: CreateWhatsappSaleData): Promise<ISaleDetailResponse> { /* ... */ },
})
```

```ts
// presentation/sales.controller.ts
const saleService = createSaleService(SaleRepository)
```

Beneficio directo: `sale.service.test.ts` instancia el servicio con un objeto plano que implementa `ISaleRepository` y prueba reglas de negocio sin PostgreSQL.

### 2. Repositorios como factory que recibe el cliente

```ts
// infrastructure/sale.drizzle.repository.ts
export function createSaleRepository(db: Db): ISaleRepository {
  return { async findAll(params) { /* ... */ }, /* ... */ }
}
```

```ts
// presentation/sales.routes.ts
const service = createSaleService(createSaleRepository(db))
```

La firma `(db: Db): ISaleRepository` hace que el compilador detecte cualquier método que falte o sobre. No hay clases, no hay herencia, no hay decoradores, y la base de datos llega por parámetro en vez de importarse dentro del repositorio.

### 3. Selección declarativa con tipo derivado

```ts
const saleListSelection = {
  id: sale.id, type: sale.type, customerName: sale.customerName,
  productName: sale.productName, paymentMethod: sale.paymentMethod,
  saleDate: sale.saleDate, status: sale.status, cost: sale.cost,
  shipmentMethod: sale.shipmentMethod,
} as const

type SaleRow = typeof sale.$inferSelect
```

Consecuencia: la selección nunca puede desincronizarse del tipo, la consulta nunca trae columnas de más, y el borrado lógico se filtra tanto en la raíz (`isNull(sale.deletedAt)`) como en la relación (en la condición del `leftJoin`), no en el `WHERE`.

### 4. Mappers como frontera de serialización

Todo lo que sale de la aplicación hacia HTTP pasa por un mapper en `application/common/<dominio>.mappers.ts`. Los mappers son el único lugar donde un `Decimal` se convierte a cadena decimal y donde se agrega el total derivado.

```ts
export function withComputedTotal(cost: Decimal, additional: IAdditionalSaleEntity[]): string {
  return sumMoney([cost, ...additional.map((item) => item.total)])
}
```

Prohibido `Number(decimal)` en cualquier punto del proyecto. Ver decisión D-003.

### 5. DTOs con `.strict()` y `superRefine`

Los esquemas de Zod declaran la forma exacta del cuerpo y rechazan claves desconocidas. La regla de `payment_bank` condicional se aplica con `superRefine` sobre el mismo esquema, lo que produce el `400` con el campo exacto en el mensaje.

### 6. Errores de dominio con marca propia

`src/core/errors/AppError.ts` define `AppError` y cinco subclases. El servicio lanza la marca; el `errorHandler` global traduce a respuesta. El servicio no importa `FastifyReply`.

### 7. Transacción de Drizzle para la venta de WhatsApp

La venta y sus artículos adicionales se crean en una sola transacción (`db.transaction`). Si un artículo falla, no queda la venta. La transacción vive dentro del repositorio como un detalle de infraestructura; el servicio solo pide "crea la venta con estos adicionales".

## Flujo de una petición

Ejemplo real: `POST /api/v1/sales/whatsapp` con dos artículos adicionales.

1. **`app.register(salesRoutes, { prefix: "/api/v1/sales" })`.** `registerRoutes` en `src/http/routes.ts` monta el plugin. La ruta coincide con `POST /whatsapp`.
2. **Middlewares de `app.ts`.** helmet, cors, compress y rate limit se ejecutan antes del handler. Si se superan las 1000 peticiones por minuto, la respuesta es `429` del propio plugin, con el sobre `{ "code", "message", "details"? }` porque el `setErrorHandler` también intercepta los errores de los plugins.
3. **`salesController.createWhatsapp`.** Extrae `request.body`.
4. **`CreateWhatsappSaleDtoSchema.parse(request.body)`.** Valida campos, aplica `.strict()` (rechaza claves desconocidas), valida cada artículo adicional con `MONEY_PATTERN` y ejecuta el `superRefine` de `payment_bank`. Si algo falla, lanza `ZodError`.
5. **`setErrorHandler`.** Captura el `ZodError`, toma el primer issue y responde `400` con `{ "code": "BAD_REQUEST", "message": "campo: mensaje" }`.
6. **`saleService.createWhatsapp(body)`.** Aplica la regla: si `additional_items` está presente y tiene elementos, se los pasa al repositorio. Calcula el total derivado para la respuesta.
7. **`createSaleRepository(db).createWithAdditional(data)`.** Abre `db.transaction`: inserta la `sale` con `id` y `updatedAt` generados en el código (ninguna columna tiene default para ellos) y luego inserta los renglones de `additional_sale` con el `saleId` ya conocido. Devuelve el registro con sus renglones insertados.
8. **Mapeo.** `mapSaleToDetailResponse(saleRecord)` convierte los `Decimal` con `toMoneyString` y agrega `total`.
9. **`reply.status(201).send(response)`.** El cliente recibe el detalle completo con `total` como cadena decimal.

Un fallo en el paso 6 o 7 que no sea `ZodError` ni `AppError` cae en la rama final del `errorHandler`: se registra con `logger.error` y se responde `500 INTERNAL_ERROR` con mensaje genérico.

## Registro de rutas

`src/http/routes.ts` queda así:

```ts
import type { FastifyInstance } from "fastify"
import { dashboardRoutes } from "@/modules/dashboard/presentation/dashboard.routes"
import { salesRoutes } from "@/modules/sales/presentation/sales.routes"
import { packagesRoutes } from "@/modules/packages/presentation/packages.routes"
import { expensesRoutes } from "@/modules/expenses/presentation/expenses.routes"

export function registerRoutes(app: FastifyInstance) {
  app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" })
  app.register(salesRoutes, { prefix: "/api/v1/sales" })
  app.register(packagesRoutes, { prefix: "/api/v1/packages" })
  app.register(expensesRoutes, { prefix: "/api/v1/expenses" })
}
```

Las rutas de negocio no declaran `preHandler` propio: el guard de sesión se registra una sola vez, al montar el prefijo `/api/v1`, así que la protección no depende de que cada ruta se acuerde. Las excepciones son explícitas: `POST /auth/login` es público y `POST /users` agrega su verificación de rol. Ver decisión D-024 y `modules/backend/03-api.md`.

## Reglas de dependencia

| Desde | Puede importar |
|-------|-----------------|
| `domain/` | Nada del proyecto salvo `domain/` del mismo módulo. Nunca `drizzle-orm`, nunca `fastify`. |
| `application/` | `domain/` del mismo módulo, `core/errors`, `core/money`. |
| `infrastructure/` | `domain/` del mismo módulo, `@/db` (cliente y esquema), `core/errors`, `drizzle-orm`. |
| `presentation/` | `application/`, `domain/types`, `infrastructure`, `core/errors`, `fastify`, `zod`. |
| `http/routes.ts` | Solo los `*.routes` de cada módulo. |
| `app.ts` | `config/*`, `http/routes`, plugins de `@fastify/*`. |

No hay imports entre módulos de negocio. El módulo `dashboard` no importa de `sales`: lee las tablas `sale`, `additional_sale`, `package` y `expense` a través de su propio repositorio. Si mañana dos módulos necesitaran la misma regla de negocio, esa regla se extrae a `core/`, no se importa de un módulo a otro.
