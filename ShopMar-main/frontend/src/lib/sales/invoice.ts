import { formatDateTime, formatMoney } from "../core/format"
import { centsToMoney, paymentMethodLabel, toCents } from "./payment"
import type { IAdditionalSaleResponse, ISalePaymentResponse, ISaleResponse } from "../core/types"

export interface IMerchandiseRow {
  name: string
  total: string
}

export interface IAdditionalRow {
  quantity: number
  name: string
  description: string
  total: string
}

export interface IInvoiceGroups {
  merchandise: IMerchandiseRow[]
  merchandiseExtras: number
  additional: IAdditionalRow[]
  merchandiseExtrasSum: string
  additionalSum: string
  total: string
}

export function groupInvoiceRows(sale: ISaleResponse | null): IInvoiceGroups {
  const items: IAdditionalSaleResponse[] = sale === null ? [] : sale.additional_items

  const merchandiseItems = items.filter((item) => item.kind === "merchandise")
  const additionalItems = items.filter((item) => item.kind !== "merchandise")

  const merchandise: IMerchandiseRow[] =
    sale === null
      ? []
      : [
          { name: sale.product_name, total: sale.cost },
          ...merchandiseItems.map((item) => ({ name: item.name, total: item.total })),
        ]

  const additional: IAdditionalRow[] = additionalItems.map((item) => ({
    quantity: item.quantity,
    name: item.name,
    description: item.description ?? "—",
    total: item.total,
  }))

  const sumCents = (rows: { total: string }[]): number =>
    rows.reduce((sum, item) => sum + (toCents(item.total) ?? 0), 0)

  const cost = sale === null ? "" : sale.cost
  const extrasCents = sumCents(items)

  return {
    merchandise,
    merchandiseExtras: merchandiseItems.length,
    additional,
    merchandiseExtrasSum:
      merchandiseItems.length === 0 ? "" : centsToMoney(sumCents(merchandiseItems)),
    additionalSum: centsToMoney(sumCents(additionalItems)),
    total: cost === "" ? "" : centsToMoney((toCents(cost) ?? 0) + extrasCents),
  }
}
/** Lo que la factura dice cuando el libro de pagos todavía está vacío. */
export const INVOICE_PAYMENTS_EMPTY = "Sin pagos registrados"

/** Un renglón del bloque "Pagos" de la factura, ya formateado para imprimir. */
export interface IInvoicePaymentRow {
  date: string
  method: string
  amount: string
}

/** Rótulo del método de un pago: el banco solo se nombra cuando se pagó con tarjeta. */
export function invoicePaymentMethod(
  payment: Pick<ISalePaymentResponse, "payment_method" | "payment_bank">,
): string {
  const label = paymentMethodLabel(payment.payment_method)
  if (payment.payment_method !== "credit_card" || payment.payment_bank === null) return label
  return `${label} — ${payment.payment_bank}`
}

/**
 * Renglones del libro de pagos de la factura. La API ya los ordena por `paid_at`
 * e `id`, pero la factura no depende de ese orden: lo vuelve a imponer acá para
 * que dos pagos del mismo día se lean siempre igual. Sin venta no hay pagos.
 */
export function invoicePayments(sale: ISaleResponse | null): IInvoicePaymentRow[] {
  if (sale === null) return []
  return [...sale.payments]
    .sort((a, b) =>
      a.paid_at === b.paid_at ? a.id.localeCompare(b.id) : a.paid_at.localeCompare(b.paid_at),
    )
    .map((payment) => ({
      // `paid_at` es un instante, no un día de negocio: se muestra en la hora
      // local para que un pago de la noche no aparezca con la fecha del día
      // siguiente.
      date: formatDateTime(payment.paid_at),
      method: invoicePaymentMethod(payment),
      amount: formatMoney(payment.amount),
    }))
}
