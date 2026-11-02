# Configuración

## Variables de entorno del backend

El archivo real es `backend/.env`, creado a partir de `backend/.env.example`. `dotenv` lo carga al importarse `src/config/env.ts`, y un esquema de Zod valida el resultado: si falta una variable obligatoria o un valor no parsea, el proceso imprime `parsed.error.flatten().fieldErrors` con `console.error` y termina con `process.exit(1)`.

### Variables vigentes

| Variable | Descripción | Valor por defecto | Obligatoria | Entorno | Tipo |
|----------|-------------|-------------------|-------------|----------|------|
| `NODE_ENV` | Modo de ejecución. Afecta el nivel del log de Pino y el formateo de `pino-pretty`. | `development` | No | dev / test / prod | `z.enum(["development", "test", "production"])` |
| `PORT` | Puerto TCP donde escucha Fastify. | `3000` | No | todos | `z.coerce.number().int().positive()` |
| `HOST` | Interfaz de red donde escucha Fastify. | `0.0.0.0` | No | todos | `z.string()` |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL. Es la única variable con un secreto. | — | **Sí** | todos | `z.string().min(1)` |
| `SLOW_QUERY_MS` | Umbral en milisegundos del aviso de consulta lenta. Un `0` avisa de todas. | `200` | No | todos | `z.coerce.number().int().nonnegative()` |
| `CORS_ORIGIN` | Orígenes permitidos. `*` refleja cualquiera; en otro caso es una lista separada por comas. Con la cookie de sesión en juego, el despliegue tiene que nombrar orígenes exactos (D-024). | `*` | No | todos | `z.string()` |

**Seis variables. Solo una obligatoria, y ninguna nueva desde D-024.** La autenticación no agregó secretos de configuración: no hay `JWT_SECRET` ni clave de firma de cookie, porque el token se genera al azar y del lado del servidor solo se guarda su `sha256`.

### Variables que se eliminan

`backend/.env.example` declara hoy cuatro variables que este proyecto **no necesita**, y que también exige el esquema de `src/config/env.ts`:

| Variable a eliminar | Motivo |
|--------------------|--------|
| `JWT_SECRET` | No hay JWT. Sin autenticación. |
| `JWT_EXPIRES_IN` | No hay JWT. |
| `JWT_REFRESH_SECRET` | No hay Refresh tokens. Sin tabla `session`. |
| `JWT_REFRESH_EXPIRES_IN` | No hay Refresh tokens. |

`JWT_SECRET` y `JWT_REFRESH_SECRET` están declaradas con `z.string().min(32)`, es decir, **el proceso ni siquiera arranca si no están presentes**. Retirarlas del esquema es un requisito para que `pnpm run dev` funcione con un `.env` de seis variables. Ver `specs/tasks/backend/01-retirar-andamiaje-de-autenticacion-y-usuarios.md`.

### Variables de entorno del frontend

Viven en `frontend/.env`, creado a partir de `frontend/.env.example`. Se leen a través de `import.meta.env` y todas están declaradas con el prefijo `PUBLIC_`, lo que en Astro significa que quedan expuestas al navegador.

| Variable | Descripción | Valor por defecto | Obligatoria | Estado |
|----------|-------------|-------------------|-------------|--------|
| `PUBLIC_SITE_URL` | URL pública del sitio. La usa `astro.config.mjs` para el campo `site`. | `https://example.com` | No | Existente en el andamiaje. |
| `PUBLIC_SITE_DESCRIPTION` | Descripción por defecto del sitio. | — | No | Existente en el andamiaje. |
| `PUBLIC_API_URL` | URL base de la API que consume el panel. La usa `src/lib/api.ts` para construir cada petición. | — | **Sí** | **Variable nueva.** Debe agregarse a `frontend/.env.example`. |

**Advertencia crítica sobre `PUBLIC_API_URL`.** En Astro, toda variable `PUBLIC_*` se compila dentro del bundle en el momento del `astro build`. No se lee del entorno en tiempo de ejecución del navegador. Consecuencias:

1. `PUBLIC_API_URL` debe existir en el entorno donde se ejecuta `pnpm run build`, no solo en el servidor que aloja los archivos estáticos.
2. Cambiar la URL de la API exige **recompilar** el frontend. No basta con cambiar la variable en el servidor.
3. Como está expuesta al navegador, no puede contener ningún secreto. Solo la URL base, por ejemplo `http://localhost:3000` en desarrollo y `http://192.168.1.10:3000` en la red de la tienda.

## Archivos de configuración

| Archivo | Contenido | Se modifica en |
|---------|-----------|----------------|
| `backend/package.json` | Dependencias y los nueve scripts del proyecto. | Al agregar o retirar una dependencia. |
| `backend/tsconfig.json` | Opciones de TypeScript y el alias `@/*`. | Rara vez. Solo si cambia el estándar estricto. |
| `backend/tsup.config.ts` | Empaquetado: entrada, formato, target, sourcemaps, alias. | Rara vez. |
| `backend/drizzle.config.ts` + `backend/src/db/schema/` | La configuración de drizzle-kit (`out: ./drizzle`, `schema: ./src/db/schema/index.ts`, dialecto `postgresql`) y las tablas y enums por dominio (`sales.ts`, `expenses.ts`). Los índices cubrientes viven como SQL escrito a mano en `backend/drizzle/*indices_cubrientes/`, porque `drizzle-kit generate` no puede expresar `INCLUDE` y `push` está prohibido (decisión D-016). | Cada vez que cambie el modelo de datos, seguido de `db:generate` + `db:migrate`. |
| `backend/template.json` | Metadatos del andamiaje. Hoy declara `"runtime": "bun"` y `bun install` en `postInit`. | **Desalineado con el estándar pnpm + Node.js.** Su corrección está en la tarea 01. |
| `backend/.env.example` | Plantilla de las variables del backend. Se versiona. | Cada vez que cambie el conjunto de variables. |
| `frontend/package.json` | Dependencias (`astro`, `lucide-astro`) y los cuatro scripts. | Rara vez. |
| `frontend/astro.config.mjs` | Solo `site`, tomado de `PUBLIC_SITE_URL`. El frontend es una compilación estática, así que no hay `output` ni adaptadores. | Rara vez. |
| `frontend/tsconfig.json` | Extiende `astro/tsconfigs/strict`. | Rara vez. |
| `frontend/.env.example` | Plantilla de las variables del frontend. Se versiona. | Al agregar `PUBLIC_API_URL`. |
| `frontend/template.json` | Metadatos del andamiaje del frontend. | Rara vez. |

**No existe `vitest.config.ts`.** Vitest usa la configuración de `tsconfig.json`, incluido el alias `@`.

## Comportamiento por entorno

| Aspecto | `development` | `test` | `production` |
|---------|----------------|--------|--------------|
| Nivel del log de Pino | `debug` | `debug` | `info` |
| Transporte del log | `pino-pretty` con colores | `pino-pretty` con colores | ninguno (JSON a stdout) |
| Aviso de consulta lenta (`slow query`) | sí, al superar `SLOW_QUERY_MS` | sí | sí |
| `CORS_ORIGIN` sugerido | `*` | `*` | origen exacto del panel |
| `PUBLIC_API_URL` sugerida | `http://localhost:3000` | no aplica | `http://<ip-del-host>:3000` |

El comportamiento por entorno está codificado en dos archivos y no en condiciones repartidas por la aplicación:

- `src/config/logger.ts` decide nivel y transporte a partir de `env.NODE_ENV`.
- `src/db/index.ts` engancha el aviso de consulta lenta al `Pool` de `pg` con el umbral `env.SLOW_QUERY_MS`, independientemente de `NODE_ENV`.

## Gestión de secretos

| Regla | Detalle |
|-------|---------|
| `.env` nunca se versiona | Está cubierto por `.gitignore` tanto en la raíz como en `backend/`. |
| `.env.example` sí se versiona | Contiene nombres de variables y valores de ejemplo. Nunca un valor real. |
| Único secreto del proyecto | La contraseña de PostgreSQL, dentro de `DATABASE_URL`. |
| Producción | `DATABASE_URL` distinta de la de desarrollo, nunca escrita en un archivo del repositorio. |
| Sin secretos de terceros | El proyecto no tiene integraciones externas, así que no hay claves de API ni tokens de servicio. |
| Fallo de configuración | El proceso no arranca con configuración incompleta: imprime los campos fallidos y sale con código 1. Es preferible a arrancar a medias. |

## Arranque y apagado

`backend/src/server.ts` es deliberadamente corto:

1. `buildApp()` construye la instancia de Fastify con el logger, los plugins, el manejador de errores y las rutas.
2. `app.listen({ port: env.PORT, host: env.HOST })` levanta el servidor. Un fallo de arranque produce `logger.error(error, "Failed to start server")` y `process.exit(1)`.
3. `gracefulShutdown(app)` registra los manejadores de `SIGTERM` y `SIGINT`.

`src/config/graceful-shutdown.ts` ejecuta, en orden: `logger.info({ signal }, "Shutting down")`, `app.close()`, `pool.end()` y `process.exit(0)`. Cerrar el servidor antes de cerrar el `Pool` de `pg` evita que una petición en vuelo reciba un error de base de datos durante el despliegue.
