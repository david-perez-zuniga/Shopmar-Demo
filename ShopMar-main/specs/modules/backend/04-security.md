# Seguridad

## Autenticación

**El sistema tiene autenticación.** No es un JWT ni un flujo de Refresh tokens: es una cookie `HttpOnly` con un token opaco, una sesión que no vence y dos roles. El contrato completo está en `modules/api/07-auth.md` y la decisión en D-024, que supera a D-001.

| Pieza | Cómo es |
|-------|---------|
| Login | `POST /api/v1/auth/login` con `identifier` (usuario **o** correo, sin distinguir mayúsculas) y `password`. Es el único endpoint público. Rate limit propio de **10 intentos por minuto por IP**. |
| Sesión | Tabla `session` **sin `expires_at`**: solo `revoked_at`, que escribe el logout. La cookie `shpr_session` sale con `Max-Age=315360000` (diez años). |
| Cookie | Token opaco de 32 bytes en `base64url`, `HttpOnly`, `Path=/`, `SameSite=Lax` en desarrollo y `None` en producción, `Secure` solo en producción. |
| Qué se guarda | Solo el `sha256` del token, comparado con `timingSafeEqual`. Quien lea la tabla `session` no puede reconstruir la cookie. |
| Contraseña | `scrypt` de `node:crypto`, sal por usuario, hash autodescriptivo (`scrypt$N$r$p$sal$hash`), comparación con `timingSafeEqual`. Sin `bcrypt` ni `argon2`. |
| Roles | Dos, y solo dos: `seller` y `admin`, en el enum `user_role` y en `user.role`. |
| Guard | Sesión obligatoria en **todo** `/api/v1` salvo `POST /auth/login` y `POST /auth/logout` (idempotente: sin cookie responde `200` igual); `POST /api/v1/users` exige además `admin`. Sin sesión válida: `401 UNAUTHORIZED`. |
| Primer administrador | `pnpm create-admin -- --username … --email … --password …`. Ningún endpoint lo crea. |
| Sin | Registro público, recuperación de contraseña, verificación de correo, listado o edición de usuarios en el panel. |

**Qué queda fuera del guard.** `GET /health` sigue respondiendo sin credencial: es control de vida del proceso y no revela datos de negocio —solo el estado, el uptime y la hora del servidor—. El armazón estático del panel (su HTML) también se sirve sin sesión, porque es un archivo y no lleva datos: lo que no viaja sin cookie son las respuestas de la API.

`UNAUTHORIZED` (401) y `FORBIDDEN` (403) están implementados en `src/core/errors/AppError.ts` como `UnauthorizedError` y `ForbiddenError`, y sus textos genéricos existen en `src/core/errors/error-messages.ts`. **Ahora sí los lanza el proyecto**: el guard de sesión responde `401` con `message: "Authentication required"` a todo pedido sin cookie o con la sesión revocada; el login responde `401` con `"Invalid credentials"` —el mismo estado y el mismo mensaje para usuario inexistente, contraseña incorrecta y usuario borrado, para no revelar si un correo existe—; y `POST /users` responde `403` con `"Only an administrator can create users"` a un `seller`.

### La evaluación de riesgo de D-001, como contexto histórico

Lo que sigue es la evaluación que sostuvo D-001 y se conserva **como registro de lo que se decidió entonces**. El supuesto que la hacía válida —«una sola persona con acceso»— dejó de ser cierto cuando el panel pasó a tener empleados con roles. Su conclusión operativa sigue vigente y es la que importa: **los controles compensatorios siguen siendo obligatorios**, porque D-024 suma la autenticación encima de ellos y no los reemplaza.

La evaluación de riesgo de este proyecto es explícita y depende de un supuesto verificable:

| Factor | Realidad del sistema |
|--------|----------------------|
| Número de personas con acceso | Una. La dueña de la tienda. *(Hoy son varias, con dos roles: ver D-024.)* |
| Entorno de ejecución | Red local privada de la tienda, no expuesta a Internet. |
| Datos almacenados | Operaciones comerciales propias. No hay datos personales de terceros más allá del nombre del cliente que la dueña ya conoce, ni datos de tarjetas, ni datos fiscales, ni información de salud. |
| Exposición a Internet | Ninguna. El proceso de API y PostgreSQL se despliegan detrás del firewall del host o de un proxy inverso. |
| Requisito regulatorio | Ninguno que exija control de acceso a esta herramienta interna. |

**El riesgo real no es un atacante externo: es el acceso indebido desde la red local.** La respuesta a eso es el firewall, no un formulario de login. Un login sobre una red ya restringida no agrega una barrera real, porque quien alcanza la máquina alcanza también el proceso y su base de datos.

**El segundo riesgo es la destruction de datos**, y ese sí lo cubre el diseño: nada se borra físicamente (decisión D-004), así que una eliminación accidental se puede corregir desde la base de datos.

**El riesgo no cubierto** es que alguien con acceso al host modifique los datos directamente en PostgreSQL, saltándose la API. Eso es inherente a un sistema de un solo usuario sin cuentas y se acepta.

**Qué cambió con D-024.** El primer supuesto de la tabla —una sola persona con acceso— es el que se rompió: hay empleados, y ahora hay roles. Con más de un operador, el argumento «quien alcanza la máquina alcanza el proceso y su base de datos» deja de responder la pregunta real, que ya no es solo **quién llega** sino **quién hizo qué** y **quién puede dar de alta a quién**. La respuesta son el guard de sesión, el rol `admin` para el alta de usuarios y la tabla `session`, que permite revocar el acceso de una persona sin tocar la base a mano. Los otros dos riesgos no cambian: la destrucción de datos la sigue cubriendo el borrado lógico (D-004) y el acceso directo a PostgreSQL lo sigue cubriendo la configuración de despliegue, no el código.

### Controles compensatorios

Estos ocho controles son **obligatorios**, y lo siguen siendo desde D-024: la autenticación se suma **encima** de ellos, no los reemplaza. Si alguno se elimina, la decisión de fondo sobre el modelo de amenaza debe revisarse.

| # | Control | Dónde está implementado | Qué evita |
|---|---------|-------------------------|-----------|
| 1 | El proceso de API no se expone a Internet | Configuración del sistema: firewall de host o proxy inverso que solo admite tráfico de la red privada de la tienda | Acceso externo a la API |
| 2 | PostgreSQL no se expone | PostgreSQL escuchando en `localhost`; puerto 5432 no abierto en el firewall | Acceso directo a la base de datos desde la red |
| 3 | Límite global de peticiones, más uno propio en el login | `@fastify/rate-limit` con `{ max: 1000, timeWindow: "1 minute" }` en `backend/src/app.ts`, más los 10 intentos por minuto que declara `POST /auth/login` | Volcado masivo de datos por una sesión comprometida, bucle accidental del frontend y adivinanza de contraseñas |
| 4 | Cabeceras de seguridad HTTP | `@fastify/helmet` en `backend/src/app.ts` | Cabeceras faltantes que habilitan ataques de nivel superior (XSS de contenido, *clickjacking*, *sniffing* de tipo de contenido) |
| 5 | Validación estricta de entrada | Un esquema de Zod por cada cuerpo, query y parámetro de ruta | Datos malformados que rompen la lógica o inyectan contenido no sanitizado |
| 6 | Consultas parametrizadas | Drizzle sobre el driver `pg`, que genera SQL con parámetros vinculados | Inyección SQL |
| 7 | CORS restringido, con credenciales | `env.CORS_ORIGIN` en `backend/src/app.ts`: un origen o una lista separada por comas; `*` solo en desarrollo y nunca con la cookie de sesión en juego | Uso de la API desde un sitio no previsto y uso de la cookie desde un origen ajeno |
| 8 | Errores sin fuga de información | Rama final de `errorHandler` en `backend/src/config/error-handler.ts` | Exposición de trazas, nombres de tabla o mensajes internos de PostgreSQL al cliente |

Complementan el conjunto, ya presentes en el código y no específicos de esta evaluación:

- **`@fastify/compress`** reduce el volumen de datos transmitidos, lo que acota la utilidad del control 3.
- **Logging estructurado** con Pino: cada error inesperado se registra con método, ruta y excepción. Un uso anómalo de la API queda registrado aunque no esté bloqueado.

### Superficie de ataque: lo que se retiró en la versión 1 (histórico)

Retirar el andamiaje de autenticación de la versión 1 no solo eliminó código: eliminó superficie. La tabla se conserva como registro de esa retirada; abajo está lo que D-024 recupera y con qué forma.

| Se elimina | Efecto |
|------------|--------|
| `jsonwebtoken` y `@types/jsonwebtoken` | Desaparece la manipulación de tokens, la verificación de firmas y el vector de robo de token. |
| `bcrypt` y `@types/bcrypt` | Desaparece el procesamiento de contraseñas y su superficie de errores. |
| `@fastify/cookie` y su registro en `app.ts` | Desaparecen las cookies, y con ellas el robo de sesión por `document.cookie` y el *CSRF* por cookie automática. |
| Tabla `user` | Sin `password_hash`, sin `email`, sin `is_active`. |
| Tabla `session` | Sin `refresh_token` persistido. |
| Tabla `role` | Sin autorización que mantener. |
| Tablas `product`, `service`, `inventory_movement` | Se van con la decisión D-002 (sin catálogo de productos). |
| Cuatro variables de entorno JWT | Menos secretos que proteger y menos superficie de configuración. |
| `src/types/auth.d.ts` y la ampliación de `FastifyRequest` | El tipo de la petición vuelve a ser el de Fastify, sin `userId`, `userEmail` ni `userRole`. |

De las doce dependencias de producción actuales en `backend/package.json`, quedan cinco: `fastify`, `@fastify/helmet`, `@fastify/cors`, `@fastify/compress`, `@fastify/rate-limit`, más `zod`, `pino`, `dotenv`, `drizzle-orm`, `pg` y `decimal.js`. El detalle de la eliminación está en `specs/tasks/backend/01-retirar-andamiaje-de-autenticacion-y-usuarios.md`.

**Lo que volvió con D-024, y con qué forma.** La autenticación volvió, pero **no** el andamiaje de `fwinit`: se recuperan tres piezas y se descarta el resto. `@fastify/cookie` vuelve, porque la cookie `HttpOnly` es el mecanismo de sesión, y con ella vuelve el vector de *CSRF* por cookie automática, que se acota con `SameSite` y CORS en vez de con tokens anti-CSRF. `bcrypt` **no** vuelve: el hash es `scrypt` de `node:crypto`. `jsonwebtoken` **no** vuelve: el token es opaco y no se firma. Las cuatro variables `JWT_*` **no** vuelven. Las tablas `user` y `session` vuelven con otro esquema —sin tabla `role` aparte, sin `refresh_token` y sin `expires_at`—. `src/types/auth.d.ts` vuelve a ampliar `FastifyRequest` para que el guard deje el usuario de la sesión a disposición de cada ruta.

## Autorización

**Hay autorización, y es de un solo eje: el rol.** Dos valores, `seller` y `admin`, en el enum `user_role` y en la columna `user.role`. El rol viaja en `GET /api/v1/auth/me` para que el frontend esconda lo que no corresponde, pero **el servidor lo exige igual**, porque el cliente nunca es autoridad.

| Concepto | Estado |
|----------|--------|
| Roles | Dos: `seller` (todo el panel de negocio: ventas, clientes, paquetes, gastos y resumen) y `admin` (lo mismo, más `POST /api/v1/users`). |
| Permisos | Uno solo, por ahora: crear usuarios exige `admin`. El resto de los endpoints de negocio los ven los dos roles. Un `seller` recibe `403 FORBIDDEN`. |
| Guard | `preHandler` de sesión en todo `/api/v1` salvo el login y el logout; el alta de usuarios suma su verificación de rol. |
| Ámbitos por recurso | No existen. No hay multi-tenant, y no hay dato que pertenezca a un usuario: una venta no es «de» quien la registró. |
| Aislamiento por propietario | No aplica: los dos roles ven el mismo conjunto de datos. |
| Auditoría de actor | No existe. Ninguna tabla de negocio tiene `user_id` ni registro de quién hizo qué; `session` dice quién está adentro, no quién cambió una venta. |

**Por qué es una lista cerrada.** Un `seller` puede todo menos crear usuarios, y cualquier permiso nuevo es una decisión de producto, no una consecuencia de la implementación. La tabla de roles de `modules/api/07-auth.md` tiene dos filas y no admite una tercera sin cambiar ese documento.

## Validación de entrada

La validación es la última defensa de integridad del sistema, y la sesión **no la reemplaza**: el guard dice **quién** pide, no que lo pedido esté bien formado. Reglas transversales:

1. **Todo se valida, en el borde.** Cada controlador valida `body`, `query` y `params` con un esquema de Zod antes de invocar el servicio. No hay validación implícita en el servicio que sirva de primera línea; las reglas del servicio son invariantes de negocio, no validación de formato.
2. **`.strict()` en los cuerpos de escritura.** `CreateLiveSaleDtoSchema`, `CreateWhatsappSaleDtoSchema`, `UpdateSaleStatusDtoSchema`, `CreatePackageDtoSchema`, `UpdatePackageDtoSchema` y `CreateExpenseDtoSchema` declaran `.strict()`. Una clave desconocida es un `400`, no un campo ignorado en silencio. En `CreateLiveSaleDtoSchema` esto es lo que rechaza un payload con `additional_items`.
3. **Importes como cadenas.** `MONEY_PATTERN` de `src/core/money/money.ts` valida `/^\d{1,8}(\.\d{1,2})?$/`. Rechaza números JSON, notación exponencial, signo, más de dos decimales y valores fuera del rango de `DECIMAL(10,2)`. Un importe de `"1250.567"` produce `400` con el mensaje del campo, no un redondeo silencioso.
4. **Reglas condicionales con `superRefine`.** La regla de `payment_bank` —obligatorio con `credit_card`, ausente o nulo con `cash`— se aplica sobre el esquema, de modo que el mensaje del `400` nombra el campo exacto en las dos direcciones de la violación.
5. **Identificadores como UUID.** Los parámetros `:id` se validan con `z.string().uuid()`. Un identificador mal formado produce `400` y no una consulta a la base de datos.
6. **Longitudes máximas.** Los textos libres tienen cota: `name` hasta 200 caracteres, `description` hasta 500. Evita payloads de tamaño arbitrario y filas de base de datos inmanejables.
7. **Enumeraciones cerradas.** `type`, `status`, `payment_method` y `method` se validan contra el `pgEnum` correspondiente del esquema de Drizzle. Un valor desconocido produce `400`.
8. **Rangos acotados.** `additional_items` acepta como máximo 50 elementos, lo que acota el tamaño de la transacción de la venta de WhatsApp.
9. **Defense en la base de datos.** Las restricciones `NOT NULL`, las `CHECK` de `modules/db/schemas/` y las claves foráneas con `onDelete` explícito son la última línea, cuando el código ya es incorrecto.

## Secretos

| Variable | Contiene un secreto | Origen |
|----------|---------------------|--------|
| `DATABASE_URL` | Sí. Credenciales de PostgreSQL embebidas en la cadena de conexión. | `backend/.env`, nunca versionado. |
| `CORS_ORIGIN` | No. Lista de orígenes permitidos. | `backend/.env`. |
| `NODE_ENV`, `PORT`, `HOST` | No. | `backend/.env`. |

Variables que **dejan de existir** al retirar el andamiaje de autenticación: `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`. Deben desaparecer de `.env.example` y del esquema de `src/config/env.ts`.

**D-024 no agrega ningún secreto de configuración.** No hay `JWT_SECRET` ni clave de firma de cookie: el token se genera con `randomBytes(32)` y del lado del servidor solo se guarda su `sha256`, así que no hay con qué firmar y no hay una clave que rotar o filtrar. La sal del hash de contraseña viaja dentro del propio hash autodescriptivo, no en una variable de entorno.

Reglas de gestión:

- `.env` está en `.gitignore` y nunca se versiona. Solo `.env.example` se versiona, y contiene **nombres de variables con valores de ejemplo, nunca secretos reales**.
- `backend/.env.example` trae `DATABASE_URL=postgresql://usuario:password@localhost:5432/example_project?schema=public`. Es un placeholder, no una credencial.
- La contraseña de PostgreSQL en producción es distinta de la de desarrollo y no aparece en ningún archivo del repositorio.
- `dotenv` carga `.env` al importar `src/config/env.ts`. Si falta `DATABASE_URL`, el proceso imprime los errores de validación con `parsed.error.flatten().fieldErrors` y termina con `process.exit(1)`. Es deliberado: es preferible que el proceso no arranque a que arranque con una configuración incompleta.
- El proyecto **no tiene secretos de terceros**, porque no tiene integraciones externas. No hay claves de API, ni tokens de servicio, ni credenciales de nube.

## Rate limiting

`@fastify/rate-limit` está registrado globalmente en `backend/src/app.ts` con la configuración real del repositorio:

```ts
app.register(rateLimit, { max: 1000, timeWindow: "1 minute" })
```

| Aspecto | Valor |
|---------|-------|
| Alcance | Global, todas las rutas y todos los verbos. |
| Máximo | 1000 peticiones por ventana. |
| Ventana | 1 minuto, conDisney reinicio automático. |
| Clave de conteo | IP de origen (comportamiento por defecto del plugin). |
| Respuesta al exceder | `429` con el sobre `{ "code", "message" }`, porque el `setErrorHandler` también intercepta los errores del plugin. |
| Cabecera | El plugin expone la cabecera estándar con las peticiones restantes. |

**Por qué 1000 por minuto es suficiente y no una limitación.** El uso real es una persona humana con un panel de siete pantallas. La navegación más intensa posible —abrir el listado de ventas y disparar cuatro impresiones de factura— está muy por debajo de 1000 peticiones por minuto: el tráfico real es de unas decenas de peticiones por sesión de trabajo. El límite está puesto para poner un techo a un bucle defectuoso en el JavaScript del frontend o a un volcado automatizado, no para regular el uso legítimo; el margen de mil por minuto es amplio a propósito.

**Por qué el límite general es global y no por ruta.** Configurar un límite distinto por endpoint agregaría configuración sin agregar protección: los endpoints de lectura ya están acotados por el tamaño de página opcional de `GET /sales` (decisión D-011), por el conjunto completo del resto de los listados y por el volumen de datos, y los de escritura se llaman a mano. Un único límite general es más simple de operar y de explicar.

**La excepción: el login.** `POST /api/v1/auth/login` declara su propio límite de **10 intentos por minuto por IP** (el límite por ruta del plugin, encima del global). Es la única ruta del proyecto donde repetir un pedido es intentar adivinar una contraseña, y 1000 por minuto es justo lo que un ataque necesita. Al superarlo responde `429` con el sobre de error de siempre. **No hay bloqueo de cuenta**: el límite por IP y el costo de `scrypt` son la única defensa, y el login no revela si un correo existe.

**Consideración conocida.** El conteo por IP con el proxy inverso requiere que este reenvíe la IP real del cliente en la cabecera correspondiente; si no lo hace, todas las peticiones cuentan como una sola y el límite de 1000 por minuto sería insuficiente para el uso legítimo. Esta verificación pertenece a la configuración de despliegue, no al código.

## CORS

Configuración real en `backend/src/app.ts`:

```ts
app.register(cors, {
  origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
  credentials: true,
})
```

| Valor de `CORS_ORIGIN` | Comportamiento |
|-----------------------|----------------|
| `*` | Se traduce a `origin: true`, que refleja cualquier origen. **Solo para desarrollo, y nunca con la cookie de sesión en juego:** con `credentials: true`, reflejar cualquier origen equivale a entregarle la cookie a cualquiera. |
| `http://localhost:4321` | Solo el servidor de desarrollo de Astro puede llamar a la API. |
| `http://localhost:4321,http://192.168.1.50` | Varios orígenes explícitos, separados por coma. |
| `https://panel.tienda.local` | El origen de producción. |

Cuatro observaciones:

1. **`*` es un valor de desarrollo.** En despliegue, `CORS_ORIGIN` debe contener el origen exacto desde el que se sirve el panel. Con `credentials: true` no hay zona gris: un comodín es inválido para el navegador y, si el plugin lo reflejara, sería el peor de los mundos.
2. **`credentials: true` es ahora obligatorio, no inocuo.** La cookie de sesión viaja con `credentials: "include"`, así que el servidor tiene que responder `Access-Control-Allow-Credentials: true` y el navegador descarta la respuesta si falta. Por eso el comodín deja de ser una opción en despliegue: con credenciales, `*` no es válido y abriría la API a cualquier origen.
3. **CORS no es un control de seguridad de la API.** Un cliente que no es navegador (por ejemplo, un script de consola) ignora la política CORS por completo. CORS protege al navegador de que un sitio no previsto use **su** sesión, y ahora sí hay una sesión que proteger: es una de las dos barreras contra el uso de la cookie desde un origen ajeno, junto con `SameSite`. La protección real contra el resto sigue siendo el firewall del control 1 y el guard de sesión.
4. **CSRF: lo que hay y lo que falta.** La cookie viaja sola en cada pedido al dominio de la API, así que un sitio ajeno podría intentar disparar escrituras. La defensa es `SameSite=Lax` en desarrollo y `SameSite=None` en producción —donde el panel y la API pueden estar en hosts distintos—, más la lista cerrada de `CORS_ORIGIN`. **No hay token anti-CSRF**, y queda anotado como el punto a revisar si algún día el panel y la API dejan de compartir sitio con `SameSite=Lax`.
