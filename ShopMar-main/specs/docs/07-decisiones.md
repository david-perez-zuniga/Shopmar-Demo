# Registro de decisiones

Cada entrada tiene cuatro apartados: **Contexto** (el problema), **Decisión** (lo que se eligió), **Alternativas** (lo que se descartó) y **Consecuencias** (lo que se acepta a cambio).

---

## D-001 — El sistema no tiene autenticación

**Estado** — **Superada por D-024.** Se conserva el registro completo de lo que se decidió entonces y por qué: el contexto de abajo describía bien un sistema operado por una sola persona, y D-024 explica qué cambió. Lo que sigue no es la regla vigente; la regla vigente es D-024.

**Contexto**

`shpr` lo opera una sola persona, la dueña de una tienda de paca, en un entorno privado y controlado. No hay empleados usando el sistema, ni condiciones de acceso compartido, ni necesidad de separar responsabilidades. El andamiaje generado por `fwinit` trae un módulo de autenticación completo (login, Refresh tokens, cookies, contraseñas con `bcrypt`, tabla `user`, tabla `session`, tabla `role`) que no responde a ningún requisito real y que obliga a mantener un flujo de sesión, un token que renovar y una contraseña que proteger.

**Decisión**

El sistema **no implementa autenticación**. No hay login, no hay tabla de usuarios, no hay roles, no hay permisos, no hay JWT, no hay cookies de sesión, no hay Refresh tokens, no hay hash de contraseñas. Los veintiún endpoints de negocio bajo `/api/v1` (dashboard, ventas, clientes y gastos) son accesibles sin credencial alguna. `UNAUTHORIZED` (401) y `FORBIDDEN` (403) permanecen implementados en `src/core/errors/AppError.ts` como reserva del contrato de error, pero ningún endpoint del proyecto los emite.

La seguridad se apoya en controles compensatorios, todos obligatorios para que esta decisión sea válida:

1. **El proceso de API no se expone a Internet.** Corre en la red local de la tienda, detrás del firewall del host o de un proxy inverso que solo admite tráfico de la red privada.
2. **PostgreSQL no se expone.** Escucha en `localhost` y no es alcanzable desde la red de la tienda.
3. **Límite de peticiones global.** `@fastify/rate-limit` con máximo 1000 peticiones por minuto por ventana de 1 minuto, registrado en `backend/src/app.ts`.
4. **Cabeceras de seguridad.** `@fastify/helmet` registrado en el mismo archivo.
5. **Validación estricta de entrada.** Todo cuerpo, query y parámetro de ruta se valida con Zod antes de llegar a la lógica de negocio, y toda consulta pasa por Drizzle, que genera SQL parametrizado con el driver `pg`.
6. **CORS restringido en producción.** `CORS_ORIGIN` acepta un origen o una lista separada por comas. El valor `*` es solo para desarrollo.
7. **Compresión de respuestas.** `@fastify/compress` reduce el volumen de datos transmitidos.
8. **Errores sin fuga de información.** El `500` responde `INTERNAL_ERROR` con mensaje genérico; el detalle real solo se escribe en el log del servidor.

**Alternativas**

- *Autenticación completa con usuarios y roles.* Es el valor por defecto de cualquier plantilla de Fastify y cubre el caso de múltiples operadores, pero aquí no hay nadie más que autenticar. El costo es real: cuatro variables de entorno, tres dependencias (`jsonwebtoken`, `bcrypt`, `@fastify/cookie`), dos tablas, un flujo de refresh, una pantalla de login y un riesgo permanente de contraseñas olvidadas.
- *Autenticación básica con un secreto compartido.* Un único token en una variable de entorno, comparado con `timingSafeEqual`. Es más barata que el esquema con usuarios, pero aporta una barrera simbólica: quien ya tiene acceso al host o a la red local puede leer la variable de entorno. Falsa sensación de seguridad.
- *Sin API, todo en el servidor de archivos.* Descartada de entrada: obligaría a sacrificar la lógica de negocio en el servidor y pondría la base de datos expuesta al navegador.
- *Autenticación diferida, preparada para el futuro.* Rejectada porque el dominio no necesita ningún concepto de identidad: no hay campo `user_id` en ninguna tabla, ni de autenticación ni de auditoría. Añadirla después implica tocar el esquema, no solo las rutas.

**Consecuencias**

- Cualquiera que alcance la API dentro de la red puede leer y modificar todos los datos. Esto es aceptado y explícito.
- No hay trazabilidad de "quién hizo qué". No hay auditoría. No hay campo de usuario en ninguna tabla.
- No hay recuperación de contraseña, ni cambio de contraseña, ni cierre de sesión, porque no hay sesión.
- Si el modelo de amenaza cambia (acceso desde Internet, más de un operador, o datos que no puedan quedar en la red local), esta decisión se revierte **en el borde**: se agrega autenticación en la capa de presentación, sin tocar dominio, aplicación ni base de datos. La arquitectura por capas del proyecto existe precisamente para que ese cambio sea aditivo.
- `tasks/backend/01-retirar-andamiaje-de-autenticacion-y-usuarios.md` es la tarea que ejecuta esta decisión.

---

## D-002 — No hay catálogo de productos: la mercadería es texto libre

**Estado** — Aceptada. Vigente para toda la versión 1.

**Contexto**

Un sistema de gestión de tienda suele traer un catálogo de productos con código de barras, precio de lista, costo, stock y umbral de stock bajo. El andamiaje actual de `fwinit` trae exactamente eso: tabla `product` con `barcode`, `price`, `cost`, `stock`, `low_stock_threshold`, más `inventory_movement` para el movimiento de stock.

Pero en una tienda de paca el modelo de mercadería es opuesto al de un comercio con surtido estable. Cada prenda es única, se compra usada a un precio distinto y se vende a un precio distinto, y en general no hay código de barras. La dueña ya sabe qué está vendiendo en el momento de la venta. Un catálogo obligaría a dar de alta cada prenda antes de venderla, y para una prenda única eso es trabajo sin retorno.

**Decisión**

**No existe catálogo de productos.** No hay tabla de productos, ni de servicios, ni de movimientos de inventario, ni códigos de barras, ni control de stock, ni precios de lista. La mercadería se registra como texto libre:

- `sale.product_name` (`TEXT NOT NULL`) — nombre del artículo principal, escrito como lo diga la dueña.
- `additional_sale.name` (`TEXT NOT NULL`) — nombre de cada artículo adicional.
- `additional_sale.description` (`TEXT NULL`) — detalle opcional, por ejemplo "talla 30, azul".

**Alternativas**

- *Catálogo de productos reutilizables (como el andamiaje actual).* Sirve para un comercio con mercadería repetible. Para prendas únicas obliga a un alta por prenda, duplica la escritura del nombre y agrega un flujo de mantenimiento de stock que nadie va a usar. Descartada.
- *Catálogo de categorías o tipos de prenda.* Un enum con "abrigo", "pantalón", "zapato" no aporta nada: la dueña ya escribe el nombre y no consulta ese campo para decidir nada. Descartada por complejidad sin valor.
- *Autocompletado de nombres sobre una tabla de nombres usados.* Aportaría poco frente a escribir un nombre corto, y agrega una tabla y un endpoint. Descartada para v1; es la candidata más razonable si el volumen de ventas lo justificara.

**Consecuencias**

- El sistema no puede responder "¿en cuánto se vendió esta prenda la vez anterior?" sin buscar por texto. Se acepta: para una prenda única esa pregunta casi no tiene respuesta útil.
- El texto libre no se valida contra un catálogo, así que puede haber variantes ortográficas de la misma prenda. Aceptado.
- El andamiaje de productos, servicios e inventario se elimina por completo. Ver `tasks/backend/01-retirar-andamiaje-de-autenticacion-y-usuarios.md` y `tasks/db/01-migracion-al-modelo-de-dominio.md`.
- Eliminar ese andamiaje reduce el esquema de siete tablas a cuatro.

---

## D-003 — El dinero es `DECIMAL(10,2)`, viaja como cadena y el total de la venta nunca se almacena

**Estado** — Aceptada. Vigente para toda la versión 1.

**Contexto**

Un total mal calculado en una tienda no es un error de informe: es dinero que se pierde o que se cobra de más. El error clásico de los importes monetarios es usar punto flotante. `0.1 + 0.2` vale `0.30000000000000004` en IEEE 754. Con grandes volúmenes de sumas, ese residuo se acumula y los totales dejan de cuadrar. Además, cuando el total de una venta depende de una suma de artículos adicionales, almacenarlo denormalizado crea una segunda fuente de verdad que puede quedar desactualizada.

**Decisión**

Tres reglas que se aplican juntas:

1. **Tipo de almacenamiento.** Todo importe es `DECIMAL(10,2)` en PostgreSQL, declarado en Drizzle como `numeric(..., { precision: 10, scale: 2 })`. Aplica a `sale.cost`, `additional_sale.total` y `expense.total`.
2. **Serialización como cadena.** En JSON todo importe viaja como **cadena decimal**, por ejemplo `"1250.50"`. Nunca como número JSON. El frontend recibe la cadena tal cual.
3. **Sin punto flotante en ninguna capa.** El backend convierte con `Decimal.toFixed(2)` a través de `toMoneyString()` en `src/core/money/money.ts`; las sumas del dashboard usan `new Decimal(a).plus(b)` de `decimal.js`. El frontend formatea con expresiones regulares sobre la cadena, sin `parseFloat` ni `Number`. Está prohibido `Number(decimal)` en los mappers.

Y una cuarta regla, la que cierra el problema de la desincronización:

4. **El total de la venta es derivado, no almacenado.** La tabla `sale` **no tiene columna `total`**. El total se calcula en la capa de aplicación como `sale.cost + SUM(additional_sale.total)` y se devuelve en las respuestas de listado y detalle. No existe forma de que el total guardado y el total real discrepen, porque no hay total guardado.

Los DTO de Zod validan los importes de entrada con el patrón `/^\d{1,8}(\.\d{1,2})?$/`, que acepta hasta `99999999.99` y rechaza notación exponencial, signo y más de dos decimales.

**Alternativas**

- *`FLOAT` o `REAL`.* Más simple, pero impreciso. Rechazado.
- *Almacenar el total en `sale.total` y recalcularlo al escribir.* Un solo `UPDATE` extra, pero introduce la posibilidad de que el total guardado no coincida con la suma de sus filas, y obliga a una estrategia de recálculo. Rechazado: no hay un beneficio real que lo justifique.
- *Números enteros en centavos.* Evita el punto flotante sin depender de DECIMAL, pero obliga a convertir en el borde de cada capa y hace ilegibles las consultas SQL. Rechazado: `DECIMAL` ya resuelve el problema de forma nativa.
- *Devolver números JSON y que el cliente formatee.* Es el comportamiento por defecto de `JSON.stringify` sobre un `number`, y es exactamente el error que esta decisión evita. Rechazado.

**Consecuencias**

- El total de venta no se puede filtrar ni ordenar en SQL. Solo se puede ordenar por `sale_date` y por `created_at`. Aceptado: el listado se ordena por fecha, que es el orden que la dueña necesita.
- Las respuestas de la API son menos comodas de tipar en el cliente que con números. El costo se paga una sola vez, en `src/lib/format.ts` del frontend.
- Los tests de los mappers deben verificar que la salida es una cadena exacta (`"1250.50"`), no un número.

---

## D-004 — Borrado lógico en todas las tablas

**Estado** — Aceptada. Vigente para toda la versión 1.

**Contexto**

En una planilla, corregir un error de tipeo significa borrar la fila, y con ella se pierde el rastro de que esa operación existió. En el sistema hay operaciones que no se pueden deshacer de verdad: una venta cobrada y luego anulada, un paquete entregado, un gasto registrado por error. Y hay agregaciones —los indicadores del dashboard— que deben poder excluir lo anulado sin perder el dato.

**Decisión**

Ninguna tabla se elimina físicamente. Las cuatro tablas (`sale`, `additional_sale`, `package`, `expense`) tienen la columna `deleted_at TIMESTAMP(3) WITH TIME ZONE NULL`. Un `DELETE` HTTP escribe la fecha actual en esa columna y nada más. Toda consulta de lectura —listados, lectura por id, agregaciones del dashboard, relaciones incluidas— filtra `deleted_at: null`.

**Alternativas**

- *Eliminación física con `DELETE` o cascada.* Más simple de escribir. Pero destruye el histórico y hace irreversible cualquier error. Rechazado.
- *Columna booleana `active` como en el andamiaje actual (`product.active`, `service.is_active`).* Es funcionalmente equivalente, pero se cuela en las respuestas de la API como un campo que el dueño no entiende y que el frontend no usa. Una sola columna de fecha es más simple y más informativa: además de saber si está borrado, se sabe cuándo. Rechazado.
- *Papelera de reciclaje con restauración.* Requiere una pantalla y un endpoint de restauración. El sistema no tiene un actor que necesite restaurar nada. Rechazado para v1.

**Consecuencias**

- Las tablas crecen de forma indefinida. El volumen real es pequeño (algunos cientos de registros al mes) y el costo es despreciable.
- Los índices incluyen `deleted_at` en las cuatro tablas, porque toda consulta lo filtra.
- No hay ninguna forma de que un cliente del API descubra un registro borrado lógicamente, salvo por una consulta manual a la base de datos. Es intencional.
- El borrado lógico solo existe donde hay un endpoint que lo dispara. La versión 1 expone `DELETE` para paquetes y gastos, y **no** para ventas: no hay `DELETE /api/v1/sales/:id`. Por eso el borrado lógico de `sale` y de `additional_sale` no ocurre por la API, y no hay propagación que implementar. Una venta se retira de la vista operativa con `PATCH /api/v1/sales/:id/status` a `cancelled`, que es un cambio de estado, no un borrado. Ver `modules/db/use-cases/03-actualizar-estado-venta.md` y `modules/db/schemas/02-additional_sale.md`.

---

## D-005 — El frontend es una compilación estática que consume la API en tiempo de ejecución

**Estado** — Aceptada. Vigente para toda la versión 1. **Enmendada por D-017 a D-020** en la letra que negaba el enrutado y el estado del cliente, y **enmendada por D-023** en el enrutado: el panel es una SPA de un documento, así que el router de cliente ya no es el `<ClientRouter />` de `astro:transitions` sino el propio (`lib/app/`), no hay armazón que persistir entre navegaciones (D-019 quedó reemplazada) y las lecturas se siguen sirviendo de una caché de datos en memoria de la pestaña (D-020). El núcleo —compilación estática, sin servidor de render, sin framework de interfaz y sin store— sigue vigente.

**Contexto**

La base de datos vive en el equipo donde opera la tienda, en la red local. El frontend necesita ver datos siempre actualizados: si una venta se registra en otro dispositivo, el dashboard tiene que reflejarlo. Un sitio estático generado en build time congelaría los datos en el momento de la compilación. La alternativa obvia es Astro en modo SSR, con un servidor Node en el mismo host que la API, lo que agrega un proceso más que mantener.

**Decisión**

El build de Astro es estático (`astro build` genera `dist/`). **No hay servidor de render.** Cada pantalla pide sus datos a la API desde el navegador cuando se abre, a través de un wrapper delgado en `frontend/src/lib/api.ts` que lee `import.meta.env.PUBLIC_API_URL`. El comportamiento de cliente es JavaScript nativo en bloques `<script type="module">` dentro de cada archivo `.astro`. Cero frameworks de interfaz, cero enrutador de cliente, cero biblioteca de estado.

El precio de esta decisión es que el contenido no está en el HTML inicial: cada pantalla muestra un estado de carga y recién después los datos. En un panel interno de un solo usuario, ese costo es aceptable y se paga con un estado de carga bien diseñado.

**Alternativas**

- *Astro en SSR con adaptador Node.* Evita el estado de carga y permite renderizar en el servidor. Agrega un proceso, una variable de entorno más, y hace que el frontend dependa de la red para cada navegación. El beneficio es marginal para un panel de siete pantallas. Rechazado.
- *Sitio estático con datos congelados en build.* Descartado de entrada: los datos quedarían desactualizados.
- *SPA con React o Vue.* Descartado: contradice el objetivo de cero dependencias de interfaz, agrega un bundle y un modelo de estado que el proyecto no necesita. Una lista de siete pantallas con formularios no justifica un framework.

**Consecuencias**

- El frontend y el backend se despliegan y se versionan por separado. `PUBLIC_API_URL` debe existir en el entorno donde se compila el frontend, porque Astro la incorporate al bundle en tiempo de build.
- El navegador es el que sostiene las reglas de negocio de presentación. El backend sigue siendo la única autoridad: la validación de Zod y las invariantes se aplican siempre del lado del servidor, y el frontend solo las anticipa para dar retroalimentación inmediata.
- Cada pantalla implementa su propio estado de carga, vacío y error. No hay un componente compartido de "estado de red" en esta versión.

---

## D-006 — Los endpoints de listado no paginan en la versión 1

**Estado** — Aceptada. **Amendada por D-011**: `GET /api/v1/sales` acepta `page` y `per_page` opcionales. La regla de esta decisión sigue vigente para `/api/v1/expenses` y para el listado de paquetes.

**Contexto**

`GET /api/v1/sales`, `GET /api/v1/packages` y `GET /api/v1/expenses` podrían devolver miles de filas. La convención habitual es devolver una página con `page`, `limit` y `total`, o un cursor. Pero el volumen real de una tienda de paca es de algunos cientos de registros al mes, y la dueña necesita ver la lista completa para escolher un paquete o una venta al que enlazarse. La paginación obligaría a agregar controles de navegación, un estado de página en el cliente y una lógica de "cargar más" en JavaScript nativo, sin resolver un problema que hoy no existe.

**Decisión**

Los tres endpoints de listado devuelven el conjunto completo filtrado, envuelto en un objeto con la clave del recurso: `{ "sales": [...] }`, `{ "packages": [...] }`, `{ "expenses": [...] }`. **No aceptan ni devuelven `page`, `limit`, `total` ni cursor.** El orden es siempre determinista: `sale_date` descendente para ventas y gastos, `package_date` descendente para paquetes, con `id` como segundo criterio para desempatar.

**Alternativas**

- *Paginación por número de página.* Es lo que hace el andamiaje actual del proyecto (`ProductQuerySchema` con `page` por defecto 1 y `limit` por defecto 50). Es un patrón conocido y probado, pero agrega un parámetro de recorrido que la dueña no necesita: casi siempre quiere la lista entera.
- *Paginación por cursor.* Más eficiente con volúmenes grandes y estable ante inserciones, pero más compleja de implementar y de consumir desde JavaScript nativo.
- *Devolver la lista cruda como arreglo JSON.* Más simple, pero rompe la convención de envoltura que usan los demás endpoints y deja sin lugar para agregar metadatos más adelante.

**Consecuencias**

- El tamaño de la respuesta crece de forma lineal con el histórico. Con la meta de 5.000 registros y un payload menor a 1 MB, es aceptable; el límite exacto está en `05-requisitos-no-funcionales.md`.
- La corrección de pagos (y un día la historia) no se puede agregar en v1: agregarla es un cambio de contrato en `modules/api/`.
- Cuando el volumen lo exija, la migración no rompe: se agregan parámetros opcionales con valores por defecto que reproducen el comportamiento actual, y el frontend los usa sin reescribirse. **Ese camino se recorrió para el listado de ventas en D-011.**

---

## D-007 — Un paquete no tiene estado; "pendiente" significa "registrado y no borrado"

**Estado** — Aceptada con reserva. Vigente para toda la versión 1.

**Contexto**

El dashboard muestra el indicador "paquetes pendientes". Para que ese número signifique algo, hace falta saber si un paquete fue entregado o sigue sin despacharse. La intención de negocio es clara: el dueña quiere saber cuántos envíos tiene en la calle. El modelo de datos, en cambio, no tiene ningún campo que lo diga: `package` tiene `name`, `package_date`, `method` y un enlace opcional a la venta.

**Decisión**

En la versión 1, `package` **no tiene columna de estado**. El indicador `pending_packages_count` del dashboard se define como el conteo de paquetes **no borrados lógicamente** cuyo `package_date` cae dentro del rango de fechas solicitado. La definición completa de "pendiente" en esta versión es: *está registrado y no ha sido eliminado del sistema*.

**Alternativas**

- *Agregar `package.status` con valores `pending` y `delivered`.* Es la solución de dominio correcta y la que se implementaría en v2. Se descarta en v1 por dos razones: agrega un endpoint (o un campo más en el `PUT /api/v1/packages/:id`) y una columna que nadie va a cambiar durante los primeros meses, y obliga a definir con precisión si la fecha de entrega se guarda o se infiere. Preferimos que el número exista desde el primer día aunque sea aproximado, a que no exista hasta que haya volumen.
- *Agregar solo `delivered_at TIMESTAMP NULL` y contar los que lo tienen en nulo.* Más simple que un enum, y permite saber la fecha de entrega. Misma objeción de alcance que la anterior.
- *Contar paquetes con `sale_id` nulo como "pendientes".* Incorrecto: `sale_id` es un enlace opcional que la dueña puede no registrar nunca.

**Consecuencias**

- El número de paquetes pendientes **sobrestima** los envíos en la calle, porque incluye los ya entregados que no se han borrado lógicamente. El frontend etiqueta la tarjeta como "Paquetes pendientes" y el texto de apoyo de la tarjeta aclara "registrados y no eliminados".
- El borrado lógico de un paquete entregado (`DELETE /api/v1/packages/:id`) es la forma actual de sacarlo del conteo. Es un comportamiento coherente con D-004.
- La reserva queda anotada: cuando la dueña empiece a preguntar por paquetes entregados sin borrar, esta decisión se revierte agregando `package.status` en `tasks/db/02-indices-y-restricciones.md`. El impacto en el API es aditivo: un campo más en el recurso `package` y un filtro más en el listado.

---

## D-008 — Las agregaciones del dashboard excluyen los registros borrados lógicamente y las ventas canceladas

**Estado** — Aceptada con reserva. **Revertida el 2026-10-04** en su parte del filtro por estado; vigente para toda la versión 1 en todo lo demás.

**Contexto**

Los ingresos del dashboard se calculan sumando los totales de las ventas del rango. Un total de venta es `sale.cost + SUM(additional_sale.total)`. Si una venta está `cancelled`, sumar su total como ingreso sobrestima la facturación real. La regla explícita del proyecto es que las agregaciones excluyen registros borrados lógicos; no hay regla equivalente sobre el estado.

**Decisión original (2026-09, revertida)**

Las agregaciones del dashboard aplicaban **una sola exclusión**: `deleted_at: null`. Concretamente:

- `total_revenue` sumaba el `cost` y los `total` de los artículos adicionales de las ventas **no borradas lógicamente** dentro del rango, sin importar su `status`. Es decir, una venta `cancelled` o `pending` **sí** sumaba ingresos.
- `sales_count` contaba las ventas **no borradas lógicamente** dentro del rango, sin importar su `status`.

Se aceptaba con una reserva explícita: *"cuando se adopte la semántica por estado, la condición se agrega al `where` del repositorio de `dashboard` y esa limitación deja de importar"*.

**Decisión vigente (2026-10-04)**

La reserva se exercise. Las agregaciones del dashboard aplican **dos exclusiones**: `deleted_at: null` y `status <> 'cancelled'`.

- `total_revenue` suma el `cost` y los `total` de los artículos adicionales de las ventas **no borradas lógicamente y no canceladas** dentro del rango. Una venta `cancelled` **no suma ingresos**, tampoco sus artículos adicionales.
- `sales_count` cuenta las ventas **no borradas lógicamente y no canceladas** dentro del rango.
- `total_expenses` y `pending_packages_count` no cambian: no son ventas.

**Por qué se revierte**

Pedido explícito de la dueña: *"si se canceló es porque no se cobró"* y *"si se marca como anulada, no se meta en el total"*. El sistema ya afirmaba lo contrario en otra parte: salir de `completed` borra el cobro, o sea que `amount_paid` queda en `null` y el sistema declara que esa venta no se cobró. Con la regla anterior, una venta que el propio sistema declara no cobrada igual sumaba como ingreso. Los dos caminos de cálculo —el `where` del repositorio de `dashboard` y `salesKpi()` en el frontend— quedaban además con la misma contradicción.

**Por qué `cancelled` sale de las DOS cifras y no solo del importe**

Excluirlo del importe y dejarlo en el conteo daría un panel que dice "ingresos de 5 ventas" con dos que no se cobraron. El número y el conteo que lo acompaña tienen que salir de la misma definición de "venta que cuenta".

**Por qué `pending` NO se excluye**

Una venta pendiente puede cobrarse hoy, y excluirla dejaría fuera de la caja plata que ya está adentro de la mercadería. Queda anotado como el primer ajuste a considerar si algún día la dueña pregunta por caja cobrada en vez de caja registrada. Nota: `cancelled` y `pending` se excluyen por razones distintas y esa asimetría es deliberada.

**Alternativas consideradas al revertir**

- *Excluir solo `cancelled` del importe y dejarlo en `sales_count`.* Rechazada: el conteo acompaña al importe y quedaría mintiendo.
- *Excluir también las ventas `pending`, contando solo las `completed`.* Rechazada: una venta cobrada pero no marcada como completada dejaría de contar como ingreso, que es el error que describía la objeción original.
- *Persistir los agregados en una tabla de snapshots diarios.* Rechazada por D-003 en su versión simple: menos fuentes, menos desincronización.
- *Sacar la venta del listado con un borrado lógico al cancelarla.* Rechazada: `cancelled` es un estado de negocio, no una ausencia. El registro tiene que seguir visible, con su fecha y su cliente, para que el libro de ventas cuadre con lo que pasó.

**Consecuencias**

- El mapa de los cuatro indicadores del dashboard, y el texto de apoyo de cada tarjeta en `modules/frontend/04-screens.md`, deja explícito qué incluye cada número. La dueña nunca ve un número sin contexto.
- `PATCH /api/v1/sales/:id/status` a `cancelled` saca la venta de los números y además la vuelve definitiva: desde `cancelled` no hay ninguna transición, ni siquiera volver al mismo estado. Ver `sale_status` en `modules/db/enums/02-sale_status.md`.
- El cambio es una condición en el `where` del repositorio de `dashboard` y una condición en el bucle de `salesKpi()`. No requiere modificar el esquema ni el contrato HTTP.
- Los dos caminos de cálculo tienen que aplicar el mismo filtro. Si uno se actualiza y el otro no, el Resumen y el Listado muestran ingresos distintos para el mismo período. Es el modo de falla más probable de esta decisión y por eso hay un caso de integración en cada lado.

---

## D-009 — La factura imprimible es un estado de impresión de `/sales`, no una ruta propia

**Estado** — Aceptada. Vigente para toda la versión 1. **Enmendada por D-017**: el detalle de venta dejó de ser una ruta por venta y ahora es una ruta de cliente única, `/sales/detail?id=<uuid>`, donde vive la factura. El núcleo —no hay `/sales/invoice`, la factura es un estado de impresión del detalle y la impresión automática es `?print=1`— sigue en pie.

**Contexto**

Cada venta necesita una factura que la dueña pueda imprimir y entregar al cliente. Hay dos formas de resolverlo en un sitio estático: una ruta dedicada que recibe el identificador de la venta y la imprime, o un bloque imprimible dentro de la pantalla de ventas. Una ruta dedicada con parámetros dinámicos es incompatible con un build estático, porque Astro tendría que generar una página por cada venta existente en el momento de compilar.

**Decisión**

No hay una ruta `/sales/invoice`. La factura es un **estado de impresión de la pantalla `/sales`**. El flujo es:

1. La tabla de `/sales` muestra una acción "Imprimir Factura" por fila.
2. Al activarla, el `<script>` de la página pide `GET /api/v1/sales/:id` al backend para obtener los datos completos de esa venta, incluidos sus artículos adicionales.
3. La página renderiza el documento de factura dentro de un contenedor oculto en pantalla.
4. Se invoca `window.print()`.
5. Las reglas `@media print` de la misma página ocultan el sidebar, la barra de filtros, la tabla y la factura de las demás ventas, y muestran solo ese documento en blanco y negro sobre blanco.

La factura usa los mismos tokens que el resto de la interfaz en pantalla, y un bloque de reglas de impresión que fuerza fondo blanco, texto negro y bordes de 0.5 pt para que la impresión no gaste tinta de más.

**Alternativas**

- *Ruta `/sales/invoice?id=<uuid>` que lee el query en el navegador.* Funciona con build estático porque el identificador llega en la URL en tiempo de ejecución, y tiene la ventaja de poder recargarse o guardarse en marcadores. Se descartó para v1 porque obliga a duplicar la lógica de renderizado de la venta, a gestionar estados de carga y error propios, y a resolver el caso "imprimir desde un enlace directo" que la dueña no necesita. La decisión se revierte sin esfuerzo si aparece la necesidad de compartir un enlace de factura.
- *Generar un PDF desde el backend.* Agrega una dependencia de generación de documentos y un endpoint que descarga un archivo. Sobredimensionado para una factura de una tienda pequeña.
- *Imprimir la fila de la tabla directamente.* La fila no tiene los artículos adicionales ni el desglose; no cumple como factura.

**Consecuencias**

- La factura comparte todo el estilo de la pantalla, así que no puede quedar visualmente desalineada con el panel.
- Imprimir requiere que el backend esté disponible en ese momento (necesita el detalle de la venta). Si no lo está, la acción muestra el mensaje de error del sobre de error y no imprime nada.
- No hay enlace permanente a una factura concreta. Aceptado.

---

## D-010 — La verificación end-to-end es un proceso externo al paquete frontend: el workspace `qa/` con Playwright

**Estado** — Aceptada. Vigente para toda la versión 1.

**Contexto**

Las pruebas unitarias del backend (`modules/backend/05-testing.md`) cubren las reglas de negocio y las del frontend (`modules/frontend/06-testing.md`) cubren la lógica de presentación, pero ninguna recorre la aplicación como la usaría la dueña: navegador real, red real, base de datos real. La decisión D-005 y la sección "Por qué no hay Playwright" de `modules/frontend/06-testing.md` razonan bien **contra Playwright dentro del paquete frontend**, y esa postura se mantiene: `frontend/package.json` y `backend/package.json` no agregan ninguna dependencia.

Pero sí existe la necesidad de verificar los flujos completos —venta live, venta por WhatsApp con artículos, completar/cancelar, paquete, gasto, resumen— sin depender de la paciencia manual de la dueña ni de los dedos del desarrollador. El proyecto incorpora el skill `Skill_Playwright.md` (raíz del repositorio), que define un proceso QA autónomo: descubrir funcionalidad, extraer reglas de negocio, generar casos de prueba masivos, ejecutar con Playwright, capturar evidencias y clasificar defectos.

**Decisión**

Existe un workspace `qa/` en el monorepo de pnpm, separado de `frontend/` y `backend/`, que declara `@playwright/test` como única dependencia de desarrollo. El proceso QA corre contra local (`http://localhost:3000` backend, `http://localhost:4321` frontend), nunca contra producción, y su salida estructurada vive en `qa-results/` en la raíz del repositorio.

El QA **descubre, genera casos, ejecuta, evidencia y clasifica defectos** (`BUG-XXX` en `qa-results/defects/`). **No corrige defectos ni modifica código**: su entregable es el diagnóstico completo para que un proceso posterior corrija, y los hallazgos que contradicen el árbol de specs se anotan como evidencia al pie de los criterios de `tasks/`, sin alterar el contenido de los criterios.

Reglas que gobiernan el proceso:

- Las siete familias de casos son obligatorias: positivos, negativos, límite, extremos, absurdos, seguridad y usuario real. Nunca *happy-path-only*.
- Screenshots, videos, Trace Viewer, consola y red quedan **siempre** habilitados en escenarios fallidos.
- Si el entorno no responde (backend o frontend caídos), la ejecución **se detiene** y se reporta la causa: el QA no genera falsos negativos por entorno roto.
- Los artefactos de diagnóstico (`defects/`, `analytics/`, `report-summary.md`) quedan versionados en el repositorio como evidencia.

**Alternativas**

- *Playwright instalado dentro de `frontend/`.* Rechazada: rompe el presupuesto de dependencias de la decisión D-005 y la razón 6 de `modules/frontend/06-testing.md`. El módulo QA de este árbol responde que el panel no lleva navegador ni servidor de pruebas: el QA vive aparte.
- *Verificación manual de los flujos.* Rechazada: no es repetible, no deja evidencias estructurales y depende de la memoria de quién pruebe. El sistema ya registra ventas y gastos reales; un error de regresión en el resumen no se detecta "de memoria".
- *Cypress u otra suite de navegador.* El skill adopta Playwright para la generación de pruebas y su motor; la decisión no versa sobre la marca sino sobre **dónde** vive el proceso (fuera del paquete) y **qué** produce (evidencia estructurada, no correcciones).
- *Hacerlo CI/CD.* Rechazada hoy: el proyecto no tiene automatismos de despliegue (ver `documentacion-cliente.md`) y el QA corre en local contra `localhost`. La decisión se revisa si algún día hay CI.

**Consecuencias**

- `frontend/package.json` y `backend/package.json` siguen sin dependencias nuevas; la única versión de Playwright del monorepo está en `qa/package.json`.
- `qa-results/` crece con cada campaña: `defects/`, `evidence/`, `playwright/` y `analytics/`. Defender su estructura es tarea de `tasks/qa/01`.
- La sección "Por qué no hay Playwright" de `modules/frontend/06-testing.md` queda vigente **dentro de su alcance** —el paquete frontend— y este módulo la complementa fuera de ese alcance. Ambas lecturas conviven sin contradecirse.
- Corregir lo que el QA encuentre es trabajo posterior, rastreable por el ID `BUG-XXX`, y queda fuera del alcance del proceso QA.

---

## D-011 — La paginación del listado de ventas es opcional y del lado del servidor

**Estado** — Aceptada. Vigente desde la versión 1.

**Contexto**

D-006 fijó que los listados devuelven el conjunto completo y dejó escrito el camino de migración: parámetros opcionales que reproducen el comportamiento actual. Con 5.000 ventas sembradas, `GET /api/v1/sales` devolvía 1,6 MB y tardaba ~460 ms por request, y la pantalla de paquetes descargaba y parseaba todas las filas para mostrar 10 en pantalla. El navegador esperaba el `JSON.parse` de más de un megabyte en el hilo principal antes de pintar la tabla y, además, volvía a pedir todo el listado en cada cambio de página.

**Decisión**

`GET /api/v1/sales` acepta `page` y `per_page` **opcionales**, que viajan juntos:

- **Sin `page` ni `per_page`, la respuesta es la de siempre**: el conjunto completo filtrado. La pantalla de ventas (que calcula sus KPIs sobre la lista) y la generación de páginas de detalle en el build siguen funcionando sin cambios.
- **Con ambos, la respuesta trae la página pedida** y el `total` del conjunto filtrado, sin paginar.
- La respuesta **siempre** incluye `total`, incluso sin paginar, para que el cliente no tenga que contar las filas.
- Mandar uno sin el otro, o un `per_page` fuera de `1..100`, produce `400` con el prefijo del campo.
- La paginación se resuelve en el servidor con `skip`/`take` y un `count`, no en memoria.

**Alternativas**

- *Paginar siempre y romper el contrato.* Obligaría a reescribir la pantalla de ventas (sus KPIs), la pantalla de paquetes y la generación estática de páginas de detalle, que enumera todas las ventas en el build. Rechazada: el costo no se justifica.
- *Cursor en lugar de número de página.* Más eficiente con volúmenes grandes, pero la pantalla ya navega por número de página en la URL y el histórico de una paca no tiene inserciones concurrentes que justifiquen la estabilidad del cursor.
- *Paginación sólo en el cliente, con "cargar más".* No resuelve nada: el problema es el tamaño de la respuesta, no el render.

**Consecuencias**

- El payload de la pantalla de paquetes baja de 1,6 MB a unos pocos KB y el tiempo de respuesta de ~460 ms a ~15 ms con 5.000 ventas.
- `total` es un campo nuevo en la respuesta de `GET /api/v1/sales`. Es aditivo: los clientes que lo ignoran siguen funcionando.
- La pantalla de ventas y el listado de gastos conservan el comportamiento de D-006; migrarlos exige mover sus KPIs al servidor.
- El paginador de la pantalla de paquetes ahora refleja el total del servidor, no la cantidad de filas descargadas.

---

## D-012 — La pantalla de paquetes pide las filas y los KPIs en una sola llamada

**Estado** — Aceptada. Vigente desde la versión 1.

**Contexto**

La pantalla de paquetes necesita tres cosas del mismo rango: la página de ventas, el total del conjunto y el conteo por método de envío (el agregado que la decisión D-008 define para los KPIs del dashboard). Antes los pedía en dos llamadas —`GET /sales` y `GET /dashboard/packages/kpis`— que recorrían la tabla `sale` dos veces sin necesidad, y el navegador tenía que esperar a que ambas terminaran para pintar.

**Decisión**

`GET /api/v1/sales` acepta `include_kpis=true`. Cuando viene, la respuesta suma la clave `kpis` con el conteo **del rango de fechas completo** (no de la página) por `shipment_method`, con la misma forma y la misma regla que `GET /api/v1/dashboard/packages/kpis`: excluye las canceladas y las borradas (D-008) e ignora los filtros de estado, canal y método de envío, que sí aplican a la lista.

- La pantalla de paquetes usa una sola llamada: `GET /sales?page=…&per_page=…&include_kpis=true`.
- La bandera es **opt-in**: sin ella, la respuesta es exactamente la de D-011 y no se ejecuta el agrupado.
- El agrupado se calcula en el módulo de ventas (`countByShipmentMethod`), que ya es dueño de la tabla `sale`. La regla de D-008 se replica en el `where` del agregado: una cancelada cuenta para la lista pero nunca para los KPIs.
- El endpoint `GET /api/v1/dashboard/packages/kpis` sigue existiendo: es el que usa la pantalla para refrescar sólo los KPIs después de cambiar el método de envío de una fila, cuando no hay una lista nueva que traer. Ambos coinciden número a número sobre el mismo rango.

**Alternativas**

- *Un endpoint nuevo `/dashboard/packages` que arme lista + KPIs.* Duplicaría la paginación y el contrato del listado de ventas en otro módulo para responder a una pantalla. Rechazada.
- *Dejar las dos llamadas y confiar en el paralelismo del navegador.* Es lo que había: dos recorridos de la misma tabla y dos `Promise` a sincronizar. La primera sigue siendo compatible, pero pedir los tres datos en un viaje es estrictamente mejor y el costo es una clave opcional.
- *Hacer que los KPIs sigan también el filtro por método de envío.* Cambiaría lo que muestran las tarjetas al filtrar (las otras tres quedarían en cero) y las apartaría del número del dashboard. Rechazada: la pantalla ya mostraba el desglose del rango, no del filtro.
- *Calcular los KPIs en el cliente sumando las filas.* Volvería a necesitar la lista completa, que es justo lo que D-011 dejó de traer. Rechazada.

**Consecuencias**

- La pantalla de paquetes pasa de dos llamadas a una por carga, y el total y los KPIs siguen siendo del rango completo.
- `kpis` es una clave **opcional** en la respuesta de `GET /api/v1/sales`: sólo aparece con `include_kpis=true`, así que no cambia el contrato de quien no la pide. La lista y los KPIs tienen reglas distintas (una incluye canceladas, el otro no) y eso queda escrito en el contrato.
- El módulo de ventas gana `countByShipmentMethod`, un `groupBy` sobre su propia tabla. El dashboard conserva su propia lectura del mismo agregado para D-008; son dos vistas del mismo dato y así queda escrito.

---

## D-013 — Paginar sin recargar el documento

**Estado** — Aceptada. Vigente desde la versión 1.

**Contexto**

La pantalla de paquetes pagina en el servidor (D-011): cada salto de página pide otra página a `GET /sales`. Los controles —el paginador, el selector de tamaño y el botón de filtrar— nacieron sobre una lista que se traía entera en el cliente, y para pedir otra página hacían `window.location.assign`. Desde que la paginación es del servidor, ese `assign` deja de ser gratis: el sitio usa `<ClientRouter />` (Astro), que intercepta los clics en `<a>` pero **no** una navegación programática, así que cada salto reconstruía el documento entero —HTML, scripts y estilos— y recién después pedía las filas.

**Decisión**

La navegación de la lista —página, tamaño y filtros— se hace en la misma página con la History API:

- `history.pushState` registra la URL del estado nuevo.
- Los controles se rehidratan desde `window.location.search` y la lista se vuelve a pedir con `load()`.
- `popstate` (botón atrás/adelante) repite esa misma pasada, sin recargar.
- Cada carga lleva un número; sólo la última puede pintar. Con la recarga de documento eso no hacía falta —el navegador cancelaba la anterior—, pero en la misma página dos pedidos pueden solaparse y una respuesta vieja no debe pisar la tabla actual.

**Alternativas**

- *Dejar `window.location.assign`.* Es lo que había: funcional, pero reconstruye toda la pantalla para cambiar diez filas. Rechazada.
- *Convertir el paginador en enlaces `<a>` para que `ClientRouter` los intercepte.* Sería una navegación suave, pero Astro vuelve a buscar el HTML de la página y a correr toda la hidratación. Pedir sólo el JSON de la lista es más barato y más directo. Rechazada.
- *Guardar el estado de la lista en memoria y no tocar la URL.* Perdería el enlace compartible y el botón atrás. Rechazada.

**Consecuencias**

- Cambiar de página, de tamaño o de filtro cuesta una petición JSON, no un documento.
- La URL sigue reflejando el estado (se puede compartir y recargar) y el historial del navegador se comporta como se espera.
- La lista puede recibir respuestas fuera de orden; el número de carga lo cubre.

---

## D-014 — Los GET revalidan en vez de retransmitir

**Estado** — Aceptada. Vigente desde la versión 1.

**Contexto**

La lista completa de ventas ronda 1,5 MB y no cambia entre dos consultas seguidas. La pantalla de ventas la pide entera (D-006), y el navegador la vuelve a descargar cada vez aunque nada haya cambiado. El frontend ya tiene la plomería para mostrar datos guardados —el service worker marca las respuestas con `X-ShopMar-Cached-At` y la pantalla avisa cuando está sin conexión—, pero la API no ofrecía ninguna forma de revalidar barato.

**Decisión**

Todo `GET` que responde `2xx` lleva `ETag` (débil, calculado sobre el cuerpo serializado) y `Cache-Control: private, no-cache`. Si la petición trae `If-None-Match` y coincide, la respuesta es `304` sin cuerpo. Las escrituras y los errores no llevan cabeceras de caché.

- El `ETag` se calcula sobre el cuerpo ya serializado, así que no hace falta consultar una versión aparte ni guardar estado en el servidor: si el cuerpo cambia, el `ETag` cambia.
- `no-cache` obliga a revalidar antes de reusar la respuesta guardada; `private` excluye a las cachés compartidas.
- La revalidación es **débil**: ignora el prefijo `W/` y las comillas, admite `*` y listas.

**Alternativas**

- *`@fastify/etag`.* Haría lo mismo con una dependencia más; el cálculo son unas quince líneas y la comparación otras tantas, y así el comportamiento queda en `config/http-cache.ts` con sus pruebas. Descartada por tamaño.
- *ETag derivado de un sello de versión (`max(updated_at)`).* Permitiría saltar la consulta en un `304`, pero ataría el `ETag` a una consulta extra y a que toda escritura toque `updated_at`. El `ETag` del cuerpo es siempre correcto sin estado. Descartada.
- *`Cache-Control: no-store`.* Es lo que había de facto: nada se guarda y todo se retransmite. Rechazada.
- *`max-age` con una ventana de frescura.* Serviría datos viejos sin revalidar, que es justo lo que los requisitos no funcionales descartan para los datos de una tienda. Rechazada.

**Consecuencias**

- Un `GET` repetido sin cambios responde `304` con 0 bytes: la lista completa pasa de 1.509.909 bytes a 0.
- El servidor **sigue calculando el cuerpo** para poder compararlo; el ahorro es de transferencia, no de CPU. Queda escrito en `specs/docs/05-requisitos-no-funcionales.md` que esto no es una caché de datos.
- Como el cuerpo puede cambiar dentro del mismo segundo, ninguna ventana de frescura sustituye a la revalidación: el `304` sólo sale cuando el cuerpo es idéntico.

---

## D-015 — Las lecturas con renglones cargan la relación con un JOIN

**Estado** — Aceptada. Vigente desde la versión 1.

**Contexto**

La lista y el detalle de ventas traen, además de la venta, sus renglones de `additional_sale`. Cargarlos con una segunda consulta (`sale_id IN (…)`) obliga a un parámetro por cada venta: en la lista completa, esa segunda consulta lleva cinco mil parámetros y es la que más crece con el tamaño del conjunto.

**Decisión**

Las dos lecturas que tocan la relación resuelven la venta y sus renglones con un **`LEFT JOIN` explícito** de Drizzle sobre `additional_sale`:

- `findAll` (la lista) y `findById` (el detalle) seleccionan ambas tablas en una sola sentencia.
- El filtro `deleted_at IS NULL` de los renglones vive en la **condición del JOIN**, no en el `WHERE`: si estuviera en el `WHERE`, una venta sin renglones activos desaparecería del listado.
- Las agregaciones y los conteos no tocan relaciones.

El JOIN explícito reemplaza la estrategia `relationLoadStrategy: "join"` que usaba Prisma antes del cambio de ORM (decisión D-016).

Medido con 5.000 ventas y 4.821 renglones: la lista completa pasa de 154 ms a 126 ms (mejor caso) y de 163 ms a 137 ms (mediana); el detalle, de 1,3 ms a 1,1 ms.

**Alternativas**

- *Cargar los renglones con una segunda consulta (`sale_id IN (…)`).* Es el default histórico: dos idas a la base y una lista `IN` que crece con el conjunto. Rechazada.
- *Cargar los renglones en una segunda consulta hecha a mano y unirlos en memoria.* Agrega código de mapeo sin ganar nada sobre el JOIN. Rechazada.

**Consecuencias**

- Una sola sentencia por lectura, con una fila por renglón. El repositorio agrupa por `id` de venta preservando el orden de la consulta, porque las filas de una venta son contiguas.
- El JOIN multiplica las filas de la base por la cantidad de renglones de cada venta. Con 0,96 renglones por venta la inflación es de 1,5× y el JOIN gana igual; si una venta pudiera tener cientos de renglones, la segunda consulta volvería a ser mejor. Queda anotado como el límite de la decisión.
- La decisión sobrevive al cambio de ORM: el mecanismo es ahora un `leftJoin` de Drizzle y no una opción de Prisma, pero el criterio —una sola sentencia y el filtro de borrado en el JOIN— es el mismo.

---

## D-016 — El ORM es Drizzle y las migraciones las genera drizzle-kit

**Estado** — Aceptada. Vigente desde la versión 1.

**Contexto**

El backend nació sobre Prisma: el esquema vivía en `backend/prisma/schema.prisma`, las migraciones en `backend/prisma/migrations/` y el cliente generado por `prisma generate` era un paso del build. Prisma 6 no puede modelar los índices cubrientes —`include` no existe en su DSL— y los cuatro índices más caros del proyecto son exactamente cubrientes: `sale_active_date_idx`, `sale_list_idx`, `additional_sale_active_idx` y `expense_active_idx`. Tampoco modelaba los ocho `CHECK`, que ya vivían escritos a mano en las migraciones. Con 200.000 ventas, el `SUM(cost)` de 30 días pasó de 33,6 ms a 0,95 ms gracias a esos índices: no son cosméticos.

**Decisión**

El ORM del backend es **Drizzle**, con `drizzle-orm` en runtime y `drizzle-kit` para las migraciones. En concreto:

- El esquema vive en `backend/src/db/schema/`, un archivo por dominio (`sales.ts`, `expenses.ts`) reexportado desde `index.ts`, con los enums nativos de PostgreSQL declarados con `pgEnum`.
- Las migraciones viven en `backend/drizzle/` y se generan con `drizzle-kit generate` y se aplican con `drizzle-kit migrate`; el script `db:migrate` del paquete `shpr` es exactamente `drizzle-kit migrate`.
- Los cuatro índices cubrientes y el índice por método de envío viven como **SQL escrito a mano** en `backend/drizzle/*indices_cubrientes/`, porque `drizzle-orm@1.0.0-rc.4` no puede expresar `INCLUDE`.
- **`drizzle-kit push` está prohibido.** Push diffea contra la base viva, no ve en el schema los índices escritos a mano y los borraría sin avisar. El camino es siempre `generate` + `migrate`, y el guard que lo detecta es `backend/scripts/verify-schema.sql`.
- El dinero sigue siendo `string` de punta a punta (D-003 vigente): las columnas `numeric(10,2)` vuelven como cadena desde el driver `pg` y la aritmética exacta usa `decimal.js` directamente, sin `Number()` en ninguna capa.
- La base se **regeneró desde cero**: se creó vacía, se aplicaron las migraciones de Drizzle y después el seed. Una base nueva no tiene `_prisma_migrations`.

**Alternativas**

- *Seguir con Prisma y mantener los índices cubrientes como SQL a mano dentro de sus migraciones.* Es lo que había. Funciona, pero obliga a mantener dos fuentes de verdad (el schema y las migraciones a mano), un paso de `generate` en el build y una dependencia que no puede expresar el esquema completo. Rechazada.
- *Migrar a Drizzle y dejar `drizzle-kit push` como herramienta de desarrollo.* Es el flujo habitual de Drizzle: iterar el schema y empujarlo. Acá borraría los cuatro cubrientes en la primera corrida y ningún test lo detecta. Rechazada.
- *Mapear el dinero a `number`, como hace el proyecto de referencia.* Más cómodo de tipar, pero viola D-003 y reintroduce el punto flotante justo en la capa que más importa. Rechazada.
- *Usar `text()` para los enums, como el proyecto de referencia.* Cambiaría la base (de enums nativos a texto) y con ella los tipos y los `CHECK`. Rechazada: el refactor es de ORM, no de esquema.

**Consecuencias**

- `@prisma/client` y `prisma` salen de `backend/package.json`; el build deja de generar un cliente (`build` es `tsup` a secas) y el código ya no conoce `Prisma.Decimal` ni los errores con forma de Prisma.
- Los nombres de tablas, columnas, enums, índices y restricciones no cambiaron: los repositorios, los mappers, `verify-schema.sql` y los specs siguen hablando del mismo vocabulario.
- El aviso de consulta lenta se reimplementó sobre el pool de `pg`. Drizzle llama a `logQuery(query, params)` **antes** de ejecutar y no entrega la duración, así que la medición envuelve `client.query`; el aviso sigue llevando `ms` y SQL y el mensaje sigue siendo `slow query`.
- El guard `backend/scripts/verify-schema.sql` deja de exceptuar `_prisma_migrations` y vuelve a exigir la lista exacta de tablas: `additional_sale`, `expense` y `sale`.
- Una migración futura del esquema se escribe en `backend/src/db/schema/` y sale como `db:generate` + `db:migrate`; editar a mano una migración ya aplicada deja de ser el camino normal.

---

## D-017 — El detalle de venta es una ruta estática con el identificador en la query

**Estado** — Aceptada. Vigente desde la versión 1. Enmienda D-005 en su letra sobre el detalle por venta. **Enmendada por D-023** en su punto sobre el service worker: con el armazón como copia canónica, la navegación ya no busca por variante ni necesita `ignoreSearch` (ver `modules/frontend/08-pwa.md`). El resto de la decisión —una sola página estática, el `id` en la query, el build que no lee la API— sigue en pie.

**Contexto**

`src/pages/sales/[id].astro` usa `getStaticPaths()`: el build baja todas las ventas con `GET /api/v1/sales/with-details` y emite una carpeta HTML por venta. Medido sobre el `dist/` actual: 5000 carpetas dentro de `dist/sales/`, 5008 HTML totales, 99 MB, y 50 pedidos HTTP contra la API en cada compilación.

El problema no es el peso, es la frescura: **una venta registrada después del último build no tiene página de detalle**, así que el enlace "Ver detalle" del listado —que sí muestra la venta, porque los datos son frescos— apunta a una ruta que no existe. El límite estaba documentado en `modules/frontend/08-pwa.md` y en `tasks/frontend/13-pwa-offline.md`, donde la estrategia de navegación del service worker tenía que evitar guardar un 404 justamente por esto; las dos referencias se corrigieron al ejecutar esta decisión, así que sus números de línea ya no apuntan al texto original. A eso se suma que `[id].astro` es el **único** consumidor de la API en build de todo el frontend: con la API caída, `getStaticPaths` devuelve un arreglo vacío y el sitio se publica sin ninguna página de detalle.

La ruta estática que reemplaza a esa expansión no puede reproducir `/sales/<id>` por sí sola: un `dist/` de archivos no tiene forma de resolver un segmento arbitrario sin que el servidor intervenga. Se evaluaron tres formas de servir el shell del detalle.

**Decisión**

El detalle de venta es **una sola página estática**, `src/pages/sales/detail.astro`, y el identificador viaja en la query: `/sales/detail?id=<uuid>`. La página renderiza el armazón y el `InvoicePrint` vacío, y un script de cliente pide `GET /api/v1/sales/:id`, llena los ganchos `data-invoice-*` y resuelve los tres estados (cargando, venta inexistente, error). La impresión automática sigue siendo `?print=1`, ahora leída de `window.location.search`.

Tres consecuencias son parte de la decisión, no efectos secundarios:

- **`/sales/<id>` deja de existir.** Cualquier enlace guardado en marcadores es un 404, así que se agrega `src/pages/404.astro`: una pantalla mínima dentro del armazón que explica que la venta se mudó y devuelve a Ventas.
- **El service worker tiene que ignorar la query al buscar en la caché de navegación** (`cache.match(request, { ignoreSearch: true })`). Conviene decir con precisión qué compra, porque la justificación obvia es falsa: **no** evita que la caché guarde una copia por variante —`refreshNavigation` y el camino de red escriben la URL exacta, así que el almacenamiento sigue creciendo igual que antes, y tras visitar dos ids hay tres entradas de `/sales/detail`—. Lo que compra es que una navegación **sin copia exacta** se resuelva con el shell precacheado en vez de caer en `/offline`. Es seguro porque el HTML se prerenderiza sin query string y la query la lee siempre el script del cliente; está escrito en las cuatro pantallas de listado y en `src/lib/lists/filter-controls.ts:4`.
- **El build deja de leer la API.** `PNPM build` funciona con el backend apagado. `PUBLIC_API_URL` sigue siendo obligatoria para compilar, porque D-005 la incrusta en el bundle.

**Alternativas**

- *Conservar `/sales/<id>` con un respaldo del host* (`try_files $uri /sales/detail.html` en nginx, `_redirects` en Netlify o Cloudflare Pages). Conserva la URL que la dueña ya usa. Rechazada: hace que la aplicación dependa de una configuración de servidor que hoy no existe en el repositorio, y que no está versionada. Si el host cambia, la ruta se rompe en silencio.
- *Servir el shell desde `/404.html` y decidir por `pathname`.* Un solo artefacto para varias convenciones de host (nginx con `error_page`, GitHub Pages, Netlify, Cloudflare). Rechazada por una razón medible: el service worker solo guarda respuestas con `response.ok` (`public/sw.js`), así que un detalle servido con estado 404 **nunca se cachearía** y el detalle offline, que es uno de los objetivos de `13-pwa-offline.md`, dejaría de funcionar. Además el canal de 404 deja de ser un canal de error.
- *Seguir con `getStaticPaths()` y reconstruir en cada alta.* Rechazada por el mismo motivo que hoy lo obliga a existir como límite documentado: exige que el build corra después de cada venta, y el build necesita la API.

**Consecuencias**

- `dist/` pasa de 99 MB y 5008 HTML a menos de 2 MB y alrededor de 20 HTML; el build deja de tardar minutos y de hacer decenas de pedidos a la API.
- El detalle nunca envejece: se pide al abrirse. Desaparece de la lista de "lo que el build necesita para compilar".
- El número de factura que se imprime sigue siendo los ocho primeros caracteres del `id` (`components/README.md`), que ya no coincide con la URL. No rompe nada: la factura nunca imprimió la URL, y es el único identificador que la dueña usa en papel.
- La pantalla de detalle gana tres estados que antes no existían: carga, venta inexistente y error con reintento. Los pintadores ya existen en `src/lib/lists/`.
- La tarea que ejecuta esta decisión es `tasks/frontend/14-aplicacion-cliente-navegacion-y-detalle.md`, unidad 4.

---

## D-018 — El prefetch del armazón es `viewport`, y no hay `prefetchAll`

**Estado** — Aceptada. Vigente desde la versión 1. **Sin efecto sobre la navegación desde D-023**: con la SPA, navegar entre vistas no pide documento, así que el prefetch dejó de estar en el camino de la navegación. La configuración y los atributos siguen como están y su efecto observable es el que fija `TC-NAV-001`.

**Contexto**

`astro.config.mjs` declaraba `prefetch.defaultStrategy: 'tap'` y los tres juegos de enlaces del armazón (barra lateral, cajón móvil y barra inferior) repetían `data-astro-prefetch="tap"`. `tap` engancha `touchstart` y `mousedown` (`node_modules/astro/dist/prefetch/index.js:22-34`): el pedido del HTML sale en el mismo instante en que la persona ya está apretando el botón, así que mide casi lo mismo que no precargar. El armazón son cuatro rutas fijas, todas visibles al cargar, y `prefetchAll` no estaba activado: ningún enlace fuera del armazón precargaba.

**Decisión**

`prefetch.defaultStrategy` es `'viewport'` y `prefetchAll` queda apagado. Los tres juegos de enlaces del armazón llevan `data-astro-prefetch` **sin valor**, para adoptar la estrategia por defecto del config en vez de repetirla en cada uno.

El caso `TC-NAV-001` (`qa/tests/cases/navegacion.md`, `qa/tests/navegacion-prefetch.spec.ts`) fija el comportamiento: al abrir `/` sin ningún clic, el documento de `/sales`, `/packages` y `/expenses` se pide dentro de los cinco segundos. Falla con `tap` y pasa con `viewport`; las dos corridas están verificadas.

**Alternativas**

- *Seguir con `tap`.* Es lo más conservador en ancho de banda, pero llega tarde: cuando el pedido sale, la persona ya eligió. Rechazada.
- *`hover`.* Precarga al pasar el mouse o al enfocar, con unos cientos de milisegundos de ventaja. Rechazada por quedar a mitad de camino: con las cuatro rutas ya en pantalla, el viewport da la misma ventaja sin depender de que el puntero pase por encima. Se puede reevaluar si el armazón crece a muchas rutas.
- *`prefetchAll: true`.* Precargaría todo enlace visible de la aplicación, y cada fila de los listados tiene un enlace de detalle distinto: serían decenas de variantes del mismo shell que nadie va a mirar. Rechazada.
- *Precargar además los datos de la próxima pantalla.* Fuera de alcance: exige saber qué va a pedir la pantalla siguiente, y sin números que lo justifiquen es adivinar.

**Consecuencias**

- El costo de prefetchear es el documento del armazón y **nunca datos**: el prefetch de Astro pide el HTML y no llama a la API.
- La estrategia vive en un solo lugar (el config) y los enlaces del armazón no la repiten. Cambiarla es una línea.
- Un enlace nuevo fuera del armazón no precarga por defecto: hay que marcarlo. Es el comportamiento buscado, porque el conjunto de rutas fijas es chico y conocido.
- El caso de QA no puede filtrar las peticiones por `resourceType() === "document"`: Chromium reporta el `<link rel="prefetch">` como `"other"`. El filtro acepta `document`, `other` y `fetch`, y compara por pathname.
- La tarea que ejecuta esta decisión es `tasks/frontend/14-aplicacion-cliente-navegacion-y-detalle.md`, unidad 1.

---

## D-019 — El armazón se persiste entre navegaciones y el enlace activo lo corrige el cliente

**Estado** — **Reemplazada por D-023.** Con la SPA el armazón no se reemplaza en ninguna navegación, así que la directiva `transition:persist`, sus cinco claves y el re-marcado en `astro:page-load` salieron del proyecto. Se conserva el registro de lo que se decidió entonces y por qué.

**Contexto**

Cada navegación con `<ClientRouter />` reemplaza el `<body>` entero, así que `Nav` y el `<footer>` se reconstruían: el cajón de navegación volvía a su estado cerrado por SSR, el tema y el prompt de instalación se reinicializaban y el armazón entero se volvía a parsear en cada pantalla.

Un detalle medido decide la implementación: `transition:persist` **aplicada al componente `<Nav />` se descarta en silencio**. El componente tiene cuatro raíces —el `<aside>` de la barra lateral, el `<header>` de la barra superior, el `<div>` del scrim y el `<nav>` del cajón— y no hay un elemento único donde poner el atributo: el HTML servido no lleva ningún `data-astro-transition-persist`. Con un elemento plano como control, la directiva sí emite el atributo, con o sin valor, así que no es un problema del servidor de desarrollo.

**Decisión**

La directiva va **adentro de `Nav.astro`, una por raíz**, cada una con su clave: `shell-sidebar`, `shell-topbar`, `shell-scrim` y `shell-drawer`; y `shell-foot` en el `<footer>` de `Layout.astro`. Las claves son explícitas y distintas porque el router empareja por valor (`newElement.querySelector('[data-astro-transition-persist="<valor>"]')`, `node_modules/astro/dist/transitions/swap-functions.js:99`): con varios elementos persistidos y el valor vacío, todos los nodos viejos apuntarían al mismo nuevo.

Como el nodo sobrevive, el `sidebar-link--active` y el `aria-current="page"` que pinta el servidor quedan viejos después de navegar. `src/lib/shell/nav-active.ts` los corrige en el cliente, en cada `astro:page-load`: `activeSectionFor(pathname)` decide la sección por el **primer segmento** de la ruta y `markActiveNav(section)` marca y desmarca los **tres** juegos de enlaces (barra lateral, barra superior y cajón), quitando el atributo `aria-current` en vez de vaciarlo. La prop `activeSection` y su render de servidor se conservan: dan el estado correcto en el primer pintado y evitan el parpadeo.

El caso `TC-NAV-002` lo fija con dos afirmaciones: la de **preservación** —los tres enlaces activos apuntan a la sección nueva y ninguno a otra— pasa antes y después del cambio, porque antes la pinta el servidor y después el cliente; y la del **nodo persistido** —una propiedad de JS marcada en el `<aside>` sobrevive la navegación— es la que falla sin la directiva.

**Alternativas**

- *Envolver `<Nav />` en un `<div transition:persist>` desde el layout.* Es una línea, pero mete un elemento que no existía en el medio del armazón y deja el CSS del shell —posición fija y márgenes por tokens— dependiendo de una estructura que nadie eligió. Rechazada.
- *Reestructurar `Nav.astro` para que tenga una sola raíz.* Daría la directiva gratis, pero reescribe la estructura del armazón y su CSS en la misma unidad que la persistencia: dos cambios con modos de falla distintos bajo un mismo commit. Rechazada.
- *Dejar `transition:persist` sin valor.* Astro autogenera claves únicas en elementos planos, así que funcionaría, pero deja la identidad de los nodos en manos de un identificador del compilador que cambia con el archivo. Rechazada: las claves con nombre se leen y se pueden citar en un caso.
- *Quitar `activeSection` y dejar el marcado sólo en el cliente.* Ahorra una prop, pero el link activo se pinta recién después de la hidratación: el primer pintado sale sin activo. Rechazada.

**Consecuencias**

- El cajón, el tema y el prompt de instalación dejan de reinicializarse en cada navegación. `initNavDrawer` sigue corriendo en cada `astro:page-load` con su `dispose`, así que no quedan listeners duplicados, y su reset de `data-open="false"` es lo que garantiza que el cajón persistido llegue cerrado a la pantalla nueva.
- El `inert` que el cajón pone sobre `[data-nav-inert]` se limpia en el `dispose` de cada reejecución, así que persistir el `<footer>` —uno de los nodos afectados— no lo deja inerte.
- Los cinco nodos tienen que existir en todas las páginas: si una ruta dejara de montar `Layout`, el router no encontraría la pareja nueva y descartaría el nodo viejo sin error (`if (!newEl) continue`).
- El enlace activo tiene una ventana de milisegundos con el valor viejo, entre el reemplazo del `<body>` y el `astro:page-load` que lo corrige.
- La tarea que ejecuta esta decisión es `tasks/frontend/14-aplicacion-cliente-navegacion-y-detalle.md`, unidad 2.

---

## D-020 — La caché de datos vive en la memoria de la pestaña, con `swr` por defecto

**Estado** — Aceptada. Vigente desde la versión 1.

**Contexto**

`apiFetch` iba derecho a la red en cada llamada: volver de un detalle a un listado repetía la pantalla completa, y dos pantallas que pedían lo mismo a la vez disparaban dos pedidos —el resumen hace cinco llamadas—. El service worker ya guardaba respuestas HTTP entre sesiones, pero eso no evita el pedido ni la espera dentro de una misma sesión: una pantalla ya visitada se volvía a pintar con su estado de carga y una ida y vuelta a la API.

**Decisión**

Hay una caché de datos **en memoria de la pestaña** (`frontend/src/lib/core/cache.ts`), con la política separada del almacén:

- Sólo se cachea `GET`. El almacén guarda, por clave `MÉTODO URL`, `{ data, at, storedAt }`: `at` es la hora del dato que informa el servidor —lo que publica el aviso de datos viejos— y `storedAt` es la marca local con la que se mide la edad.
- La política la declara quien llama y el **defecto es `swr`**: con entrada cacheada se devuelve al instante y, si supera el umbral de revalidación (`REVALIDATE_AFTER_MS`, 30 s), sale **una** revalidación de fondo que actualiza el almacén sin cambiar lo que ya se devolvió. La política `fresh` ignora la entrada asentada y siempre va a la red; es la que usa el detalle de una venta.
- Dos `GET` idénticos en vuelo comparten el mismo `Promise`. Un `fresh` puede compartir ese pedido, pero **nunca** recibe un valor cacheado.
- Un rechazo no se cachea nunca y no queda en el mapa de pedidos en vuelo.
- **Toda escritura exitosa vacía la caché entera**, y `clearCache()` **avanza un contador de generación**. Un pedido que salió a la red con una generación vieja devuelve igual su dato a quien lo pidió, pero no repuebla la caché: sin ese contador, la revalidación de fondo que estaba en vuelo durante un cambio de estado repoblaba el listado con el dato previo.
- Cuando el dato sale de la caché se publica `shopmar:stale-data` con el `at` guardado, así el aviso que ya existía dice la verdad. La revalidación de fondo **no** publica: la pantalla sigue mostrando el dato viejo y el aviso tiene que seguir diciendo la hora de ese dato.

**Alternativas**

- *Cachear en `localStorage` o en IndexedDB.* Sobrevive a la recarga, pero agrega una migración de formato, una política de vencimiento entre sesiones y el riesgo de servir el listado de ayer como si fuera de hoy. Rechazada.
- *Una librería de datos (TanStack Query, SWR).* Resolvería lo mismo con menos código, pero rompe el presupuesto de dependencias de `modules/frontend/01-arquitectura.md` y mete un framework de estado en una aplicación que no tiene ninguno. Rechazada.
- *Sin invalidación, con TTL corto por entrada.* Deja en pie el rato en que el dato viejo se sirve igual y ata la corrección a que pase el reloj. Rechazada: la escritura es un hecho conocido y barato de propagar.
- *No publicar `shopmar:stale-data` desde esta caché.* Dejaría el aviso hablando sólo de la caché del service worker, y una pantalla servida de la memoria con un dato de hace minutos no diría nada. Rechazada.
- *No deduplicar los pedidos en vuelo y cachear sólo lo resuelto.* Es la mitad del problema: dos pantallas que piden lo mismo a la vez siguen haciendo dos pedidos. Rechazada.

**Consecuencias**

- `fresh` es la única puerta que garantiza dato fresco, y existe para el detalle de venta, que es el dato que se está por modificar. Los listados y las agregaciones se sirven de la caché, con la revalidación de fondo como red.
- El aviso de datos viejos pasa a tener dos fuentes: la caché del service worker, entre sesiones, y esta caché, dentro de la pestaña. `modules/frontend/08-pwa.md` documenta la diferencia.
- Una entrada de menos de 30 s se sirve **sin aviso**, porque `at` es `null` en una respuesta fresca: el aviso no se dispara por edad local, sólo cuando el servidor o el service worker marcan el dato como viejo.
- El umbral de 30 s es una decisión revisable: más corto revalida más seguido, más largo deja el listado más quieto.
- `clearCache()` es el único punto que avanza la generación, así que toda invalidación futura tiene que pasar por ahí.
- La tarea que ejecuta esta decisión es `tasks/frontend/14-aplicacion-cliente-navegacion-y-detalle.md`, unidad 3.

---

## D-021 — Una venta lleva varias categorías y el banco se elige de una lista

**Contexto**

La categoría de la venta nació como un enum de un solo valor (`sale_category`) y el banco de la tarjeta como texto libre de hasta 100 caracteres. La operación real de la tienda mezcla prendas en una misma factura —camisas, pantalones y chaquetas juntas— y cobra con bancos del país: pedir una sola categoría obligaba a mentir en el dato, y el banco se escribía a mano.

**Decisión**

1. `sale.category` es una **lista** del enum `sale_category`: `sale_category[] NOT NULL`, con **al menos una** categoría y **sin repetidos**. La lista es de la venta, no de cada renglón, y **no se muestra en ninguna pantalla**: se guarda y se devuelve por la API, como antes.

   > **Enmienda (S47, S48).** La obligatoriedad de «al menos una» queda **retirada**. La dueña
   > pidió sacar el campo del formulario —«elimina esto: Categoría ... veo que no es necesario»—
   > porque no lo usaba para nada, y la razón es la que ya estaba escrita acá: **ninguna pantalla
   > la muestra**. Una regla que exige un dato que nadie lee no protege nada, y con el campo
   > fuera del formulario sólo servía para que el alta fallara con `400`. Desde entonces
   > `category` es **opcional en el alta**: cuando no viene, el repositorio guarda un **arreglo
   > vacío**, que satisface el `NOT NULL` de la columna, así que **no hay migración** y las ventas
   > ya guardadas conservan sus categorías. Lo que se conserva de la regla original es lo que
   > sigue significando algo si la clave viaja: categorías del enum y **sin repetidas**. El
   > formulario ya no tiene el campo ni valida nada al respecto.
2. El banco del cobro con tarjeta se elige de una **lista cerrada de bancos de Nicaragua** en el formulario (BAC Credomatic, LAFISE, BANPRO, Ficohsa, AVANZ, ProCredit, BANEX). `sale.payment_bank` **sigue siendo texto** en la API, con la misma regla de obligatorio con tarjeta y prohibido con efectivo.

**Alternativas**

- *Tabla hija `sale_category(sale_id, category)`.* Es el patrón normalizado y el repo ya tiene una tabla hija (`additional_sale`). Se descartó para v1: agrega una tabla, un `JOIN` en cada lectura del detalle y un borrado en cascada, para un valor que ninguna pantalla consulta. Si alguna vez se filtra o se agrupa por categoría, es la forma que corresponde, y la migración desde el arreglo es directa.
- *Repetir la categoría en cada renglón de mercadería.* Es más preciso —cada prenda con la suya— pero multiplica los campos por renglón y cambia la factura, para un dato que hoy no se imprime. Descartada por la dueña.
- *Categoría por renglón **y** en la venta.* Lo más completo y lo más caro: dos lugares donde el mismo dato puede discrepar. Descartada.
- *Enum del servidor para el banco.* Habría que migrar la columna y agregar un valor por cada banco nuevo, y los valores ya guardados —incluidos los de demostración— quedarían fuera del enum. Descartada: la lista es una decisión de interfaz.

**Consecuencias**

- La migración va **escrita a mano**: `drizzle-kit` 1.0.0-rc.4 no detecta cambios de dimensiones en una columna enum —con el esquema ya en `.array()` sigue respondiendo "No schema changes"—. El `ALTER` convierte con `USING ARRAY["category"]`, así que ninguna venta pierde su categoría.
- `scripts/verify-schema.sql` (sección 2b) afirma el tipo `sale_category[]`, `NOT NULL` y sin default: es la única red contra ese punto ciego de `drizzle-kit`.
- El endpoint de creación rechaza con `400` una categoría repetida, y el formulario validaba lo mismo antes de enviar (esa copia del cliente se retiró con el campo, S48). El servidor sigue siendo la red.
- Agregar un banco a la lista es tocar `frontend/src/lib/sales/banks.ts`, sin migración ni cambio de contrato.
- El listado de ventas sigue sin devolver `category` —la tabla es compacta— y la factura sigue imprimiendo "Tarjeta — <banco>".
- Corrige de paso dos desincronizaciones de la documentación: el máximo del banco es 100 (la spec decía 200) y `category` no estaba en la tabla de campos del `POST`.
- D-002 queda como está: **no hay catálogo de productos**. Lo que se acepta es un subconjunto de un enum chico en la venta, no un alta por prenda.

## D-022 — La venta a crédito separa la condición de pago del estado, y los pagos son un libro

**Contexto**

La tienda vende a crédito: el cliente se lleva la mercadería y paga después, a veces en partes. El
modelo de la versión 1 no podía representarlo. `sale.payment_method` dice **cómo** se paga
(`cash`, `credit_card`) y `sale.status` (`pending`, `completed`, `cancelled`) hace de **estado de
cobro** a medias: `completed` exige `amount_paid`, así que «cobrada» y «completada» son lo mismo, y
el monto vive en dos columnas de la venta (`amount_paid`, `change_given`) sin historial.

Con ese modelo, una venta fiada y una venta de contado que la dueña todavía no marcó como cobrada son
indistinguibles: las dos son `pending` con `amount_paid` nulo. Y no hay forma de representar lo que de
verdad pasa en el mostrador: **pagó 500 de 1.200**.

**Decisión**

1. **La condición de pago es una columna propia.** `sale.payment_terms`, enum `payment_terms`, con dos
   valores: `immediate` (contado) y `credit` (crédito). Por defecto `immediate`. Una venta a crédito
   exige **cliente registrado** (`customer_id`) y **fecha de pago prometida** (`due_date`); las dos
   reglas tienen `CHECK` en la base, porque sin ellas no hay cuenta por cobrar.
2. **`status` conserva su significado y no gana valores.** `completed` sigue queriendo decir
   **cobrada**, y una venta a crédito llega ahí **sólo** cuando el saldo llega a cero por pagos
   registrados: `PATCH /sales/:id/status` rechaza `completed` y `pending` sobre una venta a crédito con
   `409`, y la salida es registrar o borrar un pago.
3. **Los pagos son un libro, no un campo.** Tabla `sale_payment`: un renglón por pago, con `amount`
   (monto **aplicado** a la deuda), `paid_at`, forma de pago, banco y nota. El estado de cobro se
   **deriva**: `paid_total` es la suma de los pagos vivos y `balance` es `total − paid_total`. `balance`
   y `paid_total` **no se guardan**. `sale.amount_paid` y `sale.change_given` se conservan con su
   significado actual —lo que el cliente entregó en el mostrador y el vuelto— porque la factura los
   imprime y las filas ya guardadas los tienen. Por eso el invariante no es «`amount_paid` = suma de
   pagos» sino **`paid_total` = suma de pagos**, y `paid_total` es lo único con lo que se calcula el
   saldo.
4. **«Parcial» y «vencida» son derivados, nunca columnas.** `is_overdue` se calcula como
   `balance > 0 AND due_date < hoy`. Guardar «vencida» obliga a un proceso que la actualice y, en
   cuanto ese proceso falla, el dato miente. Una venta parcialmente pagada sigue `pending`: el saldo es
   el que dice cuánto falta, no un estado nuevo en el enum.
5. **El cliente es una entidad.** Tabla `customer`, con nombre, teléfono y nota. `sale.customer_id` es
   la referencia viva y `sale.customer_name` **se conserva** como instantánea: la factura de una venta
   vieja sigue diciendo el nombre que decía, aunque el cliente se haya renombrado o borrado
   lógicamente.

   > **Enmienda (S18).** La referencia dejó de ser opcional en las altas nuevas: **toda venta queda
   > enlazada a un cliente**. Cuando el cuerpo trae sólo `customer_name`, el servicio lo recorta y busca
   > un cliente **vivo** cuyo nombre coincida —`lower(name) = lower(nombre recortado)`, o sea exacto y
   > sin distinguir mayúsculas—; si existe, lo reutiliza, y si no, lo crea con ese nombre sin teléfono ni
   > nota. La búsqueda o el alta ocurre en el backend, no en cada consumidor de la API, para que la regla
   > valga igual en `live`, en WhatsApp y en cualquier cliente futuro. El nombre del cliente se sigue
   > copiando a `sale.customer_name` como instantánea de la factura, así que la factura conserva la
   > capitalización del primer registro. `customer_id` **nulo** queda sólo para las ventas registradas
   > antes de este cambio, que se siguen leyendo igual. El emparejamiento no justifica un `UNIQUE`: dos
   > ventas simultáneas con un nombre nuevo pueden crear dos clientes, un duplicado inofensivo y visible,
   > no un dato perdido.

   > **Enmienda (S29).** En una venta a **crédito** el `customer_id` dejó de ser obligatorio en el alta:
   > el nombre escrito también identifica al cliente, porque el servicio lo resuelve o lo crea antes de
   > insertar y la fila queda igual de enlazada. La condición de pago no cambia ninguna regla del
   > cliente —lo único obligatorio es **uno de los dos** identificadores, `customer_id` o
   > `customer_name`, y mandar los dos sigue siendo `400`—, y **la instantánea de la factura no cambia**:
   > `sale.customer_name` se sigue copiando del cliente y la factura vieja sigue diciendo el nombre que
   > decía. El `CHECK sale_credito_exige_cliente` tampoco cambia, porque la columna se llena siempre: lo
   > que se relajó es el DTO, no la tabla.

   > **Enmienda (S57).** En una venta a **crédito** tampoco se elige **forma de pago**: no hay cobro en el
   > momento, así que el paso «Cobro» del formulario deja de pedir método y banco y el alta viaja sin
   > `payment_method`. El DTO lo volvió **condicional**: obligatorio con `immediate` —con el mensaje de
   > siempre— y **prohibido con `credit`**, que lo rechaza con `400` como el resto de las claves que sólo
   > valen en una condición; `payment_bank` sigue prohibido en crédito. La columna
   > `sale.payment_method` **no se toca** —sigue `NOT NULL` y su `CHECK` de banco—, así que el servicio
   > escribe **`cash` con banco nulo** como **valor de registro**, y la factura imprime **«Crédito»** en la
   > línea de pago en vez de «Efectivo». El medio real de cada cobro sigue viviendo en `sale_payment`, que
   > es lo que el bloque «Pagos» imprime por abono. Queda anotada como alternativa futura hacer la
   > columna nullable, que hoy no aporta: el dato que importa ya está en el libro.
6. **La caja se mide por separado del devengado.** `total_revenue` no cambia: sigue siendo el devengado
   por `sale_date` y sigue incluyendo `pending` (D-008). Se agregan `collected_revenue` (suma de pagos
   por `paid_at`), `outstanding_receivables` (saldo de las ventas a crédito del rango) y
   `overdue_receivables` (el subconjunto vencido). Una venta a crédito de enero cobrada en marzo suma
   en el devengado de enero y en la caja de marzo: son dos preguntas distintas y ahora tienen dos
   números distintos.
7. **El alta de la venta acepta `status` y `amount_paid`.** Era el contrato ya documentado en
   `modules/api/02-sales.md` y el DTO no lo cumplía (`.strict()` los rechazaba). Con
   `status: "completed"` el alta escribe el pago del mostrador en la misma transacción; sin ese pago,
   `collected_revenue` no contaría la venta cobrada en el momento.

**Alternativas**

- *Agregar `credit` al enum `payment_method`.* Es la solución de una línea y la más tentadora.
  Rechazada porque mezcla dos preguntas: un cliente puede deber hoy y pagar con tarjeta en tres
  semanas. Con `credit` como forma de pago, el día que paga no hay dónde decir con qué pagó, y una
  venta a crédito cobrada con tarjeta queda mintiendo sobre el medio.
- *Un cuarto valor de `status`: `partial`.* Rechazada porque duplica un dato derivado: `status` ya
  tiene que decir si la venta se cobró, y «cuánto falta» es el saldo. Además obliga a tocar el
  `<select>` del listado, los tres colores del panel y todas las transiciones del caso de uso 03, y la
  base puede quedar inconsistente entre `status` y pagos.
- *Un campo `is_paid` y listo.* Rechazada por el caso real: no hay abonos parciales, no hay historial,
  no hay forma de responder «¿cuándo pagó?» ni de corregir un monto mal tipeado sin reescribir la
  venta.
- *Guardar el saldo en una columna `balance`.* Rechazada por la misma razón que el estado `partial`:
  dos fuentes para el mismo número. La columna `sale.amount_paid` que ya existe se mantiene sólo por
  compatibilidad de la factura, y el saldo se suma del libro.
- *Reutilizar `amount_paid` como saldo acumulado.* Es lo más barato, y es lo que haría un patch de dos
  horas. Rechazada porque un campo absoluto no distingue dos abonos del mismo monto, no deja auditoría
  y pierde la carrera cuando dos pestañas cobran a la vez: el libro con `FOR UPDATE` sobre la venta y
  la suma dentro de la transacción, no.
- *Normalizar el cliente en una tabla y migrar todas las ventas viejas a `customer_id`.* Rechazada:
  obliga a deduplicar nombres libres («María», «maria gonzalez», «Mari») con criterio que nadie puede
  validar, y reescribe facturas históricas. Las ventas viejas quedan con su `customer_name` y sin
  `customer_id`.
- *Un abono como `PATCH /sales/:id/status` con `amount_paid`.* Rechazada: el endpoint pide un estado,
  no un pago, y no hay forma de borrar un abono equivocado.

**Consecuencias**

- La migración es de dos partes: crear `customer`, `sale_payment` y el enum; agregar las columnas a
  `sale` con `payment_terms = 'immediate'`; y hacer **backfill** de un pago por cada venta que ya estaba
  `completed`, con `amount = cost + SUM(additional_sale.total)` y `paid_at = sale_date`. Sin el
  backfill, esas ventas tendrían `balance = total` y la caja arrancaría en cero.
- `sale.amount_paid` de esas filas **no se toca**: sigue siendo lo que el cliente entregó (puede incluir
  el vuelto) y la factura lo sigue imprimiendo igual.
- `sale_payment` no tiene endpoint de edición: un abono equivocado se **borra lógicamente** y se vuelve
  a registrar. Es el mismo criterio que un gasto (D-004).
- Los pagos de una venta a crédito se pueden registrar con efectivo o tarjeta, con la misma regla
  condicional del banco que la venta. La forma de pago de la **venta** queda como se registró y no se
  reescribe cuando llega el pago.
- Registrar un pago y borrar un pago bloquean la fila de la venta con `SELECT ... FOR UPDATE` y suman
  el libro dentro de la misma transacción. Dos cobros simultáneos no pueden dejar el saldo negativo ni
  el estado mintiendo.
- `verify-schema.sql` deja de afirmar «3 tablas y 6 enums»: pasa a 5 tablas y 7 enums, con los índices
  y las `CHECK` nuevos.
- El listado `GET /sales` gana `payment_terms`, `due_date`, `paid_total`, `balance` e `is_overdue`, y
  dos filtros (`payment_terms`, `overdue`). `balance` viaja **nulo** en las ventas de contado: un
  pendiente de contado no es una deuda.
- La UI del formulario y del botón «Registrar pago» es el corte siguiente. Este entrega el contrato.

## D-023 — La navegación del panel es una SPA de un documento con plantillas

**Estado** — Aceptada. Vigente desde la versión 1. Reemplaza D-019 y enmienda D-005 y D-017 en su letra sobre el enrutado de cliente y la caché de navegación.

**Contexto**

La dueña reportó el síntoma con el panel instalado como PWA en el teléfono: tocar una tab de la
navegación tenía una espera perceptible, y no era la primera pantalla sino **cada** cambio de
sección. El diagnóstico descartó el router como causa próxima: `<ClientRouter />` ya intercambiaba
documentos y `astro.config.mjs` ya prefetcheaba con `viewport`, pero `public/sw.js#handleNavigation`
era **red primero con un tope de tres segundos** (`NAV_TIMEOUT`), así que cada navegación pedía el
HTML y la copia prefetcheada sólo se usaba si la red fallaba. El piso de esa espera era un ida y
vuelta de HTML por toque.

La segunda mitad del pedido acotó la solución: instantáneo **y** sin datos viejos nunca (S3). Eso
descarta la salida barata —servir la copia guardada y listo— y obliga a separar las dos cosas que
viajan en una navegación: **el armazón**, que es el mismo en todas las rutas y sólo cambia con un
despliegue, y **los datos**, que sí envejecen y por eso los sigue pidiendo cada vista.

Medido antes de elegir: los doce HTML del build sumaban **345 KB crudos y ~35 KB gzip**, y el
armazón se repite en todos. Pagar ese documento una vez por versión y navegar sin pedirlo es más
barato que pedir una variante en cada toque.

**Decisión**

El panel es **una SPA de un documento**:

- **Un documento con todas las vistas como `<template data-view="…">`.** `components/App.astro`
  renderiza el armazón de siempre (`Layout.astro`, con `Nav.astro`) y, dentro del `<slot>`, un
  contenedor `[data-app-root]` vacío más una plantilla por vista. El HTML de las nueve vistas viaja
  dentro de ese documento: navegar clona la plantilla destino en el contenedor, así que no se pide
  ni un documento ni un chunk.
- **Router propio con la History API** (`lib/app/`). `router.ts` es la tabla de rutas, pura
  (`viewForPath`/`resolveLocation`, `hrefFor`, `VIEW_TITLES`, `VIEW_WIDE`); `start.ts` intercepta
  los clics de same-origin, mueve la URL **antes** de montar, atiende `popstate`, sube el scroll al
  tope y expone `pushQuery` para paginar y filtrar sin remontar; `views.ts` es el registro y
  garantiza el invariante de que antes de montar una vista se desmonta la anterior.
- **Ciclo `mount(root) → cleanup` por vista**, con el markup en `components/views/<Vista>View.astro`
  y el comportamiento en `lib/views/<vista>.ts`. Toda consulta al DOM de una vista va contra su raíz
  (`qs(sel, root)`), así que dos vistas no se pisan los `[name]` ni los `id`.
- **Cada ruta del panel sirve el mismo documento.** `src/pages/index.astro`, `sales/index.astro`,
  `sales/detail.astro`, `customers/index.astro` y las demás son cinco líneas: `<App view="…" />`.
  No hay reescrituras del host: un archivo por ruta con el mismo armazón, y el router monta la vista
  que dice la URL. Es la lección de D-017 aplicada otra vez: la aplicación no depende de una
  configuración de servidor que el repositorio no versiona.
- **`<ClientRouter />` sale**, con `astro:page-load`, el puente `onPageLoad` y las directivas
  `transition:persist`. El armazón no se reemplaza, así que no hay nada que persistir: vive fuera de
  `[data-app-root]` y el router sólo cambia el contenido. El enlace activo se repinta en cada
  navegación con `markActiveNav(activeSectionFor(pathname))`.
- **El service worker sirve el armazón desde una copia canónica** (la clave `/`) para cualquier ruta
  del panel y **revalida en segundo plano**. `VERSION` sube a `4.0.0` y el aviso de versión nueva
  que ya existía sigue siendo el camino de activación.

Cómo se acota el riesgo de servir HTML viejo —el defecto de S52, y el único riesgo real de cachear
el armazón—:

1. **Revalidación con `no-store` en todas las navegaciones servidas de la caché**, no sólo cuando a
   la pestaña le sobra tiempo. El caché HTTP del navegador no puede devolver el HTML anterior y
   dejarlo guardado otra vez: la copia que se sirve es la última que la red confirmó.
2. **`VERSION` en `sw.js`.** Cualquier cambio en el archivo instala un worker nuevo y su `activate`
   borra toda caché que no sea la de esa versión, así que un despliegue no convive con el armazón
   del anterior.
3. **Aviso de versión nueva.** El worker nuevo no toma el control solo: la pantalla muestra «Hay una
   versión nueva del panel disponible» con su botón, y hasta que la persona acepta sigue el worker
   viejo con su estrategia vieja. Es deliberado: recargar debajo de una venta a medio cargar es peor
   que servir un armazón de hace un despliegue.

Y lo que **no** se cachea es el dato: los skeletons y el `fetch` de cada vista salen siempre a la
API (D-020), así que un armazón de la versión anterior no puede mostrar cifras viejas.

**Alternativas**

- *SPA con rutas de hash (`/#/sales`).* No necesita un archivo por ruta: un solo documento resolvería
  todas las direcciones. Rechazada porque cambia la URL que la dueña ya usa y que está en sus
  marcadores, deja `pathname` siempre en `/` —con lo que el armazón no puede marcar la sección desde
  el servidor en el primer pintado— y no mejora nada del problema, que era el pedido de HTML.
- *Fragmentos por ruta: cada URL devuelve sólo el trozo de su vista y el cliente lo inyecta.* Es el
  camino intermedio clásico. Rechazada por dos motivos medidos: vuelve a pedir red en cada toque —el
  síntoma de S1— y obliga al host a distinguir «documento» de «fragmento», que es exactamente la
  dependencia de configuración del servidor que D-017 descartó.
- *Caché por documento en el service worker, caché primero.* Es lo que falla hoy: se guarda una
  copia por ruta, la primera visita a cada una sigue esperando red y el almacenamiento crece con el
  número de rutas y de queries. Rechazada porque el armazón es el mismo: guardar una copia por
  variante para servir un documento idéntico es pagar N veces lo que se paga una.
- *Dejar `<ClientRouter />` y sólo cambiar la estrategia del service worker a caché primero.*
  Resolvería la espera en la segunda visita a cada ruta, pero la primera sigue pidiendo el documento
  y el router de Astro vuelve a parsear, rehidratar y reejecutar los scripts de la página nueva en
  cada navegación. Rechazada: arregla la mitad del síntoma y deja el armazón reconstruyéndose.
- *Servir el armazón con una reescritura del host (`try_files … /index.html` en nginx, `_redirects`
  en Netlify) en vez de un archivo por ruta.* Es la forma habitual de servir una SPA. Rechazada por
  la misma razón que en D-017: la aplicación pasaría a depender de una configuración de servidor que
  no está en el repositorio, y un despliegue a otro host rompería los deep links en silencio.
- *Skeletons sólo en las tablas.* Era el mínimo pedido. Rechazada como alcance incompleto: la espera
  de datos también existe en los KPIs, los gráficos, el detalle y el arranque de un formulario, y una
  pantalla que estructura la tabla y deja «Cargando…» arriba sigue delatando la espera.

**Consecuencias**

- Navegar entre vistas no pide red **ni documento**: lo que se paga es el montaje y el `fetch` de
  datos de la vista, que sigue saliendo a la API. El toque de una tab cambia de pantalla en el mismo
  frame.
- El armazón se pide una vez por versión y no una vez por toque: los 345 KB crudos / ~35 KB gzip del
  build se cachean bajo una sola clave y se sirven a cualquier ruta del panel.
- La compilación sigue siendo estática y sin adaptador (D-005 vigente): lo que cambia es cuántos
  documentos produce —uno por ruta, todos iguales— y quién navega.
- **El markup de las pantallas ya no vive en `pages/*.astro`.** Vive en `components/views/`, con su
  hoja al lado, y su comportamiento en `lib/views/`. Las páginas de `pages/` son el armazón con la
  vista declarada. Cualquier spec que hable del «archivo de la pantalla» tiene que nombrar la vista.
- Los estados de carga pasan a ser **skeletons** (la primitiva `.skeleton` de `src/styles/`), no un
  texto «Cargando…».
- `pages/summary.astro` se conserva como redirección (`meta refresh` a `/`, sin ningún enlace
  entrante): un marcador viejo sigue funcionando y borrarlo sería una decisión de producto, no de
  esta migración. Está fuera de `PANEL_ROUTES` del service worker, así que conserva su documento.
- Las rutas que no son del panel —`/offline`, el 404, `/summary` y un marcador `/sales/<id>`— no se
  sirven del armazón: un enlace roto sigue mostrando la página que explica la mudanza (D-017) en vez
  de una pantalla vacía.
- Se retiran `TableState.astro`, las hojas `pages/*.css`, el puente `onPageLoad` para las pantallas
  del panel y los seis `transition:persist`; `onPageLoad` sobrevive sólo para `/offline`, que es el
  único documento fuera del router.
- El costo nuevo es que hay que sostener dos listas de rutas: la del router (`lib/app/router.ts`) y
  la del service worker (`PANEL_ROUTES` en `public/sw.js`), porque el worker no comparte módulos con
  la app. Una ruta nueva se suma en los dos lados, y está escrito en las dos.

---

## D-024 — El panel tiene autenticación: sesión que no vence, cookie opaca y dos roles

**Estado** — Aceptada. Vigente desde la versión 1. **Supera D-001.** El contrato completo, con
cuerpos, respuestas y mensajes exactos, vive en `modules/api/07-auth.md`.

**Contexto**

D-001 decidió que el sistema no tenía autenticación porque lo operaba una sola persona —la dueña—
en una red privada, y porque el andamiaje de `fwinit` traía un flujo de sesión completo que no
respondía a ningún requisito. Ese contexto cambió: **ahora hay empleados usando el panel**, y con
ellos aparece lo que D-001 no tenía: alguien que puede registrar una venta con su nombre y alguien
que no debería poder crear cuentas. Sin identidad no hay forma de distinguirlos, y el pedido de
producto lo dice explícito: dos roles, vendedores y administradores, y **solo los administradores**
dan de alta usuarios.

El segundo requisito fija la forma de la sesión: *«no quiero perder el login del usuario, no importa
si pasan 2 o 6 meses»*. La dueña usa el panel desde el teléfono del mostrador; un cierre de sesión
por antigüedad, por reinicio del navegador o por un corte de wifi la deja afuera en el peor momento.

Lo que **no** cambió es el resto del modelo de amenaza: el proceso de API sigue sin exponerse a
Internet, PostgreSQL sigue escuchando en `localhost` y los controles compensatorios de D-001 siguen
vigentes. La autenticación se suma **encima** de ellos, no los reemplaza.

**Decisión**

Siete reglas que se aplican juntas:

1. **La sesión no vence.** La tabla `session` no tiene `expires_at`: el único acto que la invalida es
   el logout, que escribe `revoked_at`. La cookie se emite con `Max-Age` de diez años y el servidor
   nunca la rechaza por antigüedad. No se renueva por inactividad ni rota por navegación.
2. **La cookie es `HttpOnly` y lleva un token opaco** (`shpr_session`): 32 bytes en `base64url`, sin
   datos adentro. No es un JWT, así que no se puede leer ni editar desde el cliente. Del token el
   servidor guarda **solo el `sha256`**, y compara con `timingSafeEqual`: quien lea la tabla
   `session` no puede reconstruir la cookie. `SameSite=Lax` y `Secure: false` en desarrollo,
   `SameSite=None` y `Secure: true` en producción, donde el panel y la API pueden estar en hosts
   distintos.
3. **La contraseña se hashea con `scrypt` de `node:crypto`**, con sal por usuario y un hash
   autodescriptivo (`scrypt$N$r$p$sal$hash`), comparado con `timingSafeEqual`.
4. **La autorización es del servidor.** Un guard de sesión cubre **todo** `/api/v1` salvo dos rutas públicas: `POST /api/v1/auth/login` y `POST /api/v1/auth/logout`, que es idempotente —sin cookie o con la sesión ya revocada responde `200` y borra la cookie igual—. `POST /api/v1/users` exige además `role = 'admin'` y responde `403` a un `seller`. El rol viaja en `GET /api/v1/auth/me` para que el frontend esconda lo que no corresponde, pero el cliente nunca es autoridad.
5. **No hay registro público, ni recuperación de contraseña, ni listado/edición de usuarios.** El
   único que crea usuarios es un administrador autenticado (`POST /api/v1/users`), y el primer
   administrador se crea con `pnpm create-admin -- --username … --email … --password …`, porque sin
   alguien autenticado no hay quién llame al alta.
6. **CORS con credenciales y orígenes explícitos.** `credentials: true` y los orígenes de
   `CORS_ORIGIN`, sin comodín: con credenciales un `*` no es válido y abriría la API a cualquier
   origen. El panel llama con `credentials: "include"`.
7. **El panel no se desloguea por un corte de red.** Solo un `401` del servidor borra la sesión
   local; un `NETWORK_ERROR` conserva al usuario y su último `me` cacheado. El mostrador se queda
   sin wifi, y expulsar por eso es exactamente el defecto que hay que evitar.

Los cuatro endpoints de acceso —`POST /auth/login`, `POST /auth/logout`, `GET /auth/me` y
`POST /users`— **no cuentan** en los veintiún endpoints de negocio: son el contrato de acceso.

**Alternativas**

- *JWT en una cabecera `Authorization`.* Es el default de cualquier plantilla. Se descarta por la
  revocación: un JWT no se puede invalidar sin una tabla igual, y el logout pide revocar; además
  viaja en `localStorage`, donde cualquier XSS se lleva la sesión y la conserva al cerrar el
  navegador.
- *Token en `localStorage`.* Más simple de leer desde el frontend, y por eso mismo peor: es
  accesible desde JavaScript, así que el `HttpOnly` de la cookie no se puede imitar. Descartada.
- *`bcrypt` o `argon2`.* Son los estándares de facto y no aportan lo suficiente acá como para sumar
  un binario nativo a un proyecto cuyo presupuesto de dependencias es cero. `scrypt` ya es
  memory-hard y vive en `node:crypto`. Descartada.
- *`expires_at` renovado por uso.* Es la forma habitual de «recordarme» y deja afuera exactamente a
  quien el requisito quiere adentro: la que no entra en el plazo. Si se renueva sola por pedido, lo
  único que agrega sobre no vencer es una fila más que actualizar. Descartada.
- *Registro público.* Permitiría que un empleado se diera de alta solo, y a la vez abriría la puerta
  a cualquiera que alcance el panel. El pedido es «solo inicio de sesión»: dar de alta es una acción
  del administrador, no del usuario. Descartada.
- *Recuperación de contraseña por correo.* Exige un servicio de envío, tokens de un solo uso y una
  pantalla más, para un negocio con dos o tres empleados a los que el administrador les cambia la
  contraseña desde la terminal. Descartada.
- *Comodín `*` en CORS con `credentials: true`.* El navegador rechaza la combinación, y si la
  aceptara estaría regalando la cookie a cualquier sitio. Descartada.
- *Cerrar la sesión local ante cualquier error de la API.* Es lo que hace el camino obvio del
  cliente y es el defecto que se busca evitar: un `500` o un corte de red no dicen nada sobre la
  validez de la sesión. Descartada.

**Consecuencias**

- **D-001 queda superada.** Los controles compensatorios que enumeraba siguen siendo obligatorios:
  la autenticación se suma encima de ellos, no los reemplaza.
- `UNAUTHORIZED` (401) y `FORBIDDEN` (403) dejan de ser reserva del contrato de error: son el
  resultado normal de un pedido sin sesión y de un `seller` llamando al alta de usuarios.
- Dos tablas nuevas, `user` y `session`, y el enum `user_role` (`seller`, `admin`). `session` **no
  tiene columna de vencimiento**: agregarla, aunque sea `NULL`-able, reabriría la puerta a una regla
  que el negocio no quiere. `verify-schema.sql` pasa a exigir siete tablas y ocho enums.
- La contraseña viaja por argumento de línea de comandos en `pnpm create-admin`:
  el comando está pensado para la terminal del servidor y lo documenta. No es un endpoint.
- La cookie robada no vence. Se acepta y se mitiga con `HttpOnly`, `Secure` en producción y la
  posibilidad de revocar desde la base (`revoked_at`). Es el precio explícito de la regla 1.
- Los tests de integración existentes piden sin credenciales y el guard los afecta a todos: cada uno
  pasa a usar un helper de sesión. No hay bandera de bypass en producción.
- El panel gana un guard de router, la vista `/login` y la regla «un `401` borra la sesión local, un
  error de red no». Está en `modules/frontend/09-auth.md`.
- Los dos límites conviven: 1000 peticiones por minuto en el panel y **10 por minuto** en
  `POST /auth/login`, que es la única ruta que adivina contraseñas.
- No hay bloqueo de cuenta por intentos fallidos: el rate limit por IP y el costo de `scrypt` son la
  única defensa, y el login no revela si un correo existe (mismo estado y mismo mensaje para usuario
  inexistente, contraseña incorrecta y usuario borrado).
