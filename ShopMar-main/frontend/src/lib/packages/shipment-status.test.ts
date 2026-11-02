import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  SHIPMENT_OPTIONS,
  SHIPMENT_STYLE,
  buildShipmentSelect,
  createShipmentChangeHandler,
  shipmentAriaLabel,
  shipmentSelectClasses,
} from "./shipment-status"
import type { ISaleListRow, ShipmentMethod } from "../core/types"
import { saleListRowDefaults } from "../core/fixtures"

/**
 * Línea base congelada del `<select>` de envío. Ver
 * `fixtures/packages/README.md`: no se regenera para que pase un test.
 */
const FIXTURES = resolve("src/lib/fixtures/packages")

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8")
}

/** El mismo caso que produjo los fixtures: id, clienta y total fijos. */
const BASE: ISaleListRow = {
    ...saleListRowDefaults,
  id: "sale-7f3a91",
  sale_date: "2025-03-14",
  customer_name: "María Restrepo",
  product_name: "Sudadera oversize bordada",
  type: "live",
  status: "completed",
  cost: "90000.00",
  payment_method: "cash",
  shipment_method: "pickup",
  additional_count: 0,
  total: "125750.00",
}

function saleWith(method: ShipmentMethod): ISaleListRow {
  return { ...BASE, shipment_method: method }
}

function buildControl(method: ShipmentMethod): HTMLDivElement {
  return buildShipmentSelect(saleWith(method), () => {})
}

function selectOf(method: ShipmentMethod): HTMLSelectElement {
  const select = buildControl(method).querySelector("select")
  if (select === null) throw new Error("buildShipmentSelect no construyó un <select>")
  return select
}

/**
 * En un `outerHTML` que no coincide, `toBe` imprime cientos de bytes idénticos
 * de un solo renglón. Esto deja a la vista el offset y la ventana de ambos.
 */
function describeDiff(actual: string, expected: string): string {
  const limit = Math.min(actual.length, expected.length)
  let offset = 0
  while (offset < limit && actual[offset] === expected[offset]) offset += 1
  const from = Math.max(0, offset - 40)
  return [
    `primera diferencia en el offset ${offset}`,
    `esperado: …${expected.slice(from, offset + 80)}…`,
    `actual:   …${actual.slice(from, offset + 80)}…`,
  ].join("\n")
}

const METHODS: readonly ShipmentMethod[] = ["cargotrans", "delivery", "pickup", "unassigned"]

describe("shipment-status: equivalencia con el fixture congelado", () => {
  it("reproduce shipment-select-pickup.html byte a byte", () => {
    const control = buildControl("pickup")
    const expected = fixture("shipment-select-pickup.html")
    expect(control.outerHTML, describeDiff(control.outerHTML, expected)).toBe(expected)
  })

  // jsdom no serializa `option.selected` como atributo: el fixture no puede
  // fijar qué opción quedó elegida. Por eso, además de los bytes, hay que
  // comprobarlo POR PROPIEDAD (`select.value` y cada `option.selected`).
  it("la opción elegida queda solo en la propiedad, nunca en los bytes", () => {
    const select = selectOf("pickup")
    expect(fixture("shipment-select-pickup.html")).not.toContain("selected")

    expect(select.value).toBe("pickup")
    const options = Array.from(select.options)
    expect(options.map((option) => option.value)).toEqual([
      "cargotrans",
      "delivery",
      "pickup",
      "unassigned",
    ])
    for (const option of options) {
      expect(option.selected, `opción ${option.value}`).toBe(option.value === "pickup")
    }
  })
})

describe("buildShipmentSelect: datos del control", () => {
  for (const method of METHODS) {
    it(`con ${method} el select lleva su modificador, el id y el aria-label`, () => {
      const select = selectOf(method)
      expect(select.className).toBe(shipmentSelectClasses(method))
      expect(select.dataset["saleId"]).toBe("sale-7f3a91")
      expect(select.getAttribute("aria-label")).toBe(shipmentAriaLabel("María Restrepo"))
      expect(select.value).toBe(method)
    })
  }

  it("el envoltorio y el caret son los mismos para todos los métodos", () => {
    const control = buildControl("delivery")
    // Devuelve el envoltorio mismo, no una celda: sin el `<td>` anidado que
    // congelaba la extracción.
    expect(control.tagName).toBe("DIV")
    expect(control.className).toBe("shipment-wrap")
    expect(control.querySelector("td")).toBeNull()
    expect(control.querySelector(".shipment-caret")?.getAttribute("aria-hidden")).toBe("true")
  })
})

describe("SHIPMENT_STYLE", () => {
  it("tiene una clase y una etiqueta por método", () => {
    expect(SHIPMENT_STYLE).toEqual({
      cargotrans: { classes: "shipment-select--cargotrans", label: "Cargotrans" },
      delivery: { classes: "shipment-select--delivery", label: "Delivery" },
      pickup: { classes: "shipment-select--pickup", label: "En tienda" },
      unassigned: { classes: "shipment-select--unassigned", label: "Sin asignar" },
    })
  })

  it("la clave pickup se rotula «En tienda»: clave y etiqueta no coinciden", () => {
    expect(SHIPMENT_STYLE.pickup.label).toBe("En tienda")
  })
})

describe("SHIPMENT_OPTIONS", () => {
  it("respeta el orden del mapa: cargotrans, delivery, pickup, unassigned", () => {
    expect(SHIPMENT_OPTIONS).toEqual(["cargotrans", "delivery", "pickup", "unassigned"])
  })
})

describe("shipmentSelectClasses", () => {
  it("cambia solo el modificador del método", () => {
    for (const method of METHODS) {
      expect(shipmentSelectClasses(method)).toBe(
        `shipment-select shipment-select--${method}`,
      )
    }
  })
})

describe("shipmentAriaLabel", () => {
  it("nombra a la clienta con el texto del fixture", () => {
    expect(shipmentAriaLabel("María Restrepo")).toBe(
      "Método de envío de la venta a María Restrepo",
    )
  })
})

/**
 * Monta el control dentro de una fila con `data-sale-id`: el manejador ignora el
 * cambio si el select no está dentro de una fila, así que hace falta el `<tr>`
 * real para ejercitarlo.
 */
function mountSelect(method: ShipmentMethod): HTMLSelectElement {
  const row = document.createElement("tr")
  row.dataset["saleId"] = "sale-7f3a91"
  row.append(buildControl(method))
  document.body.append(row)
  const select = row.querySelector<HTMLSelectElement>("select")
  if (select === null) throw new Error("el control no trae select de envío")
  return select
}

/** Sin esto, los `<tr>` montados se acumulan entre tests. */
afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe("createShipmentChangeHandler: el modelo de fila queda al día", () => {
  // Regresión del defecto 2: el manejador no escribía el método nuevo en el
  // modelo de la fila, así que un segundo cambio calculaba `previous` desde el
  // valor viejo y el rollback restauraba un método que el servidor ya no tenía.
  it("tras un cambio exitoso la fila lleva el método nuevo y repetirlo es un no-op", async () => {
    const sale = saleWith("pickup")
    const calls: Array<[string, ShipmentMethod]> = []
    let reloads = 0
    const handler = createShipmentChangeHandler({
      updateShipmentMethod: (id, method) => {
        calls.push([id, method])
        return Promise.resolve({})
      },
      reloadKpis: () => {
        reloads += 1
      },
    })
    const select = mountSelect("pickup")

    select.value = "delivery"
    await handler(select, sale)

    expect(calls).toEqual([["sale-7f3a91", "delivery"]])
    expect(select.className).toBe(shipmentSelectClasses("delivery"))
    expect(reloads).toBe(1)
    // El modelo de la fila queda con el método nuevo, no con el viejo.
    expect(sale.shipment_method).toBe("delivery")

    // Con el modelo al día, volver a elegir el mismo método no vuelve a pedir el
    // PATCH ni a refrescar los KPIs: el guard `next === previous` funciona.
    await handler(select, sale)
    expect(calls).toEqual([["sale-7f3a91", "delivery"]])
    expect(reloads).toBe(1)
  })

  // Camino de rollback: el PATCH rechaza y el select vuelve al método anterior.
  // El modelo conserva su valor original, así que no queda inconsistencia.
  it("si el PATCH falla, el select vuelve atrás y el modelo no cambia", async () => {
    const sale = saleWith("pickup")
    const alerts: string[] = []
    vi.stubGlobal("alert", (message: string) => {
      alerts.push(message)
    })
    let reloads = 0
    const handler = createShipmentChangeHandler({
      updateShipmentMethod: () => Promise.reject(new Error("500")),
      reloadKpis: () => {
        reloads += 1
      },
    })
    const select = mountSelect("pickup")

    select.value = "delivery"
    await handler(select, sale)

    expect(select.value).toBe("pickup")
    expect(sale.shipment_method).toBe("pickup")
    expect(reloads).toBe(0)
    expect(alerts).toEqual(["Error al cambiar método: 500"])
    expect(select.disabled).toBe(false)
    expect(select.className).toBe(shipmentSelectClasses("pickup"))
  })
})
