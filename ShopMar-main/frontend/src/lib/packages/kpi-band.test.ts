import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { kpiBandView, paintKpiFilter, paintPackageKpis } from "./kpi-band"
import type { IPackageKpis } from "../core/types"

/**
 * Líneas base congeladas de la banda KPI de paquetes. Ver
 * `fixtures/packages/README.md`: no se regeneran para que pase un test.
 */
const FIXTURES = resolve("src/lib/fixtures/packages")
const PAGE = resolve("src/components/views/PackagesView.astro")

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8")
}

/**
 * El arnés cortó el HTML de la propia vista —desde el fin del frontmatter, que
 * es markup puro— y lo inyectó en jsdom; el test obtiene su root exactamente
 * igual. No se escribe el markup a mano: una copia se desincronizaría de la
 * vista y los fixtures dejarían de significar algo.
 */
function mountBand(): HTMLElement {
  const source = readFileSync(PAGE, "utf8")
  const frontmatterEnd = source.indexOf("---", source.indexOf("---") + 3) + 3
  document.body.innerHTML = source.slice(frontmatterEnd)
  const band = document.querySelector<HTMLElement>(".kpi-band")
  if (band === null) throw new Error("la vista no trae .kpi-band")
  return band
}

/** Los valores con los que el arnés generó los dos fixtures de la banda. */
const KPIS: IPackageKpis = {
  total: 148,
  cargotrans: 61,
  delivery: 43,
  pickup: 29,
  unassigned: 15,
}

/** Igual que en las filas: deja a la vista el offset y la ventana de ambos. */
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

function paintBand(search: string): string {
  window.history.replaceState(null, "", search)
  const band = mountBand()
  paintPackageKpis(KPIS)
  paintKpiFilter()
  return band.outerHTML
}

const CASES: ReadonlyArray<{ file: string; search: string }> = [
  { file: "kpi-band-no-method-filter.html", search: "" },
  { file: "kpi-band-method-filter.html", search: "?shipment_method=delivery" },
]

describe("kpi-band: equivalencia con los fixtures congelados", () => {
  for (const { file, search } of CASES) {
    it(`reproduce ${file} byte a byte`, () => {
      const actual = paintBand(search)
      const expected = fixture(file)
      expect(actual, describeDiff(actual, expected)).toBe(expected)
    })
  }
})

describe("kpiBandView: decisión pura de visibilidad", () => {
  it("sin filtro no oculta ninguna tarjeta ni muestra la nota", () => {
    const view = kpiBandView("")
    expect(view.filtered).toBe(false)
    expect(view.note).toBeNull()
    for (const field of ["total", "cargotrans", "delivery", "pickup", "unassigned"]) {
      expect(view.isCardHidden(field)).toBe(false)
    }
  })

  it("un filtro igual al total oculta el resto de las tarjetas", () => {
    const view = kpiBandView("total")
    expect(view.filtered).toBe(true)
    expect(view.isCardHidden("total")).toBe(false)
    expect(view.isCardHidden("delivery")).toBe(true)
  })

  it("un filtro de método deja visibles el total y ese método", () => {
    const view = kpiBandView("delivery")
    expect(view.isCardHidden("total")).toBe(false)
    expect(view.isCardHidden("delivery")).toBe(false)
    expect(view.isCardHidden("cargotrans")).toBe(true)
    expect(view.isCardHidden("pickup")).toBe(true)
    expect(view.isCardHidden("unassigned")).toBe(true)
  })

  it("un filtro sin tarjeta propia solo deja visible el total", () => {
    const view = kpiBandView("express")
    expect(view.isCardHidden("total")).toBe(false)
    for (const field of ["cargotrans", "delivery", "pickup", "unassigned"]) {
      expect(view.isCardHidden(field)).toBe(true)
    }
  })

  it("la nota explica el recorte cuando hay filtro", () => {
    expect(kpiBandView("delivery").note).toBe(
      "Los totales del período no incluyen las ventas canceladas.",
    )
  })
})
