/**
 * El borrador del formulario de venta (`/sales/new`), en su parte pura
 * (S49, S50).
 *
 * Frontera de pureza (la misma de `sale-form.ts` y `sale-rows.ts`):
 * - Todo lo de acá son strings, listas y derivaciones: la clave de la entrada,
 *   la forma que se guarda, la validación de lo que se lee y el acceso
 *   defensivo al `Storage` que entra por parámetro. No toca `document` ni lee
 *   controles: el `<script>` de la pantalla es el único que sabe del DOM.
 * - El almacenamiento se inyecta (`storage: Storage | null`) para poder probar
 *   el modo privado y la cuota llena sin tocar el navegador.
 *
 * El formulario es uno solo para `live` y `whatsapp`, pero el borrador es **uno
 * por canal**: lo que se está vendiendo en el mostrador no aparece al abrir la
 * venta de WhatsApp, que es otra venta en curso.
 */

import type { PaymentMethod, PaymentTerms, SaleType } from "../core/types"
import type { CustomerMode } from "./customer-pick"

/**
 * La versión del **formato** del borrador. Sube cuando la forma guardada cambia
 * de manera que un borrador viejo ya no se pueda interpretar; un borrador de
 * otra versión se ignora en vez de restaurarse a medias y romper la pantalla
 * (S50).
 */
export const SALE_DRAFT_VERSION = 1

/** El prefijo de la entrada de `localStorage`: namespace de la aplicación. */
export const SALE_DRAFT_KEY_PREFIX = "shopmar:sale-draft"

/**
 * El cliente elegido en el padrón, reducido a lo justo para repintar el chip de
 * «Cliente existente» y el `customer_id` que viaja en el alta: `id`, `name` y
 * `phone`. La ficha entera (nota, marcas de auditoría) se vuelve a pedir a la
 * API cuando hace falta y no es asunto de un borrador.
 */
export interface ISaleDraftCustomer {
  id: string
  name: string
  phone: string | null
}

/** Un renglón de mercadería: nombre y precio, lo mismo que pide la lista (S44). */
export interface ISaleDraftProduct {
  name: string
  /** El precio en córdobas tal como se escribió; no se normaliza acá. */
  price: string
}

/**
 * El modo de cliente que el borrador sí puede guardar (S43).
 *
 * «Sin cliente» (S63) queda afuera a propósito: no es una decisión que la
 * persona tomó y quiera recuperar al volver, es la ausencia de cliente mientras
 * el interruptor «Agregar cliente» está apagado, y `parseSaleDraft` la rechaza.
 * El tipo lo dice para que no haya que confiar en el parseo: escribir `"none"`
 * acá no compila, en vez de tirar el borrador entero en silencio al recargar.
 */
export type DraftCustomerMode = Exclude<CustomerMode, "none">

/**
 * Lo que el formulario guarda mientras se llena, y nada más (S49): el modo del
 * cliente, lo escrito o elegido, el teléfono y su checkbox, los productos en su
 * orden, la condición de pago con su vencimiento, la forma de pago con su banco,
 * el cobro en el momento y la fecha de la venta. El canal no se guarda adentro
 * porque ya está en la clave.
 */
export interface ISaleDraft {
  customerMode: DraftCustomerMode
  customerName: string
  customer: ISaleDraftCustomer | null
  addPhone: boolean
  phone: string
  products: ISaleDraftProduct[]
  paymentTerms: PaymentTerms
  dueDate: string
  paymentMethod: PaymentMethod
  paymentBank: string
  collectNow: boolean
  amountPaid: string
  saleDate: string
}

/**
 * La clave de `localStorage` de un canal. Lleva el canal y la versión de
 * formato: el borrador de `live` y el de `whatsapp` no se pisan, y un cambio de
 * formato deja los viejos en una entrada que ya nadie lee (S50).
 */
export function saleDraftKey(channel: SaleType): string {
  return `${SALE_DRAFT_KEY_PREFIX}:${channel}:v${SALE_DRAFT_VERSION}`
}

/**
 * El borrador como JSON, armando el objeto desde cero: así una clave de más que
 * se cuele en el objeto en memoria no llega nunca al almacenamiento.
 */
export function serializeSaleDraft(draft: ISaleDraft): string {
  const customer =
    draft.customer === null
      ? null
      : { id: draft.customer.id, name: draft.customer.name, phone: draft.customer.phone }
  return JSON.stringify({
    version: SALE_DRAFT_VERSION,
    customerMode: draft.customerMode,
    customerName: draft.customerName,
    customer,
    addPhone: draft.addPhone,
    phone: draft.phone,
    // Los renglones se copian campo por campo: el borrador guarda nombre y
    // precio, y nada de lo que la lista pueda traer de más.
    products: draft.products.map((row) => ({ name: row.name, price: row.price })),
    paymentTerms: draft.paymentTerms,
    dueDate: draft.dueDate,
    paymentMethod: draft.paymentMethod,
    paymentBank: draft.paymentBank,
    collectNow: draft.collectNow,
    amountPaid: draft.amountPaid,
    saleDate: draft.saleDate,
  })
}

type TJsonObject = Record<string, unknown>

/** Un objeto JSON de verdad: ni `null`, ni un arreglo, ni un primitivo. */
function asRecord(value: unknown): TJsonObject | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return value as TJsonObject
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

/**
 * Los renglones guardados, saneados. El formulario siempre tiene el primero —es
 * la mercadería principal y no se puede quitar (S44)—, así que una lista vacía
 * no es un borrador a medias sino un borrador que no sirve: se ignora entero.
 */
function normalizeProducts(value: unknown): ISaleDraftProduct[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const rows: ISaleDraftProduct[] = []
  for (const item of value) {
    const record = asRecord(item)
    if (record === null) return null
    const name = asString(record.name)
    const price = asString(record.price)
    if (name === null || price === null) return null
    rows.push({ name, price })
  }
  return rows
}

/**
 * El cliente elegido, saneado a sus tres campos. Devuelve `undefined` cuando el
 * dato no sirve, que es distinto de `null` (no hay cliente elegido).
 */
function normalizeCustomer(value: unknown): ISaleDraftCustomer | null | undefined {
  if (value === null) return null
  const record = asRecord(value)
  if (record === null) return undefined
  const id = asString(record.id)
  const name = asString(record.name)
  const rawPhone = record.phone
  const phone = rawPhone === null ? null : asString(rawPhone)
  if (id === null || name === null) return undefined
  if (rawPhone !== null && phone === null) return undefined
  return { id, name, phone }
}

/**
 * Interpreta y valida lo guardado. Devuelve `null` —y la pantalla arranca
 * vacía— si el borrador no está, es de otra versión, no es JSON válido, le falta
 * un campo o trae un valor de otro tipo (S49, S50): un borrador a medias no se
 * restaura a medias.
 *
 * Lo que sí se sanea sin descartar el borrador son las claves de más —adentro de
 * un renglón y del cliente elegido— y el cliente que sobrevive a un cambio de
 * modo: el borrador guarda lo que la pantalla puede repintar y nada más.
 */
export function parseSaleDraft(raw: string | null): ISaleDraft | null {
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const record = asRecord(parsed)
  if (record === null) return null
  // La versión va primero: un borrador de otro formato no se interpreta con
  // estas reglas, se descarta.
  if (record.version !== SALE_DRAFT_VERSION) return null

  const rawMode = record.customerMode
  const customerMode = rawMode === "new" || rawMode === "existing" ? rawMode : null
  const rawTerms = record.paymentTerms
  const paymentTerms = rawTerms === "credit" || rawTerms === "immediate" ? rawTerms : null
  const rawMethod = record.paymentMethod
  const paymentMethod = rawMethod === "cash" || rawMethod === "credit_card" ? rawMethod : null

  const customerName = asString(record.customerName)
  const addPhone = asBool(record.addPhone)
  const phone = asString(record.phone)
  const products = normalizeProducts(record.products)
  const dueDate = asString(record.dueDate)
  const paymentBank = asString(record.paymentBank)
  const collectNow = asBool(record.collectNow)
  const amountPaid = asString(record.amountPaid)
  const saleDate = asString(record.saleDate)
  const customer = normalizeCustomer(record.customer)

  if (customerMode === null || paymentTerms === null || paymentMethod === null) return null
  if (customerName === null || addPhone === null || phone === null) return null
  if (products === null || dueDate === null || paymentBank === null) return null
  if (collectNow === null || amountPaid === null) return null
  // La fecha sin valor no es un borrador útil: el formulario siempre trae una y
  // restaurar un campo vacío dejaría el envío sin `sale_date`.
  if (saleDate === null || saleDate.trim() === "") return null
  if (customer === undefined) return null
  // «Cliente existente» sin cliente elegido no tiene chip que repintar ni
  // `customer_id` que mandar: el modo no cae al nombre escrito (S43).
  if (customerMode === "existing" && customer === null) return null

  return {
    customerMode,
    customerName,
    // Un cliente que sobrevivió a «Cliente nuevo» es un resto del otro camino:
    // ese modo no manda `customer_id`, así que no se restaura (S43).
    customer: customerMode === "existing" ? customer : null,
    addPhone,
    phone,
    products,
    paymentTerms,
    dueDate,
    paymentMethod,
    paymentBank,
    collectNow,
    amountPaid,
    saleDate,
  }
}

/**
 * El acceso defensivo al `localStorage` vive en `lib/core/storage` desde que la
 * sesión (T6) también lo necesita. Se reexporta para no cambiar el import de
 * las pantallas que ya lo usaban (S49).
 */
export { safeLocalStorage } from "../core/storage"

/**
 * La fecha exacta que se restaura en el formulario: hoy o la guardada, pero
 * nunca una anterior a hoy (S1).
 *
 * Un borrador guardado otro día fechaba la venta en ese día viejo, así que la
 * venta recién registrada no aparecía en el listado por defecto, que es «Hoy».
 * La regla: una `saleDate` anterior a hoy no se restaura y se usa hoy; una de
 * hoy o futura —fechar una venta adelante es una decisión de la dueña— se
 * respeta tal cual.
 *
 * La comparación es por string y por eso exige el formato `YYYY-MM-DD` de
 * `todayLocal`: con ese formato el orden alfabético es el cronológico, y las
 * dos fechas son del calendario **local**, no de UTC. Cualquier otra cosa —otro
 * formato, texto suelto— no se puede comparar así, y se usa hoy en vez de dejar
 * el campo de fecha con un valor que el navegador descarta.
 */
export function saleDateToRestore(saleDate: string, today: string): string {
  if (!LOCAL_DATE.test(saleDate)) return today
  return saleDate < today ? today : saleDate
}

/** El formato de `todayLocal`: cuatro dígitos, mes y día de dos. */
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/

/** El borrador guardado de un canal, o `null` si no hay o no sirve. */
export function readSaleDraft(storage: Storage | null, channel: SaleType): ISaleDraft | null {
  if (storage === null) return null
  try {
    return parseSaleDraft(storage.getItem(saleDraftKey(channel)))
  } catch {
    return null
  }
}

/**
 * Guarda el borrador del canal y dice si quedó guardado. Un fallo de escritura
 * —cuota llena, almacenamiento bloqueado— devuelve `false` y la pantalla sigue
 * funcionando sin borrador.
 */
export function writeSaleDraft(
  storage: Storage | null,
  channel: SaleType,
  draft: ISaleDraft,
): boolean {
  if (storage === null) return false
  try {
    storage.setItem(saleDraftKey(channel), serializeSaleDraft(draft))
    return true
  } catch {
    return false
  }
}

/**
 * Borra el borrador del canal. Es lo único que lo borra, y lo llaman sólo dos
 * acciones: la venta registrada y el «Cancelar» confirmado (S50).
 */
export function clearSaleDraft(storage: Storage | null, channel: SaleType): boolean {
  if (storage === null) return false
  try {
    storage.removeItem(saleDraftKey(channel))
    return true
  } catch {
    return false
  }
}
