# QA — Configuración y estructura de archivos

## Ubicación del workspace

El QA vive en un workspace de pnpm **propio**, separado de `frontend/` y `backend/` (decisión D-010):

```
qa/
├── package.json             # name: "shpr-qa", devDependency: @playwright/test
├── playwright.config.ts     # configuración (ver abajo)
└── tests/
    ├── *.spec.ts            # un archivo por área funcional
    ├── pages/               # Page Objects por pantalla
    ├── fixtures/            # fixtures reutilizables
    ├── data/                # data providers: payloads válidos e inválidos
    └── helpers/             # utilidades de espera y captura
```

`pnpm-workspace.yaml` agrega `qa` a la lista de paquetes. **Ninguna** de las dependencias del QA se instala en `frontend/` ni en `backend/`.

## Configuración de Playwright

Requisitos del entorno:

| Requisito | Valor |
|-----------|-------|
| Node.js | El mismo runtime del proyecto (ver `docs/02-global-instruction.md`) |
| Aplicación | Backend `http://localhost:3000` y frontend `http://localhost:4321` corriendo |
| Instalación | `npm install -D @playwright/test` y `npx playwright install` (navegadores) |

Configuración mínima de `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../qa-results/playwright/report" }],
  ],
  use: {
    baseURL: "http://localhost:4321",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
})
```

Reglas obligatorias de ejecución (del skill):

- Ejecución estándar: `npx playwright test`.
- Screenshots, videos, Trace Viewer y logs **siempre habilitados** en escenarios fallidos.
- Verificación de disponibilidad antes de arrancar: hay que confirmar que **ambos** servidores responden; si uno está caído, **detener la ejecución** y reportar la causa (el QA no genera falsos negativos por entorno roto).

## Directorios de salida

Al inicio de cualquier campaña de QA se generan automáticamente estos directorios en la raíz del repositorio:

```
qa-results/
├── defects/                         # un BUG-XXX.md por incidencia
├── evidence/
│   ├── screenshots/                 # capturas antes/durante/después del fallo
│   ├── videos/                      # grabaciones completas
│   ├── traces/                      # ZIP de Trace Viewer
│   ├── console/                     # console.error, console.warn, unhandled exceptions
│   └── network/                     # requests, responses, timeouts, 4XX, 5XX
├── playwright/
│   ├── report/                      # reporte HTML de Playwright (inspectable)
│   └── execution-results/           # resultados crudos: logs, tiempos, fallos
└── analytics/
    ├── failed-scenarios.json        # dataset de fallos (ver 05-artefactos.md)
    ├── execution-metrics.json       # métricas de ejecución
    └── coverage-summary.json        # resumen de cobertura
```

Los directorios se crean vacíos al preparar la campaña; se llenan según avanza la ejecución. Los artefactos de diagnóstico (`defects/`, `analytics/`, `report-summary.md`) son el entregable final y deben quedar versionados en el repositorio como evidencia.

## Scripts del workspace

| Comando (desde `qa/`) | Qué ejecuta |
|------------------------|-------------|
| `npx playwright test` | Toda la suite, headless, una vez |
| `npx playwright test --headed` | Con navegador visible (inspección manual) |
| `npx playwright show-report` | Abre el reporte HTML |

La suite **no** se ejecuta contra producción: solo contra local (desarrollo o build estático servido en local), como exige el skill para los ambientes localhost/sandbox/QA/staging.