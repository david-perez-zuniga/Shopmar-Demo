# 04-date-range-filter

## Estado Actual
Proyecto nuevo, no hay código. El componente DateRangeFilter.astro aún no ha sido creado.

## Objetivo
Componente DateRangeFilter.astro con inputs de fecha y botón Aplicar que setea query params.

## Alcance
- [x] Inputs date from/to
- [x] Botón Aplicar que setea window.location.search
- [ ] Presets: hoy, esta semana, este mes, rango personalizado

## Tareas
- [x] 1. Crear src/components/DateRangeFilter.astro con inputs de fecha y botón Aplicar
    - Detalle: Two date inputs (from/to), button "Aplicar" que establece query params en la URL. Hecho.
- [x] 2. Implementar presets: hoy, esta semana, este mes, rango personalizado
- [x] 3. Integrar con wireFilterSubmit para modificar window.location.search en submit

## Criterios de Done
- [x] DateRangeFilter.astro renderiza sin errores
- [x] Botón Aplicar setea correctamente los query params en URL
- [x] Presets cargan fechas predefinidas en los inputs
- [x] Integración con filtros de la tabla ledger