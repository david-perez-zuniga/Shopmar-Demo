/**
 * La condición de pago del formulario de venta (`/sales/new`), en su parte pura.
 *
 * Frontera de pureza (el mismo split de `sale-status.ts`):
 * - Todo lo de acá son derivaciones de un estado: los valores por defecto, el
 *   formato de la fecha prometida, la validación por campo y el cuerpo que se
 *   manda a la API. No toca `document` ni `window` ni lee la fecha de hoy por su
 *   cuenta: `today` entra como argumento para que la prueba sea determinista.
 * - El cableado del DOM —radios, buscador de clientes, interruptor de cobro,
 *   pintado de errores— vive en `lib/views/sale-new.ts`, la vista de la SPA.
 *
 * El formulario es uno solo para `live` y `whatsapp`: esto no depende del canal.
 */

import type { ICreateLiveSaleRequest, PaymentMethod, PaymentTerms } from "../core/types"
import {
  PHONE_TAKEN_MESSAGE,
  customerSelection,
  phoneOwnerBlocks,
  type CustomerMode,
} from "./customer-pick"
import { centsToMoney, describePayment, evaluatePayment, isPaymentAcceptable, toCents } from "./payment"

/** La venta nace de contado; el crédito es una elección explícita (S1, S11). */
export const DEFAULT_PAYMENT_TERMS: PaymentTerms = "immediate"

/** «¿Cobraste ahora?» arranca apagado: la venta de contado nace pendiente como antes (S12). */
export const DEFAULT_COLLECT_NOW = false

/**
 * El checkbox «Agregar número de teléfono» arranca apagado (S23): el teléfono
 * es una decisión explícita y no una obligación de toda venta.
 */
export const DEFAULT_ADD_PHONE = false

export const DUE_DATE_REQUIRED_MESSAGE = "Elegí la fecha de pago prometida"
export const DUE_DATE_PAST_MESSAGE = "La fecha prometida no puede ser anterior a hoy"
export const AMOUNT_REQUIRED_MESSAGE = "Escribí el monto que cobraste"
export const PHONE_REQUIRED_MESSAGE = "Escribí el número de teléfono"

/**
 * El estado del bloque «Condición de pago», leído de los controles.
 *
 * `total` es la misma estimación que pinta el resumen —la suma de los precios de
 * la lista de productos (S44)—: es contra ese número que se valida el monto
 * recibido, no contra el precio del primer producto.
 */
export interface ISaleConditionState {
  terms: PaymentTerms
  /** Contado: si se reveló el monto recibido. */
  collectNow: boolean
  /** Monto recibido tal como se escribió; se normaliza recién en el payload. */
  amountPaid: string
  /**
   * Cuál de los dos caminos del cliente está abierto (S43). Es parte del estado
   * y no sólo de la pantalla porque decide qué claves viajan en el payload y
   * qué pide «La venta»: la regla se prueba sin DOM.
   */
  customerMode: CustomerMode
  /** Cliente del padrón elegido; `null` mientras no se eligió ninguno. */
  customerId: string | null
  /** Valor del `<input type="date">` (`yyyy-mm-dd`), nunca un ISO completo. */
  dueDate: string
  /** Total estimado del resumen, en el formato monetario de la casa. */
  total: string
  paymentMethod: PaymentMethod
  /** Contado y crédito: si se pidió el teléfono del cliente (S23). */
  addPhone: boolean  /** Teléfono tal como se escribió; se recorta recién en el payload. */
  phone: string
  /**
   * El cliente dueño del teléfono escrito, tal como lo resolvió la última
   * búsqueda por dígitos (S28). `null` mientras no haya aviso; si sigue este
   * cliente y no es el elegido, el campo `customer_phone` frena el formulario.
   */
  phoneOwnerId: string | null
}

/** Errores por campo, con las mismas claves que lee `paintFieldError`. */
export type SaleConditionErrors = Partial<
  Record<"customer_id" | "customer_name" | "due_date" | "amount_paid" | "customer_phone", string>
>

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * El `<input type="date">` entrega `yyyy-mm-dd` y la API espera ISO 8601 UTC:
 * la fecha prometida se interpreta a medianoche UTC, igual que `sale_date` en el
 * resto del formulario. Devuelve `null` si no hay una fecha real que convertir,
 * así el validador no arma un `due_date` que el servidor va a rechazar.
 */
export function dueDateToIso(raw: string): string | null {
  const trimmed = raw.trim()
  if (DATE_ONLY.exec(trimmed) === null) return null
  const iso = `${trimmed}T00:00:00.000Z`
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  // `2026-02-31` parsea al 3 de marzo; el ida y vuelta descarta esa fecha.
  return parsed.toISOString().slice(0, 10) === trimmed ? iso : null
}

/**
 * Validación de la condición de pago antes de mandar. Sólo devuelve los errores
 * que la API también rechazaría, más el monto recibido del mostrador, que es una
 * regla de la pantalla (S12) y no del contrato.
 *
 * El **cliente** no está acá: su campo es uno solo y vive en «La venta», y la
 * regla —un cliente del padrón o un nombre escrito— no depende de la condición,
 * así que la resuelve `customer-pick.ts` (`validateCustomerChoice`).
 *
 * La regla está partida en tres piezas —teléfono, crédito y cobro— porque el
 * formulario por pasos (S25) valida un bloque por vez: cada paso llama a la
 * pieza que le toca y no a todas. `validateSaleCondition` sigue siendo la
 * puerta única del envío, así el resultado completo no se duplica en ningún
 * lado.
 */
export function validateSaleCondition(
  state: ISaleConditionState,
  today: string,
): SaleConditionErrors {
  return {
    ...validatePhone(state),
    ...validateCreditDueDate(state, today),
    ...validateCollection(state),
  }
}

/**
 * El teléfono (S23) se valida en el camino de «Cliente nuevo», que es donde el
 * checkbox existe (S43): con un cliente del padrón la venta no manda
 * `customer_phone` —su número ya está en su ficha— y no hay nada que validar.
 * Con el checkbox encendido el campo es obligatorio, y apagado no se mira.
 * Encendido, además, un número que ya es de otro cliente frena el envío hasta
 * que se decida algo —usar sus datos o escribir otro número— (S28).
 */
export function validatePhone(state: ISaleConditionState): SaleConditionErrors {
  if (state.customerMode !== "new") return {}
  if (!state.addPhone) return {}
  if (state.phone.trim() === "") return { customer_phone: PHONE_REQUIRED_MESSAGE }
  if (phoneOwnerBlocks(state.phoneOwnerId, state.customerId)) {
    return { customer_phone: PHONE_TAKEN_MESSAGE }
  }
  return {}
}

/**
 * Crédito: la fecha prometida (S2, S11). En contado no pide nada; lo cargado de
 * un modo anterior se ignora, igual que en el payload. El cliente lo pide «La
 * venta», que es donde está su campo (S30).
 */
export function validateCreditDueDate(
  state: ISaleConditionState,
  today: string,
): SaleConditionErrors {
  if (state.terms !== "credit") return {}
  const dueIso = dueDateToIso(state.dueDate)
  if (dueIso === null) return { due_date: DUE_DATE_REQUIRED_MESSAGE }
  if (state.dueDate.trim() < today) return { due_date: DUE_DATE_PAST_MESSAGE }
  return {}
}

/**
 * Cobro en el momento (S12): sólo de contado y sólo con el interruptor
 * encendido. En crédito no se valida monto —no hubo cobro (S2)— y con el cobro
 * apagado tampoco: la venta nace pendiente.
 */
export function validateCollection(state: ISaleConditionState): SaleConditionErrors {
  if (state.terms !== "immediate" || !state.collectNow) return {}
  const verdict = evaluatePayment(state.total, state.paymentMethod, state.amountPaid)
  if (verdict.state === "empty") return { amount_paid: AMOUNT_REQUIRED_MESSAGE }
  if (isPaymentAcceptable(verdict)) return {}
  // El mismo texto del modal del listado: efectivo con vuelto, tarjeta exacta.
  return { amount_paid: describePayment(verdict) }
}

/**
 * Arma el cuerpo del alta agregando la condición de pago al cuerpo base que ya
 * conoce el formulario.
 *
 * - El cliente lo decide el **modo** (S43) mediante `customerSelection`:
 *   «Cliente nuevo» manda `customer_name`; «Cliente existente» manda
 *   `customer_id`. Nunca las dos claves juntas, y cambiar de modo no deja
 *   restos del anterior en el payload.
 * - Contado sin cobro: no agrega nada más; la API aplica su `payment_terms:
 *   "immediate"` por defecto. Por eso tampoco se manda `payment_terms` explícito.
 * - Contado con cobro: `status: "completed"` + `amount_paid` normalizado, que es
 *   lo que hace que «cobrado» signifique algo (S9, S12).
 * - Crédito: `payment_terms: "credit"` + `due_date`, y **sin `payment_method` ni
 *   `payment_bank`**: una venta fiada no se cobra en el momento, así que no hay
 *   forma de pago que elegir; la de cada abono se registra con el pago (S57).
 *   Nunca `status` ni `amount_paid`: una venta a crédito nace pendiente y se
 *   cobra con pagos.
 * - `customer_phone` (S23) viaja sólo en el camino de «Cliente nuevo» y sólo si
 *   el checkbox está encendido y quedó un teléfono escrito.
 */
/**
 * El estado con el que va a nacer la venta (S62), para poder decirlo en pantalla
 * antes de registrarla.
 *
 * Es la misma regla que aplica `buildSalePayload` —contado con «Cobraste ahora»
 * se guarda completada; sin cobrar, y siempre a crédito, nace pendiente—, sacada
 * a una función para que la tarjeta de cobro y el resumen no la repitan ni la
 * puedan contradecir. La prueba compara las dos para que no se separen.
 */
export function previewSaleStatus(
  state: Pick<ISaleConditionState, "terms" | "collectNow">,
): "completed" | "pending" {
  return state.terms === "immediate" && state.collectNow ? "completed" : "pending"
}

export function buildSalePayload(
  base: ICreateLiveSaleRequest,
  state: ISaleConditionState,
): ICreateLiveSaleRequest {
  const payload: ICreateLiveSaleRequest = { ...base }
  // La condición y el modo deciden qué claves viajan: se descarta cualquier
  // resto del cuerpo base para que cambiar de opción no deje claves viejas.
  delete payload.customer_name
  delete payload.customer_id
  delete payload.payment_terms
  delete payload.due_date
  delete payload.status
  delete payload.amount_paid
  delete payload.customer_phone
  // La categoría salió del formulario (S47): la clave no viaja aunque el cuerpo
  // base la traiga, y la API la guarda como arreglo vacío.
  delete payload.category

  const choice = customerSelection({
    mode: state.customerMode,
    customerId: state.customerId,
    typedName: base.customer_name,
  })
  if (choice.customer_id !== undefined) payload.customer_id = choice.customer_id
  if (choice.customer_name !== undefined) payload.customer_name = choice.customer_name

  if (state.terms === "credit") {
    payload.payment_terms = "credit"
    // El método y el banco son de la venta de contado: en crédito no hubo cobro
    // y cada abono guarda los suyos (S57). Se descartan aunque el cuerpo base
    // los traiga —el selector quedó elegido de un cambio de condición—, porque
    // la API los rechaza en un crédito. El servidor guarda `cash` como valor de
    // registro de una columna que es obligatoria.
    delete payload.payment_method
    delete payload.payment_bank
    const dueIso = dueDateToIso(state.dueDate)
    if (dueIso !== null) payload.due_date = dueIso
  } else if (state.collectNow) {
    const cents = toCents(state.amountPaid)
    if (cents !== null) {
      payload.status = "completed"
      payload.amount_paid = centsToMoney(cents)
    }
  }

  applyPhone(payload, state)
  return payload
}

/**
 * Agrega el teléfono al cuerpo, recortado. Es del camino «Cliente nuevo»
 * (S43): con un cliente del padrón la venta no manda `customer_phone`. El valor
 * se escribe a propósito y por eso reemplaza el que el cliente tuviera cargado
 * (S23); vacío o con el checkbox apagado, la clave no existe en el payload.
 */
function applyPhone(payload: ICreateLiveSaleRequest, state: ISaleConditionState): void {
  if (state.customerMode !== "new") return
  if (!state.addPhone) return
  const phone = state.phone.trim()
  if (phone !== "") payload.customer_phone = phone
}
