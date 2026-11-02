import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { expensesKpi, expensesKpiLabelAndNote, expensesLabel } from "./expenses-kpi"
import { formatCords } from "../core/format"
import { qs, setText } from "../core/dom"
import { readExpensesFilters } from "../lists/filters"
import type { IExpenseResponse } from "../core/types"

const row = (over: Partial<IExpenseResponse> = {}): IExpenseResponse => ({
  id: "e-1",
  name: "Compra de mercadería",
  description: null,
  total: "0.00",
  expense_date: "2026-10-01",
  created_at: "2026-10-01T12:00:00.000Z",
  updated_at: "2026-10-01T12:00:00.000Z",
  ...over,
})

describe("expensesKpi", () => {
  it("un arreglo vacío da ceros, no NaN", () => {
    const kpi = expensesKpi([])
    expect(kpi.total).toBe("0.00")
    expect(kpi.count).toBe(0)
  })

  it("suma los importes y cuenta los gastos", () => {
    const kpi = expensesKpi([
      row({ id: "e-1", total: "35000.00" }),
      row({ id: "e-2", total: "42350.50" }),
      row({ id: "e-3", total: "6999.50" }),
    ])
    expect(kpi.total).toBe("84350.00")
    expect(kpi.count).toBe(3)
  })

  it("no concatena: sumar dos 0.00 da 0.00 y no 0.000.00", () => {
    const kpi = expensesKpi([row({ id: "e-1", total: "0.00" }), row({ id: "e-2", total: "0.00" })])
    expect(kpi.total).toBe("0.00")
  })

  it("suma en centavos: 0.10 + 0.20 da 0.30 y no un fantasma", () => {
    const kpi = expensesKpi([
      row({ id: "e-1", total: "0.10" }),
      row({ id: "e-2", total: "0.20" }),
    ])
    expect(kpi.total).toBe("0.30")
  })

  it("absorbe mil importes sin que aparezca ni falte un peso", () => {
    const rows = Array.from({ length: 1000 }, (_, i) =>
      row({ id: `e-${i}`, total: i % 2 === 0 ? "0.10" : "0.20" }),
    )
    expect(expensesKpi(rows).total).toBe("150.00")
  })

  it("redondea a centavos con la misma regla que formatMoney", () => {
    expect(expensesKpi([row({ total: "1.005" })]).total).toBe("1.01")
    expect(expensesKpi([row({ total: "1.004" })]).total).toBe("1.00")
  })

  it("acepta importes sin el segundo decimal", () => {
    expect(expensesKpi([row({ total: "1250.5" })]).total).toBe("1250.50")
  })

  it("un importe ilegible no vuelve NaN todo el total", () => {
    const kpi = expensesKpi([
      row({ id: "e-1", total: "35000.00" }),
      row({ id: "e-2", total: "no-es-un-monto" }),
    ])
    expect(kpi.total).toBe("35000.00")
  })

  it("cuenta todos los gastos aunque el importe sea 0", () => {
    const kpi = expensesKpi([
      row({ id: "e-1", total: "0.00" }),
      row({ id: "e-2", total: "0.00" }),
    ])
    expect(kpi.total).toBe("0.00")
    expect(kpi.count).toBe(2)
  })

  it("no le importa si viene sin descripción", () => {
    expect(expensesKpi([row({ description: null, total: "10.00" })]).total).toBe("10.00")
  })
})

describe("expensesLabel", () => {
  it("pluraliza el sustantivo", () => {
    expect(expensesLabel(5)).toBe("5 gastos registrados")
    expect(expensesLabel(1)).toBe("1 gasto registrado")
    expect(expensesLabel(0)).toBe("0 gastos registrados")
  })
})

describe("expensesKpiLabelAndNote: rótulo y nota del rango", () => {
  it("sin filtro de fechas usa el mes y el historial completo", () => {
    expect(expensesKpiLabelAndNote({ start_date: "", end_date: "" })).toEqual({
      label: "Total Gastos (Mes)",
      note: "Sin filtro de fechas: todo el historial",
    })
  })

  it("con solo start_date ya es rango y la fecha hasta queda en guion", () => {
    expect(expensesKpiLabelAndNote({ start_date: "2025-03-01", end_date: "" })).toEqual({
      label: "Total Gastos (Rango)",
      note: "Entre 01/03/2025 y —",
    })
  })

  it("con solo end_date ya es rango y la fecha desde queda en guion", () => {
    expect(expensesKpiLabelAndNote({ start_date: "", end_date: "2025-03-31" })).toEqual({
      label: "Total Gastos (Rango)",
      note: "Entre — y 31/03/2025",
    })
  })

  it("con las dos fechas arma el rango completo", () => {
    expect(
      expensesKpiLabelAndNote({ start_date: "2025-03-01", end_date: "2025-03-31" }),
    ).toEqual({
      label: "Total Gastos (Rango)",
      note: "Entre 01/03/2025 y 31/03/2025",
    })
  })
})

/**
 * Líneas base de la banda KPI. Ver `fixtures/expenses/README.md`: no se
 * regeneran para que pase un test.
 */
const PAGE = resolve("src/components/views/ExpensesView.astro")
const FIXTURES = resolve("src/lib/fixtures/expenses")

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8")
}

/** Los tres gastos de la línea base; su suma es el total `C$ 16,901.25`. */
const EXPENSES: readonly IExpenseResponse[] = [
  {
    id: "exp-4c81",
    name: "Proveedor Textiles del Norte",
    description: "Reposición de sudaderas para la temporada.",
    total: "12500.50",
    expense_date: "2025-03-04",
    created_at: "2025-03-04T12:00:00.000Z",
    updated_at: "2025-03-04T12:00:00.000Z",
  },
  {
    id: "exp-77b2",
    name: "Transporte Cargotrans",
    description: null,
    total: "3420.00",
    expense_date: "2025-03-11",
    created_at: "2025-03-11T12:00:00.000Z",
    updated_at: "2025-03-11T12:00:00.000Z",
  },
  {
    id: "exp-9ab0",
    name: "Insumos varios",
    description: "Compra de insumos para la semana.",
    total: "980.75",
    expense_date: "2025-03-18",
    created_at: "2025-03-18T12:00:00.000Z",
    updated_at: "2025-03-18T12:00:00.000Z",
  },
]

/**
 * El arnés corta el HTML de la vista —lo que sigue al frontmatter de
 * `ExpensesView.astro`, que es lo que el router clona dentro de `.app-view`— y lo
 * inyecta en jsdom; el test obtiene su root exactamente igual.
 *
 * No se puede reemplazar por un root escrito a mano: dentro de `.kpi-icon` vive
 * `<Wallet size={18} />`, que jsdom parsea como el elemento literal
 * `<wallet size="{18}">`. Ese markup raro es el del fixture —jsdom no evalúa
 * componentes de Astro— y hay que reproducirlo tal cual: no es basura que se
 * pueda «limpiar». El esqueleto que trae el hueco del total no cambia la salida:
 * `paintKpi` escribe el texto y reemplaza a sus hijos.
 */
function mountBand(): HTMLElement {
  const source = readFileSync(PAGE, "utf8")
  const frontmatterEnd = source.indexOf("---", source.indexOf("---") + 3) + 3
  document.body.innerHTML = source.slice(frontmatterEnd)
  return qs<HTMLElement>(".kpi-band")
}

/**
 * Reproduce el `paintKpi` de la página: el total y el rótulo/nota del rango se
 * calculan con los módulos puros y se escriben; el único efecto es la banda.
 */
/**
 * «Hoy» fijo. El caso sin query resuelve al rango de hoy (S36), así que una
 * prueba byte a byte cambiaría de resultado cada día si usara la fecha real.
 */
const HOY_FIJO = new Date("2026-10-20T12:00:00.000Z")

function paintBand(search: string): string {
  window.history.replaceState(null, "", search)
  const band = mountBand()

  setText(qs("[data-kpi='total']"), formatCords(expensesKpi(EXPENSES).total))
  const { label, note } = expensesKpiLabelAndNote(
    readExpensesFilters(window.location.search, HOY_FIJO),
  )
  setText(qs("[data-kpi-label]"), label)
  setText(qs("[data-kpi-note]"), note)

  band.setAttribute("aria-busy", "false")
  return band.outerHTML
}

const BAND_CASES: ReadonlyArray<{ file: string; search: string }> = [
  { file: "kpi-band-no-date-filter.html", search: "" },
  { file: "kpi-band-date-filter.html", search: "?start_date=2025-03-01&end_date=2025-03-31" },
]

/** Igual que el de las filas: deja a la vista el offset y la ventana de ambos. */
function describeDiffBand(actual: string, expected: string): string {
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

describe("expenses-kpi: banda byte a byte contra los fixtures", () => {
  for (const { file, search } of BAND_CASES) {
    it(`reproduce ${file} byte a byte`, () => {
      const actual = paintBand(search)
      const expected = fixture(file)
      expect(actual, describeDiffBand(actual, expected)).toBe(expected)
    })
  }
})