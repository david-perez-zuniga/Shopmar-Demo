# Módulo Frontend — Panel administrativo estático

`shpr` se opera desde un panel interno de pantallas estáticas, compilado con Astro 7 y servido como archivos. No hay servidor de render, no hay framework de interfaz, no hay biblioteca de estado. Cada pantalla pide sus datos a la API desde el navegador cuando se abre, con una caché en memoria de la pestaña (D-020).

## Archivos

| Documento | Contenido |
|-----------|-----------|
| [`01-arquitectura.md`](01-arquitectura.md) | Stack y versiones, el mapa de rutas, por qué cada formulario tiene la suya, la capa `lib/`, el flujo de datos en el navegador y por qué no hay estado global. |
| [`02-design.md`](02-design.md) | Sistema de diseño Minimal Light: tokens, tipografía, color, bordes, movimiento, reglas de impresión de la factura. |
| [`03-componentes.md`](03-componentes.md) | Los componentes `.astro` compartidos, sus props, y las cuatro primitivas de CSS reutilizadas. |
| [`04-screens.md`](04-screens.md) | Las ocho pantallas, campo por campo, con su estado de carga, vacío y error. |
| [`05-estilado.md`](05-estilado.md) | La hoja de estilos global, el orden de las reglas, el CSS por pantalla y la relación entre tokens y utilidades. |
| [`06-testing.md`](06-testing.md) | Qué se prueba en el frontend, con qué herramientas, y qué queda fuera. |
| [`07-briefs-de-diseno.md`](07-briefs-de-diseno.md) | Qué hay que **dibujar** en cada módulo, para producir su diseño visual y traducirlo a tokens. Complementa a `04-screens.md`, no lo reemplaza. |
| [`08-pwa.md`](08-pwa.md) | La propuesta para instalar el panel como aplicación: manifiesto, service worker, estrategias de caché, instalación, actualización y los límites que impone el contexto seguro. |
| [`09-auth.md`](09-auth.md) | La sesión en el navegador: la vista `/login`, el guard del router, la caché del `me`, el logout, la regla «un `401` borra la sesión local; un error de red no» y qué ve cada rol (D-024). |

## Decisiones que gobiernan este módulo

| Decisión | Efecto en el frontend |
|----------|-----------------------|
| D-005 — Compilación estática | `astro build` produce `dist/`. Cada pantalla pide sus datos a la API en tiempo de ejecución. |
| D-006 — Sin paginación | Sólo `/expenses` no tiene controles de página en la API: el conjunto completo viaja en cada respuesta. |
| D-011 — Paginación opcional de ventas | `/packages` (y `/sales` cuando lo necesite) pide `page` y `per_page` a `GET /sales` y usa el `total` de la respuesta para el paginador. |
| D-012 — Filas y KPIs en una sola llamada | `/packages` pide `include_kpis=true` y pinta las tarjetas con el `kpis` de la misma respuesta: una llamada por carga. |
| D-013 — Paginar sin recargar | El paginador, el tamaño de página y los filtros de `/packages` usan la History API y repintan la lista sin reconstruir el documento. |
| D-008 — Agregaciones sin filtro de estado | Las cuatro tarjetas del dashboard no ofrecen un selector de estado. |
| D-009 — Factura como estado de impresión | No hay ruta `/sales/invoice`. La factura se renderiza dentro del detalle (`/sales/detail`, D-017). |
| D-002 — Mercadería de texto libre | No hay pantallas de catálogo, de productos, de stock ni de servicios. |
| D-001 — Sin autenticación | **Superada por D-024.** No hay login, ni sesión, ni guardas de ruta, ni redirección por credenciales: el panel es público dentro de la red privada. |
| D-024 — Autenticación con sesión | Hay `/login`, guard del router y caché del `me`. Un `401` borra la sesión local y lleva a `/login`; un error de red **no**. El rol decide qué se pinta y el servidor lo exige igual. Ver `09-auth.md`. |

## Inventario de lo que se elimina del andamiaje

El andamiaje de `fwinit` dejó una landing de siete secciones y ninguna herramienta de panel. Todo eso sale:

| Archivo del andamiaje | Motivo |
|------------------------|--------|
| `src/sections/Hero.astro` | Contenido de landing, no de panel. |
| `src/sections/Features.astro` | Ídem. |
| `src/sections/HowItWorks.astro` | Ídem. |
| `src/sections/DesignSkills.astro` | Ídem. |
| `src/sections/CTA.astro` | Ídem. |
| `src/sections/Footer.astro` | Un panel interno no lleva pie de página promocional. |
| `src/sections/Header.astro` | Se reemplaza por una barra de navegación con el logo y las secciones reales. |
| `src/pages/index.astro` | Se conserva como el dashboard (`/`); `/summary` queda como stub que redirige a `/`. |
| `src/layouts/Layout.astro` | Se conserva la idea del layout, se reemplaza el contenido. |

## Inventario de lo que se agrega

| Ruta | Archivo | Qué es |
|------|---------|--------|
| `/` | `src/pages/index.astro` | El dashboard: los cuatro indicadores del resumen. Es la pantalla de entrada. |
| `/login` | `src/pages/login.astro` | Inicio de sesión. **Documento propio fuera del armazón**, porque el panel todavía no se abrió (D-024, `09-auth.md`). |
| `/summary` | `src/pages/summary.astro` | Stub de compatibilidad: redirige a `/`. No es una pantalla. |
| `/sales` | `src/pages/sales/index.astro` | Listado de ventas, filtro, cambio de estado en línea, enlace al detalle. |
| `/sales/detail?id=<uuid>` | `src/pages/sales/detail.astro` | Detalle de venta en el cliente: la factura imprimible, llenada por ganchos `data-invoice-*` (D-017 y D-009 en su letra). |
| `/sales/new` | `src/pages/sales/new.astro` | Formulario de venta. El `type` viene en el query. |
| `/packages` | `src/pages/packages/index.astro` | Listado de paquetes con filtro de método. |
| `/packages/new` | `src/pages/packages/new.astro` | Formulario de alta de paquete. **Pendiente:** se crea en `tasks/frontend/06-pantalla-de-paquetes.md`. |
| `/expenses` | `src/pages/expenses/index.astro` | Listado de gastos con filtro de fechas. |
| `/expenses/new` | `src/pages/expenses/new.astro` | Formulario de alta de gasto. |

Y las cuatro piezas de `src/lib/core/`: `api.ts`, `format.ts`, `types.ts` y `dom.ts`. Ninguna es un framework: son funciones puras y una capa de fetch.

## Contrato con la API

El frontend no conoce el ORM, ni SQL, ni el nombre de las tablas. Conoce veintiún endpoints de negocio, cuatro de acceso, seis tipos de respuesta y un sobre de error. Todo eso está en `modules/api/`, y las formas de TypeScript que lo reflejan están en `src/lib/core/types.ts`.

| Necesidad del frontend | Endpoint |
|------------------------|----------|
| Cuatro tarjetas del dashboard | `GET /api/v1/dashboard/summary` |
| Listado de ventas con total y conteo de artículos | `GET /api/v1/sales` |
| Detalle completo para la factura | `GET /api/v1/sales/:id` |
| Crear venta de mostrador o de WhatsApp | `POST /api/v1/sales/live` · `POST /api/v1/sales/whatsapp` |
| Cambiar el estado de una venta | `PATCH /api/v1/sales/:id/status` |
| Listado de paquetes | `GET /api/v1/packages` |
| Crear, editar y borrar paquetes | `POST` · `PUT` · `DELETE /api/v1/packages/:id` |
| Abrir la sesión del panel | `GET /api/v1/auth/me` |
| Iniciar y cerrar sesión | `POST /api/v1/auth/login` · `POST /api/v1/auth/logout` |
| Alta de usuarios (solo `admin`) | `POST /api/v1/users` |
| Listado de gastos | `GET /api/v1/expenses` |
| Crear y borrar gastos | `POST` · `DELETE /api/v1/expenses/:id` |

## Qué no existe en este módulo

| Lo que no existe | Razón |
|------------------|-------|
| `06-estado.md` | No hay estado global. No hay store, no hay `useState`, no hay contexto. La cadena de decisiones de la versión 1 no cubre este caso, y el manifiesto de archivos tampoco lo pide. Ver `01-arquitectura.md`. |
| Una librería de datos (TanStack Query, SWR) | La caché en memoria de `src/lib/core/cache.ts` (D-020) resuelve el caso real —no repetir el pedido ni la espera dentro de la pestaña— sin sumar un framework de estado. |
| Autenticación | Está en `09-auth.md`: `/login`, guard del router y caché del `me` (D-024). Lo que no existe es registro público, recuperación de contraseña y administración de usuarios en el panel. |
| Gráficos, series temporales, sparklines | El dashboard son cuatro cifras. Un gráfico exige una librería o varias centenas de líneas de SVG, y la dueña necesita el número, no la forma. |
| Modo oscuro | El sistema es claro de punta a punta. Un tema oscuro es un sistema de color completo, no un `invert`. |
| Pruebas de navegador end-to-end dentro de este paquete | El frontend tiene lógica de presentación, no lógica de negocio, y su presupuesto de dependencias es cero. Ver `06-testing.md`. La verificación de flujos completos existe pero corre **fuera** de este paquete, en el workspace `qa/` (decisión D-010, ver `modules/qa/`). |
| Internacionalización | El sistema tiene un solo idioma: español. Ver `format.ts` en `01-arquitectura.md`. |
