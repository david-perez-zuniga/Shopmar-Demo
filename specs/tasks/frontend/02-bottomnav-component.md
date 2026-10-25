# 02-bottomnav-component

## Estado Actual
Proyecto nuevo, no hay código. El componente BottomNav.astro aún no ha sido creado.

## Objetivo
Componente BottomNav.astro con navegación inferior mobile y state activo.

## Alcance
- [x] BottomNav.astro con 5 ítems: Home, Sales, Packages, Expenses, Customers
- [ ] State activo con clase `page-btn--current`

## Tareas
- [x] 1. Crear src/components/BottomNav.astro con estructura de bottom navigation móvil
    - Detalle: 5 botones horizontales, active state con `page-btn--current`, navegación a las rutas principales. Hecho.
- [x] 2. Implementar state activo (`page-btn--current`) based on current route
- [x] 3. Añadir estilos responsive (diferente en tablet/desktop si aplica)

## Criterios de Done
- [x] BottomNav.astro renderiza sin errores
- [x] Item activo se refleja al navegar entre routes
- [x] responsive styles aplican correctamente