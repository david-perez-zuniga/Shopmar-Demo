import { describe, expect, it } from "vitest"
import { PAYMENT_BANK_PLACEHOLDER, PAYMENT_BANKS } from "./banks"

/**
 * El catálogo es la lista cerrada de bancos de Nicaragua que ofrece el formulario
 * (S4). La API no lo conoce —`payment_bank` sigue siendo texto de hasta 100 (S5)—,
 * así que acá se fija lo que la pantalla promete: estos siete, en este orden. El
 * formulario importa la misma constante, así que estas pruebas son la única
 * descripción literal de la lista.
 */
describe("PAYMENT_BANKS", () => {
  it("lista los siete bancos, en el orden acordado con la dueña", () => {
    expect([...PAYMENT_BANKS]).toEqual([
      "BAC Credomatic",
      "LAFISE",
      "BANPRO",
      "Ficohsa",
      "AVANZ",
      "ProCredit",
      "BANEX",
    ])
  })

  it("no repite ningún banco", () => {
    expect(new Set(PAYMENT_BANKS).size).toBe(PAYMENT_BANKS.length)
  })

  it("no deja ninguna entrada vacía", () => {
    for (const bank of PAYMENT_BANKS) expect(bank.trim()).not.toBe("")
  })

  it("el marcador no es un banco del catálogo", () => {
    expect(PAYMENT_BANK_PLACEHOLDER.trim()).not.toBe("")
    expect(PAYMENT_BANKS).not.toContain(PAYMENT_BANK_PLACEHOLDER)
  })
})
