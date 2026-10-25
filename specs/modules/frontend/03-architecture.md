# 03-architecture.md

## Estructura de carpetas

```
src/
  assets/
  components/           ← todos los .astro + .ts de componentes
    Nav.astro, BottomNav.astro, StatCard.astro, ConfirmDialog.astro,
    StatusBadge.astro, SaleActions.astro, DateRangeFilter.astro,
    ThemeBoot.astro, DonutChart.astro, BarChart.astro, InvoicePrint.astro,
    SaleListRow.astro
  layouts/
    Layout.astro  ← layout principal con <svelte:head>, data-theme, nav
  pages/
    index.astro,           ← Home / Dashboard
    sales/index.astro,     ← Listado ventas
    sales/new.astro,       ← Form nueva venta
    sales/[id].astro,      ← Detalle / Factura (id dinámico)
    packages/index.astro,  ← Listado paquetes
    expenses/index.astro,  ← Listado gastos
    expenses/new.astro,    ← Form nuevo gasto
    customers/index.astro, ← Listado clientes
    login.astro,           ← Login
    offline.astro,         ← Página offline
    404.astro,             ← Página no encontrada
  lib/
    api-mock.ts,           ← mocks de servicios
    useChartData.ts,       ← hook que forma series con tz_offset
    utcOffsetMinutes.ts,   ← hook que devuelve offset navegador
    formatMoney.ts,        ← función formatMoney
    todayLocal.ts,         ← función todayLocal
    wireFilterSubmit.ts,   ← wireFilterSubmit adaptado a Astro
    createTablePager.ts,   ← createTablePager adaptado
    rehydrateOnPageshow.ts ← hidratación controles desde URL
    useTheme.ts,           ← hook tema claro/oscuro
    useUTCOffset.ts
  styles/
    global.css, forms.css, filters.css, skeleton.css, print.css
    variables.css  (tokens extraídos)
  types/
    index.d.ts  (ISaleEntity, ISaleListRow, DashboardQueryInput, etc.)
  hooks/
    useChartData.ts, useToggleTheme.ts, useConfirmDialog.ts
  contexts/
    ThemeContext.tsx  ← o usando solo localStorage sin contexto React
```
## Capas

1. **Capa de presentación** (`src/components/`): `.astro` islands + `.ts` helpers. Interacción mínima, `client:load`/`client:visible` solo donde necesario.
2. **Capa de lógica** (`src/lib/`): hooks personalizados, mock API, utilidades de formateo, pager, filtro.
3. **Capa de estilos** (`src/styles/`): variables CSS tokens, global.css con variables, componentes `.astro` con estilos inline o `class`.
4. **Capa de navegación** (`src/layouts/`): `Layout.astro` con sidebar desktop, bottom nav mobile, top bar con CTA whatsapp/live.

## Estado global

- **Tema claro/oscuro**: Persistencia en `localStorage` bajo key `shopmar-theme`. No se usa Context React — se lee directamente de `localStorage` en `ThemeBoot.astro` y `useTheme.ts`.
- **Filtros y paginación**: URL params (`window.location.search`) + `rehydrateOnPageshow` hidrata controles desde URL en `onMount`.

## Data fetching

- **Mock API** (`src/lib/api-mock.ts`): Todos los datos son simulados, viven en memoria del navegador.
- **Series horarias**: `useChartData()` hook con `tz_offset` parámetro. Datos estáticos con horas locales.
- **Filtros**: `wireFilterSubmit` modifica `window.location.search` en submit. `rehydrateOnPageshow` lee params y sets controles en `onMount`.

## Navegación

- **Astro file-system routing**: Cada pantalla tiene un `.astro` en `src/pages/`.
- **Navegación client-side**: `import { navigateTo } from '@astrojs/navigation'` para transiciones sin recarga.
- **Enlaces `<a href="/sales">`**: Funcionan sin JS; `<button onclick={navigateTo('/sales')}>` requiere JS.
- **Rutas con parámetros**: `/sales/detail/[id]` con `getStaticPaths` o `render` con `params.id`.