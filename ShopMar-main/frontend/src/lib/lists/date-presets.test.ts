import { describe, expect, it } from "vitest"
import { DATE_PRESETS, LAST_DAYS, presetFor, presetRange } from "./date-presets"
import { lastDaysRange } from "../summary/summary"

/** 11/10/2026 al mediodía, hora local: la fecha de referencia de casi todos los casos. */
const HOY = new Date(2026, 9, 11, 12, 0)

const labels = (): string[] => DATE_PRESETS.map((preset) => preset.label)
const ids = (): string[] => DATE_PRESETS.map((preset) => preset.id)

describe("DATE_PRESETS", () => {
  it("ofrece las tres opciones en el orden de la dueña (S34)", () => {
    expect(ids()).toEqual(["today", "last7", "lastMonth", "custom"])
  })

  it("usa los rótulos exactos, con sus tildes (S34)", () => {
    expect(labels()).toEqual(["Hoy", "Últimos 7 días", "Último mes", "Personalizado"])
  })
})

describe("presetRange", () => {
  it("«Hoy» deja un solo día, el de hoy", () => {
    expect(presetRange("today", HOY)).toEqual({ start_date: "2026-10-11", end_date: "2026-10-11" })
  })

  it("«Último mes» cubre hoy y los veintinueve días anteriores (S53)", () => {
    // HOY es 2026-10-11: treinta días hacia atrás es el 12 de septiembre.
    expect(presetRange("lastMonth", HOY)).toEqual({
      start_date: "2026-09-12",
      end_date: "2026-10-11",
    })
  })

  it("«Último mes» cruza el fin de año sin correrse", () => {
    expect(presetRange("lastMonth", new Date(2026, 0, 15, 12, 0)).start_date).toBe("2025-12-17")
  })

  it("«Últimos 7 días» cubre hoy y los seis días anteriores", () => {
    expect(presetRange("last7", HOY)).toEqual({ start_date: "2026-10-05", end_date: "2026-10-11" })
  })

  it("la ventana cruza el cambio de mes", () => {
    expect(presetRange("last7", new Date(2026, 10, 2, 12, 0)).start_date).toBe("2026-10-27")
  })

  it("la ventana cruza el cambio de año", () => {
    expect(presetRange("last7", new Date(2026, 0, 3, 12, 0)).start_date).toBe("2025-12-28")
  })

  it("la ventana cuenta el 29 de febrero de un año bisiesto", () => {
    expect(presetRange("last7", new Date(2028, 1, 29, 12, 0))).toEqual({
      start_date: "2028-02-23",
      end_date: "2028-02-29",
    })
  })

  it("una hora tardía local no corre la fecha al día siguiente en UTC", () => {
    expect(presetRange("today", new Date(2026, 9, 11, 23, 30))).toEqual({
      start_date: "2026-10-11",
      end_date: "2026-10-11",
    })
  })

  it("«Personalizado» no calcula fechas: el rango vacío es «sin rango» (S35)", () => {
    expect(presetRange("custom", HOY)).toEqual({ start_date: "", end_date: "" })
  })

  it("mide la semana con la misma ventana del resumen, no con una cuenta propia", () => {
    expect(LAST_DAYS).toBe(7)
    for (const day of [HOY, new Date(2026, 0, 3, 12, 0), new Date(2028, 1, 29, 23, 0)]) {
      expect(presetRange("last7", day)).toEqual(lastDaysRange(7, day))
    }
  })
})

describe("presetFor", () => {
  it("sin fechas el rango por defecto es hoy (S36)", () => {
    expect(presetFor("", "", HOY)).toBe("today")
  })

  it("reconoce «Último mes»", () => {
    expect(presetFor("2026-09-12", "2026-10-11", HOY)).toBe("lastMonth")
  })

  it("reconoce «Hoy»", () => {
    expect(presetFor("2026-10-11", "2026-10-11", HOY)).toBe("today")
  })

  it("reconoce «Últimos 7 días»", () => {
    expect(presetFor("2026-10-05", "2026-10-11", HOY)).toBe("last7")
  })

  it("cualquier otro rango completo es «Personalizado»", () => {
    expect(presetFor("2026-10-01", "2026-10-11", HOY)).toBe("custom")
  })

  it("un rango abierto de un solo lado es «Personalizado»", () => {
    expect(presetFor("2026-10-05", "", HOY)).toBe("custom")
    expect(presetFor("", "2026-10-11", HOY)).toBe("custom")
  })

  it("el mismo día de ayer no es «Hoy»", () => {
    expect(presetFor("2026-10-10", "2026-10-10", HOY)).toBe("custom")
  })

  it("la ventana de siete días corrida un día no es «Últimos 7 días»", () => {
    expect(presetFor("2026-10-04", "2026-10-10", HOY)).toBe("custom")
    expect(presetFor("2026-10-06", "2026-10-12", HOY)).toBe("custom")
  })

  it("ida y vuelta: cada preset se reconoce desde el rango que escribe", () => {
    const days = [
      HOY,
      new Date(2026, 10, 2, 12, 0),
      new Date(2026, 0, 3, 12, 0),
      new Date(2028, 1, 29, 12, 0),
      new Date(2028, 11, 31, 23, 59),
    ]
    for (const day of days) {
      for (const preset of ["today", "last7"] as const) {
        const range = presetRange(preset, day)
        expect(presetFor(range.start_date, range.end_date, day)).toBe(preset)
      }
    }
  })
})
