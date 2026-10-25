# 08-donut-chart

## Estado Actual
Proyecto nuevo, no hay código. El componente DonutChart.astro aún no ha sido creado.

## Objetivo
Componente DonutChart.astro (isla: client:load) con Chart.js Doughnut resumen por canal.

## Alcance
- [x] DonutChart.astro con canvas y configuración Chart.js doughnut
- [x] Props: labels, data, colors, options
- [x] Tooltips con formato $ dinero

## Tareas
- [x] 1. Crear src/components/DonutChart.astro con isla client:load
    - Detalle: Usar el patrón del markdown: canvas id="donut-chart", import Chart from 'chart.js/auto', new Chart(ctx, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors }], options: { responsive: true, plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index' } } } }). Hecho.
- [x] 2. Implementar props: labels (categorías), data (valores), colors (colores hex)
- [x] 3. Implementar tooltips con formato $ (formatMoney)
- [x] 4. Integrar en Home/Dashboard con datos simulados useChartData()

## Criterios de Done
- [x] DonutChart.astro renderiza sin errores
- [x] Chart.js doughnut renderiza con los datos provistos
- [x] Tooltips muestran $formato correcto
- [x] responsive: se adapta al width del contenedor
- [x] Importa lucide-astro o usa iconos inline para legend