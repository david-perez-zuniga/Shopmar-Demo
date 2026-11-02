/**
 * La parte pura de `/login` (T6): qué `next` se acepta, qué se valida en el
 * cliente y qué texto se pinta para cada respuesta del contrato
 * (`modules/api/07-auth.md`).
 *
 * No toca `document` ni pide red: la pantalla (`src/pages/login.astro`) es la
 * única que sabe del formulario. Así el saneo de `next` y los mensajes se
 * prueban sin navegador.
 */

import { normalizePath, viewForPath } from "../app/router"

/** La ruta del formulario. Es un documento propio, no una vista de la SPA. */
export const LOGIN_PATH = "/login"

/** El host de mentira que se usa para parsear `next` sin salir del panel. */
const INTERNAL_ORIGIN = "http://panel.shopmar.local"

/**
 * El `next` de la URL, saneado a una ruta del panel o a `/`.
 *
 * Solo se acepta una ruta que el router conozca: un `next` es «volvé a donde
 * estabas», no un destino libre. Todo lo demás —otro origen, una ruta que no es
 * del panel, `javascript:`, una barra doble que el navegador lee como host— cae
 * en `/`. Nunca se redirige afuera.
 */
export function safeNext(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "/"
  const value = raw.trim()
  if (value === "" || !value.startsWith("/")) return "/"
  // `//host` es un origen externo para el navegador, y la barra invertida se
  // normaliza a `/` en las URLs especiales: las dos se rechazan acá.
  if (value.startsWith("//") || value.includes("\\")) return "/"

  let url: URL
  try {
    url = new URL(value, INTERNAL_ORIGIN)
  } catch {
    return "/"
  }
  if (url.origin !== INTERNAL_ORIGIN) return "/"
  if (viewForPath(url.pathname) === null) return "/"
  return `${normalizePath(url.pathname)}${url.search}`
}

/** El `next` del `search` de la URL actual (`?next=…`), ya saneado. */
export function readNext(search: string): string {
  const query = search.startsWith("?") ? search.slice(1) : search
  return safeNext(new URLSearchParams(query).get("next"))
}

/** La URL del formulario con el `next` codificado y saneado. */
export function loginHref(next: string): string {
  return `${LOGIN_PATH}?next=${encodeURIComponent(safeNext(next))}`
}

/**
 * Lo mínimo que se valida antes de enviar: los dos campos no vacíos. El
 * `identifier` se recorta porque un espacio pegado no es un usuario; la
 * contraseña no se toca, solo importa que coincida. No hay regla de largo: la
 * del alta no aplica al login.
 *
 * Existe para no gastar un intento del límite de 10 por minuto en un envío
 * vacío. Todo lo demás lo decide el servidor.
 */
export function validateLoginForm(identifier: string, password: string): string | null {
  if (identifier.trim() === "") return "Escribí tu usuario o correo."
  if (password === "") return "Escribí tu contraseña."
  return null
}

/** Lo que la vista necesita del error: el `ApiError` cumple esta forma. */
export interface ILoginErrorLike {
  code: string
  status: number
}

/**
 * El texto que se pinta para cada respuesta del contrato. Un `401` muestra el
 * mensaje del servidor sin distinguir «no existe» de «contraseña incorrecta»,
 * porque el servidor tampoco lo distingue.
 */
export function loginErrorMessage(error: ILoginErrorLike): string {
  // El servidor manda `Invalid credentials` y no distingue causas; el panel lo
  // dice en su idioma, con un solo texto para no revelar cuál de las dos falló.
  if (error.status === 401 || error.code === "UNAUTHORIZED") {
    return "Usuario o contraseña incorrectos."
  }
  if (error.status === 429 || error.code === "RATE_LIMITED") {
    return "Demasiados intentos. Esperá un minuto."
  }
  if (error.code === "NETWORK_ERROR" || error.status === 0) return "No se pudo conectar"
  return "No se pudo iniciar sesión. Probá de nuevo."
}
