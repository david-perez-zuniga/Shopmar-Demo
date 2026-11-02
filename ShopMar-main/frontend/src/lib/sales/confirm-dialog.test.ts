import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { askConfirm, formatReference } from "./confirm-dialog"
import type { ISaleListRow, SaleStatus } from "../core/types"
import { saleListRowDefaults } from "../core/fixtures"

/**
 * Líneas base congeladas del diálogo. Ver `fixtures/sales/README.md`: no se
 * regeneran para que pase un test. El test tiene que partir del mismo markup
 * que las generó, por eso recorta `index.astro` entre los mismos marcadores en
 * vez de inlinear una copia a mano.
 */
const FIXTURES = resolve("src/lib/fixtures/sales")
const PAGE = resolve("src/components/views/SalesView.astro")
const VIEW_SCRIPT = resolve("src/lib/views/sales-list.ts")
const PAGE_START = '<div class="modal-overlay'
const PAGE_END = '<div class="sales-container'

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8")
}

function dialogMarkup(): string {
  const source = readFileSync(PAGE, "utf8")
  const start = source.indexOf(PAGE_START)
  const end = source.indexOf(PAGE_END)
  if (start < 0 || end <= start) {
    throw new Error("no se pudo recortar el markup del diálogo desde index.astro")
  }
  return source.slice(start, end)
}

/** El mismo caso que produjo los fixtures: fecha, total y método fijos. */
function saleWith(overrides: Partial<ISaleListRow> = {}): ISaleListRow {
  return {
    ...saleListRowDefaults,
    id: "s-20250314-001",
    sale_date: "2025-03-14",
    customer_name: "María Fernanda López",
    product_name: "Vestido floral manga corta",
    type: "live",
    status: "pending",
    cost: "1250.00",
    payment_method: "cash",
    shipment_method: "pickup",
    additional_count: 0,
    total: "1450.50",
    ...overrides,
  }
}

/**
 * En un `outerHTML` que no coincide, `toBe` imprime cientos de bytes idénticos
 * de un solo renglón. Esto deja a la vista el offset y la ventana de ambos.
 */
function describeDiff(actual: string, expected: string): string {
  const limit = Math.min(actual.length, expected.length)
  let offset = 0
  while (offset < limit && actual[offset] === expected[offset]) offset += 1
  const from = Math.max(0, offset - 40)
  return [
    `primera diferencia en el offset ${offset}`,
    `esperado: …${expected.slice(from, offset + 80)}…`,
    `actual:   …${actual.slice(from, offset + 80)}…`,
  ].join("\n")
}

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector)
  if (el === null) throw new Error(`falta ${selector} en el markup del diálogo`)
  return el as T
}

/** Monta el markup estático del diálogo como cuerpo del documento. */
function mountDialog(): { overlay: HTMLElement; prompt: HTMLElement } {
  document.body.innerHTML = dialogMarkup()
  return {
    overlay: must<HTMLElement>(document, "#confirm-dialog"),
    prompt: must<HTMLElement>(document, "#dialog-prompt"),
  }
}

type OpenOptions = {
  next?: SaleStatus
  confirmLabel?: string
  needsPayment?: boolean
}

/** Abre el diálogo y devuelve sus piezas montadas más la promesa pendiente. */
function open(options: OpenOptions = {}) {
  const { overlay, prompt } = mountDialog()
  const promise = askConfirm(
    overlay,
    saleWith(),
    options.next ?? "completed",
    options.confirmLabel ?? "Confirmar cambio",
    options.needsPayment ?? true,
  )
  return {
    overlay,
    prompt,
    promise,
    confirm: must<HTMLButtonElement>(overlay, "#confirm-state"),
    cancel: must<HTMLButtonElement>(overlay, "#cancel-state"),
    input: must<HTMLInputElement>(overlay, "#payment-amount"),
    feedback: must<HTMLElement>(overlay, "#payment-feedback"),
  }
}

function press(key: string, options: KeyboardEventInit = {}): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }),
  )
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("confirm-dialog: equivalencia con los fixtures congelados", () => {
  const CASES: ReadonlyArray<{
    file: string
    next: SaleStatus
    confirmLabel: string
    needsPayment: boolean
  }> = [
    {
      file: "sale-confirm-dialog-cancel.html",
      next: "cancelled",
      confirmLabel: "Cancelar venta",
      needsPayment: false,
    },
    {
      file: "sale-confirm-dialog-payment.html",
      next: "completed",
      confirmLabel: "Confirmar cambio",
      needsPayment: true,
    },
  ]

  for (const { file, next, confirmLabel, needsPayment } of CASES) {
    it(`reproduce ${file} byte a byte sin esperar la promesa`, async () => {
      const { overlay } = mountDialog()
      const promise = askConfirm(overlay, saleWith(), next, confirmLabel, needsPayment)

      // Se serializa mientras el diálogo está abierto: la promesa todavía no se
      // resolvió. Después hay que cerrarla para que no quede el listener vivo.
      const expected = fixture(file)
      expect(overlay.outerHTML, describeDiff(overlay.outerHTML, expected)).toBe(expected)

      must<HTMLButtonElement>(overlay, "#cancel-state").click()
      await expect(promise).resolves.toEqual({ ok: false })
    })
  }

  it("el fixture sin pago fija el botón de confirmar habilitado (cambio deliberado)", () => {
    expect(fixture("sale-confirm-dialog-cancel.html")).toContain(
      '<button class="btn-modal-confirm" id="confirm-state" type="button">Cancelar venta</button>',
    )
  })
})

describe("confirm-dialog: veredicto de pago (lo que el fixture no cubre)", () => {
  const CASES: ReadonlyArray<{
    name: string
    amount: string
    acceptable: boolean
    feedback: string
    invalid: boolean
  }> = [
    { name: "exact", amount: "1450.50", acceptable: true, feedback: "Cobro exacto", invalid: false },
    {
      name: "change",
      amount: "1500",
      acceptable: true,
      feedback: "Cambio a dar: C$ 49.50",
      invalid: false,
    },
    {
      name: "invalid",
      amount: "abc",
      acceptable: false,
      feedback: "Escribí un importe como 1250.50",
      invalid: true,
    },
    { name: "empty", amount: "", acceptable: false, feedback: "", invalid: false },
  ]

  for (const { name, amount, acceptable, feedback, invalid } of CASES) {
    it(`con importe ${name} el botón queda ${acceptable ? "habilitado" : "deshabilitado"}`, async () => {
      const { confirm, cancel, input, feedback: feedbackEl, promise } = open({ needsPayment: true })
      type(input, amount)

      expect(confirm.disabled).toBe(!acceptable)
      expect(feedbackEl.textContent).toBe(feedback)
      expect(feedbackEl.classList.contains("is-ok")).toBe(acceptable)
      expect(feedbackEl.classList.contains("is-error")).toBe(!acceptable && amount !== "")
      expect(input.classList.contains("is-invalid")).toBe(invalid)

      cancel.click()
      await promise
    })
  }

  it("con pago, confirmar con importe válido resuelve con amountPaid", async () => {
    const { confirm, input, promise } = open({ needsPayment: true })
    type(input, "1450.50")

    confirm.click()
    await expect(promise).resolves.toEqual({ ok: true, amountPaid: "1450.50" })
  })

  it("sin pago el botón de confirmar queda habilitado y confirmar resuelve ok sin monto", async () => {
    const { confirm, promise } = open({ needsPayment: false })
    expect(confirm.disabled).toBe(false)

    confirm.click()
    await expect(promise).resolves.toEqual({ ok: true })
  })

  it("sin pago Escape y el click en el overlay siguen resolviendo ok:false", async () => {
    const escapePromise = open({ needsPayment: false }).promise
    press("Escape")
    await expect(escapePromise).resolves.toEqual({ ok: false })

    const { overlay, promise } = open({ needsPayment: false })
    overlay.click()
    await expect(promise).resolves.toEqual({ ok: false })
  })
})

describe("confirm-dialog: foco y teclado", () => {
  it("con pago el foco arranca en el monto y cicla monto → cancelar → confirmar", async () => {
    const { input, cancel, confirm, promise } = open({ needsPayment: true })
    expect(document.activeElement).toBe(input)
    // Un monto aceptable habilita confirmar; con el input vacío el botón está
    // deshabilitado y no recibe foco (defecto preexistente).
    type(input, "1450.50")
    expect(confirm.disabled).toBe(false)

    press("Tab")
    expect(document.activeElement).toBe(cancel)
    press("Tab")
    expect(document.activeElement).toBe(confirm)
    press("Tab")
    expect(document.activeElement).toBe(input)
    press("Tab", { shiftKey: true })
    expect(document.activeElement).toBe(confirm)

    cancel.click()
    await promise
  })

  it("sin pago el foco arranca en cancelar y cicla cancelar → confirmar", async () => {
    const { cancel, confirm, promise } = open({ needsPayment: false })
    expect(document.activeElement).toBe(cancel)
    expect(confirm.disabled).toBe(false)

    // Sin paso de pago el ciclo solo tiene dos paradas: cancelar y confirmar.
    press("Tab")
    expect(document.activeElement).toBe(confirm)
    press("Tab")
    expect(document.activeElement).toBe(cancel)

    cancel.click()
    await promise
  })

  it("Escape cierra sin monto aunque haya importe escrito", async () => {
    const { overlay, input, promise } = open({ needsPayment: true })
    type(input, "1500")

    press("Escape")
    await expect(promise).resolves.toEqual({ ok: false })
    expect(overlay.classList.contains("is-open")).toBe(false)
  })

  it("Enter con veredicto aceptable confirma con el monto normalizado", async () => {
    const { input, promise } = open({ needsPayment: true })
    type(input, "1500")
    input.focus()

    press("Enter")
    await expect(promise).resolves.toEqual({ ok: true, amountPaid: "1500.00" })
  })
})

describe("confirm-dialog: frontera del módulo", () => {
  it("todos los ids que toca el diálogo viven dentro del overlay", () => {
    const { overlay } = mountDialog()
    const IDS = [
      "dialog-prompt",
      "confirm-state",
      "cancel-state",
      "payment-block",
      "payment-total",
      "payment-method",
      "payment-amount-label",
      "payment-amount",
      "payment-feedback",
    ]
    for (const id of IDS) {
      expect(must<HTMLElement>(overlay, `#${id}`), `#${id} vive fuera del overlay`).toBeTruthy()
    }
  })

  it("la página ya no guarda pendingSale ni pendingNext", () => {
    const source = readFileSync(PAGE, "utf8")
    expect(source).not.toContain("pendingSale")
    expect(source).not.toContain("pendingNext")
  })

  it("formatReference es la única referencia humana y la comparten diálogo y página", () => {
    expect(formatReference(saleWith())).toBe("la venta del 14/03/2025")
    // El `<script>` de la pantalla es hoy el módulo de la vista: la referencia
    // humana la sigue compartiendo el diálogo con la pantalla.
    expect(readFileSync(VIEW_SCRIPT, "utf8")).toContain(
      'import { askConfirm, formatReference } from "../sales/confirm-dialog"',
    )
  })
})
