/**
 * Diálogo de confirmación de cambio de estado del listado de ventas.
 *
 * Frontera de pureza:
 * - Todo lo que el diálogo necesita entra por parámetro: la raíz del overlay,
 *   la venta, el estado destino, la etiqueta del botón y si hay pago. No lee
 *   variables de la página ni busca nada en un `document` global: cada pieza se
 *   resuelve con `qs()` dentro del overlay recibido.
 * - El listener del foco se engancha al `ownerDocument` del overlay, no al
 *   `document` del módulo.
 * - No conoce la página: no muestra toasts, no llama a la API ni escribe el
 *   estado de la fila. Solo devuelve la promesa con la respuesta.
 *
 * Extraído del `<script>` de `components/views/SalesView.astro`. Reproduce su salida y
 * su comportamiento salvo un arreglo deliberado: sin paso de pago el botón de
 * confirmar queda habilitado y confirmar resuelve `ok`, en vez de quedar
 * deshabilitado y resolverse como rechazo. Es el único cambio de comportamiento
 * de este refactor; el resto sigue siendo byte a byte.
 */

import { on, qs, setText } from "../core/dom"
import { formatDate, formatMoney } from "../core/format"
import {
  centsToMoney,
  describePayment,
  evaluatePayment,
  isPaymentAcceptable,
  paymentMethodLabel,
  toCents,
} from "./payment"
import { labelFor } from "./sale-status"
import type { PaymentVerdict } from "./payment"
import type { ISaleListRow, SaleStatus } from "../core/types"

/** Respuesta del diálogo: `ok` y, al confirmar con pago, el monto cobrado. */
export type ConfirmAnswer = { ok: boolean; amountPaid?: string }

/**
 * Referencia humana de una venta. La usan el diálogo y el toast de la página,
 * que la importa: una sola copia del texto.
 */
export function formatReference(sale: ISaleListRow): string {
  return `la venta del ${formatDate(sale.sale_date)}`
}

function strong(doc: Document, text: string, isError = false): HTMLElement {
  const node = doc.createElement("strong")
  node.className = isError ? "modal-target modal-target--error" : "modal-target"
  node.textContent = text
  return node
}

/**
 * Abre el diálogo dentro de `overlay` y resuelve cuando el usuario confirma o
 * cancela. Si el overlay no está montado devuelve `{ ok: true }` sin tocar el
 * documento, igual que la página.
 */
export function askConfirm(
  overlay: HTMLElement | null,
  sale: ISaleListRow,
  next: SaleStatus,
  confirmLabel: string,
  needsPayment: boolean,
): Promise<ConfirmAnswer> {
  if (overlay === null) return Promise.resolve({ ok: true })

  const doc = overlay.ownerDocument
  const dialogPrompt = qs("#dialog-prompt", overlay)
  if (dialogPrompt === null) return Promise.resolve({ ok: true })

  dialogPrompt.replaceChildren(
    doc.createTextNode("¿Confirmar cambio de estado de "),
    strong(doc, formatReference(sale)),
    doc.createTextNode(" a "),
    strong(doc, labelFor(next), next === "cancelled"),
    doc.createTextNode(
      next === "cancelled"
        ? "? La venta queda en el historial con el importe que tenía, pero deja de sumar en el total del período. Cancelar no se puede deshacer: si fue un error, registrala de nuevo como una venta nueva."
        : "? La venta queda en el historial con el importe que tenía, sin recalcular nada.",
    ),
  )

  const confirmButton = qs<HTMLButtonElement>("#confirm-state", overlay)
  const cancelButton = qs<HTMLButtonElement>("#cancel-state", overlay)
  if (confirmButton !== null) setText(confirmButton, confirmLabel)

  const paymentBlock = qs<HTMLElement>("#payment-block", overlay)
  const paymentTotal = qs("#payment-total", overlay)
  const paymentMethod = qs("#payment-method", overlay)
  const paymentLabel = qs("#payment-amount-label", overlay)
  const paymentInput = qs<HTMLInputElement>("#payment-amount", overlay)
  const paymentFeedback = qs("#payment-feedback", overlay)

  if (paymentBlock !== null) paymentBlock.hidden = !needsPayment

  // La visibilidad del paso de pago se deriva una sola vez del bloque que la
  // maneja (presencia y `hidden`) y se reutiliza en el gating del botón y en
  // `settle`, en vez de re-derivar la condición en cada lugar.
  const paymentVisible = paymentBlock !== null && !paymentBlock.hidden

  const method = sale.payment_method
  if (paymentTotal !== null) setText(paymentTotal, formatMoney(sale.total))
  if (paymentMethod !== null) setText(paymentMethod, paymentMethodLabel(method))
  if (paymentLabel !== null) {
    setText(paymentLabel, method === "cash" ? "Monto recibido" : "Monto cobrado")
  }
  if (paymentInput !== null) paymentInput.value = ""

  const verdict = (): PaymentVerdict =>
    evaluatePayment(sale.total, method, paymentInput?.value ?? "")

  const syncPayment = (): void => {
    const v = verdict()
    const acceptable = isPaymentAcceptable(v)
    // Con el paso de pago visible el botón depende del veredicto; si no hay
    // paso de pago no hay nada que cobrar y confirmar siempre queda habilitado.
    if (confirmButton !== null) confirmButton.disabled = paymentVisible && !acceptable
    if (paymentInput !== null) {
      paymentInput.classList.toggle("is-invalid", !acceptable && v.state !== "empty")
    }
    if (paymentFeedback === null) return
    setText(paymentFeedback, describePayment(v))
    paymentFeedback.classList.toggle("is-error", !acceptable && v.state !== "empty")
    paymentFeedback.classList.toggle("is-ok", acceptable)
  }

  // `syncPayment()` corre siempre, también sin pago: mantiene el veredicto y el
  // feedback frescos. Sin paso de pago el botón no depende del veredicto (lo
  // cubre `paymentVisible`), así que el input vacío ya no lo deshabilita.
  syncPayment()
  on(paymentInput, "input", syncPayment)

  overlay.classList.add("is-open")
  if (needsPayment) paymentInput?.focus()
  else cancelButton?.focus()

  return new Promise((resolve) => {
    const settle = (answer: boolean): void => {
      overlay.classList.remove("is-open")
      doc.removeEventListener("keydown", onKeyDown, true)
      paymentInput?.removeEventListener("input", syncPayment)
      if (!answer) {
        resolve({ ok: false })
        return
      }
      if (!paymentVisible) {
        // Sin paso de pago no hay monto que cobrar: confirmar no depende de que
        // `toCents` sepa leer el input, que está vacío.
        resolve({ ok: true })
        return
      }
      const cents = paymentInput === null ? null : toCents(paymentInput.value)
      resolve(cents !== null ? { ok: true, amountPaid: centsToMoney(cents) } : { ok: false })
    }

    const focusables = (): HTMLElement[] => {
      const list: HTMLElement[] = []
      if (paymentBlock?.hidden === false && paymentInput !== null) list.push(paymentInput)
      if (cancelButton !== null) list.push(cancelButton)
      if (confirmButton !== null) list.push(confirmButton)
      return list
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        settle(false)
        return
      }
      if (event.key === "Enter" && doc.activeElement === paymentInput) {
        event.preventDefault()
        if (isPaymentAcceptable(verdict())) settle(true)
        return
      }
      if (event.key !== "Tab") return
      event.preventDefault()
      const list = focusables()
      if (list.length === 0) return
      const current = list.indexOf(doc.activeElement as HTMLElement)
      const step = event.shiftKey ? -1 : 1
      const focusTarget = (current + step + list.length) % list.length
      list[focusTarget]?.focus()
    }

    on(confirmButton ?? overlay, "click", () => settle(true))
    on(cancelButton ?? overlay, "click", () => settle(false))
    on(overlay, "click", (event) => {
      if (event.target === overlay) settle(false)
    })
    doc.addEventListener("keydown", onKeyDown, true)
  })
}
