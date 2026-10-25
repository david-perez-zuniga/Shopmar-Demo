# 07-sale-actions

## Estado Actual
Proyecto nuevo, no hay código. El componente SaleActions.astro aún no ha sido creado.

## Objetivo
Componente SaleActions.astro botones dentro de fila tabla: Ver detalle, Cambiar estado, Imprimir.

## Alcance
- [x] Botones dentro de fila tabla con data-tooltip, aria-label, className específicos
- [x] Estados visuales idénticos al original

## Tareas
- [x] 1. Crear src/components/SaleActions.astro con botones de acción por fila
    - Detalle: Tres botones por fila: Ver detalle (icono lupa), Cambiar estado (icono lápiz), Imprimir (icono impresora). Hecho.
- [x] 2. Implementar data-tooltip, aria-label y className en cada botón
- [x] 3. Añadir handlers de click: verDetalle(), cambiarEstado(), imprimir()
- [x] 4. Integrar con StatusBadge y ConfirmDialog para cambio de estado

## Criterios de Done
- [x] SaleActions.astro renderiza sin errores en fila de tabla
- [x] Cada botón tiene data-tooltip y aria-label correctos
- [x] Click "Ver detalle" navega a /sales/detail/[id]
- [x] Click "Cambiar estado" abre modal ConfirmDialog
- [x] Click "Imprimir" llama window.print()