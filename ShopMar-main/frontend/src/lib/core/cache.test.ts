import { afterEach, describe, expect, it } from "vitest"
import {
  cacheKeyFor,
  clearCache,
  clearInflight,
  currentGeneration,
  inflightRequest,
  isCacheable,
  readEntry,
  shouldRevalidate,
  trackInflight,
  writeEntry,
} from "./cache"

afterEach(() => {
  clearCache()
})

describe("isCacheable", () => {
  it("sólo GET se cachea", () => {
    expect(isCacheable("GET")).toBe(true)
    expect(isCacheable("get")).toBe(true)
    expect(isCacheable("POST")).toBe(false)
    expect(isCacheable("PUT")).toBe(false)
    expect(isCacheable("PATCH")).toBe(false)
    expect(isCacheable("DELETE")).toBe(false)
  })
})

describe("cacheKeyFor", () => {
  it("normaliza el método a mayúsculas y separa método y URL", () => {
    expect(cacheKeyFor("get", "/sales")).toBe("GET /sales")
    expect(cacheKeyFor("GET", "/sales")).toBe("GET /sales")
  })

  it("dos métodos o dos URLs distintas no comparten clave", () => {
    expect(cacheKeyFor("GET", "/sales")).not.toBe(cacheKeyFor("POST", "/sales"))
    expect(cacheKeyFor("GET", "/sales")).not.toBe(cacheKeyFor("GET", "/expenses"))
  })
})

describe("shouldRevalidate", () => {
  const threshold = 30_000

  it("con edad 0 todavía no revalida", () => {
    expect(shouldRevalidate(0, threshold)).toBe(false)
  })

  it("justo por debajo del umbral no revalida", () => {
    expect(shouldRevalidate(threshold - 1, threshold)).toBe(false)
  })

  it("en el umbral revalida: la frontera es inclusiva", () => {
    expect(shouldRevalidate(threshold, threshold)).toBe(true)
  })

  it("por encima del umbral revalida", () => {
    expect(shouldRevalidate(threshold + 1, threshold)).toBe(true)
  })
})

describe("el almacén", () => {
  it("guarda y lee una entrada por su clave", () => {
    writeEntry("GET /sales", {
      data: { sales: [] },
      at: "2026-10-10T14:30:00.000Z",
      storedAt: 1000,
    })

    expect(readEntry("GET /sales")).toEqual({
      data: { sales: [] },
      at: "2026-10-10T14:30:00.000Z",
      storedAt: 1000,
    })
  })

  it("no devuelve nada para una clave sin entrada", () => {
    expect(readEntry("GET /nada")).toBeUndefined()
  })

  it("rastrea y libera el pedido en vuelo por clave", () => {
    const pending = Promise.resolve("dato")
    trackInflight("GET /sales", pending)

    expect(inflightRequest("GET /sales")).toBe(pending)

    clearInflight("GET /sales")
    expect(inflightRequest("GET /sales")).toBeUndefined()
  })

  it("clearCache vacía las entradas y los pedidos en vuelo", () => {
    writeEntry("GET /sales", { data: 1, at: null, storedAt: 1 })
    trackInflight("GET /sales", Promise.resolve(1))

    clearCache()

    expect(readEntry("GET /sales")).toBeUndefined()
    expect(inflightRequest("GET /sales")).toBeUndefined()
  })

  it("clearCache avanza la generación", () => {
    const before = currentGeneration()

    clearCache()

    expect(currentGeneration()).toBe(before + 1)
  })
})
