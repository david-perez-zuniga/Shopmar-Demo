/**
 * Cerrar sesión (T6): el pedido revoca la cookie, pero la salida **no depende
 * de que la red conteste**.
 *
 * Orden: `POST /auth/logout` (revoca la sesión de esta cookie), borrar la copia
 * del `me` y las dos cachés (datos en memoria y la del service worker, que
 * guarda respuestas HTTP completas), y navegar a `/login`.
 *
 * Si el pedido falla por red, la copia local se borra igual: la persona pidió
 * salir y dejarla adentro por un corte de wifi es lo contrario de lo que pidió.
 * Queda una fila de `session` sin revocar —anotado como costo en
 * `modules/frontend/09-auth.md`—, no una sesión local viva.
 */

import { clearServiceWorkerCache } from "../core/api"
import { clearCache } from "../core/cache"
import { safeLocalStorage } from "../core/storage"
import { logoutUser } from "./auth-api"
import { LOGIN_PATH } from "./login"
import { clearMe } from "./session"

export interface ISignOutDeps {
  storage?: Storage | null
  request?: () => Promise<void>
  clearData?: () => void
  clearWorker?: () => void
  replace?: (href: string) => void
}

function replaceLocation(href: string): void {
  if (typeof window === "undefined") return
  window.location.replace(href)
}

export async function signOut(deps: ISignOutDeps = {}): Promise<void> {
  try {
    await (deps.request ?? logoutUser)()
  } catch {
    // La persona pidió salir: el corte de red no la deja adentro.
  }

  clearMe(deps.storage === undefined ? safeLocalStorage() : deps.storage)
  ;(deps.clearData ?? clearCache)()
  ;(deps.clearWorker ?? clearServiceWorkerCache)()
  ;(deps.replace ?? replaceLocation)(LOGIN_PATH)
}
