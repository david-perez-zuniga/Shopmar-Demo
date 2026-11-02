/**
 * Las tres llamadas de autenticación (T6). El contrato —cuerpos, códigos y
 * mensajes— está en `modules/api/07-auth.md`; acá solo se envuelve `apiFetch`,
 * que es quien agrega `credentials: "include"` y aplica la regla del `401`.
 *
 * `login` y el `me` del guard piden `authRedirect: false`: un `401` del login
 * son credenciales inválidas —no una sesión vencida— y el guard necesita
 * decidir él mismo, antes de que exista una vista montada.
 */

import { apiFetch } from "../core/api"
import type { IMeResponse, IMessageResponse, IUser } from "../core/types"

/** `POST /auth/login`: devuelve el usuario y el servidor emite la cookie. */
export async function loginUser(identifier: string, password: string): Promise<IUser> {
  const body = await apiFetch<IMeResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
    // Un 401 acá es «credenciales inválidas»: no se toca la copia local ni se
    // navega. La pantalla muestra el mensaje del contrato.
    authRedirect: false,
  })
  return body.user
}

/**
 * `GET /auth/me`: la única fuente de verdad del rol.
 *
 * `redirectOnUnauthorized` distingue los dos usos: el guard bloqueante decide
 * él y no quiere navegar; la revalidación de fondo usa la regla común, así que
 * un `401` borra la copia y vuelve a `/login` sin duplicar la regla.
 */
export async function fetchMe(
  options: { redirectOnUnauthorized?: boolean } = {},
): Promise<IUser> {
  const body = await apiFetch<IMeResponse>(
    "/auth/me",
    { authRedirect: options.redirectOnUnauthorized === true },
    // Nunca se sirve de la caché de datos: es la pregunta por la sesión.
    "fresh",
  )
  return body.user
}

/** `POST /auth/logout`: revoca la sesión de esta cookie. Es idempotente. */
export async function logoutUser(): Promise<void> {
  await apiFetch<IMessageResponse>("/auth/logout", { method: "POST" })
}
