# Descripción del proyecto

## Qué es

`shpr` es una plataforma web de gestión para una tienda de ropa de segunda mano (paca). Es una aplicación full stack: una API REST sobre Node.js y Fastify que expone veintiún endpoints de negocio repartidos en cuatro módulos —dashboard, ventas, clientes y gastos—, un frontend Astro 7 de compilación estática que consume esa API desde el navegador, y PostgreSQL como almacenamiento persistente a través del ORM Drizzle.

El sistema existe para reemplazar las planillas de cálculo con las que la dueña de la tienda registra hoy su operación diaria. Cubre cuatro hechos de negocio: las ventas de mostrador, las ventas coordinadas por WhatsApp que pueden incluir artículos adicionales, la salida de paquetes hacia el cliente y los gastos del día.

## Para quién

| Actor | Descripción | Interacción con el sistema |
|-------|-------------|----------------------------|
| Dueña de la tienda | Única persona usuaria. Opera el negocio en un entorno privado y controlado. | Única persona que entra al panel. Crea ventas, registra paquetes, carga gastos y consulta indicadores. |
| Cliente final de la tienda | Comprador en mostrador o por WhatsApp. | No interactúa con el sistema. Aparece como texto en `sale.customer_name`. |
| Servicio de transporte | Transportista que retira un paquete. | No interactúa con el sistema. Aparece como texto en `package.name`. |

El panel se usa con una cuenta: hay **dos roles**, vendedor y administrador, y una sesión que solo termina al cerrar sesión (`modules/api/07-auth.md`, D-024). No hay registro público: las cuentas las crea un administrador o el comando `pnpm create-admin`. No hay otros actores.

## Problema que resuelve

1. **La información vive en planillas dispersas.** Hoy las ventas, los paquetes y los gastos se anotan en hojas separadas. No hay una fuente única ni forma de responder "¿cuánto vendí este mes?" sin consolidar archivos a mano.
2. **Los errores de cálculo son silenciosos.** Sumar a mano el costo de una venta más sus artículos adicionales produce totales equivocados sin que nada avise.
3. **No hay historial confiable de estados.** Una venta cobrada, pendiente o cancelada no tiene un estado registrado que permita saber qué pasó.
4. **No se puede eliminar sin miedo.** Un error de tipeo en una planilla obliga a borrar la fila, y con ella se pierde la trazabilidad.

## Funcionalidades principales

1. **Dashboard de indicadores** — total de ingresos, cantidad de ventas, paquetes pendientes y total de gastos, filtrables por rango de fechas.
2. **Registro de venta en mostrador** (`live`) — cliente, mercadería como texto libre, forma de pago, banco cuando es tarjeta, fecha, estado e importe.
3. **Registro de venta por WhatsApp** (`whatsapp`) — los mismos campos más una lista dinámica de artículos adicionales con nombre, descripción, cantidad e importe.
4. **Listado consolidado de ventas** — una sola tabla con canal, estado y total, e impresión de factura por venta.
5. **Detalle de venta** — datos completos, artículos adicionales y paquetes vinculados.
6. **Cambio de estado de venta** — transición entre `pending`, `completed` y `cancelled`.
7. **Gestión de paquetes** — alta, listado con filtros, edición y borrado lógico de paquetes retirados, con enlace opcional a la venta de origen.
8. **Gestión de gastos** — alta y listado de gastos diarios con borrado lógico.
9. **Cálculo de totales sin errores** — el total de cada venta se deriva en el servidor como `cost + suma de adicionales`, sin almacenar un valor que pueda quedar desactualizado.

## Fuera de alcance

- Registro público, recuperación de contraseña, permisos por pantalla más allá de los dos roles, ni sesiones por dispositivo.
- Catálogo de productos, códigos de barras, precios de lista, control de stock o inventario.
- Integraciones con servicios de terceros: pagos en línea, facturación electrónica, mensajería, correo, analítica.
- Multi-tenant, múltiples sucursales o más de un usuario simultáneo.
- Reportes descargables, exportaciones a Excel o CSV, gráficos de evolución temporal.
- Aplicación móvil nativa.
- Paginación en los listados, salvo la de `GET /api/v1/sales`, que es opcional y del lado del servidor (decisiones D-006 y D-011, registradas en `05-requisitos-no-funcionales.md`).
- Modo oscuro en la interfaz.
