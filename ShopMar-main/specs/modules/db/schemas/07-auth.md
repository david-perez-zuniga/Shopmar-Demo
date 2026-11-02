# `user` y `session` — Acceso al panel

## Propósito

Las dos únicas tablas que no son del negocio: **quién entra** (`user`) y **por qué puerta** (`session`). Una fila de `user` es una cuenta con su rol; una fila de `session` es una puerta abierta por un login, que solo se cierra con el logout.

Ninguna tabla de negocio las referencia: `sale`, `customer`, `expense` y `sale_payment` **no tienen `user_id`**. Los datos son de la tienda, no de la persona que los cargó, y por eso no hay aislamiento por propietario ni auditoría de actor (D-024). La decisión completa está en D-024 y el contrato HTTP en `modules/api/07-auth.md`.

## Tabla `user`

| Columna | Tipo Drizzle | Tipo SQL | Nulo | Por defecto | Notas |
|---------|--------------|----------|------|-------------|-------|
| `id` | `uuid("id").primaryKey()` | `UUID` | No | — | Clave primaria. El UUID lo genera la aplicación. |
| `username` | `text("username").notNull()` | `TEXT` | No | — | Nombre de usuario. 3 a 32 caracteres, `^[a-z0-9._-]+$`, **único** y en minúsculas. |
| `email` | `text("email").notNull()` | `TEXT` | No | — | Correo **único**, guardado normalizado a minúsculas y con `CHECK` de minúsculas. |
| `password_hash` | `text("password_hash").notNull()` | `TEXT` | No | — | Hash `scrypt` autodescriptivo: `scrypt$N$r$p$sal$hash`. Nunca la contraseña. |
| `role` | `userRole("role").notNull()` | `user_role` | No | — | `seller` o `admin`. Sin default: el rol es una decisión explícita del alta, no un valor implícito. |
| `created_at` | `timestamp("created_at", { withTimezone: true, precision: 3 }).default(CURRENT_TIMESTAMP)` | `TIMESTAMP(3) WITH TIME ZONE` | No | `CURRENT_TIMESTAMP` | Auditoría. |
| `updated_at` | `timestamp("updated_at", { withTimezone: true, precision: 3 }).$onUpdate(() => new Date())` | `TIMESTAMP(3) WITH TIME ZONE` | No | — | Auditoría. Lo escribe la aplicación; no hay default en la base. |
| `deleted_at` | `timestamp("deleted_at", { withTimezone: true, precision: 3 })` | `TIMESTAMP(3) WITH TIME ZONE` | **Sí** | `NULL` | Borrado lógico (decisión D-004). Un usuario borrado no entra. |

### La contraseña nunca se guarda, ni se devuelve

`password_hash` guarda el resultado de `scrypt` de `node:crypto` con **sal por usuario**, en un formato que se describe a sí mismo: `scrypt$N$r$p$sal$hash`. El prefijo lleva los parámetros del KDF, así que subirlos más adelante no obliga a migrar las filas viejas: cada hash dice con qué se calculó. La comparación es con `timingSafeEqual`.

El hash **no sale nunca** de la base: ni el login, ni `GET /auth/me`, ni el alta de usuarios lo devuelven. La respuesta del alta (`201`) trae `id`, `username`, `email`, `role` y `created_at`, y nada más.

No hay `bcrypt` ni `argon2` en el proyecto (D-024): la alternativa era sumar un binario nativo para una mejora marginal sobre un `scrypt` que ya es *memory-hard*.

### El correo se guarda en minúsculas

El login acepta **usuario o correo**, indistintamente y sin distinguir mayúsculas. Si el correo se guardara como lo escribió cada uno, la unicidad tendría que resolverse con un índice sobre `lower(email)` y la búsqueda del login con otra comparación aparte. Guardarlo normalizado deja una sola forma canónica en la tabla: `UNIQUE` común sobre `email`, y el `identifier` del login se compara contra `username` **o** `email`.

### Restricciones e índices

| Restricción / índice | Tipo | Columnas | Por qué |
|----------------------|------|----------|---------|
| `user_username_key` | `UNIQUE` | `username` | Es el identificador con el que se entra, además del correo. Dos usuarios con el mismo nombre rompen el login. |
| `user_email_key` | `UNIQUE` | `email` | Dos cuentas con el mismo correo son la misma persona, y el login no sabría cuál abrir. |
| `user_username_lowercase` | `CHECK` (`username = lower(username)`) | `username` | El alfabeto del contrato (`^[a-z0-9._-]+$`) ya es minúsculas: una fila en mayúsculas sería un dato que la API no puede producir. |
| `user_email_lowercase` | `CHECK` (`email = lower(email)`) | `email` | Es lo que hace que el `UNIQUE` común baste. Sin el `CHECK`, `UNIQUE` dejaría entrar `Ana@tienda.com` junto a `ana@tienda.com` y el correo dejaría de ser único de verdad. |

Los dos `CHECK` son la red de la regla «el correo es único sin distinguir mayúsculas»: la normalización la hace el servicio antes de insertar, y la base se niega a guardar una fila que la salte. Un `UNIQUE` sobre `lower(email)` haría lo mismo sin `CHECK`, pero entonces la tabla podría contener dos formas de escribir el mismo correo y toda lectura tendría que normalizar a mano.

Una violación de unicidad del alta responde `409 CONFLICT` con el mensaje del campo que choca —`username: That username is already taken` o `email: That email is already registered`—; la comprobación previa del servicio es la que puede decir cuál de los dos es, y el `UNIQUE` cubre la carrera entre dos altas simultáneas.

Las reglas de formato que **no** viven en la base: el largo y el alfabeto del `username` más allá de las minúsculas, la forma del correo y el mínimo de ocho caracteres de la contraseña se validan en Zod, en el borde, para que el `400` nombre el campo. Duplicar la expresión regular en un `CHECK` obligaría a migrar la base cada vez que cambie la regla.

## Tabla `session`

| Columna | Tipo Drizzle | Tipo SQL | Nulo | Por defecto | Notas |
|---------|--------------|----------|------|-------------|-------|
| `id` | `uuid("id").primaryKey()` | `UUID` | No | — | Clave primaria. El UUID lo genera la aplicación. |
| `user_id` | `uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" })` | `UUID` → `user.id` | No | — | Dueño de la sesión. |
| `token_hash` | `text("token_hash").notNull()` | `TEXT` | No | — | `sha256` del token de la cookie, **único**. El token en claro no se guarda en ninguna parte. |
| `created_at` | `timestamp("created_at", { withTimezone: true, precision: 3 }).default(CURRENT_TIMESTAMP)` | `TIMESTAMP(3) WITH TIME ZONE` | No | `CURRENT_TIMESTAMP` | Cuándo se abrió la sesión. |
| `revoked_at` | `timestamp("revoked_at", { withTimezone: true, precision: 3 })` | `TIMESTAMP(3) WITH TIME ZONE` | **Sí** | `NULL` | Cuándo se cerró. `NULL` significa sesión viva. Lo escribe el logout. |

### Por qué no hay columna de vencimiento

**La sesión no vence, y la tabla lo dice al no tener `expires_at`.** El único acto que la invalida es el logout. La razón es de negocio y está en D-024: la dueña usa el panel desde el teléfono del mostrador y no puede volver a escribir la contraseña porque pasaron seis meses, se reinició el navegador o cambió la versión de la app.

Tres consecuencias de no tener la columna, todas deliberadas:

1. **No hay nada que un proceso tenga que mantener al día.** Un `expires_at` obliga a comparar contra el reloj en cada pedido y a decidir qué hacer con las filas vencidas —¿se borran, se ignoran, se archivan?—. Sin columna no hay vencimiento que calcular ni tarea de limpieza.
2. **No hay forma de que la regla se cuele de vuelta.** Una columna `expires_at` **`NULL`-able** —la versión «por si acaso»— deja el esquema diciendo que el vencimiento existe y que hoy no se usa; el primer pedido de «que caduque en 30 días» la vuelve a llenar sin que nadie revise la decisión. Que la columna no exista hace que el cambio sea una migración explícita y revisable, no un `UPDATE`.
3. **El costo se acepta y está escrito.** Una cookie robada **no vence**. Se mitiga con `HttpOnly` (JavaScript no la lee), con `Secure` en producción (no viaja en claro) y con `revoked_at`, que permite dejar a alguien afuera en el próximo pedido sin tocar nada más.

Si algún día el negocio pide vencimiento, el cambio es aditivo y conocido: agregar `expires_at`, comparar en el guard, y ajustar el `Max-Age` de la cookie. Está anotado acá para que se lea como una decisión, no como un olvido.

### Por qué se guarda solo el `sha256`

El token de la cookie son 32 bytes aleatorios en `base64url`. En la base se guarda **solo su `sha256`**, comparado con `timingSafeEqual`. Quien lea la tabla `session` —un volcado, una copia de respaldo, alguien con acceso a PostgreSQL— no puede reconstruir la cookie, y el `sha256` de un valor aleatorio de 32 bytes no se puede revertir por diccionario.

No es un hash de contraseña y no necesita sal: la entrada ya es aleatoria y de alta entropía, así que el ataque por tabla precalculada no aplica.

### Una sesión por login, y el logout revoca la de esa cookie

Cada login inserta una fila nueva; el logout escribe `revoked_at` en la sesión de la cookie que lo llamó, y **no** en las demás. No hay lista de sesiones ni «cerrar sesión en todos los dispositivos» en el contrato: un administrador puede revocarlas todas desde la base, y eso deja al usuario afuera en el próximo pedido.

Una sesión revocada **no se reactiva**. Volver a entrar crea otra fila; la vieja queda con su `revoked_at` como registro de cuándo se cerró.

### Restricciones e índices

| Restricción / índice | Columnas | Por qué |
|----------------------|----------|---------|
| `session_token_hash_key` (`UNIQUE`) | `token_hash` | Es la clave de búsqueda del guard: una cookie, una sesión. Dos filas con el mismo hash serían dos sesiones indistinguibles. |
| `session_user_id_idx` | `user_id` | Revocar todas las sesiones de un usuario desde la base, y sostener el borrado en cascada de la FK. |
| `session_user_id_user_id_fkey` (`Cascade`) | `user_id` → `user.id` | Una sesión no puede sobrevivir a su cuenta; se activa solo ante un borrado físico, que la aplicación no hace (D-004). |

## Enumeración `user_role`

| Valor | Puede |
|-------|-------|
| `seller` | Todo el panel de negocio: ventas, clientes, paquetes, gastos y resumen. **No** crea usuarios. |
| `admin` | Lo mismo, y además `POST /api/v1/users`. |

Dos valores y ninguno más. **No hay tabla `role`**: el rol es una columna porque el conjunto es cerrado y no tiene atributos propios; una tabla de dos filas con una sola columna útil solo agrega un `JOIN` a cada lectura del usuario de la sesión. El rol que el frontend usa para esconder lo que no corresponde sale de `GET /api/v1/auth/me`, y el servidor lo exige igual.

## Relaciones

```
user ──(1:N, Cascade)──► session
```

| Relación | Tipo | Propietario | Obligatoriedad | `onDelete` |
|----------|------|-------------|----------------|------------|
| `session` pertenece a `user` | N:1 | `session.user_id` | Obligatoria (`NOT NULL`) | `Cascade` |

**Ninguna tabla de negocio referencia a `user`.** Es la ausencia que hace que esta feature sea aditiva: no hubo que agregar una columna a `sale`, ni migrar filas existentes, ni decidir qué usuario era el dueño de las ventas ya registradas.

Como nada se borra físicamente (D-004), el `Cascade` de `session.user_id` solo se activaría ante una eliminación física de `user`, que no ocurre por la aplicación.

## Notas

### `user` se borra lógicamente; `session` se revoca

Son dos mecanismos distintos y no se mezclan. `user` sigue la regla general del proyecto (D-004): `deleted_at` lo saca de todos lados y un usuario borrado no puede entrar —el login responde `401 Invalid credentials`, el mismo mensaje que una contraseña incorrecta, para no revelar que la cuenta existió—. `session` no tiene `deleted_at`: una sesión no se borra, se cierra, y su `revoked_at` es el dato que interesa.

### Sin auditoría de actor

Ninguna tabla de negocio guarda quién la escribió. `session` dice quién está adentro del panel, no quién cambió una venta. Agregar esa trazabilidad es una decisión de producto que D-024 no toma: exigiría una columna por tabla, migrar el histórico sin actor y decidir qué hacer con él.

### Lo que `verify-schema.sql` tiene que afirmar

Con estas dos tablas, el guard de esquema pasa a exigir **siete tablas** —`additional_sale`, `customer`, `expense`, `sale`, `sale_payment`, `session` y `user`— y **ocho enums**, con el nuevo `user_role`. También entran las restricciones nuevas: los dos `UNIQUE` y los dos `CHECK` de `user`, el `UNIQUE` de `session.token_hash` y la FK `session_user_id_user_id_fkey`. Son la red contra un `drizzle-kit` que no ve los índices escritos a mano y, en el caso de los `CHECK`, contra una migración que los pierda.
