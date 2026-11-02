import { describe, expect, it } from "vitest"
import {
  forgetViewState,
  readViewState,
  rememberViewState,
  restoreViewSearch,
  stateSearch,
  viewStateKey,
} from "./view-state"

/**
 * El recuerdo de la consulta de cada pantalla (S58).
 *
 * La regresión que fija: **volver a una lista no puede resetear el filtro**. Con
 * el rango en la URL, ir al detalle de una venta y volver a `/sales` pelado
 * mostraba «Hoy» otra vez. El módulo es puro sobre un `Storage` inyectado, así
 * que la regla se prueba sin navegador.
 */

/** Un `Storage` de memoria: la prueba no depende del `sessionStorage` del entorno. */
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key)
    },
    setItem: (key, value) => {
      items.set(key, value)
    },
  }
}

/** Un navegador con el almacenamiento bloqueado: leer o escribir tira. */
function blockedStorage(): Storage {
  const blocked = (): never => {
    throw new Error("SecurityError")
  }
  return {
    get length(): number {
      return blocked()
    },
    clear: blocked,
    getItem: blocked,
    key: blocked,
    removeItem: blocked,
    setItem: blocked,
  }
}

const RANGO = "?start_date=2026-03-01&end_date=2026-03-07"

describe("qué parte de la query se recuerda", () => {
  it("conserva los parámetros de consulta y descarta el resto", () => {
    const search = stateSearch(
      "?start_date=2026-03-01&end_date=2026-03-07&status=pending&page=2",
    )

    expect(new URLSearchParams(search).get("start_date")).toBe("2026-03-01")
    expect(new URLSearchParams(search).get("end_date")).toBe("2026-03-07")
    expect(new URLSearchParams(search).get("status")).toBe("pending")
    expect(new URLSearchParams(search).get("page")).toBe("2")
  })

  it("no recuerda el id de un detalle ni el pedido de impresión", () => {
    const search = stateSearch("?customer=abc&id=s-1&print=1")

    expect(search).toBe("")
  })

  it("una query sin estado de pantalla no recuerda nada", () => {
    expect(stateSearch("")).toBe("")
    expect(stateSearch("?")).toBe("")
  })
})

describe("el recuerdo por pantalla", () => {
  it("vuelve con la consulta que la persona estaba mirando", () => {
    const storage = memoryStorage()
    rememberViewState("/sales", RANGO, storage)

    expect(readViewState("/sales", storage)).toBe(RANGO)
    expect(restoreViewSearch("/sales", "", storage)).toBe(RANGO)
  })

  it("una query en la URL manda sobre el recuerdo", () => {
    const storage = memoryStorage()
    rememberViewState("/sales", RANGO, storage)

    expect(restoreViewSearch("/sales", "?page=3", storage)).toBe("?page=3")
  })

  it("cada pantalla recuerda lo suyo: ventas no contamina gastos", () => {
    const storage = memoryStorage()
    rememberViewState("/sales", RANGO, storage)

    expect(restoreViewSearch("/expenses", "", storage)).toBe("")
    expect(viewStateKey("/sales")).not.toBe(viewStateKey("/expenses"))
  })

  it("un detalle no recuerda nada: su query no es estado de una pantalla", () => {
    const storage = memoryStorage()
    rememberViewState("/sales/detail", "?id=s-1", storage)

    expect(readViewState("/sales/detail", storage)).toBe("")
    expect(restoreViewSearch("/sales/detail", "", storage)).toBe("")
  })

  it("«Limpiar» olvida: la próxima vuelta arranca sin filtros", () => {
    const storage = memoryStorage()
    rememberViewState("/sales", RANGO, storage)
    forgetViewState("/sales", storage)

    expect(restoreViewSearch("/sales", "", storage)).toBe("")
  })

  it("no recuerda una consulta vacía: sin filtros no hay nada que recuperar", () => {
    const storage = memoryStorage()
    rememberViewState("/sales", "", storage)

    expect(readViewState("/sales", storage)).toBe("")
  })

  it("un almacenamiento bloqueado degrada sin romper la pantalla", () => {
    const storage = blockedStorage()

    expect(restoreViewSearch("/sales", "", storage)).toBe("")
    expect(() => rememberViewState("/sales", RANGO, storage)).not.toThrow()
    expect(() => forgetViewState("/sales", storage)).not.toThrow()
  })

  it("sin almacenamiento la pantalla abre con la query de la URL", () => {
    expect(restoreViewSearch("/sales", RANGO, null)).toBe(RANGO)
    expect(restoreViewSearch("/sales", "", null)).toBe("")
  })
})
