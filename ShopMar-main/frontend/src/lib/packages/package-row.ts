/**
 * Fila del listado de paquetes: modelo de vista puro + renderizador DOM.
 *
 * Frontera de pureza:
 * - La parte pura (`packageRowView`) convierte una `ISaleListRow` en todo lo que
 *   se deriva de ella y no toca `document` ni `window`: el `data-sale-id` y, por
 *   celda, sus clases y su texto (fecha, clienta, mercadería, método y total).
 * - La parte DOM (`renderPackageRow`) arma el `<tr>` clonando la plantilla de la
 *   página y recibiendo por parámetro lo que necesita —la plantilla y el
 *   manejador de cambio del select—, sin resolver nada derivable por su cuenta.
 *
 * Es la extracción del `buildRow` de `pages/packages/index.astro`: reproduce su
 * salida byte a byte. Sus dos cambios posteriores —autorizados aparte— son la
 * corrección del `<td>` anidado: `buildShipmentSelect` ahora devuelve el
 * envoltorio y la fila lo inserta directo en la celda de método; y el recorte de
 * la mercadería (ver `IProductCellView`), que pasó del `<td>` a un `<span>`. Las
 * rarezas a propósito que quedan están anotadas más abajo.
 */

import { clear, setText } from "../core/dom"
import { formatDate, formatMoney } from "../core/format"
import { buildShipmentSelect } from "./shipment-status"
import type { ShipmentChangeHandler } from "./shipment-status"
import type { ISaleListRow } from "../core/types"

/** Una celda con texto: sus clases completas y su contenido. */
export interface ICellView {
  classes: string
  text: string
}

/**
 * La celda de método no lleva texto propio: el `<div class="shipment-wrap">` que
 * devuelve `buildShipmentSelect` se inserta dentro. El modelo de vista solo fija
 * sus clases.
 */
export interface IMethodCellView {
  classes: string
}

/**
 * La celda de mercadería tiene dos capas: el `<td>` que participa de la tabla
 * —y por eso lleva la clase de columna— y un `<span>` interno que recorta el
 * texto a una línea.
 *
 * El recorte no puede vivir en el `<td>`: `cell-clamp` necesita
 * `display: -webkit-box` para `line-clamp`, y una celda con otro `display` deja
 * de ser `table-cell`, pierde `vertical-align: middle` y se encoge a la altura
 * del texto. Ver `fixtures/packages/README.md`.
 */
export interface IProductCellView {
  /** Clases del `<td>`: la columna y su `min-width`. */
  classes: string
  /** Clases del `<span>` interno: el recorte de una línea. */
  textClasses: string
  text: string
}

export interface IPackageRowView {
  /** Valor de `data-sale-id`. */
  saleId: string
  date: ICellView
  customer: ICellView
  product: IProductCellView
  method: IMethodCellView
  total: ICellView
}

/**
 * Deriva todo lo que la fila muestra a partir de la venta. Las claves son las
 * `data-cell="…"` de la plantilla de la página.
 */
export function packageRowView(sale: ISaleListRow): IPackageRowView {
  return {
    saleId: sale.id,
    date: { classes: "num-sm", text: formatDate(sale.sale_date) },
    customer: { classes: "cell-strong", text: sale.customer_name },
    product: {
      classes: "col-product",
      textClasses: "cell-clamp",
      text: sale.product_name,
    },
    method: { classes: "col-channel" },
    total: { classes: "col-total right cell-total", text: formatMoney(sale.total) },
  }
}

/**
 * Construye el `<tr>` de un paquete clonando la plantilla de fila y llenando sus
 * celdas. Si la plantilla falta, o su primer hijo no es un `<tr>`, devuelve un
 * `<tr>` pelado, igual que el `buildRow` original.
 *
 * `additional_count` no se lee: la plantilla no tiene celda de conteo, así que
 * nunca se pinta. Rareza preexistente y congelada.
 */
export function renderPackageRow(
  sale: ISaleListRow,
  template: HTMLTemplateElement | null,
  onChange: ShipmentChangeHandler,
): HTMLTableRowElement {
  const row = template?.content.firstElementChild?.cloneNode(true)
  if (!(row instanceof HTMLTableRowElement)) return document.createElement("tr")

  const view = packageRowView(sale)
  row.dataset.saleId = view.saleId

  const cell = (name: string): HTMLElement | null =>
    row.querySelector<HTMLElement>(`[data-cell="${name}"]`)

  const date = cell("date")
  if (date !== null) {
    date.className = view.date.classes
    setText(date, view.date.text)
  }

  const customer = cell("customer")
  if (customer !== null) {
    customer.className = view.customer.classes
    setText(customer, view.customer.text)
  }

  const product = cell("product")
  if (product !== null) {
    product.className = view.product.classes
    const text = document.createElement("span")
    text.className = view.product.textClasses
    text.textContent = view.product.text
    clear(product)
    product.append(text)
  }

  const method = cell("method")
  if (method !== null) {
    method.className = view.method.classes
    const control = buildShipmentSelect(sale, onChange)
    clear(method)
    // El envoltorio entra directo en la celda de método, sin el `<td>` anidado
    // que la extracción había congelado: la celda queda
    // `<td … data-cell="method"><div class="shipment-wrap">…</div></td>`.
    method.append(control)
  }

  const total = cell("total")
  if (total !== null) {
    total.className = view.total.classes
    setText(total, view.total.text)
  }

  return row
}
