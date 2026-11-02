/**
 * El guard del router (T6, D7): decide si se monta la primera vista, **antes**
 * de montarla.
 *
 * Tres resultados, no dos:
 * - con copia del `me` → montar ya y revalidar detrás (S3: el panel abre sin
 *   esperar la red);
 * - sin copia y `GET /auth/me` → `200` guarda y monta; `401` borra la copia y
 *   vuelve a `/login?next=<ruta>`;
 * - error de red o `5xx` → **no decidir**: se conserva lo que haya y la
 *   pantalla muestra el aviso de sin conexión con reintento. Nunca `/login` por
 *   red, porque un corte de wifi no invalida una sesión.
 *
 * El almacenamiento y las dos llamadas al `me` se inyectan para probar las tres
 * ramas sin red. La composición real está en `lib/app/start.ts`.
 */

import { ApiError } from "../core/api"
import { safeLocalStorage } from "../core/storage"
import type { IUser } from "../core/types"
import { fetchMe } from "./auth-api"
import { loginHref } from "./login"
import {
  clearMe,
  decideSessionGate,
  readMe,
  writeMe,
  type SessionGateAction,
  type SessionGateDecision,
} from "./session"

export type { SessionGateDecision } from "./session"

/** Lo que el guard necesita de la URL: la ruta a la que volver tras el login. */
export interface ISessionLocation {
  path: string
  search: string
}

export interface ISessionGate {
  check(location: ISessionLocation): Promise<SessionGateDecision>
}

export interface ISessionGateDeps {
  storage?: () => Storage | null
  /** El `me` que decide cuando no hay copia. */
  fetchMe?: () => Promise<IUser>
  /** La revalidación de fondo cuando sí hay copia: nunca bloquea el montaje. */
  revalidateMe?: () => Promise<IUser>
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

function verdict(action: SessionGateAction, location: ISessionLocation): SessionGateDecision {
  if (action !== "redirect") return { action }
  return { action, href: loginHref(`${location.path}${location.search}`) }
}

export function createSessionGate(deps: ISessionGateDeps = {}): ISessionGate {
  const storage = deps.storage ?? safeLocalStorage
  const fetchMeNow = deps.fetchMe ?? (() => fetchMe())
  // La revalidación usa la regla común del `401`: si el servidor rechaza la
  // cookie, `apiFetch` borra la copia y navega. Un error de red no hace nada.
  const revalidateMeNow = deps.revalidateMe ?? (() => fetchMe({ redirectOnUnauthorized: true }))

  return {
    async check(location) {
      const cached = readMe(storage())

      if (cached !== null) {
        void revalidateMeNow()
          .then((user) => {
            // La copia se refresca con lo que el servidor diga ahora: el rol
            // puede haber cambiado mientras la pestaña estaba abierta.
            writeMe(storage(), user)
          })
          .catch(() => undefined)
        return verdict(decideSessionGate("cached"), location)
      }

      try {
        const user = await fetchMeNow()
        writeMe(storage(), user)
        return verdict(decideSessionGate("authenticated"), location)
      } catch (error) {
        if (isUnauthorized(error)) {
          // El servidor dijo que no hay sesión: la copia que hubiera deja de
          // valer. Navegar lo hace el arranque, que es quien tiene la ventana.
          clearMe(storage())
          return verdict(decideSessionGate("unauthorized"), location)
        }
        // Red o 5xx: no se decide nada sobre la sesión ni sobre la copia.
        return verdict(decideSessionGate("undecided"), location)
      }
    },
  }
}
