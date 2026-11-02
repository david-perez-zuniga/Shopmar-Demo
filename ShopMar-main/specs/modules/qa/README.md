# Módulo QA — Verificación autónoma con Playwright

Este módulo define el proceso de verificación funcional autónoma de `shpr`: descubrimiento de funcionalidad, detección de reglas de negocio, generación masiva de casos de prueba, ejecución con Playwright, captura de evidencias y clasificación de defectos. Su fuente es el skill `Skill_Playwright.md` en la raíz del repositorio, adaptado a las pantallas, los endpoints y las invariantes reales de este proyecto.

**El QA no corrige defectos.** Su responsabilidad termina cuando toda la información necesaria para diagnosticar y corregir está generada y almacenada de forma estructurada, en `qa-results/`.

## Archivos

| Documento | Contenido |
|-----------|-----------|
| [`01-objetivo.md`](01-objetivo.md) | Misión del proceso, roles, filosofía de descubrimiento, entradas requeridas y restricciones. |
| [`02-flujo-de-trabajo.md`](02-flujo-de-trabajo.md) | Los once pasos del pipeline, mapeados a las pantallas y endpoints reales de `shpr`. |
| [`03-casos-de-prueba.md`](03-casos-de-prueba.md) | La taxonomía completa de casos —positivos, negativos, límite, extremos, absurdos, seguridad y usuario real— con ejemplos concretos del proyecto. |
| [`04-configuracion.md`](04-configuracion.md) | Dónde vive el workspace `qa/`, cómo se configura Playwright y cómo se estructura `qa-results/`. |
| [`05-artefactos.md`](05-artefactos.md) | Los artefactos de salida: `BUG-XXX.md`, `report-summary.md`, los JSON de análisis y sus formatos exactos. |

## Decisión que gobierna este módulo

| Decisión | Efecto |
|----------|--------|
| D-010 — QA como proceso externo al paquete frontend | Playwright vive en un workspace `qa/` propio, no en `frontend/package.json` ni en `backend/package.json`. El presupuesto de dependencias del panel (D-005) queda intacto. |

## Relación con las pruebas existentes

| Capa | Herramienta | Cobertura |
|------|-------------|-----------|
| Reglas de negocio del backend | Vitest (casos unitarios de la capa `application/`) | Ver `modules/backend/05-testing.md` |
| Lógica de presentación del frontend | Vitest y jsdom (`format`, `api`, `dom`, tipos) | Ver `modules/frontend/06-testing.md` |
| **Flujos completos en el navegador** | **Playwright desde `qa/`** | **Este módulo** |

Las tres capas son complementarias y no se pisan: el QA recorre la aplicación como la usaría la dueña, algo que ninguna prueba unitaria puede hacer porque no levanta el navegador ni la red.

## Qué no existe en este módulo

| Lo que no existe | Razón |
|------------------|-------|
| Corrección de defectos | El skill es explícito: descubre, ejecuta, evidencia y clasifica. Corregir es el trabajo que sigue, anotado en los `BUG-XXX`. |
| Análisis de causa raíz | El diagnóstico (por qué falla el código) queda fuera; el QA registra evidencia objetiva del qué y el cómo. |
| CI/CD | El proyecto no tiene automatismos de despliegue (ver `documentacion-cliente.md`). El QA corre en local contra `localhost`. |
| `qa/` como dependencia de producción | Es un workspace de desarrollo. Nunca se instala en el frontend ni en el backend. |