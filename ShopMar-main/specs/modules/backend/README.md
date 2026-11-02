# Módulo Backend

Servidor HTTP del proyecto. Expone los veintiún endpoints de negocio bajo el prefijo `/api/v1`, valida toda entrada con Zod, aplica las reglas de negocio en una capa de aplicación que no depende del framework y persiste en PostgreSQL a través de repositorios de Drizzle inyectados por parámetro.

## Archivos

| Archivo | Contenido |
|---------|-----------|
| `01-stack.md` | Lenguaje, runtime, framework, versiones declaradas en `package.json` y plugins ya registrados. |
| `02-architecture.md` | Capas, estructura de carpetas de un módulo, flujo de una petición, patrones en uso. |
| `03-api.md` | Notas de implementación de cada endpoint: qué módulo lo sirve, qué DTO valida qué, qué método de servicio atiende. |
| `04-security.md` | Ausencia de autenticación, controles compensatorios, validación de entrada, CORS, rate limiting, secretos. |
| `05-testing.md` | Vitest, qué se prueba y qué no, cobertura objetivo, comandos reales. |
| `06-configuracion.md` | Tabla de variables de entorno, archivos de configuración, gestión de secretos. |

## Módulos de dominio

El backend se organiza en cuatro módulos, uno por área funcional. Todos comparten exactamente el mismo esqueleto.

| Módulo | Responsabilidad | Prefijo de rutas |
|--------|-----------------|------------------|
| `dashboard` | Agregaciones del período: resumen, KPIs de paquetes, serie diaria y desgloses por canal y por envío. | `/api/v1/dashboard` |
| `sales` | Alta de ventas `live` y `whatsapp`, listado consolidado con filtros, detalle, cambio de estado, cambio de método de envío y libro de pagos de la venta a crédito. | `/api/v1/sales` |
| `customers` | Alta, listado con búsqueda y saldos, edición parcial y borrado lógico de clientes registrados. | `/api/v1/customers` |
| `expenses` | Alta, listado y borrado lógico de gastos diarios. | `/api/v1/expenses` |

Cada módulo vive en `backend/src/modules/<nombre>/` con esta estructura:

```
backend/src/modules/sales/
├── domain/
│   ├── sales.entities.ts       # ISaleEntity, IAdditionalSaleEntity, CreateSaleData
│   ├── sales.interface.ts       # ISaleRepository, IListSalesParams
│   └── sales.types.ts           # ISaleResponse, ISaleListRowResponse, ISaleDetailResponse
├── application/
│   ├── sales.service.ts         # createSaleService(repository)
│   └── common/
│       └── sales.mappers.ts     # mapSaleToResponse, mapSaleListRow, withComputedTotal
├── infrastructure/
│   └── sale.drizzle.repository.ts
├── presentation/
│   ├── sales.routes.ts
│   ├── sales.controller.ts
│   └── sales.dto.ts
└── _tests_/
    └── application/
        └── sales.service.test.ts
```

## Inventario de endpoints

Veintiún endpoints, sin autenticación, todos bajo `/api/v1`. El contrato completo, con cuerpos y respuestas de ejemplo, está en `modules/api/`. Aquí solo el índice:

| Método | Ruta | Atiende |
|--------|------|---------|
| `GET` | `/api/v1/dashboard/summary` | `GET /api/v1/dashboard/summary` |
| `GET` | `/api/v1/dashboard/packages/kpis` | `GET /api/v1/dashboard/packages/kpis` |
| `GET` | `/api/v1/dashboard/daily-series` | `GET /api/v1/dashboard/daily-series` |
| `GET` | `/api/v1/dashboard/by-channel` | `GET /api/v1/dashboard/by-channel` |
| `GET` | `/api/v1/dashboard/by-shipment` | `GET /api/v1/dashboard/by-shipment` |
| `POST` | `/api/v1/sales/live` | `POST /api/v1/sales/live` |
| `POST` | `/api/v1/sales/whatsapp` | `POST /api/v1/sales/whatsapp` |
| `GET` | `/api/v1/sales` | `GET /api/v1/sales` |
| `GET` | `/api/v1/sales/with-details` | `GET /api/v1/sales/with-details` |
| `GET` | `/api/v1/sales/:id` | `GET /api/v1/sales/:id` |
| `PATCH` | `/api/v1/sales/:id/status` | `PATCH /api/v1/sales/:id/status` |
| `PATCH` | `/api/v1/sales/:id/shipment-method` | `PATCH /api/v1/sales/:id/shipment-method` |
| `POST` | `/api/v1/sales/:id/payments` | `POST /api/v1/sales/:id/payments` |
| `DELETE` | `/api/v1/sales/:id/payments/:paymentId` | `DELETE /api/v1/sales/:id/payments/:paymentId` |
| `POST` | `/api/v1/customers` | `POST /api/v1/customers` |
| `GET` | `/api/v1/customers` | `GET /api/v1/customers` |
| `PATCH` | `/api/v1/customers/:id` | `PATCH /api/v1/customers/:id` |
| `DELETE` | `/api/v1/customers/:id` | `DELETE /api/v1/customers/:id` |
| `POST` | `/api/v1/expenses` | `POST /api/v1/expenses` |
| `GET` | `/api/v1/expenses` | `GET /api/v1/expenses` |
| `DELETE` | `/api/v1/expenses/:id` | `DELETE /api/v1/expenses/:id` |

**No hay `/api/v1/packages`.** El módulo `packages` que documentaban las versiones anteriores de estas specs no existe en el código: no hay rutas, no hay tabla y no se registra en `src/app.ts`.

## Sin integraciones externas

Este proyecto **no tiene integraciones con servicios de terceros**. No hay pasarela de pagos, ni proveedor de correo, ni servicio de mensajería, ni analítica, ni almacenamiento en la nube, ni generación de PDF, ni webhooks entrantes. El backend solo habla con PostgreSQL, que corre en el mismo host, y expone HTTP hacia el navegador del panel administrativo. Por esa razón este módulo **no tiene el archivo `07-integraciones.md`** que la plantilla de especificaciones reserva para los proyectos con dependencias externas.

Consecuencia práctica: no hay clientes HTTP salientes, ni reintentos, ni circuit breakers, ni credenciales de terceros, ni colas de mensajes. Agregar la primera integración es una decisión futura que requerirá su propio archivo de especificación y, muy probablemente, un módulo nuevo con su propio puerto de salida.

## Estado actual del código

El repositorio contiene los cuatro módulos de dominio de esta especificación: `dashboard`, `sales`, `customers` y `expenses`, registrados en `src/app.ts` bajo `/api/v1`. El andamiaje de `fwinit` —`auth`, `users`, `roles`, `products`, `services` e `inventory`— se retiró completo, y con él las tres dependencias que solo existían para eso.
