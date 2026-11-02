import { todayLocal } from "../core/date"
import { formatMoney } from "../core/format"
import type { SummaryFilters } from "../lists/filters"
import type { IDashboardSummary } from "../core/types"

/** Los íconos que `StatCard.astro` sabe dibujar. */
export type SummaryIcon = "trending-up" | "receipt" | "wallet" | "package"

export interface ISummaryField {
  /** Id del nodo de la tarjeta en `pages/index.astro`; el script escribe su `.stat-value`. */
  id: string
  /** Rótulo visible de la tarjeta. */
  label: string
  /** Definición visible: ninguna cifra se muestra sin decir qué suma. */
  hint: string
  icon: SummaryIcon
  tone: "default" | "success" | "warning" | "danger"
  /** Texto de la cifra, derivado del resumen que devuelve la API. */
  read: (summary: IDashboardSummary) => string
}

/**
 * Las seis tarjetas del panel, en el orden en que se pintan y en el que escalona
 * su entrada. Devengado y caja van separados a propósito (D-022): `total_revenue`
 * se imputa a `sale_date` y `collected_revenue` a `paid_at`, así que una venta a
 * crédito de enero cobrada en marzo suma en el vendido de enero y en la caja de
 * marzo. Las tres últimas tarjetas son la cartera: el saldo de las ventas a
 * crédito del rango y su parte vencida, que es un subconjunto del total.
 */
export const SUMMARY_FIELDS: readonly ISummaryField[] = [
  {
    id: "stat-revenue",
    label: "Vendido",
    hint: "Ventas del período por fecha de venta, incluidas las pendientes y sin las canceladas",
    icon: "trending-up",
    tone: "default",
    read: (s: IDashboardSummary): string => formatMoney(s.total_revenue),
  },
  {
    id: "stat-sales",
    label: "Ventas",
    hint: "Ventas del período por fecha de venta, sin contar las canceladas",
    icon: "receipt",
    tone: "default",
    read: (s: IDashboardSummary): string => String(s.sales_count),
  },
  {
    id: "stat-expenses",
    label: "Gastos",
    hint: "Gastos registrados en el período",
    icon: "wallet",
    tone: "default",
    read: (s: IDashboardSummary): string => formatMoney(s.total_expenses),
  },
  {
    id: "stat-collected",
    label: "Cobrado",
    hint: "Caja cobrada en el período por fecha de pago: una venta a crédito de enero cobrada en marzo cuenta en marzo",
    icon: "trending-up",
    tone: "success",
    read: (s: IDashboardSummary): string => formatMoney(s.collected_revenue),
  },
  {
    id: "stat-receivables",
    label: "Por cobrar",
    hint: "Saldo pendiente de las ventas a crédito del período, por fecha de venta",
    icon: "receipt",
    tone: "warning",
    read: (s: IDashboardSummary): string => formatMoney(s.outstanding_receivables),
  },
  {
    id: "stat-overdue",
    label: "Vencido",
    hint: "La parte de «Por cobrar» cuya fecha de vencimiento ya pasó",
    icon: "receipt",
    tone: "danger",
    read: (s: IDashboardSummary): string => formatMoney(s.overdue_receivables),
  },
]

export function countShipments(points: { count: number }[]): string {
  return String(points.reduce((sum, point) => sum + point.count, 0))
}

const ZERO_MONEY = formatMoney("0.00")

export function isEmptyRange(summary: IDashboardSummary): boolean {
  // Se compara con el dinero ya formateado en vez de parsearlo: la cadena de la
  // API es la fuente, y un importe nunca vuelve a ser un `number`.
  const isZeroMoney = (value: string): boolean => formatMoney(value) === ZERO_MONEY
  return (
    isZeroMoney(summary.total_revenue) &&
    summary.sales_count === 0 &&
    isZeroMoney(summary.total_expenses) &&
    isZeroMoney(summary.collected_revenue) &&
    isZeroMoney(summary.outstanding_receivables) &&
    isZeroMoney(summary.overdue_receivables)
  )
}

export function lastDaysRange(days: number, now: Date = new Date()): { start_date: string; end_date: string } {
  const span = Math.max(days, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (span - 1))
  return { start_date: todayLocal(start), end_date: todayLocal(end) }
}

export function formatDateShort(value: string): string {
  const [year, month, day] = value.split("-")
  if (year === undefined || month === undefined || day === undefined) return value
  return `${day}/${month}/${year}`
}

export function effectiveRange(filters: SummaryFilters): SummaryFilters {
  const fallback = lastDaysRange(7)
  return {
    start_date: filters.start_date !== "" ? filters.start_date : fallback.start_date,
    end_date: filters.end_date !== "" ? filters.end_date : fallback.end_date,
  }
}

/**
 * ¿El período es un solo día? Es la misma regla que aplica el backend para
 * dibujar hora por hora (S1): los dos extremos tienen que venir y caer en el
 * mismo día. Se comparan los diez caracteres de la fecha para que la regla no
 * dependa de si la URL trajo `YYYY-MM-DD` o un ISO completo.
 */
export function isSingleDayRange(filters: SummaryFilters): boolean {
  if (filters.start_date === "" || filters.end_date === "") return false
  return filters.start_date.slice(0, 10) === filters.end_date.slice(0, 10)
}

/**
 * Título y subtítulo de la tarjeta del gráfico (S5): con un solo día el eje son
 * horas, y la tarjeta no puede seguir diciendo «Diarios».
 */
export function dailyChartHeading(singleDay: boolean): { title: string; subtitle: string } {
  if (singleDay) {
    return {
      title: "Ingresos y Gastos por Hora (C$)",
      subtitle: "Flujo monetario del día, hora por hora",
    }
  }
  return {
    title: "Ingresos y Gastos Diarios (C$)",
    subtitle: "Comparativo de flujo monetario en el período",
  }
}
