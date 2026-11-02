# 01 — Retirar el andamiaje de autenticación y usuarios

## Estado Actual

El andamiaje de `fwinit` trae un sistema de autenticación completo que este proyecto no usa y que responde a ningún requisito. No hay más de un operador: la dueña de la tienda trabaja sola, en una red privada, y detrás del firewall del host.

Archivos que existen hoy y hay que eliminar:

```
backend/src/modules/auth/
├── domain/
│   ├── auth.entities.ts          ISessionEntity, IUserEntity, IAuthRepository, CreateUserData, UserRole...
│   ├── auth.repository.port.ts
│   ├── auth.errors.ts            InvalidCredentialsError, UserNotFoundError
│   ├── auth.schemas.ts           ILoginBody, IRefreshTokenBody
│   └── auth.types.ts             IAuthTokens, IUserWithRole, ILoginData, CreateSessionData
├── application/
│   └── auth.service.ts           login, refreshToken, register, logout, changePassword
├── infrastructure/
│   ├── prisma-auth.repository.ts
│   └── session-manager.ts        SecureSessionManager
├── presentation/
│   ├── auth.controller.ts
│   ├── auth.dto.ts               LoginDtoSchema, RefreshTokenDtoSchema, RegisterDtoSchema, ChangePasswordDtoSchema
│   ├── auth.mappers.ts
│   ├── auth.routes.ts            POST /auth/login, /auth/register, /auth/refresh, /auth/logout, /auth/change-password
│   └── auth.schemas.ts
└── _tests_/
    ├── auth.service.test.ts
    ├── auth.mappers.test.ts
    └── session-manager.test.ts

backend/src/modules/user/
├── domain/{user.entities.ts, user.repository.port.ts, user.errors.ts, user.types.ts}
├── application/user.service.ts
├── infrastructure/prisma-user.repository.ts
├── presentation/{user.controller.ts, user.dto.ts, user.mappers.ts, user.routes.ts}
└── _tests_/{user.service.test.ts, user.mappers.test.ts}

backend/prisma/schema.prisma      model user, model session, model role, model UserStatus
backend/prisma/migrations/20260910013256_init/migration.sql   las cuatro tablas y sus índices
backend/.env.example              JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN
backend/src/config/env.ts         los cuatro campos del esquema de Zod
backend/src/index.ts              la llamada a SecureSessionManager.register() al arrancar
backend/src/app.ts                el registro de authRoutes y userRoutes
backend/src/tests/fakes.ts        makeUser, makeSession, makeRole
```

## Objetivo

Dejar el backend sin ninguna forma de autenticación, sin tablas de identidad y sin las tres dependencias que solo existían para eso, con los trece endpoints de negocio accesibles sin credencial.

## Alcance

- Eliminar el directorio `backend/src/modules/auth/` completo.
- Eliminar el directorio `backend/src/modules/user/` completo.
- Eliminar las cuatro variables de entorno de JWT de `backend/.env.example` y de `backend/src/config/env.ts`.
- Eliminar `jsonwebtoken`, `bcrypt` y `@fastify/cookie` de las dependencias de `backend/package.json`.
- Quitar la importación y la llamada a `SecureSessionManager.register()` de `backend/src/index.ts`.
- Quitar el registro de `authRoutes` y `userRoutes` de `backend/src/app.ts`.
- Quitar `makeUser`, `makeSession` y `makeRole` de `backend/src/tests/fakes.ts`.
- Eliminar los cuatro modelos del esquema en `backend/prisma/schema.prisma` —esto lo hace también `tasks/db/01-migracion-al-modelo-de-dominio.md`, y el orden importa.
- Eliminar las cuatro tablas y sus índices del SQL de `backend/prisma/migrations/20260910013256_init/migration.sql`.

**Archivos tocados:** `backend/src/modules/auth/**`, `backend/src/modules/user/**`, `backend/.env.example`, `backend/src/config/env.ts`, `backend/src/index.ts`, `backend/src/app.ts`, `backend/src/tests/fakes.ts`, `backend/prisma/schema.prisma`, `backend/package.json`, el `package-lock.json` o `pnpm-lock.yaml`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| Crear las tablas del dominio | Eso es `tasks/db/01-migracion-al-modelo-de-dominio.md`. Esta tarea borra; la otra construye. |
| Implementar `UNAUTHORIZED` y `FORBIDDEN` | Ya existen en `src/core/errors/AppError.ts` como reserva del contrato. Quitar ese código sería modificar la clase de error base para simplificar algo que un día se va a necesitar, y volver a agregarlo sería el mismo trabajo. |
| Agregar autenticación "provisional" | La decisión D-001 es explícita: no hay autenticación, y agregar una provisional sería el camino más largo a la definitiva. |
| Proteger el panel con una contraseña en el servidor | Es una decisión de despliegue, no de aplicación. Va en `docs/03-ejecucion-local.md`. |
| Eliminar el módulo de productos | Es `tasks/backend/02-retirar-andamiaje-de-productos-e-inventario.md`. |
| Cambiar `CORS_ORIGIN` | No tiene relación con la autenticación. Es `tasks/backend/07-capas-vista-modales-y-filtros-globales.md`. |

## Tareas

1. Eliminar `backend/src/modules/auth/` y `backend/src/modules/user/` completos, con sus carpetas `_tests_`.
2. En `backend/src/app.ts`, quitar el `register` de `authRoutes` y de `userRoutes`, y quitar sus importaciones. El archivo queda registrando solo las rutas de negocio de `/api/v1`.
3. En `backend/src/index.ts`, quitar la importación de `SecureSessionManager` y la llamada a `register()` del arranque. El arranque queda: construir el servidor, `listen`, y manejar el apagado.
4. En `backend/src/config/env.ts`, eliminar `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET` y `JWT_REFRESH_EXPIRES_IN` del esquema de Zod. El archivo queda con las seis variables que quedan: `NODE_ENV`, `HOST`, `PORT`, `DATABASE_URL`, `CORS_ORIGIN` y `LOG_LEVEL`.
5. En `backend/.env.example`, eliminar las cuatro líneas de JWT y sus comentarios. Agregar una línea que indique que las seis variables restantes son obligatorias.
6. En `backend/package.json`, eliminar `jsonwebtoken`, `bcrypt` y `@fastify/cookie` de `dependencies`. Ejecutar `pnpm install` para actualizar el lockfile.
7. En `backend/src/tests/fakes.ts`, eliminar `makeUser`, `makeSession` y `makeRole`. Revisar que ningún archivo de prueba restante los importe.
8. En `backend/prisma/schema.prisma`, eliminar `model user`, `model session` y `model role`, y el enum `UserStatus`. Los modelos `product`, `service` e `inventory_movement` se van en la tarea 02.
9. En el SQL de `backend/prisma/migrations/20260910013256_init/migration.sql`, eliminar los `CREATE TABLE` de `user`, `session` y `role`, el `CREATE TYPE "UserStatus"`, y todos los `CREATE INDEX` y `UNIQUE INDEX` de esas tablas. **El orden de esta tarea respecto de `tasks/db/01` es: primero borra, después `db/01` reescribe el archivo completo.**
10. Verificar que no queda ninguna referencia: `grep -ri "auth\|jwt\|bcrypt\|session\|role" backend/src/` no debe devolver resultados fuera de `src/core/errors/AppError.ts`, donde `UNAUTHORIZED` y `FORBIDDEN` se quedan a propósito.
11. Ejecutar `pnpm --filter shpr build` y confirmar que compila sin las tres dependencias eliminadas.
12. Ejecutar `pnpm --filter shpr test` y confirmar que las pruebas restantes pasan.

## Criterios de Done

- [x] `backend/src/modules/auth/` no existe.
- [x] `backend/src/modules/user/` no existe.
- [x] `grep -c "jsonwebtoken\|bcrypt\|@fastify/cookie" backend/package.json` devuelve `0`.
- [x] `grep -c "JWT_" backend/.env.example backend/src/config/env.ts` devuelve `0` en ambos archivos.
- [x] `grep -c "SecureSessionManager" backend/src/server.ts` devuelve `0`. El criterio original apuntaba a `backend/src/index.ts`, **que no existe**: el entrypoint real es `src/server.ts`, según `"start": "tsx src/server.ts"`. Un grep sobre un archivo inexistente no devuelve `0`, falla, y un criterio que no se puede ejecutar no verifica nada.
- [x] `grep -c "authRoutes\|userRoutes" backend/src/app.ts` devuelve `0`.
- [x] `grep -c "model user\|model session\|model role" backend/prisma/schema.prisma` devuelve `0`.
- [x] `grep -c "makeUser\|makeSession\|makeRole" backend/src/tests/fakes.ts` devuelve `0`.
- [x] `pnpm --filter shpr build` termina con código de salida `0`.
- [x] `pnpm --filter shpr test` pasa el 100% de las pruebas que queden.
- [x] `curl http://localhost:3000/api/v1/sales` responde con la lista de ventas y **no** con `401`. Este es el criterio que demuestra que la decisión D-001 está ejecutada, y solo funciona si el backend ya está levantado con la tarea 04 completada.


### Evidencia — AUD-05 (`backend/01`)

Ocho de los once criterios se resolvieron leyendo el árbol y contando. Los tres
que sí requirieron trabajo:

#### CORR-05 — `@types/bcrypt` y `@types/jsonwebtoken` seguían en el proyecto

El criterio 97 exige `grep -c 'jsonwebtoken\|bcrypt\|@fastify/cookie' backend/package.json` → `0`.
Devolvía **2**. Las runtime se habían ido en D-001, pero los stubs de tipos
quedaron:

```json
"@types/bcrypt": "^5.0.0",
"@types/jsonwebtoken": "^9.0.0",
```

No los importa nada: `grep -rn 'bcrypt\|jsonwebtoken' backend/src --include=*.ts`
no devuelve una sola línea. Son **deps muertas**, y son las peores: no rompen nada
hoy, así que nadie las nota, pero el próximo que lea el `package.json` asume que
hay bcrypt y busca código que no existe.

Se quitaron con `pnpm remove`, que también las saca del bloque `backend` del
`pnpm-lock.yaml` (verificado: 0 coincidencias). `tsc --noEmit` en 0 y `tsup` en 0
después de quitarlas: no las necesitaba nadie.

Un detalle sobre el criterio: cuenta el `package.json`, pero si solo se mirara
ahí, el `pnpm-lock.yaml` seguiría teniendo los dos paquetes y el criterio estaría
comprobando una cosa distinta de la que dice comprobar.

#### CORR-06 — el criterio 99 apuntaba a un archivo que no existe

`grep -c "SecureSessionManager" backend/src/index.ts` no devuelve `0`:
**falla**, porque `backend/src/index.ts` no existe. El entrypoint real es
`backend/src/server.ts`, según `"start": "tsx src/server.ts"`.

Se reescribió el criterio contra el archivo real, y ahora sí es ejecutable y
devuelve `0`. Se dejó anotado en el propio criterio por qué cambió, porque un
criterio que se reescribe sin explicación es una forma silenciosa de bajar la vara.

La diferencia importa: `grep` sobre un archivo inexistente sale con código `2`, y
si alguien lo corre en un script sin `set -e` lo leería como "todo bien".

#### CORR-07 — el criterio 105 sí se pudo probar, y es el que importa

Este es el único de los once que demuestra algo en vez de contar ausencias. Con
el backend levantado:

```
$ curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/sales
200
```

Con cuerpo `{"sales": [...]}`, **13 ventas**, y cero apariciones de `401` o
`Unauthorized`. Si D-001 no estuviera ejecutada, ese endpoint pediría
credenciales y devolvería `401`, que es justo lo que este criterio existe para
detectar. Los otros diez pueden pasar con el backend apagado; este no.

Suite completa: **123/123** en 17 archivos, con las deps muertas ya fuera.
`backend/01` queda **11/11**.
