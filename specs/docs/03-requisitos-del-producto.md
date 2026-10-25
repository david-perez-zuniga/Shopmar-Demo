# 03-requisitos-del-producto.md

## Introducción

ShopMar Demo — Frontend (Astro) es una réplica idéntica del frontend en **Astro + TypeScript** (sin backend, datos simulados). Este proyecto documenta todo lo necesario para recrear la interfaz, lógicas y pantallas idénticas al proyecto original ShopMar (Astro + TS). A diferencia de la versión React, aquí usamos el modelo de páginas de Astro, isla hydration y utilidades nativas.

**¿Qué resuelve?** Permite validar el flujo completo de ventas, filtros, gráficos y navegación idéntico al ShopMar original, aprovechando las ventajas de Astro: HTML mínimo por defecto (mejor SEO y Lighthouse score), islands de interactividad bajo demanda y build optimizado. Los datos son simulados y persisten solo en memoria del navegador.

## Visión General del Sistema

1. **Etapas del ciclo de vida del sistema** (de punta a punta):
   - 1. Acceso al sistema: login con credenciales o acceso directo en demo
   - 2. Navegación: sidebar desktop, bottom nav mobile, top bar con CTA
   - 3. Filtrado: filtros fecha, canal, estado en tabla ledger
   - 4. Visualización: KPIs, donut chart, bar chart series horarias
   - 5. Interacción: formulario venta nueva, cambio de estado, modales
   - 6. Impresión: factura print con estilos @media print
   - 7. Tema: modo claro/oscuro persistente en localStorage
   - 8. PWA: manifest y service worker básicos
   - 9. Offline: página mostrada cuando SW detecta sin conexión
   - 10. Cierre: navegación a cualquier ruta del sistema

2. **Roles** | **Qué puede hacer**
   - **Visitante**: Ver home/login, acceder a demo limitada
   - **Usuario logged in**: Acceder a todas las funcionalidades, crear/filtrar/ver ventas, cambiar estado, ver detalles e imprimir facturas
   - **Administrador**: Mismo acceso de usuario + gestión de paquetes, gastos, clientes

## Cómo está organizado el sistema

- **Arquitectura Astro**: File-system routing (`src/pages/`), islas `client:load`/`client:visible`, navegación `@astrojs/navigation`
- **Capa de presentación** (`src/components/`): `.astro` islands con mínima interactividad, `client:load` solo donde necesario
- **Capa de lógica** (`src/lib/`): hooks personalizados, mock API, utilidades de formateo, pager, filtro
- **Capa de estilos** (`src/styles/`): variables CSS tokens, global.css con variables, componentes `.astro` con estilos
- **Capa de navegación** (`src/layouts/`): `Layout.astro` con sidebar desktop, bottom nav mobile, top bar con CTA whatsapp/live
- **Estado global**: Persistencia en `localStorage` bajo key `shopmar-theme` para tema claro/oscuro; filtros y paginación en URL params

## Tecnologías Utilizadas

| Capa | Tecnología | Para qué se usa |
|---|---|---|
| **Frontend** | `Astro 7.x` | Framework de páginas con modelo de islas |
| | `TypeScript 5.x` | Tipos estáticos en todo el código |
| | `lucide-astro` | Iconos (reemplazo de @lucide/react) |
| | `Chart.js 4.x` | DonutChart y BarChart islands (`client:load`) |
| | `date-fns` | Formato de fechas y `todayLocal()` |
| | `decimal.js` | Cálculos monetarios precisos |
| **Estilado** | CSS variables | Tokens de diseño: colores, tipografía, espaciado, breakpoints |
| | `focus-visible` | Focus ring personalizado |
| | `reduced-motion` | Respetar configuración del sistema |
| **Herramientas** | `Vitest` | Tests de componentes y mocks |
| | `@astrojs/check` | Type checking de Astro |
| | `ESLint` | Lint y formateo |
| | `Prettier` | Formateo de código |

## Base de Datos

**Fuera de alcance**: Este proyecto no tiene base de datos real ni backend. Todos los datos son simulados en memoria del navegador y se pierden al recargar.

Algunas reglas importantes (aunque sea demo):
- Los timestamps usan `Date.now()` o fechas fijas para simular datos históricos
- El formato monetario usa `formatMoney()` con 2 decimales precisos
- Los filtros y paginación se conservan en URL params o `localStorage`
- El `tz_offset` se lee de `navigator.userTimeOffset` o fija `-360` (Nicaragua) para series horarias

## Módulos Principales del Sistema

1. **Home / Dashboard**: Visión general con KPIs (total, pending, completed, cancelados), donut chart resumen por canal (WhatsApp→Tienda, Live), bar chart series horarias, filtros y tabla ledger paginada.
2. **Listado de ventas**: Tabla con 10 filas por página, filtros fecha/canal/estado, KPIs abajo, charts idénticos abajo, paginación numeración inferior.
3. **Formulario nueva venta**: Two paths — Live (cliente, producto, fecha, costo, método pago, tarjeta→banco, categorías) y WhatsApp (misma estructura, CTA "Venta en tienda" visual, identifier interno `type: "whatsapp"`).
4. **Detalle / Factura**: Resumen de factura, renglones, total, botón pagar, botón imprimir, botón cambiar estado.
5. **Listado de paquetes**: Estructura similar a ventas con filtros y paginación.
6. **Listado de gastos**: Tabla con gastos, categorías, montos, fechas, filtros.
7. **Listado de clientes**: Tabla con nombres, contacto, ventas asociadas, filtros.
8. **Login**: Campos email/password, persistencia sesión en localStorage.
9. **Tema claro/oscuro**: Persistencia en localStorage key `shopmar-theme`, reflejo en `data-theme` de `<html>`, toggle sol/luna.
10. **PWA**: `public/manifest.json` con icons 512x512, short_name `ShopMar`, theme_color, background_color. Service Worker con `workbox` para offline y `beforeinstallpromptevent` para banner de instalación.

## Pantallas Principales

### Zona Pública

- **Home/Dashboard** (`/`): KPIs, filtros, donut chart, bar chart, tabla ledger, pager
- **Sales list** (`/sales`): Tabla ledger, filtros idénticos, KPIs abajo, charts abajo, paginación
- **Sales new** (`/sales/new?type=whatsapp|live`): Formulario con validaciones, categorías, adicionales, registro
- **Sales detail** (`/sales/detail/[id]`): Factura completa, renglones, botones pagar/imprimir/cambiar estado
- **Packages list** (`/packages`): Tabla con datos de paquetes, filtros, paginación
- **Expenses list** (`/expenses`): Tabla con gastos, categorías, montos, fechas
- **Customers list** (`/customers`): Tabla con nombres, contacto, ventas asociadas
- **Login** (`/login`): email, password, botón Ingresar, sesión en localStorage
- **Offline** (`/offline`): Mostrada cuando SW detecta sin conexión
- **404** (`/404`): Ruta no encontrada

### Zona Autenticación

- **Login** (`/login`): Acceso al sistema, persistencia sesión

### Panel (mismo flujo que zona pública, pero con sesión activa)

- Todas las rutas listadas arriba están disponibles cuando el usuario tiene sesión activa

## Autenticación y Seguridad

- **Mecanismo de sesión**: Persistencia en `localStorage` bajo key de sesión. En demo, no hay auth real — el login es un acceso directo al modo usuario.
- **Roles y permisos**: Usuario logged in tiene acceso a todas las funcionalidades. Sin roles diferenciados en la demo.
- **Medidas de seguridad**: 
  - Contraseñas simuladas (sin hash, solo validación en frontend)
  - Sesión expira al cerrar navegador (localStorage se limpia)
  - No hay rate limiting ni CORS en modo demo
  - Los datos son públicos simulados, no hay datos sensibles reales

## Servicios Externos

| Servicio | Propósito | Protocolo | Autenticación |
|---|---|---|---|
| **Ninguno** | — | — | — |

Este proyecto no tiene servicios externos reales. Todos los datos viven en mock API locales (`src/lib/api-mock.ts`).

## Flujos Principales del Sistema

1. **Flujo de filtrado**: El usuario establece filtros (fecha, canal, estado) → se modifica `window.location.search` → `rehydrateOnPageshow` hidrata controles → tabla y charts se actualizan con datos filtrados.
2. **Flujo de nueva venta**: Usuario CTA "Venta en tienda" o "Venta por Live" → `/sales/new?type=whatsapp|live` → formulario con campos según tipo → validaciones → `salesApi.createLive(data)` o `createWhatsApp(data)` → `navigateTo('/sales')` → tabla y charts se actualizan.
3. **Flujo de cambio de estado**: Usuario selecciona nuevo estado en fila tabla → `askConfirm` modal → `salesApi.updateStatus(sale.id, next, answer.amountPaid)` → toast "Venta actualizada a {next}." → fila se actualiza con nuevo valor.
4. **Flujo de impresión**: Usuario click "Imprimir" en fila o detalle → `window.print()` → estilos `@media print` muestran layout de factura → navegador imprime.
5. **Flujo de tema**: Usuario click toggle sol/luna → `data-theme` en `<html>` cambia → `localStorage.tema` se actualiza → persiste entre recargas → `prefers-color-scheme` como fallback del sistema.
6. **Flujo de PWA install**: Usuario click "Instalar app" → dispatch `beforeinstallpromptevent` → `e.target.prompt()` muestra diálogo nativo del navegador → si el usuario acepta, app se instala; si cancela, opcional reintentar con `setTimeout` + `dispatchEvent(new Event('beforeinstallprompt'))`.

## Casos de Uso por Tipo de Usuario

- **Visitante**: Accede a `/`, ve home con datos simulados, puede navegar rutas públicas.
- **Usuario logged in**: Accede a todas las rutas (`/`, `/sales`, `/sales/new`, etc.), crea ventas, filtra, cambia estado, ve detalles, imprime, cambia tema.
- **Usuario sin sesión**: Redirigido o acceso directo a `/login`, después de login accede a todas las rutas.

## Resumen General del Sistema

| Aspecto | Detalle |
|---|---|
| **Módulos** | 10 (home, sales list, sales new, sales detail, packages, expenses, customers, login, offline, 404) |
| **Pantallas** | 10 principales + estados loading/empty/error |
| **Endpoints** | Mock API: createLive, createWhatsApp, updateStatus, getSales, getFilters (simulados) |
| **Entidades/Íconos** | lucide-avatar: ShoppingCart, Bag, Check, X, Clock, Video, etc. |
| **Tecnologías clave** | Astro 7.x, TypeScript 5.x, Chart.js 4.x, lucide-astro, date-fns, decimal.js |
| **Modo oscuro** | Persistencia localStorage key `shopmar-theme`, toggle en Nav, prefers-color-scheme fallback |
| **PWA** | manifest.json, service worker workbox, beforeinstallpromptevent banner |
| **Responsive** | Mobile (bottom nav), tablet (sidebar colapsado a íconos), desktop (sidebar visible, grid 12 cols) |
| **Accesibilidad** | aria-labels, focus-visible, contraste WCAG AA, reduced-motion, skip-links |
| **Tests** | Vitest + Testing Library, mínimo 50 tests clave mirror al proyecto original |
| **Build** | `pnpm build` → 11 páginas estáticas generadas, sin JS en HTML por defecto |