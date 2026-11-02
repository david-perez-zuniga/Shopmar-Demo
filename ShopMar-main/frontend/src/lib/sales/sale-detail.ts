/**
 * Detalle de venta: modelo de vista puro + renderizador DOM.
 *
 * Frontera de pureza, la misma que usan `sale-list-row.ts` y `sale-status.ts`:
 * - La parte pura (`saleDetailView`, `saleDetailFromLocation`, `typeLabels`,
 *   `paymentText`, `saleNumber`) deriva de la venta y de la URL todo lo que la
 *   pantalla muestra y no toca `document` ni `window`. Los rótulos y el armado
 *   del pago vivían en el frontmatter de `InvoicePrint.astro`, donde no se
 *   podían probar; viven acá.
 * - La parte DOM (`renderSaleDetail`) escribe el `InvoicePrint` por los ganchos
 *   `data-invoice-*` que el componente ya emite, exactamente como lo documenta
 *   `src/components/README.md`.
 *
 * El detalle del `id` en la URL lo decide D-017:
 * `/sales/detail?id=<uuid>` y `print=1` se leen de `window.location`.
 */

import { clear, qs, setText } from "../core/dom"
import { customerDetailHref } from "../customers/customer-detail"
import { formatDate, formatDateTime, formatMoney } from "../core/format"
import {
  groupInvoiceRows,
  invoicePayments,
  type IAdditionalRow,
  type IInvoiceGroups,
  type IInvoicePaymentRow,
  type IMerchandiseRow,
} from "./invoice"
import { labelFor } from "./sale-status"
import type { ISaleResponse, PaymentTerms } from "../core/types"

/** Los rótulos de canal de la factura, una sola copia para el server y el cliente. */
export const typeLabels: Record<ISaleResponse["type"], string> = {
  live: "Venta por Live",
  whatsapp: "Venta en tienda",
}

/** Número de factura: los ocho primeros caracteres del `id`. */
export function saleNumber(id: string): string {
  return id.slice(0, 8)
}

/**
 * Texto del método de pago de la factura.
 *
 * En una venta a crédito dice **«Crédito»** (S57): el `payment_method` guardado
 * es un valor de registro —`cash`, porque la columna es obligatoria—, no lo que
 * pagó el cliente. Lo que pagó, y con qué, vive en el bloque «Pagos», que
 * imprime el método y el banco de cada abono (D-022).
 */
export function paymentText(
  sale: Pick<ISaleResponse, "payment_method" | "payment_bank"> &
    Partial<Pick<ISaleResponse, "payment_terms">>,
): string {
  if (sale.payment_terms === "credit") return "Crédito"
  if (sale.payment_method === "cash") return "Efectivo"
  return sale.payment_bank === null ? "Tarjeta" : `Tarjeta — ${sale.payment_bank}`
}

/**
 * Vocabulario de la condición de pago (D-022), en una sola copia: el listado y
 * el detalle no pueden llamar «crédito» a dos cosas distintas.
 */
export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  immediate: "Contado",
  credit: "Crédito",
}

export function paymentTermsLabel(terms: PaymentTerms): string {
  return PAYMENT_TERMS_LABELS[terms]
}

/** Una línea etiqueta/valor de la condición de cobro de la factura. */
export interface ISaleCreditLine {
  label: "Vence" | "Pagado" | "Saldo"
  value: string
}

/**
 * Las tres líneas que solo tiene una venta a crédito. En una venta de contado
 * la lista está vacía: su `balance` es `null` y un pendiente de contado no es
 * una deuda, así que no se inventa ni un saldo ni un vencimiento.
 */
export function creditLines(
  sale: Pick<ISaleResponse, "payment_terms" | "due_date" | "paid_total" | "balance">,
): ISaleCreditLine[] {
  if (sale.payment_terms !== "credit") return []
  return [
    { label: "Vence", value: sale.due_date === null ? "—" : formatDate(sale.due_date) },
    { label: "Pagado", value: formatMoney(sale.paid_total) },
    // Un saldo ausente se imprime como guion y nunca como cero: un cero se
    // leería como «está pagada».
    { label: "Saldo", value: sale.balance === null ? "—" : formatMoney(sale.balance) },
  ]
}

/** Cómo se cobra esta venta: condición, líneas de crédito y marcador de vencida. */
export interface ISaleCreditView {
  /** `"Contado"` o `"Crédito"`, el rótulo que imprime la factura. */
  terms: string
  /** `true` cuando la condición de pago es crédito. */
  credit: boolean
  lines: ISaleCreditLine[]
  /** Una venta de contado no vence nunca, aunque la bandera venga sucia. */
  overdue: boolean
}

export function creditView(
  sale: Pick<ISaleResponse, "payment_terms" | "due_date" | "paid_total" | "balance" | "is_overdue">,
): ISaleCreditView {
  const credit = sale.payment_terms === "credit"
  return {
    terms: paymentTermsLabel(sale.payment_terms),
    credit,
    lines: creditLines(sale),
    overdue: credit && sale.is_overdue,
  }
}

/**
 * Cómo se muestra el cliente de la venta: el texto y, si hay cliente
 * registrado, el enlace a sus detalles (S19).
 */
export interface ICustomerLink {
  text: string
  /** `null` en una venta histórica sin `customer_id`: el nombre queda texto. */
  href: string | null
}

/**
 * El nombre del recibo enlaza a los detalles del cliente **sólo** cuando la
 * venta tiene `customer_id`. Una venta vieja guardó el nombre como instantánea
 * y no tiene a quién apuntar: un enlace inventado sería un 404.
 */
export function customerLink(
  sale: Pick<ISaleResponse, "customer_name" | "customer_id">,
): ICustomerLink {
  return {
    text: sale.customer_name,
    href: sale.customer_id === null ? null : customerDetailHref(sale.customer_id),
  }
}

/** Lo que la URL del detalle aporta: el id y si pide impresión automática. */
export interface ISaleDetailLocation {
  /** `false` cuando no hay `id` en la query. */
  valid: boolean
  id: string
  print: boolean
}

/** Lee `id` y `print=1` de una URL relativa o absoluta. */
export function saleDetailFromLocation(href: string): ISaleDetailLocation {
  const url = new URL(href, "http://localhost")
  const id = url.searchParams.get("id") ?? ""
  return { valid: id !== "", id, print: url.searchParams.get("print") === "1" }
}

/** Datos de la línea `.detail-meta` de la pantalla. */
export interface ISaleDetailMeta {
  created: string
  updated: string
  rows: string
}

export interface ISaleDetailView {
  number: string
  typeLabel: string
  paymentText: string
  /** Clase completa del badge de estado: `badge badge--<status>`. */
  statusClass: string
  statusLabel: string
  date: string
  total: string
  /** Condición de pago y, si es a crédito, vencimiento, pagado y saldo (S14). */
  credit: ISaleCreditView
  /** Renglones del bloque «Pagos» de la factura. */
  payments: IInvoicePaymentRow[]
  meta: ISaleDetailMeta
  groups: IInvoiceGroups
}

/** Deriva todo lo que la pantalla y la factura muestran a partir de la venta. */
export function saleDetailView(sale: ISaleResponse): ISaleDetailView {
  const groups = groupInvoiceRows(sale)
  return {
    number: saleNumber(sale.id),
    typeLabel: typeLabels[sale.type],
    paymentText: paymentText(sale),
    statusClass: `badge badge--${sale.status}`,
    statusLabel: labelFor(sale.status),
    date: formatDate(sale.sale_date),
    total: groups.total,
    credit: creditView(sale),
    payments: invoicePayments(sale),
    meta: {
      created: `Creada ${formatDateTime(sale.created_at)}`,
      updated: `Actualizada ${formatDateTime(sale.updated_at)}`,
      rows: `Renglones: ${sale.additional_count}`,
    },
    groups,
  }
}

/**
 * Ganchos `data-invoice-*` que `renderSaleDetail` escribe. La prueba de contrato
 * comprueba que todos existan en `InvoicePrint.astro`: renombrar un gancho en el
 * componente sin cambiar acá rompe el test en vez de romper la pantalla.
 */
export const SALE_DETAIL_HOOKS = [
  "data-invoice-number",
  "data-invoice-date",
  "data-invoice-customer",
  "data-invoice-product",
  "data-invoice-type",
  "data-invoice-payment",
  "data-invoice-terms",
  "data-invoice-credit",
  "data-invoice-due-date",
  "data-invoice-paid-total",
  "data-invoice-balance",
  "data-invoice-overdue",
  "data-invoice-payments",
  "data-invoice-payments-table",
  "data-invoice-payments-empty",
  "data-invoice-payment-rows",
  "data-invoice-status",
  "data-invoice-merchandise-rows",
  "data-invoice-cost-name",
  "data-invoice-cost",
  "data-invoice-merchandise-extras",
  "data-invoice-merchandise-extras-sum",
  "data-invoice-additional",
  "data-invoice-additional-rows",
  "data-invoice-additional-description",
  "data-invoice-additional-sum",
  "data-invoice-total",
] as const

function merchandiseRow(row: IMerchandiseRow, first: boolean): HTMLTableRowElement {
  const tr = document.createElement("tr")

  const name = document.createElement("td")
  if (first) name.setAttribute("data-invoice-cost-name", "")
  name.textContent = row.name

  const total = document.createElement("td")
  total.className = "num"
  if (first) total.setAttribute("data-invoice-cost", "")
  total.textContent = row.total === "" ? "" : formatMoney(row.total)

  tr.append(name, total)
  return tr
}

function additionalRow(row: IAdditionalRow): HTMLTableRowElement {
  const tr = document.createElement("tr")

  const quantity = document.createElement("td")
  quantity.className = "num"
  quantity.textContent = String(row.quantity)

  const name = document.createElement("td")
  name.textContent = row.name

  const description = document.createElement("td")
  description.setAttribute("data-invoice-additional-description", "")
  description.textContent = row.description

  const total = document.createElement("td")
  total.className = "num"
  total.textContent = formatMoney(row.total)

  tr.append(quantity, name, description, total)
  return tr
}

function paymentRow(row: IInvoicePaymentRow): HTMLTableRowElement {
  const tr = document.createElement("tr")

  const date = document.createElement("td")
  date.textContent = row.date

  const method = document.createElement("td")
  method.textContent = row.method

  const amount = document.createElement("td")
  amount.className = "num"
  amount.textContent = row.amount

  tr.append(date, method, amount)
  return tr
}

/**
 * Pinta el cliente de la factura: un enlace a sus detalles cuando la venta
 * tiene cliente registrado y texto plano cuando no. Se reemplaza el contenido
 * entero de la celda en vez de escribir texto encima, para que volver a pintar
 * la misma venta no anide enlaces.
 */
function paintCustomer(link: ICustomerLink): void {
  const cell = qs("[data-invoice-customer]")
  clear(cell)

  if (link.href === null) {
    setText(cell, link.text)
    return
  }

  const anchor = document.createElement("a")
  anchor.className = "invoice-customer-link"
  anchor.href = link.href
  anchor.textContent = link.text
  cell.append(anchor)
}

/**
 * Llena un `InvoicePrint` vacío con la venta y lo hace visible. Devuelve el
 * modelo de vista que usó, para que la pantalla pinte la meta y el título sin
 * recalcularlo.
 */
export function renderSaleDetail(sale: ISaleResponse): ISaleDetailView {
  const view = saleDetailView(sale)

  setText(qs("[data-invoice-number]"), view.number)
  setText(qs("[data-invoice-date]"), view.date)
  paintCustomer(customerLink(sale))
  setText(qs("[data-invoice-product]"), sale.product_name)
  setText(qs("[data-invoice-type]"), view.typeLabel)
  setText(qs("[data-invoice-payment]"), view.paymentText)
  setText(qs("[data-invoice-terms]"), view.credit.terms)
  setText(qs("[data-invoice-total]"), view.total === "" ? "" : formatMoney(view.total))

  // La condición de crédito se pinta con las líneas que derivó el modelo puro:
  // el componente solo dice dónde va cada una.
  qs<HTMLElement>("[data-invoice-credit]").hidden = !view.credit.credit
  const lineValue = (label: ISaleCreditLine["label"]): string =>
    view.credit.lines.find((line) => line.label === label)?.value ?? ""
  setText(qs("[data-invoice-due-date]"), lineValue("Vence"))
  setText(qs("[data-invoice-paid-total]"), lineValue("Pagado"))
  setText(qs("[data-invoice-balance]"), lineValue("Saldo"))
  qs<HTMLElement>("[data-invoice-overdue]").hidden = !view.credit.overdue

  const paymentsTable = qs<HTMLElement>("[data-invoice-payments-table]")
  const paymentsBody = qs<HTMLTableSectionElement>("[data-invoice-payment-rows]")
  clear(paymentsBody)
  view.payments.forEach((row) => paymentsBody.append(paymentRow(row)))
  paymentsTable.hidden = view.payments.length === 0
  qs<HTMLElement>("[data-invoice-payments-empty]").hidden = view.payments.length > 0

  const badge = qs<HTMLElement>("[data-invoice-status]").querySelector<HTMLElement>(".badge")
  if (badge !== null) {
    badge.className = view.statusClass
    badge.textContent = view.statusLabel
  }

  const merchandiseBody = qs<HTMLTableSectionElement>("[data-invoice-merchandise-rows]")
  clear(merchandiseBody)
  view.groups.merchandise.forEach((row, index) => {
    merchandiseBody.append(merchandiseRow(row, index === 0))
  })

  const additionalSection = qs<HTMLElement>("[data-invoice-additional]")
  const additionalBody = qs<HTMLTableSectionElement>("[data-invoice-additional-rows]")
  clear(additionalBody)
  view.groups.additional.forEach((row) => {
    additionalBody.append(additionalRow(row))
  })
  additionalSection.hidden = view.groups.additional.length === 0
  setText(qs("[data-invoice-additional-sum]"), formatMoney(view.groups.additionalSum))

  qs<HTMLElement>("[data-invoice-merchandise-extras]").hidden =
    view.groups.merchandiseExtras === 0
  setText(
    qs("[data-invoice-merchandise-extras-sum]"),
    formatMoney(view.groups.merchandiseExtrasSum),
  )

  qs<HTMLElement>(".invoice").classList.add("invoice--visible")

  return view
}
