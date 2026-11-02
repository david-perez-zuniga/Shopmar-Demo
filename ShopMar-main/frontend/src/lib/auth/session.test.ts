import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearCache, readEntry, writeEntry } from "../core/cache"
import type { IUser } from "../core/types"
import {
  ME_STORAGE_KEY,
  ME_VERSION,
  clearMe,
  decideSessionGate,
  expireSession,
  parseMe,
  readMe,
  serializeMe,
  writeMe,
} from "./session"

/**
 * La copia del `me` y las decisiones de sesión (T6).
 *
 * Lo que se fija acá: la copia vive en `localStorage` bajo una clave versionada,
 * una versión de formato desconocida se ignora entera en vez de interpretarse a
 * medias, el guard decide distinto para los tres resultados (copia, `401`, red)
 * y la regla del `401` —borrar la identidad y volver a `/login`— es idempotente.
 */

const USER: IUser = {
  id: "u-20250314-001",
  username: "ana",
  email: "ana@tienda.com",
  role: "admin",
}

function meJson(overrides: Record<string, unknown>): string {
  return JSON.stringify({ ...JSON.parse(serializeMe(USER)), ...overrides })
}

/** Un `Storage` que falla en cada acceso, como el de un modo privado. */
function brokenStorage(): Storage {
  const fail = (): never => {
    throw new Error("localStorage no disponible")
  }
  return {
    getItem: fail,
    setItem: fail,
    removeItem: fail,
    clear: fail,
    key: fail,
    get length(): number {
      return fail()
    },
  } as unknown as Storage
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  clearCache()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe("la copia del me (T6)", () => {
  it("vive en la clave versionada del contrato", () => {
    expect(ME_STORAGE_KEY).toBe("shopmar:me:v1")
    writeMe(window.localStorage, USER)
    expect(window.localStorage.getItem("shopmar:me:v1")).not.toBeNull()
  })

  it("guarda la versión de formato que después se exige", () => {
    expect(JSON.parse(serializeMe(USER)).version).toBe(ME_VERSION)
  })

  it("el ida y vuelta conserva los cuatro campos del usuario", () => {
    writeMe(window.localStorage, USER)
    expect(readMe(window.localStorage)).toEqual(USER)
  })

  it("guarda solo id, username, email y role: lo de más no llega al almacenamiento", () => {
    writeMe(window.localStorage, { ...USER, password: "no-va" } as unknown as IUser)
    expect(JSON.parse(window.localStorage.getItem(ME_STORAGE_KEY) ?? "{}").user).toEqual(USER)
  })

  it("una versión de formato distinta se ignora en vez de interpretarse", () => {
    expect(parseMe(meJson({ version: ME_VERSION + 1 }))).toBeNull()
    expect(parseMe(meJson({ version: 0 }))).toBeNull()
    expect(parseMe(meJson({ version: "1" }))).toBeNull()
  })

  it("ignora basura: nada guardado, JSON inválido, otro tipo de valor", () => {
    for (const raw of [null, "", "   ", "{", "[]", "42", '"ana"']) {
      expect(parseMe(raw)).toBeNull()
    }
  })

  it("ignora un usuario al que le falta un campo o trae un rol que no existe", () => {
    expect(parseMe(meJson({ user: { id: "u1", username: "ana", email: "a@b.c" } }))).toBeNull()
    expect(parseMe(meJson({ user: { id: "u1", username: "ana", email: "a@b.c", role: "dueno" } }))).toBeNull()
    expect(parseMe(meJson({ user: null }))).toBeNull()
  })

  it("borrar la copia la deja sin entrada, y volver a leerla da null", () => {
    writeMe(window.localStorage, USER)
    expect(clearMe(window.localStorage)).toBe(true)
    expect(readMe(window.localStorage)).toBeNull()
  })

  it("con el almacenamiento bloqueado no rompe: ni guarda, ni lee, ni borra", () => {
    const storage = brokenStorage()
    expect(writeMe(storage, USER)).toBe(false)
    expect(readMe(storage)).toBeNull()
    expect(clearMe(storage)).toBe(false)
    expect(readMe(null)).toBeNull()
    expect(writeMe(null, USER)).toBe(false)
    expect(clearMe(null)).toBe(false)
  })

  it("una escritura de datos no borra la identidad, pero clearCache() sí limpia los datos", () => {
    writeMe(window.localStorage, USER)
    writeEntry("GET http://api/sales", { data: { sales: [] }, at: null, storedAt: Date.now() })

    // Lo que hace una escritura exitosa sobre la caché de datos.
    clearCache()

    expect(readEntry("GET http://api/sales")).toBeUndefined()
    expect(readMe(window.localStorage)).toEqual(USER)
  })
})

describe("la decisión del guard (T6)", () => {
  it("con copia del me se monta sin esperar la red", () => {
    expect(decideSessionGate("cached")).toBe("mount")
  })

  it("un 200 del me se monta", () => {
    expect(decideSessionGate("authenticated")).toBe("mount")
  })

  it("un 401 manda a /login: el servidor dijo que la sesión no vale", () => {
    expect(decideSessionGate("unauthorized")).toBe("redirect")
  })

  it("un error de red o un 5xx no decide nada: nunca manda a /login", () => {
    expect(decideSessionGate("undecided")).toBe("undecided")
  })
})

describe("la regla del 401 (T6)", () => {
  const noop = () => undefined

  it("borra la copia, limpia la caché de datos y vuelve a /login con la ruta actual", () => {
    writeMe(window.localStorage, USER)
    writeEntry("GET http://api/sales", { data: [], at: null, storedAt: 1 })
    const replace = vi.fn()
    const clearData = vi.fn()

    expireSession({
      storage: window.localStorage,
      currentPath: "/sales?page=2",
      replace,
      clearData,
    })

    expect(readMe(window.localStorage)).toBeNull()
    expect(clearData).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fsales%3Fpage%3D2")
  })

  it("es idempotente: ya en /login no navega, pero igual limpia copia y datos", () => {
    writeMe(window.localStorage, USER)
    const replace = vi.fn()
    const clearData = vi.fn()

    expireSession({ storage: window.localStorage, currentPath: "/login", replace, clearData })

    expect(readMe(window.localStorage)).toBeNull()
    expect(clearData).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it("desde la raíz vuelve a /login, no a un origen externo", () => {
    const replace = vi.fn()

    expireSession({ storage: window.localStorage, currentPath: "/", replace, clearData: noop })

    expect(replace).toHaveBeenCalledWith("/login?next=%2F")
  })
})
