/**
 * Gráfico de barras diario del resumen.
 *
 * `layoutBarChart` es geometría pura: no toca `document` ni `window` y recibe
 * el ancho como número. `renderBarChart` es el único que lee `clientWidth`
 * (una sola vez) y escribe el DOM. Sin clase, sin fábrica y sin estado de
 * módulo: una llamada deja el contenedor renderizado entero.
 *
 * La aritmética replica exactamente la del script de la página (d58d75b); los
 * fixtures de `fixtures/` son la salida byte a byte de esa implementación.
 */

import { tooltipPosition } from "./chart-tooltip"
import type { IDailySeriesPoint } from "../core/types"

export type BarChartMode = "income" | "expense" | "both"

export type BarChartLayoutOptions = {
  width: number
  mode: BarChartMode
}

export type BarChartBar = {
  type: "income" | "expense"
  x: number
  y: number
  width: number
  height: number
  label: string
  value: number
}

export type BarChartTick = {
  value: number
  text: string
  y: number
}

export type BarChartXLabel = {
  /** El rótulo del punto, completo: `"19:00"` o `"Mié 21"`. Es el del tooltip. */
  label: string
  /** Lo que se dibuja bajo el eje: la hora sola (`"19"`) cuando el punto es una hora. */
  text: string
  x: number
}

export type BarChartLayout = {
  empty: boolean
  narrow: boolean
  ariaLabel: string
  legend: { income: boolean; expense: boolean }
  max: number
  /** Factor de escala alto-valor: la relación que usan las barras y el tooltip. */
  scale: number
  barWidth: number
  gapInner: number
  gapOuter: number
  plotTop: number
  chartHeight: number
  yAxisWidth: number
  yTicks: number
  totalWidth: number
  totalHeight: number
  ticks: BarChartTick[]
  bars: BarChartBar[]
  xLabels: BarChartXLabel[]
}

const NARROW_MAX_WIDTH = 480
const NARROW_SLOT = 46
const NARROW_BAR_WIDTH = 13
const CHART_HEIGHT = 220
const PLOT_TOP = 16
const Y_TICKS = 5
const Y_AXIS_NARROW = 56
const Y_AXIS_WIDE = 84
const PLOT_RIGHT_PAD = 8
const PLOT_LEFT_PAD = 14
const MIN_AVAILABLE = 280
const X_LABEL_GAP = 26
const BOTTOM_PAD = 40

/**
 * Ancho medio de un carácter de etiqueta a 11px y aire mínimo entre etiquetas
 * vecinas. Con esto se decide cada cuántos puntos se dibuja un rótulo: 24 horas
 * no entran una al lado de la otra, y una barra de 20px tampoco admite `00:00`.
 */
const X_LABEL_CHAR_WIDTH = 6.2
const X_LABEL_MIN_GAP = 6
/**
 * A partir de cuántos puntos el eje está apretado. Con muchas barras el aire
 * entre ellas se calcula más ancho que la barra: la barra se angosta y el hueco
 * crece sin que el gráfico se estire, que es lo que deja entrar la etiqueta.
 */
const CROWDED_POINTS = 12
/** Pasos en los que se prefiere adelgazar: horas cada 2, cada 3, cada 4, cada 6… */
const X_LABEL_STEPS = [1, 2, 3, 4, 6, 8, 12] as const

const ARIA_COMPARATIVE = "Gráfico de barras comparativo de ingresos y gastos diarios"
const ARIA_INCOME = "Gráfico de barras de ingresos diarios"
const ARIA_EXPENSE = "Gráfico de barras de gastos diarios"

/** Formato del eje en la rama ancha: moneda sin centavos. */
function formatAxisValue(value: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 0,
  }).format(value)
}

/** Formato del eje en la rama estrecha: abreviatura M / k para no desbordar. */
function formatNarrowTick(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1000000) {
    return `${(value / 1000000).toLocaleString("es-NI", { maximumFractionDigits: 1 })} M`
  }
  if (abs >= 1000) {
    return `${(value / 1000).toLocaleString("es-NI", { maximumFractionDigits: 1 })} k`
  }
  return String(Math.round(value))
}

/**
 * Texto del eje para un punto. Una hora (`"19:00"`) se dibuja como hora de
 * reloj con am/pm (`"7 pm"`): 24 rótulos de cinco caracteres no entran uno al
 * lado del otro, y `"7 pm"` sí. El rótulo completo (`"19:00"`) sigue en el
 * punto y es el que muestra el tooltip.
 */
export function axisText(label: string): string {
  const match = /^(\d{1,2}):00$/.exec(label)
  if (match === null) return label
  const hour = Number(match[1])
  const clock = hour % 12 === 0 ? 12 : hour % 12
  return `${clock} ${hour < 12 ? "am" : "pm"}`
}

/**
 * Cada cuántos puntos del eje se dibuja un rótulo. Con 24 horas (o con barras
 * angostas) `slot` es más chico que una etiqueta y hay que saltear puntos; con
 * una semana de días entra uno por día y el paso queda en 1 (S4).
 */
export function xLabelStep(labels: readonly string[], slot: number): number {
  if (labels.length === 0) return 1
  const widest = labels.reduce((max, label) => Math.max(max, label.length), 0)
  const needed = widest * X_LABEL_CHAR_WIDTH + X_LABEL_MIN_GAP
  for (const step of X_LABEL_STEPS) {
    if (slot * step >= needed) return step
  }
  return X_LABEL_STEPS[X_LABEL_STEPS.length - 1]
}

export function layoutBarChart(
  daily: readonly IDailySeriesPoint[],
  options: BarChartLayoutOptions,
): BarChartLayout {
  const { width, mode } = options
  const showIncome = mode !== "expense"
  const showExpense = mode !== "income"
  const data = daily.map((point) => ({
    label: point.label,
    income: Number(point.income),
    expense: Number(point.expense),
  }))

  const narrow = width < NARROW_MAX_WIDTH
  const yAxisWidth = narrow ? Y_AXIS_NARROW : Y_AXIS_WIDE
  const totalHeight = PLOT_TOP + CHART_HEIGHT + BOTTOM_PAD

  const hasVisible = data.some(
    (day) => (showIncome && day.income > 0) || (showExpense && day.expense > 0),
  )

  if (data.length === 0 || !hasVisible) {
    return {
      empty: true,
      narrow,
      ariaLabel: ARIA_COMPARATIVE,
      legend: { income: false, expense: false },
      max: 0,
      scale: 0,
      barWidth: 0,
      gapInner: 0,
      gapOuter: 0,
      plotTop: PLOT_TOP,
      chartHeight: CHART_HEIGHT,
      yAxisWidth,
      yTicks: Y_TICKS,
      totalWidth: 0,
      totalHeight,
      ticks: [],
      bars: [],
      xLabels: [],
    }
  }

  const max =
    Math.max(
      ...data.flatMap((day) => [showIncome ? day.income : 0, showExpense ? day.expense : 0]),
    ) || 1
  const hasIncome = showIncome && data.some((day) => day.income > 0)
  const hasExpense = showExpense && data.some((day) => day.expense > 0)
  const single = hasIncome !== hasExpense

  const dayBars = data.map((day) => {
    const bars: ("income" | "expense")[] = []
    if (showIncome && day.income > 0) bars.push("income")
    if (showExpense && day.expense > 0) bars.push("expense")
    return bars
  })
  const barCount = dayBars.reduce((sum, bars) => sum + Math.max(1, bars.length), 0)
  const innerCount = dayBars.reduce((sum, bars) => sum + Math.max(0, bars.length - 1), 0)

  const ratioInner = narrow ? 0.3 : 0.35
  // Un eje apretado (24 horas, un mes) gana aire: el hueco entre días crece y la
  // barra se angosta, sin estirar el gráfico.
  const crowded = data.length >= CROWDED_POINTS
  const ratioOuter = crowded ? 1.15 : hasIncome && hasExpense ? 0.9 : 0.6
  const plotLeft = yAxisWidth + PLOT_LEFT_PAD
  const available = Math.max(MIN_AVAILABLE, width)
  const units = barCount + innerCount * ratioInner + (data.length + 1) * ratioOuter
  const barWidth = narrow
    ? NARROW_BAR_WIDTH
    : Math.max(8, Math.floor((available - plotLeft - PLOT_RIGHT_PAD) / units))
  const gapInner = Math.max(4, Math.round(barWidth * ratioInner))
  let gapOuter = Math.max(10, Math.round(barWidth * ratioOuter))

  // La ranura de un día no puede ser más angosta que su etiqueta: si lo es, el
  // aire se agranda (y el gráfico se recorre en horizontal) antes que adelgazar
  // los rótulos. Es lo que mantiene la hora por hora.
  const widestText = data.reduce((max, day) => Math.max(max, axisText(day.label).length), 0)
  const minSlot = widestText * X_LABEL_CHAR_WIDTH + X_LABEL_MIN_GAP
  if (!narrow && barWidth + gapOuter < minSlot) gapOuter = Math.ceil(minSlot) - barWidth

  const dayStart: number[] = []
  let cursor = plotLeft
  for (const bars of dayBars) {
    const k = Math.max(1, bars.length)
    const groupWidth = k * barWidth + (k - 1) * gapInner
    dayStart.push(cursor + (narrow ? (NARROW_SLOT - groupWidth) / 2 : 0))
    cursor += narrow ? NARROW_SLOT : groupWidth + gapOuter
  }
  const totalWidth = cursor
  const scale = CHART_HEIGHT / max

  const bars: BarChartBar[] = []
  data.forEach((day, i) => {
    const list = dayBars[i]
    for (let j = 0; j < list.length; j++) {
      const type = list[j]
      const value = type === "income" ? day.income : day.expense
      const height = value * scale
      bars.push({
        type,
        x: dayStart[i] + j * (barWidth + gapInner),
        y: PLOT_TOP + (CHART_HEIGHT - height),
        width: barWidth,
        height,
        label: day.label,
        value,
      })
    }
  })

  const xLabels: BarChartXLabel[] = []
  const texts = data.map((day) => axisText(day.label))
  const slot = data.length === 0 ? 0 : (totalWidth - plotLeft) / data.length
  const labelStep = xLabelStep(texts, slot)
  data.forEach((day, i) => {
    if (i % labelStep !== 0) return
    const k = dayBars[i].length
    const x =
      k === 0
        ? dayStart[i] + barWidth / 2
        : dayStart[i] + (k * barWidth + (k - 1) * gapInner) / 2
    xLabels.push({ label: day.label, text: texts[i], x })
  })

  const ticks: BarChartTick[] = []
  for (let i = 0; i <= Y_TICKS; i++) {
    const value = max - (max / Y_TICKS) * i
    const y = PLOT_TOP + (CHART_HEIGHT / Y_TICKS) * i
    ticks.push({ value, text: narrow ? formatNarrowTick(value) : formatAxisValue(value), y })
  }

  const ariaLabel = single ? (hasIncome ? ARIA_INCOME : ARIA_EXPENSE) : ARIA_COMPARATIVE

  return {
    empty: false,
    narrow,
    ariaLabel,
    legend: { income: hasIncome, expense: hasExpense },
    max,
    scale,
    barWidth,
    gapInner,
    gapOuter,
    plotTop: PLOT_TOP,
    chartHeight: CHART_HEIGHT,
    yAxisWidth,
    yTicks: Y_TICKS,
    totalWidth,
    totalHeight,
    ticks,
    bars,
    xLabels,
  }
}

export function renderBarChart(
  container: HTMLElement | null,
  daily: readonly IDailySeriesPoint[],
  mode: BarChartMode,
): void {
  if (container === null) return

  // El ancho se lee una sola vez: narrow y `available` salen del mismo número.
  const layout = layoutBarChart(daily, { width: container.clientWidth, mode })
  if (layout.empty) {
    container.innerHTML = '<p class="chart-empty">Sin datos para el período</p>'
    return
  }

  const {
    ariaLabel,
    bars,
    chartHeight,
    legend: legendVisibility,
    plotTop,
    ticks,
    totalHeight,
    totalWidth,
    xLabels,
    yAxisWidth,
  } = layout

  let svg = `<svg class="bar-chart__svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}" style="display:block;max-width:none;" role="img" aria-label="${ariaLabel}">`

  svg += '<g class="bar-chart__grid">'
  for (const tick of ticks) {
    svg += `<line x1="${yAxisWidth}" y1="${tick.y}" x2="${totalWidth}" y2="${tick.y}" stroke="var(--m3-outline-variant)" stroke-dasharray="3 3" />`
  }
  svg += "</g>"

  svg += '<g class="bar-chart__axis">'
  svg += `<line class="domain" x1="${yAxisWidth}" y1="${plotTop}" x2="${yAxisWidth}" y2="${plotTop + chartHeight}" stroke="var(--m3-outline)" />`
  for (const tick of ticks) {
    svg += `<g><line x1="${yAxisWidth - 4}" y1="${tick.y}" x2="${yAxisWidth}" y2="${tick.y}" stroke="var(--m3-outline)" /><text x="${yAxisWidth - 8}" y="${tick.y + 4}" fill="var(--m3-on-surface-variant)" font-size="11" text-anchor="end" dominant-baseline="middle">${tick.text}</text></g>`
  }
  svg += "</g>"

  svg += '<g class="bar-chart__bars">'
  for (const bar of bars) {
    const fill = bar.type === "income" ? "var(--m3-primary)" : "var(--m3-secondary)"
    svg += `<rect class="bar-chart__bar bar-chart__bar--${bar.type}" x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" rx="3" fill="${fill}" data-label="${bar.label}" data-value="${bar.value}" data-type="${bar.type}" />`
  }
  svg += "</g>"

  svg += '<g class="bar-chart__x-labels">'
  for (const xLabel of xLabels) {
    svg += `<text x="${xLabel.x}" y="${plotTop + chartHeight + X_LABEL_GAP}" fill="var(--m3-on-surface-variant)" font-size="11" text-anchor="middle">${xLabel.text}</text>`
  }
  svg += "</g>"

  svg += "</svg>"

  const legendSwatch = (color: string) =>
    `<span class="bar-chart__legend-swatch" style="background:${color};width:12px;height:12px;border-radius:var(--radius-sm);display:inline-block;"></span>`
  const legendItems: string[] = []
  if (legendVisibility.income) {
    legendItems.push(
      `<span class="bar-chart__legend-item" style="display:inline-flex;align-items:center;gap:var(--m3-space-1);">${legendSwatch("var(--m3-primary)")}Ingresos</span>`,
    )
  }
  if (legendVisibility.expense) {
    legendItems.push(
      `<span class="bar-chart__legend-item" style="display:inline-flex;align-items:center;gap:var(--m3-space-1);">${legendSwatch("var(--m3-secondary)")}Gastos</span>`,
    )
  }
  const legend = `<div class="bar-chart__legend" aria-hidden="true" style="display:flex;flex-wrap:wrap;gap:var(--m3-space-3);font-size:var(--m3-fs-label-sm,12px);align-items:center;margin-bottom:var(--m3-space-2);">${legendItems.join("")}</div>`

  const tooltipMarkup = `<div class="bar-chart__tooltip" hidden aria-hidden="true" style="position:absolute;pointer-events:none;background:var(--m3-inverse-surface);color:var(--m3-inverse-on-surface);padding:var(--m3-space-1) var(--m3-space-2);border-radius:var(--radius-sm);font-size:var(--m3-fs-label-xs);line-height:1.4;box-shadow:var(--m3-shadow-lg,0 10px 15px -3px rgba(0,0,0,0.1));z-index:10;transform:translateX(-50%);white-space:nowrap;left:0;top:0;"></div>`

  const scrollWrap = `<div class="bar-chart__scroll" style="position:relative;overflow-x:auto;overflow-y:hidden;padding-bottom:4px;">${svg}${tooltipMarkup}</div>`

  container.innerHTML = legend + scrollWrap

  const scroll = container.querySelector(".bar-chart__scroll")
  const tooltip = container.querySelector<HTMLDivElement>(".bar-chart__tooltip")
  const barNodes = container.querySelectorAll<HTMLElement>(".bar-chart__bar")
  if (tooltip && scroll && barNodes.length) {
    barNodes.forEach((bar) => {
      bar.addEventListener("mouseenter", () => {
        const label = bar.getAttribute("data-label")
        const value = Number(bar.getAttribute("data-value"))
        const type = bar.getAttribute("data-type")
        const formatValue = (raw: number) =>
          new Intl.NumberFormat("es-NI", {
            style: "currency",
            currency: "NIO",
            minimumFractionDigits: 0,
          }).format(raw)
        tooltip.innerHTML = `<strong>${label}</strong><br>${type === "income" ? "Ingresos" : "Gastos"}: <strong>${formatValue(value)}</strong>`
        tooltip.hidden = false
      })
      bar.addEventListener("mousemove", (event: MouseEvent) => {
        const rect = scroll.getBoundingClientRect()
        const tooltipWidth = tooltip.offsetWidth || 120
        const tooltipHeight = tooltip.offsetHeight || 40
        const position = tooltipPosition(
          event.clientX,
          event.clientY,
          { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          tooltipWidth,
          tooltipHeight,
        )
        tooltip.style.left = `${position.left}px`
        tooltip.style.top = `${position.top}px`
      })
      bar.addEventListener("mouseleave", () => {
        tooltip.hidden = true
      })
    })
  }
}
