import { describe, expect, it } from "vitest"
import { channelColor, shipmentColor } from "./chart-colors"
import type { IShipmentBreakdownPoint } from "../core/types"

describe("shipmentColor", () => {
  it("mapea los cuatro métodos conocidos", () => {
    expect(shipmentColor({ method: "cargotrans" })).toBe("--m3-primary")
    expect(shipmentColor({ method: "delivery" })).toBe("--m3-tertiary")
    expect(shipmentColor({ method: "pickup" })).toBe("--m3-secondary")
    expect(shipmentColor({ method: "unassigned" })).toBe("--m3-outline-variant")
  })

  // El fallback es inalcanzable desde los fixtures (los cuatro métodos están
  // cubiertos): se prueba directo.
  it("cae a --m3-outline para un método desconocido", () => {
    const fueraDelContrato = { method: "unknown" as IShipmentBreakdownPoint["method"] }
    expect(shipmentColor(fueraDelContrato)).toBe("--m3-outline")
  })
})

describe("channelColor", () => {
  it("whatsapp usa --m3-tertiary", () => {
    expect(channelColor({ channel: "whatsapp" })).toBe("--m3-tertiary")
  })

  it("cualquier otro canal usa --m3-primary", () => {
    expect(channelColor({ channel: "live" })).toBe("--m3-primary")
  })
})
