# QA — Flujo de trabajo

El pipeline completo, de punta a punta. Cada paso produce algo concreto que el siguiente consume; ninguno se salta.

```
Descubrir funcionalidades
↓
Detectar reglas de negocio
↓
Generar casos de prueba
↓
Generar pruebas Playwright
↓
Ejecutar Playwright
↓
Capturar evidencias
↓
Clasificar defectos
↓
Consolidar hallazgos
↓
Generar artefactos de diagnóstico
```

## Paso 1 — Descubrimiento de la aplicación

### Frontend

Recorrer las ocho rutas del panel y detectar todos los elementos interactivos:

| Elemento | En `shpr` |
|----------|-----------|
| Páginas | `/`, `/sales`, `/sales/new`, `/sales/detail`, `/packages`, `/packages/new`, `/expenses`, `/expenses/new` |
| Formularios | El de venta (`/sales/new`, dos canales), el de paquete (`/packages/new`), el de gasto (`/expenses/new`) |
| Inputs, comboboxes, datepickers | `customer_name`, `product_name`, `category`, `payment_method`, `payment_bank`, `sale_date`, `status`, `cost`, artículos adicionales (nombre, descripción, cantidad, importe) |
| Botones | "Agregar artículo", "Quitar", "Guardar", "Imprimir factura", filtros de fecha por rango |
| Tablas | Listado de ventas, paquetes y gastos |
| Modales y alertas | El `confirm()` nativo al cambiar estado de venta y al eliminar paquete/gasto |

### Backend

Los veintiún endpoints de `modules/api/README.md`, con sus DTOs de Zod, middlewares y reglas de negocio (`modules/backend/03-api.md`, `modules/backend/04-security.md`).

### Integraciones

Mapear el recorrido completo por cada flujo: pantalla (bloque `<script type="module">` de `.astro`) → `fetch` de `src/lib/api.ts` → endpoint Fastify → servicio → repositorio de Drizzle → PostgreSQL, y la respuesta de vuelta con el sobre `{ code, message, details? }`.

## Paso 2 — Detección de reglas de negocio

Extraer las reglas desde el código, los DTOs, los esquemas Zod, los mensajes y las decisiones D-001 a D-024. Ejemplos reales de `shpr`:

```
cost: obligatorio, patrón /^\d{1,8}(\.\d{1,2})?$/, sin signo, sin exponente
category: lista no vacía y sin repetidos del enum sale_category (pantalones, camisas, chaquetas, sudaderas)
payment_bank: obligatorio con credit_card, prohibido con cash (superRefine + CHECK)
additional_items: 1 a 50 elementos en whatsapp, prohibido en live (esto es un TypeError con 400)
venta cancelada: no suma en dashboard (D-008), y su estado no se puede cambiar
delete: siempre lógico (D-004), el recurso desaparece del listado y responde 404 al detalle
UUID inválido en :id → 400, no 404
```

La lista completa y verificable está en `modules/api/README.md` (tabla "Reglas de negocio visibles en el contrato") y en `docs/07-decisiones.md`.

## Paso 3 — Generación masiva de casos

Generar los casos `TC-XXX` con la taxonomía completa de `03-casos-de-prueba.md`. Cada caso incluye: nombre, objetivo, prerrequisitos, pasos, resultado esperado, severidad potencial y datos utilizados.

## Paso 4 — Generación de scripts Playwright

Crear en `qa/playwright/` (o `qa-results/playwright/generated-tests/` según el paso de `04-configuracion.md`):

```
qa/playwright/generated-tests/
├── *.spec.ts          # un archivo por área funcional
├── pages/             # Page Objects por pantalla
├── fixtures/          # fixtures reutilizables (venta válida, gasto válido)
├── data/              # data providers: payloads válidos e inválidos por endpoint
└── helpers/           # utilidades (esperas, capturas de console/network)
```

Los scripts deben ser modulares, escalables, reutilizables, mantenibles y determinísticos.

## Paso 5 — Ejecución automática

Ejecutar obligatoriamente:

```bash
npx playwright test
```

Sin solicitar confirmación. Habilitar siempre, en todos los escenarios fallidos: screenshots, videos, Trace Viewer y logs.

## Paso 6 — Captura de evidencias

Por cada prueba:

| Evidencia | Detalle |
|-----------|---------|
| Screenshots | Antes, durante y después del fallo |
| Videos | Grabación completa del escenario |
| Trace Viewer | ZIP de trace por escenario |
| Consola | `console.error`, `console.warn`, unhandled exceptions |
| Red | requests, responses, timeouts, 4XX y 5XX |
| Aplicación | Errores de backend y frontend, stack traces, logs relevantes |

## Paso 7 — Clasificación de defectos

Para cada defecto encontrado registrar: ID, fecha, hora, módulo, pantalla, componente, caso de prueba, resultado y severidad (crítica, alta, media, baja). Formato completo en `05-artefactos.md`.

## Paso 8 — Generación de reportes

| Reporte | Archivo |
|---------|---------|
| Ejecutivo | `qa-results/report-summary.md` |
| Técnicos | Resultados de Playwright, logs, tiempos, fallos |
| Por defecto | Un `BUG-XXX.md` por incidencia |

## Paso 9 — Consolidación de hallazgos

Cada defecto consolida: descripción, pasos, resultado esperado, resultado obtenido, evidencias y componentes involucrados. **Sin** análisis de causa raíz y **sin** correcciones.

## Paso 10 — Generación de artefactos de diagnóstico

Al finalizar, los artefactos estructurados de `qa-results/` (árbol completo en `04-configuracion.md`), listos para que cualquier proceso posterior analice, audite, diagnostique, corrija y valide sin repetir la ejecución.

## Actualización del árbol de specs

Los hallazgos de QA que revelen comportamiento distinto al documentado en los módulos de specs (por ejemplo, un `400` con un mensaje que el contrato no prevé) se registran como hallazgo en `BUG-XXX` **y** se anotan como evidencia al pie del criterio de `tasks/` correspondiente, siguiendo el patrón de la sección "Evidencia" de `tasks/frontend/05-formulario-de-venta.md`. El QA nunca modifica el árbol directamente: aporta la evidencia y la corrección del documento es un cambio de specs aparte.