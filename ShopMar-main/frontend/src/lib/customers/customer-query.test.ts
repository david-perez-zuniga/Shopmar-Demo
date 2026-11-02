import { describe, expect, it } from "vitest"
import { customersQuery } from "./customer-query"

describe("customersQuery", () => {
  it("pide siempre los saldos y recorta la búsqueda", () => {
    expect(customersQuery("  María  ")).toEqual({ q: "María", include_balances: true })
  })

  it("sin búsqueda no manda q, pero sí pide los saldos", () => {
    const query = customersQuery("   ")

    expect(query).toEqual({ include_balances: true })
    expect("q" in query).toBe(false)
  })

  it("no convierte los espacios internos del nombre en otra búsqueda", () => {
    expect(customersQuery("María  González")).toEqual({
      q: "María  González",
      include_balances: true,
    })
  })
})
