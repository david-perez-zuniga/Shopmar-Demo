import { describe, expect, it } from "vitest"
import {
  hasAnyFilter,
  readPackagesFilters,
  readPage,
  readSalesFilters,
  readSummaryFilters,
  readExpensesFilters,
  toQuery,
  activeFilterCount,
} from "./filters"

// S36: sin fechas en la URL el rango por defecto es hoy. Las pruebas pasan un
// «hoy» fijo para no depender del día en que corren.
const HOY = new Date("2026-10-11T12:00:00.000Z")
const RANGO_HOY = { start_date: "2026-10-11", end_date: "2026-10-11" }

describe("readSalesFilters", () => {
  it("lee los cinco filtros de la URL", () => {
    expect(readSalesFilters("?start_date=2026-01-01&end_date=2026-09-30&type=live&status=completed&shipment_method=cargotrans")).toEqual({
      start_date: "2026-01-01",
      end_date: "2026-09-30",
      type: "live",
      status: "completed",
      shipment_method: "cargotrans",
    })
  })

  it("sin query usa hoy como rango y deja el resto vacío", () => {
    expect(readSalesFilters("", HOY)).toEqual({
      ...RANGO_HOY,
      type: "",
      status: "",
      shipment_method: "",
    })
  })

  it("conserva el estado y el canal válidos", () => {
    const filters = readSalesFilters("?status=completed&type=whatsapp")
    expect(filters.status).toBe("completed")
    expect(filters.type).toBe("whatsapp")
  })

  it("descarta un estado o un canal fuera del enum en vez de reventar", () => {
    expect(readSalesFilters("?status=pendiente").status).toBe("")
    expect(readSalesFilters("?type=tiktok").type).toBe("")
  })

  it("con las fechas vacías usa hoy y conserva el resto", () => {
    expect(readSalesFilters("?start_date=&status=pending", HOY)).toEqual({
      ...RANGO_HOY,
      type: "",
      status: "pending",
      shipment_method: "",
    })
  })
})

describe("readPackagesFilters", () => {
  it("lee los tres filtros de la URL", () => {
    expect(readPackagesFilters("?start_date=2026-09-01&end_date=2026-09-30&shipment_method=delivery")).toEqual({
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      shipment_method: "delivery",
    })
  })

  it("descarta un método fuera del enum", () => {
    expect(readPackagesFilters("?shipment_method=mensajeria").shipment_method).toBe("")
  })

  it("no tiene filtro de estado: el modelo no lo tiene", () => {
    expect(readPackagesFilters("?status=pending", HOY)).toEqual({
      ...RANGO_HOY,
      shipment_method: "",
    })
  })
})

describe("activeFilterCount", () => {
  it("no cuenta el rango por defecto ni los campos vacíos", () => {
    expect(activeFilterCount({ ...RANGO_HOY, type: "", status: "" }, HOY)).toBe(0)
  })

  it("cuenta cada campo con valor", () => {
    expect(activeFilterCount({ ...RANGO_HOY, type: "live", status: "completed" }, HOY)).toBe(2)
    expect(activeFilterCount({ ...RANGO_HOY, shipment_method: "delivery" }, HOY)).toBe(1)
    expect(activeFilterCount({ ...RANGO_HOY, overdue: "true" }, HOY)).toBe(1)
  })

  it("cuenta el rango cuando no es el de hoy", () => {
    expect(activeFilterCount({ start_date: "2026-10-05", end_date: "2026-10-11" }, HOY)).toBe(1)
    expect(activeFilterCount({ start_date: "2026-10-01", end_date: "2026-10-02" }, HOY)).toBe(1)
  })

  it("suma el rango a los demás filtros activos", () => {
    expect(
      activeFilterCount(
        {
          start_date: "2026-10-01",
          end_date: "2026-10-11",
          type: "live",
          status: "",
          payment_terms: "credit",
          overdue: "true",
        },
        HOY,
      ),
    ).toBe(4)
  })

  it("separa los campos de fecha del resto de los filtros", () => {
    // Un filtro que se llame como una fecha no puede contarse dos veces.
    expect(activeFilterCount({ start_date: "2026-10-11", end_date: "2026-10-11" }, HOY)).toBe(0)
  })

  it("cuenta el rango sólo cuando no es el de hoy, y cada campo con valor", () => {
    expect(activeFilterCount({ ...RANGO_HOY, type: "", status: "" }, HOY)).toBe(0)
    expect(activeFilterCount({ ...RANGO_HOY, type: "live" }, HOY)).toBe(1)
    expect(activeFilterCount({ start_date: "2026-01-01", end_date: "2026-01-02" }, HOY)).toBe(1)
    expect(
      activeFilterCount({ start_date: "2026-01-01", end_date: "2026-01-02", type: "live" }, HOY),
    ).toBe(2)
    // Sin fechas la pantalla usa hoy: el rango por defecto no suma.
    expect(activeFilterCount({ start_date: "", end_date: "" }, HOY)).toBe(0)
  })
})

describe("hasAnyFilter", () => {
  it("detecta que hay al menos un filtro activo", () => {
    expect(hasAnyFilter({ start_date: "", end_date: "", type: "", status: "completed", shipment_method: "" })).toBe(true)
    expect(hasAnyFilter({ start_date: "2026-01-01", end_date: "", type: "", status: "", shipment_method: "" })).toBe(true)
  })

  it("dice que no hay filtros cuando todos están vacíos", () => {
    expect(hasAnyFilter({ start_date: "", end_date: "", type: "", status: "", shipment_method: "" })).toBe(false)
  })
})

describe("readSummaryFilters", () => {
  it("lee las dos fechas de la URL", () => {
    expect(readSummaryFilters("?start_date=2026-10-01&end_date=2026-10-31")).toEqual({
      start_date: "2026-10-01",
      end_date: "2026-10-31",
    })
  })

  it("sin query usa hoy", () => {
    expect(readSummaryFilters("", HOY)).toEqual(RANGO_HOY)
  })

  it("ignora las claves que no son del resumen", () => {
    expect(readSummaryFilters("?status=completed&type=live", HOY)).toEqual(RANGO_HOY)
  })

  it("una fecha que no existe cae al rango por defecto: hoy", () => {
    expect(readSummaryFilters("?start_date=2026-02-31&end_date=2026-13-01", HOY)).toEqual(RANGO_HOY)
  })

  it("descarta una fecha con formato inválido", () => {
    expect(readSummaryFilters("?start_date=ayer&end_date=2026-10-31")).toEqual({
      start_date: "",
      end_date: "2026-10-31",
    })
  })
})

describe("readExpensesFilters", () => {
  it("lee el rango de fechas de la URL", () => {
    expect(readExpensesFilters("?start_date=2026-10-01&end_date=2026-10-31")).toEqual({
      start_date: "2026-10-01",
      end_date: "2026-10-31",
    })
  })

  it("sin query usa hoy", () => {
    expect(readExpensesFilters("", HOY)).toEqual(RANGO_HOY)
  })

  it("ignora claves que no son del listado de gastos", () => {
    expect(readExpensesFilters("?status=completed&type=live&page=2&per_page=20", HOY)).toEqual(
      RANGO_HOY,
    )
  })

  it("una fecha imposible cae al rango por defecto: hoy", () => {
    expect(readExpensesFilters("?start_date=2026-02-31", HOY)).toEqual(RANGO_HOY)
  })
})

describe("toQuery", () => {
  it("deja solo los filtros con valor", () => {
    expect(toQuery({ start_date: "", end_date: "", type: "live", status: "" })).toBe("type=live")
  })

  it("devuelve una query vacía cuando no hay filtros", () => {
    expect(toQuery({ start_date: "", end_date: "", type: "", status: "" })).toBe("")
  })

  it("arma los cuatro filtros juntos y en orden", () => {
    const query = toQuery({
      start_date: "2026-01-01",
      end_date: "2026-09-30",
      type: "live",
      status: "completed",
    })
    expect(query).toBe("start_date=2026-01-01&end_date=2026-09-30&type=live&status=completed")
  })
})
describe("readPage", () => {
  it("lee la página de la URL", () => {
    expect(readPage("?page=1")).toBe(1)
    expect(readPage("?page=3")).toBe(3)
    expect(readPage("?page=47")).toBe(47)
  })

  it("cae a la primera si no es un entero de 1 en adelante", () => {
    expect(readPage("")).toBe(1)
    expect(readPage("?page=")).toBe(1)
    expect(readPage("?page=0")).toBe(1)
    expect(readPage("?page=-3")).toBe(1)
    expect(readPage("?page=2.5")).toBe(1)
    expect(readPage("?page=abc")).toBe(1)
  })

  it("se mueve junto a per_page sin pisarse", () => {
    expect(readPage("?per_page=20&page=3")).toBe(3)
  })
})
