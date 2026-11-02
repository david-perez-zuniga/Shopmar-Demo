/**
 * Tokens de color de los gráficos del resumen.
 *
 * Devuelven el nombre del token (`--m3-*`), no su valor: el marcado lo envuelve
 * en `var(...)`. Puros y sin DOM, para poder probar cada rama —incluido el
 * fallback inalcanzable desde los fixtures— de forma directa.
 */

import type { IChannelBreakdownPoint, IShipmentBreakdownPoint } from "../core/types"

type ShipmentMethod = IShipmentBreakdownPoint["method"]

const SHIPMENT_TOKENS: Readonly<Partial<Record<ShipmentMethod, string>>> = {
  cargotrans: "--m3-primary",
  delivery: "--m3-tertiary",
  pickup: "--m3-secondary",
  unassigned: "--m3-outline-variant",
}

/** `whatsapp` usa tertiary; cualquier otro canal (hoy `live`) usa primary. */
export function channelColor(point: Pick<IChannelBreakdownPoint, "channel">): string {
  return point.channel === "whatsapp" ? "--m3-tertiary" : "--m3-primary"
}

/**
 * Método de envío conocido → token propio; desconocido → `--m3-outline`. El
 * tipo cierra los cuatro métodos, así que el fallback sólo se alcanza con un
 * valor fuera del contrato (por eso su test castea).
 */
export function shipmentColor(point: Pick<IShipmentBreakdownPoint, "method">): string {
  return SHIPMENT_TOKENS[point.method] ?? "--m3-outline"
}
