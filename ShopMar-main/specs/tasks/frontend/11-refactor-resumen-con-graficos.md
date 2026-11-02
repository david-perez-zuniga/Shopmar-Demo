# 11 — Refactor del módulo Resumen con gráficos

## Corrección: los gráficos no usan los componentes (2026-10-14)

Este documento describe el plan original y su historia; se conserva tal cual
porque registra lo que se pensó. Pero **la implementación final divergió** y hay
que leerla con esta corrección delante:

- La pantalla Resumen (`frontend/src/pages/index.astro`) **no importa `BarChart`
  ni `DonutChart`**. Renderiza sus gráficos a través de
  `frontend/src/lib/bar-chart.ts` y `frontend/src/lib/donut-chart.ts`, con el
  clamp del tooltip en `frontend/src/lib/chart-tooltip.ts` y los tokens de color
  en `frontend/src/lib/chart-colors.ts`. Cada módulo separa el layout puro
  (`layoutBarChart` / `layoutDonut`, sin DOM) de la única capa que escribe el
  contenedor (`renderBarChart` / `renderDonutChart`).
- Los componentes `frontend/src/components/BarChart.astro` y
  `frontend/src/components/DonutChart.astro` existen, pero **no los importa
  nadie**: son código muerto preexistente, no parte de este refactor. Se
  decidió explícitamente **dejarlos intactos** y no migrarlos.
- Esos dos componentes contradicen la regla D-003: tipan los importes como
  `number` y usan `formatMoney`, mientras la API manda `IMoney = string`. La
  inconsistencia queda registrada aquí como deuda conocida; los módulos
  extraídos formatean con `Intl.NumberFormat("es-NI", { currency: "NIO" })`
  —no con `formatMoney`— para que la salida fuera byte a byte idéntica a la
  implementación previa.

Por lo tanto, las menciones del plan a “componentes nuevos” y a importar
`BarChart`/`DonutChart` en `index.astro` (tareas 1 a 3) no describen el estado
real del código. Los fixtures congelados en `frontend/src/lib/fixtures/` son el
contrato vigente de los gráficos.

## Estado Actual

El módulo Resumen (`/`) muestra solo cuatro tarjetas KPI (ingresos, ventas, gastos, paquetes pendientes) y un filtro de fechas (`DateRangeFilter`). No hay visualizaciones gráficas. El HTML actual está en `frontend/src/pages/index.astro` y usa componentes `StatCard`, `DateRangeFilter` y el `Layout` compartido.

## Objetivo

Refactorizar el módulo Resumen para incluir tres gráficos basados en el diseño provisto (HTML + Tailwind), migrando a la stack del proyecto: **Astro + CSS propio con tokens M3**, sin Tailwind, sin Google Fonts, usando **lucide-astro** para iconos. Los gráficos deben ser SVG responsivos, accesibles y funcionar en modo claro/oscuro.

## Alcance

- **Pantalla**: `/` (`frontend/src/pages/index.astro`)
- **Componentes nuevos**:
  - `BarChart.astro` — barras agrupadas ingresos/gastos por día
  - `DonutChart.astro` — donut configurable (2 o 3 segmentos) con leyenda
- **Endpoint de datos**: `GET /api/dashboard/summary?start_date&end_date` (ya existe) — devuelve series diarias y agregados por canal/envío.
- **Estilos**: reutilizar tokens `--m3-*` y `--bg-*`, `--text-*`, `--primary`, `--tertiary`, `--secondary`, `--error`, `--success`. Sin colores hardcodeados.
- **Iconos**: lucide-astro (`TrendingUp`, `Receipt`, `Wallet`, `Package`, `Calendar`, `Filter`, `BarChart`, `PieChart`, `Truck`, `Bike`, `Store`).
- **Accesibilidad**: `role="img" aria-label`, texto alternativo, contraste AA, `prefers-reduced-motion`.
- **Responsive**: en móvil, gráficos apilados; en desktop, grid 2/1 y 1/1 según diseño.

## Fuera de alcance

- Cambiar API o contrato de datos.
- Añadir animaciones complejas (solo transiciones sutiles de opacidad en hover).
- Gráficos con librerías externas (Chart.js, etc.) — solo SVG inline.

## Tareas

1. [x] **Crear componente `BarChart.astro`**
   - Props: `data: { label: string; income: number; expense: number }[]`, `maxValue?: number`
   - SVG con `viewBox` responsivo, ejes Y con escala automática, barras agrupadas (ingresos primario, gastos secondary-fixed-dim), tooltip en hover (solo desktop), etiquetas X.
   - Clases CSS en `frontend/src/components/BarChart.astro` + estilos en `frontend/src/styles/charts.css` (nuevo) o inline en componente.

2. [x] **Crear componente `DonutChart.astro`**
   - Props: `segments: { label: string; value: number; colorToken: string }[]`, `totalLabel: string`, `totalValue: string`, `size?: number` (default 176)
   - SVG con `stroke-dasharray`/`stroke-dashoffset` por segmento, centro con total, leyenda lateral (label, %, valor formateado).
   - Reutilizable para 2 segmentos (canal) y 3 segmentos (envío).

3. [x] **Actualizar `index.astro` (Resumen)**
   - Importar `BarChart`, `DonutChart`.
   - Fetch en script: `GET /api/dashboard/summary?start_date=...&end_date=...` → recibe `{ daily: [], byChannel: [], byShipment: [] }`.
   - Renderizar grid:
     - Fila 1: `BarChart` (col-span-2 en lg) + espacio reservado para futuro gráfico B.
     - Fila 2: 2 columnas: `DonutChart` (canal: WhatsApp/Live) y `DonutChart` (envío: Cargotrans/Delivery/Pickup).
   - Mantener `DateRangeFilter` y 4 `StatCard` arriba.
   - Loading state: `aria-busy` + skeletons en gráficos.

4. [x] **Estilos globales de gráficos**
   - Crear `frontend/src/styles/charts.css` con tokens para ejes, guías, tooltips, leyendas.
   - Importar en `Layout.astro` o `index.astro`.

5. [x] **Verificación**
   - `pnpm astro check` → 0 errores.
   - `pnpm vitest run` → tests verdes.
   - Build OK.
   - Probar modo claro/oscuro: colores de tokens responden a `[data-theme]`.

## Criterios de aceptación

- [ ] Resumen muestra 4 KPIs + 3 gráficos (barra + 2 donuts).
- [ ] Gráficos usan tokens M3 (`--m3-primary`, `--m3-secondary`, `--m3-tertiary`, `--m3-error`, etc.) y cambian con tema.
- [ ] SVG responsivo (ancho 100%, altura fija o aspect-ratio).
- [ ] Tooltip en barras (desktop) y centro donut con total.
- [ ] Leyendas con color, label, % y valor formateado en C$.
- [ ] Sin Tailwind, sin Google Fonts, iconos lucide-astro.
- [ ] Tests y build pasan.
