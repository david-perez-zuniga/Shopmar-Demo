import { describe, expect, it } from "vitest"
import {
  VIEW_TITLES,
  VIEW_WIDE,
  VIEWS,
  hrefFor,
  normalizePath,
  resolveLocation,
  viewForPath,
} from "./router"

describe("rutas de la SPA", () => {
  it("una barra final o un index.html no cambian la ruta", () => {
    expect(normalizePath("/sales")).toBe("/sales")
    expect(normalizePath("/sales/")).toBe("/sales")
    expect(normalizePath("/sales/index.html")).toBe("/sales")
    expect(normalizePath("/")).toBe("/")
  })

  it("cada ruta del panel resuelve a su vista", () => {
    expect(viewForPath("/")).toBe("summary")
    expect(viewForPath("/sales")).toBe("sales")
    expect(viewForPath("/sales/new")).toBe("sale-new")
    expect(viewForPath("/sales/detail")).toBe("sale-detail")
    expect(viewForPath("/customers")).toBe("customers")
    expect(viewForPath("/packages")).toBe("packages")
    expect(viewForPath("/expenses")).toBe("expenses")
    expect(viewForPath("/expenses/new")).toBe("expense-new")
    expect(viewForPath("/new")).toBe("new")
  })

  it("/new es una vista más y no una sección: el FAB no pide el documento", () => {
    // T7: el selector de registro entra al router. Sin esto su enlace seguía
    // siendo una navegación de documento y el toque del FAB esperaba red.
    expect(VIEWS).toContain("new")
    expect(resolveLocation("/new", "")).toEqual({ view: "new", path: "/new", search: "" })
    expect(hrefFor("new")).toBe("/new")
    // `activeSectionFor("/new")` devuelve `null` (no es una sección), así que el
    // router limpia la marca de las pestañas y ninguna queda activa.
    expect(VIEW_WIDE.new).toBe(false)
  })

  it("la ruta con barra final es la misma vista que sin barra", () => {
    expect(viewForPath("/sales/")).toBe("sales")
    expect(viewForPath("/expenses/new/")).toBe("expense-new")
  })

  it("una ruta que no es del panel no resuelve: el enlace no se intercepta", () => {
    expect(viewForPath("/offline")).toBeNull()
    expect(viewForPath("/cualquier-cosa")).toBeNull()
  })

  it("resuelve la vista con la query cruda, que es lo que leen los filtros", () => {
    expect(resolveLocation("/sales", "?start_date=2026-10-01")).toEqual({
      view: "sales",
      path: "/sales",
      search: "?start_date=2026-10-01",
    })
    expect(resolveLocation("/sales", "")?.search).toBe("")
    expect(resolveLocation("/no-existe", "")).toBeNull()
  })

  it("hrefFor reconstruye la URL de la vista con su query", () => {
    expect(hrefFor("sales")).toBe("/sales")
    expect(hrefFor("sales", "?a=1")).toBe("/sales?a=1")
    expect(hrefFor("sales", "a=1")).toBe("/sales?a=1")
    expect(hrefFor("sale-detail", "?id=abc")).toBe("/sales/detail?id=abc")
  })

  it("todas las vistas tienen título y ancho declarados", () => {
    for (const view of VIEWS) {
      expect(VIEW_TITLES[view]).toContain("ShopMar")
      expect(typeof VIEW_WIDE[view]).toBe("boolean")
    }
  })
})
