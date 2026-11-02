# 07 — Capas de vista, modales y filtros globales

## Estado Actual

El andamiaje usa `@fastify/cors`, `@fastify/helmet` y `@fastify/rate-limit`. En esta arquitectura las rutas no tienen guardas de autenticación, así que el `rate-limit` global deja de tener sentido como protección de recursos: lo único que queda es un contador de peticiones por IP.

La CORS sí importa, porque el frontend es un sitio estático servido desde un origen distinto al del backend. Sin configuración explícita, el navegador bloquea la llamada antes de que llegue al servidor.

También falta la pieza que hace que los errores se vean bien en el navegador: el manejador global devuelve JSON, y el frontend necesita poder distinguir un `400` de validación de un `500` sin leer el cuerpo crudo.

## Objetivo

Cerrar la superficie HTTP del backend: CORS apuntando al origen del frontend, la aplicación web servida como único origen permitido, y un manejado de CORS que no rompa el desarrollo local.

## Alcance

- Configurar `@fastify/cors` con el origen del frontend leído del entorno.
- Configurar el reemplazo de variables de entorno en `backend/.env.example` y en `src/config/env.ts`.
- Verificar que las 13 rutas quedan registradas bajo `/api/v1` con el prefijo correcto.
- Configurar el manejador de errores para que las respuestas sean uniformes.
- Añadir los headers de seguridad razonables con `@fastify/helmet`.

**Archivos tocados:** `backend/src/index.ts`, `backend/src/config/error-handler.ts`, `backend/.env.example`, `backend/src/config/env.ts`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| Autenticación, sesiones o guards | Es `tasks/backend/01-retirar-andamiaje-de-autenticacion-y-usuarios.md`. |
| Endpoints nuevos | El contrato de 13 endpoints está cerrado. |
| Helmet con CSP estricto | La API solo sirve JSON, no HTML, así que una CSP no aporta nada aquí. El frontend es estático y no pasa por Fastify. |
| Compresión (`@fastify/compress`) | Doce y trece respuestas de cientos de registros no justifican otra dependencia. |
| Logging estructurado con `pino-http` | `pino` ya está configurado en `src/index.ts`. Un logger de peticiones es una mejora, no un requisito. |
| CORS permisivo con `origin: true` | Refleja cualquier `Origin` y desactiva la protección. En un panel sin credenciales el riesgo es menor, pero un `origin: true` en producción es una sorpresa esperando a producción. |
| Un origen separado para desarrollo y producción | La variable `CORS_ORIGIN` puede contener una lista separada por comas, y eso cubre ambos casos sin ramificar el código. |
| Servir el build de Astro desde Fastify | El frontend se sirve como estático desde su propio host. Un solo origen para todo simplificaría el CORS, pero mezcla dos artefactos en un proceso. |

## Tareas

1. En `backend/src/config/env.ts`, agregar la variable `CORS_ORIGIN` al esquema de validación, con tipo `string` y valor por defecto apuntando al origen local del frontend.
2. Verificar que el esquema de `env.ts` sigue siendo estricto: una variable desconocida en `.env` debe fallar al arrancar. Esa es la defensa contra el `.env` con las cuatro variables JWT que se limpian en la tarea 01.
3. En `backend/.env.example`, agregar `CORS_ORIGIN` con el valor por defecto, y confirmar que no quedan `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET` ni `JWT_REFRESH_EXPIRES_IN`.
4. En `backend/src/index.ts`, registrar `@fastify/cors` **antes** de los módulos de negocio, con la lista de orígenes derivada de `CORS_ORIGIN` separada por comas y filtrada de vacíos.
5. En el mismo archivo, configurar `methods` con la lista completa de verbos que usan los 13 endpoints: `GET`, `POST`, `PUT`, `PATCH`, `DELETE` y `OPTIONS`. Si falta `PATCH`, el `PATCH /sales/:id/status` falla en desarrollo.
6. En el mismo archivo, configurar `allowedHeaders` con `Content-Type` y `Authorization`. `Authorization` no lo usa ningún endpoint hoy, pero es lo que cualquiera esperaría de una API y su ausencia produce un error confuso si mañana se agrega.
7. En el mismo archivo, configurar `exposedHeaders` con `Content-Type`, para que el frontend pueda leer el tipo de la respuesta en errores de red.
8. En el mismo archivo, configurar `maxAge: 86400` para que el navegador cachee el `preflight` un día y no lo reintente en cada petición.
9. En el mismo archivo, configurar `credentials: false`. No hay cookies, no hay sesión y no hay `Authorization` en ninguna ruta.
10. En el mismo archivo, mantener `@fastify/rate-limit` solo si el proyecto ya lo usa y solo con un límite holgado, y documentar en un comentario que **no es una medida de seguridad**: sin autenticación, un límite por IP no distingue a nadie.
11. En el mismo archivo, configurar `@fastify/helmet` con `contentSecurityPolicy: false` —la API no sirve HTML— y con `crossOriginResourcePolicy: { policy: "cross-origin" }` para que el navegador no bloquee las respuestas JSON leídas desde otro origen.
12. En `backend/src/config/error-handler.ts`, asegurar que el manejador se registre con `setErrorHandler` **una sola vez** y que cubra los cuatro casos en este orden: `ZodError` (400), `AppError` (su código), `PrismaClientKnownRequestError` (400 en `P2003`, 500 en el resto) y `Error` genérico (500).
13. En el mismo archivo, asegurar que la respuesta de error **nunca** incluya el stack ni el mensaje interno de un `500`. Solo `request.log.error({ err: error })`.
14. En el mismo archivo, asegurar que las respuestas de éxito **no** llevan `code: null` ni `message: null`. El `IMessageResponse` solo se usa donde hay un mensaje real.
15. Registrar `setNotFoundHandler` en `backend/src/app.ts` para cerrar la superficie HTTP. Sin él, Fastify devuelve su `404` por defecto, que es HTML con una forma distinta a la de todos los demás errores.
16. En el `notFoundHandler`, responder con el mismo sobre que el `errorHandler`: `404`, `code: "NOT_FOUND"` y `message: "Route not found"`. **La respuesta de una ruta inexistente tiene que ser indistinguible en forma de la de un recurso inexistente**, porque para el frontend son el mismo problema: pidió algo que no está.
17. En el `notFoundHandler`, **no incluir la ruta en el mensaje**. Un `404` que devuelve `"Route /api/v1/sales/abc not found"` confirma la existencia del recurso a cualquiera que pruebe identificadores. El detalle va al log, no a la respuesta.
18. En el `notFoundHandler`, registrar la ruta pedida con `request.log.warn({ url: request.url })`. Un `404` en el log y no en la respuesta es la combinación correcta: diagnóstico sin fuga.
19. Verificar con `curl` que las 13 rutas responden: `GET /api/v1/dashboard/summary`, los 5 de ventas, los 4 de paquetes y los 3 de gastos. Ninguna devuelve el `404` por defecto de Fastify.
20. Verificar que `GET /api/v1/no-existe` devuelve `404` con `{"code":"NOT_FOUND","message":"Route not found"}`, en JSON y con esa forma exacta.
21. Verificar con `curl -X OPTIONS -H "Origin: http://localhost:4321" -H "Access-Control-Request-Method: PATCH" http://localhost:3000/api/v1/sales/<uuid>/status` que el `preflight` responde `204` con `Access-Control-Allow-Methods` incluyendo `PATCH`.
22. Verificar con `curl -X OPTIONS -H "Origin: https://sitio-no-autorizado.example" ...` que el `preflight` **no** incluye `Access-Control-Allow-Origin`.
23. Ejecutar `pnpm --filter shpr test` y `pnpm --filter shpr typecheck`, y confirmar que ambos terminan con código de salida `0`.

## Criterios de Done

- [x] `CORS_ORIGIN` está en `backend/.env.example` y en el esquema de `backend/src/config/env.ts`.
- [x] `grep -c "JWT_SECRET\|JWT_REFRESH" backend/.env.example` devuelve `0`.
- [x] El origen del frontend en `Access-Control-Allow-Origin` coincide exactamente con el valor de `CORS_ORIGIN`, sin comodín.
- [x] `Access-Control-Allow-Methods` incluye `PATCH`, `PUT` y `DELETE`.
- [x] Un `preflight` desde un origen no listado no recibe `Access-Control-Allow-Origin`.
- [x] Un `PATCH /api/v1/sales/:id/status` desde el navegador llega al servicio y no falla por CORS.
- [x] Las 13 rutas están registradas bajo `/api/v1` y ninguna devuelve el `404` por defecto de Fastify.
- [x] `GET /api/v1/no-existe` devuelve `404` con `{"code":"NOT_FOUND","message":"Route not found"}`, en JSON, y **sin** la ruta pedida en el cuerpo.
- [x] Un error de validación devuelve `400` con `{ code, message, details? }` y con el prefijo del campo en `message`.
- [x] Un error interno devuelve `500` con `message: "Internal server error"` y sin el mensaje original ni el stack.
- [x] `pnpm --filter shpr test` pasa el 100%.
- [x] `pnpm --filter shpr typecheck` termina con código de salida `0`.

### Evidencia — AUD-11 (`backend/07`) — última del backend

Spec sin hallazgos. Los doce criterios, con los de CORS comprobados sobre
peticiones HTTP reales y no leyendo la configuración:

| Criterio | Resultado |
| --- | --- |
| 66 | `CORS_ORIGIN=http://localhost:4321` en `.env.example` y en el esquema de `env.ts`, con ese default |
| 67 | `JWT_SECRET\|JWT_REFRESH` en `.env.example` → **0** |
| 68 | `Access-Control-Allow-Origin: http://localhost:4321` — coincide exacto, sin comodín |
| 69 | `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS` |
| 70 | preflight desde `http://evil.example` → **400**, sin `Access-Control-Allow-Origin` |
| 71 | `PATCH /sales/:id/status` desde el navegador → **200**, y la venta queda `cancelled` |
| 72 | **13** rutas bajo `/api/v1`, y el `404` es el propio, no el de Fastify |
| 73 | `GET /api/v1/no-existe` → `{"code":"NOT_FOUND","message":"Route not found"}`, sin la ruta en el cuerpo |
| 74 | `400` con `{code, message, details?}` y prefijo del campo |
| 75 | `500` con exactamente `{code:"INTERNAL_ERROR", message:"Internal server error"}` |
| 76 / 77 | suite 126/126, `tsc --noEmit` en 0 |

#### El 70 contesta mejor de lo que el criterio pedía

El criterio dice que un preflight desde un origen no listado **no** recibe
`Access-Control-Allow-Origin`. Lo que devuelve es un **`400`**, sin esa cabecera:
no solo falta el permiso, la petición se rechaza. Es más estricto que lo exigido y
es lo correcto —un `204` sin cabeceras también bloquearía al navegador, pero
devolver un `400` hace el rechazo explícito en los logs, que es donde se
diagnostica un problema de CORS.

#### El 75 usa `toEqual` y por eso no hay stack que se cuele

Las dos pruebas de error interno (líneas 95 y 101) comparan con `toEqual`, no con
`toMatchObject` ni con una aserción suelta sobre `message`. La diferencia es la
que importa: `toEqual` exige que **el cuerpo entero** sea ese objeto, así que un
`stack` o un `originalMessage` que alguien agregara mañana haría fallar la prueba.
Con `expect(res.json().message).toBe(...)` el stack se colaría sin que nadie lo
notara.

Y el stack sí se conserva, pero en el log y no en la respuesta:

```ts
request.log.error({ err: error, method: request.method, url: request.url }, "Unhandled error")
return reply.status(500).send({ code: "INTERNAL_ERROR", message: "Internal server error" })
```

Esa separación es la correcta: el que depura necesita el stack, el que usa la API
no. El comentario de la línea 53 lo dice del `P2003` desconocido y aplica igual
aquí: *"el detalle queda en el log"*.

**El backend queda auditado por completo: 82 de 82.** db/02 sigue con un criterio
abierto, que es el único criterio de todo el proyecto que queda sin marcar.
