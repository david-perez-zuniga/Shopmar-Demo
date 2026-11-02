/**
 * Estado de una venta en el listado: estilos, decisión de bloqueo y look.
 *
 * Frontera de pureza:
 * - La parte pura (estilos, `labelFor`, la lista de opciones, el `aria-label`,
 *   `statusLock` y `statusLook`) no toca `document` ni `window` ni recibe
 *   elementos: son derivaciones de un `SaleStatus`, comparables byte a byte con
 *   los fixtures congelados de `fixtures/sales/`.
 * - La parte DOM (`buildStatusSelect`, `applySelectLocks`, `applyStatusLook`)
 *   recibe las piezas sobre las que opera —el select, o la fila a la que llega
 *   el cambio— y nunca las busca por su cuenta.
 *
 * Es un refactor puro del `<script>` de `components/views/SalesView.astro`: reproduce su
 * salida y no arregla nada, aunque algo parezca un bug. Las rarezas a propósito
 * están anotadas más abajo.
 *
 * Cambio posterior (S13, venta a crédito): el selector de una venta a crédito
 * **no ofrece `completed` como destino**. En una venta a crédito el estado de
 * cobro lo escribe el libro de pagos —una venta llega a `completed` sólo cuando
 * el saldo llega a cero por pagos registrados— y el endpoint de estado sólo
 * acepta `cancelled`; por eso el selector queda con el estado vigente (elegido y
 * no seleccionable) más «Cancelada» como único destino. En una venta de contado
 * el selector sigue ofreciendo los tres estados, igual que antes.
 */

import { on, qs } from "../core/dom"
import { CARET } from "../core/icons"
import type { ISaleListRow, SaleStatus } from "../core/types"

export interface IStatusStyle {
  classes: string
  label: string
}

export const STATUS_STYLE: Record<SaleStatus, IStatusStyle> = {
  completed: { classes: "status-select--completed", label: "Completada" },
  pending: { classes: "status-select--pending", label: "Pendiente" },
  cancelled: { classes: "status-select--cancelled", label: "Cancelada" },
}

/**
 * Orden con el que se listan las opciones. Es el orden de inserción de
 * `STATUS_STYLE` y el que fijan los fixtures: completed, pending, cancelled.
 */
export const STATUS_OPTIONS = Object.keys(STATUS_STYLE) as SaleStatus[]

/** Modificador de fila de una venta cancelada. */
export const CANCELLED_ROW_CLASS = "row--cancelled"

/** Clase que tacha una celda de una fila cancelada. */
export const STRUCK_CELL_CLASS = "cell-struck"

const LOCKED_CLASS = "status-select--locked"
const PRINT_ICON =
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>`
const RECEIPT_ICON =
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>`

export function labelFor(status: SaleStatus): string {
  return STATUS_STYLE[status].label
}

/** El `aria-label` del select, con el aviso extra cuando el estado es final. */
export function statusAriaLabel(customerName: string, status: SaleStatus): string {
  return status === "cancelled"
    ? `Estado de la venta a ${customerName}: cancelada, no se puede cambiar`
    : `Estado de la venta a ${customerName}`
}

export interface IStatusLock {
  /** `true` para el único estado final: cancelada. */
  final: boolean
  /** `title` del select, distinto para el estado final. */
  title: string
  /** Texto de la nota de bloqueo; `null` cuando el select queda desbloqueado. */
  note: string | null
}

export function statusLock(status: SaleStatus): IStatusLock {
  const isFinal = status === "cancelled"
  return {
    final: isFinal,
    title: isFinal
      ? "Cancelada es definitiva: esta venta no se puede cambiar de estado"
      : "Cambiar de estado solicita confirmación rápida",
    note: isFinal ? "Cancelada es definitiva: no se puede cambiar" : null,
  }
}

export interface IStatusLook {
  /** `true` cuando el estado es cancelada. */
  cancelled: boolean
  /** Clases completas del `<tr>` de una fila recién construida. */
  rowClass: string
  /** Si el estado tacha las celdas de la fila. */
  struck: boolean
  /** Icono del botón de impresión. */
  printIcon: string
  /** `title` (y `aria-label`) del botón de impresión. */
  printTitle: string
}

export function statusLook(status: SaleStatus): IStatusLook {
  const cancelled = status === "cancelled"
  return {
    cancelled,
    rowClass: cancelled ? `ledger-row ${CANCELLED_ROW_CLASS}` : "ledger-row",
    struck: cancelled,
    printIcon: cancelled ? RECEIPT_ICON : PRINT_ICON,
    printTitle: cancelled ? "Imprimir comprobante de venta cancelada" : "Imprimir comprobante",
  }
}

export function buildStatusSelect(
  sale: ISaleListRow,
  onChange: (select: HTMLSelectElement, sale: ISaleListRow) => void,
): HTMLTableCellElement {
  const cell = document.createElement("td")
  const wrap = document.createElement("div")
  wrap.className = "status-wrap"

  const select = document.createElement("select")
  select.className = `status-select ${STATUS_STYLE[sale.status].classes}`
  select.dataset["saleId"] = sale.id
  applySelectLocks(select, sale.status)
  select.setAttribute("aria-label", statusAriaLabel(sale.customer_name, sale.status))

  select.append(...statusOptionNodes(statusOptions(sale)))

  on(select, "change", () => void onChange(select, sale))
  wrap.append(select)
  const caret = document.createElement("span")
  caret.className = "status-caret"
  caret.setAttribute("aria-hidden", "true")
  caret.innerHTML = CARET
  wrap.append(caret)
  cell.append(wrap)
  return cell
}

/** Una opción del selector, con todo lo que el `<option>` necesita resuelto. */
export interface IStatusOption {
  value: SaleStatus
  label: string
  selected: boolean
  /**
   * `true` cuando la opción sólo **muestra** el estado vigente de una venta a
   * crédito y no es un destino que se pueda elegir.
   */
  fixed: boolean
}

/**
 * Opciones del selector según la condición de pago (S13).
 *
 * Contado: los tres estados, como siempre, ninguno fijo. Crédito: el estado
 * vigente (fijo, para que la celda siga diciendo la verdad) más «Cancelada», que
 * es el único destino que el endpoint acepta en una venta a crédito. `completed`
 * nunca es un destino: lo escribe el libro de pagos cuando el saldo llega a cero.
 */
export function statusOptions(
  sale: Pick<ISaleListRow, "status" | "payment_terms">,
): IStatusOption[] {
  const credit = sale.payment_terms === "credit"
  const values = credit
    ? STATUS_OPTIONS.filter((value) => value === sale.status || value === "cancelled")
    : STATUS_OPTIONS

  return values.map((value) => ({
    value,
    label: STATUS_STYLE[value].label,
    selected: value === sale.status,
    fixed: credit && value === sale.status,
  }))
}

function statusOptionNodes(options: readonly IStatusOption[]): HTMLOptionElement[] {
  return options.map((entry) => {
    const option = document.createElement("option")
    option.value = entry.value
    option.textContent = entry.label
    option.selected = entry.selected
    option.disabled = entry.fixed
    return option
  })
}

/**
 * Reescribe las opciones de un select ya montado si la condición de pago cambió
 * la lista. En una venta de contado la lista no cambia nunca, así que el camino
 * de siempre queda sin tocar el DOM: sólo se fija el valor.
 */
function syncStatusOptions(
  select: HTMLSelectElement,
  sale: ISaleListRow,
  next: SaleStatus,
): void {
  const options = statusOptions({ status: next, payment_terms: sale.payment_terms })
  const wanted = options.map((option) => option.value).join("|")
  const mounted = Array.from(select.options, (option) => option.value).join("|")
  if (wanted !== mounted) select.replaceChildren(...statusOptionNodes(options))
  select.value = next
}

export function applySelectLocks(select: HTMLSelectElement, status: SaleStatus): void {
  const lock = statusLock(status)
  select.disabled = lock.final
  select.classList.toggle(LOCKED_CLASS, lock.final)
  select.title = lock.title
  select.closest(".status-wrap")?.parentElement
    ?.querySelector("[data-status-lock]")
    ?.remove()
  if (!lock.final || lock.note === null) return

  // Rareza preexistente: si el select todavía no está dentro de `.status-wrap`
  // (el camino de `buildStatusSelect`), la nota se crea y se descarta. Una fila
  // cancelada recién pintada no la trae; solo aparece tras un cambio de estado
  // sobre una fila montada.
  const note = document.createElement("p")
  note.className = "status-locked"
  note.dataset["statusLock"] = ""
  note.textContent = lock.note
  select.closest(".status-wrap")?.insertAdjacentElement("afterend", note)
}

/**
 * Aplica el look del estado nuevo a una fila ya montada. El `sale` se usa para
 * reconstruir las opciones del `<select>` según la condición de pago: una venta a
 * crédito que se cancela no puede seguir ofreciendo el estado que ya no tiene.
 */
export function applyStatusLook(
  select: HTMLSelectElement,
  sale: ISaleListRow,
  next: SaleStatus,
): void {
  select.className = `status-select ${STATUS_STYLE[next].classes}`
  syncStatusOptions(select, sale, next)
  applySelectLocks(select, next)
  const row = select.closest("tr")
  if (row === null) return
  const look = statusLook(next)
  row.classList.toggle(CANCELLED_ROW_CLASS, look.cancelled)
  for (const cell of row.querySelectorAll<HTMLElement>("[data-struck]")) {
    cell.classList.toggle(STRUCK_CELL_CLASS, look.struck)
  }
  const printButton = qs<HTMLAnchorElement>(".icon-btn", row)
  if (printButton !== null) {
    printButton.innerHTML = look.printIcon
    printButton.title = look.printTitle
    printButton.setAttribute("aria-label", printButton.title)
  }
}
