import { describe, expect, it } from "vitest"
import {
  CUSTOMER_NAME_MAX,
  CUSTOMER_NOTE_MAX,
  CUSTOMER_PHONE_MAX,
  validateCustomerForm,
} from "./customer-form"

describe("validateCustomerForm", () => {
  it("exige el nombre y no arma payload cuando falta", () => {
    const result = validateCustomerForm({ name: "   ", phone: "", note: "" })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual({ name: "Ingresá el nombre del cliente" })
    expect(result.payload).toBeNull()
  })

  it("recorta el nombre antes de mandarlo", () => {
    const result = validateCustomerForm({ name: "  María González  ", phone: "", note: "" })

    expect(result.valid).toBe(true)
    expect(result.payload).toEqual({ name: "María González", phone: null, note: null })
  })

  it("acepta el nombre en el límite exacto", () => {
    const name = "a".repeat(CUSTOMER_NAME_MAX)
    const result = validateCustomerForm({ name, phone: "", note: "" })

    expect(result.valid).toBe(true)
    expect(result.payload?.name).toBe(name)
  })

  it("rechaza el nombre pasado del límite", () => {
    const result = validateCustomerForm({ name: "a".repeat(CUSTOMER_NAME_MAX + 1), phone: "", note: "" })

    expect(result.valid).toBe(false)
    expect(result.errors.name).toBe("El nombre no puede pasar de 200 caracteres")
  })

  it("acepta el teléfono en el límite y lo recorta", () => {
    const phone = "8".repeat(CUSTOMER_PHONE_MAX)
    const result = validateCustomerForm({ name: "Jorge", phone: `  ${phone}  `, note: "" })

    expect(result.valid).toBe(true)
    expect(result.payload?.phone).toBe(phone)
  })

  it("rechaza el teléfono pasado del límite", () => {
    const result = validateCustomerForm({
      name: "Jorge",
      phone: "8".repeat(CUSTOMER_PHONE_MAX + 1),
      note: "",
    })

    expect(result.valid).toBe(false)
    expect(result.errors.phone).toBe("El teléfono no puede pasar de 30 caracteres")
  })

  it("acepta la nota en el límite y la recorta", () => {
    const note = "n".repeat(CUSTOMER_NOTE_MAX)
    const result = validateCustomerForm({ name: "Jorge", phone: "", note: ` ${note} ` })

    expect(result.valid).toBe(true)
    expect(result.payload?.note).toBe(note)
  })

  it("rechaza la nota pasada del límite", () => {
    const result = validateCustomerForm({
      name: "Jorge",
      phone: "",
      note: "n".repeat(CUSTOMER_NOTE_MAX + 1),
    })

    expect(result.valid).toBe(false)
    expect(result.errors.note).toBe("La nota no puede pasar de 500 caracteres")
  })

  it("acumula los tres errores de longitud a la vez", () => {
    const result = validateCustomerForm({
      name: "a".repeat(CUSTOMER_NAME_MAX + 1),
      phone: "8".repeat(CUSTOMER_PHONE_MAX + 1),
      note: "n".repeat(CUSTOMER_NOTE_MAX + 1),
    })

    expect(result.valid).toBe(false)
    expect(Object.keys(result.errors).sort()).toEqual(["name", "note", "phone"])
    expect(result.payload).toBeNull()
  })

  it("manda null cuando el teléfono o la nota quedan vacíos", () => {
    const result = validateCustomerForm({ name: "Jorge Medina", phone: "   ", note: "  " })

    expect(result.payload).toEqual({ name: "Jorge Medina", phone: null, note: null })
  })

  it("manda los tres campos recortados cuando están completos", () => {
    const result = validateCustomerForm({
      name: "  María González ",
      phone: " 8888 1234 ",
      note: " Vive en el barrio San Judas ",
    })

    expect(result).toEqual({
      valid: true,
      errors: {},
      payload: {
        name: "María González",
        phone: "8888 1234",
        note: "Vive en el barrio San Judas",
      },
    })
  })
})
