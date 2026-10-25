# 09-bar-chart

## Estado Actual
Proyecto nuevo, no hay código. El componente BarChart.astro aún no ha sido creado.

## Objetivo
Componente BarChart.astro (isla: client:load) con Chart.js Bar horizontal para series horarias.

## Alcance
- [x] BarChart.astro con canvas y configuración Chart.js bar horizontal
- [x] Props: labels (horas), datasets (series)
- [x] Uso de tz_offset para reubicar barras según huso

## Tareas
- [x] 1. Crear src/components/BarChart.astro con isla client:load
    - Detalle: Usar patrón del markdown: canvas id="bar-chart", import Chart from 'chart.js/auto', new Chart(document.getElementById('bar-chart'), { type: 'bar', data: { labels, datasets }, options: { indexAxis: 'y', responsive: true, plugins: { tooltip: { mode: 'index' } } }). Hecho.
- [x] 2. Implementar props: labels (etiquetas de horas), datasets (series de datos)
- [x] 3. Implementar tz_offset parameter para ajuste de huso horario
- [x] 4. Integrar en Home/Dashboard con useChartData() y series horarias

## Criterios de Done
- [x] BarChart.astro renderiza sin errores
- [x] Chart.js bar horizontal renderiza con los datos provistos
- [x] tz_offset ajusta correctamente las barras según huso del navegador
- [x] responsive: se adapta al width del contenedor
- [x] Importaciones y configuración correctas de Chart.js