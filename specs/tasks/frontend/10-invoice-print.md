# 10-invoice-print

## Estado Actual
Proyecto nuevo, no hay código. El componente InvoicePrint.astro aún no ha sido creado.

## Objetivo
Componente InvoicePrint.astro con botón Imprimir → window.print() y estilos @media print.

## Alcance
- [x] Botón Imprimir → window.print()
- [ ] Estilos @media print para layout de factura

## Tareas
- [x] 1. Crear src/components/InvoicePrint.astro con botón imprimir
    - Detalle: Botón "Imprimir" que llama window.print(), estilos @media print en <style> del .astro o src/print.css para layout: encabezado, tabla de renglones, totales, firma. Hecho.
- [x] 2. Implementar estilos @media print con estructura de factura
- [x] 3. Añadir clase btn-print al botón y estilos asociados

## Criterios de Done
- [x] InvoicePrint.astro renderiza sin errores
- [x] Botón Imprimir abre diálogo nativo del navegador
- [x] Estilos @media print muestran estructura de factura adecuada
- [x] Layout: encabezado, tabla renglones, totales, firma imprime correctamente