import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  askPayment,
  describePaymentEntry,
  evaluatePaymentEntry,
  isPaymentEntryAcceptable,
  paymentPayload,
} from "./payment-modal"
import type { IPaymentEntry } from "./payment-modal"
import { todayLocal } from "../core/date"
import { PAYMENT_BANKS } from "./banks"
import type { ISaleListRow } from "../core/types"
import { saleListRowDefaults } from "../core/fixtures"

/**
 * El markup del modal de pago se recorta de `index.astro`, igual que hace
 * `confirm-dialog.test.ts` con el diálogo de estado: si la página y el módulo se
 * desincronizan, el test lo dice en vez de comparar contra una copia a mano.
 */
const PAGE = resolve("src/components/views/SalesView.astro")
const PAGE_START = '<div class="modal-overlay no-print" id="payment-dialog"'
const PAGE_END = '<div class="sales-container"'

function dialogMarkup(): string {
  const source = readFileSync(PAGE, "utf8")
  const start = source.indexOf(PAGE_START)
  const end = source.indexOf(PAGE_END)
  if (start < 0 || end <= start) {
    throw new Error("no se pudo recortar el markup del modal de pago desde index.astro")
  }
  return source.slice(start, end)
}

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector)
  if (el === null) throw new Error(`falta ${selector} en el markup del modal de pago`)
  return el as T
}

/** Una venta a crédito con saldo: el caso que habilita «Registrar pago». */
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
    total: "2100.50",
    payment_terms: "credit",
    due_date: "2026-10-28T00:00:00.000Z",
    customer_id: "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16",
    paid_total: "1550.00",
    balance: "550.50",
    is_overdue: false,
    ...overrides,
  }
}

const ENTRY: IPaymentEntry = {
  balance: "550.50",
  amountRaw: "500.00",
  paidAtRaw: "2026-10-05",
  method: "cash",
  bank: "",
  note: "",
}

function entryWith(overrides: Partial<IPaymentEntry> = {}): IPaymentEntry {
  return { ...ENTRY, ...overrides }
}

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }))
}

type Mounted = {
  overlay: HTMLElement
  balance: HTMLElement
  amount: HTMLInputElement
  date: HTMLInputElement
  method: HTMLSelectElement
  bankField: HTMLElement
  bank: HTMLSelectElement
  note: HTMLInputElement
  feedback: HTMLElement
  confirm: HTMLButtonElement
}

/**
 * El markup se recorta del `.astro` **fuente**, así que la lista de bancos que
 * genera el frontmatter (`PAYMENT_BANKS.map`) no está resuelta ahí. Se llena con
 * la misma constante que usa la página, que es la única copia del catálogo.
 */
function fillBanks(select: HTMLSelectElement): void {
  for (const bank of PAYMENT_BANKS) {
    const option = document.createElement("option")
    option.value = bank
    option.textContent = bank
    select.append(option)
  }
}

/** Monta el modal y devuelve sus piezas, sin abrirlo. */
function mount(): Mounted {
  document.body.innerHTML = dialogMarkup()
  const overlay = must<HTMLElement>(document, "#payment-dialog")
  fillBanks(must<HTMLSelectElement>(overlay, "#payment-entry-bank"))
  return {
    overlay,
    balance: must<HTMLElement>(overlay, "#payment-balance"),
    amount: must<HTMLInputElement>(overlay, "#payment-entry-amount"),
    date: must<HTMLInputElement>(overlay, "#payment-entry-date"),
    method: must<HTMLSelectElement>(overlay, "#payment-entry-method"),
    bankField: must<HTMLElement>(overlay, "#payment-bank-field"),
    bank: must<HTMLSelectElement>(overlay, "#payment-entry-bank"),
    note: must<HTMLInputElement>(overlay, "#payment-entry-note"),
    feedback: must<HTMLElement>(overlay, "#payment-entry-feedback"),
    confirm: must<HTMLButtonElement>(overlay, "#confirm-payment"),
  }
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("evaluatePaymentEntry: monto", () => {
  it("un monto positivo dentro del saldo es aceptable y deja el resto", () => {
    expect(evaluatePaymentEntry(entryWith({ amountRaw: "500.00" }))).toEqual({
      state: "ok",
      amount: "500.00",
      remainder: "50.50",
    })
  })

  it("el pago por el saldo exacto deja la venta saldada", () => {
    expect(evaluatePaymentEntry(entryWith({ amountRaw: "550.50" }))).toEqual({
      state: "ok",
      amount: "550.50",
      remainder: "0.00",
    })
    expect(
      isPaymentEntryAcceptable(evaluatePaymentEntry(entryWith({ amountRaw: "550.50" }))),
    ).toBe(true)
  })

  it("cero no es un pago", () => {
    expect(evaluatePaymentEntry(entryWith({ amountRaw: "0" })).state).toBe("zero")
    expect(evaluatePaymentEntry(entryWith({ amountRaw: "0.00" })).state).toBe("zero")
  })

  it("un monto mayor al saldo se rechaza y nombra el saldo", () => {
    expect(evaluatePaymentEntry(entryWith({ amountRaw: "600" }))).toEqual({
      state: "exceeds",
      max: "C$ 550.50",
    })
  })

  it("no usa parseFloat: la coma decimal y el texto no son importes", () => {
    for (const amountRaw of ["500,00", "abc", "1.234", "-5", "5.5.0"]) {
      expect(evaluatePaymentEntry(entryWith({ amountRaw })).state, amountRaw).toBe(
        "invalid_amount",
      )
    }
  })

  it("el campo vacío no es un error todavía", () => {
    expect(evaluatePaymentEntry(entryWith({ amountRaw: "" })).state).toBe("empty")
    expect(evaluatePaymentEntry(entryWith({ amountRaw: "  " })).state).toBe("empty")
  })
})

describe("evaluatePaymentEntry: fecha, banco y nota", () => {
  it("sin fecha no hay pago", () => {
    expect(evaluatePaymentEntry(entryWith({ paidAtRaw: "" })).state).toBe("missing_date")
  })

  it("con tarjeta el banco es obligatorio", () => {
    expect(
      evaluatePaymentEntry(entryWith({ method: "credit_card", bank: "" })).state,
    ).toBe("missing_bank")
    expect(
      evaluatePaymentEntry(entryWith({ method: "credit_card", bank: "   " })).state,
    ).toBe("missing_bank")
    expect(
      evaluatePaymentEntry(entryWith({ method: "credit_card", bank: "LAFISE" })).state,
    ).toBe("ok")
  })

  it("con efectivo el banco no hace falta", () => {
    expect(evaluatePaymentEntry(entryWith({ method: "cash", bank: "" })).state).toBe("ok")
  })

  it("la nota admite hasta 500 caracteres", () => {
    expect(evaluatePaymentEntry(entryWith({ note: "a".repeat(500) })).state).toBe("ok")
    expect(evaluatePaymentEntry(entryWith({ note: "a".repeat(501) })).state).toBe(
      "note_too_long",
    )
  })
})

describe("describePaymentEntry", () => {
  it("traduce cada veredicto a una frase rioplatense", () => {
    expect(describePaymentEntry(evaluatePaymentEntry(entryWith({ amountRaw: "" })))).toBe("")
    expect(describePaymentEntry(evaluatePaymentEntry(entryWith({ amountRaw: "abc" })))).toBe(
      "Escribí un importe como 500.00",
    )
    expect(describePaymentEntry(evaluatePaymentEntry(entryWith({ amountRaw: "0" })))).toBe(
      "El pago tiene que ser mayor que cero",
    )
    expect(describePaymentEntry(evaluatePaymentEntry(entryWith({ amountRaw: "600" })))).toBe(
      "El pago no puede superar el saldo pendiente de C$ 550.50",
    )
    expect(describePaymentEntry(evaluatePaymentEntry(entryWith({ paidAtRaw: "" })))).toBe(
      "Elegí la fecha del pago",
    )
    expect(
      describePaymentEntry(evaluatePaymentEntry(entryWith({ method: "credit_card" }))),
    ).toBe("Elegí el banco emisor de la tarjeta")
    expect(
      describePaymentEntry(evaluatePaymentEntry(entryWith({ note: "a".repeat(501) }))),
    ).toBe("La nota admite hasta 500 caracteres")
  })

  it("con un monto válido adelanta cómo queda el saldo", () => {
    expect(describePaymentEntry(evaluatePaymentEntry(entryWith({ amountRaw: "500" })))).toBe(
      "Queda un saldo de C$ 50.50",
    )
    expect(describePaymentEntry(evaluatePaymentEntry(entryWith({ amountRaw: "550.50" })))).toBe(
      "Con este pago la venta queda saldada",
    )
  })
})

describe("paymentPayload", () => {
  it("efectivo manda el banco en null y normaliza el importe", () => {
    expect(
      paymentPayload(
        entryWith({ amountRaw: "  500.5 ", method: "cash", bank: "BAC Credomatic", note: "" }),
      ),
    ).toEqual({
      amount: "500.50",
      paid_at: "2026-10-05T00:00:00.000Z",
      payment_method: "cash",
      payment_bank: null,
      note: null,
    })
  })

  it("tarjeta manda el banco elegido y recorta la nota", () => {
    expect(
      paymentPayload(
        entryWith({
          amountRaw: "550.50",
          method: "credit_card",
          bank: "LAFISE",
          note: "  Abono de la quincena  ",
        }),
      ),
    ).toEqual({
      amount: "550.50",
      paid_at: "2026-10-05T00:00:00.000Z",
      payment_method: "credit_card",
      payment_bank: "LAFISE",
      note: "Abono de la quincena",
    })
  })
})

describe("el markup de la página", () => {
  it("arma el select de bancos desde el catálogo compartido", () => {
    expect(readFileSync(PAGE, "utf8")).toContain(
      "{PAYMENT_BANKS.map((bank) => <option value={bank}>{bank}</option>)}",
    )
  })
})

describe("askPayment: el modal montado", () => {
  it("muestra el saldo, arranca en efectivo con la fecha de hoy y espera un monto", () => {
    const ui = mount()
    const answer = askPayment(ui.overlay, saleWith())

    expect(ui.overlay.classList.contains("is-open")).toBe(true)
    expect(ui.overlay.getAttribute("role")).toBe("dialog")
    expect(ui.overlay.getAttribute("aria-modal")).toBe("true")
    expect(ui.overlay.getAttribute("aria-labelledby")).toBe("payment-title")
    expect(ui.balance.textContent).toBe("C$ 550.50")
    expect(ui.date.value).toBe(todayLocal())
    expect(ui.method.value).toBe("cash")
    expect(ui.bankField.hidden).toBe(true)
    expect(ui.confirm.disabled).toBe(true)
    expect(document.activeElement).toBe(ui.amount)

    ui.amount.value = "500"
    fire(ui.amount, "input")
    expect(ui.feedback.textContent).toBe("Queda un saldo de C$ 50.50")
    expect(ui.confirm.disabled).toBe(false)

    ui.confirm.click()
    return expect(answer).resolves.toEqual({
      ok: true,
      payload: {
        amount: "500.00",
        paid_at: `${todayLocal()}T00:00:00.000Z`,
        payment_method: "cash",
        payment_bank: null,
        note: null,
      },
    })
  })

  it("al cerrar el modal queda cerrado y devuelve que no se registró", async () => {
    const ui = mount()
    const answer = askPayment(ui.overlay, saleWith())

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))

    await expect(answer).resolves.toEqual({ ok: false })
    expect(ui.overlay.classList.contains("is-open")).toBe(false)
  })

  it("un monto mayor al saldo mantiene el botón deshabilitado", () => {
    const ui = mount()
    void askPayment(ui.overlay, saleWith())

    ui.amount.value = "600"
    fire(ui.amount, "input")

    expect(ui.confirm.disabled).toBe(true)
    expect(ui.feedback.textContent).toBe("El pago no puede superar el saldo pendiente de C$ 550.50")
    expect(ui.amount.classList.contains("is-invalid")).toBe(true)
  })

  it("con tarjeta pide banco y con efectivo lo esconde y lo limpia", async () => {
    const ui = mount()
    const answer = askPayment(ui.overlay, saleWith())

    ui.amount.value = "550.50"
    fire(ui.amount, "input")
    ui.method.value = "credit_card"
    fire(ui.method, "change")

    expect(ui.bankField.hidden).toBe(false)
    expect(ui.confirm.disabled).toBe(true)
    expect(ui.feedback.textContent).toBe("Elegí el banco emisor de la tarjeta")

    ui.bank.value = "BANPRO"
    fire(ui.bank, "change")
    expect(ui.confirm.disabled).toBe(false)

    ui.method.value = "cash"
    fire(ui.method, "change")
    expect(ui.bankField.hidden).toBe(true)
    expect(ui.bank.value).toBe("")

    ui.confirm.click()
    await expect(answer).resolves.toMatchObject({ ok: true, payload: { payment_bank: null } })
  })

  it("el banco se pide con tarjeta y viaja en el payload", async () => {
    const ui = mount()
    const answer = askPayment(ui.overlay, saleWith())

    ui.amount.value = "500"
    fire(ui.amount, "input")
    ui.method.value = "credit_card"
    fire(ui.method, "change")
    ui.bank.value = "Ficohsa"
    fire(ui.bank, "change")
    ui.note.value = "  Abono parcial  "
    fire(ui.note, "input")
    ui.confirm.click()

    await expect(answer).resolves.toEqual({
      ok: true,
      payload: {
        amount: "500.00",
        paid_at: `${todayLocal()}T00:00:00.000Z`,
        payment_method: "credit_card",
        payment_bank: "Ficohsa",
        note: "Abono parcial",
      },
    })
  })

  it("un clic en el fondo cierra sin registrar", async () => {
    const ui = mount()
    const answer = askPayment(ui.overlay, saleWith())

    ui.overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await expect(answer).resolves.toEqual({ ok: false })
  })

  it("sin overlay montado no inventa un pago", async () => {
    await expect(askPayment(null, saleWith())).resolves.toEqual({ ok: false })
  })
})
