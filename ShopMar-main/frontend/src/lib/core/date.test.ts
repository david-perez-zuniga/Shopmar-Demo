import { describe, expect, it } from "vitest"
import { todayLocal, utcOffsetMinutes } from "./date"

describe("todayLocal", () => {
  it("devuelve el día local con mes y día de dos dígitos", () => {
    expect(todayLocal(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05")
    expect(todayLocal(new Date(2026, 11, 31, 12, 0))).toBe("2026-12-31")
  })

  it("devuelve el día local, no el de UTC, a última hora de la noche", () => {
    const local = new Date(2026, 0, 5, 23, 30)
    expect(todayLocal(local)).toBe("2026-01-05")
  })

  it("cambia de día a medianoche en hora local", () => {
    expect(todayLocal(new Date(2026, 0, 5, 0, 0))).toBe("2026-01-05")
    expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
    expect(todayLocal(new Date(2026, 0, 6, 0, 0))).toBe("2026-01-06")
  })

  it("rellena con cero el mes de enero y el día de un dígito", () => {
    expect(todayLocal(new Date(2026, 0, 1, 12, 0))).toBe("2026-01-01")
    expect(todayLocal(new Date(2026, 8, 9, 12, 0))).toBe("2026-09-09")
  })

  it("devuelve hoy del reloj del sistema cuando no se le pasa fecha", () => {
    expect(todayLocal()).toBe(todayLocal(new Date()))
  })
})
describe("utcOffsetMinutes", () => {
  it("devuelve los minutos al este de UTC, con el signo invertido al de getTimezoneOffset", () => {
    // Nicaragua (UTC-6): getTimezoneOffset() = 360, el desplazamiento es -360.
    expect(utcOffsetMinutes(360)).toBe(-360)
    // Madrid en verano (UTC+2): getTimezoneOffset() = -120.
    expect(utcOffsetMinutes(-120)).toBe(120)
    expect(utcOffsetMinutes(0)).toBe(0)
  })
})
