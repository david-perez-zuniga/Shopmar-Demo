import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { IUser } from "../core/types"
import { signOut } from "./logout"
import { readMe, writeMe } from "./session"

/**
 * El logout (T6): el pedido revoca la cookie, pero la salida no depende de que
 * la red conteste. Si falla el `POST`, la copia local se borra igual —la persona
 * pidió salir— y la persona termina en `/login`.
 */

const USER: IUser = { id: "u1", username: "ana", email: "ana@tienda.com", role: "admin" }

beforeEach(() => {
  window.localStorage.clear()
  writeMe(window.localStorage, USER)
})

afterEach(() => {
  window.localStorage.clear()
})

function deps(overrides: { request?: () => Promise<void> } = {}) {
  const order: string[] = []
  return {
    order,
    options: {
      storage: window.localStorage,
      request:
        overrides.request ??
        (() => {
          order.push("logout")
          return Promise.resolve()
        }),
      clearData: () => order.push("datos"),
      clearWorker: () => order.push("worker"),
      replace: (href: string) => order.push(`ir:${href}`),
    },
  }
}

describe("logout (T6)", () => {
  it("revoca la sesión, borra la copia y las dos cachés, y va a /login", async () => {
    const { order, options } = deps()

    await signOut(options)

    expect(readMe(window.localStorage)).toBeNull()
    expect(order).toEqual(["logout", "datos", "worker", "ir:/login"])
  })

  it("si el pedido falla por red, la copia local se borra igual", async () => {
    const { order, options } = deps({
      request: () => Promise.reject(new Error("sin wifi")),
    })

    await signOut(options)

    expect(readMe(window.localStorage)).toBeNull()
    expect(order).toEqual(["datos", "worker", "ir:/login"])
  })
})
