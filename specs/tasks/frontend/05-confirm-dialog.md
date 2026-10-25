# 05-confirm-dialog

## Estado Actual
Proyecto nuevo, no hay código. El componente ConfirmDialog.astro aún no ha sido creado.

## Objetivo
Componente ConfirmDialog.astro modal con overlay, modal-card, two buttons: Cancelar, Confirmar.

## Alcance
- [x] Modal con overlay, modal-card, modal-head, modal-body
- [x] Two buttons: Cancelar, Confirmar
- [x] askConfirm hook que retorna ok y opcionalmente amountPaid

## Tareas
- [x] 1. Crear src/components/ConfirmDialog.astro con estructura modal
    - Detalle: overlay semi-transparente, tarjeta centrada, header con título, body con mensaje, footer con two botones. Hecho.
- [x] 2. Implementar askConfirm hook que retorna ok y opcionalmente amountPaid
- [x] 3. Añadir estilos para modal centrado y botones desactivados en estado inválido

## Criterios de Done
- [x] ConfirmDialog.astro renderiza sin errores
- [x] askConfirm retorna ok/cancel correctly
- [x] Modal centrado en pantalla con overlay
- [x] Botones Cancelar y Confirmar funcionales