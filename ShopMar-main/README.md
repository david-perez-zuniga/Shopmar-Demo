# shpr

Panel de ventas, gastos y paquetes. Monorepo pnpm: API REST en Fastify + Drizzle +
PostgreSQL, y frontend estático en Astro.

## Requisitos

- Node 20 o superior
- pnpm 9 o superior
- Docker (solo para PostgreSQL)

## Puesta en marcha

Cuatro pasos, en este orden. El orden importa: el frontend se genera contra la API
en vivo, así que sin el backend levantado el build falla con `NETWORK_ERROR`.

### 1. Base de datos

El proyecto usa el puerto **5433**, no el 5432, para no chocar con un PostgreSQL
local que ya pueda estar corriendo.

```bash
docker run -d --name shpr-postgres \
  -e POSTGRES_USER=shpr -e POSTGRES_PASSWORD=shpr -e POSTGRES_DB=shpr \
  -p 5433:5432 postgres:17-alpine
```

Para stoppearla y volver a arrancarla más adelante:

```bash
docker stop shpr-postgres     # parar
docker start shpr-postgres    # arrancar
```

### 2. Variables de entorno

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`PUBLIC_API_URL` del frontend tiene que existir **donde se compila**, no donde se
sirve: Astro la incorpora al bundle durante el build.

### 3. Dependencias, migraciones y datos

Desde la raíz del repositorio:

```bash
pnpm install
pnpm --filter shpr db:migrate    # aplica las migraciones
pnpm seed                        # 5000 ventas, 5000 gastos y sus artículos adicionales
```

`pnpm seed` **trunca** `sale`, `additional_sale` y `expense` antes de insertar: es
un fixture de volumen, no una carga incremental. Si tenés datos que querés
conservar, corré `pnpm --filter shpr db:backup` antes.

El volumen es un objetivo exacto (`TARGET_SALES` y `TARGET_EXPENSES` en
`backend/src/scripts/seed.ts`). Los paquetes **no son una tabla aparte**: son
ventas con `shipment_method` asignado, y la pantalla de paquetes lista todas las
ventas. La salida del seed imprime el desglose por método de envío.

`pnpm --filter shpr db:reset` rehace la base desde cero. **Es destructivo**: hace
un backup en `backend/backups/` antes, pero borra todo lo que haya.

### 4. Las dos apps

Dos terminales:

```bash
pnpm dev:backend    # API en http://localhost:3000
pnpm dev:frontend   # panel en http://localhost:4321
```

### Para detener

`Ctrl+C` en cada terminal es lo normal. Si cerraste la terminal o el proceso se
quedó colgado, el puerto 3000 puede quedar tomado aunque parezca que no hay nada
corriendo: `tsx watch` deja un proceso hijo que sobrevive al que lo lanzó.

```bash
# ver quién tiene el puerto
ss -ltnp 'sport = :3000'

# detener backend
pkill -f 'tsx.*src/server.ts'

# detener la base y arrancarla de nuevo
docker stop shpr-postgres
docker start shpr-postgres
```

## Verificación

```bash
pnpm test           # 127 backend + 61 frontend
pnpm typecheck      # 0 errores
```

Para el build del frontend hace falta el backend arriba:

```bash
pnpm --filter shpr-web build
```

Emite un `.html` por ruta estática **más uno por venta** (`/sales/[id]`), así que
el número de páginas depende del volumen de la base.

## Despliegue

El panel y la API viven en orígenes distintos, y la sesión es una cookie
`HttpOnly` `SameSite=None; Secure`. Eso es correcto, pero **no alcanza**: para el
navegador esa cookie es de terceros. Safari la bloquea siempre y Chrome cuando
tiene activado el bloqueo de cookies de terceros, así que el login entra y el
primer `GET /auth/me` vuelve `401` — el guard devuelve a `/login` y el síntoma es
"me loguea y me saca".

Por eso el panel **no** llama a la API por su host público: llama a su propio
origen y Vercel reenvía, así la cookie es de primera parte. La reescritura vive en
[`frontend/vercel.json`](frontend/vercel.json):

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://<host-de-la-api>/api/:path*" }
  ]
}
```

En el panel de Vercel, `PUBLIC_API_URL=/api/v1` (relativa, sin host) en los
alcances **Production** y **Preview**. Como Astro la incorpora al bundle durante
el build, cambiar la variable no cambia nada hasta el siguiente deploy.

Esa dependencia del build ya no puede romper el panel: `resolveApiBase`
(`frontend/src/lib/core/api-base.ts`) reescribe en el navegador una base absoluta
de **otro origen** a su camino relativo cuando la página se sirve por HTTPS. Es
decir, un `PUBLIC_API_URL` que quedó con la URL del backend se corrige solo y la
cookie vuelve a ser de primera parte. La variable relativa sigue siendo lo
correcto; esto es la red de seguridad para cuando el panel de Vercel y el
repositorio no coinciden.

Con la reescritura, CORS deja de aplicar para el panel (mismo origen) y el límite
de intentos del login se mide contra la IP que ve Fastify, que pasa a ser la del
proxy.

### Invalidar la caché de los teléfonos

Un despliegue no llega solo: el service worker sirve el armazón desde su propia
caché, así que un panel ya instalado puede seguir ejecutando el build anterior.
Hay dos perillas y **se suben a mano**, en este orden:

| Perilla | Archivo | Qué invalida |
|---|---|---|
| `VERSION` | `frontend/public/sw.js` | El armazón, los chunks de `/_astro/` y la caché de respuestas de la API. El `activate` borra toda caché de una versión anterior |
| `STORAGE_GENERATION` | `frontend/src/lib/core/storage-reset.ts` | La copia del `me` que guarda el guard, una vez por dispositivo. Conserva el tema y los borradores de venta |

Desde `5.0.0` el worker nuevo **se activa solo** (`skipWaiting` en `install`) en
vez de esperar a que alguien toque el aviso de versión nueva: en una PWA
instalada ese toque no llega nunca. El panel abierto no se recarga —`pwa.ts` sólo
recarga cuando la persona acepta— así que activar no interrumpe una carga en
curso.

`/sw.js` se sirve con `Cache-Control: public, max-age=0, must-revalidate`
(`frontend/vercel.json`): sin eso, un navegador podría no volver a pedir el
archivo y la versión nueva no se detectaría nunca.

### Sacar a todo el mundo al login

Ninguna de las dos perillas anteriores alcanza por sí sola, porque **la sesión no
vence**: la cookie se emite con `Max-Age` de diez años
(`backend/src/modules/auth/presentation/session-cookie.ts`) y el guard del backend
sólo mira `revoked_at`. Para forzar un re-login general hay que revocar las
sesiones en la base:

```bash
psql "$DATABASE_URL" -f backend/scripts/revoke-all-sessions.sql
```

El script marca `revoked_at` en todas las sesiones vivas. Después de eso, el
primer `GET /auth/me` de cada teléfono devuelve `401` y `expireSession` lo manda a
`/login`. Es una escritura sobre datos de producción: revisá el conteo que imprime
antes del `UPDATE`.

### Limpiar la caché a mano en el teléfono

Cuando hace falta ver el estado real de un dispositivo —para descartar que el
problema sea caché antes de buscar en otro lado— el service worker no alcanza
con recargar:

**Android, en el navegador**

1. Tocar el candado de la barra de direcciones → *Cookies y datos del sitio* →
   **Eliminar datos**. O bien ⋮ → *Configuración* → *Configuración de sitios* →
   *Almacenamiento* → buscar el sitio → **Borrar y restablecer**.
2. Para ver o desregistrar el worker: escribir `chrome://serviceworker-internals`
   en la barra de direcciones.
3. Con el teléfono por USB y *Depuración USB* activa, `chrome://inspect` en la
   computadora da DevTools completo: *Application* → *Service Workers* →
   *Unregister*, y *Storage* → *Clear site data*.

**Android, con la PWA instalada**

La aplicación instalada tiene **su propio** almacenamiento, separado del
navegador: borrar los datos del sitio no la toca. ⋮ → *Configuración* →
*Aplicaciones* → **ShopMar** → *Almacenamiento* → **Borrar datos**, o desinstalar
y volver a instalar.

**iPhone**

1. En Safari: *Ajustes* → *Safari* → *Avanzado* → *Datos de sitios web* → buscar
   el sitio → **Eliminar**. Borrar todo el historial y los datos también sirve,
   pero es más de lo necesario.
2. Con la PWA en la pantalla de inicio: **no hay atajo**. El ícono tiene su propio
   contenedor y los datos de Safari no lo alcanzan. Hay que mantenerlo presionado
   → *Eliminar app*, y volver a agregarla desde Safari.

**En la computadora**

DevTools → *Application* → *Service Workers* → *Unregister*, luego *Storage* →
*Clear site data*.

Nada de esto reemplaza la tabla de perillas de arriba: si el arreglo no está
desplegado y las perillas no se subieron, limpiar el teléfono sólo te muestra el
mismo build viejo una vez.

## Estructura

- `backend/` — API REST. `src/modules/` tiene un módulo por recurso, con sus
  capas `domain/`, `application/`, `infrastructure/` y `presentation/`.
- `frontend/` — Astro estático. `src/lib/` es la capa de lógica de presentación:
  `api.ts` (el único `fetch`), `errors.ts`, `format.ts`, `date.ts`, `dom.ts`.
- `specs/` — especificaciones. `specs/tasks/<módulo>/<tarea>.md` son las tareas con
  sus criterios de Done; `specs/modules/` el diseño de cada módulo.
- `odd/` — trackers de trabajo. Ignorado por git a propósito.

## Comandos de base de datos

La referencia completa de **todos** los comandos del monorepo —desarrollo, migraciones, seed, alta de usuarios y QA— está en [`COMANDOS.md`](COMANDOS.md).

Los de base de datos, todos desde la raíz:

| Comando | Qué hace |
| --- | --- |
| `pnpm --filter shpr db:generate` | Genera una migración desde `backend/src/db/schema/` |
| `pnpm --filter shpr db:migrate` | Aplica las migraciones de `backend/drizzle/` |
| `pnpm --filter shpr db:reset` | **Destructivo.** Backup, borra y recrea el esquema `public`, y aplica las migraciones |
| `pnpm seed` | **Trunca** y carga 5000 ventas y 5000 gastos |

**`drizzle-kit push` está prohibido en este proyecto.** Drizzle no puede expresar
índices con `INCLUDE`, así que los cuatro índices cubrientes viven como SQL a mano
en `backend/drizzle/*indices_cubrientes/`. `push` diffea contra la base viva, no
los ve en el schema y los borraría sin avisar. El camino es siempre `generate` +
`migrate`. El guard es `backend/scripts/verify-schema.sql`.

Para revisar la base a mano:

```bash
cd backend
pnpm db:url        # imprime la DATABASE_URL con la contraseña censurada
pnpm db:check      # estado de conexión y conteos
pnpm db:verify     # invariantes del esquema
```

## API

Base: `http://localhost:3000/api/v1`. El sobre de error es
`{ code, message, details? }` y los códigos son `BAD_REQUEST`, `NOT_FOUND`,
`INTERNAL_ERROR`, `UNAUTHORIZED`, `FORBIDDEN` y `NETWORK_ERROR`.

```bash
curl http://localhost:3000/api/v1/sales
curl 'http://localhost:3000/api/v1/dashboard/summary?start_date=2026-09-01&end_date=2026-09-30'
curl http://localhost:3000/api/v1/dashboard/summary   # sin rango, histórico entero
curl http://localhost:3000/health                     # control de vida del proceso
```

`GET /health` no es un endpoint de negocio: vive fuera de `/api/v1`, responde
`200` con `{ status, uptime_seconds, timestamp }` mientras el proceso atienda
HTTP y no consulta la base. No cuenta en los veintiún endpoints del contrato.

El detalle de cada endpoint está en `backend/src/modules/*/presentation/*.routes.ts`.