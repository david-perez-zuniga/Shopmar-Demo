# Requisitos no funcionales

## Rendimiento

| Métrica | Objetivo | Cómo se mide |
|---------|----------|--------------|
| Latencia de un endpoint de lectura (`GET /api/v1/sales`, `GET /api/v1/packages`, `GET /api/v1/expenses`) | Menos de 200 ms en red local | Con los filtros del panel aplicados y hasta 5.000 filas de datos |
| Latencia de `GET /api/v1/dashboard/summary` | Menos de 300 ms | Con hasta 5.000 ventas y 5.000 artículos adicionales |
| Latencia de una escritura (`POST /api/v1/sales/*`, `POST /api/v1/packages`, `POST /api/v1/expenses`) | Menos de 250 ms | Con hasta 50 artículos adicionales por venta de WhatsApp |
| Payload de la API | Menos de 1 MB por respuesta de listado | Con el volumen máximo esperado en el primer año |
| Peso del bundle de JavaScript enviado al navegador | Cero framework de interfaz: solo los scripts de cada página | Inspeccionar la pestaña Network del navegador |
| Pintura inicial de una pantalla | Menos de 500 ms desde la navegación, antes de la respuesta de la API | Medición de navegación en DevTools |
| Registros mostrados por tabla | 5.000 filas sin degradación perceptible | Carga del listado de ventas con 5.000 filas |

Límites conocidos y aceptados en la versión 1:

- **Los listados devuelven el conjunto completo**, salvo `GET /api/v1/sales`, que acepta `page` y `per_page` opcionales (paginación del lado del servidor) y siempre devuelve `total`. `GET /api/v1/expenses` y el listado de paquetes siguen sin paginar: `page`, `limit`, `total` ni cursor. El volumen máximo esperado (un almacén de paca opera algunos cientos de registros al mes) no justifica más complejidad. Ver decisiones D-006 y D-011.
- **Sin caché de datos, con revalidación de transferencia.** Los `GET` responden con `ETag` y `Cache-Control: private, no-cache`: el servidor recalcula el cuerpo en cada llamada, pero si coincide con el `If-None-Match` responde `304` sin retransmitirlo (decisión D-014). No hay caché de resultados ni materialización de agregados.
- **El dashboard agrega sin caché ni materialización.** Las agregaciones se calculan en cada llamada. El patrón de acceso —`deleted_at IS NULL`, `status <> 'cancelled'` y un rango de fechas— se resuelve con índices parciales y cubrientes, no con caché: ver `modules/db/schemas/01-sale.md`.

## Seguridad

El panel exige inicio de sesión: una cookie `HttpOnly` con un token opaco y una sesión que solo termina al cerrar sesión (D-024, `modules/api/07-auth.md`). Las medidas de perímetro y de robustez siguen vigentes: la autenticación se suma encima, no las reemplaza.

| Control | Implementación | Referencia |
|---------|----------------|------------|
| Ausencia de exposición pública | El proceso escucha en `0.0.0.0` por defecto pero se despliega detrás de un firewall de host o un proxy inverso que solo permite la red local | `modules/backend/04-security.md` |
| Base de datos no expuesta | PostgreSQL escucha en `localhost` y no es alcanzable desde la red de la tienda | `modules/db/setup.md` |
| Cabeceras de seguridad | `@fastify/helmet` registrado en `src/app.ts` | `modules/backend/01-stack.md` |
| Límite de peticiones | `@fastify/rate-limit` con máximo 1000 peticiones por minuto y ventana de 1 minuto, configurado globalmente | `backend/src/app.ts` |
| Validación de entrada | Todo cuerpo, query y parámetro de ruta se valida con un esquema de Zod antes de tocar la capa de aplicación | `modules/backend/04-security.md` |
| Consultas parametrizadas | Drizzle genera SQL con parámetros vinculados sobre el driver `pg`; no hay SQL concatenado en el código | `modules/db/setup.md` |
| Compresión de respuestas | `@fastify/compress` reduce el tamaño de las respuestas | `backend/src/app.ts` |
| Superficie de ataque reducida | Sin cookies, sin sesiones, sin Refresh tokens, sin dependencias de autenticación | `tasks/backend/01-retirar-andamiaje-de-autenticacion-y-usuarios.md` |
| Errores sin fuga de información | El `500` responde `INTERNAL_ERROR` con mensaje genérico; el detalle solo va al log del servidor | `backend/src/config/error-handler.ts` |
| CORS restringido | `CORS_ORIGIN` acepta un valor o una lista separada por comas; `*` es solo para desarrollo | `modules/backend/04-security.md` |
| Códigos de autorización reservados | `UNAUTHORIZED` (401) y `FORBIDDEN` (403) permanecen implementados en `AppError` pero ningún endpoint del proyecto los emite | `backend/src/core/errors/AppError.ts` |

Lo que este proyecto **no** protege, y por qué es aceptable: el acceso no autorizado a la API desde la red privada, y la modificación de datos por alguien con acceso al host. La primera se mitiga con el firewall; la segunda es inherente a un sistema de un solo usuario sin cuentas. Si el modelo de amenaza cambia, la respuesta es agregar autenticación en el borde, no reescribir el dominio.

## Escalabilidad

- **Usuario único.** No hay contención de concurrencia por usuario ni bloqueos optimistas entre operadores.
- **Un proceso de API.** Fastify en un solo proceso. El arranque y el apagado están controlados por `src/config/graceful-shutdown.ts`, que cierra el servidor y cierra el `Pool` de `pg` con `pool.end()` ante `SIGTERM` y `SIGINT`.
- **Consultas agregadas en la base.** Los totales del dashboard se calculan con `sum()` y `count()` de Drizzle, no trayendo filas al proceso.
- **Índices para el patrón de acceso real.** Once índices con nombre `_idx`: siete en `sale`, dos en `additional_sale` y dos en `expense`. Cuatro de ellos son **parciales** (`WHERE`) y **cubrientes** (`INCLUDE`), que `drizzle-kit generate` no expresa: viven como SQL escrito a mano en `backend/drizzle/*indices_cubrientes/` y `scripts/verify-schema.sql` verifica la lista completa. `drizzle-kit push` está prohibido porque los borraría (decisión D-016).
- **Sin servicios externos.** No hay colas, ni caché compartida, ni llamadas de red salientes. Agregar integraciones es una decisión futura, no una carga actual.
- **Límite de filas de artículos adicionales.** El esquema de Zod acepta hasta 50 artículos por venta de WhatsApp en una sola petición, lo que acota el tamaño de la transacción.

## Disponibilidad

| Aspecto | Comportamiento |
|---------|----------------|
| Objetivo | El sistema se usa en horario de tienda. No hay objetivo de disponibilidad formal 24/7. |
| Fuente única de datos | Un único PostgreSQL local. No hay réplica ni conmutación. |
| Copias de seguridad | A definir por el operador fuera de la aplicación: un `pg_dump` diario del esquema `public` a un destino local. El proyecto no automatiza respaldos. |
| Recuperación ante fallo de escritura | Cada venta de WhatsApp con artículos adicionales se crea dentro de una transacción de Drizzle (`db.transaction`). Si falla un artículo, no queda ninguna venta huérfana. |
| Comportamiento ante caída de la API | El frontend muestra el mensaje de error del sobre `{ "code", "message" }` y mantiene la pantalla en su estado de error. No hay cola de reintento ni datos en caché local. |
| Integridad ante despliegue | La migración se genera con `db:generate` y se aplica con `db:migrate` (`drizzle-kit migrate`), antes de arrancar el proceso de API. |

## Mantenibilidad

| Métrica | Objetivo |
|---------|----------|
| Pruebas unitarias | Toda la capa `application/` de los cuatro módulos de negocio tiene pruebas en `_tests_/application/`. Cobertura de comportamiento de negocio, no de líneas. |
| Tipado | `strict: true` en backend, `astro/tsconfigs/strict` en frontend. Cero `any` en código de aplicación. |
| Acoplamiento | El dominio no importa el ORM ni Fastify. Los repositorios se inyectan en los servicios por parámetro. |
| Tamaño de un módulo | Un módulo por área de negocio, con el mismo esqueleto de carpetas. Agregar una pantalla o un recurso nuevo sigue el mismo patrón. |
| Trazabilidad de decisiones | Toda decisión fuerte queda en `docs/07-decisiones.md` con contexto, alternativas y consecuencias. |
| Trazabilidad de trabajo | El avance de implementación se registra marcando casillas en `specs/tasks/`. No hay segunda fuente de verdad. |
| Documentación | Toda ruta, tabla, campo, pantalla y comando de este proyecto está documentado en este árbol. Si algo no está en `specs/`, no existe. |
| Dependencias | Cinco dependencias de producción en el backend después de retirar el andamiaje de autenticación, dos en el frontend. Cero dependencias de interfaz. |
