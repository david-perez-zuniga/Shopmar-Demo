/**
 * Posición del tooltip de los gráficos del resumen dentro del rectángulo con
 * scroll.
 *
 * Función pura: sólo números, nunca un `MouseEvent` ni un `DOMRect` vivo. El
 * listener de `mousemove` de `bar-chart.ts` le aplana el rect antes de
 * llamarla. Vive acá —y no dentro de `bar-chart.ts`— para poder probar el
 * clamp sin DOM contra `fixtures/chart-tooltip.json`.
 */

export type TooltipRect = {
  left: number
  top: number
  width: number
  height: number
}

export type TooltipPosition = {
  left: number
  top: number
}

/** Separación vertical entre el cursor y el borde inferior del tooltip. */
const GAP_ABOVE_CURSOR = 12
/** Margen mínimo contra los bordes del contenedor. */
const EDGE_PAD = 6
/** Margen lateral extra: el tooltip se centra con `translateX(-50%)`. */
const SIDE_PAD = 4

export function tooltipPosition(
  clientX: number,
  clientY: number,
  rect: TooltipRect,
  tooltipWidth: number,
  tooltipHeight: number,
): TooltipPosition {
  let left = clientX - rect.left
  let top = clientY - rect.top - tooltipHeight - GAP_ABOVE_CURSOR
  top = Math.max(EDGE_PAD, Math.min(top, rect.height - tooltipHeight - EDGE_PAD))
  left = Math.max(
    tooltipWidth / 2 + SIDE_PAD,
    Math.min(left, rect.width - tooltipWidth / 2 - SIDE_PAD),
  )
  return { left, top }
}
