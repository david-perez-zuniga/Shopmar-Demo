import { describe, expect, it } from "vitest"
import { INVOICE_PAYMENTS_EMPTY, groupInvoiceRows, invoicePayments } from "./invoice"
import type {
  AdditionalSaleKind,
  IAdditionalSaleResponse,
  ISalePaymentResponse,
  ISaleResponse,
} from "../core/types"

type SaleItem = {
  name: string
  total: string
  kind: AdditionalSaleKind
  quantity?: number
  description?: string | null
}

function sale(items: SaleItem[]): ISaleResponse {
  const stamp = "2026-10-04T00:00:00.000Z"
  return {
    id: "sale-1",
    type: "live",
    customer_name: "Ana",
    product_name: "Camisa",
    cost: "1000.00",
    status: "pending",
    payment_method: "cash",
    payment_bank: null,
    sale_date: stamp,
    additional_count: items.length,
    additional_items: items.map(
      (item, index): IAdditionalSaleResponse => ({
        id: `item-${index}`,
        sale_id: "sale-1",
        created_at: stamp,
        updated_at: stamp,
        name: item.name,
        description: item.description ?? null,
        quantity: item.quantity ?? 1,
        total: item.total,
        kind: item.kind,
      }),
    ),
  } as ISaleResponse
}

const merch = (name: string, total: string) => ({ name, total, kind: "merchandise" as const })

describe("groupInvoiceRows", () => {
  it("las cuatro mercaderías van en UNA sola lista, con el producto principal primero", () => {
    const groups = groupInvoiceRows(
      sale([
        merch("Segunda", "1500.00"),
        merch("Tercera", "800.00"),
        merch("Cuarta", "700.00"),
      ]),
    )
    expect(groups.merchandise).toEqual([
      { name: "Camisa", total: "1000.00" },
      { name: "Segunda", total: "1500.00" },
      { name: "Tercera", total: "800.00" },
      { name: "Cuarta", total: "700.00" },
    ])
  })

  it("el producto principal es SIEMPRE la primera fila, y las extras se cuentan aparte", () => {
    const groups = groupInvoiceRows(sale([merch("Segunda", "1500.00")]))
    expect(groups.merchandise[0]?.name).toBe("Camisa")
    expect(groups.merchandise).toHaveLength(2)
    expect(groups.merchandiseExtras).toBe(1)
  })

  it("la venta simple queda con una sola fila y sin línea de suma de extras", () => {
    const groups = groupInvoiceRows(sale([]))
    expect(groups.merchandise).toEqual([{ name: "Camisa", total: "1000.00" }])
    expect(groups.merchandiseExtrasSum).toBe("")
    expect(groups.additionalSum).toBe("0.00")
    expect(groups.total).toBe("1000.00")
  })

  it("la mercadería y los artículos adicionales van en listas separadas", () => {
    const groups = groupInvoiceRows(
      sale([
        merch("Segunda", "1500.00"),
        { name: "Cinturón", description: "Cuero", quantity: 2, total: "600.00", kind: "additional" },
      ]),
    )
    expect(groups.merchandise.map((row) => row.name)).toEqual(["Camisa", "Segunda"])
    expect(groups.additional).toEqual([
      { quantity: 2, name: "Cinturón", description: "Cuero", total: "600.00" },
    ])
    expect(groups.merchandiseExtrasSum).toBe("1500.00")
    expect(groups.additionalSum).toBe("600.00")
  })

  it("un renglón sin kind cae en artículos adicionales y NO desaparece", () => {
    const groups = groupInvoiceRows(
      sale([{ name: "Legacy", total: "100.00", quantity: 1, kind: undefined as never }]),
    )
    expect(groups.additional).toHaveLength(1)
    expect(groups.additional[0]?.name).toBe("Legacy")
    expect(groups.merchandise).toHaveLength(1)
  })

  it("la descripción ausente se muestra como guion en los artículos", () => {
    const groups = groupInvoiceRows(
      sale([{ name: "Anillo", quantity: 1, total: "200.00", kind: "additional" }]),
    )
    expect(groups.additional[0]?.description).toBe("—")
  })

  it("el total suma el producto principal y todos los renglones, sin decimales de basura", () => {
    const groups = groupInvoiceRows(
      sale([
        merch("Segunda", "1750.10"),
        { name: "Anillo", quantity: 1, total: "0.20", kind: "additional" },
      ]),
    )
    expect(groups.total).toBe("2750.30")
  })

  it("los dos grupos suman el total, para que la factura se pueda verificar a mano", () => {
    const groups = groupInvoiceRows(
      sale([merch("Segunda", "1500.00"), { name: "Anillo", quantity: 1, total: "500.00", kind: "additional" }]),
    )
    const cents = (money: string) => Math.round(Number(money) * 100)
    expect(cents(groups.total)).toBe(
      cents(groups.merchandise[0]!.total) + cents(groups.merchandiseExtrasSum) + cents(groups.additionalSum),
    )
  })

  it("sin venta no hay filas ni total, y la factura se arma igual para imprimir", () => {
    const groups = groupInvoiceRows(null)
    expect(groups.merchandise).toEqual([])
    expect(groups.additional).toEqual([])
    expect(groups.total).toBe("")
  })

  it("la fila principal está aunque la venta sea solo de artículos adicionales", () => {
    const groups = groupInvoiceRows(
      sale([{ name: "Solo artículo", quantity: 1, total: "50.00", kind: "additional" }]),
    )
    expect(groups.merchandise).toEqual([{ name: "Camisa", total: "1000.00" }])
    expect(groups.merchandiseExtras).toBe(0)
    expect(groups.merchandiseExtrasSum).toBe("")
    expect(groups.additional).toHaveLength(1)
  })
})
const STAMP = "2026-03-14T15:30:00.000Z"

function payment(overrides: Partial<ISalePaymentResponse> = {}): ISalePaymentResponse {
  return {
    id: "pay-1",
    sale_id: "sale-1",
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

function saleWithPayments(payments: ISalePaymentResponse[]): ISaleResponse {
  return {
    ...sale([]),
    payment_terms: "credit",
    due_date: "2026-04-01T00:00:00.000Z",
    paid_total: "500.00",
    balance: "500.00",
    is_overdue: false,
    payments,
    payments_count: payments.length,
  }
}

describe("invoicePayments", () => {
  it("sin venta no hay pagos que imprimir", () => {
    expect(invoicePayments(null)).toEqual([])
  })

  it("el aviso del libro vacío está en una sola constante", () => {
    expect(INVOICE_PAYMENTS_EMPTY).toBe("Sin pagos registrados")
  })

  it("una venta sin pagos no imprime renglones", () => {
    expect(invoicePayments(saleWithPayments([]))).toEqual([])
  })

  it("ordena por fecha de pago, aunque la API los entregue en otro orden", () => {
    const rows = invoicePayments(
      saleWithPayments([
        payment({ id: "p3", amount: "100.00", paid_at: "2026-03-25T10:00:00.000Z" }),
        payment({ id: "p1", amount: "300.00", paid_at: "2026-03-10T10:00:00.000Z" }),
        payment({ id: "p2", amount: "200.00", paid_at: "2026-03-18T10:00:00.000Z" }),
      ]),
    )

    expect(rows.map((row) => row.amount)).toEqual(["C$ 300.00", "C$ 200.00", "C$ 100.00"])
  })

  it("dos pagos del mismo día se desempatan por id", () => {
    const rows = invoicePayments(
      saleWithPayments([
        payment({ id: "b", amount: "20.00" }),
        payment({ id: "a", amount: "10.00" }),
      ]),
    )

    expect(rows.map((row) => row.amount)).toEqual(["C$ 10.00", "C$ 20.00"])
  })

  it("cada pago lleva su fecha, su método y su importe formateado", () => {
    const rows = invoicePayments(
      saleWithPayments([
        payment({
          amount: "1250.50",
          paid_at: "2026-03-10T10:00:00.000Z",
          payment_method: "credit_card",
          payment_bank: "BAC Credomatic",
        }),
      ]),
    )

    // `paid_at` es un instante: se muestra en la hora local, así que la fecha y
    // la hora salen del huso de la máquina y el test las calcula igual.
    const expectedDate = new Date("2026-03-10T10:00:00.000Z").toLocaleString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    expect(rows).toEqual([
      {
        date: expectedDate,
        method: "Tarjeta de crédito — BAC Credomatic",
        amount: "C$ 1,250.50",
      },
    ])
  })

  it("el efectivo nunca nombra banco", () => {
    const rows = invoicePayments(
      saleWithPayments([payment({ payment_method: "cash", payment_bank: "BAC Credomatic" })]),
    )

    expect(rows[0]?.method).toBe("Efectivo")
  })

  it("una tarjeta sin banco se imprime sin guion suelto", () => {
    const rows = invoicePayments(
      saleWithPayments([payment({ payment_method: "credit_card", payment_bank: null })]),
    )

    expect(rows[0]?.method).toBe("Tarjeta de crédito")
  })

  it("los importes salen con los helpers de dinero, sin parseFloat", () => {
    const rows = invoicePayments(saleWithPayments([payment({ amount: "1234567.80" })]))

    expect(rows[0]?.amount).toBe("C$ 1,234,567.80")
  })
})
