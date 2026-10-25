# 03-statcard-component

## Estado Actual
Proyecto nuevo, no hay código. El componente StatCard.astro aún no ha sido creado.

## Objetivo
Componente StatCard.astro con icono + label + valor + flecha de tendencia para KPIs.

## Alcance
- [x] StatCard.astro con icono, label, valor y flecha de tendencia
- [ ] Estados: loading, vacío, error, éxito

## Tareas
- [x] 1. Crear src/components/StatCard.astro con estructura de tarjeta KPI
    - Detalle: Icono a la izquierda, label arriba, valor grande en centro, flecha de tendencia a la derecha. Hecho.
- [x] 2. Implementar estados: loading (skeleton), vacío (mensaje "No hay datos"), error (mensaje + retry), éxito (valor normal con flecha)
- [x] 3. Añadir props opcionales: icon name, label, value, trend direction/color

## Criterios de Done
- [x] StatCard.astro renderiza sin errors
- [x] Los 4 estados (loading, vacío, error, éxito) se comportan correctamente
- [x] Props funcionales: icon, label, value, trend
- [x] responsive dentro del layout padre