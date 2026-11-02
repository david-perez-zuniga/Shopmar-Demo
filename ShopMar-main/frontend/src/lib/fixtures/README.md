# fixtures/

Líneas base congeladas de los gráficos del resumen.

Cada archivo es la salida de `container.innerHTML` de la implementación
**previa al refactor** de `src/pages/index.astro`, capturada con un arnés
descartable. Es el contrato de los módulos de `src/lib/`: el cálculo puro debe
reproducirla **byte a byte**, sin tocar el marcado, los números ni el formato.
Los tests cargan estos archivos con `readFileSync(..., "utf8")`, por eso no
llevan salto de línea final (la salida original tampoco lo llevaba).

## Gráfico de barras diario

Salida de `renderBarChart` inline (`d58d75b`), congelada en `e3e9f18`. Es el
contrato de `src/lib/summary/bar-chart.ts`.

## Donuts y tooltip

Salida del `renderDonutChart` inline y de su `colorFn` (`37bc030`), congelada
en `458a35b`. Es el contrato de `src/lib/summary/donut-chart.ts`,
`src/lib/summary/chart-colors.ts` y `src/lib/summary/chart-tooltip.ts`.
El harness copiaba el código verbatim desde la página; después se borró.

## Método del arnés

- jsdom, el mismo entorno de `vitest.config.ts`.
- `clientWidth` fijado con `Object.defineProperty(container, "clientWidth", { value: width, configurable: true })`;
  el ancho no se negocia con el layout real. Sólo lo usa el gráfico de barras.
- Serialización con `container.innerHTML` y `readFileSync(..., "utf8")` en el
  test.
- La serie `DIARIO` de `bar-chart.test.ts` carácter por carácter; los datos de
  los donuts son `CANAL` y `ENVIO` de `donut-chart.test.ts`.

## Casos del gráfico de barras

| Archivo | Caso | Qué discrimina |
|---|---|---|
| `bar-chart-900-both.html` | 900 px, `both` | Rama ancha: eje de 84, ticks con `Intl` de moneda y `ratioOuter` 0.9 (las dos series visibles). |
| `bar-chart-400-both.html` | 400 px, `both` | Rama `narrow`: `barWidth` fijo de 13, eje de 56, ticks abreviados `M`/`k` y centrado en el slot de 46. |
| `bar-chart-900-income.html` | 900 px, `income` | Modo filtrado: `single` (sin gastos) y `ratioOuter` 0.6. |

## Casos de los donuts

| Archivo | Caso | Qué discrimina |
|---|---|---|
| `donut-chart-channel.html` | `CANAL`, 2 segmentos | Arco con `dash`/`dashOffset` acumulado, los tokens `--m3-tertiary` (whatsapp) y `--m3-primary` (live), y la celda de dinero con `revenue` real (`C$1,250,750` / `C$838,000`). |
| `donut-chart-shipment.html` | `ENVIO`, 4 segmentos | Los cuatro tokens del método de envío y el `dashOffset` acumulado de cuatro trazos; congela la rareza de abajo. |

Rarezas preexistentes que estos fixtures fijan y que el refactor **debe
conservar**:

- Los puntos de envío (`IShipmentBreakdownPoint`) no traen `revenue`, así que la
  leyenda de `donut-chart-shipment.html` imprime `C$0` cuatro veces. El arco es
  correcto; la celda de dinero es la que queda en cero.
- El arco salta los segmentos con conteo cero (`pct <= 0`), pero la leyenda
  **no** salta nada: un segmento en cero igual aparece listado.
- El `aria-label` sale de `totalLabel.toLowerCase()`; por eso dice
  «Distribución de total» y «Distribución de paquetes».
- Los números se escriben crudos (`stroke-dasharray`, `stroke-dashoffset`): sin
  redondear ni acortar. Reproducirlos obliga a mantener la aritmética exacta.

## `chart-tooltip.json`

Ocho casos de la posición del tooltip (`clientX`, `clientY`, `rect`,
`tooltipWidth`, `tooltipHeight`) con su `left`/`top` grabado. Discriminan, uno
por uno, el clamp contra el borde superior, el inferior, el izquierdo y el
derecho, y combinaciones de ambos. Los números se comparan con `Object.is`
(estricto, sin tolerancia) porque el código escribe los valores crudos en
`style.left`/`style.top`.

## Regla

**No se regeneran para que pase un test.** Si un test falla, el error está en el
módulo, no en el fixture. El diff de estos archivos es la mínima señal de que el
refactor cambió algo que no debía.
