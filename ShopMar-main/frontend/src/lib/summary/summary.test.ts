import { describe, expect, it } from "vitest"
import {
  lastDaysRange,
  effectiveRange,
  SUMMARY_FIELDS,
  countShipments,
  formatDateShort,
  isEmptyRange,
  isSingleDayRange,
  dailyChartHeading,
} from "./summary"
import { todayLocal } from "../core/date"
import type { SummaryFilters } from "../lists/filters"
import type { IDashboardSummary } from "../core/types"
import { dashboardSummaryDefaults } from "../core/fixtures"

const HISTORICO: IDashboardSummary = {
    ...dashboardSummaryDefaults,
  total_revenue: "838000.00",
  sales_count: 13,
  total_expenses: "227900.00",
}

const OCTUBRE: IDashboardSummary = {
    ...dashboardSummaryDefaults,
  total_revenue: "187000.00",
  sales_count: 3,
  total_expenses: "0.00",
}

const summary = (over: Partial<IDashboardSummary> = {}): IDashboardSummary => ({
    ...dashboardSummaryDefaults,
  total_revenue: "0.00",
  sales_count: 0,
  total_expenses: "0.00",
  ...over,
})

describe("SUMMARY_FIELDS", () => {
  it("son seis, en el orden del escalonado", () => {
    expect(SUMMARY_FIELDS.map((f) => f.id)).toEqual([
      "stat-revenue",
      "stat-sales",
      "stat-expenses",
      "stat-collected",
      "stat-receivables",
      "stat-overdue",
    ])
  })

  it("cada tarjeta trae su rótulo en palabras de la dueña", () => {
    expect(SUMMARY_FIELDS.map((f) => f.label)).toEqual([
      "Vendido",
      "Ventas",
      "Gastos",
      "Cobrado",
      "Por cobrar",
      "Vencido",
    ])
  })

  it("cada tarjeta trae su definición visible, y ninguna queda vacía", () => {
    for (const field of SUMMARY_FIELDS) {
      expect(field.hint.length, field.id).toBeGreaterThan(20)
    }
  })

  it("Cobrado se define como caja medida por fecha de pago", () => {
    const hint = (id: string): string => SUMMARY_FIELDS.find((f) => f.id === id)?.hint ?? ""
    expect(hint("stat-collected")).toContain("fecha de pago")
    expect(hint("stat-collected")).toContain("enero")
  })

  it("Por cobrar se define como saldo de las ventas a crédito y Vencido como su parte vencida", () => {
    const hint = (id: string): string => SUMMARY_FIELDS.find((f) => f.id === id)?.hint ?? ""
    expect(hint("stat-receivables")).toContain("crédito")
    expect(hint("stat-overdue")).toContain("Por cobrar")
  })

  it("las tres tarjetas nuevas leen los tres campos nuevos del resumen", () => {
    const read = Object.fromEntries(SUMMARY_FIELDS.map((f) => [f.id, f.read]))
    const conCartera: IDashboardSummary = summary({
      collected_revenue: "5120000.00",
      outstanding_receivables: "860000.00",
      overdue_receivables: "240000.00",
    })

    expect(read["stat-collected"]?.(conCartera)).toBe("C$ 5,120,000.00")
    expect(read["stat-receivables"]?.(conCartera)).toBe("C$ 860,000.00")
    expect(read["stat-overdue"]?.(conCartera)).toBe("C$ 240,000.00")
  })

  it("en cero las tres tarjetas nuevas muestran 0.00 formateado, no un guion", () => {
    const read = Object.fromEntries(SUMMARY_FIELDS.map((f) => [f.id, f.read]))
    for (const id of ["stat-collected", "stat-receivables", "stat-overdue"]) {
      expect(read[id]?.(summary())).toBe("C$ 0.00")
    }
  })

  it("cada tarjeta lee su propio dato", () => {
    const read = Object.fromEntries(SUMMARY_FIELDS.map((f) => [f.id, f.read]))
    expect(read["stat-revenue"]?.(OCTUBRE)).toBe(formatMoneyOf("187000.00"))
    expect(read["stat-sales"]?.(OCTUBRE)).toBe("3")
    expect(read["stat-expenses"]?.(OCTUBRE)).toBe(formatMoneyOf("0.00"))
  })

  it("los dos importes salen formateados como moneda", () => {
    const read = Object.fromEntries(SUMMARY_FIELDS.map((f) => [f.id, f.read]))
    expect(read["stat-revenue"]?.(HISTORICO)).toBe("C$ 838,000.00")
    expect(read["stat-expenses"]?.(HISTORICO)).toBe("C$ 227,900.00")
  })

  it("el conteo de ventas sale como texto sin separador", () => {
    const read = Object.fromEntries(SUMMARY_FIELDS.map((f) => [f.id, f.read]))
    expect(read["stat-sales"]?.(HISTORICO)).toBe("13")
  })
})

describe("isEmptyRange", () => {
  it("un rango con los cuatro datos en cero está vacío", () => {
    expect(isEmptyRange(summary())).toBe(true)
  })

  it("cero gastos con ingresos y ventas NO es un rango vacío", () => {
    expect(isEmptyRange(OCTUBRE)).toBe(false)
  })

  it("cero ingresos pero con gastos tampoco está vacío", () => {
    expect(isEmptyRange(summary({ total_expenses: "5000.00" }))).toBe(false)
  })

  it("reconoce el cero escrito de varias maneras", () => {
    expect(isEmptyRange(summary({ total_revenue: "0" }))).toBe(true)
    expect(isEmptyRange(summary({ total_expenses: "0.000" }))).toBe(true)
  })

  it("cobrar una venta vieja en el rango no es un rango vacío, aunque no haya ventas", () => {
    expect(isEmptyRange(summary({ collected_revenue: "5000.00" }))).toBe(false)
  })

  it("un saldo por cobrar tampoco es un rango vacío", () => {
    expect(isEmptyRange(summary({ outstanding_receivables: "320000.00" }))).toBe(false)
    expect(isEmptyRange(summary({ overdue_receivables: "45000.00" }))).toBe(false)
  })
})

describe("countShipments", () => {
  it("suma el conteo de todos los métodos de envío", () => {
    expect(
      countShipments([
        { count: 3 },
        { count: 0 },
        { count: 2 },
      ]),
    ).toBe("5")
  })

  it("un desglose vacío da cero", () => {
    expect(countShipments([])).toBe("0")
  })
})

describe("formatDateShort", () => {
  it("pasa AAAA-MM-DD a DD/MM/AAAA", () => {
    expect(formatDateShort("2026-10-01")).toBe("01/10/2026")
    expect(formatDateShort("2026-12-31")).toBe("31/12/2026")
  })

  it("devuelve la entrada si no tiene tres partes", () => {
    expect(formatDateShort("ayer")).toBe("ayer")
  })
})

describe("lastDaysRange", () => {
  it("los últimos 7 días completan la ventana hasta hoy", () => {
    expect(lastDaysRange(7, new Date(2026, 9, 11, 12, 0))).toEqual({
      start_date: "2026-10-05",
      end_date: "2026-10-11",
    })
  })

  it("la ventana cruza el cambio de mes", () => {
    expect(lastDaysRange(7, new Date(2026, 9, 3, 12, 0)).start_date).toBe("2026-09-27")
  })

  it("la ventana cruza el cambio de año", () => {
    expect(lastDaysRange(7, new Date(2026, 0, 3, 12, 0)).start_date).toBe("2025-12-28")
  })

  it("days igual a 1 deja un solo día", () => {
    const range = lastDaysRange(1, new Date(2026, 9, 11, 12, 0))
    expect(range.start_date).toBe(range.end_date)
  })

  it("una hora tardía local no se corre al día siguiente en UTC", () => {
    expect(lastDaysRange(7, new Date(2026, 9, 11, 23, 30))).toEqual({
      start_date: "2026-10-05",
      end_date: "2026-10-11",
    })
  })

  it("sin argumento now usa hoy como fin del rango", () => {
    expect(lastDaysRange(7).end_date).toBe(todayLocal())
  })

  it("days menor a 1 se recorta a un solo día para no invertir el rango", () => {
    const range = lastDaysRange(0, new Date(2026, 9, 11, 12, 0))
    expect(range).toEqual({ start_date: "2026-10-11", end_date: "2026-10-11" })
  })
})

const RANGO_COMPLETO: SummaryFilters = { start_date: "2026-10-01", end_date: "2026-10-11" }
const RANGO_SOLO_DESDE: SummaryFilters = { start_date: "2026-10-03", end_date: "" }
const RANGO_SOLO_HASTA: SummaryFilters = { start_date: "", end_date: "2026-10-09" }
const RANGO_VACIO: SummaryFilters = { start_date: "", end_date: "" }

describe("effectiveRange", () => {
  it("con ambas fechas respeta las del filtro", () => {
    expect(effectiveRange(RANGO_COMPLETO)).toEqual(RANGO_COMPLETO)
  })

  it("con solo start_date completa el fin con los últimos 7 días", () => {
    const rango = effectiveRange(RANGO_SOLO_DESDE)
    expect(rango.start_date).toBe("2026-10-03")
    expect(rango.end_date).toBe(lastDaysRange(7).end_date)
  })

  it("con solo end_date completa el inicio con los últimos 7 días", () => {
    const rango = effectiveRange(RANGO_SOLO_HASTA)
    expect(rango.end_date).toBe("2026-10-09")
    expect(rango.start_date).toBe(lastDaysRange(7).start_date)
  })

  it("sin fechas cae en los últimos 7 días, terminando hoy", () => {
    const rango = effectiveRange(RANGO_VACIO)
    expect(rango).toEqual(lastDaysRange(7))
    expect(rango.end_date).toBe(todayLocal())
  })
})

function formatMoneyOf(value: string): string {
  return SUMMARY_FIELDS[0]?.read({ ...summary(), total_revenue: value }) ?? ""
}
describe("isSingleDayRange", () => {
  it("el mismo día en los dos extremos es un solo día", () => {
    expect(isSingleDayRange({ start_date: "2026-10-21", end_date: "2026-10-21" })).toBe(true)
  })

  it("días distintos no lo son", () => {
    expect(isSingleDayRange({ start_date: "2026-10-15", end_date: "2026-10-21" })).toBe(false)
  })

  it("un rango abierto no es un solo día", () => {
    expect(isSingleDayRange({ start_date: "2026-10-21", end_date: "" })).toBe(false)
    expect(isSingleDayRange({ start_date: "", end_date: "2026-10-21" })).toBe(false)
    expect(isSingleDayRange({ start_date: "", end_date: "" })).toBe(false)
  })
})

describe("dailyChartHeading", () => {
  it("con un solo día la tarjeta habla por horas (S5)", () => {
    expect(dailyChartHeading(true)).toEqual({
      title: "Ingresos y Gastos por Hora (C$)",
      subtitle: "Flujo monetario del día, hora por hora",
    })
  })

  it("con varios días mantiene el texto diario", () => {
    expect(dailyChartHeading(false)).toEqual({
      title: "Ingresos y Gastos Diarios (C$)",
      subtitle: "Comparativo de flujo monetario en el período",
    })
  })
})
