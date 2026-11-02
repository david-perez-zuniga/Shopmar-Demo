/**
 * Modal «Registrar pago» de una venta a crédito en el listado (S13).
 *
 * Frontera de pureza:
 * - La parte pura (`evaluatePaymentEntry`, `isPaymentEntryAcceptable`,
 *   `describePaymentEntry` y `paymentPayload`) no toca `document` ni `window`:
 *   recibe los valores del formulario y devuelve un veredicto o el cuerpo exacto
 *   de `POST /api/v1/sales/:id/payments`.
 * - La parte DOM (`askPayment`) recibe la raíz del overlay por parámetro y
 *   resuelve cada pieza con `qs()` **dentro** de ella: no conoce la página, no
 *   muestra toasts ni llama a la API. Devuelve la promesa con el resultado.
 *
 * El importe se lee con `toCents` (`payment.ts`), la misma rutina del modal de
 * cobro del mostrador: nunca con `parseFloat`, que aceptaría `"500,00"` como 500
 * y `"1.234"` como 1.234 cuando el patrón de dinero de la API dice otra cosa.
 *
 * La regla del servidor es la última palabra: acá se adelanta lo que se puede
 * saber sin red —positivo, no mayor al saldo, banco obligatorio con tarjeta— y
 * un `400` del backend se sigue mostrando con su mensaje.
 */

import { on, qs, setText } from "../core/dom"
import { todayLocal } from "../core/date"
import { formatMoney } from "../core/format"
import { formatReference } from "./confirm-dialog"
import { centsToMoney, toCents } from "./payment"
import type { PaymentMethod } from "./payment"
import type { ICreateSalePaymentRequest, ISaleListRow } from "../core/types"

/** Tope de la nota, el mismo que valida el DTO del backend. */
export const PAYMENT_NOTE_MAX = 500

/** Los valores del formulario tal como están en pantalla. */
export interface IPaymentEntry {
  /** Saldo pendiente de la venta, como cadena decimal de la API. */
  balance: string
  /** Lo tipeado en el campo de monto. */
  amountRaw: string
  /** `YYYY-MM-DD` del `<input type="date">`. */
  paidAtRaw: string
  method: PaymentMethod
  /** Banco elegido; solo cuenta con tarjeta. */
  bank: string
  note: string
}

export type PaymentEntryVerdict =
  | { state: "empty" }
  | { state: "invalid_amount" }
  | { state: "zero" }
  | { state: "exceeds"; max: string }
  | { state: "missing_date" }
  | { state: "missing_bank" }
  | { state: "note_too_long" }
  | { state: "ok"; amount: string; remainder: string }

/**
 * Veredicto del formulario. `empty` no es un error todavía —el campo recién
 * abierto no dice nada—, y el orden de las comprobaciones es el orden en que la
 * dueña completa el modal: primero el monto, después la fecha, el banco y la nota.
 */
export function evaluatePaymentEntry(entry: IPaymentEntry): PaymentEntryVerdict {
  const amount = entry.amountRaw.trim()
  if (amount === "") return { state: "empty" }

  const cents = toCents(amount)
  if (cents === null) return { state: "invalid_amount" }
  if (cents === 0) return { state: "zero" }

  // Un saldo que no parsea se trata como cero: sin saldo legible, ningún pago
  // positivo es admisible y el mensaje nombra el saldo tal como vino.
  const balanceCents = toCents(entry.balance) ?? 0
  if (cents > balanceCents) return { state: "exceeds", max: formatMoney(entry.balance) }

  if (entry.paidAtRaw.trim() === "") return { state: "missing_date" }
  if (entry.method === "credit_card" && entry.bank.trim() === "") return { state: "missing_bank" }
  if (entry.note.trim().length > PAYMENT_NOTE_MAX) return { state: "note_too_long" }

  return {
    state: "ok",
    amount: centsToMoney(cents),
    remainder: centsToMoney(balanceCents - cents),
  }
}

export function isPaymentEntryAcceptable(verdict: PaymentEntryVerdict): boolean {
  return verdict.state === "ok"
}

export function describePaymentEntry(verdict: PaymentEntryVerdict): string {
  switch (verdict.state) {
    case "empty":
      return ""
    case "invalid_amount":
      return "Escribí un importe como 500.00"
    case "zero":
      return "El pago tiene que ser mayor que cero"
    case "exceeds":
      return `El pago no puede superar el saldo pendiente de ${verdict.max}`
    case "missing_date":
      return "Elegí la fecha del pago"
    case "missing_bank":
      return "Elegí el banco emisor de la tarjeta"
    case "note_too_long":
      return `La nota admite hasta ${PAYMENT_NOTE_MAX} caracteres`
    case "ok":
      return verdict.remainder === "0.00"
        ? "Con este pago la venta queda saldada"
        : `Queda un saldo de ${formatMoney(verdict.remainder)}`
  }
}

/**
 * Cuerpo exacto de `POST /api/v1/sales/:id/payments`. `payment_bank` viaja en
 * `null` con efectivo —la API lo prohíbe en ese caso— y la nota vacía también es
 * `null`, no cadena vacía.
 *
 * La fecha se manda como el inicio del día elegido en UTC, que es la misma
 * convención que usa el formulario de venta para `sale_date`.
 */
export function paymentPayload(entry: IPaymentEntry): ICreateSalePaymentRequest {
  const cents = toCents(entry.amountRaw.trim()) ?? 0
  const note = entry.note.trim()
  return {
    amount: centsToMoney(cents),
    paid_at: `${entry.paidAtRaw.trim()}T00:00:00.000Z`,
    payment_method: entry.method,
    payment_bank: entry.method === "credit_card" ? entry.bank.trim() : null,
    note: note === "" ? null : note,
  }
}

/** Respuesta del modal: `ok` y, al registrar, el cuerpo del pago. */
export type PaymentAnswer = { ok: true; payload: ICreateSalePaymentRequest } | { ok: false }

/**
 * Abre el modal dentro de `overlay` y resuelve cuando la dueña registra o
 * cancela. Sin overlay montado, o sin las piezas mínimas, devuelve `ok: false`:
 * un modal que no puede leer el monto no puede inventar un pago.
 */
export function askPayment(
  overlay: HTMLElement | null,
  sale: ISaleListRow,
): Promise<PaymentAnswer> {
  if (overlay === null) return Promise.resolve({ ok: false })

  const doc = overlay.ownerDocument
  const amount = qs<HTMLInputElement>("#payment-entry-amount", overlay)
  const date = qs<HTMLInputElement>("#payment-entry-date", overlay)
  const methodSelect = qs<HTMLSelectElement>("#payment-entry-method", overlay)
  const bankField = qs<HTMLElement>("#payment-bank-field", overlay)
  const bankSelect = qs<HTMLSelectElement>("#payment-entry-bank", overlay)
  const noteInput = qs<HTMLInputElement>("#payment-entry-note", overlay)
  const feedback = qs("#payment-entry-feedback", overlay)
  const confirmButton = qs<HTMLButtonElement>("#confirm-payment", overlay)
  const cancelButton = qs<HTMLButtonElement>("#cancel-payment", overlay)

  if (amount === null || date === null || methodSelect === null || confirmButton === null) {
    return Promise.resolve({ ok: false })
  }

  const balance = sale.balance ?? "0.00"
  setText(qs("#payment-balance", overlay), formatMoney(balance))
  setText(qs("#payment-balance-line", overlay), `Registrar un abono de ${formatReference(sale)}`)

  // El modal se abre siempre en el caso más común: efectivo, hoy y sin nota.
  amount.value = ""
  date.value = todayLocal()
  methodSelect.value = "cash"
  if (bankSelect !== null) {
    bankSelect.value = ""
    bankSelect.disabled = true
  }
  if (bankField !== null) bankField.hidden = true
  if (noteInput !== null) noteInput.value = ""

  const entry = (): IPaymentEntry => ({
    balance,
    amountRaw: amount.value,
    paidAtRaw: date.value,
    method: methodSelect.value === "credit_card" ? "credit_card" : "cash",
    bank: bankSelect?.value ?? "",
    note: noteInput?.value ?? "",
  })

  const sync = (): void => {
    const card = methodSelect.value === "credit_card"
    if (bankField !== null) bankField.hidden = !card
    if (bankSelect !== null) {
      bankSelect.disabled = !card
      // Con efectivo el banco no solo se esconde: se limpia, porque la API lo
      // prohíbe en ese caso y un valor escondido no debe viajar en el cuerpo.
      if (!card) bankSelect.value = ""
    }

    const verdict = evaluatePaymentEntry(entry())
    const acceptable = isPaymentEntryAcceptable(verdict)
    confirmButton.disabled = !acceptable
    const showError = !acceptable && verdict.state !== "empty"
    amount.classList.toggle("is-invalid", showError)
    if (feedback !== null) {
      setText(feedback, describePaymentEntry(verdict))
      feedback.classList.toggle("is-error", showError)
      feedback.classList.toggle("is-ok", acceptable)
    }
  }

  sync()

  const onAmountInput = (): void => sync()
  const onMethodChange = (): void => sync()
  const onNoteInput = (): void => sync()

  on(amount, "input", onAmountInput)
  on(methodSelect, "change", onMethodChange)
  on(noteInput ?? amount, "input", onNoteInput)
  on(bankSelect ?? amount, "change", onMethodChange)

  overlay.classList.add("is-open")
  amount.focus()

  return new Promise((resolve) => {
    const focusables = (): HTMLElement[] => {
      const list: HTMLElement[] = [amount, date, methodSelect]
      if (bankField?.hidden === false && bankSelect !== null) list.push(bankSelect)
      if (noteInput !== null) list.push(noteInput)
      if (cancelButton !== null) list.push(cancelButton)
      list.push(confirmButton)
      return list
    }

    const settle = (answer: boolean): void => {
      overlay.classList.remove("is-open")
      doc.removeEventListener("keydown", onKeyDown, true)
      amount.removeEventListener("input", onAmountInput)
      methodSelect.removeEventListener("change", onMethodChange)
      noteInput?.removeEventListener("input", onNoteInput)
      bankSelect?.removeEventListener("change", onMethodChange)
      overlay.removeEventListener("click", onOverlayClick)
      confirmButton.removeEventListener("click", onConfirmClick)
      cancelButton?.removeEventListener("click", onCancelClick)
      if (!answer) {
        resolve({ ok: false })
        return
      }
      resolve({ ok: true, payload: paymentPayload(entry()) })
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        settle(false)
        return
      }
      if (event.key === "Enter" && doc.activeElement === amount) {
        event.preventDefault()
        if (isPaymentEntryAcceptable(evaluatePaymentEntry(entry()))) settle(true)
        return
      }
      if (event.key !== "Tab") return
      event.preventDefault()
      const list = focusables()
      const current = list.indexOf(doc.activeElement as HTMLElement)
      const step = event.shiftKey ? -1 : 1
      list[(current + step + list.length) % list.length]?.focus()
    }

    const onConfirmClick = (): void => settle(true)
    const onCancelClick = (): void => settle(false)
    const onOverlayClick = (event: Event): void => {
      if (event.target === overlay) settle(false)
    }

    confirmButton.addEventListener("click", onConfirmClick)
    cancelButton?.addEventListener("click", onCancelClick)
    overlay.addEventListener("click", onOverlayClick)
    doc.addEventListener("keydown", onKeyDown, true)
  })
}
