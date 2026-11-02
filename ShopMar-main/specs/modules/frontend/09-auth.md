# Autenticación del panel

La sesión, del lado del navegador. El contrato HTTP —endpoints, cuerpos, mensajes y códigos— está en `modules/api/07-auth.md` y la decisión en D-024. Este documento fija **qué hace el panel** con eso: la vista `/login`, el guard del router, la caché del `me`, el logout, la regla «un `401` borra la sesión local; un error de red no», y qué ve cada rol.

## La sesión es una cookie que el panel no puede leer

El servidor emite `shpr_session` con `HttpOnly`, así que **el JavaScript del panel no la ve ni la puede guardar**: no hay token en `localStorage`, no hay `Authorization`, no hay nada que el cliente pueda perder al recargar. Lo único que el panel sabe de la sesión es lo que le contesta `GET /api/v1/auth/me`.

De ahí sale la regla que ordena todo el módulo: **la sesión local es una copia de la respuesta de `me`, no un dato propio**. Cuando esa copia deja de ser válida, se borra; mientras no se sepa, se conserva.

`apiFetch` (`lib/core/api.ts`) agrega `credentials: "include"` a **todas** las peticiones, sin excepción y sin que ninguna vista lo recuerde. Sin esa opción el navegador no manda la cookie en un pedido cross-origin y todo `/api/v1` responde `401`.

## La vista `/login`

**Es una ruta, no una vista de la SPA.** `/login` se sirve como documento propio (`src/pages/login.astro`) fuera del armazón: no lleva la barra lateral, ni la barra inferior, ni el cajón, porque esas piezas son la navegación de un panel que todavía no se abrió. Es la misma razón por la que `/offline` y `/404` quedan fuera del router (D-023): un documento que no es del panel no se sirve del armazón.

| Pieza | Regla |
|-------|-------|
| Campos | `identifier` (usuario **o** correo, un solo campo) y `password`. Nada más: no hay «recordarme», porque la sesión ya no vence. |
| Envío | `POST /api/v1/auth/login` con el cuerpo tal cual. Deshabilitado mientras hay un pedido en vuelo, para que el doble toque no cuente como dos intentos del límite de 10 por minuto. |
| Éxito | Se limpia la caché de datos (`clearCache()`), se guarda el `me` que devolvió el login y se navega a `next` o a `/` con `location.replace`, para que el botón atrás no vuelva al formulario. |
| `401` | Un solo mensaje: «Usuario o contraseña incorrectos.». El panel **no** distingue «no existe» de «contraseña incorrecta», porque el servidor tampoco lo hace: el `Invalid credentials` del contrato es el mismo para las dos. |
| `429` | «Demasiados intentos. Esperá un minuto.» El límite es de 10 por minuto por IP. |
| Red | «No se pudo conectar». La cookie y la sesión no se tocan: no hay sesión todavía. |
| `next` | Si la URL trae `?next=`, se valida que sea una ruta del panel (`/`, `/sales`, …) antes de usarla; cualquier otra cosa cae en `/`. Nunca se redirige a un origen externo. |

**La pantalla no hereda del armazón ni el tema ni la instalación, así que los trae propios.** Arriba y a la derecha hay un botón **Modo claro / Modo oscuro** que usa el mismo módulo del panel (`lib/shell/theme-toggle.ts`): cambia `data-theme`, guarda la elección en `localStorage` bajo `shopmar:theme` y actualiza el `theme-color`, así que el panel abre con el tema elegido acá y `ThemeBoot` evita el parpadeo en la siguiente visita. Debajo del formulario está el botón **«Instalar aplicación»** con su indicación para iPhone e iPad; para que exista, este documento declara el `manifest`, el `apple-touch-icon` y los `meta` de `apple-mobile-web-app-*`, y registra el service worker (`initPwa`). El detalle de la instalación vive en `08-pwa.md`.

El formulario valida lo mínimo en el cliente —los dos campos no vacíos— para no gastar un intento del rate limit en un envío vacío, y todo lo demás lo decide el servidor. `password` no tiene regla de largo en el login: solo importa que coincida.

## El guard del router

El guard vive en el arranque de la SPA (`lib/auth/session.ts` más el `start.ts` del router), **antes** de montar la primera vista. El orden es deliberado: si se montara primero y se redirigiera después, un `seller` sin sesión vería un parpadeo del panel.

```
arranque ──► leer me cacheado
                │
      ┌─────────┼──────────────────┐
      │         │                  │
   sin copia   copia            (sin copia y sin red)
      │         │                  │
  GET /auth/me  montar la vista    aviso «sin conexión» + reintentar
      │
  ┌───┴─────────────┐
 200               401              red / 5xx
  │                 │                  │
guardar me   borrar la copia     NO se decide nada:
y montar     y /login?next=…     se conserva la copia y se reintenta
```

**Las tres respuestas no son dos.** El caso que parece un detalle es el tercero: un `401` es una respuesta del servidor sobre la sesión, y un error de red o un `500` no dicen nada sobre ella. Por eso el guard solo entra a `/login` con un `401`.

**El guard no protege el HTML.** El documento del panel se sirve sin sesión, porque es un archivo y no lleva datos (ver «Qué protege y qué no» en `07-auth.md`). Lo que no viaja sin cookie son las respuestas de la API, y por eso el guard es de cliente: su trabajo es no mostrar una pantalla vacía de datos que van a fallar, no esconder el armazón.

## La caché del `me`

| Aspecto | Regla |
|---------|-------|
| Qué se guarda | El `user` de `GET /auth/me`: `id`, `username`, `email` y `role`. Nada más. |
| Dónde | En `localStorage`, bajo una clave versionada (`shopmar:me:v1`). **No** es la sesión: es la última copia de la respuesta de `me`, y sirve para dos cosas — pintar el panel sin esperar la red y sostener un arranque en frío sin conexión (S3: el wifi del mostrador). Una cookie robada no se puede fabricar desde acá: el servidor exige la cookie real. |
| Quién la escribe | El login (con el `user` que devuelve) y el guard (con el `me`). Nadie más. |
| Quién la borra | Un `401` de cualquier pedido y el logout. Nada más: ni recargar el documento, ni `clearCache()` (esa es la caché de datos, no la identidad), ni un corte de red. |
| Para qué sirve | Para el `role` de la interfaz y para no repetir `me` en cada navegación entre vistas: el panel abre, pregunta una vez y navega con la copia. |
| Qué **no** hace | No decide si la sesión es válida. Eso lo decide el servidor: la copia dice «la última vez que pregunté, había sesión», y el primer `401` la desmiente. |

El `role` de esta copia es lo único que el frontend usa para esconder lo que no corresponde. **No es una autorización**: el servidor exige el rol igual, y un `seller` que llame a `POST /users` recibe `403` aunque el botón esté escondido.

## La regla de oro: un `401` borra, un error de red no

Vive en un solo lugar —el manejo de errores de `apiFetch`— y no en cada vista:

| Respuesta | Qué hace el panel | Por qué |
|-----------|-------------------|---------|
| `401 UNAUTHORIZED` | Borra la copia del `me`, llama a `clearCache()` y navega a `/login?next=<ruta actual>` con `location.replace`. Es idempotente: si ya está en `/login`, no hace nada. | El servidor dijo que la sesión no vale. Seguir mostrando el panel solo produce errores en cadena. |
| `403 FORBIDDEN` | Muestra el mensaje del servidor en el sobre de error de la pantalla. **No** desloguea. | La sesión es válida; lo que falta es un permiso. |
| `NETWORK_ERROR` (falla de `fetch`, `status: 0`) | Muestra «no se pudo conectar» y **conserva la sesión y el último `me`**. | El mostrador se queda sin wifi. Expulsar a la dueña por un corte de red es exactamente el defecto que D-024 evita. |
| `500 INTERNAL_ERROR` | Igual que la red: mensaje de error, sesión intacta. | Un fallo del servidor no dice nada sobre la validez de la cookie. |

Esta es la regla que hace usable la sesión que no vence: **la sesión solo se pierde cuando el servidor la rechaza**, nunca por antigüedad, ni por reiniciar el navegador, ni por un corte de red.

## Logout

El bloque de sesión —usuario, rol y el botón «Cerrar sesión»— vive en la barra lateral y en el cajón, que son las dos superficies donde ya está la navegación completa; en el teléfono se llega por el cajón, porque la barra inferior no suma destinos de cuenta. La barra superior no lo repite: en escritorio la lateral está siempre a la vista y en móvil el cajón es el menú. Hace dos cosas en este orden:

1. `POST /api/v1/auth/logout`, que revoca la sesión de la cookie y responde con `Max-Age=0`.
2. Borra la copia local (y la caché de datos) y navega a `/login`.

Si el pedido falla por red, **la copia local se borra igual**: la persona pidió salir, y dejarla adentro por un corte de wifi es lo contrario de lo que pidió. Lo que queda es una fila de `session` sin revocar, que el servidor seguirá aceptando hasta que se revoque desde la terminal o la persona vuelva a entrar y cierre sesión bien. Está anotado como el costo de esta regla, no como un olvido.

## Qué ve un `seller` y qué un `admin`

| Acción | `seller` | `admin` |
|--------|----------|---------|
| Ver y operar el panel de negocio (resumen, ventas, clientes, paquetes, gastos) | Sí | Sí |
| Ver el alta de usuarios | **No**: la acción no se pinta | Sí |
| Crear un usuario (`POST /users`) | No: el servidor responde `403` | Sí |
| Listar, editar o borrar usuarios | No existe en el panel: es tarea de terminal | Igual |
| Cerrar sesión | Sí | Sí |

La diferencia es **una sola**: el alta de usuarios. El `role` que llega en `me` decide si la acción se pinta, y el `403` del servidor es la red para cuando la copia del `me` está vieja (un `admin` degradado a `seller` en la base mientras tenía el panel abierto). La pantalla de alta —cuatro campos y la respuesta `201` o `409`— es parte del armazón y su markup llega con la unidad de frontend; lo que esta spec fija es la regla de visibilidad.

## Comportamiento offline con sesión cacheada

El panel ya funciona sin conexión para el armazón y para los datos que cacheó el service worker (`08-pwa.md`). Con sesión, la regla no cambia y se apoya en la de oro:

- **Con copia del `me` y sin red**: el panel monta la vista pedida, cada pantalla muestra su estado de error de datos y su «Reintentar», y se ve el aviso de datos viejos que ya existe. **No se redirige a `/login`**: una sesión cacheada no se pierde por estar sin conexión.
- **Sin copia del `me` y sin red** (arranque en frío offline): el guard no puede confirmar nada, así que **no manda a `/login`** —hacerlo sería desloguear por un corte de red— y muestra el armazón con el aviso de sin conexión y un reintento. Cuando vuelve la red, el reintento resuelve: `200` monta, `401` manda a `/login`.
- **Recargar el panel sin red** pierde la copia del `me` (vive en memoria), así que el caso anterior es también el de un F5 offline. Es aceptable porque el panel no puede operar sin API: lo que se conserva es la sesión, no la pantalla.

## Lo que se prueba

| Pieza | Qué fija el test |
|-------|------------------|
| `lib/auth/session.ts` (puro) | La decisión del guard para cada resultado: `200` → montar y guardar; `401` → borrar y `/login`; red o `5xx` → conservar y reintentar. Y que un `403` no desloguea. |
| `lib/auth/login.ts` (puro) | La validación de los dos campos, la lectura y el saneo de `next`, y la traducción de `401` y `429` al texto de la vista. |
| `lib/auth/logout.ts` | Que la copia local se borra tanto si el pedido responde como si falla por red. |
| `apiFetch` con `credentials` | Que toda petición lo lleva, incluida la del login y la del logout. |

Lo que **no** se prueba en este paquete: la cookie real, el guard del servidor y el `403` del alta. Eso son casos de integración del backend (`modules/backend/05-testing.md`) y de flujo completo en el workspace `qa/`.
