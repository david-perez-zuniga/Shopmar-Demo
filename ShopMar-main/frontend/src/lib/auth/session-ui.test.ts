import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { IUser } from "../core/types"
import { ME_STORAGE_KEY, serializeMe } from "./session"
import { ROLE_LABELS, SESSION_CHANGED, initSessionNav, renderSessionUser } from "./session-ui"

/**
 * Quién es el usuario y el botón de cerrar sesión en la navegación (T7).
 *
 * La copia del `me` es la que pinta la barra lateral y el cajón: el documento
 * no puede traer el nombre desde el servidor porque el armazón se sirve sin
 * sesión. Con la copia se muestra el usuario y su rol; sin copia (arranque
 * offline sin `me`) el bloque no se pinta.
 */

const USER: IUser = { id: "u1", username: "ana", email: "ana@tienda.com", role: "admin" }

function buildDoc(): Document {
  const doc = document.implementation.createHTMLDocument("nav")
  doc.body.innerHTML = `
    <div data-session-block hidden>
      <span data-session-user></span>
      <span data-session-role></span>
      <button type="button" data-session-logout>Cerrar sesión</button>
    </div>
    <div data-session-block hidden>
      <span data-session-user></span>
      <span data-session-role></span>
      <button type="button" data-session-logout>Cerrar sesión</button>
    </div>
  `
  return doc
}

function visibleBlocks(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll("[data-session-block]")).filter(
    (block) => !block.hasAttribute("hidden"),
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe("renderSessionUser (T7)", () => {
  it("con usuario pinta el nombre y el rol en cada superficie", () => {
    const doc = buildDoc()

    renderSessionUser(doc, USER)

    expect(visibleBlocks(doc)).toHaveLength(2)
    expect(
      Array.from(doc.querySelectorAll("[data-session-user]")).map((el) => el.textContent),
    ).toEqual(["ana", "ana"])
    expect(
      Array.from(doc.querySelectorAll("[data-session-role]")).map((el) => el.textContent),
    ).toEqual([ROLE_LABELS.admin, ROLE_LABELS.admin])
  })

  it("sin usuario esconde el bloque: no se pinta «Cerrar sesión» de una sesión que no se confirmó", () => {
    const doc = buildDoc()
    renderSessionUser(doc, USER)

    renderSessionUser(doc, null)

    expect(visibleBlocks(doc)).toHaveLength(0)
  })

  it("los dos roles se nombran en castellano", () => {
    expect(ROLE_LABELS.admin).toBe("Administrador")
    expect(ROLE_LABELS.seller).toBe("Vendedor")
  })
})

describe("initSessionNav (T7)", () => {
  it("pinta la copia guardada al arrancar", () => {
    window.localStorage.setItem(ME_STORAGE_KEY, serializeMe(USER))
    const doc = buildDoc()

    initSessionNav(doc, { storage: () => window.localStorage, signOut: () => Promise.resolve() })

    expect(visibleBlocks(doc)).toHaveLength(2)
  })

  it("se vuelve a pintar cuando el guard confirmó la sesión", () => {
    const doc = buildDoc()
    initSessionNav(doc, { storage: () => window.localStorage, signOut: () => Promise.resolve() })
    expect(visibleBlocks(doc)).toHaveLength(0)

    window.localStorage.setItem(ME_STORAGE_KEY, serializeMe(USER))
    window.dispatchEvent(new CustomEvent(SESSION_CHANGED))

    expect(visibleBlocks(doc)).toHaveLength(2)
  })

  it("cada botón de cerrar sesión de la navegación cierra la sesión una sola vez", async () => {
    const signOut = vi.fn(() => Promise.resolve())
    window.localStorage.setItem(ME_STORAGE_KEY, serializeMe(USER))
    const doc = buildDoc()
    initSessionNav(doc, { storage: () => window.localStorage, signOut })

    for (const button of Array.from(doc.querySelectorAll("[data-session-logout]"))) {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    }

    expect(signOut).toHaveBeenCalledTimes(2)
  })
})
