# frontend

Es el cliente web de ShopMar Demo, construido con **Astro 7.x + TypeScript**. Gestiona la interfaz de usuario, navegación, componentes de isla (`client:load`/`client:visible`) y visualización de datos simulados.

No hay backend real ni base de datos: todos los datos viven en memoria del navegador y se pierden al recargar.

## Rutas principales

- `/` — Home / Dashboard
- `/sales` — Listado de ventas
- `/sales/new` — Formulario nueva venta
- `/sales/detail/[id]` — Detalle / Factura
- `/packages` — Listado de paquetes
- `/expenses` — Listado de gastos
- `/expenses/new` — Formulario nuevo gasto
- `/customers` — Listado de clientes
- `/login` — Login
- `/offline` — Página offline
- `/404` — Página no encontrada