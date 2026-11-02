import { formatMoney } from "../core/format"

const MONEY_CENTS = /^\s*(\d{1,8})(?:\.(\d{1,2}))?\s*$/

export function toCents(raw: string): number | null {
  const match = MONEY_CENTS.exec(raw)
  if (match === null) return null
  return Number(match[1]) * 100 + Number((match[2] ?? "00").padEnd(2, "0"))
}

export function centsToMoney(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`
}

export type PaymentMethod = "cash" | "credit_card"

export function paymentMethodLabel(method: PaymentMethod): string {
  return method === "cash" ? "Efectivo" : "Tarjeta de crédito"
}

export type PaymentVerdict =
  | { state: "empty" }
  | { state: "invalid" }
  | { state: "insufficient"; missing: string }
  | { state: "card_mismatch"; difference: string }
  | { state: "exact" }
  | { state: "change"; change: string }

export function evaluatePayment(
  total: string,
  method: PaymentMethod,
  amountRaw: string,
): PaymentVerdict {
  const trimmed = amountRaw.trim()
  if (trimmed === "") return { state: "empty" }

  const paid = toCents(trimmed)
  if (paid === null) return { state: "invalid" }

  const totalCents = toCents(total)
  if (totalCents === null) return { state: "invalid" }

  if (method === "credit_card") {
    if (paid === totalCents) return { state: "exact" }
    const difference = centsToMoney(Math.abs(paid - totalCents))
    return { state: "card_mismatch", difference }
  }

  if (paid === totalCents) return { state: "exact" }
  if (paid < totalCents) return { state: "insufficient", missing: centsToMoney(totalCents - paid) }
  return { state: "change", change: centsToMoney(paid - totalCents) }
}

export function isPaymentAcceptable(verdict: PaymentVerdict): boolean {
  return verdict.state === "exact" || verdict.state === "change"
}

export function describePayment(verdict: PaymentVerdict): string {
  switch (verdict.state) {
    case "empty":
      return ""
    case "invalid":
      return "Escribí un importe como 1250.50"
    case "insufficient":
      return `Monto insuficiente. Faltan ${formatMoney(verdict.missing)}`
    case "card_mismatch":
      return `Con tarjeta el cobro tiene que ser exacto: difiere en ${formatMoney(verdict.difference)}`
    case "exact":
      return "Cobro exacto"
    case "change":
      return `Cambio a dar: ${formatMoney(verdict.change)}`
  }
}
