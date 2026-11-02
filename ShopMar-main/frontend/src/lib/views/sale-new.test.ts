import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mountSaleNew } from "./sale-new"
import { ApiError } from "../core/api"
import { todayLocal } from "../core/date"
import { formatMoney } from "../core/format"
import { CUSTOMER_NAME_REQUIRED_MESSAGE } from "../sales/customer-pick"
import { PRODUCT_NAME_REQUIRED_MESSAGE } from "../sales/sale-form-steps"
import {
  SALE_DRAFT_VERSION,
  readSaleDraft,
  saleDraftKey,
  serializeSaleDraft,
  type ISaleDraft,
} from "../sales/sale-draft"

/**
 * La vista de alta de venta de la SPA (S1, S2).
 *
 * Se monta el markup REAL de `components/views/SaleNewView.astro` —el que el
 * router clona dentro de `.app-view`— y se mira lo que ve la dueña y lo que
 * viaja a la API. La migración no cambia el comportamiento, así que lo que se
 * fija acá es el de siempre: los cuatro pasos con su insignia, la validación
 * por paso y el pintado de errores por campo —incluido el 400 del servidor—, la
 * sanitización del dinero, el borrador por canal y el reparto de mercadería.
 *
 * Las expresiones de Astro del markup (`{stepCopy("sale").order}`, `{todayLocal()}`)
 * no las expande jsdom: lo que se afirma de los encabezados es lo que la vista
 * escribe al pintar —cuál está abierto y qué dice cada insignia—; los textos
 * fijos del paso los cubre el humo sobre el build.
 */
const mocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  customersList: vi.fn(),
  createLive: vi.fn(),
  createWhatsapp: vi.fn(),
}))

vi.mock("../app/start", () => ({ navigateTo: mocks.navigateTo }))

vi.mock("../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/api")>()
  return {
    ...actual,
    customersApi: { ...actual.customersApi, list: mocks.customersList },
    salesApi: {
      ...actual.salesApi,
      createLive: mocks.createLive,
      createWhatsapp: mocks.createWhatsapp,
    },
  }
})

const VIEW = resolve("src/components/views/SaleNewView.astro")
const STEPS = ["sale", "terms", "payment", "summary"] as const

const cleanups: Array<() => void> = []

/**
 * El markup de la vista, cortado después del frontmatter, como el router. El
 * `ConfirmDialog.astro` es un componente de build que jsdom no expande, así que
 * se agrega su diálogo con el mismo marcado que cablea la vista.
 */
function mountView(): HTMLElement {
  const source = readFileSync(VIEW, "utf8")
  const frontmatterEnd = source.indexOf("---", source.indexOf("---") + 3) + 3
  const root = document.createElement("div")
  root.className = "app-view"
  root.setAttribute("data-view", "sale-new")
  root.innerHTML = source.slice(frontmatterEnd)
  root.insertAdjacentHTML(
    "beforeend",
    '<dialog class="confirm-dialog">' +
      '<h3 id="confirm-title">¿Descartar los datos de esta venta?</h3>' +
      '<p id="confirm-message"></p>' +
      '<button type="button" value="cancel">Cancelar</button>' +
      '<button type="submit" value="confirm">Descartar</button>' +
      "</dialog>",
  )
  document.body.append(root)
  cleanups.push(mountSaleNew(root))
  return root
}

function hook<T extends Element = HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (element === null) throw new Error(`falta ${selector} en la vista de alta de venta`)
  return element
}

/** Escribe en un control como lo haría la dueña: valor + `input` que burbujea. */
function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function choose(radio: HTMLInputElement): void {
  radio.checked = true
  radio.dispatchEvent(new Event("change", { bubbles: true }))
}

function form(root: HTMLElement): HTMLFormElement {
  return hook<HTMLFormElement>(root, "#sale-form")
}

/** El texto que explica por qué el registro está apagado (S61). */
const SUBMIT_HINT =
  "Completá los pasos 1, 2 y 3 con «Siguiente» para registrar la venta."

function submitBtn(root: HTMLElement): HTMLButtonElement {
  return hook<HTMLButtonElement>(root, "button[data-submit]")
}

function submitHint(root: HTMLElement): HTMLElement {
  return hook(root, "[data-submit-hint]")
}

/** Recorre «Siguiente» en los pasos 1, 2 y 3, como lo hace la dueña (S61). */
function confirmSteps(root: HTMLElement): void {
  for (const step of ["sale", "terms", "payment"] as const) {
    hook<HTMLButtonElement>(root, `[data-step-next="${step}"]`).click()
  }
}

/**
 * Stub de `matchMedia` para el punto de quiebre de escritorio (S60), con la
 * forma del que usa `shell/install-prompt.test.ts` más un `change` que la prueba
 * dispara. Devuelve la función que cruza el punto de quiebre.
 */
function stubViewport(width: "mobile" | "desktop"): () => void {
  const listeners: Array<() => void> = []
  const media = {
    matches: width === "desktop",
    media: "(min-width: 1024px)",
    onchange: null,
    addEventListener: (_type: string, handler: () => void) => listeners.push(handler),
    removeEventListener: (_type: string, handler: () => void) => {
      const index = listeners.indexOf(handler)
      if (index !== -1) listeners.splice(index, 1)
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }
  vi.stubGlobal("matchMedia", () => media)
  return () => {
    media.matches = !media.matches
    for (const handler of [...listeners]) handler()
  }
}

function firstRow(root: HTMLElement): HTMLElement {
  return hook(root, "[data-item-row]")
}

/**
 * La venta mínima que la API acepta con cliente: el bloque del cliente encendido
 * —desde S63 es opcional y arranca apagado—, el nombre, la mercadería, el precio
 * y efectivo.
 */
function fillMinimalSale(root: HTMLElement, price = "1250.50"): void {
  hook<HTMLInputElement>(root, "[data-customer-enabled]").click()
  typeInto(hook<HTMLInputElement>(root, "[data-customer-name]"), "María González")
  const row = firstRow(root)
  typeInto(hook<HTMLInputElement>(row, "[data-row-name]"), "Jean clásico")
  typeInto(hook<HTMLInputElement>(row, "[data-row-price]"), price)
}

function errorFor(scope: HTMLElement, key: string): HTMLElement {
  return hook(scope, `[data-error="${key}"]`)
}

function dialog(root: HTMLElement): HTMLDialogElement {
  return hook<HTMLDialogElement>(root, "dialog.confirm-dialog")
}

/** Deja correr la promesa de la API y el repintado que dispara. */
function flush(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0))
}

function draft(overrides: Partial<ISaleDraft> = {}): ISaleDraft {
  return {
    customerMode: "new",
    customerName: "",
    customer: null,
    addPhone: false,
    phone: "",
    products: [{ name: "", price: "" }],
    paymentTerms: "immediate",
    dueDate: "",
    paymentMethod: "cash",
    paymentBank: "",
    collectNow: false,
    amountPaid: "",
    saleDate: todayLocal(),
    ...overrides,
  }
}

function seedDraft(channel: "live" | "whatsapp", overrides: Partial<ISaleDraft> = {}): void {
  window.localStorage.setItem(saleDraftKey(channel), serializeSaleDraft(draft(overrides)))
}

function storedDraft(channel: "live" | "whatsapp"): ISaleDraft | null {
  return readSaleDraft(window.localStorage, channel)
}

beforeEach(() => {
  window.history.replaceState(null, "", "/sales/new?type=live")
  window.localStorage.clear()
  mocks.navigateTo.mockReset()
  mocks.customersList.mockReset()
  mocks.customersList.mockResolvedValue({ customers: [] })
  mocks.createLive.mockReset()
  mocks.createLive.mockResolvedValue({ id: "sale-nueva" })
  mocks.createWhatsapp.mockReset()
  mocks.createWhatsapp.mockResolvedValue({ id: "sale-nueva" })
  // jsdom no trae `showModal` ni emite el `close` del `<dialog>`: se reemplazan
  // por su efecto observable, que es el que la vista consulta.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "")
  }
  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
    value?: string,
  ) {
    this.removeAttribute("open")
    if (value !== undefined) this.returnValue = value
  }
})

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  document.body.replaceChildren()
})

describe("los cuatro pasos y sus insignias (S24, S25, S26, S59)", () => {
  it("monta los cuatro pasos con sólo «La venta» abierta y las demás bloqueadas", () => {
    const root = mountView()

    expect(
      Array.from(root.querySelectorAll<HTMLElement>("[data-step-toggle]")).map(
        (toggle) => toggle.dataset.stepToggle,
      ),
    ).toEqual([...STEPS])

    expect(hook(root, '[data-step-toggle="sale"]').getAttribute("aria-expanded")).toBe("true")
    expect(hook<HTMLElement>(root, '[data-step-body="sale"]').hidden).toBe(false)
    for (const step of STEPS.slice(1)) {
      expect(hook(root, `[data-step-toggle="${step}"]`).getAttribute("aria-expanded")).toBe(
        "false",
      )
      expect(hook<HTMLElement>(root, `[data-step-body="${step}"]`).hidden).toBe(true)
    }

    // El paso abierto no lleva insignia: se ve abierto y su cuerpo está a la vista.
    expect(hook<HTMLElement>(root, '[data-step-badge="sale"]').hidden).toBe(true)
    for (const step of STEPS.slice(1)) {
      expect(hook(root, `[data-step-badge-label="${step}"]`).textContent).toBe("Bloqueado")
    }
  })

  it("«Siguiente» valida sólo su paso: pinta sus errores y no avanza", () => {
    const root = mountView()
    // Con «Agregar cliente» encendido el nombre vuelve a ser obligatorio: es el
    // error del paso además del producto, que es lo que esta prueba mira (S63).
    hook<HTMLInputElement>(root, "[data-customer-enabled]").click()

    hook<HTMLButtonElement>(root, '[data-step-next="sale"]').click()

    expect(hook(root, '[data-step-toggle="sale"]').getAttribute("aria-expanded")).toBe("true")
    expect(hook<HTMLElement>(root, '[data-step-body="terms"]').hidden).toBe(true)
    expect(errorFor(root, "customer_name").hidden).toBe(false)
    expect(errorFor(root, "customer_name").textContent).toBe(CUSTOMER_NAME_REQUIRED_MESSAGE)
    // El error del primer producto se pinta sobre su renglón, que es donde está
    // el control que hay que corregir.
    expect(errorFor(firstRow(root), "name").textContent).toBe(PRODUCT_NAME_REQUIRED_MESSAGE)
    expect(errorFor(firstRow(root), "name").hidden).toBe(false)
  })

  it("completar el paso lo deja «Rellenado» y abre el siguiente", () => {
    const root = mountView()
    fillMinimalSale(root)

    hook<HTMLButtonElement>(root, '[data-step-next="sale"]').click()

    expect(hook<HTMLElement>(root, '[data-step-body="sale"]').hidden).toBe(true)
    expect(hook(root, '[data-step-toggle="terms"]').getAttribute("aria-expanded")).toBe("true")
    expect(hook(root, '[data-step-badge="sale"]').dataset.state).toBe("complete")
    expect(hook(root, '[data-step-badge-label="sale"]').textContent).toBe("Rellenado")
  })
})

describe("validación del envío y el 400 del servidor (S26, D-003)", () => {
  it("un error en un paso colapsado abre ese paso y no llama a la API", async () => {
    const root = mountView()
    fillMinimalSale(root)
    // Crédito sin fecha prometida: el error vive en «Condición de pago», que se
    // había cerrado sin confirmar, así que el envío tiene que abrirlo.
    choose(hook<HTMLInputElement>(root, 'input[name="payment_terms"][value="credit"]'))
    hook<HTMLButtonElement>(root, '[data-step-next="sale"]').click()
    hook<HTMLButtonElement>(root, '[data-step-toggle="terms"]').click()

    form(root).requestSubmit()
    await flush()

    expect(mocks.createLive).not.toHaveBeenCalled()
    expect(hook(root, '[data-step-toggle="terms"]').getAttribute("aria-expanded")).toBe("true")
    expect(errorFor(root, "due_date").hidden).toBe(false)
  })

  it("el 400 del servidor se pinta sobre el renglón que señala y deja la venta cargada", async () => {
    const root = mountView()
    fillMinimalSale(root)
    hook<HTMLButtonElement>(root, "[data-add-product]").click()
    const rows = root.querySelectorAll<HTMLElement>("[data-item-row]")
    typeInto(hook<HTMLInputElement>(rows[1], "[data-row-name]"), "Camisa de lino")
    typeInto(hook<HTMLInputElement>(rows[1], "[data-row-price]"), "800.00")

    // El servidor cuenta sólo los adicionales: su renglón 0 es el segundo de la
    // pantalla.
    mocks.createLive.mockRejectedValue(
      new ApiError("BAD_REQUEST", 400, "additional_items.0.total: debe ser mayor a cero"),
    )
    confirmSteps(root)

    form(root).requestSubmit()
    await flush()

    expect(errorFor(rows[1], "total").textContent).toBe("debe ser mayor a cero")
    expect(errorFor(rows[1], "total").hidden).toBe(false)
    const banner = hook<HTMLElement>(root, "[data-form-banner]")
    expect(banner.hidden).toBe(false)
    expect(banner.textContent).toBe("La solicitud no es válida. Revisá los datos ingresados.")
    // El envío fallido conserva lo cargado y no navega.
    expect(mocks.navigateTo).not.toHaveBeenCalled()
    expect(rows[1].querySelector<HTMLInputElement>("[data-row-price]")?.value).toBe("800.00")
  })
})

describe("dinero (S51)", () => {
  it("sanea el precio mientras se escribe y redondea el total de la venta", () => {
    const root = mountView()
    const row = firstRow(root)
    const price = hook<HTMLInputElement>(row, "[data-row-price]")

    typeInto(price, "12a5.678")

    expect(price.value).toBe("125.67")
    expect(hook(root, "[data-step-total]").textContent).toBe(formatMoney("125.67"))
    expect(hook(root, "[data-balance-total]").textContent).toBe(formatMoney("125.67"))
    expect(errorFor(row, "total").hidden).toBe(true)
  })
})

describe("reparto de mercadería y condición de pago (S44, S45, S57)", () => {
  it("la primera mercadería viaja como product_name y cost y el resto en additional_items", async () => {
    const root = mountView()
    fillMinimalSale(root)
    hook<HTMLButtonElement>(root, "[data-add-product]").click()
    const rows = root.querySelectorAll<HTMLElement>("[data-item-row]")
    typeInto(hook<HTMLInputElement>(rows[1], "[data-row-name]"), "Camisa de lino")
    typeInto(hook<HTMLInputElement>(rows[1], "[data-row-price]"), "800.00")
    confirmSteps(root)

    form(root).requestSubmit()
    await flush()

    expect(mocks.createLive).toHaveBeenCalledTimes(1)
    expect(mocks.createLive.mock.calls[0]?.[0]).toEqual({
      customer_name: "María González",
      product_name: "Jean clásico",
      cost: "1250.50",
      additional_items: [{ name: "Camisa de lino", total: "800.00", kind: "merchandise" }],
      payment_method: "cash",
      sale_date: `${todayLocal()}T00:00:00.000Z`,
    })
    expect(mocks.navigateTo).toHaveBeenCalledWith("/sales")
  })

  it("contado con cobro manda el estado, el monto normalizado y avisa el vuelto", async () => {
    const root = mountView()
    fillMinimalSale(root)
    hook<HTMLInputElement>(root, "[data-collect-now]").click()
    typeInto(hook<HTMLInputElement>(root, "[data-amount-paid]"), "1300")

    expect(hook(root, "[data-payment-feedback]").textContent).toBe(
      `Cambio a dar: ${formatMoney("49.50")}`,
    )
    confirmSteps(root)

    form(root).requestSubmit()
    await flush()

    expect(mocks.createLive.mock.calls[0]?.[0]).toMatchObject({
      status: "completed",
      amount_paid: "1300.00",
    })
  })

  it("crédito no manda forma de pago: pide el vencimiento y esconde el cobro", async () => {
    const root = mountView()
    fillMinimalSale(root)
    choose(hook<HTMLInputElement>(root, 'input[name="payment_terms"][value="credit"]'))
    typeInto(hook<HTMLInputElement>(root, "[data-due-date]"), "2099-12-31")

    expect(hook<HTMLElement>(root, "[data-payment-fields]").hidden).toBe(true)
    expect(hook<HTMLElement>(root, "[data-collect-block]").hidden).toBe(true)
    confirmSteps(root)

    form(root).requestSubmit()
    await flush()

    const body = mocks.createLive.mock.calls[0]?.[0] as Record<string, unknown>
    expect(body.payment_terms).toBe("credit")
    expect(body.due_date).toBe("2099-12-31T00:00:00.000Z")
    expect(body).not.toHaveProperty("payment_method")
    expect(body).not.toHaveProperty("payment_bank")
  })
})

describe("borrador por canal (S49, S50)", () => {
  it("guarda con debounce en la clave del canal abierto", () => {
    vi.useFakeTimers()
    const root = mountView()

    typeInto(hook<HTMLInputElement>(root, "[data-customer-name]"), "María")
    vi.advanceTimersByTime(299)
    expect(storedDraft("live")).toBeNull()

    vi.advanceTimersByTime(1)
    expect(storedDraft("live")?.customerName).toBe("María")
    expect(storedDraft("live")?.saleDate).toBe(todayLocal())
    expect(window.localStorage.getItem(saleDraftKey("whatsapp"))).toBeNull()
  })

  it("pagehide guarda lo que el debounce todavía no escribió", () => {
    const root = mountView()

    typeInto(hook<HTMLInputElement>(root, "[data-customer-name]"), "María")
    window.dispatchEvent(new Event("pagehide"))

    expect(storedDraft("live")?.customerName).toBe("María")
  })

  it("restaura el borrador de su canal al montar y no mezcla los dos", () => {
    seedDraft("whatsapp", {
      customerName: "Ana Pérez",
      products: [{ name: "Collar de plata", price: "600.00" }],
    })
    window.history.replaceState(null, "", "/sales/new?type=whatsapp")

    const root = mountView()

    expect(hook<HTMLInputElement>(root, "[data-customer-name]").value).toBe("Ana Pérez")
    expect(hook<HTMLInputElement>(firstRow(root), "[data-row-name]").value).toBe("Collar de plata")
    // El formulario es uno solo, pero la venta en curso de cada canal es suya.
    expect(hook(root, "#sale-form").dataset.canal).toBe("whatsapp")
    expect(storedDraft("live")).toBeNull()
  })

  it("una venta de tienda se registra por el canal de tienda", async () => {
    window.history.replaceState(null, "", "/sales/new?type=whatsapp")
    const root = mountView()
    fillMinimalSale(root)
    confirmSteps(root)

    form(root).requestSubmit()
    await flush()

    expect(mocks.createLive).not.toHaveBeenCalled()
    expect(mocks.createWhatsapp).toHaveBeenCalledTimes(1)
    expect(mocks.navigateTo).toHaveBeenCalledWith("/sales")
  })

  it("la fecha de un borrador de otro día no se restaura en el pasado", () => {
    seedDraft("live", { saleDate: "2020-01-05" })
    const root = mountView()

    expect(hook<HTMLInputElement>(root, "[data-sale-date]").value).toBe(todayLocal())

    document.body.replaceChildren()
    seedDraft("live", { saleDate: "2099-12-31" })
    const other = mountView()

    // Fechar adelante es una decisión de la dueña: se respeta tal cual.
    expect(hook<HTMLInputElement>(other, "[data-sale-date]").value).toBe("2099-12-31")
  })

  it("al registrar la venta el borrador se descarta y la lista se monta sin recargar", async () => {
    seedDraft("live", { customerName: "María González" })
    const root = mountView()
    fillMinimalSale(root)
    confirmSteps(root)

    form(root).requestSubmit()
    await flush()

    expect(storedDraft("live")).toBeNull()
    expect(mocks.navigateTo).toHaveBeenCalledWith("/sales")
  })

  it("«Cancelar» pregunta antes: confirmar descarta el borrador, cerrar no", async () => {
    seedDraft("live", { customerName: "María González" })
    const root = mountView()

    hook<HTMLAnchorElement>(root, "[data-cancel-sale]").click()
    await flush()

    expect(dialog(root).open).toBe(true)
    dialog(root).close("cancel")
    dialog(root).dispatchEvent(new Event("close"))
    await flush()

    // Cerrar sin confirmar deja la pantalla y el borrador como estaban.
    expect(storedDraft("live")?.customerName).toBe("María González")
    expect(mocks.navigateTo).not.toHaveBeenCalled()

    hook<HTMLAnchorElement>(root, "[data-cancel-sale]").click()
    await flush()
    dialog(root).close("confirm")
    dialog(root).dispatchEvent(new Event("close"))
    await flush()

    expect(storedDraft("live")).toBeNull()
    expect(mocks.navigateTo).toHaveBeenCalledWith("/sales")
  })

  it("el borrador que se guarda tiene la versión del formato", () => {
    const root = mountView()
    typeInto(hook<HTMLInputElement>(root, "[data-customer-name]"), "María")
    window.dispatchEvent(new Event("pagehide"))

    const raw = window.localStorage.getItem(saleDraftKey("live"))
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? "{}").version).toBe(SALE_DRAFT_VERSION)
  })
})

/**
 * El interruptor «Agregar cliente» (S63) no se guarda en el borrador, así que al
 * volver tiene que deducirse de lo que el borrador sí guardó. Sin eso, un
 * borrador con cliente volvía con el bloque apagado y la venta se guardaba sin el
 * cliente que ya estaba cargado, en silencio.
 */
describe("el interruptor del cliente al restaurar el borrador (S63)", () => {
  it("un borrador con cliente elegido vuelve con el bloque encendido y manda su customer_id", async () => {
    const pickedId = "c1c1c1c1-1111-4111-8111-111111111111"
    seedDraft("live", {
      customerMode: "existing",
      customer: { id: pickedId, name: "María González", phone: null },
      products: [{ name: "Jean clásico", price: "1250.50" }],
    })
    const root = mountView()

    expect(hook<HTMLInputElement>(root, "[data-customer-enabled]").checked).toBe(true)

    confirmSteps(root)
    form(root).requestSubmit()
    await flush()

    const body = mocks.createLive.mock.calls[0]?.[0] as Record<string, unknown>
    expect(body.customer_id).toBe(pickedId)
    expect(body).not.toHaveProperty("customer_name")
  })

  it("un borrador con el nombre escrito vuelve con el bloque encendido y manda su customer_name", async () => {
    seedDraft("live", {
      customerMode: "new",
      customerName: "María González",
      products: [{ name: "Jean clásico", price: "1250.50" }],
    })
    const root = mountView()

    expect(hook<HTMLInputElement>(root, "[data-customer-enabled]").checked).toBe(true)

    confirmSteps(root)
    form(root).requestSubmit()
    await flush()

    const body = mocks.createLive.mock.calls[0]?.[0] as Record<string, unknown>
    expect(body.customer_name).toBe("María González")
    expect(body).not.toHaveProperty("customer_id")
  })

  it("un borrador sin cliente vuelve con el bloque apagado", () => {
    seedDraft("live", {
      customerMode: "new",
      customerName: "",
      products: [{ name: "Jean clásico", price: "1250.50" }],
    })
    const root = mountView()

    expect(hook<HTMLInputElement>(root, "[data-customer-enabled]").checked).toBe(false)
  })
})

describe("pasos bloqueados y progreso (S59)", () => {
  it("al entrar sólo «La venta» está desbloqueada: las demás dicen «Bloqueado» y su encabezado no abre nada", () => {
    const root = mountView()

    expect(hook<HTMLButtonElement>(root, '[data-step-toggle="sale"]').disabled).toBe(false)
    for (const step of STEPS.slice(1)) {
      const toggle = hook<HTMLButtonElement>(root, `[data-step-toggle="${step}"]`)
      expect(toggle.disabled).toBe(true)
      expect(toggle.closest("section")?.getAttribute("data-locked")).toBe("true")
      expect(hook(root, `[data-step-badge="${step}"]`).getAttribute("data-state")).toBe("locked")
      expect(hook(root, `[data-step-badge-label="${step}"]`).textContent).toBe("Bloqueado")
      expect(hook<HTMLElement>(root, `[data-step-badge="${step}"]`).hidden).toBe(false)

      // Un encabezado bloqueado es inerte: no abre su cuerpo ni cambia de estado.
      toggle.click()
      expect(hook<HTMLElement>(root, `[data-step-body="${step}"]`).hidden).toBe(true)
      expect(toggle.getAttribute("aria-expanded")).toBe("false")
    }
  })

  it("«Siguiente» desbloquea el siguiente y deja bloqueados los de más adelante", () => {
    const root = mountView()
    fillMinimalSale(root)

    hook<HTMLButtonElement>(root, '[data-step-next="sale"]').click()

    expect(hook<HTMLButtonElement>(root, '[data-step-toggle="terms"]').disabled).toBe(false)
    expect(hook(root, '[data-step-toggle="terms"]').getAttribute("aria-expanded")).toBe("true")
    for (const step of ["payment", "summary"] as const) {
      expect(hook<HTMLButtonElement>(root, `[data-step-toggle="${step}"]`).disabled).toBe(true)
      expect(hook(root, `[data-step-badge-label="${step}"]`).textContent).toBe("Bloqueado")
    }

    // Estando en el paso 2, «La venta» se puede volver a abrir y editar.
    hook<HTMLButtonElement>(root, '[data-step-toggle="sale"]').click()
    expect(hook(root, '[data-step-toggle="sale"]').getAttribute("aria-expanded")).toBe("true")
    expect(hook<HTMLElement>(root, '[data-step-body="sale"]').hidden).toBe(false)
  })

  it("cerrar un paso sin pulsar «Siguiente» no lo completa: vuelve a «Pendiente»", () => {
    const root = mountView()
    fillMinimalSale(root)
    // «Condición de pago» abre al confirmar «La venta»; cerrarla no la confirma.
    hook<HTMLButtonElement>(root, '[data-step-next="sale"]').click()

    hook<HTMLButtonElement>(root, '[data-step-toggle="terms"]').click()

    expect(hook(root, '[data-step-badge="terms"]').getAttribute("data-state")).toBe("pending")
    expect(hook(root, '[data-step-badge-label="terms"]').textContent).toBe("Pendiente")
  })

  it("abrir un paso no lo completa: «Cobro» sigue «Pendiente» hasta su «Siguiente»", () => {
    const root = mountView()
    fillMinimalSale(root)
    hook<HTMLButtonElement>(root, '[data-step-next="sale"]').click()
    hook<HTMLButtonElement>(root, '[data-step-next="terms"]').click()

    // «Cobro» quedó abierto por «Siguiente» y nadie pulsó el suyo: cerrarlo y
    // volver a abrirlo no lo deja «Rellenado».
    hook<HTMLButtonElement>(root, '[data-step-toggle="payment"]').click()
    expect(hook(root, '[data-step-badge-label="payment"]').textContent).toBe("Pendiente")
    hook<HTMLButtonElement>(root, '[data-step-toggle="payment"]').click()
    expect(hook(root, '[data-step-badge="payment"]').hidden).toBe(true)
  })

  it("editar un paso «Rellenado» lo devuelve a «Pendiente» y no vuelve a bloquear los siguientes", () => {
    const root = mountView()
    fillMinimalSale(root)
    confirmSteps(root)
    expect(hook(root, '[data-step-badge-label="sale"]').textContent).toBe("Rellenado")

    typeInto(hook<HTMLInputElement>(root, "[data-customer-name]"), "Ana Pérez")

    expect(hook(root, '[data-step-badge="sale"]').getAttribute("data-state")).toBe("pending")
    expect(hook(root, '[data-step-badge-label="sale"]').textContent).toBe("Pendiente")
    // El desbloqueo no se revierte: los pasos que ya se abrieron siguen abiertos.
    for (const step of ["terms", "payment", "summary"] as const) {
      expect(hook<HTMLButtonElement>(root, `[data-step-toggle="${step}"]`).disabled).toBe(false)
    }
    // Y el «Siguiente» del paso lo vuelve a confirmar.
    hook<HTMLButtonElement>(root, '[data-step-next="sale"]').click()
    expect(hook(root, '[data-step-badge-label="sale"]').textContent).toBe("Rellenado")
  })

  it("editar un renglón de mercadería también devuelve «La venta» a «Pendiente»", () => {
    const root = mountView()
    fillMinimalSale(root)
    hook<HTMLButtonElement>(root, '[data-step-next="sale"]').click()
    expect(hook(root, '[data-step-badge-label="sale"]').textContent).toBe("Rellenado")

    typeInto(hook<HTMLInputElement>(firstRow(root), "[data-row-price]"), "900")

    expect(hook(root, '[data-step-badge-label="sale"]').textContent).toBe("Pendiente")
  })

  it("editar el monto recibido —que vive en la tarjeta de la condición— devuelve «Cobro» a «Pendiente»", () => {
    const root = mountView()
    fillMinimalSale(root)
    hook<HTMLInputElement>(root, "[data-collect-now]").click()
    typeInto(hook<HTMLInputElement>(root, "[data-amount-paid]"), "1250.50")
    confirmSteps(root)
    expect(hook(root, '[data-step-badge-label="payment"]').textContent).toBe("Rellenado")

    typeInto(hook<HTMLInputElement>(root, "[data-amount-paid]"), "1300")

    // El campo es del paso «Cobro» aunque su tarjeta sea la de la condición.
    expect(hook(root, '[data-step-badge-label="payment"]').textContent).toBe("Pendiente")
    expect(hook(root, '[data-step-badge-label="terms"]').textContent).toBe("Rellenado")
  })
})

describe("el botón de registrar (S61)", () => {
  it("arranca deshabilitado, con el texto que explica qué falta", () => {
    const root = mountView()

    expect(submitBtn(root).disabled).toBe(true)
    expect(submitHint(root).hidden).toBe(false)
    expect(submitHint(root).textContent?.trim()).toBe(SUBMIT_HINT)
  })

  it("se habilita recién cuando los pasos 1, 2 y 3 están confirmados", () => {
    const root = mountView()
    fillMinimalSale(root)

    hook<HTMLButtonElement>(root, '[data-step-next="sale"]').click()
    expect(submitBtn(root).disabled).toBe(true)
    hook<HTMLButtonElement>(root, '[data-step-next="terms"]').click()
    expect(submitBtn(root).disabled).toBe(true)
    hook<HTMLButtonElement>(root, '[data-step-next="payment"]').click()

    expect(submitBtn(root).disabled).toBe(false)
    expect(submitHint(root).hidden).toBe(true)
  })

  it("editar un campo de un paso confirmado lo vuelve a deshabilitar", () => {
    const root = mountView()
    fillMinimalSale(root)
    confirmSteps(root)
    expect(submitBtn(root).disabled).toBe(false)

    typeInto(hook<HTMLInputElement>(firstRow(root), "[data-row-price]"), "900")

    expect(submitBtn(root).disabled).toBe(true)
    expect(submitHint(root).hidden).toBe(false)
  })

  it("Enter en un campo no registra la venta: abre el primer paso incompleto y no llama a la API", async () => {
    const root = mountView()
    fillMinimalSale(root)
    hook<HTMLButtonElement>(root, '[data-step-next="sale"]').click()
    hook<HTMLButtonElement>(root, '[data-step-next="terms"]').click()
    // «Cobro» está abierto y válido, pero nadie pulsó su «Siguiente»: el envío
    // por teclado —el botón está deshabilitado— no puede registrar la venta.
    hook<HTMLButtonElement>(root, '[data-step-toggle="payment"]').click()

    form(root).requestSubmit()
    await flush()

    expect(mocks.createLive).not.toHaveBeenCalled()
    expect(mocks.navigateTo).not.toHaveBeenCalled()
    expect(hook(root, '[data-step-toggle="payment"]').getAttribute("aria-expanded")).toBe("true")
  })

  it("el envío con un paso inválido pinta sus errores y se queda en el formulario", async () => {
    const root = mountView()

    form(root).requestSubmit()
    await flush()

    expect(mocks.createLive).not.toHaveBeenCalled()
    expect(hook(root, '[data-step-toggle="sale"]').getAttribute("aria-expanded")).toBe("true")
    // El cliente ya no es el error que frena una venta vacía: el bloque arranca
    // apagado y la mercadería es lo que falta (S63).
    expect(errorFor(firstRow(root), "name").hidden).toBe(false)
  })
})

describe("el resumen en escritorio (S60)", () => {
  it("en escritorio el resumen no es un paso: su cuerpo está siempre a la vista y su encabezado no responde", () => {
    stubViewport("desktop")
    const root = mountView()

    expect(form(root).dataset.layout).toBe("desktop")
    expect(hook<HTMLElement>(root, '[data-step-body="summary"]').hidden).toBe(false)
    expect(hook(root, '[data-step="summary"]').hasAttribute("data-locked")).toBe(false)
    expect(submitHint(root).hidden).toBe(false)

    // El encabezado de botón no forma parte del formulario en escritorio: el
    // resumen no se abre ni se cierra.
    hook<HTMLButtonElement>(root, '[data-step-toggle="summary"]').click()
    expect(hook<HTMLElement>(root, '[data-step-body="summary"]').hidden).toBe(false)
  })

  it("en escritorio «Siguiente» en «Cobro» habilita el registro sin abrir un cuarto paso", () => {
    stubViewport("desktop")
    const root = mountView()
    fillMinimalSale(root)

    for (const step of ["sale", "terms", "payment"] as const) {
      hook<HTMLButtonElement>(root, `[data-step-next="${step}"]`).click()
    }

    expect(submitBtn(root).disabled).toBe(false)
    for (const step of STEPS) {
      expect(hook<HTMLElement>(root, `[data-step-body="${step}"]`).hidden).toBe(step !== "summary")
    }
  })

  it("en móvil el resumen sigue siendo el paso 4: se desbloquea con «Cobro» y se abre", () => {
    stubViewport("mobile")
    const root = mountView()
    fillMinimalSale(root)

    expect(form(root).dataset.layout).toBe("mobile")
    expect(hook<HTMLButtonElement>(root, '[data-step-toggle="summary"]').disabled).toBe(true)

    confirmSteps(root)

    expect(hook<HTMLButtonElement>(root, '[data-step-toggle="summary"]').disabled).toBe(false)
    expect(hook(root, '[data-step-toggle="summary"]').getAttribute("aria-expanded")).toBe("true")
    expect(hook<HTMLElement>(root, '[data-step-body="summary"]').hidden).toBe(false)
  })

  it("cruzar el punto de quiebre pasa el resumen de columna fija a paso 4 y de vuelta", () => {
    const crossBreakpoint = stubViewport("desktop")
    const root = mountView()
    expect(hook<HTMLElement>(root, '[data-step-body="summary"]').hidden).toBe(false)

    crossBreakpoint()
    expect(form(root).dataset.layout).toBe("mobile")
    expect(hook<HTMLElement>(root, '[data-step-body="summary"]').hidden).toBe(true)
    expect(hook(root, '[data-step-badge-label="summary"]').textContent).toBe("Bloqueado")

    crossBreakpoint()
    expect(form(root).dataset.layout).toBe("desktop")
    expect(hook<HTMLElement>(root, '[data-step-body="summary"]').hidden).toBe(false)
  })
})

describe("el cliente opcional de una venta de contado (S63)", () => {
  /** La venta mínima sin cliente: mercadería y precio, nada del bloque Cliente. */
  function fillSaleWithoutCustomer(root: HTMLElement, price = "1250.50"): void {
    const row = firstRow(root)
    typeInto(hook<HTMLInputElement>(row, "[data-row-name]"), "Jean clásico")
    typeInto(hook<HTMLInputElement>(row, "[data-row-price]"), price)
  }

  it("arranca sin cliente: el bloque del cliente está oculto e inerte", () => {
    const root = mountView()

    const toggle = hook<HTMLInputElement>(root, "[data-customer-enabled]")
    expect(toggle.checked).toBe(false)
    expect(toggle.closest("label")?.textContent).toContain("Agregar cliente")
    // Nada del bloque del cliente se ve ni se puede tocar sin encender el checkbox.
    expect(hook<HTMLElement>(root, "[data-customer-modes]").hidden).toBe(true)
    expect(hook<HTMLElement>(root, "[data-customer-new]").hidden).toBe(true)
    expect(hook<HTMLElement>(root, "[data-customer-existing]").hidden).toBe(true)
    expect(hook<HTMLButtonElement>(root, '[data-customer-mode="new"]').disabled).toBe(true)
    expect(hook<HTMLButtonElement>(root, '[data-customer-mode="existing"]').disabled).toBe(true)
    expect(hook<HTMLInputElement>(root, "[data-customer-name]").disabled).toBe(true)
    expect(hook<HTMLInputElement>(root, "[data-customer-search]").disabled).toBe(true)
  })

  it("sin cliente la venta se registra sin customer_name ni customer_id", async () => {
    const root = mountView()
    fillSaleWithoutCustomer(root)
    confirmSteps(root)

    form(root).requestSubmit()
    await flush()

    expect(mocks.createLive).toHaveBeenCalledTimes(1)
    const body = mocks.createLive.mock.calls[0]?.[0] as Record<string, unknown>
    // El nombre genérico lo pone el servidor: la pantalla no lo inventa ni lo manda.
    expect(body).not.toHaveProperty("customer_name")
    expect(body).not.toHaveProperty("customer_id")
    expect(body.product_name).toBe("Jean clásico")
    expect(mocks.navigateTo).toHaveBeenCalledWith("/sales")
  })

  it("marcar «Agregar cliente» muestra el bloque y vuelve a pedir el nombre", async () => {
    const root = mountView()
    hook<HTMLInputElement>(root, "[data-customer-enabled]").click()

    expect(hook<HTMLElement>(root, "[data-customer-new]").hidden).toBe(false)
    expect(hook<HTMLInputElement>(root, "[data-customer-name]").disabled).toBe(false)

    fillSaleWithoutCustomer(root)
    form(root).requestSubmit()
    await flush()

    // Con el bloque encendido el nombre es obligatorio otra vez, en español.
    expect(errorFor(root, "customer_name").hidden).toBe(false)
    expect(errorFor(root, "customer_name").textContent).toBe(CUSTOMER_NAME_REQUIRED_MESSAGE)
    expect(mocks.createLive).not.toHaveBeenCalled()
  })

  it("a crédito el cliente es obligatorio: el checkbox se enciende y no se puede apagar", () => {
    const root = mountView()
    const toggle = hook<HTMLInputElement>(root, "[data-customer-enabled]")

    choose(hook<HTMLInputElement>(root, 'input[name="payment_terms"][value="credit"]'))

    expect(toggle.checked).toBe(true)
    expect(toggle.disabled).toBe(true)
    expect(hook<HTMLElement>(root, "[data-customer-new]").hidden).toBe(false)

    // Volver a contado devuelve la decisión a la dueña.
    choose(hook<HTMLInputElement>(root, 'input[name="payment_terms"][value="immediate"]'))
    expect(toggle.disabled).toBe(false)
  })

  it("un crédito sin cliente no se registra: pinta el error y no llama a la API", async () => {
    const root = mountView()
    fillSaleWithoutCustomer(root)
    choose(hook<HTMLInputElement>(root, 'input[name="payment_terms"][value="credit"]'))
    typeInto(hook<HTMLInputElement>(root, "[data-due-date]"), "2099-12-31")

    form(root).requestSubmit()
    await flush()

    expect(mocks.createLive).not.toHaveBeenCalled()
    expect(mocks.navigateTo).not.toHaveBeenCalled()
    expect(errorFor(root, "customer_name").textContent).toBe(CUSTOMER_NAME_REQUIRED_MESSAGE)
  })

  // PRESERVE: el camino del padrón sigue mandando `customer_id` y no el nombre, y
  // la venta a crédito sigue viajando con el cliente elegido.
  it("con un cliente del padrón la venta sigue mandando customer_id y no el nombre", async () => {
    mocks.customersList.mockResolvedValue({
      customers: [
        {
          id: "1c6d3b90-5a44-4e0f-9b1d-7f2e8a4c6d31",
          name: "Ana Pérez",
          phone: "8888 1234",
          note: null,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    })
    const root = mountView()
    hook<HTMLInputElement>(root, "[data-customer-enabled]").click()
    hook<HTMLButtonElement>(root, '[data-customer-mode="existing"]').click()
    const search = hook<HTMLInputElement>(root, "[data-customer-search]")
    typeInto(search, "Ana")
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await flush()
    hook<HTMLButtonElement>(
      root,
      '[data-customer-id="1c6d3b90-5a44-4e0f-9b1d-7f2e8a4c6d31"]',
    ).click()

    fillSaleWithoutCustomer(root)
    confirmSteps(root)
    form(root).requestSubmit()
    await flush()

    const body = mocks.createLive.mock.calls[0]?.[0] as Record<string, unknown>
    expect(body.customer_id).toBe("1c6d3b90-5a44-4e0f-9b1d-7f2e8a4c6d31")
    expect(body).not.toHaveProperty("customer_name")
  })
})

/**
 * El estado con el que queda la venta, dicho antes de registrarla (S62).
 *
 * La tarjeta de cobro y el resumen tienen que contestar la misma pregunta: ¿esta
 * venta se va a guardar completada o pendiente? La respuesta se deriva del
 * formulario, así que cambiar «¿Cobraste ahora?» la actualiza en el acto.
 */
describe("estado de la venta antes de registrarla (S62)", () => {
  it("el resumen arranca en pendiente y pasa a completada al marcar «¿Cobraste ahora?»", () => {
    const root = mountView()
    fillMinimalSale(root)

    const pill = (): HTMLElement => hook<HTMLElement>(root, "[data-summary-status]")
    expect(pill().textContent).toBe("Pendiente")
    expect(pill().dataset.state).toBe("pending")

    hook<HTMLInputElement>(root, "[data-collect-now]").click()

    expect(pill().textContent).toBe("Completada")
    expect(pill().dataset.state).toBe("completed")
    expect(hook<HTMLElement>(root, "[data-collect-status]").textContent).toContain("completada")
    expect(hook<HTMLElement>(root, "[data-summary-status-note]").textContent).toContain("completada")

    hook<HTMLInputElement>(root, "[data-collect-now]").click()

    expect(pill().textContent).toBe("Pendiente")
    expect(hook<HTMLElement>(root, "[data-collect-status]").textContent).toContain("pendiente")
  })

  it("a crédito el resumen dice pendiente aunque el cobro haya quedado marcado", () => {
    const root = mountView()
    fillMinimalSale(root)
    hook<HTMLInputElement>(root, "[data-collect-now]").click()

    hook<HTMLInputElement>(root, 'input[data-payment-terms-input][value="credit"]').click()

    expect(hook<HTMLElement>(root, "[data-summary-status]").textContent).toBe("Pendiente")
    expect(hook<HTMLElement>(root, "[data-summary-status-note]").textContent).toContain("crédito")
  })
})
