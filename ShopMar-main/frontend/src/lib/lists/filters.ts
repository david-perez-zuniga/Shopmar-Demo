import { resolveDateRange } from "./date-presets"

export type SalesFilters = {
  start_date: string
  end_date: string
  type: string
  status: string
  shipment_method: string
}

export type PackagesFilters = {
  start_date: string
  end_date: string
  shipment_method: string
}

/**
 * Filas por página. Ya no se elige (S41): la tabla muestra diez siempre, así que
 * un `per_page` viejo en la URL se ignora en lugar de cambiar la vista.
 */
export const DEFAULT_PER_PAGE = 10

export function readPerPage(_query = ""): number {
  return DEFAULT_PER_PAGE
}

export function readPage(query: string): number {
  const raw = new URLSearchParams(query).get("page")
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1
}

function value(search: URLSearchParams, key: string): string {
  return search.get(key) ?? ""
}

export function readSalesFilters(query: string, today: Date = new Date()): SalesFilters {
  const search = new URLSearchParams(query)
  const type = value(search, "type")
  const status = value(search, "status")
  const shipment_method = value(search, "shipment_method")
  // Sin fechas en la URL la pantalla muestra hoy (S36).
  const range = resolveDateRange(value(search, "start_date"), value(search, "end_date"), today)
  return {
    start_date: range.start_date,
    end_date: range.end_date,
    type: type === "live" || type === "whatsapp" ? type : "",
    status:
      status === "pending" || status === "completed" || status === "cancelled" ? status : "",
    shipment_method:
      shipment_method === "cargotrans" || shipment_method === "delivery" || shipment_method === "pickup" || shipment_method === "unassigned"
        ? shipment_method
        : "",
  }
}

export type SummaryFilters = {
  start_date: string
  end_date: string
}

function isDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function readSummaryFilters(query: string, today: Date = new Date()): SummaryFilters {
  const search = new URLSearchParams(query)
  const start = value(search, "start_date")
  const end = value(search, "end_date")
  const validStart = isDate(start) ? start : ""
  const validEnd = isDate(end) ? end : ""
  return resolveDateRange(validStart, validEnd, today)
}

export function readPackagesFilters(query: string, today: Date = new Date()): PackagesFilters {
  const search = new URLSearchParams(query)
  const method = value(search, "shipment_method")
  const range = resolveDateRange(value(search, "start_date"), value(search, "end_date"), today)
  return {
    start_date: range.start_date,
    end_date: range.end_date,
    shipment_method:
      method === "cargotrans" || method === "delivery" || method === "pickup" || method === "unassigned"
        ? method
        : "",
  }
}

export type ExpensesFilters = SummaryFilters

export function readExpensesFilters(query: string, today: Date = new Date()): ExpensesFilters {
  return readSummaryFilters(query, today)
}

/**
 * ¿El rango es distinto del que la pantalla muestra por defecto (hoy)?
 *
 * Vive en una sola función porque la respuesta la necesitan dos lecturas: si hay
 * algún filtro activo (S39) y cuántos hay (S40). Si cada una hiciera su cuenta,
 * el contador del botón «Filtros» podría decir 0 con «Limpiar» a la vista.
 */
function isCustomRange(start_date: string, end_date: string, today: Date): boolean {
  // Se resuelve primero: sin fechas la pantalla usa hoy (S36), así que un rango
  // vacío no es «personalizado» sino el de por defecto.
  const rango = resolveDateRange(start_date, end_date, today)
  const porDefecto = resolveDateRange("", "", today)
  return rango.start_date !== porDefecto.start_date || rango.end_date !== porDefecto.end_date
}

/**
 * Cuántos filtros están **activos** (S40).
 *
 * Es el número que muestra el botón «Filtros»: mientras el panel está cerrado es
 * la única señal de que hay algo aplicado sobre el período. La regla es la de `isCustomRange` —el rango de hoy no cuenta, cada campo con valor cuenta
 * uno— para que el contador y el enlace «Limpiar» nunca se contradigan.
 */
export function activeFilterCount(
  filters: Record<string, string>,
  today: Date = new Date(),
): number {
  const { start_date = "", end_date = "", ...rest } = filters
  const campos = Object.values(rest).filter((entry) => entry !== "").length
  return isCustomRange(start_date, end_date, today) ? campos + 1 : campos
}

export function hasAnyFilter(filters: Record<string, string>): boolean {
  return Object.values(filters).some((entry) => entry !== "")
}

export function toQuery(filters: Record<string, string>): string {
  const search = new URLSearchParams()
  for (const [key, entry] of Object.entries(filters)) {
    if (entry !== "") search.set(key, entry)
  }
  return search.toString()
}