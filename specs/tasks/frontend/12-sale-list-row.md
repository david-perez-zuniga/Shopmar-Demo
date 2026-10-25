# 12-sale-list-row

## Estado Actual
Proyecto nuevo, no hay código. El componente SaleListRow.astro aún no ha sido creado.

## Objetivo
Componente SaleListRow.astro fila de tabla ledger con celdas, select de estado y botones de acción.

## Alcance
- [x] Fila tabla con celdas completas
- [x] Columna canal: píldula con texto "Tienda" / "Live" e icono
- [x] Columna estado: select pending/completed/cancelled con onChange handler
- [x] Columna acciones: ver detalle / cambiar estado / imprimir

## Tareas
- [x] 1. Crear src/components/SaleListRow.astro fila de tabla ledger
    - Detalle: Una fila (tr) con celdas (td) para cada columna: Fecha, Cliente, Mercadería, Canal (píldula), Estado (select), Artículos, Total, Acciones (botones). Hecho.
- [x] 2. Implementar columna canal con píldula "Tienda" / "Live" y icono bolsa/Video
- [x] 3. Implementar columna estado: select con options pending/completed/cancelled y onChange handler
- [x] 4. Implementar columna acciones: botones Ver detalle, Cambiar estado, Imprimir
- [x] 5. Añadir data-tooltip, aria-label y clases CSS identificatorias

## Criterios de Done
- [x] SaleListRow.astro renderiza sin errors en tabla ledger
- [x] Columna canal muestra píldula correcta según tipo venta
- [x] Select de estado cambia valor y dispara onChange correctamente
- [x] Botones de acción tienen tooltip y aria-label apropiados
- [x] Fila tiene aria-rowindex y celdas tienen aria-label apropiados