# QA — Artefactos de diagnóstico

Los artefactos son el entregable del QA: permiten que cualquier proceso posterior analice, audite, diagnostique, corrija y valide los defectos **sin repetir la ejecución**.

## Reporte ejecutivo — `qa-results/report-summary.md`

Contenido mínimo:

| Sección | En `shpr` |
|---------|-----------|
| Proyecto | shpr |
| Fecha | Fecha y hora de la campaña |
| Cobertura | Pantallas y endpoints recorridos |
| Cantidad de pruebas | Total de casos ejecutados |
| Pruebas exitosas | `passed` |
| Pruebas fallidas | `failed` / `flaky` |
| Defectos encontrados | Número de `BUG-XXX` abiertos |
| Severidades | Conteo por severidad (crítica, alta, media, baja) |

## Reporte individual por defecto — `qa-results/defects/BUG-XXX.md`

Formato obligatorio por incidencia, con los nombres reales de los módulos y pantallas de este proyecto:

```markdown
# BUG-001

Módulo:
Ventas

Pantalla:
/sales/new (canal whatsapp)

Componente:
Artículos adicionales — total estimado

Caso:
TC-042

Resultado Esperado:
El total estimado suma los importes de los artículos con exactitud decimal.

Resultado Obtenido:
El total termina en .00 para 0.30 + 0.30 (aritmética de punto flotante).

Estado:
FAIL

Severidad:
Alta

Evidencias:
- screenshots/bug-001-antes.png
- screenshots/bug-001-despues.png
- videos/bug-001.mp4
- traces/bug-001.zip
- console/bug-001-console.log
- network/bug-001-network.json
```

## Dataset de fallos — `qa-results/analytics/failed-scenarios.json`

```json
{
  "bugId": "BUG-001",
  "module": "sales",
  "screen": "/sales/new",
  "component": "additional_items.total",
  "testCase": "TC-042",
  "severity": "Alta",
  "status": "FAIL"
}
```

## Métricas de ejecución — `qa-results/analytics/execution-metrics.json`

```json
{
  "campaign": "2026-10-12-q1",
  "env": "local",
  "total": 145,
  "passed": 138,
  "failed": 6,
  "flaky": 1,
  "durationMs": 482000,
  "startedAt": "2026-10-12T14:00:00.000Z"
}
```

## Resumen de cobertura — `qa-results/analytics/coverage-summary.json`

```json
{
  "screens": 8,
  "covered": 8,
  "endpoints": 13,
  "covered": 13,
  "cases": {
    "happy": 52,
    "negative": 34,
    "limit": 12,
    "extreme": 8,
    "absurd": 6,
    "security": 9,
    "realUser": 24
  }
}
```

## Consolidación de hallazgos

Cada defecto consolida, dentro de su `BUG-XXX.md`:

| Campo | Qué contiene |
|-------|--------------|
| Descripción | Qué se hizo y qué se esperaba |
| Pasos | Secuencia exacta para reproducir |
| Resultado esperado | Comportamiento documentado (de `modules/api/` o `docs/07-decisiones.md`) |
| Resultado obtenido | Comportamiento observado |
| Evidencias | Rutas relativas de screenshots, videos, traces, console y network |
| Componentes involucrados | Módulo, pantalla, componente y caso de prueba |

El QA **no** corrige: su responsabilidad finaliza cuando toda la información necesaria para el diagnóstico y la corrección está generada y almacenada de manera estructurada.