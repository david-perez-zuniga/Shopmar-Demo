# Stack del backend

## Lenguaje y versión

TypeScript en modo ESM. `backend/package.json` declara `"type": "module"` y `backend/tsconfig.json` fija:

| Opción | Valor | Motivo |
|--------|-------|--------|
| `target` | `ES2022` | Igual que el `target` de `tsup.config.ts`; Node.js 22 lo soporta de forma nativa. |
| `module` | `ESNext` | Solo se emite ESM, nunca CommonJS. |
| `moduleResolution` | `bundler` | Necesario para que tsup resuelva el alias `@/*`. |
| `moduleDetection` | `force` | Obliga a que cada archivo sea módulo. |
| `strict` | `true` | Sin excepciones. Cero `any` en código de aplicación. |
| `noEmit` | `true` | Quien emite es `tsup`, no `tsc`. |
| `esModuleInterop` | `true` | Interoperabilidad con módulos CommonJS transitivos. |
| `skipLibCheck` | `true` | Única concesión: no se verifican los `.d.ts` de terceros. |
| `resolveJsonModule` | `true` | Permite importar JSON si alguna vez hace falta. |
| `paths` | `@/* -> ./src/*` | Alias para el código transversal. |
| `include` | `src/**/*.ts` | Solo se compila `src/`. `tsup.config.ts` se resuelve por su propia vía. |

El runtime es **Node.js**, no Bun. `backend/template.json` todavía declara `"runtime": "bun"` y `bun install` en `postInit`, lo cual está desalineado con el estándar del proyecto; su corrección está en `specs/tasks/backend/01-retirar-andamiaje-de-autenticacion-y-usuarios.md`.

## Framework

**Fastify 5** (`fastify: ^5.0.0`). Motivos de la elección:

1. **Esqueleto de plugins.** `app.register()` y los `preHandler` por ruta permiten componer comportamiento transversal sin herencia de clases ni middlewares globales.
2. **Rendimiento.** Un kernel con menos capas que Express reduce el trabajo por petición, lo que importa en un servidor interno que responde en la red local.
3. **Tipado de `request`, `reply` y `params`.** El proyecto aprovecha el tipado estricto sin configuración adicional.
4. **Integración oficial con Pino.** El `logger` se pasa en la construcción de la instancia, y `pino-pretty` se activa por entorno.

Los plugins ya registrados en `backend/src/app.ts`:

| Plugin | Versión | Configuración real | Función |
|---------|---------|--------------------|---------|
| `@fastify/helmet` | `^12.0.0` | Registro sin opciones | Cabeceras de seguridad HTTP. |
| `@fastify/cors` | `^10.0.0` | `origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","), credentials: true` | Permite el origen del frontend. |
| `@fastify/compress` | `^8.0.0` | Registro sin opciones | Comprime las respuestas. |
| `@fastify/cookie` | `^11.0.0` | Registro sin opciones | **Se elimina**: sin autenticación no hay cookies (tarea 01). |
| `@fastify/rate-limit` | `^10.0.0` | `{ max: 1000, timeWindow: "1 minute" }` | Límite global de peticiones. |

## Versiones clave

Todas tomadas de `backend/package.json`:

| Dependencia | Versión | Rol en el proyecto |
|-------------|---------|--------------------|
| `fastify` | `^5.0.0` | Servidor HTTP y enrutado. |
| `@fastify/helmet` | `^12.0.0` | Cabeceras de seguridad. |
| `@fastify/cors` | `^10.0.0` | Política de origen cruzado. |
| `@fastify/compress` | `^8.0.0` | Compresión de respuestas. |
| `@fastify/rate-limit` | `^10.0.0` | Límite de peticiones. |
| `zod` | `^3.23.0` | Validación de cuerpos, queries y parámetros. |
| `pino` | `^9.0.0` | Logging estructurado. |
| `dotenv` | `^16.4.0` | Carga de `.env` al arrancar. |
| `drizzle-orm` | `1.0.0-rc.4` | ORM: esquema tipado y constructor de consultas sobre PostgreSQL. |
| `pg` | `^8.22.0` | Driver de PostgreSQL; el `Pool` que Drizzle recibe como cliente. |
| `decimal.js` | `10.6.0` | Aritmética decimal exacta para el dinero (D-003). |

Dependencias a eliminar en la tarea 01: `@fastify/cookie ^11.0.0`, `bcrypt ^5.1.0`, `jsonwebtoken ^9.0.0`, `@types/bcrypt ^5.0.0`, `@types/jsonwebtoken ^9.0.0`.

| Dependencia de desarrollo | Versión | Rol |
|--------------------------|---------|-----|
| `drizzle-kit` | `1.0.0-rc.4` | Migraciones y Studio (`generate`, `migrate`, `studio`). `push` está prohibido (D-016). |
| `tsup` | `^8.0.0` | Empaquetado en un único archivo ESM. |
| `tsx` | `^4.0.0` | Ejecución directa de TypeScript con recarga. |
| `typescript` | `^5.5.0` | Comprobación de tipos. |
| `vitest` | `^3.0.0` | Pruebas unitarias. |
| `pino-pretty` | `^11.0.0` | Salida de log legible en desarrollo. |
| `@types/pg` | `^8.21.0` | Tipos del driver `pg`. |
| `@types/node` | `^22.0.0` | Tipos de Node.js. |

## Por qué esta elección

- **Node.js y no Bun.** El proyecto apunta a `engines.node >= 22.12.0` en el frontend, `tsx` y `tsup` son las herramientas declaradas, y el despliegue previsto es un proceso Node.js largo detrás del firewall del host. Bun quedaría como runtime alternativo sin beneficio medible para este caso de uso.
- **Fastify y no Express.** Los `preHandler` por ruta y el `setErrorHandler` central encajan con el modelo de "sin autenticación": cada ruta declara explícitamente que no lleva `preHandler` de guard. Con Express quedaría la tentación de añadir un middleware global de sesión.
- **Zod y no validación manual.** Los DTO son la frontera de confianza. Zod produce un `ZodError` que el manejador central traduce a `400 BAD_REQUEST` con el mensaje del primer problema, así que el formato de error es idéntico en todas las rutas sin código repetido.
- **Drizzle y no SQL a mano.** Drizzle genera consultas parametrizadas (requisito de seguridad), tipa las filas a partir del esquema de `src/db/schema/` en tiempo de compilación, y permite escribir los repositorios contra una interfaz del dominio para que la aplicación no dependa del ORM. Ver decisión D-016.
- **Pino y no `console.log`.** El log de errores incluye método, ruta y excepción en un solo objeto. `pino-pretty` en desarrollo y JSON en producción, sin código condicional en la aplicación.
- **Vitest y no Jest.** Compatible con ESM nativo y con el `tsx` ya presente, sin capa de transpilación adicional. Usa `node:assert/strict`, que es lo que hacen las pruebas existentes del andamiaje.

## Configuración de tsup

`backend/tsup.config.ts` es deliberadamente corto:

| Opción | Valor | Motivo |
|--------|-------|--------|
| `entry` | `["src/server.ts"]` | Un solo punto de entrada. |
| `format` | `["esm"]` | Coherente con `"type": "module"`. |
| `target` | `es2022` | Coherente con `tsconfig.json`. |
| `sourcemap` | `true` | Permite rastrear errores en producción. |
| `clean` | `true` | Elimina la carpeta de salida anterior. |
| `alias` | `{ "@": "./src" }` | Reescribe el alias `@` en el bundle. |

No hay `dts: true`: el backend no se consume como librería.

## Comandos de desarrollo

Definidos en `backend/package.json`, sin ninguna alteración respecto a lo generado:

| Comando | Ejecuta | Cuándo usarlo |
|---------|---------|----------------|
| `pnpm install` | Instalación de dependencias | Una vez, y tras cada cambio de `package.json`. |
| `pnpm run dev` | `tsx watch src/server.ts` | Desarrollo con recarga al guardar. |
| `pnpm run build` | `tsup` | Compilación de producción. |
| `pnpm run start` | `tsx src/server.ts` | Arranque del proceso ya compilado o en un entorno sin bundling. |
| `pnpm run db:generate` | `drizzle-kit generate` | Tras cada cambio en `src/db/schema/`. No toca la base. |
| `pnpm run db:migrate` | `drizzle-kit migrate` | Aplica las migraciones pendientes de `backend/drizzle/`. |
| `pnpm run db:studio` | `drizzle-kit studio` | Inspeccionar datos. |
| `pnpm run seed` | `tsx src/scripts/seed.ts` | Cargar datos de ejemplo. |
| `pnpm test` | `vitest run` | Suite completa. |
