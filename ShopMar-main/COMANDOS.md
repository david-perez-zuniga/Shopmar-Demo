# Comandos

Todos los comandos del monorepo, qué hace cada uno y cuándo usarlo. El proyecto
es un workspace de pnpm con cuatro paquetes: `backend/` (`shpr`), `frontend/`
(`shpr-web`), `qa/` y la raíz que los orquesta.

> Los comandos de esta página se corren **desde la raíz** salvo que digan
> «desde `backend/`» o «desde `frontend/`». Los que llevan `--` antes de las
> opciones (`pnpm create-admin -- --username …`) necesitan ese separador: es el
> operador de pnpm para pasar argumentos al script, no una opción del programa.

## Índice rápido

| Necesito | Comando |
|---|---|
| Levantar el backend con recarga | `pnpm dev:backend` |
| Levantar el panel con recarga | `pnpm dev:frontend` |
| Correr todos los tests | `pnpm test` |
| Verificar tipos en todo el monorepo | `pnpm typecheck` |
| Compilar todo | `pnpm build` |
| Aplicar migraciones | `pnpm db:migrate` |
| Sembrar datos de prueba (5000 ventas y 5000 gastos) | `pnpm seed` |
| Crear el primer administrador | `cd backend && pnpm create-admin -- --username … --email … --password …` |
| Crear un usuario con rol elegido | `cd backend && pnpm user:create -- --username … --email … --password … --role seller` |
| Abrir la base en el navegador | `pnpm db:studio` |
| Volver la base a cero y migrar | `pnpm db:reset` |

---

## 1. Raíz del monorepo

Son los que orquestan los cuatro paquetes; ninguno tiene lógica propia.

| Comando | Qué hace |
|---|---|
| `pnpm build` | Compila los paquetes en orden (`pnpm -r build`): backend con `tsup` y frontend con `astro build`. |
| `pnpm typecheck` | Corre el chequeo de tipos de cada paquete: `tsc --noEmit` en el backend y `astro check` en el frontend. Hoy pasa en **0 errores, 0 warnings y 0 hints**. |
| `pnpm test` | Corre los tests de cada paquete. **El backend necesita una base de test**: ver la sección 5. |
| `pnpm dev:backend` | Levanta la API con recarga (`tsx watch src/server.ts`), en `http://localhost:3000`. |
| `pnpm dev:frontend` | Levanta el panel con recarga (`astro dev`), en `http://localhost:4321`. |
| `pnpm db:migrate` | Atajo de `pnpm --filter shpr db:migrate`. |
| `pnpm db:reset` | Atajo de `pnpm --filter shpr db:reset`. |
| `pnpm db:studio` | Atajo de `pnpm --filter shpr db:studio`. |
| `pnpm seed` | Atajo de `pnpm --filter shpr seed`. |

Todo lo demás (backup, verificación del esquema, alta de usuarios) vive en el
paquete `backend`, así que se corre con `pnpm --filter shpr <script>` o
entrando a `backend/`.

---

## 2. Backend (`backend/`)

### Desarrollo y calidad

| Comando | Qué hace | Cuándo |
|---|---|---|
| `pnpm dev` | `tsx watch src/server.ts`: levanta la API y reinicia al guardar. | Todos los días. |
| `pnpm start` | `tsx src/server.ts`: levanta la API sin recarga. | Probar un build, o correr el servidor «de verdad» localmente. |
| `pnpm build` | `tsup`: empaqueta a `dist/`. | Antes de desplegar. |
| `pnpm typecheck` | `tsc --noEmit`. | Antes de commitear. |
| `pnpm test` | `vitest run`: unitarios y los 18 specs de integración contra una base real. | Antes de commitear; necesita base (sección 5). |

### Base de datos y migraciones

| Comando | Qué hace | Cuidado |
|---|---|---|
| `pnpm db:generate` | `drizzle-kit generate`: compara `src/db/schema/` con las migraciones y **escribe una migración nueva** en `drizzle/`. | No toca la base. Corrélo después de cambiar un schema y commiteá el archivo generado. |
| `pnpm db:migrate` | `drizzle-kit migrate`: aplica las migraciones pendientes a la base de `DATABASE_URL`. | Es el que hay que correr en un entorno nuevo. |
| `pnpm db:studio` | `drizzle-kit studio`: abre un explorador de la base en el navegador. | Solo lectura para revisar datos. |
| `pnpm db:check` | `node scripts/db-check.mjs`: prueba la conexión e informa host, base, usuario y conteos. | Primer diagnóstico cuando «no conecta». No imprime la contraseña. |
| `pnpm db:url` | `node scripts/db-url.mjs`: imprime las piezas de `DATABASE_URL` **con la contraseña censurada** y la URL para `pg_dump`. | Para armar un `psql`/`pg_dump` a mano sin filtrar el secreto en la terminal. |
| `pnpm db:backup` | `bash scripts/db-backup.sh`: `pg_dump` comprimido a `backend/backups/shpr-<fecha>.dump` (el directorio está fuera de git). | Antes de cualquier cosa destructiva. |
| `pnpm db:verify` | `bash scripts/db-verify.sh`: verifica que los índices escritos a mano existan con sus columnas y predicados. | Después de migrar o de tocar índices. |
| `pnpm db:reset` | Respalda, **dropea los schemas `public` y `drizzle`**, los recrea y aplica todas las migraciones. | **Destructivo**: borra todos los datos. Es el «volver a cero» que sí reconstruye las tablas (si no se dropea el schema `drizzle`, las migraciones quedan marcadas como aplicadas y la base queda vacía). |
| `pnpm seed` | Siembra el fixture de volumen: **5000 ventas, 5000 gastos, 40 clientes**, sobre los últimos dos meses, con días de negocio a medianoche UTC y el día local de hoy incluido. | **Destructivo** (`TRUNCATE` de las tablas del negocio): pensado para desarrollo y QA, no para una base con datos reales. |

### Usuarios y sesiones

El alta de usuarios no tiene registro público: se crea desde la terminal, o un
administrador la hace con `POST /api/v1/users`.

| Comando | Qué hace |
|---|---|
| `pnpm create-admin -- --username <usuario> --email <correo> --password <contraseña>` | Crea un usuario con rol **admin**. Fuerza el rol: aunque le pases `--role seller`, crea admin. |
| `pnpm user:create -- --username <usuario> --email <correo> --password <contraseña> [--role seller\|admin]` | Crea un usuario con el rol que pidas. Sin `--role`, crea **seller**. |
| `pnpm user:create -- --help` (o `pnpm create-admin -- --help`) | Muestra el uso y las reglas de cada campo. |

Reglas de los campos:

| Campo | Regla |
|---|---|
| `--username` | 3 a 32 caracteres, solo minúsculas, números, punto, guion y guion bajo (`^[a-z0-9._-]+$`). Único. |
| `--email` | Correo válido. Se guarda en minúsculas y es único. |
| `--password` | 8 caracteres o más. Se guarda hasheada con `scrypt`; el texto plano no queda en ningún lado. |
| `--role` | `seller` o `admin`. Por defecto `seller`. |
| `--admin` | Solo lo usa `create-admin`; fuerza `admin` y gana sobre `--role`. |

Comportamiento de la CLI:

- Si el usuario o el correo ya existen, falla con un mensaje claro
  (`username: That username is already taken`) y **código de salida 1**.
- La contraseña viaja como argumento de la terminal: es para la consola del
  servidor, no para un script remoto ni para un archivo versionado.
- Los usuarios creados pueden entrar por **usuario o por correo**, indistintamente.

Ejemplos completos, desde `backend/`:

```bash
cd backend

# Primer administrador (después de migrar la base)
pnpm create-admin -- --username ana --email ana@tienda.com --password 'una-contraseña-larga'

# Un vendedor
pnpm user:create -- --username carlos --email carlos@tienda.com --password 'otra-contraseña' --role seller

# ¿Qué opciones hay?
pnpm create-admin -- --help
```

Desde la raíz, lo mismo con filtro (ojo con el doble `--`):

```bash
pnpm --filter shpr create-admin -- --username ana --email ana@tienda.com --password 'una-contraseña-larga'
```

Para cerrar sesiones de alguien sin entrar al panel hay que escribir
`revoked_at` en su fila de `session` (por ejemplo con `pnpm db:studio`): no hay
comando para eso. El logout del panel revoca solo la sesión de ese navegador.

---

## 3. Frontend (`frontend/`)

| Comando | Qué hace | Cuándo |
|---|---|---|
| `pnpm dev` | `astro dev`: panel con recarga en `http://localhost:4321`. | Todos los días. |
| `pnpm build` | `astro build`: build estático en `frontend/dist/`. **`PUBLIC_API_URL` se compila dentro del bundle**: tiene que estar definida en el entorno donde compilás, no en el que sirve. | Antes de desplegar, y siempre antes de un humo con Playwright. |
| `pnpm preview` | Sirve el `dist/` compilado. | Revisar el build sin desplegar. |
| `pnpm astro` | Acceso directo a la CLI de Astro (`pnpm astro check`, `pnpm astro add …`). | Tareas puntuales de Astro. |
| `pnpm typecheck` | `astro check`: TypeScript sobre `.astro` y `.ts`. | Antes de commitear. Hoy pasa en 0/0/0. |
| `pnpm test` | `vitest run`: 74 archivos. | Antes de commitear. |
| `pnpm test:watch` | `vitest` en modo interactivo. | Mientras se escribe. |

Notas de despliegue del panel: es un build estático. El service worker necesita
**contexto seguro** (HTTPS o `localhost`), y después de desplegar hay que
**aceptar el aviso de «nueva versión»** del panel para que el worker nuevo
instale y purgue la caché del anterior.

---

## 4. QA (`qa/`)

Workspace externo con Playwright (decisión D-010). Necesita el backend y el
frontend levantados, y una cuenta para entrar: el panel exige sesión.

| Comando | Qué hace |
|---|---|
| `pnpm test` | `playwright test`: corre la suite de casos. |
| `pnpm report` | `playwright show-report`: abre el reporte HTML de la última corrida. |
| `pnpm metrics` | `node scripts/build-metrics.mjs`: arma las métricas de la corrida. |
| `pnpm qa` | Corre la suite y después las métricas. |

---

## 5. Tests del backend: la base de test

`pnpm test` del backend usa `backend/.env.test`, que apunta a
`postgresql://shpr:shpr@localhost:5433/shpr_test`. Si esa base no existe, los
specs de integración fallan con `password authentication failed` o
`database … does not exist`. Receta para levantar una descartable:

```bash
# Postgres efímero en un puerto libre (5439 en este ejemplo)
docker run -d --rm --name shopmar-test-pg \
  -e POSTGRES_USER=shpr -e POSTGRES_PASSWORD=shpr -e POSTGRES_DB=shpr_test \
  -p 5439:5432 postgres:17-alpine

# Migrar y correr la suite contra ESA base, sin tocar .env ni .env.test
cd backend
DATABASE_URL='postgresql://shpr:shpr@127.0.0.1:5439/shpr_test?schema=public' npx drizzle-kit migrate
DATABASE_URL='postgresql://shpr:shpr@127.0.0.1:5439/shpr_test?schema=public' pnpm test

# Al terminar
docker stop shopmar-test-pg
```

Los tests truncan las tablas del negocio y de cuentas entre casos: **nunca
apuntes la suite a una base con datos que te importen**. `backend/.env` (la base
de desarrollo) y `backend/.env.test` (la de test) son archivos distintos a
propósito.

---

## 6. Orden típico desde cero

```bash
pnpm install

# Base con el esquema al día (y respaldo antes de tocar nada)
pnpm --filter shpr db:backup
pnpm db:migrate

# Primer administrador
pnpm --filter shpr create-admin -- --username ana --email ana@tienda.com --password '…'

# Opcional: datos de volumen para probar el panel
pnpm seed

# Desarrollo, en dos terminales
pnpm dev:backend
pnpm dev:frontend
```

Al terminar, el panel queda en `http://localhost:4321` y la API en
`http://localhost:3000/api/v1`. `GET http://localhost:3000/health` responde el
estado del proceso sin sesión.
