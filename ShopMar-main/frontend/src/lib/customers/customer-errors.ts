/**
 * Traducción de los errores de la API de clientes a lo que pinta la pantalla.
 *
 * El formulario reparte el `400` entre el sobre y el campo que falló, igual que
 * el formulario de venta. El borrado es distinto: el `409` de un cliente con
 * deuda ya trae el mensaje que la dueña tiene que leer —nombra al cliente y
 * explica cómo salir— así que se muestra textual, sin reemplazarlo por uno
 * genérico del cliente.
 */

import { ApiError } from "../core/api"
import { getErrorMessage, getFieldErrors } from "../core/errors"

export interface ICustomerFormErrorView {
  /** Mensaje por campo, listo para pintar junto al control. */
  fields: Record<string, string>
  /** Mensaje del sobre, bajo el formulario. */
  banner: string
}

export function customerFormErrorView(error: unknown): ICustomerFormErrorView {
  const message = error instanceof ApiError ? error.message : ""

  return {
    fields: getFieldErrors(message),
    banner: getErrorMessage(error),
  }
}

/**
 * El mensaje de un borrado fallido. El `409` se respeta tal cual llegó; para
 * cualquier otro error se usa el mensaje del sistema. Un `409` sin cuerpo
 * —`ApiError` cae al nombre del código— no se muestra como `"CONFLICT"`.
 */
export function customerDeleteErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    const message = error.message.trim()
    if (message !== "" && message !== error.code) return message
  }

  return getErrorMessage(error)
}
