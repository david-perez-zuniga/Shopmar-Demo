/**
 * Fila del listado de ventas: modelo de vista puro + renderizador DOM.
 *
 * Frontera de pureza:
 * - La parte pura (`saleListRowView`) convierte una `ISaleListRow` en todo lo
 *   que se deriva de ella y no toca `document` ni `window`: la fecha, la
 *   clienta, el producto, el canal, los adicionales, el estado de cobro, el
 *   total y los enlaces. Incluye el markup de los iconos, igual que
 *   `statusLook` en `sale-status.ts`, para que cada icono tenga una sola copia
 *   en el código.
 * - La parte DOM (`renderSaleListRow`) arma el `<tr>` consumiendo ese modelo y
 *   recibe por parámetro lo que necesita —en particular el manejador de cambio
 *   de estado, porque de él depende el `<select>`, y el de «Registrar pago»,
 *   porque de él depende el botón—. No resuelve nada derivable por su cuenta.
 *
 * Es un refactor puro del `renderRow` de `components/views/SalesView.astro`: reproduce su
 * salida byte a byte y no arregla nada, aunque algo parezca un bug. Las rarezas
 * a propósito están anotadas más abajo.
 *
 * Cambio posterior a ese refactor: la columna **Cobro** (S13) con el saldo y el
 * vencimiento de una venta a crédito, y su acción «Registrar pago». Están en el
 * modelo puro para que una prueba las pueda leer sin montar la tabla.
 */

import { formatDate, formatMoney } from "../core/format"
import { toCents } from "./payment"
import { buildStatusSelect, statusLook } from "./sale-status"
import type { ISaleListRow, PaymentTerms } from "../core/types"

/**
 * Iconos de canal que vivían en el `<script>` de la página. Junto con
 * `statusLook().printIcon` son las únicas copias de estos markup en el código.
 */
const STORE_ICON =
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.4-4h11.2L22 7"/><path d="M4 7v16h16V7"/><path d="M2 7c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2"/><path d="M9 23v-6h6v6"/></svg>`
const BAG_ICON =
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`

/** Una celda simple: sus clases completas y su texto. */
export interface ICellView {
  classes: string
  text: string
}

/** La celda de producto agrega el `title`, que repite el texto. */
export interface IProductView extends ICellView {
  title: string
}

/** La píldora de canal: clase, icono (markup) y etiqueta visible. */
export interface IChannelView {
  classes: string
  icon: string
  label: string
}

/** El botón de impresión, con el `title` que también alimenta su `aria-label`. */
export interface IPrintView {
  href: string
  icon: string
  title: string
  ariaLabel: string
}

/** Un enlace simple: destino y texto. */
export interface ILinkView {
  href: string
  text: string
}

/**
 * La celda de la columna **Cobro** (S13).
 *
 * `value` es la línea principal —el saldo, «Pagada» o el guion de una venta de
 * contado— y `hint` la segunda, que solo existe cuando hay una deuda viva: el
 * vencimiento o la palabra «Vencida». Las clases vienen resueltas para que el
 * renderizador no decida nada.
 */
export interface ICreditCellView {
  classes: string
  value: string
  valueClass: string
  hint: string
  hintClass: string
}

/** La acción «Registrar pago» de una fila, con el texto y su nombre accesible. */
export interface IPaymentActionView {
  label: string
  ariaLabel: string
}

export interface ISaleListRowView {
  /** `true` cuando el estado es cancelada. */
  cancelled: boolean
  /** Clases completas del `<tr>`. */
  rowClass: string
  /** Si el estado tacha las celdas. */
  struck: boolean
  date: ICellView
  customer: ICellView
  product: IProductView
  channel: IChannelView
  credit: ICreditCellView
  additional: ICellView
  total: ICellView
  print: IPrintView
  detail: ILinkView
  /** `null` cuando la fila no admite un pago. */
  payment: IPaymentActionView | null
}

/**
 * Los filtros de la venta a crédito del listado (S13).
 *
 * Viven aca. —y no junto a los demás filtros— porque esta unidad de trabajo solo
 * puede tocar los módulos de `lib/sales/`: el listado compone los dos objetos y
 * `readSalesFilters` sigue siendo la fuente del resto de los filtros.
 */
export type SalesCreditFilters = {
  /** `"immediate"` | `"credit"`; vacío es «todas las condiciones». */
  payment_terms: "" | PaymentTerms
  /** Solo ventas a crédito con saldo y vencimiento pasado. */
  overdue: boolean
}

/**
 * Lee la condición de pago y el filtro de vencidas de la URL, descartando
 * cualquier valor que no sea el que la API entiende.
 */
export function readSalesCreditFilters(query: string): SalesCreditFilters {
  const search = new URLSearchParams(query)
  const terms = search.get("payment_terms") ?? ""
  const overdue = search.get("overdue") ?? ""
  return {
    payment_terms: terms === "immediate" || terms === "credit" ? terms : "",
    overdue: overdue === "true" || overdue === "1",
  }
}

/**
 * `true` cuando la fila puede registrar un pago (S13): venta a crédito, viva y
 * con saldo. Una venta cancelada no lo admite —el backend responde `409`— y una
 * saldada ya no tiene nada que abonar.
 */
export function paymentActionAvailable(sale: ISaleListRow): boolean {
  if (sale.payment_terms !== "credit") return false
  if (sale.status === "cancelled") return false
  return (toCents(sale.balance ?? "0.00") ?? 0) > 0
}

/**
 * Modelo de la celda «Cobro»: saldo y vencimiento de una venta a crédito,
 * «Pagada» cuando el libro la saldó y `—` en una venta de contado, que no es una
 * cuenta por cobrar. «Vencida» es derivado (`is_overdue`), nunca una columna.
 */
export function creditColumnView(sale: ISaleListRow): ICreditCellView {
  const struck = statusLook(sale.status).struck
  const base = (classes: string): string => (struck ? `${classes} cell-struck` : classes)

  if (sale.payment_terms === "immediate") {
    return {
      classes: "cell-credit",
      value: "—",
      valueClass: base("cell-outline label-sm"),
      hint: "",
      hintClass: "",
    }
  }

  const balance = sale.balance ?? "0.00"
  if ((toCents(balance) ?? 0) === 0) {
    return {
      classes: "cell-credit",
      value: "Pagada",
      valueClass: base("cell-outline label-sm"),
      hint: "",
      hintClass: "",
    }
  }

  const due = sale.due_date === null ? "" : formatDate(sale.due_date)
  return {
    classes: "cell-credit",
    value: formatMoney(balance),
    valueClass: base("num-md"),
    hint: sale.is_overdue ? "Vencida" : due === "" ? "" : `Vence ${due}`,
    hintClass: base(sale.is_overdue ? "credit-note credit-note--overdue" : "credit-note"),
  }
}

/**
 * Deriva todo lo que la fila muestra a partir de la venta. La pluralización de
 * los adicionales (`1 art.` / `2 arts.`) queda aquí, como dato, y no en una
 * rama del DOM.
 */
export function saleListRowView(sale: ISaleListRow): ISaleListRowView {
  const look = statusLook(sale.status)
  const isWhatsapp = sale.type === "whatsapp"
  const count = sale.additional_count

  return {
    cancelled: look.cancelled,
    rowClass: look.rowClass,
    struck: look.struck,
    date: {
      classes: look.struck ? "num-sm cell-struck" : "num-sm",
      text: formatDate(sale.sale_date),
    },
    customer: {
      classes: look.struck ? "label-md cell-strong cell-struck" : "label-md cell-strong",
      text: sale.customer_name,
    },
    product: {
      classes: look.struck ? "cell-clamp cell-struck" : "cell-clamp",
      text: sale.product_name,
      title: sale.product_name,
    },
    channel: {
      classes: isWhatsapp ? "pill pill--wa" : "pill pill--counter",
      icon: isWhatsapp ? BAG_ICON : STORE_ICON,
      label: isWhatsapp ? "Tienda" : "Live",
    },
    additional:
      count === 0
        ? { classes: "cell-outline label-sm", text: "—" }
        : { classes: "items-chip", text: `${count} ${count === 1 ? "art." : "arts."}` },
    credit: creditColumnView(sale),
    total: {
      classes: look.struck ? "right num-md cell-total cell-struck" : "right num-md cell-total",
      text: formatMoney(sale.total),
    },
    print: {
      href: `/sales/detail?id=${encodeURIComponent(sale.id)}&print=1`,
      icon: look.printIcon,
      title: look.printTitle,
      ariaLabel: look.printTitle,
    },
    detail: {
      href: `/sales/detail?id=${encodeURIComponent(sale.id)}`,
      text: "Ver detalle",
    },
    payment: paymentActionAvailable(sale)
      ? {
          label: "Registrar pago",
          // El texto del botón se repite en cada fila: el nombre accesible es el
          // que dice de qué venta es el pago.
          ariaLabel: `Registrar un pago de la venta del ${formatDate(sale.sale_date)}`,
        }
      : null,
  }
}

/** Las dos líneas de la celda «Cobro», compartidas por el render y la actualización. */
function creditNodes(sale: ISaleListRow): HTMLElement[] {
  const view = creditColumnView(sale)
  const value = document.createElement("span")
  value.className = view.valueClass
  value.dataset["struck"] = ""
  value.textContent = view.value
  if (view.hint === "") return [value]

  const hint = document.createElement("span")
  hint.className = view.hintClass
  hint.dataset["struck"] = ""
  hint.textContent = view.hint
  return [value, hint]
}

/**
 * Construye el `<tr>` de una venta. La celda de estado se delega a
 * `buildStatusSelect`, que recibe el manejador por parámetro.
 *
 * Cambio posterior —autorizado aparte—: el enlace de detalle lleva `data-detail`
 * para que la fila pueda reemitirle el clic (`row-navigation.ts`).
 *
 * Cambio posterior (S13): la celda «Cobro» va justo después del estado y la
 * acción «Registrar pago» solo existe cuando la fila admite un pago y la página
 * pasó su manejador.
 *
 * Rareza preexistente (no se toca): `data-struck` se pone siempre en clienta,
 * producto y total, pero la celda de fecha no lo lleva aunque sí reciba
 * `cell-struck`. Por eso `applyStatusLook` —que recorre `[data-struck]`— no
 * destacha la fecha al cambiar de estado, mientras que `renderRow` sí la
 * tachaba de entrada. Es una divergencia conocida y deliberada.
 */
export function renderSaleListRow(
  sale: ISaleListRow,
  onChange: (select: HTMLSelectElement, sale: ISaleListRow) => void,
  onPayment?: (button: HTMLButtonElement, sale: ISaleListRow) => void,
): HTMLTableRowElement {
  const view = saleListRowView(sale)

  const tr = document.createElement("tr")
  tr.className = view.rowClass

  const date = document.createElement("td")
  date.className = view.date.classes
  date.textContent = view.date.text
  tr.append(date)

  const customer = document.createElement("td")
  const name = document.createElement("span")
  name.className = view.customer.classes
  name.dataset["struck"] = ""
  name.textContent = view.customer.text
  customer.append(name)
  tr.append(customer)

  const product = document.createElement("td")
  const productText = document.createElement("span")
  productText.className = view.product.classes
  productText.dataset["struck"] = ""
  productText.textContent = view.product.text
  productText.title = view.product.title
  product.append(productText)
  tr.append(product)

  const channel = document.createElement("td")
  const pill = document.createElement("span")
  pill.className = view.channel.classes
  const pillIcon = document.createElement("span")
  pillIcon.setAttribute("aria-hidden", "true")
  pillIcon.innerHTML = view.channel.icon
  pill.append(pillIcon, document.createTextNode(view.channel.label))
  channel.append(pill)
  tr.append(channel)

  tr.append(buildStatusSelect(sale, onChange))

  const credit = document.createElement("td")
  credit.className = view.credit.classes
  credit.dataset["credit"] = ""
  credit.append(...creditNodes(sale))
  tr.append(credit)

  const items = document.createElement("td")
  items.className = "center"
  const additional = document.createElement("span")
  additional.className = view.additional.classes
  additional.textContent = view.additional.text
  items.append(additional)
  tr.append(items)

  const total = document.createElement("td")
  total.className = view.total.classes
  total.dataset["struck"] = ""
  total.textContent = view.total.text
  tr.append(total)

  const actions = document.createElement("td")
  actions.className = "right no-print"
  const group = document.createElement("div")
  group.className = "row-actions"

  const printLink = document.createElement("a")
  printLink.className = "icon-btn"
  printLink.href = view.print.href
  printLink.title = view.print.title
  printLink.setAttribute("aria-label", view.print.ariaLabel)
  printLink.innerHTML = view.print.icon

  const detail = document.createElement("a")
  detail.className = "text-btn"
  // Gancho de la fila clickeable: `row-navigation.ts` busca este atributo para
  // reemitir el clic y no depende de la clase de estilo.
  detail.dataset["detail"] = ""
  detail.href = view.detail.href
  detail.textContent = view.detail.text

  group.append(printLink, detail)

  if (view.payment !== null && onPayment !== undefined) {
    const payment = view.payment
    const payButton = document.createElement("button")
    payButton.type = "button"
    payButton.className = "text-btn text-btn--payment"
    payButton.dataset["payment"] = ""
    payButton.textContent = payment.label
    payButton.setAttribute("aria-label", payment.ariaLabel)
    payButton.addEventListener("click", () => onPayment(payButton, sale))
    group.prepend(payButton)
  }

  actions.append(group)
  tr.append(actions)

  return tr
}

/**
 * Escribe en una fila ya montada el resultado de un pago: el saldo nuevo, la
 * segunda línea y, si la deuda se terminó, la desaparición de la acción.
 *
 * No toca el estado: eso lo resuelve `applyStatusLook` en `sale-status.ts`,
 * porque el `<select>` es de ese módulo.
 */
export function applyCreditToRow(row: HTMLTableRowElement, sale: ISaleListRow): void {
  const cell = row.querySelector<HTMLTableCellElement>("[data-credit]")
  if (cell !== null) {
    cell.className = creditColumnView(sale).classes
    cell.replaceChildren(...creditNodes(sale))
  }

  const button = row.querySelector<HTMLButtonElement>("[data-payment]")
  if (button !== null && !paymentActionAvailable(sale)) button.remove()
}
