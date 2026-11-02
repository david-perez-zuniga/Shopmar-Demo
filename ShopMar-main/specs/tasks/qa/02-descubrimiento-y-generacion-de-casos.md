# QA 02 — Descubrimiento de la aplicación y generación de casos de prueba

## Estado Actual

El skill `Skill_Playwright.md` (raíz del repositorio) define la metodología de descubrimiento y la taxonomía de casos, y `modules/qa/03-casos-de-prueba.md` la adapta a `shpr` con ejemplos reales de pantallas, campos y endpoints. Lo que **no** existe todavía es el catálogo concreto de casos `TC-XXX` ni los inventarios de pantallas y endpoints sobre los que se generará la suite.

## Objetivo

Producir el catálogo completo de casos de prueba `TC-XXX` —uno por combinación de pantalla/endpoint y familia de la taxonomía— con la estructura del skill, sin escribir todavía ningún script ejecutable.

## Alcance

- Inventariar las ocho rutas del frontend y los trece endpoints de `/api/v1`, con sus elementos y DTOs reales.
- Extraer las reglas de negocio visibles desde `modules/api/`, `docs/07-decisiones.md` y los esquemas Zod de los DTO (los mismos que `modules/qa/02-flujo-de-trabajo.md` lista como ejemplos).
- Crear el catálogo en `qa/tests/cases/`: un documento Markdown por área (`ventas.md`, `packages.md`, `expenses.md`, `dashboard.md`) más `README.md` como índice.
- Generar casos de las siete familias: happy path, negativos, límite, extremos, absurdos, seguridad y usuario real, anclados a las invariantes reales de `shpr`.
- Consolidar `qa-results/analytics/coverage-summary.json` con el conteo de casos por familia.

**Archivos nuevos:** `qa/tests/cases/README.md`, `qa/tests/cases/{ventas,packages,expenses,dashboard}.md`, `qa-results/analytics/coverage-summary.json`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|------------------------|---------|
| Escribir scripts `.spec.ts` | Es `tasks/qa/03`, que consume este catálogo. |
| Ejecutar pruebas y capturar evidencias | Es `tasks/qa/03`. |
| Clasificar defectos y generar reportes | Es `tasks/qa/04`. |
| Corregir defectos encontrados | El QA nunca corrige (ver `modules/qa/README.md`). |
| Analizar causa raíz de reglas sospechosas | El QA registra evidencia, no diagnóstico. |

## Tareas

1. Verificar que backend (`http://localhost:3000`) y frontend (`http://localhost:4321`) responden; si uno está caído, detener y reportar el entorno roto.
2. Inventariar las ocho rutas del frontend y, por cada una, sus elementos interactivos (inputs, selects, botones, tablas, modales), usando la tabla de `modules/qa/03-casos-de-prueba.md` como plantilla.
3. Inventariar los trece endpoints de `modules/api/README.md` con los campos de su DTO y las reglas que lo gobiernan (patrón de `cost`, `category`, `payment_bank` condicional, `additional_items` 1-50 solo en whatsapp, UUID inválido → `400`).
4. Releer las decisiones D-001 a D-009 de `docs/07-decisiones.md` y anotar las invariantes que los casos deben respetar (borrado lógico, total derivado, cancelada fuera del dashboard, sin edición de ventas/gastos).
5. Definir la plantilla de caso `TC-XXX` con los campos del skill: nombre, objetivo, prerrequisitos, pasos, resultado esperado, severidad potencial y datos. Documentarla en `qa/tests/cases/README.md`.
6. Generar los casos happy path: venta live en efectivo, venta live con tarjeta, venta whatsapp con artículos adicionales, completar venta, cancelar venta, registrar paquete vinculado, registrar gasto, resumen con rango de fechas.
7. Generar los casos negativos: `cost` vacío/letras/coma/negativo, `category` ausente o inválida, tarjeta sin banco, banco con efectivo, artículos en live, UUID inválido, detalle inexistente, recurso borrado.
8. Generar los casos límite: `cost="99999999.99"` (acepta) y `cost="100000000"` (rechaza), 1 y 50 artículos adicionales (acepta), 51 (rechaza), `quantity=0`, rango de fechas extremo.
9. Generar los casos extremos y absurdos: `cost="1e5"`, cadenas gigantes, emoji/Unicode, HTML como texto, JSON anidado, bytes nulos.
10. Generar los casos de seguridad: XSS por `customer_name`, SQL injection, payload con claves extra (`.strict()` de Zod), bypass de la UI, CORS, rate limit (`429`), `500` genérico sin fuga de detalle.
11. Generar los casos de usuario real: doble clic en Guardar, submit repetido, refresh inesperado, retroceso del navegador, múltiples pestañas, pegado masivo, impresión de factura, agregar/quitar artículos en modo whatsapp sin recargar.
12. Revisar la tabla de cobertura mínima por pantalla de `modules/qa/03-casos-de-prueba.md` y completar los huecos que queden en el catálogo.
13. Consolidar `qa-results/analytics/coverage-summary.json` con los conteos reales por familia y por pantalla.

## Criterios de Done

- [ ] `qa/tests/cases/` existe con el índice y los cuatro documentos por área.
- [ ] Cada caso tiene los ocho campos de la plantilla (ID, nombre, objetivo, prerrequisitos, pasos, resultado esperado, severidad potencial, datos).
- [ ] Las ocho pantallas y los trece endpoints tienen al menos un caso happy path y un caso negativo.
- [ ] Las siete familias de la taxonomía están representadas (ninguna área quedó *happy-path-only*).
- [ ] `coverage-summary.json` refleja los conteos reales del catálogo.
- [ ] Ningún script `.spec.ts` fue creado en esta tarea.