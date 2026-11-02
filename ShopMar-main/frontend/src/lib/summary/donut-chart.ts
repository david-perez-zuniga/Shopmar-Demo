/**
 * Donut de ventas por canal / método de envío del resumen.
 *
 * `layoutDonut` es geometría pura: no toca `document` ni `window`. Devuelve el
 * total, la circunferencia y una entrada por segmento con su proporción, los
 * `stroke-dasharray`/`stroke-dashoffset`, el token de color ya resuelto, la
 * etiqueta, el conteo y la celda de dinero formateada, más el `aria-label` y el
 * flag `empty` (que cubre los dos cortes tempranos: sin segmentos y total <= 0).
 * El salto del arco para un segmento en cero queda como dato (`rendered`): la
 * leyenda no salta nada, el arco sí. `renderDonutChart` es el único que escribe
 * `container.innerHTML`.
 *
 * El módulo no importa `lib/chart-colors`: el resolvedor de color entra por
 * opción. Réplica exacta de `renderDonutChart` inline de la página (458a35b);
 * los fixtures `donut-chart-*.html` son su salida byte a byte.
 */

/** Lado del SVG y del wrapper, y grosor del trazo: fijos, no parametrizados. */
const DONUT_SIZE = 160
const DONUT_STROKE_WIDTH = 14

const ARIA_PREFIX = "Distribución de "

/**
 * Entrada mínima común a canal y envío. `revenue` es opcional porque
 * `IShipmentBreakdownPoint` no lo trae: la leyenda de envíos imprime `C$0`
 * (rareza preexistente que el fixture congela).
 */
type DonutSegmentInput = {
  label: string
  count: number
  revenue?: string
}

export type DonutLayoutOptions<T extends DonutSegmentInput> = {
  totalLabel: string
  totalValue: string
  /** Token `--m3-*` por segmento; entra desde afuera para no acoplar el color. */
  color: (segment: T) => string
}

export type DonutSegmentLayout = {
  label: string
  count: number
  /** Proporción 0..1; usada por el arco. `0` marca el segmento como no dibujado. */
  pct: number
  dash: number
  /** Ya negado: es el valor literal que se escribe en `stroke-dashoffset`. */
  dashOffset: number
  color: string
  money: string
  rendered: boolean
}

export type DonutLayout = {
  empty: boolean
  ariaLabel: string
  total: number
  size: number
  strokeWidth: number
  radius: number
  circumference: number
  segments: DonutSegmentLayout[]
}

export function layoutDonut<T extends DonutSegmentInput>(
  segments: readonly T[],
  options: DonutLayoutOptions<T>,
): DonutLayout {
  const radius = (DONUT_SIZE - DONUT_STROKE_WIDTH) / 2
  const circumference = 2 * Math.PI * radius
  const total = segments.reduce((sum, segment) => sum + segment.count, 0)
  const ariaLabel = ARIA_PREFIX + options.totalLabel.toLowerCase()

  if (segments.length === 0 || total <= 0) {
    return {
      empty: true,
      ariaLabel,
      total,
      size: DONUT_SIZE,
      strokeWidth: DONUT_STROKE_WIDTH,
      radius,
      circumference,
      segments: [],
    }
  }

  const moneyFormatter = new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 0,
  })

  // El arco acumula sólo los trazos dibujados; un segmento en cero no avanza el
  // offset, pero sí queda en la lista para que la leyenda lo muestre.
  let offset = 0
  const layoutSegments: DonutSegmentLayout[] = segments.map((segment) => {
    const pct = segment.count / total
    const dash = pct * circumference
    const rendered = pct > 0
    // `-0` y `0` son indistinguibles al escribir el atributo: se guarda `0`
    // limpio para que el dato no sorprenda a una comparación estricta.
    const dashOffset = offset === 0 ? 0 : -offset
    if (rendered) offset += dash
    return {
      label: segment.label,
      count: segment.count,
      pct,
      dash,
      dashOffset,
      color: options.color(segment),
      money: moneyFormatter.format(Number(segment.revenue || 0)),
      rendered,
    }
  })

  return {
    empty: false,
    ariaLabel,
    total,
    size: DONUT_SIZE,
    strokeWidth: DONUT_STROKE_WIDTH,
    radius,
    circumference,
    segments: layoutSegments,
  }
}

export function renderDonutChart<T extends DonutSegmentInput>(
  container: HTMLElement | null,
  segments: readonly T[],
  options: DonutLayoutOptions<T>,
): void {
  if (container === null) return

  const layout = layoutDonut(segments, options)
  if (layout.empty) {
    container.innerHTML = '<p class="chart-empty">Sin datos</p>'
    return
  }

  const { ariaLabel, circumference, radius, size, strokeWidth, total } = layout
  const list = layout.segments

  let svg = `<svg class="donut-chart__svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${ariaLabel}" style="width:100%;height:100%;transform:rotate(-90deg);">`

  for (const segment of list) {
    if (!segment.rendered) continue
    svg += `<circle class="donut-chart__segment" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke="var(${segment.color})" stroke-width="${strokeWidth}" stroke-dasharray="${segment.dash} ${circumference}" stroke-dashoffset="${segment.dashOffset}" stroke-linecap="round" fill="transparent" />`
  }

  svg += "</svg>"

  const center = `<div class="donut-chart__center" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center;pointer-events:none;"><span style="font-size:var(--m3-fs-label-xs);font-weight:500;color:var(--m3-on-surface-variant);text-transform:uppercase;letter-spacing:0.03em;">${options.totalLabel}</span><span style="font-size:var(--m3-fs-tabular-num-sm);font-weight:600;color:var(--m3-on-surface);font-family:var(--m3-font-mono,monospace);">${options.totalValue}</span></div>`

  // La leyenda recorre todos los segmentos: no salta los de conteo cero.
  let legend =
    '<ul class="donut-chart__legend" aria-hidden="true" style="display:flex;flex-direction:column;gap:var(--m3-space-1);width:100%;max-width:280px;">'
  for (const segment of list) {
    const pct = Math.round((segment.count / total) * 100)
    legend += `<li style="display:flex;align-items:center;justify-content:space-between;padding:var(--m3-space-1) var(--m3-space-2);background:var(--m3-surface-container-low);border-radius:var(--radius-sm);font-size:var(--m3-fs-tabular-num-sm);"><div style="display:flex;align-items:center;gap:var(--m3-space-2);"><span style="width:10px;height:10px;border-radius:50%;background:var(${segment.color});flex-shrink:0;"></span><div style="display:flex;flex-direction:column;gap:2px;"><div style="font-weight:600;color:var(--m3-on-surface);">${segment.label}</div><div style="font-size:var(--m3-fs-label-xs);color:var(--m3-on-surface-variant);">${segment.count} (${pct}%)</div></div></div><div style="font-family:var(--m3-font-mono,monospace);font-weight:600;color:var(--m3-on-surface);font-size:var(--m3-fs-tabular-num-sm);text-align:right;white-space:nowrap;">${segment.money}</div></li>`
  }
  legend += "</ul>"

  container.innerHTML = `<div class="donut-chart" style="display:flex;flex-direction:column;align-items:center;gap:var(--m3-space-3);font-family:var(--m3-font-body,system-ui);"><div class="donut-chart__wrapper" style="position:relative;width:${size}px;height:${size}px;flex-shrink:0;">${svg}${center}</div>${legend}</div>`
}
