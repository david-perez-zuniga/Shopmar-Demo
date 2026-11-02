# QA — Objetivo, rol y filosofía

## Objetivo principal

Construir automáticamente una batería de pruebas capaz de **maximizar la detección de defectos** sobre la aplicación corriendo, recorriendo los flujos completos como los usaría la dueña del negocio. El proceso no asume que la aplicación funciona: descubre qué hace, extrae las reglas de negocio del código y de los documentos, y las somete a escenarios positivos y adversos.

La cobertura abarca:

| Área | Qué se verifica en `shpr` |
|------|---------------------------|
| Frontend | Las rutas del panel según `modules/frontend/01-arquitectura.md`, **confirmadas contra el código y la aplicación** en el Paso 1 de descubrimiento (`02-flujo-de-trabajo.md`): el inventario real es el que manda, y cualquier diferencia con el árbol se registra como hallazgo |
| Backend | Los veintiún endpoints de `/api/v1` (ver `modules/api/README.md`) |
| Integraciones | Los flujos frontend → API → PostgreSQL de punta a punta |
| Validaciones | Los esquemas Zod de los DTO y su traducción al sobre de error |
| Reglas de negocio | Las decisiones D-001 a D-009 y las invariantes de `modules/api/05-convenciones.md` |
| Seguridad | XSS por texto libre, SQL injection, manipulación de requests, CORS, rate limit |
| Persistencia | Borrado lógico (D-004), total derivado (D-003), transacciones atómicas |

## Roles

El agente que ejecuta este proceso actúa como:

- QA Automation Architect
- Test Designer Senior
- Especialista Playwright
- Exploratory Tester
- Ingeniero de Calidad Full Stack

## Filosofía de descubrimiento

Se asume que **todo puede fallar**:

```
Todo campo puede romperse.
Toda validación puede estar ausente.
Toda integración puede fallar.
Todo usuario puede equivocarse.
Todo atacante intentará abusar del sistema.
Toda regla de negocio puede contener errores.
```

Nunca se generan únicamente *happy paths*. Cada funcionalidad encontrada se evalúa con casos positivos, negativos, límite, absurdos, destructivos, de seguridad y de usuario real (la taxonomía completa está en `03-casos-de-prueba.md`).

## Entradas requeridas

| Entrada | En este proyecto |
|---------|------------------|
| Repositorio | El árbol del proyecto en `ShopMar/` |
| Aplicación desplegada | Backend en `http://localhost:3000` y frontend en `http://localhost:4321` (desarrollo), o el build estático servido en local |
| Credenciales | Sí: el panel pide login y la API exige cookie de sesión (D-024, `modules/api/07-auth.md`). El recorrido arranca con una cuenta de prueba —un `seller` para el panel y un `admin` para el alta de usuarios— creada con `pnpm create-admin` o `pnpm --filter shpr user:create`. |
| Configuración | Variables de entorno de `backend/.env` y `frontend/.env` para la conexión correcta |

## Restricciones

| Regla | Detalle |
|-------|---------|
| **No corrige defectos** | El proceso termina al generar artefactos de diagnóstico completos y estructurados. |
| **No hace análisis de causa raíz** | Registra evidencia objetiva: qué se hizo, qué se esperaba, qué pasó. |
| **Cobertura mínima por pantalla** | Cada pantalla descubierta genera pruebas de visualización, ingreso, edición, eliminación, validación, persistencia, navegación y errores. |
| **Casos obligatorios** | Positivos, negativos, límite, extremos, absurdos, seguridad y exploratorios. Nunca solo los exitosos. |
| **Ejecución estándar** | `npx playwright test`. No se depende de comandos personalizados. |