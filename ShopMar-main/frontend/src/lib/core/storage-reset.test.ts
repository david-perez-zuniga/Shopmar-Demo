import { describe, expect, it } from "vitest"
import {
  STORAGE_GENERATION,
  STORAGE_GENERATION_KEY,
  resetLocalStateIfStale,
} from "./storage-reset"

/**
 * La purga local por generación (S1).
 *
 * Subir `STORAGE_GENERATION` invalida una vez la copia del `me` —lo único del
 * navegador que sostiene una sesión que el servidor ya no confirma— y deja
 * intacto lo que no depende de la sesión: el tema y un borrador de venta a medio
 * cargar. La generación se anota después, así la limpieza no se repite y el panel
 * vuelve a arrancar instantáneo desde la copia.
 *
 * El `sessionStorage` no se toca a propósito: sólo guarda el recuerdo de la
 * consulta de cada pantalla (S58), que muere con la pestaña y no tiene nada que
 * ver con la sesión.
 */

/** Un `Storage` en memoria con el mínimo que usa el módulo. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  } as Storage
}

const STALE = {
  "shopmar:me:v1": JSON.stringify({ version: 1, user: { id: "u1" } }),
  "shopmar:theme": "dark",
  "shopmar:sale-draft:live:v1": JSON.stringify({ version: 1 }),
}

describe("resetLocalStateIfStale", () => {
  it("una generación vieja purga la copia del me y anota la nueva", () => {
    const local = memoryStorage(STALE)

    expect(resetLocalStateIfStale(local, 2)).toBe(true)

    expect(local.getItem("shopmar:me:v1")).toBeNull()
    expect(local.getItem(STORAGE_GENERATION_KEY)).toBe("2")
  })

  it("con la generación al día no toca nada: la copia nueva del me sigue viva", () => {
    const local = memoryStorage({
      ...STALE,
      [STORAGE_GENERATION_KEY]: String(STORAGE_GENERATION),
    })

    expect(resetLocalStateIfStale(local, STORAGE_GENERATION)).toBe(false)
    expect(local.getItem("shopmar:me:v1")).not.toBeNull()
  })

  it("la limpieza no se repite: la segunda llamada ya no borra", () => {
    const local = memoryStorage(STALE)

    expect(resetLocalStateIfStale(local, 2)).toBe(true)
    local.setItem("shopmar:me:v1", JSON.stringify({ version: 1, user: { id: "u2" } }))

    expect(resetLocalStateIfStale(local, 2)).toBe(false)
    expect(local.getItem("shopmar:me:v1")).not.toBeNull()
  })

  it("conserva lo que no depende de la sesión: el tema y un borrador de venta", () => {
    const local = memoryStorage(STALE)

    resetLocalStateIfStale(local, 2)

    expect(local.getItem("shopmar:theme")).toBe("dark")
    expect(local.getItem("shopmar:sale-draft:live:v1")).not.toBeNull()
  })

  it("el prefijo no se lleva vecinos por delante", () => {
    const local = memoryStorage({ "shopmar:meh": "no es la copia del me" })

    resetLocalStateIfStale(local, 2)

    expect(local.getItem("shopmar:meh")).toBe("no es la copia del me")
  })

  it("sin almacenamiento no hay limpieza y no rompe", () => {
    expect(resetLocalStateIfStale(null, 2)).toBe(false)
  })

  it("un almacenamiento que lanza no rompe el arranque", () => {
    const broken = {
      get length(): number {
        throw new Error("bloqueado")
      },
      key: () => null,
      getItem: () => {
        throw new Error("bloqueado")
      },
      setItem: () => {
        throw new Error("bloqueado")
      },
      removeItem: () => {
        throw new Error("bloqueado")
      },
      clear: () => undefined,
    } as unknown as Storage

    expect(() => resetLocalStateIfStale(broken, 2)).not.toThrow()
    expect(resetLocalStateIfStale(broken, 2)).toBe(false)
  })
})
