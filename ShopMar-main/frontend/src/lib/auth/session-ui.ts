/**
 * Quién es el usuario en la navegación y el botón «Cerrar sesión» (T7).
 *
 * El armazón se sirve sin sesión, así que el documento no puede traer el nombre
 * del servidor: lo pinta este módulo desde la copia del `me` (T6). La barra
 * lateral y el cajón comparten los mismos atributos —`data-session-block`,
 * `data-session-user`, `data-session-role`, `data-session-logout`—, así que el
 * usuario y su rol no pueden divergir entre las dos superficies.
 *
 * Sin copia (arranque en frío sin red) el bloque queda oculto: no se pinta
 * «Cerrar sesión» de una sesión que todavía no se confirmó.
 */

import { safeLocalStorage } from "../core/storage"
import type { IUser, UserRole } from "../core/types"
import { signOut } from "./logout"
import { readMe } from "./session"

/**
 * El aviso de que la sesión ya se decidió. Lo dispara el arranque de la SPA
 * después de montar la primera vista (con copia o con `200`), para que la
 * navegación se pinte aunque el guard haya resuelto después del `DOMContentLoaded`.
 */
export const SESSION_CHANGED = "shopmar:session-changed"

/** El nombre del rol tal como se lee en el panel. No es una autorización. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  seller: "Vendedor",
}

/** Pinta (o esconde) al usuario actual en todas las superficies de navegación. */
export function renderSessionUser(doc: Document, user: IUser | null): void {
  for (const block of doc.querySelectorAll("[data-session-block]")) {
    block.toggleAttribute("hidden", user === null)
  }
  for (const element of doc.querySelectorAll("[data-session-user]")) {
    element.textContent = user === null ? "" : user.username
  }
  for (const element of doc.querySelectorAll("[data-session-role]")) {
    element.textContent = user === null ? "" : ROLE_LABELS[user.role]
  }
}

export interface ISessionNavDeps {
  storage?: () => Storage | null
  signOut?: () => Promise<void>
}

/**
 * Cablea la navegación una vez por documento: pinta la copia guardada, escucha
 * la confirmación del guard y conecta cada botón de cerrar sesión.
 */
export function initSessionNav(
  doc: Document = document,
  deps: ISessionNavDeps = {},
): () => void {
  const win = doc.defaultView ?? window
  const storage = deps.storage ?? safeLocalStorage
  const leave = deps.signOut ?? (() => signOut())

  const render = (): void => renderSessionUser(doc, readMe(storage()))
  render()

  const onSessionChanged = (): void => render()
  win.addEventListener(SESSION_CHANGED, onSessionChanged)

  const buttons = Array.from(
    doc.querySelectorAll<HTMLElement>("[data-session-logout]"),
  )
  const onClick = (): void => {
    void leave()
  }
  for (const button of buttons) button.addEventListener("click", onClick)

  return function dispose(): void {
    win.removeEventListener(SESSION_CHANGED, onSessionChanged)
    for (const button of buttons) button.removeEventListener("click", onClick)
  }
}
