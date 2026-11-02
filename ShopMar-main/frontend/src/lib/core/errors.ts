import { ApiError } from "./api"

export const ERROR_MESSAGES: Record<string, string> = {
  BAD_REQUEST: "La solicitud no es válida. Revisá los datos ingresados.",
  NOT_FOUND: "Lo que buscás no existe o ya no está disponible.",
  INTERNAL_ERROR: "Algo salió mal en el servidor. Intentá de nuevo en un momento.",
  UNAUTHORIZED: "Necesitás una sesión activa para hacer esto.",
  FORBIDDEN: "No tenés permiso para hacer esto.",
  NETWORK_ERROR:
    "No se pudo conectar con el servidor. Revisá que el backend esté encendido y que la página se abra en el mismo origen que CORS_ORIGIN (localhost o 127.0.0.1, no la IP de red).",
}

const FALLBACK_MESSAGE = "Ocurrió un error inesperado. Intentá de nuevo."

export function getErrorMessage(error: unknown): string {
  if (typeof error === "string" && error !== "") return error

  if (error instanceof ApiError) {
    const message = ERROR_MESSAGES[error.code]
    if (message === undefined) return FALLBACK_MESSAGE

    if (error.code === "INTERNAL_ERROR" && error.message !== error.code) {
      console.error("[api]", error.message)
    }
    return message
  }

  if (error instanceof Error) {
    return error.message !== "" ? error.message : FALLBACK_MESSAGE
  }

  return FALLBACK_MESSAGE
}

export function getFieldErrors(message: string): Record<string, string> {
  if (message === "") return {}

  const colon = message.indexOf(":")
  if (colon === -1) return {}

  const prefix = message.slice(0, colon).trim()
  const detail = message.slice(colon + 1).trim()
  if (prefix === "" || prefix === "value") return {}

  return { [prefix]: detail }
}