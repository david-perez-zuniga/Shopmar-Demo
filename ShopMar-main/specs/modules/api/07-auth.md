# Autenticación

Cuatro endpoints nuevos bajo `/api/v1`. **No hay registro público**: el único que crea usuarios es un administrador autenticado, y el primer administrador se crea con un comando de la terminal. No hay recuperación de contraseña ni verificación de correo: quien olvida su contraseña se la cambia un administrador desde la base o con el comando de alta.

Estos cuatro endpoints **no cuentan** en los veintiún endpoints de negocio: son el contrato de acceso, y viven en `src/modules/auth/` y `src/modules/users/`.

## Roles

Dos, y solo dos:

| Rol | Puede |
|-----|-------|
| `seller` (vendedor) | Todo el panel de negocio: ventas, clientes, paquetes, gastos y resumen. **No** crea usuarios. |
| `admin` (administrador) | Lo mismo, y además `POST /api/v1/users`. |

El rol se guarda en `user.role` y viaja en la respuesta de `GET /api/v1/auth/me`. El frontend lo usa para mostrar o esconder el alta de usuarios; el servidor lo exige igual, porque el cliente nunca es autoridad.

## La sesión

**Una sesión no vence.** No hay `expires_at`: el único acto que la invalida es `POST /api/v1/auth/logout`. La cookie se emite con `Max-Age` de diez años y el servidor nunca la rechaza por antigüedad. Es un requisito del negocio: la dueña del comercio usa el panel desde el teléfono y no puede volver a escribir la contraseña cada vez que el navegador se reinicia.

| Atributo | Valor | Por qué |
|----------|-------|---------|
| Nombre | `shpr_session` | Prefijo del proyecto, un solo dominio. |
| Contenido | token opaco de 32 bytes, `base64url` | No es un JWT: no lleva datos adentro, así que no se puede leer ni editar en el cliente. |
| `HttpOnly` | sí | JavaScript no puede leerla: un XSS no se lleva la sesión. |
| `SameSite` | `Lax` en desarrollo, `None` en producción | En desarrollo el panel y la API son `localhost` (mismo sitio). En producción pueden estar en hosts distintos, y ahí hace falta `None`. |
| `Secure` | `false` en desarrollo, `true` en producción | `None` exige HTTPS; en `localhost` no aplica. |
| `Path` | `/` | Los cuatro endpoints y los de negocio. |
| `Max-Age` | `315360000` (10 años) | Pedido explícito: la sesión sobrevive reinicios, actualizaciones del navegador y meses sin entrar. |

Del token, el servidor guarda **solo el `sha256`**: quien lea la tabla `session` no puede reconstruir la cookie. Comparar es `timingSafeEqual`.

### Lo que la sesión no hace

- No se renueva por inactividad ni rota por navegación: es la misma hasta el logout.
- No hay sesiones por dispositivo: cada login crea una sesión nueva y el logout revoca **la de esa cookie**. Un administrador puede revocar todas desde la base (`revoked_at`), y eso deja al usuario afuera en el próximo pedido.
- No hay lista de sesiones ni “cerrar sesión en todos los dispositivos” en el contrato.

## Endpoints

### `POST /api/v1/auth/login`

Público. Rate limit: **10 intentos por minuto por IP** (el límite global del panel es 1000; este es propio).

```json
{ "identifier": "ana@tienda.com", "password": "…" }
```

- `identifier` acepta **nombre de usuario o correo**, indistintamente, sin distinguir mayúsculas.
- `password`, mínimo 8 caracteres al validar el alta; en el login solo importa que coincida.

**200**

```json
{
  "user": {
    "id": "8f1c…",
    "username": "ana",
    "email": "ana@tienda.com",
    "role": "seller"
  }
}
```

Y `Set-Cookie: shpr_session=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=315360000`.

**Errores** — mismo sobre que el resto (`{ code, message, details? }`):

| Caso | Estado | `code` | `message` |
|------|--------|--------|-----------|
| Falta `identifier` | 400 | `BAD_REQUEST` | `identifier: Identify yourself with your username or email` |
| Falta `password` | 400 | `BAD_REQUEST` | `password: Password is required` |
| Usuario inexistente, contraseña incorrecta, usuario borrado | **401** | `UNAUTHORIZED` | `Invalid credentials` |
| Más de 10 intentos en un minuto | 429 | `RATE_LIMITED` | — (lo pone el rate limit) |

Las tres causas de rechazo comparten **el mismo mensaje y el mismo estado**: el login no revela si un correo existe.

### `POST /api/v1/auth/logout`

**No exige una sesión válida**: es idempotente. Si la cookie trae una sesión viva, la revoca (`revoked_at`); si no la trae, o ya estaba revocada, responde igual. Siempre contesta `200 { "message": "Sesión cerrada" }` con un `Set-Cookie` que borra la cookie (`Max-Age=0`): cerrar sesión dos veces, o desde un navegador que ya la perdió, no es un error.

### `GET /api/v1/auth/me`

Requiere sesión. Devuelve **el mismo sobre que el login**: `200 { "user": { id, username, email, role } }`. Es lo que usa el panel al abrir para saber si hay sesión, y **la única fuente de verdad del rol**.

- Sin cookie, cookie desconocida o sesión revocada → `401 UNAUTHORIZED` con `message: "Authentication required"`.

### `POST /api/v1/users`

**Solo administradores.** Un `seller` recibe `403 FORBIDDEN` con `message: "Only an administrator can create users"`.

```json
{ "username": "carlos", "email": "carlos@tienda.com", "password": "…", "role": "seller" }
```

| Campo | Regla |
|-------|-------|
| `username` | 3 a 32 caracteres, `^[a-z0-9._-]+$` en minúsculas, único |
| `email` | correo válido, único, sin distinguir mayúsculas |
| `password` | mínimo 8 caracteres |
| `role` | `seller` o `admin` |

**201** con el usuario creado, **sin** contraseña ni hash:

```json
{ "id": "…", "username": "carlos", "email": "carlos@tienda.com", "role": "seller", "created_at": "2026-10-24T00:00:00.000Z" }
```

Conflictos: `409 CONFLICT` con `username: That username is already taken` o `email: That email is already registered`.

**No existe** `GET /api/v1/users`, ni `PATCH`, ni `DELETE`: administrar usuarios fuera del alta es una tarea de terminal, no del panel.

## El primer administrador

Ningún endpoint lo crea: sin nadie autenticado no hay administrador que pueda llamar a `POST /users`. Se crea con un comando, que es la única puerta de entrada al sistema:

```bash
pnpm create-admin -- --username ana --email ana@tienda.com --password 'una-contraseña-larga'
```

Crea el usuario con `role: "admin"`. Si ya existe un usuario con ese nombre o correo, falla con un mensaje claro y no toca nada. La contraseña viaja por argumento de línea de comandos: el comando está pensado para la terminal del servidor, no para un script remoto, y lo documenta.

## CORS y credenciales

El panel es un build estático que habla con la API desde otro origen, así que la cookie viaja con `credentials: "include"` y el servidor responde `Access-Control-Allow-Credentials: true` **solo** para los orígenes de `CORS_ORIGIN`. Sin comodín `*`: con credenciales, un comodín no es válido y además abriría la API a cualquier origen.

## Qué protege y qué no

- **Protege** todos los endpoints de negocio (`/api/v1/sales`, `/customers`, `/packages`, `expenses`, `dashboard`) y los tres de autenticación que lo requieren: sin sesión válida, `401`.
- **No protege** el armazón estático: el HTML del panel se sirve sin sesión (es un archivo), y por eso no hay datos en él. Lo que no viaja sin cookie son los datos de la API.
- **No hay bloqueo de cuenta** por intentos fallidos. El rate limit por IP es la única defensa, además del costo de `scrypt`.
- **No hay recuperación de contraseña.** Un administrador la reemplaza desde la terminal.
