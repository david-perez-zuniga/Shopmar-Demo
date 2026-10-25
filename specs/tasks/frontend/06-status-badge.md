# 06-status-badge

## Estado Actual
Proyecto nuevo, no hay código. El componente StatusBadge.astro aún no ha sido creado.

## Objetivo
Componente StatusBadge.astro badges por estado con clases CSS y tooltips.

## Alcance
- [x] Badges por estado: pending (amber), completed (green), cancelled (red)
- [ ] Tooltip con explicación al pasar

## Tareas
- [x] 1. Crear src/components/StatusBadge.astro con badges por estado
    - Detalle: Tres badges con clases CSS diferenciadas (pill--pending, pill--completed, pill--cancelled) y tooltips con explicación. Hecho.
- [x] 2. Implementar tooltips con explicación al pasar el mouse
- [x] 3. Añadir clases CSS identificatorias por estado

## Criterios de Done
- [x] StatusBadge.astro renderiza sin errores
- [x] Tres badges con clases CSS correctas (pending/amber, completed/green, cancelled/red)
- [x] Tooltips aparecen al pasar mouse sobre badges
- [x] Aria-labels en los badges