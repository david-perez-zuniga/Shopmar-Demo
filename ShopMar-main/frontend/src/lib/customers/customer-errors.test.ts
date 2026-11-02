import { describe, expect, it } from "vitest"
import { ApiError } from "../core/api"
import { ERROR_MESSAGES } from "../core/errors"
import { customerDeleteErrorMessage, customerFormErrorView } from "./customer-errors"

describe("customerFormErrorView", () => {
  it("mapea el 400 del servidor al campo que falló", () => {
    const view = customerFormErrorView(
      new ApiError("BAD_REQUEST", 400, "name: name must be at most 200 characters"),
    )

    expect(view.fields).toEqual({ name: "name must be at most 200 characters" })
    expect(view.banner).toBe(ERROR_MESSAGES.BAD_REQUEST)
  })

  it("un error sin campo deja el sobre y ningún campo pintado", () => {
    const view = customerFormErrorView(new Error("boom"))

    expect(view.fields).toEqual({})
    expect(view.banner).toBe("boom")
  })
})

describe("customerDeleteErrorMessage", () => {
  const conflictMessage =
    'El cliente "María González" tiene ventas a crédito con saldo pendiente: cobralas o cancelalas antes de borrarlo.'

  it("muestra el mensaje del 409 tal cual lo manda el servidor", () => {
    expect(customerDeleteErrorMessage(new ApiError("CONFLICT", 409, conflictMessage))).toBe(
      conflictMessage,
    )
  })

  it("si el 409 no trae mensaje no inventa uno de conflicto", () => {
    const message = customerDeleteErrorMessage(new ApiError("CONFLICT", 409))

    expect(message).not.toBe("CONFLICT")
    expect(message).not.toBe("")
  })

  it("un 404 usa el mensaje del sistema", () => {
    expect(customerDeleteErrorMessage(new ApiError("NOT_FOUND", 404))).toBe(
      ERROR_MESSAGES.NOT_FOUND,
    )
  })

  it("un error de red usa el mensaje de conexión del sistema", () => {
    expect(customerDeleteErrorMessage(new ApiError("NETWORK_ERROR", 0))).toBe(
      ERROR_MESSAGES.NETWORK_ERROR,
    )
  })
})
