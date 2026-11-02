import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { channelColor, shipmentColor } from "./chart-colors"
import { layoutDonut, renderDonutChart } from "./donut-chart"
import type { IChannelBreakdownPoint, IShipmentBreakdownPoint } from "../core/types"

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures")

// Los mismos datos con los que se generó la línea base en 458a35b: canal con
// revenue, envío sin revenue (la rareza que el fixture deja congelada).
const CANAL: IChannelBreakdownPoint[] = [
  { channel: "whatsapp", count: 9, revenue: "1250750.00", label: "WhatsApp" },
  { channel: "live", count: 4, revenue: "838000.00", label: "Mostrador" },
]

const ENVIO: IShipmentBreakdownPoint[] = [
  { method: "cargotrans", count: 5, label: "Cargotrans" },
  { method: "delivery", count: 3, label: "Delivery" },
  { method: "pickup", count: 2, label: "Retiro en tienda" },
  { method: "unassigned", count: 1, label: "Sin asignar" },
]

function fixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8")
}

/**
 * Reporte legible del primer byte distinto. Devuelve `""` solo cuando los dos
 * textos son idénticos: por eso el `expect(...).toBe("")` es la aserción de
 * byte a byte. Un `toBe` sobre 5 KB de marcado sería ilegible al romperse.
 */
function describeMismatch(actual: string, expected: string): string {
  if (actual === expected) return ""
  const limit = Math.min(actual.length, expected.length)
  let at = 0
  while (at < limit && actual[at] === expected[at]) at += 1
  const from = Math.max(0, at - 60)
  const window = (value: string): string => JSON.stringify(value.slice(from, at + 60))
  return [
    `Primer byte distinto en el offset ${at} (fixture ${expected.length} bytes, render ${actual.length} bytes)`,
    `  esperado: ${window(expected)}`,
    `  recibido: ${window(actual)}`,
  ].join("\n")
}

// El mismo montaje que usó el arnés que generó la línea base: un div en jsdom
// y `container.innerHTML` como camino de serialización.
function mount(): HTMLElement {
  const container = document.createElement("div")
  document.body.append(container)
  return container
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("renderDonutChart", () => {
  it("reproduce donut-chart-channel.html byte a byte", () => {
    const container = mount()
    renderDonutChart(container, CANAL, {
      totalLabel: "TOTAL",
      totalValue: "13 ventas",
      color: channelColor,
    })
    expect(describeMismatch(container.innerHTML, fixture("donut-chart-channel.html"))).toBe("")
  })

  it("reproduce donut-chart-shipment.html byte a byte", () => {
    const container = mount()
    renderDonutChart(container, ENVIO, {
      totalLabel: "PAQUETES",
      totalValue: "11 envíos",
      color: shipmentColor,
    })
    expect(describeMismatch(container.innerHTML, fixture("donut-chart-shipment.html"))).toBe("")
  })

  it("no hace nada con un contenedor nulo", () => {
    expect(() =>
      renderDonutChart(null, CANAL, {
        totalLabel: "TOTAL",
        totalValue: "13 ventas",
        color: channelColor,
      }),
    ).not.toThrow()
  })

  it("escribe el estado vacío sin segmentos", () => {
    const container = mount()
    renderDonutChart(container, [], {
      totalLabel: "TOTAL",
      totalValue: "0 ventas",
      color: channelColor,
    })
    expect(container.innerHTML).toBe('<p class="chart-empty">Sin datos</p>')
  })
})

describe("layoutDonut", () => {
  it("marca vacío un arreglo sin segmentos", () => {
    const vacio: IChannelBreakdownPoint[] = []
    const layout = layoutDonut(vacio, {
      totalLabel: "TOTAL",
      totalValue: "0 ventas",
      color: channelColor,
    })
    expect(layout.empty).toBe(true)
    expect(layout.segments).toEqual([])
  })

  it("marca vacío un total <= 0", () => {
    const enCero: IChannelBreakdownPoint[] = [
      { channel: "whatsapp", count: 0, revenue: "0", label: "WhatsApp" },
    ]
    const layout = layoutDonut(enCero, {
      totalLabel: "TOTAL",
      totalValue: "0 ventas",
      color: channelColor,
    })
    expect(layout.empty).toBe(true)
  })

  it("acumula el dashOffset con la suma corrida", () => {
    const layout = layoutDonut(CANAL, {
      totalLabel: "TOTAL",
      totalValue: "13 ventas",
      color: channelColor,
    })
    expect(layout.empty).toBe(false)
    expect(layout.total).toBe(13)
    expect(layout.segments[0].dashOffset).toBe(0)
    expect(layout.segments[1].dashOffset).toBe(-layout.segments[0].dash)
  })

  it("salta del arco un segmento en cero pero lo conserva en la leyenda", () => {
    const conCero: IChannelBreakdownPoint[] = [
      { channel: "whatsapp", count: 3, revenue: "0", label: "A" },
      { channel: "live", count: 0, revenue: "0", label: "B" },
      { channel: "live", count: 1, revenue: "0", label: "C" },
    ]
    const layout = layoutDonut(conCero, {
      totalLabel: "TOTAL",
      totalValue: "4 ventas",
      color: channelColor,
    })
    expect(layout.segments).toHaveLength(3)
    expect(layout.segments[1].rendered).toBe(false)
    expect(layout.segments[1].pct).toBe(0)
    expect(layout.segments[1].label).toBe("B")
    // El arco ignora el cero: el tercer trazo arranca donde terminó el primero.
    expect(layout.segments[2].dashOffset).toBe(-layout.segments[0].dash)
  })

  it("formatea la celda de dinero con Intl es-NI", () => {
    const layout = layoutDonut(CANAL, {
      totalLabel: "TOTAL",
      totalValue: "13 ventas",
      color: channelColor,
    })
    expect(layout.segments[0].money).toBe("C$1,250,750")
    expect(layout.segments[1].money).toBe("C$838,000")
  })

  it("los envíos sin revenue formatean C$0", () => {
    const layout = layoutDonut(ENVIO, {
      totalLabel: "PAQUETES",
      totalValue: "11 envíos",
      color: shipmentColor,
    })
    expect(layout.segments.map((seg) => seg.money)).toEqual(["C$0", "C$0", "C$0", "C$0"])
  })
})
