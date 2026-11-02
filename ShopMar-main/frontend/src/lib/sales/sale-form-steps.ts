/**
 * Los pasos del formulario de venta (`/sales/new`), en su parte pura (S24, S25,
 * S26).
 *
 * Frontera de pureza, la misma de `sale-form.ts` y `sale-status.ts`:
 * - Todo lo de acá son derivaciones de un estado: qué pasos hay, cuál está en
 *   curso, cuáles quedaron rellenados y qué errores tiene cada uno. No toca
 *   `document` ni `window` ni lee la fecha de hoy por su cuenta; `today` entra
 *   como argumento para que la prueba sea determinista.
 * - El cableado del DOM —botones de encabezado, badges, `hidden` del cuerpo,
 *   pintado de errores— vive en `lib/views/sale-new.ts`, la vista de la SPA.
 *
 * La idea que sostiene el módulo: **el estado de un paso no se guarda, se
 * deriva**. «Rellenado» no es un flag que se enciende con «Siguiente», es la
 * respuesta de `validateStep` en el momento de pintar. Por eso un paso que se
 * había completado y que un cambio posterior invalida —pasar a crédito sin
 * fecha prometida, o borrar el precio— deja de mostrarse rellenado en la
 * siguiente pasada, sin que nadie tenga que acordarse de apagarlo (S26).
 *
 * Lo único que sí se recuerda es el **progreso** (S59): qué pasos se
 * desbloquearon —sólo crece— y cuáles confirmó «Siguiente» —la edición de un
 * campo del paso lo revoca—. Va aparte porque es un hecho de la pantalla y no
 * del formulario: la validez no puede saber si la dueña ya avanzó.
 */

import { validateCustomerChoice } from "./customer-pick"
import { describePayment, toCents } from "./payment"
import { emptyProductRow, type IProductRow } from "./sale-rows"
import {
  validateCollection,
  validateCreditDueDate,
  validatePhone,
  type ISaleConditionState,
  type SaleConditionErrors,
} from "./sale-form"

export type SaleStepId = "sale" | "terms" | "payment" | "summary"

export interface ISaleStep {
  id: SaleStepId
  /** El número que se pinta en el encabezado, de 1 a 4. */
  order: number
  title: string
  hint: string
}

/**
 * Los cuatro pasos, en el orden en que se recorren. Los títulos y las bajadas
 * salen textuales del formulario que ya existía (S26): el orden es la mejora,
 * no un texto nuevo.
 */
export const SALE_STEPS: readonly ISaleStep[] = [
  {
    id: "sale",
    order: 1,
    title: "La venta",
    hint: "Quién compró, qué se llevó y a cuánto.",
  },
  {
    id: "terms",
    order: 2,
    title: "Condición de pago",
    hint: "Cuándo te paga: en el momento o después.",
  },
  {
    id: "payment",
    order: 3,
    title: "Cobro",
    // En crédito la pantalla reemplaza esta bajada por la que explica que cada
    // pago guarda su método y que no hay nada que cobrar acá: el texto de acá es
    // el de contado, que es el estado en el que abre el paso.
    hint: "Cómo se pagó esta venta.",
  },
  {
    id: "summary",
    order: 4,
    title: "Resumen",
    hint: "Suma de lo cargado en pantalla. El total final lo confirma el servidor al registrar.",
  },
]

/** El paso que arranca abierto: sin scroll, es el primero de la pantalla (S24). */
export const FIRST_STEP_ID: SaleStepId = "sale"

export type SaleStepState = "locked" | "pending" | "current" | "complete"

/** Lo que dice la insignia de cada encabezado. */
export const STEP_STATE_LABEL: Record<SaleStepState, string> = {
  // El paso bloqueado todavía no se puede abrir (S59): su encabezado no hace
  // nada, así que la insignia lo dice en vez de dejarlo mudo.
  locked: "Bloqueado",
  // El paso abierto no lleva insignia: se ve abierto y su cuerpo está a la
  // vista, así que «En curso» era un rótulo que no agregaba nada. El estado
  // sigue existiendo para la lógica (`stepState`), sólo no se nombra.
  current: "",
  complete: "Rellenado",
  pending: "Pendiente",
}

/**
 * Todo lo que el formulario sabe leer de sus controles, en un solo objeto. Es
 * lo que las funciones de acá necesitan: no hay estado propio del módulo.
 */
export interface ISaleFormState {
  /** Los campos condicionales que ya valida `sale-form.ts`. */
  condition: ISaleConditionState
  /**
   * El nombre escrito en el campo Cliente. Sólo cuenta en el modo «Cliente
   * nuevo»: en «Cliente existente» el nombre lo pone el servidor desde la ficha
   * del cliente elegido (S43).
   */
  customerName: string
  /** Valor del `<input type="date">` (`yyyy-mm-dd`), nunca un ISO completo. */
  saleDate: string
  /**
   * La lista de mercadería en el orden de la pantalla (S44). El primero es la
   * mercadería principal de la venta y no se puede quitar, así que siempre hay
   * al menos un renglón; el reparto del contrato lo hace `sale-rows.ts`.
   */
  products: readonly IProductRow[]
  /** Banco emisor; sólo se pide con tarjeta, como en el contrato. */
  paymentBank: string
}

export interface IStepValidation {
  valid: boolean
  /** Mismas claves que entiende `paintFieldError` en la pantalla. */
  errors: Record<string, string>
}

/** Los mensajes de los campos que no tenían uno propio, en el español de la casa. */
export const PRODUCT_NAME_REQUIRED_MESSAGE = "Escribí qué se llevó el cliente"
export const SALE_DATE_REQUIRED_MESSAGE = "Elegí la fecha de la venta"
export const COST_REQUIRED_MESSAGE = "Escribí el precio de la mercadería"
export const ROW_NAME_REQUIRED_MESSAGE = "Escribí el nombre de este renglón"
export const ROW_TOTAL_REQUIRED_MESSAGE = "Escribí el importe de este renglón"
export const PAYMENT_METHOD_REQUIRED_MESSAGE = "Elegí cómo se pagó la venta"
export const PAYMENT_BANK_REQUIRED_MESSAGE = "Elegí el banco emisor de la tarjeta"

/**
 * El texto de importe mal escrito es el mismo que usan el modal del listado y
 * la validación del monto recibido: una sola redacción para el mismo error.
 */
const MONEY_INVALID_MESSAGE = describePayment({ state: "invalid" })

const ROW_FIELD = /^items\.(\d+)\.(\w+)$/

/**
 * Los campos de cada paso, por nombre. Es la tabla que usan `stepOfField` y
 * `firstStepWithErrors` para llevar un error al encabezado que le corresponde;
 * los renglones de la lista de productos entran por el patrón `items.<n>.<campo>`
 * del paso «La venta» (`productFieldTarget` en `sale-rows.ts` los ubica).
 *
 * El cliente —escrito o del padrón— es de «La venta» (S43): el bloque del
 * cliente vive ahí, así que sus dos claves y el teléfono se validan en ese
 * paso. «Condición de pago» conserva lo que sólo pide el crédito: la fecha
 * prometida.
 *
 * `product_name` y `cost` son el primer producto de la lista (S44, S45), no dos
 * campos sueltos: la lista es una sola y el contrato pone el primero en el
 * cuerpo de la venta.
 */
const STEP_FIELDS: Record<SaleStepId, readonly string[]> = {
  sale: [
    "customer_id",
    "customer_name",
    "customer_phone",
    "product_name",
    "sale_date",
    "cost",
  ],
  terms: ["due_date"],
  payment: ["payment_method", "payment_bank", "amount_paid"],
  summary: [],
}

/**
 * Valida un paso con **sólo** los campos de ese paso (S25). El envío final no
 * usa esto por partes: pide el paso `summary`, que junta los tres anteriores,
 * y sigue validando todo el formulario como antes (S26).
 */
export function validateStep(
  stepId: SaleStepId,
  form: ISaleFormState,
  today: string,
): IStepValidation {
  const errors = stepErrors(stepId, form, today)
  return { valid: Object.keys(errors).length === 0, errors }
}

function stepErrors(
  stepId: SaleStepId,
  form: ISaleFormState,
  today: string,
): Record<string, string> {
  switch (stepId) {
    case "sale":
      return saleStepErrors(form)
    case "terms":
      return copy(validateCreditDueDate(form.condition, today))
    case "payment":
      return paymentStepErrors(form)
    case "summary":
      // El resumen no tiene campos propios: está completo cuando no falta nada
      // en el resto. Así su insignia dice algo útil —«se puede registrar»— y no
      // queda en un «Pendiente» eterno por no tener un control que llenar.
      return {
        ...saleStepErrors(form),
        ...copy(validateCreditDueDate(form.condition, today)),
        ...paymentStepErrors(form),
      }
  }
}

/**
 * «La venta»: quién compró, qué se llevó y a cuánto. El cliente —escrito a mano
 * o elegido del padrón, según el modo— y el teléfono son campos de este bloque,
 * así que sus reglas también (S28, S43).
 */
function saleStepErrors(form: ISaleFormState): Record<string, string> {
  const errors: Record<string, string> = {}

  // El cliente vive acá en los dos modos (S43): «Cliente nuevo» pide el nombre
  // escrito y «Cliente existente» pide un cliente del padrón. El modo decide
  // cuál de las dos cosas falta, y `validateCustomerChoice` no mezcla la una
  // con la otra.
  merge(
    errors,
    validateCustomerChoice({
      mode: form.condition.customerMode,
      customerId: form.condition.customerId,
      typedName: form.customerName,
    }),
  )

  if (form.saleDate.trim() === "") errors.sale_date = SALE_DATE_REQUIRED_MESSAGE

  // La lista de productos (S44): el primero es la mercadería principal de la
  // venta y no se puede quitar, así que sus dos campos conservan los nombres del
  // contrato (`product_name` y `cost`); los siguientes son renglones de
  // mercadería y se reclaman con el `items.<n>` de siempre. Un renglón vacío
  // frena el paso: la API aceptaría el que ya está cargado, pero dejar un
  // producto en blanco es un error de carga, no una fila opcional.
  const [first = emptyProductRow(), ...extras] = form.products
  if (first.name.trim() === "") errors.product_name = PRODUCT_NAME_REQUIRED_MESSAGE
  assignMoney(errors, "cost", first.price, COST_REQUIRED_MESSAGE)

  extras.forEach((row, index) => {
    // El renglón de pantalla se numera con el primero adentro: el extra que sigue
    // al principal es el 1.
    const screenIndex = index + 1
    if (row.name.trim() === "") errors[`items.${screenIndex}.name`] = ROW_NAME_REQUIRED_MESSAGE
    assignMoney(errors, `items.${screenIndex}.total`, row.price, ROW_TOTAL_REQUIRED_MESSAGE)
  })

  merge(errors, validatePhone(form.condition))
  return errors
}

/**
 * «Cobro»: cómo se pagó. El método y el banco son del contrato; el monto
 * recibido es la regla de la pantalla (S12) y la trae `sale-form.ts`, que sólo
 * la aplica de contado y con el interruptor encendido.
 *
 * En un crédito el paso no pide nada (S57): no hubo cobro en el momento, así que
 * no hay método ni banco que elegir y el paso nace completo. La forma de pago de
 * cada abono se elige al registrarlo, en el modal del listado.
 */
function paymentStepErrors(form: ISaleFormState): Record<string, string> {
  if (form.condition.terms === "credit") return {}

  const errors: Record<string, string> = {}
  // El valor sale de un grupo de radios, así que se lee como texto y se
  // comprueba: un `payment_method` desconocido no es un método elegido.
  const method: string = form.condition.paymentMethod

  if (method !== "cash" && method !== "credit_card") {
    errors.payment_method = PAYMENT_METHOD_REQUIRED_MESSAGE
  } else if (method === "credit_card" && form.paymentBank.trim() === "") {
    errors.payment_bank = PAYMENT_BANK_REQUIRED_MESSAGE
  }

  merge(errors, validateCollection(form.condition))
  return errors
}

/**
 * El avance por los pasos (S59): qué pasos se desbloquearon y cuáles confirmó
 * «Siguiente».
 *
 * `unlocked` sólo crece: editar un paso anterior no vuelve a bloquear los
 * siguientes. `confirmed` sí se revoca, y lo hace la edición de un campo del
 * paso. Las dos cosas son necesarias porque la validez sola no distingue entre
 * «el paso no pide nada» y «la dueña ya pasó por acá»: con Contado, «Condición
 * de pago» y «Cobro» nacen válidos.
 */
export interface ISaleStepProgress {
  unlocked: ReadonlySet<SaleStepId>
  confirmed: ReadonlySet<SaleStepId>
}

/** El progreso con el que abre el formulario: sólo «La venta» desbloqueada. */
export function initialStepProgress(): ISaleStepProgress {
  return { unlocked: new Set([FIRST_STEP_ID]), confirmed: new Set() }
}

/**
 * «Siguiente» en un paso válido: lo confirma y desbloquea el siguiente (S59).
 * No revierte nada, así que volver a confirmar un paso no borra lo ya abierto.
 */
export function confirmStep(
  progress: ISaleStepProgress,
  stepId: SaleStepId,
): ISaleStepProgress {
  const unlocked = new Set(progress.unlocked)
  unlocked.add(stepId)
  const next = nextStepId(stepId)
  if (next !== null) unlocked.add(next)
  const confirmed = new Set(progress.confirmed)
  confirmed.add(stepId)
  return { unlocked, confirmed }
}

/**
 * Editar un campo confirmado devuelve su paso a «Pendiente» (S59) sin tocar el
 * desbloqueo: los pasos que ya se abrieron siguen abiertos.
 */
export function revokeStep(
  progress: ISaleStepProgress,
  stepId: SaleStepId,
): ISaleStepProgress {
  if (!progress.confirmed.has(stepId)) return progress
  const confirmed = new Set(progress.confirmed)
  confirmed.delete(stepId)
  return { unlocked: progress.unlocked, confirmed }
}

/**
 * El estado de un paso. «complete» exige tres cosas: que esté **desbloqueado**,
 * que «Siguiente» lo haya **confirmado** y que sus campos estén bien.
 *
 * Lo de confirmado no es un adorno. Con Contado, «Condición de pago» y «Cobro»
 * no tienen nada que llenar, así que por validez sola nacerían «Rellenado» antes
 * de que la dueña los vea, y el encabezado diría que hizo algo que todavía no
 * hizo. El estado no se guarda en ningún lado: se recalcula en cada pasada, así
 * que un paso confirmado que un cambio posterior invalida deja de estar
 * rellenado (S26). Y el paso bloqueado gana sobre el abierto: sin desbloqueo no
 * hay nada que abrir (S59).
 */
export function stepState(
  stepId: SaleStepId,
  currentStep: SaleStepId | null,
  form: ISaleFormState,
  today: string,
  progress: ISaleStepProgress,
): SaleStepState {
  if (!progress.unlocked.has(stepId)) return "locked"
  if (currentStep === stepId) return "current"
  if (!progress.confirmed.has(stepId)) return "pending"
  return validateStep(stepId, form, today).valid ? "complete" : "pending"
}

export interface ISaleStepView extends ISaleStep {
  state: SaleStepState
  label: string
}

/** Los cuatro encabezados listos para pintar: número, título, bajada, estado y etiqueta. */
export function stepViews(
  currentStep: SaleStepId | null,
  form: ISaleFormState,
  today: string,
  progress: ISaleStepProgress,
): ISaleStepView[] {
  return SALE_STEPS.map((step) => {
    const state = stepState(step.id, currentStep, form, today, progress)
    return { ...step, state, label: STEP_STATE_LABEL[state] }
  })
}

/**
 * Los pasos que el envío necesita confirmados (S61): «La venta», «Condición de
 * pago» y «Cobro». El resumen no está: no tiene campos propios, así que
 * confirmarlo no agrega nada a lo que estos tres ya dicen.
 */
export const SUBMIT_STEP_IDS: readonly SaleStepId[] = ["sale", "terms", "payment"]

/**
 * El primer paso obligatorio que todavía no se confirmó o que dejó de validar
 * (S61): es al que hay que volver, y el que abre el envío cuando llega antes de
 * tiempo —`Enter` en un campo dispara el `submit` aunque el botón esté
 * deshabilitado—.
 */
export function firstUnconfirmedStep(
  progress: ISaleStepProgress,
  form: ISaleFormState,
  today: string,
): SaleStepId | null {
  for (const stepId of SUBMIT_STEP_IDS) {
    if (!progress.confirmed.has(stepId)) return stepId
    if (!validateStep(stepId, form, today).valid) return stepId
  }
  return null
}

/** ¿La venta se puede registrar? Sólo con los pasos 1, 2 y 3 confirmados y válidos (S61). */
export function canSubmit(
  progress: ISaleStepProgress,
  form: ISaleFormState,
  today: string,
): boolean {
  return firstUnconfirmedStep(progress, form, today) === null
}

/** El paso que sigue, o `null` en el último: «Resumen» no tiene «Siguiente» (S25). */
export function nextStepId(stepId: SaleStepId): SaleStepId | null {
  const index = SALE_STEPS.findIndex((step) => step.id === stepId)
  return index === -1 ? null : (SALE_STEPS[index + 1]?.id ?? null)
}

/** A qué paso pertenece un campo, para llevar el foco y el encabezado correctos. */
export function stepOfField(key: string): SaleStepId | null {
  if (ROW_FIELD.test(key)) return "sale"
  for (const step of SALE_STEPS) {
    if (STEP_FIELDS[step.id].includes(key)) return step.id
  }
  return null
}

/**
 * El primer paso —en el orden de la pantalla— que tiene un error. Es el que se
 * abre cuando el envío final encuentra algo en un paso colapsado: un campo
 * oculto no se puede enfocar y el mensaje quedaría invisible.
 */
export function firstStepWithErrors(errors: Record<string, string>): SaleStepId | null {
  const keys = Object.keys(errors)
  for (const step of SALE_STEPS) {
    if (keys.some((key) => stepOfField(key) === step.id)) return step.id
  }
  return null
}

/** Un importe obligatorio: vacío pide el dato, mal escrito usa el texto de dinero. */
function assignMoney(
  errors: Record<string, string>,
  key: string,
  raw: string,
  requiredMessage: string,
): void {
  if (raw.trim() === "") {
    errors[key] = requiredMessage
    return
  }
  if (toCents(raw) === null) errors[key] = MONEY_INVALID_MESSAGE
}

/** Copia los errores sin las claves ausentes del `Partial` de `sale-form.ts`. */
function copy(errors: SaleConditionErrors): Record<string, string> {
  const result: Record<string, string> = {}
  merge(result, errors)
  return result
}

function merge(target: Record<string, string>, source: SaleConditionErrors): void {
  for (const [key, message] of Object.entries(source)) {
    if (message !== undefined) target[key] = message
  }
}
