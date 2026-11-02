import type { IDashboardSummary, ISaleListRow, ISaleResponse } from "./types"

/**
 * Campos de la venta a crédito que casi ninguna prueba mira (D-022).
 *
 * Existen para que una fixture pueda declarar sólo lo que la prueba ejercita
 * —estado, total, método de envío— sin repetir seis campos en cada literal y
 * sin inventar valores distintos en cada archivo. Una venta de contado sin
 * deuda es el caso por defecto: contado, sin cliente registrado, sin
 * vencimiento y sin pagos.
 */
export const saleListRowDefaults: Pick<
  ISaleListRow,
  "customer_id" | "payment_terms" | "due_date" | "paid_total" | "balance" | "is_overdue"
> = {
  customer_id: null,
  payment_terms: "immediate",
  due_date: null,
  paid_total: "0.00",
  balance: null,
  is_overdue: false,
}

/** Lo mismo para el detalle, más el libro de pagos vacío. */
export const saleResponseDefaults: Pick<
  ISaleResponse,
  | "customer_id"
  | "payment_terms"
  | "due_date"
  | "paid_total"
  | "balance"
  | "is_overdue"
  | "payments"
  | "payments_count"
> = {
  ...saleListRowDefaults,
  payments: [],
  payments_count: 0,
}

/** Los tres agregados de caja y cartera del resumen, en cero. */
export const dashboardSummaryDefaults: Pick<
  IDashboardSummary,
  "collected_revenue" | "outstanding_receivables" | "overdue_receivables"
> = {
  collected_revenue: "0.00",
  outstanding_receivables: "0.00",
  overdue_receivables: "0.00",
}
