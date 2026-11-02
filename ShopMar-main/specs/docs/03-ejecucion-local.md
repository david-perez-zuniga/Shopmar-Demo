# Ejecución local

Todos los comandos de este documento son los scripts reales definidos en `backend/package.json` y `frontend/package.json`. El estándar del proyecto es **pnpm** sobre **Node.js**. El `backend/template.json` que dejó el generador declara `"runtime": "bun"` y `bun install` en `postInit`; ese archivo está desalineado y su reconciliación con pnpm es parte de `tasks/backend/01-retirar-andamiaje-de-autenticacion-y-usuarios.md`.

## Requisitos previos

| Requisito | Versión mínima | Verificación |
|-----------|----------------|--------------|
| Node.js | 22.12.0 | `node -v` |
| pnpm | 9 o superior | `pnpm -v` |
| PostgreSQL | 16 o superior | `psql --version` |

Bun no es necesario. Si está instalado, no debe usarse para este proyecto.

## Archivos de entorno requeridos

El proyecto necesita exactamente dos archivos de entorno, ambos derivados de los `.env.example` existentes.

| Archivo | Se crea desde | Variables que contiene |
|---------|---------------|-------------------------|
| `backend/.env` | `backend/.env.example` | `NODE_ENV`, `PORT`, `HOST`, `SLOW_QUERY_MS`, `DATABASE_URL`, `CORS_ORIGIN` |
| `frontend/.env` | `frontend/.env.example` | `PUBLIC_SITE_URL`, `PUBLIC_SITE_DESCRIPTION`, `PUBLIC_API_URL` |

La autenticación **no** usa variables de entorno: la sesión es una cookie con un token opaco y las únicas variables son las de la tabla de arriba (más las cuatro de la base de test). No hay `JWT_*` ni secreto de firma que configurar; si alguna vez ves una, es de un `.env` viejo y no la lee nadie (`src/config/env.ts` rechaza las claves que no declara). Después de crear la base y migrarla, el primer administrador sale de `pnpm create-admin -- --username … --email … --password …` (ver `modules/api/07-auth.md`).

En Astro, toda variable `PUBLIC_*` se compila dentro del bundle en el momento del `astro build`. Por eso `PUBLIC_API_URL` debe existir también en el entorno donde se compila, no solo en el servidor que hospeda los archivos.

## Instalación

```bash
pnpm install
```

En cada paquete por separado:

```bash
cd backend && pnpm install
cd frontend && pnpm install
```

## Ejecución en desarrollo

Dos procesos, dos terminales.

Backend:

```bash
cd backend
pnpm run dev          # tsx watch src/server.ts
```

Levanta Fastify en `HOST:PORT` (por defecto `0.0.0.0:3000`) y recarga al guardar. En desarrollo Pino imprime con `pino-pretty` y el aviso de consulta lenta registra las consultas que superan `SLOW_QUERY_MS`.

Frontend:

```bash
cd frontend
pnpm run dev          # astro dev
```

Levanta el servidor de desarrollo de Astro (por defecto `http://localhost:4321`). Las siete páginas del panel se pueden abrir desde ahí.

El CORS del backend está configurado en `src/app.ts` a partir de `CORS_ORIGIN`; con `CORS_ORIGIN=*` acepta el origen del frontend de desarrollo.

## Migraciones de la base de datos

```bash
cd backend
pnpm run db:generate   # drizzle-kit generate: genera una migración desde src/db/schema/
pnpm run db:migrate    # drizzle-kit migrate: aplica las migraciones pendientes
pnpm run db:studio     # drizzle-kit studio: interfaz web para inspeccionar datos
```

El esquema vive en `backend/src/db/schema/` y las migraciones en `backend/drizzle/`. El ORM es Drizzle (decisión D-016): `db:generate` escribe una migración nueva y `db:migrate` la aplica, actualizando la tabla de control de drizzle-kit.

Orden correcto en una base nueva: `db:migrate`, después `seed`. Solo hace falta `db:generate` cuando cambió el esquema. **`drizzle-kit push` está prohibido**: no ve los índices cubrientes (SQL a mano en `backend/drizzle/*indices_cubrientes/`) y los borraría; el guard que lo detecta es `backend/scripts/verify-schema.sql` (decisión D-016).

## Seeds

```bash
cd backend
pnpm run seed             # tsx src/scripts/seed.ts
```

El script es un fixture de volumen del dominio real: trunca `sale`, `additional_sale` y `expense` y luego siembra 5000 ventas (mostrador y WhatsApp, con artículos adicionales) y 5000 gastos repartidos en dos meses. Usa el mismo cliente `db` de `src/db/index.ts` e inserta por lotes de 50 filas, generando `id` y `updated_at` en el script porque ninguna columna tiene default en la base; cierra con `pool.end()`. La siembra es idempotente por truncado, no por `upsert`.

El rango se calcula por **calendario local** y cada día se construye con `Date.UTC(año, mes, día)`: el último día sembrado es el día local de hoy, no el «mañana» que daba `getUTCDate()` después de las 18:00 en Nicaragua. `sale_date` y `expense_date` son días de negocio —medianoche UTC, también en los gastos fijos mensuales—, así un registro nuevo del mismo día no cae debajo de los sembrados. Al final el seed se autoverifica: falla si alguna fecha quedó con hora o si el último día no es el día local de hoy.

## Pruebas

```bash
cd backend
pnpm test                 # vitest run
```

Las pruebas son unitarias de la capa de aplicación, con repositorios falsos definidos en `src/tests/fakes.ts`. No requieren base de datos ni servidor levantado. `package.json` no declara un archivo `vitest.config.ts`; Vitest usa el alias `@` declarado en `tsconfig.json` a través de la resolución de Vite, y las pruebas importan los fakes con la misma ruta relativa que usa el resto del árbol.

El frontend no declara script de pruebas ni framework de pruebas. Ese límite está documentado en `modules/frontend/06-testing.md`.

## Build y producción

```bash
cd backend
pnpm run build           # tsup
pnpm run start           # tsx src/server.ts
```

`tsup` genera un único archivo ESM desde `src/server.ts` con sourcemaps, target `es2022` y el alias `@` apuntando a `./src`.

```bash
cd frontend
pnpm run build           # astro build -> dist/
pnpm run preview         # sirve dist/ localmente
```

La salida de `astro build` es 100% estática. No hay servidor de render en el frontend: cada página pide sus datos a la API desde el navegador al abrirse.

Desde D-017 el build del frontend **no necesita el backend levantado**: la única página que consultaba la API en el build (`/sales/[id]`, con `getStaticPaths()`) se reemplazó por la página estática `/sales/detail`. `PUBLIC_API_URL` sigue siendo obligatoria en el entorno de compilación, porque Astro la incrusta en el bundle. Medido: `PUBLIC_API_URL=http://127.0.0.1:9 pnpm run build` termina con código de salida `0` y la misma cantidad de páginas que el build normal.

## Solución de problemas

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| El backend termina al arrancar con `Invalid environment variables` | Faltan variables en `backend/.env` o siguen presentes las cuatro JWT, que el esquema todavía exige | Comparar con `backend/.env.example` y completar `DATABASE_URL` |
| Error de conexión de `pg` (`ECONNREFUSED` o `Can't reach database server`) | PostgreSQL detenido o `DATABASE_URL` con puerto equivocado | Verificar el servicio y el DSN |
| Las consultas no imprimen en la terminal | `NODE_ENV=production` sube el nivel de Pino a `info` y silencia el formateo de `pino-pretty`; el aviso de consulta lenta sigue activo y solo emite las que superan `SLOW_QUERY_MS` | Ejecutar con `NODE_ENV=development` y, si no aparece ninguna, bajar `SLOW_QUERY_MS` |
| Aparece (o no aparece) una línea `slow query` con `ms` y `query` en la **terminal del backend** | Es la advertencia de consulta lenta: alguna consulta superó el umbral de `SLOW_QUERY_MS` (200 ms por defecto). Si no aparece ninguna y esperabas verlas, es que tardan menos que el umbral: **en local las consultas del Resumen tardan 1-4 ms** | Bajar el umbral en `backend/.env` (`SLOW_QUERY_MS=3` o `5`) para ver el ranking real en local; un `0` avisa de todas. En producción, contra la base remota, `200` ya avisa de lo que importa. Del lado de PostgreSQL, el servidor puede registrar lo mismo: `ALTER SYSTEM SET log_min_duration_statement = '200ms';` y `SELECT pg_reload_conf();` |
| El frontend muestra errores de red contra la API | `PUBLIC_API_URL` no existe en el entorno donde se compiló el frontend | Definirla y volver a ejecutar `pnpm run build` |
