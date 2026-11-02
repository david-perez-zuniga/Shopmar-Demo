/**
 * Validación del alta y la edición de un cliente.
 *
 * El mismo formulario sirve para las dos operaciones, así que el payload tiene
 * la forma completa —nombre, teléfono y nota— y se manda tal cual al `POST` o
 * al `PATCH`. En la edición, un campo vacío viaja como `null`, que es lo que
 * borra el teléfono o la nota en el contrato (`specs/modules/api/06-customers.md`).
 *
 * La validación local reproduce los topes del DTO para dar el mensaje junto al
 * campo sin ir al servidor; el `400` de la API sigue siendo la red de seguridad.
 */

export const CUSTOMER_NAME_MAX = 200
export const CUSTOMER_PHONE_MAX = 30
export const CUSTOMER_NOTE_MAX = 500

export type CustomerFormField = "name" | "phone" | "note"

export interface ICustomerFormValues {
  name: string
  phone: string
  note: string
}

export type CustomerFormErrors = Partial<Record<CustomerFormField, string>>

/**
 * La forma que aceptan las dos rutas de escritura: el nombre siempre presente y
 * los dos opcionales con `null` cuando se borran. Es asignable tanto a
 * `ICreateCustomerRequest` como a `IUpdateCustomerRequest`, así que el mismo
 * payload sirve para el `POST` y para el `PATCH`.
 */
export interface ICustomerFormPayload {
  name: string
  phone: string | null
  note: string | null
}

export interface ICustomerFormResult {
  valid: boolean
  errors: CustomerFormErrors
  payload: ICustomerFormPayload | null
}

/**
 * Valida y normaliza los tres campos. Un campo opcional en blanco se manda como
 * `null` —nunca como cadena vacía— para que el contrato reciba el borrado
 * explícito que documenta.
 */
export function validateCustomerForm(values: ICustomerFormValues): ICustomerFormResult {
  const name = values.name.trim()
  const phone = values.phone.trim()
  const note = values.note.trim()

  const errors: CustomerFormErrors = {}

  if (name === "") {
    errors.name = "Ingresá el nombre del cliente"
  } else if (name.length > CUSTOMER_NAME_MAX) {
    errors.name = `El nombre no puede pasar de ${CUSTOMER_NAME_MAX} caracteres`
  }

  if (phone.length > CUSTOMER_PHONE_MAX) {
    errors.phone = `El teléfono no puede pasar de ${CUSTOMER_PHONE_MAX} caracteres`
  }

  if (note.length > CUSTOMER_NOTE_MAX) {
    errors.note = `La nota no puede pasar de ${CUSTOMER_NOTE_MAX} caracteres`
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, payload: null }
  }

  return {
    valid: true,
    errors: {},
    payload: {
      name,
      phone: phone === "" ? null : phone,
      note: note === "" ? null : note,
    },
  }
}
