import { formatDate } from "../core/format"
import type { IExpenseResponse } from "../core/types"
import type { ExpensesFilters } from "../lists/filters"

export interface IExpensesKpi {
  total: string
  count: number
}

/** Rótulo y nota de la banda KPI según haya o no filtro de fechas. */
export interface IExpensesKpiLabelAndNote {
  label: string
  note: string
}

const DECIMAL = /^(\d{1,8})(?:\.(\d+))?$/

function toCents(value: string): number {
  const match = DECIMAL.exec(value)
  if (match === null) return 0

  const whole = Number(match[1])
  const decimals = match[2] ?? ""
  const cents = Number(decimals.slice(0, 2).padEnd(2, "0"))

  const extra = decimals.length > 2 && decimals[2] >= "5" ? 1 : 0
  return whole * 100 + cents + extra
}

export function expensesKpi(rows: readonly IExpenseResponse[]): IExpensesKpi {
  let cents = 0
  for (const row of rows) cents += toCents(row.total)

  return { total: (cents / 100).toFixed(2), count: rows.length }
}

export function expensesLabel(count: number): string {
  return `${count} ${count === 1 ? "gasto registrado" : "gastos registrados"}`
}

/**
 * Deriva el rótulo y la nota de la banda a partir del filtro activo. Cualquiera
 * de las dos fechas alcanza para que la banda hable de un rango; la fecha que
 * falte la dibuja `formatDate` como guion.
 */
export function expensesKpiLabelAndNote(
  filters: ExpensesFilters,
): IExpensesKpiLabelAndNote {
  const filtered = filters.start_date !== "" || filters.end_date !== ""

  return {
    label: filtered ? "Total Gastos (Rango)" : "Total Gastos (Mes)",
    note: filtered
      ? `Entre ${formatDate(filters.start_date)} y ${formatDate(filters.end_date)}`
      : "Sin filtro de fechas: todo el historial",
  }
}