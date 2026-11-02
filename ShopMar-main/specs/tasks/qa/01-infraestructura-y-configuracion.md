# QA 01 — Infraestructura del workspace y configuración de Playwright

## Estado Actual

No existe el workspace `qa/` ni Playwright en el repositorio. El árbol `pnpm-workspace.yaml` declara solo `backend` y `frontend`. Las pruebas existentes son Vitest (backend y frontend) y no hay ningún directorio `qa-results/`. El frontend declara explícitamente que no lleva Playwright dentro de su paquete (`frontend/06-testing.md`), y esa regla se mantiene: el QA vive aparte (decisión D-010).

## Objetivo

Que exista un workspace `qa/` con Playwright instalado y configurado, capaz de recorrer la aplicación corriendo en local (backend `:3000`, frontend `:4321`) y de escribir evidencias en `qa-results/`, sin tocar las dependencias de `frontend/` ni `backend/`.

## Alcance

- Crear `qa/package.json` (name `shpr-qa`, devDependency `@playwright/test`).
- Agregar `qa` a `pnpm-workspace.yaml`.
- Crear `qa/playwright.config.ts` (configuración del skill: `testDir`, reporter HTML+list, `baseURL`, screenshots/videos/traces solo en fallo).
- Crear los directorios de salida `qa-results/` (defects, evidence/{screenshots,videos,traces,console,network}, playwright/report, analytics).
- Verificar node, instalar dependencias y navegador: `npx playwright install`.
- Configurar vars de entorno que el QA necesita (backend y frontend corriendo, `API_URL` apuntando a `:3000`).

**Archivos nuevos:** `qa/package.json`, `qa/playwright.config.ts`, `qa-results/` (estructura), edición de `pnpm-workspace.yaml`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|------------------------|---------|
| Escribir casos de prueba (TC-XXX) | Es `tasks/qa/02`. |
| Escribir scripts `.spec.ts` | Es `tasks/qa/03`. |
| Clasificar defectos y reportar | Es `tasks/qa/04`. |
| Instalar dependencias en `frontend/` o `backend/` | D-010: el QA es un proceso externo, el presupuesto de dependencias del panel se mantiene. |
| Correr el QA contra producción | El skill limita los ambientes a localhost/sandbox/QA/staging. |

## Tareas

1. Verificar el entorno: `node --version` y `npm --version`. Si Node no está disponible, detener y reportar.
2. Crear `qa/package.json` con `"name": "shpr-qa"`, `"private": true` y `"type": "module"`.
3. Instalar Playwright en el workspace: `npm install -D @playwright/test` (desde `qa/`).
4. Instalar el navegador requerido: `npx playwright install`.
5. Confirmar la instalación: `npx playwright --version` responde sin error.
6. Agregar `qa` a la lista de paquetes del `pnpm-workspace.yaml` de la raíz.
7. Crear `qa/playwright.config.ts` con `testDir`, reporter `list` + `html` (outputFolder `../qa-results/playwright/report`), `baseURL: "http://localhost:4321"` y `screenshot/video/trace: "only-on-failure"` / `"retain-on-failure"`.
8. Crear la estructura `qa-results/` con `defects/`, `evidence/{screenshots,videos,traces,console,network}/`, `playwright/report/` y `analytics/`.
9. Crear `qa/tests/` con un archivo de humo `smoke.spec.ts` que abre `/` y verifica que el título y el resumen cargan (depende de que el backend responda; si no, marcar el entorno como roto y no seguir).
10. Ejecutar `npx playwright test` y confirmar que la smoke pasa con el entorno levantado.

## Criterios de Done

- [ ] `qa/package.json` existe con `@playwright/test` en devDependencies.
- [ ] `npx playwright --version` responde en `qa/`.
- [ ] `pnpm-workspace.yaml` lista `qa`.
- [ ] `qa/playwright.config.ts` existe con las cuatro reglas de evidencias del skill.
- [ ] La estructura `qa-results/` existe con los diez directorios especificados.
- [ ] `npx playwright test` ejecuta la smoke verde contra backend y frontend en local.
- [ ] `frontend/package.json` y `backend/package.json` **no** tienen dependencias nuevas.