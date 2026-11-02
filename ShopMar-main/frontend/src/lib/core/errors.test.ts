import { describe, expect, it, vi } from "vitest"
import { ApiError } from "./api"
import { ERROR_MESSAGES, getErrorMessage, getFieldErrors } from "./errors"

describe("getErrorMessage", () => {
  it("traduce los seis códigos del backend al español", () => {
    for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
      expect(getErrorMessage(new ApiError(code, 400))).toBe(message)
    }
  })

  it("traduce NETWORK_ERROR con el mensaje que le dice a la dueña qué hacer", () => {
    expect(ERROR_MESSAGES.NETWORK_ERROR).toContain("backend esté encendido")
    expect(ERROR_MESSAGES.NETWORK_ERROR).toContain("CORS_ORIGIN")
  })

  it("no muestra el detalle del servidor para INTERNAL_ERROR: va a la consola", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const error = new ApiError("INTERNAL_ERROR", 500, "detalle interno del stack")
      expect(getErrorMessage(error)).toBe(ERROR_MESSAGES.INTERNAL_ERROR)
    } finally {
      spy.mockRestore()
    }
  })

  it("devuelve el texto tal cual cuando el error es una cadena suelta", () => {
    expect(getErrorMessage("texto suelto")).toBe("texto suelto")
  })

  it("devuelve un texto útil para un objeto desconocido, no [object Object]", () => {
    const message = getErrorMessage({ foo: 1 })
    expect(message).not.toBe("[object Object]")
    expect(message.length).toBeGreaterThan(0)
    expect(getErrorMessage(null)).toBeTruthy()
    expect(getErrorMessage(undefined)).toBeTruthy()
  })

  it("usa un mensaje genérico para un código desconocido", () => {
    const message = getErrorMessage(new ApiError("CODIGO_NUEVO", 418))
    expect(message).not.toBe("CODIGO_NUEVO")
    expect(message.length).toBeGreaterThan(0)
  })
})

describe("getFieldErrors", () => {
  it("parte el prefijo de campo antes de los dos puntos (criterio de Done)", () => {
    expect(getFieldErrors("cost: Invalid money format")).toEqual({
      cost: "Invalid money format",
    })
  })

  it("conserva el path completo de un artículo adicional, con su índice", () => {
    expect(getFieldErrors("additional_items.0.name: Name is required")).toEqual({
      "additional_items.0.name": "Name is required",
    })
  })

  it("ubica el error de banco en su campo, aunque el mensaje tenga dos puntos adentro", () => {
    expect(
      getFieldErrors("payment_bank: Payment bank is required for credit card payments"),
    ).toEqual({
      payment_bank: "Payment bank is required for credit card payments",
    })
  })

  it("no marca ningún campo para el prefijo reservado value: va al banner", () => {
    expect(
      getFieldErrors("value: Unrecognized key(s) in object: 'additional_items'"),
    ).toEqual({})
  })

  it("no marca ningún campo para un mensaje de negocio sin prefijo", () => {
    expect(getFieldErrors("Live sales cannot include additional items")).toEqual({})
    expect(getFieldErrors("")).toEqual({})
  })
})