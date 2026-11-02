/**
 * El cliente de la venta: elegir entre «Cliente nuevo» —escribir su nombre— o
 * «Cliente existente» —buscarlo en el padrón—, y avisar cuando el teléfono
 * escrito ya es de alguien (S28), en su parte pura.
 *
 * Frontera de pureza, la misma de `sale-form.ts` y `sale-form-steps.ts`:
 * - Todo lo de acá son derivaciones de un estado: qué dígitos tiene un número,
 *   qué cliente los tiene guardados, qué claves del payload produce el modo
 *   elegido y qué errores deja. No toca `document` ni `window`.
 * - El cableado del DOM —los dos botones del modo, el buscador con `debounce`,
 *   la lista de resultados, el aviso con sus dos botones, el foco— vive en el
 *   `lib/views/sale-new.ts`, la vista de la SPA.
 *
 * El formulario es uno solo para `live` y `whatsapp`: esto no depende del canal.
 */

import type { ICustomerResponse } from "../core/types"

/**
 * Los caminos del cliente (S43) y el caso «sin cliente» (S63).
 *
 * - `new`: se escribe el nombre y la venta lo registra como cliente (S18).
 * - `existing`: se elige a alguien del padrón y la venta se enlaza por su id.
 * - `none`: la venta es de contado y no lleva cliente (S63). No tiene botón: lo
 *   reporta la vista mientras el checkbox «Agregar cliente» está apagado. La
 *   venta no manda ninguna de las dos claves y el servidor guarda el nombre
 *   genérico sin crear una fila en el padrón. Con crédito no existe: ahí el
 *   cliente es obligatorio, porque no hay a quién cobrarle la deuda.
 */
export type CustomerMode = "new" | "existing" | "none"

/** El rótulo del camino de cliente nuevo, textual de S43. */
export const NEW_CUSTOMER_LABEL = "Cliente nuevo"

/**
 * El rótulo del camino del padrón, textual de S43 (y el mismo nombre que tenía
 * la opción plegada de S30).
 */
export const EXISTING_CUSTOMER_LABEL = "Cliente existente"

/**
 * El rótulo de cada botón, en un solo lugar: el marcado lo lee de acá. «Sin
 * cliente» no está porque no es un camino que se elija con un botón: es la
 * ausencia de cliente mientras el checkbox «Agregar cliente» está apagado (S63).
 */
export const CUSTOMER_MODE_LABELS: Record<Exclude<CustomerMode, "none">, string> = {
  new: NEW_CUSTOMER_LABEL,
  existing: EXISTING_CUSTOMER_LABEL,
}

/**
 * El formulario abre en «Cliente nuevo» (S43): la mayoría de las ventas son a
 * gente nueva, así que escribir el nombre es el camino que aparece primero.
 *
 * Tipado con el modo del borrador y no con `CustomerMode` (S63): «sin cliente»
 * no es un camino que se abra por defecto, es la ausencia de cliente. Así el
 * valor se puede guardar en un borrador sin un `as` que tape justamente lo que
 * `parseSaleDraft` rechaza.
 */
export const DEFAULT_CUSTOMER_MODE: Exclude<CustomerMode, "none"> = "new"

/**
 * Sin nombre escrito en el modo nuevo, el campo Cliente no puede quedar vacío:
 * escribirlo es lo que crea o resuelve el cliente de la venta (S18).
 */
export const CUSTOMER_NAME_REQUIRED_MESSAGE = "Escribí el nombre del cliente"

/**
 * Sin cliente elegido en el modo existente, «La venta» pide el dato y nombra su
 * control: el modo no cae al nombre escrito, que es del otro camino (S43).
 */
export const EXISTING_CUSTOMER_REQUIRED_MESSAGE = "Elegí un cliente existente"

/**
 * El aviso de teléfono repetido y sus dos salidas (S28). El texto del aviso y
 * los de los botones son los que pidió la dueña, textuales: por eso viven acá,
 * con su prueba, y no sueltos en el marcado de la pantalla.
 */
export const PHONE_TAKEN_TITLE = "Número asociado a cliente existente"
export const PHONE_TAKEN_USE_DATA = "Usar sus datos"
export const PHONE_TAKEN_OTHER_NUMBER = "Escribir otro número"

/**
 * El error del campo mientras el aviso sigue sin resolverse: no se puede
 * registrar la venta con un número que ya es de otro cliente sin decidir nada.
 */
export const PHONE_TAKEN_MESSAGE = "Ese número es de otro cliente: usá sus datos o escribí otro número"

/**
 * Una sola letra no busca: el padrón se puede escribir entero y cada tecla no
 * tiene por qué ser una consulta a la API.
 */
export const MIN_CUSTOMER_QUERY_LENGTH = 2

/** El cliente de la venta, tal como lo lee el formulario. */
export interface ICustomerChoice {
  /** Cuál de los caminos está abierto (S43) —o «sin cliente» (S63)—: decide qué clave viaja. */
  mode: CustomerMode
  /** El cliente del padrón elegido; `null` mientras no se eligió ninguno. */
  customerId: string | null
  /**
   * El nombre escrito a mano. `undefined` cuando el cuerpo base no lo traía
   * (el payload no inventa la clave), que no es lo mismo que el campo vacío.
   */
  typedName: string | undefined
}

/** Las claves del payload que produce el cliente elegido. Nunca las dos juntas. */
export interface ICustomerPayloadKeys {
  customer_id?: string
  customer_name?: string
}

/** Los errores del campo Cliente; mismas claves que lee `paintFieldError`. */
export interface ICustomerChoiceErrors {
  customer_id?: string
  customer_name?: string
}

/**
 * Los dígitos de un teléfono, sin espacios, guiones, paréntesis ni ningún otro
 * signo. El número se guarda como se escribió, así que «8888 1234» y
 * «88881234» son el mismo número (S28). El código de país es parte del número:
 * acá no se recorta, sólo se quita lo que no es dígito.
 */
export function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "")
}

/**
 * El cliente dueño de un número, comparando **por dígitos** contra los que
 * devolvió `GET /customers?q=` (S28).
 *
 * - Un teléfono sin dígitos no coincide con nadie: sin esa guarda, cualquier
 *   cliente sin teléfono "coincidiría" con el campo vacío.
 * - `exceptId` deja afuera al cliente ya elegido: su propio teléfono, que el
 *   formulario precarga, no es un aviso.
 * - Si dos clientes comparten número —una familia, que la API acepta— se ofrece
 *   el primero de la lista, que viene en orden alfabético y estable.
 */
export function phoneMatch(
  customers: readonly ICustomerResponse[],
  phone: string,
  exceptId: string | null = null,
): ICustomerResponse | null {
  const digits = digitsOnly(phone)
  if (digits === "") return null
  const skip = exceptId?.trim() ?? ""
  for (const customer of customers) {
    if (skip !== "" && customer.id === skip) continue
    if (customer.phone === null) continue
    if (digitsOnly(customer.phone) === digits) return customer
  }
  return null
}

/**
 * Si el aviso del teléfono repetido sigue en pie (S28): hay un cliente dueño
 * del número y el cliente elegido no es él. Usar sus datos lo resuelve; elegir
 * a otro cliente, o quedarse sin ninguno, lo vuelve a plantear.
 */
export function phoneOwnerBlocks(ownerId: string | null, chosenId: string | null): boolean {
  const owner = ownerId?.trim() ?? ""
  if (owner === "") return false
  return (chosenId?.trim() ?? "") !== owner
}

/**
 * Las claves del payload que produce el modo elegido (S43).
 *
 * - `new`: el nombre escrito (`customer_name`), y **nunca** `customer_id`: un
 *   cliente elegido de antes es un resto del otro camino y la API rechaza las
 *   dos claves juntas.
 * - `existing`: el `customer_id` del cliente elegido y **nunca** el nombre —el
 *   de la factura lo pone el servidor desde la fila del cliente (D-022)—. Sin
 *   cliente elegido no manda ninguna clave: el modo vacío no cae al nombre
 *   escrito, que es del otro camino.
 * - `none`: ninguna de las dos (S63). Tampoco el nombre genérico: si viajara, el
 *   servidor lo resolvería contra el padrón y crearía la fila «Consumidor
 *   Final» que la decisión prohíbe. El nombre genérico lo pone el servidor.
 *
 * La condición de pago no participa de esta decisión: sólo el modo y su valor.
 */
export function customerSelection(choice: ICustomerChoice): ICustomerPayloadKeys {
  if (choice.mode === "none") return {}
  if (choice.mode === "existing") {
    const id = choice.customerId?.trim() ?? ""
    return id === "" ? {} : { customer_id: id }
  }
  if (choice.typedName === undefined) return {}
  return { customer_name: choice.typedName }
}

/**
 * El cliente de la venta, validado según su modo (S43). Cada modo pide lo suyo
 * y sólo lo suyo:
 *
 * - `new`: el nombre escrito. Un `customerId` viejo no lo reemplaza.
 * - `existing`: un cliente del padrón elegido. Un nombre escrito viejo no
 *   alcanza.
 * - `none`: no pide nada (S63). La etapa de la condición de pago es la que
 *   decide si este modo es válido: la vista lo reporta sólo de contado.
 *
 * El campo vive en «La venta» en los dos modos, así que la regla también.
 */
export function validateCustomerChoice(choice: ICustomerChoice): ICustomerChoiceErrors {
  if (choice.mode === "none") return {}
  if (choice.mode === "existing") {
    return (choice.customerId?.trim() ?? "") === ""
      ? { customer_id: EXISTING_CUSTOMER_REQUIRED_MESSAGE }
      : {}
  }
  if ((choice.typedName ?? "").trim() === "") {
    return { customer_name: CUSTOMER_NAME_REQUIRED_MESSAGE }
  }
  return {}
}

/**
 * Si lo escrito alcanza para consultar el padrón: dos caracteres son el piso
 * del buscador, sea un nombre o el principio de un número.
 */
export function customerQueryReady(raw: string): boolean {
  return raw.trim().length >= MIN_CUSTOMER_QUERY_LENGTH
}
