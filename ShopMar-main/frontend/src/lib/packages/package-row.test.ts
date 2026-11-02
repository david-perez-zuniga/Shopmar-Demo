import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { packageRowView, renderPackageRow } from "./package-row"
import type { ISaleListRow, ShipmentMethod } from "../core/types"
import { saleListRowDefaults } from "../core/fixtures"

/**
 * Líneas base congeladas de la fila del listado de paquetes. Ver
 * `fixtures/packages/README.md`: no se regeneran para que pase un test.
 */
const FIXTURES = resolve("src/lib/fixtures/packages")
const PAGE = resolve("src/components/views/PackagesView.astro")

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8")
}

/**
 * La plantilla de fila REAL: se corta el HTML de la propia vista —desde el fin
 * del frontmatter hasta el final del archivo, que es markup puro— y se inyecta
 * en el documento, exactamente como hizo el arnés que generó los fixtures. No se
 * escribe el markup a mano: una copia se desincronizaría de la vista y los
 * fixtures dejarían de significar algo.
 */
function rowTemplate(): HTMLTemplateElement {
  const source = readFileSync(PAGE, "utf8")
  const start = source.indexOf("\n---\n") + 5
  if (start < 5) {
    throw new Error("no se pudo cortar la región HTML de components/views/PackagesView.astro")
  }
  const host = document.createElement("div")
  host.innerHTML = source.slice(start)
  const template = host.querySelector<HTMLTemplateElement>("[data-row-template]")
  if (template === null) {
    throw new Error("no hay [data-row-template] en components/views/PackagesView.astro")
  }
  return template
}

/** El mismo caso que produjo los fixtures: id, fecha, clienta y total fijos. */
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

function saleWith(method: ShipmentMethod, additionalCount = 0): ISaleListRow {
  return { ...BASE, shipment_method: method, additional_count: additionalCount }
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

function render(sale: ISaleListRow, template: HTMLTemplateElement | null): string {
  return renderPackageRow(sale, template, () => {}).outerHTML
}

const CASES: ReadonlyArray<{ file: string; method: ShipmentMethod }> = [
  { file: "package-row-cargotrans.html", method: "cargotrans" },
  { file: "package-row-delivery.html", method: "delivery" },
  { file: "package-row-pickup.html", method: "pickup" },
  { file: "package-row-unassigned.html", method: "unassigned" },
]

describe("package-row: equivalencia con los fixtures congelados", () => {
  for (const { file, method } of CASES) {
    it(`reproduce ${file} byte a byte`, () => {
      const actual = render(saleWith(method), rowTemplate())
      const expected = fixture(file)
      expect(actual, describeDiff(actual, expected)).toBe(expected)
    })
  }
})

describe("package-row: forma corregida y rarezas congeladas", () => {
  // Defecto 1, ya corregido a propósito: `buildShipmentSelect` devuelve el
  // `<div class="shipment-wrap">` y la fila lo inserta directo en la celda de
  // método. El `<td>` anidado que era HTML inválido ya no existe y los cuatro
  // fixtures de fila congelan la forma nueva.
  it("la celda de método lleva el envoltorio del select, sin `<td>` anidado", () => {
    const row = renderPackageRow(saleWith("pickup"), rowTemplate(), () => {})
    const method = row.querySelector('[data-cell="method"]')
    expect(method?.firstElementChild?.tagName).toBe("DIV")
    expect(method?.firstElementChild?.className).toBe("shipment-wrap")
    expect(method?.querySelector("td")).toBeNull()
    expect(method?.querySelector("select")).not.toBeNull()
  })

  // Defecto 2, ya corregido a propósito: `cell-clamp` define
  // `display: -webkit-box` para `line-clamp: 1`, y aplicarlo sobre el `<td>`
  // convertía la celda en `flow-root`: `vertical-align: middle` dejaba de
  // aplicar (el texto quedaba arriba) y se perdía el `min-width` de
  // `col-product`. El recorte vive ahora en un `<span>` hijo, como en
  // `sale-list-row.ts`.
  it("la celda de mercadería conserva `col-product` y el recorte va en un span", () => {
    const row = renderPackageRow(saleWith("pickup"), rowTemplate(), () => {})
    const product = row.querySelector('[data-cell="product"]')
    expect(product?.tagName).toBe("TD")
    expect(product?.className).toBe("col-product")
    expect(product?.firstElementChild?.tagName).toBe("SPAN")
    expect(product?.firstElementChild?.className).toBe("cell-clamp")
    expect(product?.textContent).toBe("Sudadera oversize bordada")
  })

  it("ningún `<td>` lleva `cell-clamp`: la clase es de un span interno", () => {
    const row = renderPackageRow(saleWith("pickup"), rowTemplate(), () => {})
    expect(row.querySelectorAll("td.cell-clamp")).toHaveLength(0)
    expect(row.querySelectorAll("span.cell-clamp")).toHaveLength(1)
  })

  it("la fila lleva `data-sale-id` y el select el mismo id", () => {
    const row = renderPackageRow(saleWith("pickup"), rowTemplate(), () => {})
    expect(row.dataset["saleId"]).toBe("sale-7f3a91")
    expect(row.querySelector("select")?.dataset["saleId"]).toBe("sale-7f3a91")
  })

  // La plantilla de fila solo tiene date/customer/product/method/total: no hay
  // celda de conteo, así que `additional_count` nunca se pinta. Una fila con 2
  // adicionales es byte a byte idéntica a una con 9. Rareza preexistente y
  // congelada, no un bug que se arregle en este refactor.
  it("una fila con otro additional_count es byte a byte idéntica", () => {
    const template = rowTemplate()
    expect(render(saleWith("delivery", 2), template)).toBe(
      render(saleWith("delivery", 9), template),
    )
  })

  // `buildRow` devolvía un `<tr>` pelado cuando la plantilla faltaba o su primer
  // hijo no era un `<tr>`. Se conserva tal cual.
  it("sin plantilla devuelve un `<tr>` vacío", () => {
    expect(render(saleWith("pickup"), null)).toBe("<tr></tr>")
  })

  it("con una plantilla cuyo primer hijo no es un `<tr>` devuelve un `<tr>` vacío", () => {
    const template = document.createElement("template")
    template.innerHTML = "<div>otra cosa</div>"
    expect(render(saleWith("pickup"), template)).toBe("<tr></tr>")
  })
})

describe("renderPackageRow: enlace del manejador de cambio", () => {
  it("el `change` del select llega al manejador recibido por parámetro", () => {
    const seen: string[] = []
    const row = renderPackageRow(saleWith("pickup"), rowTemplate(), (select) => {
      seen.push(select.value)
    })
    const select = row.querySelector("select")
    if (select === null) throw new Error("la fila no trae select de envío")

    select.value = "delivery"
    select.dispatchEvent(new Event("change"))

    expect(seen).toEqual(["delivery"])
  })
})

describe("packageRowView: modelo de vista puro", () => {
  it("deriva el id y las celdas de la fila", () => {
    expect(packageRowView(saleWith("pickup"))).toEqual({
      saleId: "sale-7f3a91",
      date: { classes: "num-sm", text: "14/03/2025" },
      customer: { classes: "cell-strong", text: "María Restrepo" },
      product: {
        classes: "col-product",
        textClasses: "cell-clamp",
        text: "Sudadera oversize bordada",
      },
      method: { classes: "col-channel" },
      total: { classes: "col-total right cell-total", text: "C$ 125,750.00" },
    })
  })

  it("el método no cambia las celdas de texto: solo vive en la celda de método", () => {
    const cargotrans = packageRowView(saleWith("cargotrans"))
    const unassigned = packageRowView(saleWith("unassigned"))
    expect({ ...cargotrans, method: null }).toEqual({ ...unassigned, method: null })
    expect(cargotrans.method).toEqual({ classes: "col-channel" })
    expect(unassigned.method).toEqual({ classes: "col-channel" })
  })
})
