import { describe, expect, it } from "vitest"
import { centsToMoney, describePayment, evaluatePayment, isPaymentAcceptable, toCents } from "./payment"

describe("toCents", () => {
  it("convierte un importe a centavos enteros", () => {
    expect(toCents("1250.50")).toBe(125050)
    expect(toCents("0.01")).toBe(1)
    expect(toCents("18")).toBe(1800)
  })

  it("tolera un decimal de un solo dígito", () => {
    expect(toCents("10.5")).toBe(1050)
  })

  it("devuelve null ante algo que no es un importe", () => {
    expect(toCents("")).toBeNull()
    expect(toCents("abc")).toBeNull()
    expect(toCents("10.005")).toBeNull()
    expect(toCents("-5")).toBeNull()
  })

  it("no arrastra error de coma flotante al sumar", () => {
    expect(toCents("0.1")! + toCents("0.2")!).toBe(30)
  })
})

describe("centsToMoney", () => {
  it("vuelve a la cadena de dos decimales", () => {
    expect(centsToMoney(125050)).toBe("1250.50")
    expect(centsToMoney(30)).toBe("0.30")
    expect(centsToMoney(0)).toBe("0.00")
  })
})

describe("evaluatePayment con efectivo", () => {
  const TOTAL = "185.50"

  it("cobrar exacto se acepta, sin cambio", () => {
    const v = evaluatePayment(TOTAL, "cash", "185.50")
    expect(v).toEqual({ state: "exact" })
    expect(isPaymentAcceptable(v)).toBe(true)
  })

  it("cobrar de más se acepta y dice el cambio", () => {
    const v = evaluatePayment(TOTAL, "cash", "200.00")
    expect(v).toEqual({ state: "change", change: "14.50" })
    expect(isPaymentAcceptable(v)).toBe(true)
    expect(describePayment(v)).toBe("Cambio a dar: C$ 14.50")
  })

  it("cobrar de menos se RECHAZA diciendo cuánto falta", () => {
    const v = evaluatePayment(TOTAL, "cash", "185.49")
    expect(v).toEqual({ state: "insufficient", missing: "0.01" })
    expect(isPaymentAcceptable(v)).toBe(false)
    expect(describePayment(v)).toBe("Monto insuficiente. Faltan C$ 0.01")
  })

  it("cobrar la mitad se rechaza con la diferencia completa", () => {
    const v = evaluatePayment(TOTAL, "cash", "100.00")
    expect(v).toEqual({ state: "insufficient", missing: "85.50" })
  })
})

describe("evaluatePayment con tarjeta", () => {
  const TOTAL = "185.50"

  it("el importe exacto se acepta y no hay cambio", () => {
    const v = evaluatePayment(TOTAL, "credit_card", "185.50")
    expect(v).toEqual({ state: "exact" })
    expect(isPaymentAcceptable(v)).toBe(true)
  })

  it("cobrar de más se RECHAZA: con tarjeta no hay vuelto", () => {
    const v = evaluatePayment(TOTAL, "credit_card", "200.00")
    expect(v).toEqual({ state: "card_mismatch", difference: "14.50" })
    expect(isPaymentAcceptable(v)).toBe(false)
    expect(describePayment(v)).toContain("exacto")
  })

  it("cobrar de menos también se rechaza, con la diferencia", () => {
    const v = evaluatePayment(TOTAL, "credit_card", "180.00")
    expect(v).toEqual({ state: "card_mismatch", difference: "5.50" })
    expect(isPaymentAcceptable(v)).toBe(false)
  })
})

describe("campo vacío o inválido", () => {
  it("vacío no es error todavía: la dueña está escribiendo", () => {
    const v = evaluatePayment("100.00", "cash", "")
    expect(v).toEqual({ state: "empty" })
    expect(isPaymentAcceptable(v)).toBe(false)
    expect(describePayment(v)).toBe("")
  })

  it("texto que no es importe se marca inválido", () => {
    const v = evaluatePayment("100.00", "cash", "abc")
    expect(v).toEqual({ state: "invalid" })
    expect(isPaymentAcceptable(v)).toBe(false)
  })

  it("ignora espacios alrededor", () => {
    expect(evaluatePayment("100.00", "cash", "  100.00  ")).toEqual({ state: "exact" })
  })
})
