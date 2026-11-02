# Buenas prácticas

## Convenciones de código

### Backend

- **Módulos ESM, sin estilo CommonJS.** `backend/package.json` declara `"type": "module"`. Todos los imports llevan extensión implícita resuelta por `tsx` y `tsup`; nunca se usa `require`.
- **Alias `@` para el código transversal.** `tsconfig.json` y `tsup.config.ts` declaran `@/* -> ./src/*`. Se usa para `config/`, `core/` y para el DTO compartido; dentro de un módulo se usan rutas relativas (`../domain/sales.entities`).
- **Sin punto y coma al final de línea.** El código generado por `fwinit` no las usa y el estilo se mantiene en todo el árbol.
- **Comillas dobles en el backend, comillas simples en el frontend.** El backend generado usa `"` y el andamiaje de Astro usa `'`. No se mezclan dentro de un mismo archivo.
- **Nombres de dominio en inglés, textos de cara al usuario también.** Los mensajes de `AppError` y de Zod se escriben en inglés (`"Payment bank is required for credit card payments"`), igual que `error-messages.ts`. Son contrato técnico para el cliente HTTP, no copy de interfaz.
- **Importaciones de tipo con `import type`.** Toda interfaz usada solo como tipo se importa con `import type` para no generar dependencia en tiempo de ejecución.
- **`strict: true` sin excepciones.** No se usa `any`. `skipLibCheck: true` es la única concesión.

### Dinero

- En la base de datos, todo importe es `DECIMAL(10,2)`.
- En los DTO de Zod, todo importe se valida como **cadena** con el patrón `MONEY_PATTERN` de `src/core/money/money.ts`.
- En los mappers, el `Decimal` de `decimal.js` se convierte con `toMoneyString()`, que usa `Decimal.toFixed(2)`. Está prohibido `Number(decimal)`.
- En la agregación del dashboard, las sumas se hacen con `new Decimal(a).plus(b)` de `decimal.js`, nunca con `a + b`.
- En el frontend, `src/lib/format.ts` formatea la cadena decimal con expresiones regulares y concatenación. Está prohibido `parseFloat` sobre un importe.

### Drizzle

- Los repositorios son **factories** que reciben el cliente: `createSaleRepository(db)`, `createExpenseRepository(db)` y `createDashboardRepository(db)` viven en `infrastructure/*.drizzle.repository.ts` y devuelven un objeto que satisface el puerto del dominio.
- Las tablas y columnas se declaran en `src/db/schema/`, un archivo por dominio. Los nombres de tabla y columna son los de la base (`sale`, `customer_name`), y las columnas nuevas de la API se declaran en `camelCase` dentro de `pgTable`.
- Las filas se tipan con `typeof <tabla>.$inferSelect` y las inserciones con `$inferInsert`; no se escribe el tipo a mano.
- Toda consulta de listado o de lectura por id incluye `isNull(<tabla>.deletedAt)`.
- Los errores de `pg` se envuelven en errores de dominio. El driver marca las violaciones de clave foránea con `code = "23503"` y el nombre de la restricción en `constraint`; `src/tests/fakes.ts` fábrica errores con esa forma (`makeP2003`).

### Frontend

- Cero frameworks de interfaz y cero frameworks de CSS. El estilo vive en CSS nativo: variables globales en `src/styles/global.css` y reglas con alcance en el `<style>` de cada `.astro`.
- Los tokens de diseño se toman **exclusivamente** de `modules/frontend/02-design.md`. No se inventan colores, radios ni sombras dentro de un componente.
- Los íconos vienen de `lucide-astro` a 20 o 24 px con trazo de 1.5 px, nunca SVG escritos a mano ni emoji.
- El comportamiento de cliente vive en `<script>` dentro del `.astro`. Los scripts usan `type="module"` para poder importar `src/lib/api.ts`.
- Los formularios usan HTML nativo con `name` en los campos; la lectura se hace con `new FormData(form)`. No hay estado global entre páginas: cada página pide sus datos al abrirse.

## Estructura de carpetas

```
backend/
├── drizzle/
│   ├── <sello>_<nombre>/migration.sql  # SQL generado por drizzle-kit generate
│   └── *indices_cubrientes/            # INCLUDE en SQL a mano (push prohibido)
├── drizzle.config.ts              # out: ./drizzle, schema: ./src/db/schema/index.ts
├── src/
│   ├── app.ts                     # buildApp(): plugins, error handler, rutas
│   ├── server.ts                  # listen + gracefulShutdown
│   ├── db/
│   │   ├── index.ts               # Pool de pg + db de Drizzle + tipo Db
│   │   └── schema/                # tablas y enums por dominio
│   ├── config/                    # env, logger, error-handler, graceful-shutdown, slow-query
│   ├── core/
│   │   ├── errors/                # AppError y submarcas, error-messages
│   │   └── money/                 # MONEY_PATTERN y helpers de Decimal
│   ├── http/routes.ts             # registro de plugins por prefijo
│   ├── modules/<dominio>/         # un módulo por área de negocio
│   │   ├── domain/                # entities, interface (puertos), types
│   │   ├── application/           # service + common/mappers
│   │   ├── infrastructure/        # <dominio>.drizzle.repository.ts
│   │   ├── presentation/          # routes, controller, dto
│   │   └── _tests_/application/   # *.test.ts de la capa de aplicación
│   ├── scripts/seed.ts            # datos de ejemplo
│   └── tests/fakes.ts             # fábricas de errores de `pg` para pruebas (23503)
└── tsup.config.ts

frontend/
├── public/favicon.svg
└── src/
    ├── layouts/AdminLayout.astro  # shell único: sidebar + contenedor principal
    ├── lib/api.ts                 # wrapper de fetch sobre PUBLIC_API_URL
    ├── lib/format.ts              # formato de dinero, fechas y enums, sin floats
    ├── pages/
    │   ├── index.astro            # dashboard
    │   ├── sales/index.astro      # listado consolidado + factura imprimible
    │   ├── sales/new.astro        # alta live / whatsapp según ?type=
    │   ├── packages/index.astro
    │   ├── packages/new.astro
    │   └── expenses/index.astro
    └── styles/global.css          # tokens y utilidades globales
```

## Errores y logging

- **Un solo manejador.** `src/config/error-handler.ts` traduce cualquier error al sobre `{ "code", "message", "details"? }`. No se escribe JSON de error a mano en un controlador.
- **Zod primero.** Un `ZodError` produce `400 BAD_REQUEST` con el mensaje del primer issue formateado como `campo: mensaje`.
- **Errores de dominio con marca propia.** El servicio lanza `BadRequestError`, `NotFoundError` o `ConflictError` desde `src/core/errors/AppError.ts`. El servicio no importa Fastify.
- **Nunca se filtra una excepción.** Un error no previsto produce `500 INTERNAL_ERROR` con el mensaje genérico de `ErrorMessages.INTERNAL_ERROR`. El detalle real solo va al log.
- **Logging estructurado con Pino.** Se registra con objetos: `logger.error({ err: error, method: request.method, url: request.url }, "Unhandled error")`. En desarrollo `pino-pretty` colorea la salida; en producción el nivel sube a `info` y desaparece el transporte.
- **Errores de `pg` traducidos en el borde.** El driver `pg` marca las violaciones de FK con `code = "23503"` y el nombre de la restricción en `constraint`; Drizzle envuelve el error en un `DrizzleQueryError`, así que el manejador mira también el `cause`. Los códigos que no se traducen salen como `500`.
- **Consultas lentas visibles en desarrollo.** El cliente de `src/db/index.ts` envuelve `client.query` del `Pool` de `pg` y emite por Pino un aviso `slow query` con `ms` y SQL cuando la consulta supera `SLOW_QUERY_MS`. No se añade `console.log` en el código de aplicación.

## Commits y ramas

- **Commits convencionales.** `tipo(scope): descripción` en una línea, imperativo y en inglés. Tipos en uso: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`.
- **Un commit es una unidad de trabajo revisable.** Si el cambio atraviesa backend, base de datos y frontend, se divide en commits que dejen el repositorio construible en cada punto: primero la migración, después el backend, después el frontend.
- **Sin atribución de IA.** Los mensajes no incluyen `Co-Authored-By` ni referencias a herramientas.
- **Ramas.** `main` es la rama estable. El trabajo ocurre en ramas de tarea con el mismo nombre del archivo de `specs/tasks/` que se está ejecutando.

## Revisión de código

Una revisión está lista para aprobarse cuando cumple, en este orden:

1. **La tarea del `specs/tasks/` correspondiente está marcada.** El avance se registra marcando las casillas en el archivo; no se lleva en un tablero aparte.
2. **Los criterios de "Done" del archivo de tarea se cumplen.** Cada criterio es verificable, no una opinión.
3. **`pnpm test` pasa en `backend/` y `pnpm run build` pasa en ambos paquetes.**
4. **Los importes viajan como cadenas decimales** en la respuesta y no hay aritmética de punto flotante en ninguna línea nueva.
5. **Todo listado filtra `deleted_at: null`** y ningún `DELETE` elimina físicamente.
6. **El frontend usa los tokens de `modules/frontend/02-design.md`** y no introduce colores sueltos.
7. **No hay secretos en el código.** Ninguna credencial, ninguna URL de base de datos real, ningún valor de `.env`.
