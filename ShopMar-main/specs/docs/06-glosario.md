# Glosario

## Términos de negocio

**Venta** — Registro de una operación de venta. Es la entidad central del sistema. Tiene un único canal (`live` o `whatsapp`), un cliente, una mercadería descrita en texto libre, una forma de pago, una fecha, un estado y un importe principal.

**Venta en mostrador** (`live`) — Venta registrada directamente en el local. No admite artículos adicionales. Si el payload incluye `additional_items`, la API responde `400 BAD_REQUEST`.

**Venta por WhatsApp** (`whatsapp`) — Venta coordinada por mensaje. Admite una lista de artículos adicionales y es la única forma de venta que puede tenerlos.

**Artículo adicional** (`additional_sale`) — Prenda u objeto que se entrega como parte de una venta por WhatsApp y que se cobra por separado del importe principal. Pertenece a una única venta.

**Total de venta** — Valor derivado, nunca almacenado. Se calcula como `sale.cost` más la suma de los `total` de sus artículos adicionales. Se devuelve en las respuestas de la API como cadena decimal.

**Importe principal** (`sale.cost`) — Monto cobrado por la prenda u objeto principal de la venta. Se almacena en `DECIMAL(10,2)`.

**Canal** (`sale.type`) — Cómo se originó la venta: `live` o `whatsapp`.

**Estado de venta** (`sale.status`) — Situación de una venta: `pending` (pendiente), `completed` (completada) o `cancelled` (cancelada). Se cambia con un endpoint dedicado y nunca se modifica en otro endpoint. `cancelled` es definitiva: no admite ninguna transición de salida, no suma en los agregados del dashboard y sale de los ingresos y del conteo de ventas.

**Forma de pago** (`sale.payment_method`) — **Con qué** pagó el cliente: `cash` (efectivo) o `credit_card` (tarjeta de crédito). No dice **cuándo** se paga: eso es la condición de pago. Una venta a crédito se registra con una forma de pago y el cliente puede pagar después con otra.

**Condición de pago** (`sale.payment_terms`) — **Cuándo** se paga: `immediate` (contado, se cobra al momento) o `credit` (crédito, el cliente se lleva la mercadería y paga después). Es un dato distinto del estado y del método de pago (D-022).

**Venta a crédito** (fiado) — Venta con `payment_terms = credit` en la que el cliente no paga al momento. Exige **cliente registrado** (`customer_id`) y **fecha de pago prometida** (`due_date`), nace `pending` y llega a `completed` sólo cuando el saldo llega a cero por pagos registrados.

**Cliente registrado** (`customer`) — Persona dada de alta en la tabla `customer`, con nombre, teléfono y nota. Es el sujeto de una cuenta por cobrar. Las ventas guardan además `sale.customer_name` como **instantánea** del nombre al momento de la venta, que no se reescribe si el cliente se renombra.

**Pago (abono)** (`sale_payment`) — Renglón del libro de pagos de una venta: cuánto se aplicó a la deuda, cuándo, con qué medio y en qué banco. Un pago puede ser total o parcial, y un pago mal cargado se borra lógicamente y se vuelve a registrar.

**Saldo** (`balance`) — Lo que falta cobrar de una venta: `total − paid_total`. Es **derivado** y nunca se guarda como columna. En una venta de contado viaja como `null`, porque un pendiente de contado no es una deuda.

**Venta vencida** (`is_overdue`) — Venta a crédito con `balance > 0` y `due_date` anterior a hoy. Se **calcula** contra la fecha actual; no hay ningún campo que la marque ni proceso que la actualice.

**Cuenta por cobrar** — El conjunto de ventas a crédito con saldo pendiente de un cliente. Es una lectura de las ventas, no una tabla: se consulta por cliente con `GET /api/v1/customers?include_balances=true` y por venta con el filtro `overdue` del listado.

**Devengado** (`total_revenue`) — Lo vendido en un rango de fechas, medido por `sale_date`, sin mirar cuándo se cobró. Una venta a crédito de enero suma en el devengado de enero aunque el cliente pague en marzo (D-008, D-022).

**Cobrado** (`collected_revenue`) — La plata que entró en un rango de fechas, medida por `paid_at` de cada pago. Es distinto del devengado: la misma venta puede sumar en dos meses distintos, una vez en cada número.

**Categoría de venta** (`sale.category`) — Lista de categorías del enum `sale_category` (`pantalones`, `camisas`, `chaquetas`, `sudaderas`) con **al menos una** y sin repetidos: una venta puede llevar camisas, pantalones y chaquetas a la vez. Es de la venta, no de cada renglón, y el panel no la muestra en ninguna pantalla: se guarda y se devuelve por la API (decisión D-021).

**Banco** (`sale.payment_bank`) — Entidad financiera de la tarjeta. Obligatorio cuando la forma de pago es `credit_card`; debe venir nulo o ausente cuando es `cash`. En el formulario se elige de una lista cerrada de bancos de Nicaragua, pero la API acepta cualquier texto de hasta 100 caracteres: los valores ya guardados se siguen imprimiendo (decisión D-021).

**Paquete retirado** (`package`) — Envío preparado para un cliente. Es un registro independiente del negocio: puede existir sin relación con ninguna venta. Guarda el nombre, la fecha de salida, el método de transporte y un enlace opcional a la venta que lo originó.

**Método de transporte** (`package.method`) — `cargotrans` (Cargotrans), `delivery` (delivery propio) o `retiro` (retiro en el local).

**Enlace a venta** (`package.sale_id`) — Relación opcional entre un paquete y su venta de origen. Si la venta se elimina lógicamente, el enlace se conserva con valor nulo por la regla `onDelete: SetNull`.

**Gasto diario** (`expense`) — Desembolso del negocio: nombre, descripción opcional, importe y fecha. No tiene relación con ventas ni con paquetes.

**Indicadores** — Los números de la pantalla de dashboard: ingresos totales (devengado), cantidad de ventas, paquetes pendientes y total de gastos, todos filtrables por rango de fechas. Con la venta a crédito se suman los de caja y cartera: cobrado, por cobrar y vencido.

**Paquete pendiente** — En la versión 1, un paquete que está registrado y no ha sido borrado lógicamente. El modelo no tiene un campo de estado para el paquete, por lo que no se distingue entre "pendiente" y "entregado". Ver decisión D-007.

## Términos técnicos

**API REST** — Interfaz de programación por la que el panel web consulta y envía datos. Veintiún endpoints bajo el prefijo `/api/v1`, repartidos en los módulos dashboard, ventas, clientes y gastos.

**Sobre de error** — Formato único de respuesta cuando algo falla: `{ "code", "message", "details"? }`. Los códigos en uso son `BAD_REQUEST` (400), `NOT_FOUND` (404), `CONFLICT` (409) e `INTERNAL_ERROR` (500).

**Zod** — Librería de validación de datos. Define la forma y las reglas de cada cuerpo, query y parámetro de ruta antes de que lleguen a la lógica de negocio.

**Drizzle** — ORM que traduce las tablas declaradas en `backend/src/db/schema/` a consultas tipadas contra PostgreSQL. El cliente único vive en `backend/src/db/index.ts`, sobre un `Pool` de `pg`. Ver decisión D-016.

**drizzle-kit** — Herramienta de línea de comandos del ORM. `drizzle-kit generate` compara el esquema de `src/db/schema/` con el historial y escribe el SQL de la diferencia en `backend/drizzle/`; `drizzle-kit migrate` lo aplica. Ver decisión D-016.

**DECIMAL(10,2)** — Tipo numérico exacto de PostgreSQL para dinero. Admite hasta ocho dígitos enteros y dos decimales, y no suffer el error de redondeo propio de los números de punto flotante.

**Cadena decimal** — Representación textual de un importe en la respuesta de la API, por ejemplo `"1250.50"`. Nunca es un número JSON.

**Arquitectura por capas** — Organización del backend en `domain` (reglas de negocio, sin framework), `application` (orquestación), `infrastructure` (accesos a datos) y `presentation` (HTTP). La dependencia apunta siempre hacia adentro.

**Puerto** — Interfaz que define lo que un módulo necesita del exterior. Por ejemplo, `ISaleRepository` declara las operaciones de persistencia; el repositorio de Drizzle las implementa y el servicio la recibe por parámetro.

**Borrado lógico** — Marcar un registro como eliminado escribiendo la fecha en `deleted_at` en lugar de quitar la fila. Ningún registro de este proyecto se elimina físicamente.

**Compilación estática** — Modalidad de Astro en la que el sitio se genera una vez como archivos HTML. El proyecto no tiene servidor de render: cada pantalla pide sus datos a la API cuando se abre en el navegador.

**Token de diseño** — Variable CSS con un valor de diseño definido una sola vez. Toda la interfaz usa los tokens de `modules/frontend/02-design.md`.

**Minimal light** — Estilo visual elegido para el panel: fondos casi blancos, mucho espacio en blanco, tipografía editorial, bordes de un píxel y un único color de acento.
