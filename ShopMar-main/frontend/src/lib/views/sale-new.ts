/**
 * La vista de alta de venta de la SPA (S1, S2).
 *
 * Es el mismo `<script>` de `pages/sales/new.astro` con tres cambios, los mismos
 * de las otras vistas migradas:
 * - El ciclo lo maneja el router: `mountSaleNew(root)` devuelve la limpieza, que
 *   apaga los `timers` del borrador y de las búsquedas y guarda una última vez.
 * - Toda consulta al DOM se hace contra la raíz de la vista (`qs`, `root`), así
 *   que dos vistas no se pisan los `[name]`. El `<template>` del renglón de
 *   mercadería y el `<dialog>` de «Cancelar» también viven dentro de la raíz.
 * - Guardar y cancelar son `navigateTo("/sales")`: la lista se monta sin pedir
 *   el documento. El canal —`?type=live` o `?type=whatsapp`— se lee de la URL en
 *   **cada montaje**, porque la URL es el estado y el documento es uno solo.
 *
 * Lo que la pantalla no puede perder y por eso se conserva tal cual: los cuatro
 * pasos colapsables con su insignia derivada del formulario, la validación por
 * paso y el pintado de errores por campo —incluido el 400 del servidor—, la
 * sanitización del dinero, el borrador por canal con `debounce` y `pagehide`, la
 * fecha que nunca se restaura al pasado, el reparto de mercadería del contrato y
 * el crédito sin forma de pago.
 *
 * No hay esqueleto de arranque: el formulario no espera datos (abre vacío o con
 * el borrador del canal) y todo lo que pinta —total, insignias, resumen— se
 * deriva de sus propios controles, así que no hay una espera que dibujar (S2).
 */

import { on, qs as querySelector, setText } from "../core/dom"
import { ApiError, customersApi, salesApi } from "../core/api"
import { todayLocal } from "../core/date"
import { getErrorMessage, getFieldErrors } from "../core/errors"
import { formatMoney } from "../core/format"
import {
  centsToMoney,
  describePayment,
  evaluatePayment,
  isPaymentAcceptable,
} from "../sales/payment"
import { moneyInputError, sanitizeMoneyInput } from "../sales/money-input"
import {
  DEFAULT_ADD_PHONE,
  DEFAULT_COLLECT_NOW,
  DEFAULT_PAYMENT_TERMS,
  buildSalePayload,
  previewSaleStatus,
  type ISaleConditionState,
} from "../sales/sale-form"
import { customerQueryReady, digitsOnly, phoneMatch, DEFAULT_CUSTOMER_MODE, type CustomerMode } from "../sales/customer-pick"
import {
  FIRST_STEP_ID,
  SALE_STEPS,
  canSubmit,
  confirmStep,
  firstStepWithErrors,
  firstUnconfirmedStep,
  initialStepProgress,
  nextStepId,
  revokeStep,
  stepOfField,
  stepViews,
  validateStep,
  type ISaleFormState,
  type ISaleStepProgress,
  type SaleStepId,
} from "../sales/sale-form-steps"
import {
  clearSaleDraft,
  readSaleDraft,
  safeLocalStorage,
  saleDateToRestore,
  writeSaleDraft,
  type ISaleDraft,
  type DraftCustomerMode,
} from "../sales/sale-draft"
import {
  initialProductRows,
  productFieldTarget,
  productPayload,
  productRowsTotalCents,
  type IProductRow,
} from "../sales/sale-rows"
import type {
  ICustomerResponse,
  ICreateLiveSaleRequest,
  ICreateWhatsappSaleRequest,
  PaymentMethod,
  PaymentTerms,
  SaleType,
} from "../core/types"
import { navigateTo } from "../app/start"
import { wireConfirmDialog } from "../core/confirm-dialog"

export function mountSaleNew(root: HTMLElement): () => void {
  /** El `qs` de la vista: resuelve contra la raíz, nunca contra el documento. */
  const qs = <T extends Element>(sel: string) => querySelector<T>(sel, root)

  const form = qs<HTMLFormElement>("#sale-form")
  const submitBtn = qs<HTMLButtonElement>("button[data-submit]")
  const submitLabelEl = qs<HTMLElement>("[data-submit-label]")
  // El texto que explica por qué el registro está apagado (S61).
  const submitHint = qs<HTMLElement>("[data-submit-hint]")
  const banner = qs<HTMLParagraphElement>("[data-form-banner]")
  const bankBlock = qs<HTMLElement>("[data-bank-block]")
  const bankInput = qs<HTMLSelectElement>('select[name="payment_bank"]')
  // Los controles de la forma de pago de la venta de contado y el aviso que los
  // reemplaza en un crédito (S57): el paso «Cobro» no pide nada en un fiado.
  const paymentFields = qs<HTMLElement>("[data-payment-fields]")
  const creditPaymentNote = qs<HTMLElement>("[data-credit-payment-note]")
  const saleDateInput = qs<HTMLInputElement>("[data-sale-date]")
  // La lista de mercadería (S44): un renglón fijo —el primero, la mercadería
  // principal— y los demás clonados del template. No hay un input único de
  // precio: el total se suma de la lista entera.
  const productList = qs<HTMLElement>("[data-product-list]")
  const addProductBtn = qs<HTMLButtonElement>("[data-add-product]")
  const productTemplate = qs<HTMLTemplateElement>("#product-row-template")
  const balanceMain = qs<HTMLElement>("[data-balance-main]")
  const balanceTotal = qs<HTMLElement>("[data-balance-total]")
  const stepTotal = qs<HTMLElement>("[data-step-total]")
  const formTitle = qs<HTMLElement>("[data-title]")

  // Condición de pago
  const paymentHint = qs<HTMLElement>("[data-payment-hint]")
  const collectBlock = qs<HTMLElement>("[data-collect-block]")
  // El estado con el que queda la venta, dicho en el interruptor de cobro y en
  // el resumen (S62).
  const collectStatus = qs<HTMLElement>("[data-collect-status]")
  const summaryStatus = qs<HTMLElement>("[data-summary-status]")
  const summaryStatusNote = qs<HTMLElement>("[data-summary-status-note]")
  const collectNowInput = qs<HTMLInputElement>("[data-collect-now]")
  const amountBlock = qs<HTMLElement>("[data-amount-block]")
  const amountInput = qs<HTMLInputElement>("[data-amount-paid]")
  const amountFeedback = qs<HTMLElement>("[data-payment-feedback]")
  const creditBlock = qs<HTMLElement>("[data-credit-block]")
  const dueDateInput = qs<HTMLInputElement>("[data-due-date]")
  const customerNameInput = qs<HTMLInputElement>("[data-customer-name]")
  const customerIdInput = qs<HTMLInputElement>("[data-customer-id]")
  // El cliente es opcional en una venta de contado (S63): «Agregar cliente»
  // revela el bloque entero —los dos caminos y el teléfono— y, apagado, lo
  // esconde y lo deja inerte, sin mandar ninguna de las dos claves.
  const customerEnabledInput = qs<HTMLInputElement>("[data-customer-enabled]")
  const customerModes = qs<HTMLElement>("[data-customer-modes]")
  // El cliente tiene dos caminos explícitos (S43): «Cliente nuevo», que pide el
  // nombre escrito, y «Cliente existente», que pide elegir del padrón. Cada
  // botón muestra sólo sus controles y el modo decide qué claves viajan.
  const customerModeButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-customer-mode]"),
  )
  const customerNewPanel = qs<HTMLElement>("[data-customer-new]")
  const customerExistingPanel = qs<HTMLElement>("[data-customer-existing]")
  const customerSearchInput = qs<HTMLInputElement>("[data-customer-search]")
  const customerResults = qs<HTMLElement>("[data-customer-results]")
  const customerSelected = qs<HTMLElement>("[data-customer-selected]")
  const customerSelectedName = qs<HTMLElement>("[data-customer-selected-name]")
  const customerSelectedPhone = qs<HTMLElement>("[data-customer-selected-phone]")
  const customerClearBtn = qs<HTMLButtonElement>("[data-customer-clear]")
  // Los controles del bloque del cliente, para dejarlos inertes cuando el
  // checkbox está apagado. El teléfono va aparte: su propio checkbox decide si
  // se pide (`syncPhoneBlock`).
  const customerFields = [
    customerNameInput,
    customerIdInput,
    customerSearchInput,
    customerClearBtn,
  ].filter((control): control is HTMLInputElement | HTMLButtonElement => control !== null)
  // El teléfono es del camino de «Cliente nuevo»: con un cliente del padrón la
  // venta no manda `customer_phone` (S43).
  const phoneSection = qs<HTMLElement>("[data-phone-section]")
  const addPhoneInput = qs<HTMLInputElement>("[data-add-phone]")
  const phoneBlock = qs<HTMLElement>("[data-phone-block]")
  const phoneInput = qs<HTMLInputElement>("[data-customer-phone]")
  const phoneWarning = qs<HTMLElement>("[data-phone-warning]")
  const phoneWarningName = qs<HTMLElement>("[data-phone-warning-name]")
  const phoneUseCustomerBtn = qs<HTMLButtonElement>("[data-phone-use-customer]")
  const phoneOtherNumberBtn = qs<HTMLButtonElement>("[data-phone-other-number]")
  // El diálogo de «Cancelar» viaja dentro de la plantilla de la vista, así que se
  // cablea acá y no lo encuentra el `<script>` del componente.
  const confirmDialog = wireConfirmDialog(root)

  let selectedCustomer: ICustomerResponse | null = null
  let customerHits: ICustomerResponse[] = []
  // El camino del cliente arranca en «Cliente nuevo» (S43).
  let customerMode: DraftCustomerMode = DEFAULT_CUSTOMER_MODE
  // El cliente dueño del teléfono escrito, tal como lo resolvió la última
  // búsqueda por dígitos (S28): es lo que pinta el aviso y lo que frena el
  // envío mientras no se decida nada.
  let phoneOwner: ICustomerResponse | null = null
  const nameLookup: TLookupSlot = { timer: null, seq: 0 }
  const phoneLookup: TLookupSlot = { timer: null, seq: 0 }

  // El borrador (S49, S50): una entrada de `localStorage` por canal. La
  // pantalla sólo lee y escribe controles; la forma, la versión y la
  // validación viven en `sale-draft.ts`. Sin almacenamiento —modo privado,
  // cuota llena— queda en `null` y el formulario funciona igual, sin
  // persistencia.
  const draftStorage = safeLocalStorage()
  const DRAFT_SAVE_DEBOUNCE_MS = 300
  let draftTimer: number | null = null
  // Apagado en cuanto el borrador se descarta a propósito: la navegación que
  // sigue dispara `pagehide`, y guardar ahí lo resucitaría (S50).
  let draftDiscarded = false

  /**
   * La forma de pago marcada (S57). Los dos radios existen siempre y «Efectivo»
   * viene marcado en el markup, así que la función **siempre** devuelve un valor
   * válido: se tipa con `PaymentMethod` y no con
   * `ICreateLiveSaleRequest["payment_method"]`, que es opcional porque el
   * contrato del payload la omite en la venta a crédito. El tipo dice lo que la
   * pantalla garantiza; el `?? "cash"` queda como red por si el markup cambia.
   */
  function paymentMethodValue(): PaymentMethod {
    const checked = qs<HTMLInputElement>('input[name="payment_method"]:checked')
    return (checked?.value ?? "cash") as PaymentMethod
  }

  function paymentTermsValue(): PaymentTerms {
    const checked = qs<HTMLInputElement>('input[name="payment_terms"]:checked')
    return (checked?.value ?? DEFAULT_PAYMENT_TERMS) as PaymentTerms
  }

const SUBMIT_LABEL: Record<SaleType, string> = {
  live: "Registrar venta de live",
  whatsapp: "Registrar venta en tienda",
}

const PAGE_TITLE: Record<SaleType, string> = {
  live: "Nueva venta de live",
  whatsapp: "Nueva venta en tienda",
}

function submitLabel(canal: SaleType): string {
  return SUBMIT_LABEL[canal]
}


  // El total estimado que pinta el resumen es el mismo número contra el que
  // se valida el monto recibido (S12): si la estimación cambia, el veredicto
  // cambia. Se guarda acá para no recalcularlo en cada lector.
  let estimatedTotalMoney = ""

  // El resumen espeja la factura con lo que esta pantalla puede cargar: la
  // línea «Mercadería» es la suma de la lista de productos y el total es eso
  // (S44, S45). Desde S42 el formulario no tiene artículos aparte, así que no
  // hay una tercera línea que sumar acá.
  /**
   * Sanea un campo de dinero mientras se escribe y pinta su error en vivo
   * (S51). El formulario es `novalidate`, así que el navegador deja escribir
   * letras: acá se sacan y el campo se pone rojo cuando lo que queda no es un
   * importe completo.
   */
  function syncMoneyInput(input: HTMLInputElement): void {
    const sanitized = sanitizeMoneyInput(input.value)
    if (sanitized !== input.value) input.value = sanitized

    const field = input.closest<HTMLElement>(".field")
    const error = field?.querySelector<HTMLElement>("[data-error]") ?? null
    const message = moneyInputError(input.value)
    field?.classList.toggle("field-error", message !== null)
    if (message === null) input.removeAttribute("aria-invalid")
    else input.setAttribute("aria-invalid", "true")
    if (error !== null) {
      setText(error, message ?? "")
      error.hidden = message === null
    }
  }

  function paintBalance(): void {
    const totalCents = productRowsTotalCents(readProducts())
    estimatedTotalMoney = totalCents === null ? "" : centsToMoney(totalCents)
    // El mismo número que el resumen, arriba de «Siguiente» (S46).
    if (stepTotal !== null) {
      setText(stepTotal, totalCents === null ? "—" : formatMoney(centsToMoney(totalCents)))
    }
    if (balanceMain !== null) {
      setText(balanceMain, totalCents === null ? "—" : formatMoney(centsToMoney(totalCents)))
    }
    if (balanceTotal !== null) {
      setText(
        balanceTotal,
        estimatedTotalMoney === "" ? "—" : formatMoney(estimatedTotalMoney),
      )
    }
    syncAmountFeedback()
  }

  // --- Condición de pago (S1, S11, S12) ---

  const PAYMENT_HINT_IMMEDIATE = "Cómo se pagó esta venta."
  // En crédito no hay cobro en el momento, así que el método de la venta deja
  // de pedirse (S57): la bajada explica que el método y el banco de cada abono
  // se eligen al registrarlo, que es donde vive el dato.
  const PAYMENT_HINT_CREDIT =
    "No se cobra ahora: cada pago del libro guarda su propio método y banco."

  const CUSTOMER_SEARCH_DEBOUNCE_MS = 300
  const MAX_CUSTOMER_RESULTS = 8

  // La ayuda del buscador ya no depende del camino elegido: cada modo muestra
  // su propio texto fijo en el marcado y no hay un rótulo que cambiar (S43).

  // Sin resultados en el padrón, la salida es el otro botón: el camino de
  // cliente nuevo es el que registra al cliente (S18, S43).
  const CUSTOMER_EMPTY =
    "No encontramos clientes con eso. Si es nuevo, cambiá a «Cliente nuevo» y escribí su nombre."

  /**
   * Una consulta con `debounce` y guarda de secuencia: `timer` es la espera
   * pendiente y `seq`, la última consulta disparada, para que una respuesta
   * lenta no pise la nueva. El buscador del cliente y el aviso de teléfono
   * repetido son dos espacios independientes con el mismo patrón.
   */
  type TLookupSlot = { timer: number | null; seq: number }

  function scheduleLookup(slot: TLookupSlot, run: () => Promise<void>): void {
    if (slot.timer !== null) window.clearTimeout(slot.timer)
    slot.timer = window.setTimeout(() => {
      slot.timer = null
      void run()
    }, CUSTOMER_SEARCH_DEBOUNCE_MS)
  }

  /**
   * ¿La venta lleva cliente? (S63) De contado lo decide el checkbox, que arranca
   * apagado; a crédito es obligatorio y por eso siempre da `true`. Es una
   * derivación y no un flag guardado: el bloque visible, la validación y las
   * claves del payload salen las tres de acá, así que no se pueden separar.
   */
  function customerEnabled(): boolean {
    // A crédito no se pregunta: una deuda sin cliente no tiene a quién cobrarle
    // y el servidor la rechaza. Se fuerza acá y no con un error aparte porque el
    // control ya lo dice —queda encendido y bloqueado— y el paso pide el nombre
    // con su mensaje de siempre.
    return paymentTermsValue() === "credit" || customerEnabledInput?.checked === true
  }

  function currentCondition(): ISaleConditionState {
    const terms = paymentTermsValue()
    // Sin cliente la venta no manda ninguna de las dos claves (S63): el nombre
    // genérico lo pone el servidor sin crear un cliente, así que la pantalla no
    // lo inventa. Un cliente elegido de antes tampoco viaja: apagar «Agregar
    // cliente» lo deja fuera del payload sin borrar lo cargado, y encenderlo lo
    // devuelve tal cual estaba.
    const withCustomer = customerEnabled()
    const mode: CustomerMode = withCustomer ? customerMode : "none"
    return {
      terms,
      collectNow: terms === "immediate" && collectNowInput?.checked === true,
      amountPaid: amountInput?.value ?? "",
      customerMode: mode,
      customerId: withCustomer ? (selectedCustomer?.id ?? null) : null,
      dueDate: dueDateInput?.value ?? "",
      total: estimatedTotalMoney,
      paymentMethod: paymentMethodValue(),
      // El teléfono es del camino de «Cliente nuevo» (S43): en el modo del
      // padrón el bloque está escondido y el payload no manda la clave.
      addPhone: mode === "new" && addPhoneInput?.checked === true,
      phone: mode === "new" ? (phoneInput?.value ?? "") : "",
      phoneOwnerId: phoneOwner?.id ?? null,
    }
  }

  // El veredicto se pinta en vivo con el mismo texto del modal del listado
  // (`describePayment`); la regla que bloquea el submit vive en el módulo
  // puro, para poder probarla sin DOM.
  function syncAmountFeedback(): void {
    if (amountFeedback === null) return
    if (estimatedTotalMoney === "") {
      setText(amountFeedback, "")
      amountFeedback.classList.remove("is-error", "is-ok")
      return
    }
    const verdict = evaluatePayment(
      estimatedTotalMoney,
      paymentMethodValue(),
      amountInput?.value ?? "",
    )
    const acceptable = isPaymentAcceptable(verdict)
    setText(amountFeedback, describePayment(verdict))
    amountFeedback.classList.toggle("is-error", !acceptable && verdict.state !== "empty")
    amountFeedback.classList.toggle("is-ok", acceptable)
  }

  function syncCollectNow(): void {
    const collectNow = paymentTermsValue() === "immediate" && collectNowInput?.checked === true
    if (amountBlock !== null) amountBlock.hidden = !collectNow
    syncAmountFeedback()
  }

  // --- Teléfono del cliente (S23) ---

  /**
   * El teléfono guardado del cliente elegido se ofrece cuando el checkbox está
   * encendido: es el dato que la dueña quiere ver y, si hace falta, corregir.
   * Nunca pisa un número escrito a mano.
   */
  function prefillPhone(): void {
    if (phoneInput === null || phoneInput.value.trim() !== "") return
    const phone = selectedCustomer?.phone ?? ""
    if (phone.trim() !== "") phoneInput.value = phone
  }

  /**
   * Apagado, el campo queda oculto y deshabilitado —no se envía— y se limpia: al
   * volver a encenderlo se ofrece de nuevo el teléfono del cliente. Encendido es
   * obligatorio y el error se pinta con el `data-error` de siempre.
   */
  function syncPhoneBlock(): void {
    const enabled = addPhoneInput?.checked === true && customerEnabled()
    if (phoneBlock !== null) phoneBlock.hidden = !enabled
    if (phoneInput !== null) {
      phoneInput.disabled = !enabled
      phoneInput.required = enabled
      phoneInput.setAttribute("aria-required", enabled ? "true" : "false")
      if (!enabled) phoneInput.value = ""
    }

    if (enabled) {
      prefillPhone()
      // El número precargado del cliente elegido tampoco es un aviso: la
      // consulta excluye al cliente ya elegido (S28).
      scheduleLookup(phoneLookup, resolvePhoneOwner)
      return
    }

    // Sin campo no hay número que comparar: el aviso se va con él.
    setPhoneOwner(null)
    clearPhoneError()
  }

  function syncTerms(): void {
    const terms = paymentTermsValue()
    for (const option of root.querySelectorAll<HTMLElement>("[data-terms-option]")) {
      option.classList.toggle("pay-option-active", option.dataset.termsOption === terms)
    }
    const isCredit = terms === "credit"
    if (creditBlock !== null) creditBlock.hidden = !isCredit
    if (collectBlock !== null) collectBlock.hidden = isCredit
    // Un crédito no elige método ni banco (S57): los controles del contado se
    // esconden —y se deshabilitan, para que no queden como campos a medio
    // llenar— y en su lugar queda la explicación.
    if (paymentFields !== null) paymentFields.hidden = isCredit
    if (creditPaymentNote !== null) creditPaymentNote.hidden = !isCredit
    for (const control of paymentFields?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "input, select",
    ) ?? []) {
      control.disabled = isCredit
    }
    if (!isCredit) syncBankField()
    if (dueDateInput !== null) {
      dueDateInput.required = isCredit
      dueDateInput.setAttribute("aria-required", isCredit ? "true" : "false")
    }
    if (paymentHint !== null) {
      setText(paymentHint, isCredit ? PAYMENT_HINT_CREDIT : PAYMENT_HINT_IMMEDIATE)
    }
    // Pasar a crédito obliga el cliente (S63): el bloque se enciende y el
    // teléfono, que vive adentro, ajusta su estado con él.
    syncCustomerMode()
    syncPhoneBlock()
    syncCollectNow()
  }

  function clearCustomerResults(): void {
    if (customerResults === null) return
    customerResults.replaceChildren()
    customerResults.hidden = true
    customerHits = []
  }

  function paintCustomerResults(customers: ICustomerResponse[]): void {
    if (customerResults === null) return
    customerHits = customers
    customerResults.replaceChildren()
    if (customers.length === 0) {
      const empty = document.createElement("li")
      empty.className = "customer-empty"
      setText(empty, CUSTOMER_EMPTY)
      customerResults.append(empty)
      customerResults.hidden = false
      return
    }
    for (const customer of customers.slice(0, MAX_CUSTOMER_RESULTS)) {
      const item = document.createElement("li")
      const button = document.createElement("button")
      button.type = "button"
      button.className = "customer-result"
      button.dataset.customerId = customer.id
      const name = document.createElement("span")
      name.className = "customer-result-name"
      setText(name, customer.name)
      const phone = document.createElement("span")
      phone.className = "customer-result-phone"
      setText(phone, customer.phone ?? "Sin teléfono")
      button.append(name, phone)
      item.append(button)
      customerResults.append(item)
    }
    customerResults.hidden = false
  }

  // La búsqueda es contra la API (`q` busca nombre y teléfono) y descarta la
  // respuesta vieja: una consulta lenta no puede pisar el resultado nuevo.
  async function searchCustomers(): Promise<void> {
    const seq = ++nameLookup.seq
    const query = customerSearchInput?.value.trim() ?? ""
    // Una sola letra no es una búsqueda: se limpia la lista y no se consulta.
    if (!customerQueryReady(query)) {
      clearCustomerResults()
      return
    }
    try {
      const { customers } = await customersApi.list({ q: query })
      if (seq !== nameLookup.seq) return
      paintCustomerResults(customers)
    } catch (err) {
      if (seq !== nameLookup.seq || customerResults === null) return
      customerHits = []
      customerResults.replaceChildren()
      const item = document.createElement("li")
      item.className = "customer-empty"
      setText(item, getErrorMessage(err))
      customerResults.append(item)
      customerResults.hidden = false
    }
  }

  /**
   * ¿El teléfono escrito ya es de un cliente? (S28) La comparación es por
   * dígitos —«8888 1234» y «88881234» son el mismo número— contra
   * `GET /customers?q=`, que busca en el nombre **o** en el teléfono: los
   * dígitos traen justo a quien lo tiene guardado, sin endpoint nuevo. El
   * cliente ya elegido queda afuera: su propio teléfono, que el formulario
   * precarga, no es un aviso.
   */
  async function resolvePhoneOwner(): Promise<void> {
    const seq = ++phoneLookup.seq
    const typed = phoneInput?.value ?? ""
    // El teléfono sólo existe en «Cliente nuevo» (S43): en el modo del padrón
    // la venta no manda el número, así que no hay dueño que buscar.
    if (customerMode !== "new" || addPhoneInput?.checked !== true || digitsOnly(typed) === "") {
      setPhoneOwner(null)
      return
    }
    try {
      const { customers } = await customersApi.list({ q: digitsOnly(typed) })
      if (seq !== phoneLookup.seq) return
      setPhoneOwner(phoneMatch(customers, typed, selectedCustomer?.id ?? null))
    } catch {
      // El aviso es una ayuda, no una puerta: si la consulta falla, el número
      // se acepta como siempre y la venta no se traba por la red.
      if (seq !== phoneLookup.seq) return
      setPhoneOwner(null)
    }
  }

  /**
   * Pinta el modo del cliente (S43): los dos botones con su `aria-pressed`, el
   * panel de cada camino y el bloque del teléfono, que es sólo de «Cliente
   * nuevo». El estado que viaja en el payload lo lee `currentCondition` del
   * modo, así que lo que se ve y lo que se manda no pueden separarse.
   */
  /**
   * Pinta el modo del cliente (S43) y su interruptor (S63): el checkbox, los dos
   * botones con su `aria-pressed`, el panel de cada camino y el bloque del
   * teléfono, que es sólo de «Cliente nuevo». Con «Agregar cliente» apagado el
   * bloque entero se esconde y queda inerte —botones y campos deshabilitados—,
   * porque no hay nada que elegir. El estado que viaja en el payload lo lee
   * `currentCondition` de la misma derivación, así que lo que se ve y lo que se
   * manda no pueden separarse.
   */
  function syncCustomerMode(): void {
    const enabled = customerEnabled()
    if (customerEnabledInput !== null) {
      // A crédito queda encendido y bloqueado: apagarlo dejaría una deuda sin
      // cliente. Volver a contado devuelve la decisión a la dueña, con el
      // checkbox como estaba (encendido, porque el crédito lo encendió).
      customerEnabledInput.checked = enabled
      customerEnabledInput.disabled = paymentTermsValue() === "credit"
    }
    if (customerModes !== null) customerModes.hidden = !enabled
    for (const button of customerModeButtons) {
      const active = button.dataset.customerMode === customerMode
      button.setAttribute("aria-pressed", active ? "true" : "false")
      button.disabled = !enabled
    }
    if (customerNewPanel !== null) customerNewPanel.hidden = !enabled || customerMode !== "new"
    if (customerExistingPanel !== null) {
      customerExistingPanel.hidden = !enabled || customerMode !== "existing"
    }
    if (phoneSection !== null) phoneSection.hidden = !enabled || customerMode !== "new"
    for (const control of customerFields) control.disabled = !enabled
  }

  /**
   * Cambia de camino y deja el formulario en un estado limpio: un cliente
   * elegido del padrón no sobrevive a «Cliente nuevo» —si quedara, el aviso de
   * teléfono repetido lo tomaría como el cliente de la venta y su propio
   * número no se avisaría (S28)— y el buscador se vacía al volver (S43).
   */
  function setCustomerMode(mode: DraftCustomerMode): void {
    if (customerMode === mode) return
    customerMode = mode
    releaseSelectedCustomer()
    syncCustomerMode()
    if (customerMode === "existing") {
      // En el modo del padrón el teléfono no se pide: el aviso se va con él.
      setPhoneOwner(null)
      syncPhoneBlock()
      paintSteps()
      customerSearchInput?.focus()
      return
    }
    syncPhoneBlock()
    paintSteps()
    customerNameInput?.focus()
  }

  /**
   * Pinta el aviso de teléfono repetido (S28) y deja el formulario en ese
   * estado: el error del campo y el bloqueo del envío los deriva
   * `validatePhone` de `phoneOwnerId`, que sale de acá.
   */
  function setPhoneOwner(owner: ICustomerResponse | null): void {
    phoneOwner = owner
    if (phoneWarning !== null) phoneWarning.hidden = owner === null
    if (phoneWarningName !== null) setText(phoneWarningName, owner?.name ?? "")
    // El aviso cambia la validez del paso, y el estado se deriva: hay que
    // repintarlo a mano, igual que al elegir un cliente.
    paintSteps()
  }

  /**
   * Limpia el error del teléfono. Un aviso resuelto o un campo vacío lo dejan
   * sin sentido, y el que decide si vuelve es la próxima validación.
   */
  function clearPhoneError(): void {
    const error = qs<HTMLElement>('[data-error="customer_phone"]')
    if (error !== null) error.hidden = true
    phoneInput?.closest(".field")?.classList.remove("field-error")
    phoneInput?.removeAttribute("aria-invalid")
  }

  /**
   * «Usar sus datos» (S28): el dueño del número pasa a ser el cliente de la
   * venta. Ese cliente ya está en el padrón, así que elegirlo es cambiar al
   * camino «Cliente existente» (S43): la venta viaja con `customer_id` y su
   * teléfono ya está guardado en su ficha, sin `customer_phone`.
   */
  function usePhoneOwner(): void {
    if (phoneOwner === null) return
    const owner = phoneOwner
    setPhoneOwner(null)
    clearPhoneError()
    setCustomerMode("existing")
    selectCustomer(owner)
  }

  /**
   * «Escribir otro número» (S28): se vacía el teléfono y el foco vuelve al
   * campo. El checkbox sigue encendido —el número se sigue pidiendo— y el
   * aviso desaparece porque ya no hay número que comparar.
   */
  function writeOtherPhone(): void {
    setPhoneOwner(null)
    clearPhoneError()
    if (phoneInput === null) return
    phoneInput.value = ""
    phoneInput.focus()
  }

  function selectCustomer(customer: ICustomerResponse): void {
    selectedCustomer = customer
    if (customerIdInput !== null) customerIdInput.value = customer.id
    if (customerSelected !== null) customerSelected.hidden = false
    if (customerSelectedName !== null) setText(customerSelectedName, customer.name)
    if (customerSelectedPhone !== null) {
      setText(customerSelectedPhone, customer.phone ?? "Sin teléfono")
    }
    // Lo escrito se va con el cliente elegido: la venta ya tiene dueño y el
    // nombre escrito es del otro camino, así que no se mezclan (S43).
    if (customerNameInput !== null) customerNameInput.value = ""
    if (customerSearchInput !== null) customerSearchInput.value = ""
    clearCustomerResults()
    // Elegir el cliente resuelve el error que quedó del intento anterior.
    const error = qs<HTMLElement>('[data-error="customer_id"]')
    if (error !== null) error.hidden = true
    customerIdInput?.closest(".field")?.classList.remove("field-error")
    // Si el cliente ya tiene teléfono y el checkbox está encendido, se ofrece.
    if (addPhoneInput?.checked === true) prefillPhone()
    // El aviso del teléfono depende de quién está elegido: elegir al dueño del
    // número lo resuelve y elegir a otro lo vuelve a plantear (S28).
    scheduleLookup(phoneLookup, resolvePhoneOwner)
    // Elegir el cliente resuelve el paso aunque no haya pasado por sus controles:
    // el estado se deriva, así que hay que repintarlo a mano.
    paintSteps()
  }

  /**
   * Suelta el cliente del padrón sin mover el foco: lo comparten el «Quitar»
   * del chip y el cambio de modo, que necesitan el mismo vaciado (S43).
   */
  function releaseSelectedCustomer(): void {
    selectedCustomer = null
    if (customerIdInput !== null) customerIdInput.value = ""
    if (customerSelected !== null) customerSelected.hidden = true
    if (customerSearchInput !== null) customerSearchInput.value = ""
    clearCustomerResults()
  }

  function clearSelectedCustomer(): void {
    releaseSelectedCustomer()
    // «Quitar» deja el modo en su estado vacío: en «Cliente existente» vuelve el
    // buscador vacío con el foco y no cae al nombre escrito, que es del otro
    // camino (S43).
    customerSearchInput?.focus()
    // Sin cliente elegido, el número escrito puede volver a ser de otro.
    scheduleLookup(phoneLookup, resolvePhoneOwner)
    paintSteps()
  }

  function syncBankField(): void {
  const isCard = paymentMethodValue() === "credit_card"
  for (const option of root.querySelectorAll<HTMLElement>("[data-pay-option]")) {
    const selected = option.dataset.payOption === paymentMethodValue()
    option.classList.toggle("pay-option-active", selected)
  }
  if (bankBlock !== null) bankBlock.hidden = !isCard
  if (bankInput !== null) {
    bankInput.disabled = !isCard
    bankInput.required = isCard
    if (!isCard) bankInput.value = ""
  }
  // El método cambia el veredicto del monto recibido (efectivo admite vuelto;
  // tarjeta exige exacto), así que el aviso se repinta al cambiarlo.
  syncAmountFeedback()
}

function resolveChannel(): SaleType {
  return new URLSearchParams(window.location.search).get("type") === "whatsapp"
    ? "whatsapp"
    : "live"
}

function applyChannel(canal: SaleType): void {
  if (form !== null) form.dataset.canal = canal
  const hiddenInput = qs<HTMLInputElement>("[data-canal-input]")
  if (hiddenInput !== null) hiddenInput.value = canal
  if (submitLabelEl !== null) setText(submitLabelEl, submitLabel(canal))
  if (formTitle !== null) setText(formTitle, PAGE_TITLE[canal])
  paintBalance()
}

/**
 * La lista de mercadería (S44), en el orden de la pantalla y del payload. El
 * primer renglón es la mercadería principal de la venta y no se puede quitar,
 * así que la lista arranca con uno y nunca baja de ahí.
 */
function productRows(): HTMLElement[] {
  if (productList === null) return []
  return Array.from(productList.querySelectorAll<HTMLElement>("[data-item-row]"))
}

/**
 * Lo que dicen los controles, que es lo único que leen los módulos puros. Sin
 * renglones devuelve la lista inicial en vez de una vacía: el estado del
 * formulario siempre tiene el primero, y así la validación tiene qué reclamar.
 */
function readProducts(): IProductRow[] {
  const rows = productRows().map((row) => ({
    name: row.querySelector<HTMLInputElement>("[data-row-name]")?.value ?? "",
    price: row.querySelector<HTMLInputElement>("[data-row-price]")?.value ?? "",
  }))
  return rows.length > 0 ? rows : initialProductRows()
}

/**
 * Renumera los renglones. La numeración es la posición en la lista y se
 * recalcula al agregar y al quitar, así que nunca queda un hueco y el renglón
 * que la API señala por índice coincide con el que se ve.
 */
function syncProductRows(): void {
  productRows().forEach((row, index) => {
    const label = row.querySelector<HTMLElement>("[data-row-index]")
    if (label !== null) setText(label, `Producto ${index + 1}`)
  })
}

/** «Agregar producto»: clona un renglón al final y deja el foco en su nombre. */
function addProductRow(): void {
  const row = createProductRow()
  if (row === null) return
  paintBalance()
  paintSteps()
  // Agregar un renglón también es editar el formulario: el borrador lo tiene
  // que ver aunque nadie escriba nada en él (S49).
  scheduleDraftSave()
  row.querySelector<HTMLInputElement>("[data-row-name]")?.focus()
}

/**
 * Agrega un renglón al final de la lista sin mover el foco. Lo comparten
 * «Agregar producto» —que después enfoca el nombre— y la restauración del
 * borrador, que crea los renglones que le faltan sin robarle el foco a nadie
 * (S49).
 */
function createProductRow(): HTMLElement | null {
  if (productList === null || productTemplate === null) return null
  const row = productTemplate.content.firstElementChild?.cloneNode(true) as HTMLElement | null
  if (row === null) return null
  productList.append(row)
  syncProductRows()
  return row
}

/** «Quitar»: saca el renglón. El primero no lleva el botón, así que aquí no cae. */
function removeProductRow(row: HTMLElement): void {
  row.remove()
  syncProductRows()
  paintBalance()
  paintSteps()
  // Quitar un renglón también cambia lo que el borrador tiene que guardar.
  scheduleDraftSave()
}

function clearFieldErrors(): void {
  if (banner !== null) banner.hidden = true
  for (const field of root.querySelectorAll<HTMLElement>("[data-error]")) {
    field.hidden = true
  }
  for (const wrapped of root.querySelectorAll<HTMLElement>(".field-error")) {
    wrapped.classList.remove("field-error")
  }
  for (const invalid of root.querySelectorAll<HTMLElement>("[aria-invalid]")) {
    invalid.removeAttribute("aria-invalid")
  }
}

/**
 * Pinta un error sobre el renglón de la lista de productos que le toca y dice
 * si lo encontró. Los tres vocabularios de clave que pueden llegar —los del
 * contrato para el primer producto (`product_name`, `cost`), los de esta
 * validación (`items.<n>`) y los del 400 del servidor (`additional_items.<j>`)—
 * los traduce `productFieldTarget`, que es el único que sabe el corrimiento
 * entre la lista de la pantalla y los adicionales del payload.
 */
function paintProductError(key: string, message: string): boolean {
  const target = productFieldTarget(key)
  if (target === null) return false
  const row = productRows()[target.index]
  if (row === undefined) return false
  const input = row.querySelector<HTMLInputElement>(`[name="${target.field}"]`)
  const error = row.querySelector<HTMLElement>(`[data-error="${target.field}"]`)
  if (input === null || error === null) return false
  const wrapper = input.closest<HTMLElement>(".field")
  wrapper?.classList.add("field-error")
  input.setAttribute("aria-invalid", "true")
  setText(error, message)
  error.hidden = false
  return true
}

function paintFieldError(key: string, message: string): boolean {
  if (paintProductError(key, message)) return true

  const input = qs<HTMLInputElement>(`[name="${key}"]`)
  const error = qs<HTMLElement>(`[data-error="${key}"]`)
  if (input === null || error === null) return false
  const wrapper = input.closest<HTMLElement>(".field")
  wrapper?.classList.add("field-error")
  input.setAttribute("aria-invalid", "true")
  setText(error, message)
  error.hidden = false
  return true
}

// --- Pasos colapsables (S24, S25, S26) ---

type TStepDom = {
  section: HTMLElement | null
  toggle: HTMLButtonElement
  body: HTMLElement
  badge: HTMLElement
  badgeLabel: HTMLElement
}

// Lo que se recuerda es cuál paso está abierto y el progreso del formulario. El
// resto —quién quedó rellenado— se deriva del formulario en cada pintada: un
// flag guardado se quedaría encendido cuando un cambio posterior invalida el
// paso (S26).
let openStep: SaleStepId | null = FIRST_STEP_ID
// Qué pasos se desbloquearon —sólo crece— y cuáles confirmó «Siguiente» —la
// edición de un campo del paso lo revoca— (S59). Con Contado, «Condición de
// pago» y «Cobro» no tienen nada que llenar, así que sin esto nacerían
// rellenados antes de que la dueña pase por ellos (S25, S26).
let progress: ISaleStepProgress = initialStepProgress()

const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)"

/**
 * El acomodo de escritorio (S60): desde 1024px el resumen es una columna fija y
 * deja de ser un paso. `matchMedia` puede no existir —navegadores viejos,
 * jsdom— y sin él el formulario se queda en móvil, que es el acomodo que ya
 * existía y el que funciona angosto.
 */
const desktopMedia: MediaQueryList | null = window.matchMedia?.(DESKTOP_MEDIA_QUERY) ?? null
let desktopLayout = desktopMedia?.matches === true

function isDesktopLayout(): boolean {
  return desktopLayout
}

/**
 * Cruza el punto de quiebre: decide si el resumen es un paso o la columna fija y
 * repinta con la misma pasada de siempre, que ya deriva todo de acá (S60).
 */
function applyLayout(): void {
  desktopLayout = desktopMedia?.matches === true
  if (form !== null) form.dataset.layout = desktopLayout ? "desktop" : "mobile"
  paintSteps()
}

const STEP_DOM = new Map<SaleStepId, TStepDom>()
for (const step of SALE_STEPS) {
  const toggle = qs<HTMLButtonElement>(`[data-step-toggle="${step.id}"]`)
  const body = qs<HTMLElement>(`[data-step-body="${step.id}"]`)
  const badge = qs<HTMLElement>(`[data-step-badge="${step.id}"]`)
  const badgeLabel = qs<HTMLElement>(`[data-step-badge-label="${step.id}"]`)
  if (toggle === null || body === null || badge === null || badgeLabel === null) continue
  STEP_DOM.set(step.id, {
    section: toggle.closest<HTMLElement>(`[data-step="${step.id}"]`),
    toggle,
    body,
    badge,
    badgeLabel,
  })
}

/**
 * Lo que el formulario sabe leer de sus controles, en un objeto: es la única
 * entrada de las funciones puras del módulo de pasos. La lista de productos va
 * en el orden de la pantalla, que es el orden del payload.
 */
function currentFormState(): ISaleFormState {
  return {
    condition: currentCondition(),
    customerName: customerNameInput?.value ?? "",
    saleDate: saleDateInput?.value ?? "",
    products: readProducts(),
    paymentBank: bankInput?.value ?? "",
  }
}

/**
 * Pinta los cuatro encabezados: número, título, bajada e insignia. El estado de
 * cada paso se recalcula contra el formulario y el progreso, así que un paso
 * confirmado que un cambio posterior invalida —pasar a crédito y quedarse sin
 * cliente, borrar el precio— deja de estarlo en la siguiente pasada.
 */
/**
 * Dice con qué estado queda la venta (S62): en la tarjeta de cobro y en el
 * resumen, que es donde se confirma antes de registrar. Se deriva del
 * formulario —condición, interruptor y monto— igual que el payload, así que
 * cambiar de condición o de cobro lo actualiza en la misma pasada.
 */
function paintStatus(state: ISaleFormState): void {
  const completed = previewSaleStatus(state.condition) === "completed"

  if (collectStatus !== null) {
    const text = completed
      ? "La venta se registrará como completada."
      : "La venta quedará pendiente."
    if (collectStatus.textContent?.trim() !== text) collectStatus.textContent = text
    collectStatus.dataset.state = completed ? "completed" : "pending"
  }

  if (summaryStatus !== null) {
    const text = completed ? "Completada" : "Pendiente"
    if (summaryStatus.textContent?.trim() !== text) summaryStatus.textContent = text
    summaryStatus.dataset.state = completed ? "completed" : "pending"
  }

  if (summaryStatusNote !== null) {
    const note = completed
      ? "Se va a registrar como completada: el cobro se guarda junto con la venta."
      : state.condition.terms === "credit"
        ? "Se va a registrar como pendiente: una venta a crédito nace debiendo."
        : "Se va a registrar como pendiente: todavía no la cobraste."
    if (summaryStatusNote.textContent?.trim() !== note) summaryStatusNote.textContent = note
  }
}

function paintSteps(): void {
  const state = currentFormState()
  const today = todayLocal()
  for (const view of stepViews(openStep, state, today, progress)) {
    const parts = STEP_DOM.get(view.id)
    if (parts === undefined) continue
    // En escritorio el resumen no es un paso (S60): su cuerpo queda siempre a
    // la vista y su encabezado de botón no se usa.
    const column = isDesktopLayout() && view.id === "summary"
    const locked = !column && view.state === "locked"
    const open = !locked && view.state === "current"
    parts.toggle.setAttribute("aria-expanded", open ? "true" : "false")
    // El encabezado de un paso bloqueado no abre nada (S59): el botón queda
    // inerte y el CSS lo atenúa.
    parts.toggle.disabled = locked || column
    if (parts.section !== null) {
      if (locked) parts.section.dataset.locked = "true"
      else delete parts.section.dataset.locked
    }
    parts.body.hidden = column ? false : !open
    parts.badge.dataset.state = view.state
    // El paso abierto no muestra insignia (`current` viene con etiqueta vacía).
    parts.badge.hidden = view.label === ""
    setText(parts.badgeLabel, view.label)
  }
  syncSubmitState(state, today)
  paintStatus(state)
}

/**
 * El botón de registrar (S61): se habilita sólo con los pasos 1, 2 y 3
 * confirmados con «Siguiente» y válidos, y el texto de al lado dice qué falta
 * mientras está apagado. Se recalcula en `paintSteps`, que ya corre al montar,
 * en cada edición y al avanzar.
 */
function syncSubmitState(state: ISaleFormState, today: string): void {
  const ready = canSubmit(progress, state, today)
  if (submitBtn !== null) submitBtn.disabled = !ready
  if (submitHint !== null) submitHint.hidden = ready
}

/**
 * Abre un paso y cierra el resto: hay un solo paso abierto a la vez, y su
 * cuerpo es el que se ve. `null` deja todos cerrados. Abrir o cerrar no
 * completa nada (S59): el único camino que confirma un paso es «Siguiente».
 */
function setOpenStep(stepId: SaleStepId | null): void {
  if (stepId !== null && !progress.unlocked.has(stepId)) return
  openStep = stepId
  paintSteps()
}

/** Limpia los errores de un paso, sin tocar los de los demás. */
function clearStepErrors(scope: HTMLElement | null): void {
  if (scope === null) return
  for (const error of scope.querySelectorAll<HTMLElement>("[data-error]")) error.hidden = true
  for (const wrapped of scope.querySelectorAll<HTMLElement>(".field-error")) {
    wrapped.classList.remove("field-error")
  }
  for (const invalid of scope.querySelectorAll<HTMLElement>("[aria-invalid]")) {
    invalid.removeAttribute("aria-invalid")
  }
}

function paintErrors(errors: Record<string, string>): void {
  for (const [key, message] of Object.entries(errors)) paintFieldError(key, message)
}

/**
 * Lleva el foco al primer campo pintado del paso. Hace falta después de
 * validar: el mensaje de un campo que está fuera de la pantalla no se ve, y en
 * el teléfono el usuario tiene que poder corregir sin buscar.
 */
function focusFirstInvalid(stepId: SaleStepId): void {
  const parts = STEP_DOM.get(stepId)
  if (parts === undefined) return
  const marked = parts.body.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (marked === null) return
  // El error del cliente elegido se pinta sobre el campo oculto que lleva el
  // `name` que espera la API: el foco va al buscador del padrón, que es el
  // control que la dueña puede corregir y el que el modo «Cliente existente»
  // deja a la vista (S43).
  const target =
    marked instanceof HTMLInputElement && marked.type === "hidden"
      ? parts.body.querySelector<HTMLElement>("[data-customer-search]")
      : marked
  if (target === null) return
  target.focus()
}

/**
 * Abre el primer paso con errores (en el orden de la pantalla) y enfoca el
 * campo que falló. Es lo que hace visible un error que quedó en un paso
 * colapsado: un control oculto no se puede enfocar ni mostrar su mensaje.
 */
function revealStepWithErrors(errors: Record<string, string>): void {
  const stepId = firstStepWithErrors(errors)
  if (stepId === null) return
  setOpenStep(stepId)
  focusFirstInvalid(stepId)
}

/**
 * «Siguiente»: valida **sólo** los campos de su paso (S25). Si están bien, el
 * paso queda «Rellenado» —lo dice `paintSteps`, que se deriva del formulario—,
 * se cierra y se abre el siguiente. Si falta algo, pinta los errores, deja el
 * paso abierto y no avanza.
 */
function advance(stepId: SaleStepId): void {
  const parts = STEP_DOM.get(stepId)
  clearStepErrors(parts === undefined ? null : parts.body)
  const validation = validateStep(stepId, currentFormState(), todayLocal())
  if (!validation.valid) {
    paintErrors(validation.errors)
    paintSteps()
    focusFirstInvalid(stepId)
    return
  }
  // «Siguiente» es el único camino que confirma el paso y desbloquea el
  // siguiente (S59).
  progress = confirmStep(progress, stepId)
  const next = nextStepId(stepId)
  if (next === null) {
    paintSteps()
    return
  }
  // En escritorio el resumen no es un paso (S60): al confirmar «Cobro» se
  // cierran los pasos y el foco va al botón que acaba de habilitarse, que es lo
  // que sigue en la pantalla.
  if (isDesktopLayout() && next === "summary") {
    setOpenStep(null)
    if (submitBtn !== null && !submitBtn.disabled) submitBtn.focus()
    return
  }
  setOpenStep(next)
  // El foco sigue al paso que se abre: el botón que se acaba de colapsar
  // desaparece y en el teléfono el paso nuevo queda a la vista sin buscar.
  STEP_DOM.get(next)?.toggle.focus()
}

/**
 * Abre el paso que falta y, si sus campos tienen algo mal, los pinta y enfoca el
 * primero: el mismo cuidado que el envío tiene con un paso colapsado (S26),
 * ahora también para el que todavía no se confirmó (S61).
 */
function revealUnconfirmedStep(stepId: SaleStepId): void {
  setOpenStep(stepId)
  const validation = validateStep(stepId, currentFormState(), todayLocal())
  if (!validation.valid) paintErrors(validation.errors)
  paintSteps()
  focusFirstInvalid(stepId)
}

// --- Borrador del formulario (S49, S50) ---

/**
 * Lo que el formulario está mostrando, con la forma del borrador. Es la única
 * lectura del DOM que alimenta la persistencia: el módulo puro recibe este
 * objeto y no consulta controles.
 */
function currentDraft(): ISaleDraft {
  return {
    customerMode,
    customerName: customerNameInput?.value ?? "",
    customer:
      selectedCustomer === null
        ? null
        : {
            id: selectedCustomer.id,
            name: selectedCustomer.name,
            phone: selectedCustomer.phone,
          },
    addPhone: addPhoneInput?.checked === true,
    phone: phoneInput?.value ?? "",
    products: readProducts().map((row) => ({ name: row.name, price: row.price })),
    paymentTerms: paymentTermsValue(),
    dueDate: dueDateInput?.value ?? "",
    paymentMethod: paymentMethodValue(),
    paymentBank: bankInput?.value ?? "",
    collectNow: collectNowInput?.checked === true,
    amountPaid: amountInput?.value ?? "",
    saleDate: saleDateInput?.value ?? "",
  }
}

/** El canal del formulario abierto: es la mitad de la clave del borrador. */
function draftChannel(): SaleType {
  return form?.dataset.canal === "whatsapp" ? "whatsapp" : "live"
}

function stopDraftTimer(): void {
  if (draftTimer === null) return
  window.clearTimeout(draftTimer)
  draftTimer = null
}

/**
 * Guarda ahora, sin esperar el `debounce`. Es lo que corre al salir de la
 * página: irse a media palabra no puede perder la última tecla (S49).
 */
function saveDraftNow(): void {
  if (draftDiscarded) return
  stopDraftTimer()
  writeSaleDraft(draftStorage, draftChannel(), currentDraft())
}

/**
 * Guardado con `debounce` (~300 ms): un nombre no se escribe al almacenamiento
 * una vez por tecla, y el `pagehide` completa lo que quedó pendiente (S49).
 */
function scheduleDraftSave(): void {
  if (draftDiscarded) return
  stopDraftTimer()
  draftTimer = window.setTimeout(() => {
    draftTimer = null
    writeSaleDraft(draftStorage, draftChannel(), currentDraft())
  }, DRAFT_SAVE_DEBOUNCE_MS)
}

/**
 * Descarta el borrador a propósito: es lo único que lo borra, y sólo lo llaman
 * la venta registrada y el «Cancelar» confirmado (S50). Apaga también el
 * guardado, porque la navegación que sigue dispara `pagehide`: sin esto se
 * volvería a guardar lo que se acaba de borrar.
 */
function discardDraft(): void {
  draftDiscarded = true
  stopDraftTimer()
  clearSaleDraft(draftStorage, draftChannel())
}

/**
 * Repinta el borrador guardado (S49). Corre cuando el modo del cliente, la
 * condición de pago y la lista de productos ya están cableados, porque usa las
 * mismas funciones que responden a sus controles: así lo restaurado queda en
 * el mismo estado que si la dueña hubiera tocado cada campo.
 *
 * Un borrador que no sirve —no está, es de otra versión o está roto— llega
 * como `null` y el formulario se queda como estaba, vacío (S50).
 */
function restoreDraft(): void {
  const draft = readSaleDraft(draftStorage, draftChannel())
  if (draft === null) return

  // Mercadería: se crean los renglones que falten y se quitan los que sobren
  // hasta tener los del borrador, en su orden, y recién entonces se escriben
  // los valores. El primero nunca se quita: la venta no puede quedarse sin
  // mercadería (S44).
  const rows = productRows()
  while (rows.length < draft.products.length) {
    const created = createProductRow()
    if (created === null) break
    rows.push(created)
  }
  while (rows.length > draft.products.length && rows.length > 1) {
    rows.pop()?.remove()
  }
  rows.forEach((row, index) => {
    const product = draft.products[index]
    if (product === undefined) return
    const name = row.querySelector<HTMLInputElement>("[data-row-name]")
    const price = row.querySelector<HTMLInputElement>("[data-row-price]")
    if (name !== null) name.value = product.name
    if (price !== null) price.value = product.price
  })
  syncProductRows()
  paintBalance()

  // El cliente: primero el camino —qué panel se ve— y después su contenido.
  // El chip del cliente elegido se repinta con lo guardado, sin pedir la ficha
  // a la API, que es justo lo que el borrador evita (S49).
  customerMode = draft.customerMode
  // El interruptor (S63) no se guarda en el borrador —S49 no lo conoce—, así que
  // se deduce de lo que el borrador sí guardó: si traía un cliente elegido o un
  // nombre escrito, la venta llevaba cliente. Sin esto, volver a la pantalla
  // dejaba el bloque apagado y la venta se guardaba sin el cliente que ya estaba
  // cargado, en silencio.
  if (customerEnabledInput !== null) {
    customerEnabledInput.checked =
      draft.customerMode === "existing" || draft.customerName.trim() !== ""
  }
  syncCustomerMode()
  if (draft.customerMode === "existing" && draft.customer !== null) {
    selectCustomer({
      id: draft.customer.id,
      name: draft.customer.name,
      phone: draft.customer.phone,
      note: null,
      created_at: "",
      updated_at: "",
    })
  } else if (customerNameInput !== null) {
    customerNameInput.value = draft.customerName
  }

  if (addPhoneInput !== null) addPhoneInput.checked = draft.addPhone
  if (phoneInput !== null) phoneInput.value = draft.phone
  // `syncPhoneBlock` esconde el bloque con el modo del padrón y, con el
  // checkbox apagado, vacía el campo; encendido respeta el número restaurado.
  syncPhoneBlock()

  // Condición de pago: se marcan los radios y se llaman las mismas funciones
  // que responde el `change`, para que lo que depende de ellas —el
  // vencimiento, el banco, sus `disabled` y `required`— quede en su sitio.
  setRadioValue("payment_terms", draft.paymentTerms)
  syncTerms()
  if (dueDateInput !== null) dueDateInput.value = draft.dueDate

  setRadioValue("payment_method", draft.paymentMethod)
  syncBankField()
  // El banco va después de `syncBankField`, que vacía el select al volver a
  // efectivo: escribirlo antes lo perdería.
  if (bankInput !== null && draft.paymentMethod === "credit_card") {
    bankInput.value = draft.paymentBank
  }

  if (collectNowInput !== null) collectNowInput.checked = draft.collectNow
  if (amountInput !== null) amountInput.value = draft.amountPaid
  syncCollectNow()

  if (saleDateInput !== null) {
    // La fecha guardada sólo se restaura si no es del pasado (S1): un borrador
    // de otro día fechaba la venta atrás y no aparecía en el listado «Hoy».
    // La regla vive en `saleDateToRestore`, en la parte pura.
    saleDateInput.value = saleDateToRestore(draft.saleDate, todayLocal())
  }
  // Lo derivado —el total del paso, las dos líneas del resumen y las
  // insignias— no viaja en el borrador: se repinta desde lo restaurado.
  paintBalance()
  paintSteps()
}

/** Marca el radio de un grupo por su valor, si existe. */
function setRadioValue(name: string, value: string): void {
  const radio = qs<HTMLInputElement>(
    `input[name="${name}"][value="${value}"]`,
  )
  if (radio !== null) radio.checked = true
}

/**
 * Pregunta con el `ConfirmDialog` de la pantalla y resuelve con la respuesta. El
 * mensaje va en el marcado —es fijo, no depende de la venta— y el resto —foco,
 * `Escape`, backdrop— lo resuelve el `<dialog>` nativo.
 *
 * El cableado ya lo hizo `wireConfirmDialog` al montar: el `<script>` del
 * componente corre una vez por documento y no encuentra un diálogo que llega
 * dentro de una plantilla. Sin diálogo la respuesta es «no»: se queda en el
 * formulario, que es la salida segura.
 */
function confirmDiscard(): Promise<boolean> {
  if (confirmDialog === null) return Promise.resolve(false)
  return confirmDialog.showConfirm()
}

/**
 * «Cancelar» no navega directamente (S50): pregunta primero, porque irse del
 * formulario es descartar todo lo cargado. Confirmar borra el borrador y sale
 * a `/sales`; cancelar deja la pantalla y el borrador como estaban.
 */
async function handleCancel(event: Event): Promise<void> {
  event.preventDefault()
  const confirmed = await confirmDiscard()
  if (!confirmed) return
  discardDraft()
  navigateTo("/sales")
}

async function handleSubmit(event: Event): Promise<void> {
  event.preventDefault()
  if (form === null || submitBtn === null) return

  clearFieldErrors()
  const canal = form.dataset.canal === "whatsapp" ? "whatsapp" : "live"

  // «Enter» en un campo dispara el envío aunque el botón esté deshabilitado, así
  // que el envío no puede confiar en él (S61). Con un paso de los tres sin
  // confirmar no se llama a la API: se abre el primero que falta y se sale por
  // ahí. Es también el camino que hace visible el error de un paso colapsado.
  const missing = firstUnconfirmedStep(progress, currentFormState(), todayLocal())
  if (missing !== null) {
    revealUnconfirmedStep(missing)
    return
  }

  // El envío valida **todo** el formulario, abiertos o colapsados los pasos
  // (S26). El paso «Resumen» no tiene campos propios: junta los errores de los
  // otros tres, así que su validación es la del formulario completo.
  //
  // La validación nativa del navegador no sirve para esto: un campo dentro de
  // un paso colapsado está en `display: none`, no se puede enfocar y su globo
  // no aparece, así que el formulario va con `novalidate` y los mensajes los
  // pinta esta pantalla. El 400 del servidor sigue siendo la red de seguridad
  // (D-003) y también se pinta por campo.
  const everything = validateStep("summary", currentFormState(), todayLocal())
  if (!everything.valid) {
    paintErrors(everything.errors)
    revealStepWithErrors(everything.errors)
    return
  }

  const condition = currentCondition()

  // La lista de mercadería entra en el cuerpo con el reparto del contrato
  // (S45): el primer producto es `product_name` + `cost` y los demás viajan en
  // `additional_items` con `kind: "merchandise"`. Es el mismo cuerpo que
  // armaban las dos listas de antes; lo que cambió es de dónde se carga.
  const base: ICreateLiveSaleRequest = {
    customer_name: qs<HTMLInputElement>('input[name="customer_name"]')?.value ?? "",
    ...productPayload(readProducts()),
    payment_method: paymentMethodValue(),
  }

  const saleDate = saleDateInput?.value ?? ""
  if (saleDate !== "") base.sale_date = `${saleDate}T00:00:00.000Z`

  if (paymentMethodValue() === "credit_card" && bankInput?.value !== "") {
    base.payment_bank = bankInput.value
  }

  const payload = buildSalePayload(base, condition)

  submitBtn.disabled = true
  if (submitLabelEl !== null) setText(submitLabelEl, "Guardando…")
  let created: { id: string } | null = null
  try {
    created =
      canal === "whatsapp"
        ? await salesApi.createWhatsapp(payload as ICreateWhatsappSaleRequest)
        : await salesApi.createLive(payload)
  } catch (err) {
    const message = err instanceof ApiError ? err.message : ""
    const fieldErrors = getFieldErrors(message)
    let paintedAny = false
    for (const [key, detail] of Object.entries(fieldErrors)) {
      paintedAny = paintFieldError(key, detail) || paintedAny
    }
    if (banner !== null) {
      setText(banner, getErrorMessage(err))
      banner.hidden = false
    }
    if (!paintedAny) window.scrollTo({ top: 0, behavior: "smooth" })
    return
  } finally {
    if (submitLabelEl !== null) setText(submitLabelEl, submitLabel(canal))
    // La pintada devuelve el botón a lo que dicen los pasos: sigue habilitado
    // sólo si los tres siguen confirmados y válidos (S61).
    paintSteps()
  }

  if (created !== null) {
    // La venta ya está registrada: el borrador se borra antes de salir, para
    // que la próxima visita empiece limpia. Un envío fallido no llega acá y
    // conserva lo cargado (S50).
    discardDraft()
    navigateTo("/sales")
  }
}

if (form !== null) on(form, "submit", handleSubmit)
applyChannel(resolveChannel())

/**
 * El paso del control que se acaba de editar (S59). Los campos con clave del
 * contrato se ubican con `stepOfField` —«Monto recibido» vive en la tarjeta de
 * «Condición de pago» pero se valida en «Cobro»— y el resto cae en la sección
 * donde está: los renglones de mercadería, el buscador del padrón y los radios
 * de la condición, que no llevan clave de payload.
 */
function editedStep(target: EventTarget | null): SaleStepId | null {
  if (!(target instanceof HTMLElement)) return null
  const named =
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement
      ? stepOfField(target.name)
      : null
  if (named !== null) return named
  const stepId = target.closest<HTMLElement>("[data-step]")?.dataset.step
  if (stepId === "sale" || stepId === "terms" || stepId === "payment") return stepId
  return null
}

/**
 * Editar un campo devuelve su paso a «Pendiente» (S59) y repinta las insignias,
 * que son una derivación del formulario y no un flag guardado (S26).
 */
function handleFormEdit(event: Event): void {
  const stepId = editedStep(event.target)
  if (stepId !== null) progress = revokeStep(progress, stepId)
  paintSteps()
}

// «Cancelar» pide confirmación (S50): el enlace conserva su `href` para que
// sin JavaScript siga siendo la salida a `/sales`.
const cancelLink = qs<HTMLAnchorElement>("[data-cancel-sale]")
if (cancelLink !== null) on(cancelLink, "click", (event) => void handleCancel(event))

// Pasos: el encabezado toglea su bloque y «Siguiente» valida y avanza. Cualquier
// cambio del formulario repinta las insignias, porque el estado de cada paso es
// una derivación y no un flag guardado (S26).
for (const [stepId, parts] of STEP_DOM) {
  on(parts.toggle, "click", () => {
    // Un paso bloqueado no se abre (S59): el encabezado ya viene `disabled`, y
    // esto es la red por si el marcado cambia.
    if (!progress.unlocked.has(stepId)) return
    setOpenStep(openStep === stepId ? null : stepId)
  })
}
for (const button of root.querySelectorAll<HTMLButtonElement>("[data-step-next]")) {
  const stepId = button.dataset.stepNext as SaleStepId | undefined
  if (stepId === undefined) continue
  on(button, "click", () => advance(stepId))
}
if (form !== null) {
  on(form, "input", handleFormEdit)
  on(form, "change", handleFormEdit)
}

for (const radio of root.querySelectorAll<HTMLInputElement>(
  'input[name="payment_method"][data-payment-method]',
)) {
  on(radio, "change", syncBankField)
}
syncBankField()

/**
 * La lista de productos (S44): «Agregar producto» clona un renglón al final y
 * «Quitar» lo saca. Los dos repintan el resumen y las insignias, porque el
 * total y la validez de «La venta» se derivan de la lista entera.
 */
if (addProductBtn !== null) on(addProductBtn, "click", addProductRow)
if (productList !== null) {
  on(productList, "click", (event) => {
    const target = event.target as HTMLElement
    const removeBtn = target.closest<HTMLButtonElement>("[data-remove-item]")
    const row = removeBtn === null ? null : removeBtn.closest<HTMLElement>("[data-item-row]")
    if (removeBtn !== null && row !== null) removeProductRow(row)
  })
  on(productList, "input", (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    if (!target.matches("[data-row-price]")) return
    syncMoneyInput(target)
    paintBalance()
  })
}

// Condición de pago: radios, interruptor de cobro y cliente registrado.
for (const radio of root.querySelectorAll<HTMLInputElement>("[data-payment-terms-input]")) {
  on(radio, "change", syncTerms)
}
// El monto recibido es dinero igual que los precios: mismas letras fuera y
// mismo borde rojo mientras no cierre (S51).
if (amountInput !== null) {
  on(amountInput, "input", () => {
    syncMoneyInput(amountInput)
    paintBalance()
  })
}
if (collectNowInput !== null) {
  collectNowInput.checked = DEFAULT_COLLECT_NOW
  on(collectNowInput, "change", syncCollectNow)
}
if (amountInput !== null) on(amountInput, "input", syncAmountFeedback)
if (addPhoneInput !== null) {
  addPhoneInput.checked = DEFAULT_ADD_PHONE
  on(addPhoneInput, "change", syncPhoneBlock)
}
// «Agregar cliente» (S63): encenderlo o apagarlo cambia lo que se ve, lo que se
// valida y lo que viaja. El repintado de los pasos corre también desde el
// `change` del formulario, que es el que lo convierte en «Pendiente» otra vez.
if (customerEnabledInput !== null) {
  on(customerEnabledInput, "change", () => {
    syncCustomerMode()
    syncPhoneBlock()
    paintSteps()
  })
}
syncPhoneBlock()
if (phoneInput !== null) {
  // El mismo debounce del buscador: el padrón no se consulta en cada tecla (S28).
  on(phoneInput, "input", () => scheduleLookup(phoneLookup, resolvePhoneOwner))
  // Al dejar el campo se resuelve ya, sin esperar el debounce.
  on(phoneInput, "change", () => void resolvePhoneOwner())
}
if (phoneUseCustomerBtn !== null) on(phoneUseCustomerBtn, "click", usePhoneOwner)
if (phoneOtherNumberBtn !== null) on(phoneOtherNumberBtn, "click", writeOtherPhone)
if (dueDateInput !== null) dueDateInput.min = todayLocal()

if (customerSearchInput !== null) {
  // Mismo patrón que el aviso del teléfono: espera el debounce y descarta la
  // respuesta vieja (S43).
  on(customerSearchInput, "input", () => scheduleLookup(nameLookup, searchCustomers))
  // Enter en el buscador busca ya; sin el preventDefault el formulario de
  // venta se enviaría a medio llenar.
  on(customerSearchInput, "keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Enter") return
    event.preventDefault()
    void searchCustomers()
  })
}
if (customerResults !== null) {
  on(customerResults, "click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-customer-id]")
    if (button === null) return
    const found = customerHits.find((customer) => customer.id === button.dataset.customerId)
    if (found !== undefined) selectCustomer(found)
  })
}
if (customerClearBtn !== null) on(customerClearBtn, "click", clearSelectedCustomer)

// El modo del cliente (S43): los dos botones cambian el camino y lo que se ve,
// y el payload lo decide el mismo estado.
for (const button of customerModeButtons) {
  const mode = button.dataset.customerMode
  if (mode !== "new" && mode !== "existing") continue
  on(button, "click", () => setCustomerMode(mode))
}

if (saleDateInput !== null) saleDateInput.value = todayLocal()

syncProductRows()
paintBalance()
syncTerms()
syncCustomerMode()
syncPhoneBlock()

// El borrador se restaura recién acá, cuando el modo del cliente, la lista de
// productos y la condición de pago ya responden: restaurar antes dejaría los
// valores en controles que todavía no saben mostrarlos (S49).
restoreDraft()

// El acomodo inicial (S60) y su repintado al cruzar los 1024px: el resumen pasa
// de columna fija a paso 4 y el resto del formulario no se toca.
const onLayoutChange = (): void => applyLayout()
desktopMedia?.addEventListener("change", onLayoutChange)
applyLayout()

// Guardado del borrador: `debounce` en cada `input`/`change` y una última
// escritura al salir de la página, para que irse a media palabra no pierda la
// última tecla (S49).
if (form !== null) {
  on(form, "input", scheduleDraftSave)
  on(form, "change", scheduleDraftSave)
}
window.addEventListener("pagehide", saveDraftNow)

return () => {
  for (const slot of [nameLookup, phoneLookup]) {
    if (slot.timer !== null) window.clearTimeout(slot.timer)
  }
  // El temporizador pendiente se completa en vez de perderse: es la misma
  // promesa que hace el `pagehide` para la navegación del cliente.
  saveDraftNow()
  window.removeEventListener("pagehide", saveDraftNow)
  desktopMedia?.removeEventListener("change", onLayoutChange)
}
}
