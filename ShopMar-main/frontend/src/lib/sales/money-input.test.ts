import { describe, expect, it } from "vitest"
import { moneyInputError, sanitizeMoneyInput } from "./money-input"

describe("sanitizeMoneyInput", () => {
  it("deja pasar un importe normal", () => {
    expect(sanitizeMoneyInput("1250.50")).toBe("1250.50")
    expect(sanitizeMoneyInput("60000")).toBe("60000")
  })

  it("saca las letras y los símbolos", () => {
    expect(sanitizeMoneyInput("12a50")).toBe("1250")
    // El campo usa punto decimal: la coma de miles se descarta junto con el símbolo.
    expect(sanitizeMoneyInput("C$ 1,250.50")).toBe("1250.50")
    expect(sanitizeMoneyInput("abc")).toBe("")
  })

  it("permite un solo punto y hasta dos decimales", () => {
    expect(sanitizeMoneyInput("12.3.4")).toBe("12.34")
    expect(sanitizeMoneyInput("12.345")).toBe("12.34")
    expect(sanitizeMoneyInput("1.2.3.4")).toBe("1.23")
  })

  it("recorta los enteros al tope del patrón", () => {
    expect(sanitizeMoneyInput("123456789.99")).toBe("12345678.99")
  })

  it("un punto inicial se completa con cero", () => {
    expect(sanitizeMoneyInput(".5")).toBe("0.5")
    expect(sanitizeMoneyInput(".")).toBe("0.")
  })

  it("el valor vacío queda vacío", () => {
    expect(sanitizeMoneyInput("")).toBe("")
  })
})

describe("moneyInputError", () => {
  it("no reclama mientras el campo está vacío o a medio escribir", () => {
    expect(moneyInputError("")).toBeNull()
    expect(moneyInputError("1250.")).toBeNull()
  })

  it("acepta un importe completo", () => {
    expect(moneyInputError("1250.50")).toBeNull()
    expect(moneyInputError("0")).toBeNull()
  })

  it("reclama un importe que no cierra", () => {
    expect(moneyInputError("0.")).toBeNull()
    expect(moneyInputError("12.345")).toContain("1250.50")
    expect(moneyInputError("123456789")).toContain("1250.50")
  })
})
