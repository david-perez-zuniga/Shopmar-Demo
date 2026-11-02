import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  PAYMENT_TERMS_LABELS,
  SALE_DETAIL_HOOKS,
  creditLines,
  creditView,
  customerLink,
  paymentTermsLabel,
  paymentText,
  renderSaleDetail,
  saleDetailFromLocation,
  saleDetailView,
  saleNumber,
  typeLabels,
} from "./sale-detail"
import type { IAdditionalSaleResponse, ISalePaymentResponse, ISaleResponse } from "../core/types"
import { saleResponseDefaults } from "../core/fixtures"

const SALE_ID = "3f9c2b1a-0000-4000-8000-000000000000"
const STAMP = "2026-03-14T15:30:00.000Z"

function item(overrides: Partial<IAdditionalSaleResponse> = {}): IAdditionalSaleResponse {
  return {
    id: "item-1",
    sale_id: SALE_ID,
    name: "Medias",
    description: null,
    quantity: 1,
    total: "100.00",
    kind: "additional",
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  }
}

function sale(overrides: Partial<ISaleResponse> = {}): ISaleResponse {
  return {
    ...saleResponseDefaults,
    id: SALE_ID,
    type: "live",
    customer_name: "Ana Pérez",
    product_name: "Camisa",
    category: ["camisas"],
    payment_method: "cash",
    payment_bank: null,
    sale_date: STAMP,
    status: "pending",
    cost: "1000.00",
    shipment_method: "delivery",
    amount_paid: null,
    change_given: null,
    created_at: STAMP,
    updated_at: STAMP,
    additional_items: [],
    additional_count: 0,
    total: "1000.00",
    ...overrides,
  }
}

describe("saleDetailView: las cuatro combinaciones de canal y pago", () => {
  it("live + efectivo", () => {
    const view = saleDetailView(sale({ type: "live", payment_method: "cash" }))
    expect(view.typeLabel).toBe(typeLabels.live)
    expect(view.typeLabel).toBe("Venta por Live")
    expect(view.paymentText).toBe("Efectivo")
  })

  it("live + tarjeta con banco", () => {
    const view = saleDetailView(
      sale({ type: "live", payment_method: "credit_card", payment_bank: "Banco de Bogotá" }),
    )
    expect(view.typeLabel).toBe("Venta por Live")
    expect(view.paymentText).toBe("Tarjeta — Banco de Bogotá")
  })

  it("whatsapp + efectivo", () => {
    const view = saleDetailView(sale({ type: "whatsapp", payment_method: "cash" }))
    expect(view.typeLabel).toBe("Venta en tienda")
    expect(view.paymentText).toBe("Efectivo")
  })

  it("whatsapp + tarjeta sin banco", () => {
    const view = saleDetailView(
      sale({ type: "whatsapp", payment_method: "credit_card", payment_bank: null }),
    )
    expect(view.typeLabel).toBe("Venta en tienda")
    expect(view.paymentText).toBe("Tarjeta")
  })

  // S57: una venta a crédito no se cobró en el momento, así que su línea de pago
  // no puede decir «Efectivo» —que es el valor de registro que guarda el
  // servidor—. Dice «Crédito» y cada abono del bloque «Pagos» conserva su método.
  it("a crédito la línea de pago dice Crédito, no Efectivo (S57)", () => {
    const view = saleDetailView(
      sale({ payment_terms: "credit", payment_method: "cash", payment_bank: null }),
    )

    expect(view.credit.terms).toBe("Crédito")
    expect(view.paymentText).toBe("Crédito")
  })
})

describe("paymentText", () => {
  it("el efectivo nunca lleva banco", () => {
    expect(paymentText({ payment_method: "cash", payment_bank: "Banco X" })).toBe("Efectivo")
  })

  it("la tarjeta con banco lo nombra", () => {
    expect(paymentText({ payment_method: "credit_card", payment_bank: "BAC" })).toBe(
      "Tarjeta — BAC",
    )
  })

  it("una venta a crédito dice Crédito aunque haya banco guardado (S57)", () => {
    expect(
      paymentText({
        payment_terms: "credit",
        payment_method: "credit_card",
        payment_bank: "BAC",
      }),
    ).toBe("Crédito")
  })
})

describe("saleNumber", () => {
  it("usa los ocho primeros caracteres del id", () => {
    expect(saleNumber(SALE_ID)).toBe("3f9c2b1a")
  })

  it("un id corto no se rellena", () => {
    expect(saleNumber("abc")).toBe("abc")
  })
})

describe("saleDetailView: badge, fecha, total y meta", () => {
  it("arma la clase del badge y su rótulo desde el estado", () => {
    expect(saleDetailView(sale({ status: "pending" })).statusClass).toBe("badge badge--pending")
    expect(saleDetailView(sale({ status: "pending" })).statusLabel).toBe("Pendiente")
    expect(saleDetailView(sale({ status: "completed" })).statusClass).toBe("badge badge--completed")
    expect(saleDetailView(sale({ status: "cancelled" })).statusLabel).toBe("Cancelada")
  })

  it("deriva fecha, total y la línea .detail-meta de groupInvoiceRows", () => {
    const view = saleDetailView(
      sale({
        cost: "1000.00",
        additional_count: 2,
        additional_items: [
          item({ id: "m1", total: "300.00", kind: "merchandise" }),
          item({ id: "a1", total: "500.00", kind: "additional" }),
        ],
      }),
    )

    expect(view.date).toBe("14/03/2026")
    expect(view.total).toBe("1800.00")
    // `created_at` es un instante: la línea se lee en la hora local, así que la
    // fecha depende del huso de la máquina.
    const created = new Date(STAMP).toLocaleString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    expect(view.meta.created).toBe(`Creada ${created}`)
    // Las dos líneas son instantes: se leen en la hora local, igual que `created`.
    expect(view.meta.updated).toBe(`Actualizada ${created}`)
    expect(view.meta.rows).toBe("Renglones: 2")
    expect(view.groups.merchandise).toHaveLength(2)
    expect(view.groups.additional).toHaveLength(1)
  })
})

describe("saleDetailFromLocation", () => {
  it("saca el id de una URL relativa", () => {
    expect(saleDetailFromLocation("/sales/detail?id=abc")).toEqual({
      valid: true,
      id: "abc",
      print: false,
    })
  })

  it("lee print=1", () => {
    expect(saleDetailFromLocation("/sales/detail?id=abc&print=1")).toEqual({
      valid: true,
      id: "abc",
      print: true,
    })
  })

  it("ignora parámetros extra y toma el id aunque no sea el primero", () => {
    expect(saleDetailFromLocation("/sales/detail?page=2&id=abc&print=0")).toEqual({
      valid: true,
      id: "abc",
      print: false,
    })
  })

  it("una URL sin id no es válida", () => {
    expect(saleDetailFromLocation("/sales/detail?print=1")).toEqual({
      valid: false,
      id: "",
      print: true,
    })
  })

  it("acepta una URL absoluta", () => {
    expect(saleDetailFromLocation("http://localhost:4321/sales/detail?id=9")).toEqual({
      valid: true,
      id: "9",
      print: false,
    })
  })
})

/**
 * Markup de `InvoicePrint.astro` con `sale={null}`: los mismos ganchos, vacíos.
 * La prueba de contrato de abajo comprueba que los nombres coincidan con el
 * componente real.
 */
function invoiceFixture(): string {
  return `
    <div class="invoice">
      <header class="invoice-head">
        <dl class="invoice-id">
          <div class="invoice-id-row"><dt>Venta</dt><dd data-invoice-number></dd></div>
          <div class="invoice-id-row"><dt>Fecha</dt><dd data-invoice-date></dd></div>
        </dl>
      </header>
      <section class="sale-block">
        <dl class="invoice-data">
          <div><dt>Cliente</dt><dd data-invoice-customer></dd></div>
          <div><dt>Mercadería</dt><dd data-invoice-product></dd></div>
          <div><dt>Canal</dt><dd data-invoice-type></dd></div>
          <div><dt>Pago</dt><dd data-invoice-payment></dd></div>
          <div><dt>Condición</dt><dd data-invoice-terms></dd></div>
          <div><dt>Estado</dt><dd data-invoice-status><span class="badge badge--pending">Pendiente</span></dd></div>
        </dl>
        <table class="invoice-table">
          <thead><tr><th>Mercadería</th><th class="num">Importe</th></tr></thead>
          <tbody data-invoice-merchandise-rows></tbody>
        </table>
        <p class="additional-sum" data-invoice-merchandise-extras hidden>
          <span>Suma de mercadería (sin el producto principal)</span>
          <span class="num" data-invoice-merchandise-extras-sum></span>
        </p>
        <section class="additional" data-invoice-additional hidden>
          <h4 class="additional-title">Artículos adicionales</h4>
          <table class="invoice-table">
            <thead>
              <tr><th class="num">Cant.</th><th>Nombre</th><th>Descripción</th><th class="num">Importe</th></tr>
            </thead>
            <tbody data-invoice-additional-rows></tbody>
          </table>
          <p class="additional-sum">
            <span>Suma de artículos</span>
            <span class="num" data-invoice-additional-sum>C$ 0.00</span>
          </p>
        </section>
        <p class="total-row">
          <span class="total-label">Total</span>
          <span class="total" data-invoice-total></span>
        </p>
        <section class="invoice-credit" data-invoice-credit hidden>
          <h4 class="additional-title">Crédito</h4>
          <dl class="invoice-credit-data">
            <div><dt>Vence</dt><dd data-invoice-due-date></dd></div>
            <div><dt>Pagado</dt><dd data-invoice-paid-total></dd></div>
            <div><dt>Saldo</dt><dd data-invoice-balance></dd></div>
          </dl>
          <p class="invoice-overdue" data-invoice-overdue hidden>Vencida</p>
        </section>
        <section class="invoice-payments" data-invoice-payments>
          <h4 class="additional-title">Pagos</h4>
          <table class="invoice-table" data-invoice-payments-table hidden>
            <thead>
              <tr><th>Fecha</th><th>Método</th><th class="num">Importe</th></tr>
            </thead>
            <tbody data-invoice-payment-rows></tbody>
          </table>
          <p class="invoice-payments-empty" data-invoice-payments-empty>Sin pagos registrados</p>
        </section>
      </section>
    </div>
  `
}

function mount(): void {
  document.body.innerHTML = invoiceFixture()
}

function hook<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (element === null) throw new Error(`falta el gancho ${selector}`)
  return element
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("renderSaleDetail: llena todos los ganchos", () => {
  const full = sale({
    customer_name: "Ana Pérez",
    product_name: "Camisa",
    payment_method: "credit_card",
    payment_bank: "BAC",
    status: "completed",
    cost: "1000.00",
    additional_count: 2,
    additional_items: [
      item({ id: "m1", name: "Camisa extra", total: "300.00", kind: "merchandise" }),
      item({
        id: "a1",
        name: "Cinturón",
        description: "Cuero",
        quantity: 2,
        total: "500.00",
        kind: "additional",
      }),
    ],
  })

  it("escribe cada valor del componente", () => {
    mount()
    const view = renderSaleDetail(full)

    expect(hook("[data-invoice-number]").textContent).toBe("3f9c2b1a")
    expect(hook("[data-invoice-date]").textContent).toBe("14/03/2026")
    expect(hook("[data-invoice-customer]").textContent).toBe("Ana Pérez")
    expect(hook("[data-invoice-product]").textContent).toBe("Camisa")
    expect(hook("[data-invoice-type]").textContent).toBe("Venta por Live")
    expect(hook("[data-invoice-payment]").textContent).toBe("Tarjeta — BAC")
    expect(hook("[data-invoice-total]").textContent).toBe("C$ 1,800.00")
    expect(hook("[data-invoice-additional-sum]").textContent).toBe("C$ 500.00")
    expect(view.statusClass).toBe("badge badge--completed")
  })

  it("cambia la clase y el texto del badge", () => {
    mount()
    renderSaleDetail(full)

    const badge = hook("[data-invoice-status]").querySelector(".badge")
    expect(badge?.className).toBe("badge badge--completed")
    expect(badge?.textContent).toBe("Completada")
  })

  it("agrega los renglones de mercadería y marca el costo del principal", () => {
    mount()
    renderSaleDetail(full)

    const rows = hook<HTMLTableSectionElement>("[data-invoice-merchandise-rows]").querySelectorAll("tr")
    expect(rows).toHaveLength(2)
    expect(rows[0]?.querySelectorAll("td")[0]?.textContent).toBe("Camisa")
    expect(rows[0]?.querySelector("[data-invoice-cost-name]")).not.toBeNull()
    expect(rows[0]?.querySelector("[data-invoice-cost]")?.textContent).toBe("C$ 1,000.00")
    expect(rows[1]?.textContent).toContain("Camisa extra")
    expect(rows[1]?.textContent).toContain("C$ 300.00")
  })

  it("agrega los artículos adicionales y destapa la sección", () => {
    mount()
    renderSaleDetail(full)

    const section = hook("[data-invoice-additional]")
    expect(section.hidden).toBe(false)

    const row = hook<HTMLTableSectionElement>("[data-invoice-additional-rows]").querySelector("tr")
    expect(row?.textContent).toContain("2")
    expect(row?.textContent).toContain("Cinturón")
    expect(row?.textContent).toContain("Cuero")
    expect(row?.textContent).toContain("C$ 500.00")
    expect(row?.querySelector("[data-invoice-additional-description]")?.textContent).toBe("Cuero")
  })

  it("prende la línea de suma de mercadería extra con su importe", () => {
    mount()
    renderSaleDetail(full)

    const sum = hook("[data-invoice-merchandise-extras]")
    expect(sum.hidden).toBe(false)
    expect(sum.textContent).toContain("Suma de mercadería (sin el producto principal)")
    expect(hook("[data-invoice-merchandise-extras-sum]").textContent).toBe("C$ 300.00")
  })

  it("sin mercadería extra deja la línea oculta", () => {
    mount()
    renderSaleDetail(
      sale({ additional_items: [item({ kind: "additional", total: "500.00" })] }),
    )

    expect(hook("[data-invoice-merchandise-extras]").hidden).toBe(true)
    expect(hook("[data-invoice-merchandise-extras-sum]").textContent).toBe("")
  })

  it("hace visible la capa", () => {
    mount()
    renderSaleDetail(full)
    expect(document.querySelector(".invoice")?.classList.contains("invoice--visible")).toBe(true)
  })

  it("sin artículos adicionales oculta la sección y vacía su cuerpo", () => {
    mount()
    renderSaleDetail(sale({ additional_items: [], additional_count: 0 }))

    expect(hook("[data-invoice-additional]").hidden).toBe(true)
    expect(hook("[data-invoice-additional-rows]").children).toHaveLength(0)
    expect(hook("[data-invoice-merchandise-extras]").hidden).toBe(true)
  })

  it("no deja ningún gancho sin escribir", () => {
    mount()
    renderSaleDetail(full)

    for (const name of SALE_DETAIL_HOOKS) {
      expect(document.querySelector(`[${name}]`), `sin escribir: ${name}`).not.toBeNull()
    }
    expect(hook("[data-invoice-number]").textContent).not.toBe("")
    expect(hook("[data-invoice-date]").textContent).not.toBe("")
  })
})

describe("contrato con InvoicePrint.astro", () => {
  it("cada gancho que escribe renderSaleDetail existe en el componente", () => {
    const component = readFileSync(resolve("src/components/InvoicePrint.astro"), "utf8")
    const declared = new Set(component.match(/data-invoice-[a-z0-9-]+/g) ?? [])

    for (const name of SALE_DETAIL_HOOKS) {
      expect(declared.has(name), `${name} no existe en InvoicePrint.astro`).toBe(true)
    }
  })
})

/** Una venta a crédito con deuda, que es la que la factura no puede dar por cobrada. */
function creditSale(overrides: Partial<ISaleResponse> = {}): ISaleResponse {
  return sale({
    payment_terms: "credit",
    customer_id: "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16",
    due_date: "2026-04-01T00:00:00.000Z",
    paid_total: "500.00",
    balance: "1300.00",
    is_overdue: false,
    ...overrides,
  })
}

function payment(overrides: Partial<ISalePaymentResponse> = {}): ISalePaymentResponse {
  return {
    id: "pay-1",
    sale_id: SALE_ID,
    amount: "500.00",
    paid_at: STAMP,
    payment_method: "cash",
    payment_bank: null,
    note: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  }
}

describe("paymentTermsLabel", () => {
  it("traduce las dos condiciones de pago al vocabulario de la pantalla", () => {
    expect(paymentTermsLabel("immediate")).toBe("Contado")
    expect(paymentTermsLabel("credit")).toBe("Crédito")
  })

  it("el vocabulario vive en una sola tabla exportada", () => {
    expect(PAYMENT_TERMS_LABELS).toEqual({ immediate: "Contado", credit: "Crédito" })
  })
})

describe("creditLines", () => {
  it("una venta de contado no muestra ninguna línea de crédito", () => {
    expect(creditLines(sale())).toEqual([])
  })

  it("su balance nulo no es deuda: la venta de contado no inventa un saldo", () => {
    const lines = creditLines(sale({ balance: null, paid_total: "1000.00" }))
    expect(lines).toEqual([])
  })

  it("una venta a crédito muestra vencimiento, pagado y saldo, en ese orden", () => {
    expect(creditLines(creditSale())).toEqual([
      { label: "Vence", value: "01/04/2026" },
      { label: "Pagado", value: "C$ 500.00" },
      { label: "Saldo", value: "C$ 1,300.00" },
    ])
  })

  it("una venta a crédito sin pagos muestra el pagado en cero y el saldo completo", () => {
    expect(creditLines(creditSale({ paid_total: "0.00", balance: "1800.00" }))).toEqual([
      { label: "Vence", value: "01/04/2026" },
      { label: "Pagado", value: "C$ 0.00" },
      { label: "Saldo", value: "C$ 1,800.00" },
    ])
  })

  it("una venta a crédito ya cubierta sigue mostrando las tres líneas, con saldo cero", () => {
    const lines = creditLines(creditSale({ paid_total: "1800.00", balance: "0.00" }))
    expect(lines.map((line) => line.label)).toEqual(["Vence", "Pagado", "Saldo"])
    expect(lines[2]).toEqual({ label: "Saldo", value: "C$ 0.00" })
  })

  it("los importes salen formateados como dinero, sin pasarlos por parseFloat", () => {
    const lines = creditLines(creditSale({ paid_total: "838000.00", balance: "1234567.80" }))
    expect(lines[1]?.value).toBe("C$ 838,000.00")
    expect(lines[2]?.value).toBe("C$ 1,234,567.80")
  })

  it("una venta a crédito sin vencimiento no inventa una fecha", () => {
    expect(creditLines(creditSale({ due_date: null }))[0]).toEqual({ label: "Vence", value: "—" })
  })
})

describe("creditView", () => {
  it("la condición aparece en toda venta, de contado o a crédito", () => {
    expect(creditView(sale()).terms).toBe("Contado")
    expect(creditView(sale()).credit).toBe(false)
    expect(creditView(creditSale()).terms).toBe("Crédito")
    expect(creditView(creditSale()).credit).toBe(true)
  })

  it("el marcador de vencida sale del dato derivado de la API", () => {
    expect(creditView(creditSale()).overdue).toBe(false)
    expect(creditView(creditSale({ is_overdue: true })).overdue).toBe(true)
  })

  it("una venta de contado nunca queda marcada como vencida", () => {
    expect(creditView(sale({ is_overdue: true })).overdue).toBe(false)
  })

  it("saleDetailView expone la condición de cobro con sus líneas", () => {
    const view = saleDetailView(creditSale({ is_overdue: true }))
    expect(view.credit.terms).toBe("Crédito")
    expect(view.credit.overdue).toBe(true)
    expect(view.credit.lines).toHaveLength(3)
    expect(saleDetailView(sale()).credit.lines).toEqual([])
  })
})

describe("renderSaleDetail: condición de cobro y libro de pagos", () => {
  it("escribe la condición de una venta de contado y oculta el bloque de crédito", () => {
    mount()
    renderSaleDetail(sale())

    expect(hook("[data-invoice-terms]").textContent).toBe("Contado")
    expect(hook("[data-invoice-credit]").hidden).toBe(true)
    expect(hook("[data-invoice-overdue]").hidden).toBe(true)
  })

  it("escribe vencimiento, pagado, saldo y la condición de una venta a crédito", () => {
    mount()
    renderSaleDetail(creditSale())

    expect(hook("[data-invoice-terms]").textContent).toBe("Crédito")
    expect(hook("[data-invoice-credit]").hidden).toBe(false)
    expect(hook("[data-invoice-due-date]").textContent).toBe("01/04/2026")
    expect(hook("[data-invoice-paid-total]").textContent).toBe("C$ 500.00")
    expect(hook("[data-invoice-balance]").textContent).toBe("C$ 1,300.00")
    expect(hook("[data-invoice-overdue]").hidden).toBe(true)
  })

  it("marca la venta vencida con su palabra, no solo con un color", () => {
    mount()
    renderSaleDetail(creditSale({ is_overdue: true }))

    const marker = hook("[data-invoice-overdue]")
    expect(marker.hidden).toBe(false)
    expect(marker.textContent?.trim()).toBe("Vencida")
  })

  it("una venta a crédito con saldo nunca se pinta como cobrada", () => {
    mount()
    renderSaleDetail(creditSale({ status: "pending", paid_total: "0.00", balance: "1800.00" }))

    expect(hook("[data-invoice-balance]").textContent).toBe("C$ 1,800.00")
    expect(hook("[data-invoice-status]").querySelector(".badge")?.textContent).toBe("Pendiente")
  })

  it("lista cada pago con su fecha, su método y su importe", () => {
    mount()
    renderSaleDetail(
      creditSale({
        payments: [
          payment({ id: "p2", amount: "200.00", paid_at: "2026-03-20T10:00:00.000Z" }),
          payment({ id: "p1", amount: "300.00", paid_at: "2026-03-10T10:00:00.000Z" }),
        ],
        payments_count: 2,
      }),
    )

    expect(hook("[data-invoice-payments-table]").hidden).toBe(false)
    expect(hook("[data-invoice-payments-empty]").hidden).toBe(true)

    const rows = hook<HTMLTableSectionElement>("[data-invoice-payment-rows]").querySelectorAll("tr")
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain("10/03/2026")
    expect(rows[0]?.textContent).toContain("C$ 300.00")
    expect(rows[1]?.textContent).toContain("20/03/2026")
    expect(rows[1]?.textContent).toContain("C$ 200.00")
  })

  it("una venta a crédito sin pagos dice que no hay pagos registrados", () => {
    mount()
    renderSaleDetail(creditSale({ payments: [], payments_count: 0 }))

    expect(hook("[data-invoice-payments-table]").hidden).toBe(true)
    expect(hook("[data-invoice-payments-empty]").hidden).toBe(false)
    expect(hook("[data-invoice-payments-empty]").textContent?.trim()).toBe(
      "Sin pagos registrados",
    )
    expect(hook("[data-invoice-payment-rows]").children).toHaveLength(0)
  })
})

/**
 * S19: el nombre del cliente del recibo y del detalle enlaza a sus detalles.
 * Una venta histórica sin `customer_id` conserva el nombre como texto: no hay
 * a dónde mandar a la dueña y un enlace muerto es peor que una palabra.
 */
const CUSTOMER_ID = "c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42"

describe("customerLink", () => {
  it("con cliente registrado apunta a los detalles en la pantalla de clientes", () => {
    expect(customerLink(sale({ customer_id: CUSTOMER_ID }))).toEqual({
      text: "Ana Pérez",
      href: `/customers?customer=${CUSTOMER_ID}`,
    })
  })

  it("sin cliente registrado el nombre es texto plano", () => {
    expect(customerLink(sale({ customer_id: null }))).toEqual({
      text: "Ana Pérez",
      href: null,
    })
  })
})

describe("renderSaleDetail: el cliente enlaza a sus detalles", () => {
  it("escribe el nombre como enlace cuando la venta tiene customer_id", () => {
    mount()
    renderSaleDetail(sale({ customer_name: "Ana Pérez", customer_id: CUSTOMER_ID }))

    const cell = hook("[data-invoice-customer]")
    const link = cell.querySelector("a")
    expect(link).not.toBeNull()
    expect(link?.getAttribute("href")).toBe(`/customers?customer=${CUSTOMER_ID}`)
    expect(link?.textContent).toBe("Ana Pérez")
    // El texto impreso es el mismo con enlace o sin él.
    expect(cell.textContent?.trim()).toBe("Ana Pérez")
  })

  it("una venta sin customer_id deja el nombre como texto, sin enlace", () => {
    mount()
    renderSaleDetail(sale({ customer_name: "Ana Pérez", customer_id: null }))

    const cell = hook("[data-invoice-customer]")
    expect(cell.querySelector("a")).toBeNull()
    expect(cell.textContent?.trim()).toBe("Ana Pérez")
  })

  it("volver a pintar la misma venta no anida enlaces", () => {
    mount()
    renderSaleDetail(sale({ customer_id: CUSTOMER_ID }))
    renderSaleDetail(sale({ customer_id: CUSTOMER_ID }))

    expect(hook("[data-invoice-customer]").querySelectorAll("a")).toHaveLength(1)
  })
})

describe("contrato con InvoicePrint.astro y la hoja de impresión", () => {
  it("el componente prellena el enlace del cliente desde customer_id", () => {
    const component = readFileSync(resolve("src/components/InvoicePrint.astro"), "utf8")

    expect(component).toMatch(/customerDetailHref/)
    expect(component).toMatch(/customer_id/)
  })

  it("en papel el enlace no cambia lo impreso ni aparece subrayado", () => {
    const styles = readFileSync(resolve("src/styles/global.css"), "utf8")
    const printBlock = styles.slice(styles.indexOf("@media print"))

    expect(printBlock).toMatch(/\.invoice a\s*\{[^}]*text-decoration: none/)
  })
})
