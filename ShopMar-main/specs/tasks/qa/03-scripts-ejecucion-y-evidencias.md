# QA 03 — Scripts Playwright, ejecución y captura de evidencias

## Estado Actual

No existe ningún script `.spec.ts` en el repositorio, ni directorio `qa-results/evidence/`. El catálogo de casos `TC-XXX` aún no está completo (es el trabajo de `tasks/qa/02`). El workspace `qa/` queda configurado por `tasks/qa/01`.

## Objetivo

Tener los scripts Playwright que conviertan cada caso `TC-XXX` en una prueba ejecutable y determinística, ejecutar la suite completa con `npx playwright test` y capturar evidencias completas (screenshots, videos, traces, consola y red) en todos los escenarios fallidos.

## Alcance

- Crear la estructura de tests en `qa/tests/`: Page Objects por pantalla, fixtures reutilizables, data providers y helpers.
- Escribir un script `.spec.ts` por área funcional, mapeado 1:1 con los `TC-XXX` del catálogo.
- Ejecutar la suite con Playwright contra el entorno local (backend `:3000`, frontend `:4321`).
- Capturar evidencias en `qa-results/evidence/` para todo fallo: `screenshots/`, `videos/`, `traces/`, `console/`, `network/`.
- Registrar resultados crudos en `qa-results/playwright/execution-results/` y métricas en `qa-results/analytics/execution-metrics.json`.

**Archivos nuevos:** `qa/tests/**/*.spec.ts`, `qa/tests/pages/*.ts`, `qa/tests/fixtures/*.ts`, `qa/tests/data/*.ts`, `qa/tests/helpers/*.ts`, `qa-results/evidence/**`, `qa-results/analytics/execution-metrics.json`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|------------------------|---------|
| Clasificar defectos y escribir `BUG-XXX` | Es `tasks/qa/04`, que consume las evidencias generadas aquí. |
| Corregir defectos | El QA no corrige (ver `modules/qa/README.md`). |
| Ejecutar contra producción | El skill limita los ambientes a localhost/sandbox/QA/staging. |
| Instalar dependencias en `frontend/` o `backend/` | D-010: el QA es un proceso externo. |

## Tareas

1. Crear los Page Objects por pantalla en `qa/tests/pages/` — `SummaryPage`, `SalesListPage`, `SalesNewPage` (canal live y whatsapp), `SalesDetailPage`, `PackagesListPage`, `PackagesNewPage`, `ExpensesListPage`, `ExpensesNewPage` — con selectores estables a partir de los atributos reales del HTML de cada `.astro` (los mismos que usa `frontend/src/lib/dom.ts`).
2. Crear las fixtures reutilizables en `qa/tests/fixtures/` — venta live válida, venta whatsapp con artículos adicionales, gasto válido, paquete válido — que se clonan por prueba para no compartir estado.
3. Crear los data providers en `qa/tests/data/` — payloads válidos e inválidos por endpoint, derivados de los DTOs de `modules/api/` (el patrón de `cost`, `category`, `payment_bank` condicional, `additional_items` 1-50).
4. Crear los helpers en `qa/tests/helpers/` — captura de `console.error`/`console.warn`, colección de requests/responses (incluidos 4XX y 5XX), y esperas determinísticas sobre los elementos reales.
5. Escribir la spec de venta live: crear venta en efectivo → vuelve a `/sales` → la factura imprime desde `/sales/detail?id=<uuid>` → el total está en el resumen del día.
6. Escribir la spec de venta whatsapp: agregar y quitar artículos sin recargar, `setRemoveDisabled` llega a cero filas, total derivado (D-003), envío con 1 y con 50 artículos.
7. Escribir la spec de venta con tarjeta: `payment_bank` obligatorio con `credit_card`; el error del backend se ubica en el campo bancario del formulario.
8. Escribir la spec de estados de venta: completar una venta; cancelar con el `confirm()` nativo; la cancelada no aparece en el resumen (D-008); el estado de una cancelada ya no cambia.
9. Escribir la spec de paquetes: crear, listar, editar, borrar (lógico, D-004) → el detalle responde `404` y la fila desaparece del listado.
10. Escribir la spec de gastos: crear y borrar con `confirm()`; el gasto borrado deja de sumar en el resumen.
11. Escribir la spec de resumen: rango de fechas desde la primera venta hasta hoy, cuatro tarjetas coherentes con los listados, sin errores con rango vacío.
12. Escribir la spec de validaciones: enviar `cost="abc"`, `cost="-100"`, `cost=""` y verificar el error mapeado al campo; verificar que los casos negativos del catálogo producen el `400` esperado (nunca `500`).
13. Escribir la spec de seguridad del navegador: `customer_name` con `<script>` se pinta como texto (el `setText` de `dom.ts` usa `textContent`), y un payload manipulado con claves extra (`.strict()` de Zod) es rechazado.
14. Escribir la spec de usuario real: doble clic en Guardar crea **una sola** venta (el botón se deshabilita); refresh inesperado no duplica; pegado masivo no rompe la pantalla.
15. Ejecutar la suite con `npx playwright test` y verificar que las evidencias de todo escenario fallido quedan en `qa-results/evidence/` con las cinco subcarpetas pobladas.
16. Registrar resultados crudos en `qa-results/playwright/execution-results/` y generar `qa-results/analytics/execution-metrics.json` (total, passed, failed, flaky, duración, `startedAt`).

## Criterios de Done

- [ ] `npx playwright test` corre la suite completa contra local en una sola pasada, sin prompts.
- [ ] Todo escenario fallido tiene screenshot, video, trace, logs de consola y registro de red en `qa-results/evidence/`.
- [ ] `execution-metrics.json` existe con los conteos reales de la ejecución.
- [ ] Las specs son determinísticas: corren dos veces seguidas con el mismo resultado.
- [ ] `frontend/package.json` y `backend/package.json` no tienen dependencias nuevas (D-010).
- [ ] Ningún `BUG-XXX` fue escrito en esta tarea (eso pertenece a `tasks/qa/04`).