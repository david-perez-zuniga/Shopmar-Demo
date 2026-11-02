import { describe, expect, it } from "vitest"
import {
  clampPage,
  footerText,
  pageHref,
  pageRange,
  pageRows,
  pageWindow,
  totalPages,
} from "./pagination"
import { operationsLabel } from "../sales/sales-kpi"
import { expensesLabel } from "../expenses/expenses-kpi"

const FILAS = Array.from({ length: 47 }, (_, index) => index + 1)

describe("totalPages", () => {
  it("divide el total entre las filas por página", () => {
    expect(totalPages(47, 20)).toBe(3)
    expect(totalPages(40, 20)).toBe(2)
    expect(totalPages(41, 20)).toBe(3)
    expect(totalPages(16, 5)).toBe(4)
  })

  it("con cero ventas hay una página vacía, no cero páginas", () => {
    expect(totalPages(0, 10)).toBe(1)
  })

  it("un tamaño de página inválido no divide entre cero", () => {
    expect(totalPages(10, 0)).toBe(1)
    expect(totalPages(10, -5)).toBe(1)
  })
})

describe("clampPage", () => {
  it("deja la página dentro de lo que existe", () => {
    expect(clampPage(99, 47, 20)).toBe(3)
    expect(clampPage(0, 47, 20)).toBe(1)
    expect(clampPage(-4, 47, 20)).toBe(1)
  })

  it("con cero ventas se queda en la primera", () => {
    expect(clampPage(5, 0, 10)).toBe(1)
  })
})

describe("pageRows", () => {
  it("devuelve SOLO las filas de la página", () => {
    expect(pageRows(FILAS, 1, 20)).toHaveLength(20)
    expect(pageRows(FILAS, 1, 20)[0]).toBe(1)
    expect(pageRows(FILAS, 2, 20)[0]).toBe(21)
    expect(pageRows(FILAS, 3, 20)).toEqual([41, 42, 43, 44, 45, 46, 47])
  })

  it("la última página puede quedar corta y no inventa filas", () => {
    const rows = pageRows(FILAS, 3, 20)
    expect(rows).toHaveLength(7)
    expect(rows.every((row) => typeof row === "number")).toBe(true)
  })

  it("ninguna venta queda sin ver al recorrer todas las páginas", () => {
    const pages = totalPages(FILAS.length, 20)
    const seen = Array.from({ length: pages }, (_, index) => pageRows(FILAS, index + 1, 20)).flat()
    expect(seen).toEqual(FILAS)
    expect(new Set(seen).size).toBe(FILAS.length)
  })

  it("fuera de rango devuelve vacío, no un arreglo con huecos", () => {
    expect(pageRows(FILAS, 99, 20)).toEqual([])
    expect(pageRows(FILAS, 0, 20)).toEqual([])
    expect(pageRows(FILAS, 1, 0)).toEqual([])
  })
})

describe("pageRange", () => {
  it("el pie dice el rango real de cada página", () => {
    expect(pageRange(1, 47, 20)).toEqual({ from: 1, to: 20 })
    expect(pageRange(2, 47, 20)).toEqual({ from: 21, to: 40 })
    expect(pageRange(3, 47, 20)).toEqual({ from: 41, to: 47 })
  })

  it("una página clampada no inventa un final más allá del total", () => {
    expect(pageRange(99, 47, 20)).toEqual({ from: 41, to: 47 })
  })

  it("sin ventas el rango es cero", () => {
    expect(pageRange(1, 0, 10)).toEqual({ from: 0, to: 0 })
  })
})

describe("pageWindow", () => {
  it("con pocas páginas las muestra todas, sin huecos", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
    expect(pageWindow(2, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("con muchas páginas muestra primera, última y una ventana de la actual", () => {
    expect(pageWindow(1, 47)).toEqual([1, 2, "gap", 47])
    expect(pageWindow(24, 47)).toEqual([1, "gap", 23, 24, 25, "gap", 47])
    expect(pageWindow(47, 47)).toEqual([1, "gap", 46, 47])
  })

  it("nunca dibuja una página que no existe ni la 0", () => {
    for (const current of [1, 2, 24, 46, 47]) {
      for (const slot of pageWindow(current, 47)) {
        if (slot !== "gap") {
          expect(slot).toBeGreaterThanOrEqual(1)
          expect(slot).toBeLessThanOrEqual(47)
        }
      }
    }
  })

  it("la ventana no crece sin control con muchas páginas", () => {
    expect(pageWindow(24, 1000).length).toBeLessThanOrEqual(7)
  })

  it("sin páginas no devuelve nada", () => {
    expect(pageWindow(1, 0)).toEqual([])
  })
})

describe("pageHref", () => {
  it("cambia la página conservando los filtros activos", () => {
    expect(pageHref("/packages", "?start_date=2026-09-01&per_page=10", 3)).toBe(
      "/packages?start_date=2026-09-01&per_page=10&page=3",
    )
  })

  it("parte de una URL sin filtros", () => {
    expect(pageHref("/packages", "", 2)).toBe("/packages?page=2")
  })

  it("reemplaza la página anterior en vez de duplicarla", () => {
    expect(pageHref("/packages", "?page=2&per_page=5", 4)).toBe("/packages?page=4&per_page=5")
  })
})

describe("footerText", () => {
  it("sin resultados el pie muestra el guion, no un rango", () => {
    expect(footerText({ page: 1, total: 0, perPage: 20 }, operationsLabel)).toBe("—")
  })

  it("una sola página no escribe el rango: solo la etiqueta", () => {
    expect(footerText({ page: 1, total: 7, perPage: 10 }, operationsLabel)).toBe(
      "7 operaciones comerciales",
    )
  })

  it("un total que llena exactamente una página tampoco escribe el rango", () => {
    expect(footerText({ page: 1, total: 20, perPage: 20 }, operationsLabel)).toBe(
      "20 operaciones comerciales",
    )
  })

  it("una sola operación usa el singular de la etiqueta", () => {
    expect(footerText({ page: 1, total: 1, perPage: 20 }, operationsLabel)).toBe(
      "1 operación comercial",
    )
  })

  it("una página intermedia muestra el rango visible", () => {
    expect(footerText({ page: 2, total: 47, perPage: 20 }, operationsLabel)).toBe(
      "Mostrando 21–40 de 47 operaciones comerciales",
    )
  })

  it("la última página muestra el rango corto", () => {
    expect(footerText({ page: 3, total: 47, perPage: 20 }, operationsLabel)).toBe(
      "Mostrando 41–47 de 47 operaciones comerciales",
    )
  })

  it("acepta el estado completo que entrega el paginador", () => {
    const state = { page: 2, pages: 3, total: 47, perPage: 20 }

    expect(footerText(state, operationsLabel)).toBe("Mostrando 21–40 de 47 operaciones comerciales")
  })

  it("la etiqueta compartida es la fórmula que /packages tenía inline", () => {
    const inline = (total: number): string =>
      total === 1 ? "1 operación comercial" : `${total} operaciones comerciales`

    for (const total of [0, 1, 2, 7, 20, 47, 100]) {
      expect(operationsLabel(total)).toBe(inline(total))
    }
  })

  it("gastos usa su propia etiqueta", () => {
    expect(footerText({ page: 1, total: 3, perPage: 10 }, expensesLabel)).toBe(
      "3 gastos registrados",
    )
    expect(footerText({ page: 2, total: 12, perPage: 10 }, expensesLabel)).toBe(
      "Mostrando 11–12 de 12 gastos registrados",
    )
  })

  it("la etiqueta se recalcula por página, no se congela en la primera", () => {
    expect(footerText({ page: 1, total: 2, perPage: 1 }, operationsLabel)).toBe(
      "Mostrando 1–1 de 2 operaciones comerciales",
    )
    expect(footerText({ page: 2, total: 2, perPage: 1 }, operationsLabel)).toBe(
      "Mostrando 2–2 de 2 operaciones comerciales",
    )
  })
})

