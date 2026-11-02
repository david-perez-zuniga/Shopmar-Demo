import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../core/api"
import type { IUser } from "../core/types"
import { createSessionGate } from "./guard"
import { readMe, writeMe } from "./session"

/**
 * El guard del router (T6, D7): las **tres** respuestas no son dos.
 *
 * Un `200` monta, un `401` borra la copia y manda a `/login`, y un error de red
 * o un `5xx` **no deciden nada**: se conserva la copia y la pantalla muestra el
 * aviso de sin conexión con reintento. Expulsar por un corte de red es el
 * defecto que D-024 evita, así que el test lo fija como contrato.
 */

const USER: IUser = {
  id: "u-1",
  username: "ana",
  email: "ana@tienda.com",
  role: "seller",
}

const SALES = { path: "/sales", search: "" }

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

function gateWith(overrides: {
  fetchMe?: () => Promise<IUser>
  revalidateMe?: () => Promise<IUser>
}) {
  return createSessionGate({
    storage: () => window.localStorage,
    fetchMe: overrides.fetchMe ?? (() => Promise.resolve(USER)),
    revalidateMe: overrides.revalidateMe ?? (() => Promise.resolve(USER)),
  })
}

describe("guard sin copia del me (T6)", () => {
  it("un 200 guarda el me y monta la vista pedida", async () => {
    const gate = gateWith({ fetchMe: () => Promise.resolve(USER) })

    await expect(gate.check(SALES)).resolves.toEqual({ action: "mount" })
    expect(readMe(window.localStorage)).toEqual(USER)
  })

  it("un 401 borra cualquier copia y manda a /login con la ruta pedida", async () => {
    const gate = gateWith({
      fetchMe: () => Promise.reject(new ApiError("UNAUTHORIZED", 401, "Authentication required")),
    })

    await expect(gate.check({ path: "/customers", search: "?q=ana" })).resolves.toEqual({
      action: "redirect",
      href: "/login?next=%2Fcustomers%3Fq%3Dana",
    })
    expect(readMe(window.localStorage)).toBeNull()
  })

  it("un error de red no decide y nunca manda a /login", async () => {
    const gate = gateWith({
      fetchMe: () => Promise.reject(new ApiError("NETWORK_ERROR", 0)),
    })

    await expect(gate.check(SALES)).resolves.toEqual({ action: "undecided" })
    expect(readMe(window.localStorage)).toBeNull()
  })

  it("un 5xx tampoco decide: no dice nada sobre la validez de la cookie", async () => {
    const gate = gateWith({
      fetchMe: () => Promise.reject(new ApiError("INTERNAL_ERROR", 500)),
    })

    await expect(gate.check(SALES)).resolves.toEqual({ action: "undecided" })
  })

  it("un 403 no desloguea: la sesión es válida y lo que falta es un permiso", async () => {
    const gate = gateWith({
      fetchMe: () => Promise.reject(new ApiError("FORBIDDEN", 403)),
    })

    await expect(gate.check(SALES)).resolves.toEqual({ action: "undecided" })
    expect(readMe(window.localStorage)).toBeNull()
  })
})

describe("guard con copia del me (T6)", () => {
  it("monta sin esperar la red y revalida detrás", async () => {
    writeMe(window.localStorage, USER)
    const revalidateMe = vi.fn(() => Promise.resolve(USER))
    const fetchMe = vi.fn(() => Promise.resolve(USER))
    const gate = createSessionGate({
      storage: () => window.localStorage,
      fetchMe,
      revalidateMe,
    })

    await expect(gate.check(SALES)).resolves.toEqual({ action: "mount" })
    // La vista no esperó: el `me` bloqueante ni se llamó.
    expect(fetchMe).not.toHaveBeenCalled()
    expect(revalidateMe).toHaveBeenCalledTimes(1)
  })

  it("la copia sigue en su lugar mientras la revalidación está en vuelo", async () => {
    writeMe(window.localStorage, USER)
    let resolve!: (user: IUser) => void
    const gate = createSessionGate({
      storage: () => window.localStorage,
      fetchMe: () => Promise.resolve(USER),
      revalidateMe: () =>
        new Promise<IUser>((done) => {
          resolve = done
        }),
    })

    await expect(gate.check(SALES)).resolves.toEqual({ action: "mount" })
    expect(readMe(window.localStorage)).toEqual(USER)

    resolve({ ...USER, role: "admin" })
    await Promise.resolve()
    await Promise.resolve()
    expect(readMe(window.localStorage)).toMatchObject({ role: "admin" })
  })

  it("si la revalidación falla por red, la copia se conserva", async () => {
    writeMe(window.localStorage, USER)
    const gate = createSessionGate({
      storage: () => window.localStorage,
      fetchMe: () => Promise.resolve(USER),
      revalidateMe: () => Promise.reject(new ApiError("NETWORK_ERROR", 0)),
    })

    await expect(gate.check(SALES)).resolves.toEqual({ action: "mount" })
    await Promise.resolve()
    expect(readMe(window.localStorage)).toEqual(USER)
  })
})
