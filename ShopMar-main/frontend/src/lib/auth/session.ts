/**
 * La copia local del `me` y las decisiones de sesión (T6, D7).
 *
 * La sesión de verdad es la cookie `HttpOnly` `shpr_session`, que este módulo
 * no puede leer. Lo que se guarda acá es **una copia de la última respuesta de
 * `GET /auth/me`**: sirve para pintar el panel sin esperar la red y para
 * sostener un arranque en frío sin conexión, y nada más. No decide si la sesión
 * es válida: eso lo decide el servidor, y el primer `401` la desmiente.
 *
 * Frontera de pureza: el almacenamiento y la navegación se inyectan (o se leen
 * del navegador), así la regla del `401` se prueba sin navegar de verdad.
 */

import { normalizePath } from "../app/router"
import { clearCache } from "../core/cache"
import { safeLocalStorage } from "../core/storage"
import type { IUser, UserRole } from "../core/types"
import { LOGIN_PATH, loginHref } from "./login"

/**
 * La clave versionada de `localStorage`, con la misma forma que el borrador de
 * venta: la versión viaja en la clave **y** en el contenido, y una copia de otro
 * formato se ignora en vez de interpretarse a medias.
 */
export const ME_STORAGE_KEY = "shopmar:me:v1"

/** La versión del formato de la copia. */
export const ME_VERSION = 1

/**
 * Lo que se guarda, armado desde cero: solo los cuatro campos del contrato. Un
 * campo de más en memoria —o algo que el servidor agregue mañana— no llega al
 * almacenamiento.
 */
export function serializeMe(user: IUser): string {
  return JSON.stringify({
    version: ME_VERSION,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function isRole(value: unknown): value is UserRole {
  return value === "admin" || value === "seller"
}

/**
 * Interpreta y valida la copia guardada. Devuelve `null` —y el panel pregunta
 * por la sesión como si no hubiera copia— si está ausente, es de otra versión,
 * no es JSON válido o le falta un campo. Una copia a medias no se usa a medias.
 */
export function parseMe(raw: string | null): IUser | null {
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const record = asRecord(parsed)
  if (record === null) return null
  // La versión va primero: otro formato no se interpreta con estas reglas.
  if (record.version !== ME_VERSION) return null

  const user = asRecord(record.user)
  if (user === null) return null
  const { id, username, email, role } = user
  if (typeof id !== "string" || typeof username !== "string" || typeof email !== "string") {
    return null
  }
  if (!isRole(role)) return null
  return { id, username, email, role }
}

/** La copia guardada, o `null` si no hay o no sirve. */
export function readMe(storage: Storage | null): IUser | null {
  if (storage === null) return null
  try {
    return parseMe(storage.getItem(ME_STORAGE_KEY))
  } catch {
    return null
  }
}

/** Guarda la copia y dice si quedó guardada. Un fallo no rompe la pantalla. */
export function writeMe(storage: Storage | null, user: IUser): boolean {
  if (storage === null) return false
  try {
    storage.setItem(ME_STORAGE_KEY, serializeMe(user))
    return true
  } catch {
    return false
  }
}

/** Borra la copia. Lo llaman un `401` y el logout, nada más. */
export function clearMe(storage: Storage | null): boolean {
  if (storage === null) return false
  try {
    storage.removeItem(ME_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

/**
 * Lo que el guard sabe después de preguntar. Son **cuatro** resultados aunque
 * la pantalla muestre tres: `cached` y `authenticated` montan, `unauthorized`
 * manda a `/login`, y `undecided` (red o `5xx`) no decide nada.
 */
export type SessionCheck = "cached" | "authenticated" | "unauthorized" | "undecided"

export type SessionGateAction = "mount" | "redirect" | "undecided"

/** Lo que el guard le devuelve al arranque: montar, navegar o no decidir. */
export type SessionGateDecision =
  | { action: "mount" }
  | { action: "redirect"; href: string }
  | { action: "undecided" }

/**
 * La tabla de decisión del guard, en un solo lugar y sin efectos. La comparte
 * `createSessionGate` (que sí habla con la API) y las pruebas.
 */
export function decideSessionGate(check: SessionCheck): SessionGateAction {
  switch (check) {
    case "cached":
    case "authenticated":
      return "mount"
    case "unauthorized":
      return "redirect"
    case "undecided":
      return "undecided"
  }
}

export interface IExpireSessionOptions {
  storage?: Storage | null
  /** La ruta actual (`pathname` + `search`), para armar el `next`. */
  currentPath?: string
  /** El `location.replace` del navegador. Se inyecta en las pruebas. */
  replace?: (href: string) => void
  /** La caché de datos a limpiar. Se inyecta en las pruebas. */
  clearData?: () => void
}

function currentPathFromWindow(): string {
  if (typeof window === "undefined") return "/"
  return `${window.location.pathname}${window.location.search}`
}

function replaceLocation(href: string): void {
  if (typeof window === "undefined") return
  window.location.replace(href)
}

/**
 * Un `401`: el servidor dijo que la sesión no vale. Borra la copia del `me`,
 * limpia la caché de datos y vuelve a `/login?next=<ruta actual>` con
 * `location.replace`, para que el botón atrás no regrese a una pantalla que ya
 * no puede cargar. Es idempotente: ya en `/login` limpia y no navega.
 *
 * Es la única forma de perder la sesión local además del logout. Un error de
 * red no pasa por acá: no dice nada sobre la cookie.
 */
export function expireSession(options: IExpireSessionOptions = {}): void {
  const storage = options.storage === undefined ? safeLocalStorage() : options.storage
  clearMe(storage)
  ;(options.clearData ?? clearCache)()

  const current = options.currentPath ?? currentPathFromWindow()
  const pathname = normalizePath(current.split("?")[0] ?? current)
  if (pathname === LOGIN_PATH) return
  ;(options.replace ?? replaceLocation)(loginHref(current))
}
