# QA 04 — Clasificación de defectos, reportes y artefactos de diagnóstico

## Estado Actual

No existe ningún `BUG-XXX.md`, ni `qa-results/report-summary.md`, ni `failed-scenarios.json`. El skill define el formato de los artefactos y `modules/qa/05-artefactos.md` lo adapta a las pantallas y módulos reales de `shpr` (Ventas, Paquetes, Gastos, Dashboard).

## Objetivo

Transformar los fallos observados en la ejecución (`tasks/qa/03`) en defectos clasificados `BUG-XXX` con sus evidencias, y generar los artefactos de diagnóstico estructurados que permitan corregir y validar después **sin repetir la ejecución**.

## Alcance

- Convención de IDs y niveles de severidad: crítica, alta, media, baja.
- Un `BUG-XXX.md` por incidencia en `qa-results/defects/`, con el formato exacto de `modules/qa/05-artefactos.md`.
- Consolidación de hallazgos: descripción, pasos, resultado esperado, resultado obtenido (sin causa raíz).
- `qa-results/report-summary.md` (ejecutivo) y `qa-results/analytics/failed-scenarios.json`.
- Cierre de `coverage-summary.json` y `execution-metrics.json` con los valores reales de la campaña.

**Archivos nuevos:** `qa-results/defects/BUG-XXX.md` (uno por fallo), `qa-results/report-summary.md`, `qa-results/analytics/failed-scenarios.json`; actualización de `coverage-summary.json` y `execution-metrics.json`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|------------------------|---------|
| Corregir defectos | El QA nunca corrige (ver `modules/qa/README.md`). |
| Análisis de causa raíz | El diagnóstico queda fuera; el QA registra evidencia objetiva. |
| Ejecutar la suite | Es `tasks/qa/03`; aquí se trabaja sobre sus resultados. |
| Cambiar el árbol de specs | Los hallazgos se anotan como evidencia al pie de los criterios de `tasks/`; la corrección del documento es un cambio de specs aparte (ver `modules/qa/02-flujo-de-trabajo.md`). |

## Tareas

1. Definir la convención `BUG-001`, `BUG-002`, … y los criterios de severidad:

| Severidad | Criterio |
|-----------|----------|
| Crítica | Impide operar el negocio (no se puede registrar una venta, se pierde dinero). |
| Alta | Funcionalidad rota con workaround (un canal falla, un reporte miente). |
| Media | Comportamiento incorrecto en un caso límite o de validación. |
| Baja | Defecto cosmético o de conveniencia (texto, foco, orden). |

2. Por cada fallo de la ejecución de `tasks/qa/03`, crear `qa-results/defects/BUG-XXX.md` con los campos de `modules/qa/05-artefactos.md`: módulo, pantalla, componente, caso, resultado esperado, resultado obtenido, estado (`FAIL`), severidad y evidencias.
3. Verificar que cada `BUG-XXX` referencia evidencias existentes (screenshots, videos, traces, consola, red) con rutas relativas correctas.
4. Consolidar cada hallazgo: descripción, pasos exactos de reproducción, resultado esperado (anclado a `modules/api/` o `docs/07-decisiones.md`) y resultado obtenido. Sin causa raíz.
5. Generar `qa-results/report-summary.md` con las secciones del skill: proyecto (`shpr`), fecha, cobertura (pantallas y endpoints), cantidad de pruebas, exitosas, fallidas, defectos encontrados y conteo por severidad.
6. Generar `qa-results/analytics/failed-scenarios.json` con un objeto por defecto: `bugId`, `module`, `screen`, `component`, `testCase`, `severity`, `status`.
7. Actualizar `coverage-summary.json` con la cobertura real de pantallas, endpoints y casos por familia.
8. Confirmar que `execution-metrics.json` refleja la campaña (`env: "local"`, conteos reales, duración).
9. Anotar al pie de los criterios de `tasks/` correspondientes la evidencia del hallazgo (patrón de la sección "Evidencia" de `tasks/frontend/05-formulario-de-venta.md`), sin modificar el contenido de los criterios.
10. Inventariar el contenido final de `qa-results/` y verificar que todo defecto tiene su artefacto y viceversa.

## Criterios de Done

- [ ] Todo fallo observado en `tasks/qa/03` tiene su `BUG-XXX.md` con las seis referencias de evidencia.
- [ ] `report-summary.md` existe con las secciones completas y conteos consistentes con `execution-metrics.json`.
- [ ] `failed-scenarios.json` es válido y contiene un objeto por defecto.
- [ ] Ningún defecto fue corregido (verificado comparando `git status` del árbol de código).
- [ ] `qa-results/defects/` y `qa-results/report-summary.md` están versionados como evidencia entregable.