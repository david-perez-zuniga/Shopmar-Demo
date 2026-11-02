/**
 * Detalles del cliente (S19, S22): el modelo de vista puro que abre el diálogo.
 *
 * Tres reglas, las tres verificables sin DOM: qué `customer` de la URL se
 * acepta, qué dice el encabezado del detalle y qué filas del historial de
 * compras se listan, con su resumen. El cableado del `<dialog>` vive en
 * `pages/customers/index.astro`.
 */

import { describe, expect, it } from "vitest"
import { saleListRowDefaults } from "../core/fixtures"
import type { ICustomerWithBalances, ISaleListRow } from "../core/types"
import {
  CUSTOMER_PURCHASES_EMPTY,
  customerDetailHref,
  customerDetailView,
  customerIdFromSearch,
  customerPurchaseHistory,
} from "./customer-detail"

const CUSTOMER_ID = "c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42"
const SALE_ID = "3f9c2b1a-0000-4000-8000-000000000000"

function customer(overrides: Partial<ICustomerWithBalances> = {}): ICustomerWithBalances {
  return {
    id: CUSTOMER_ID,
    name: "María González",
    phone: "8888 1234",
    note: "Paga los viernes",
    created_at: "2026-09-28T15:12:44.318Z",
    updated_at: "2026-09-28T15:12:44.318Z",
    outstanding_balance: "1600.50",
    overdue_balance: "200.00",
    ...overrides,
  }
}

function sale(overrides: Partial<ISaleListRow> = {}): ISaleListRow {
  return {
    ...saleListRowDefaults,
    id: SALE_ID,
    sale_date: "2026-03-14T15:30:00.000Z",
    customer_name: "María González",
    product_name: "Camisa",
    type: "live",
    status: "pending",
    cost: "1000.00",
    payment_method: "cash",
    shipment_method: "delivery",
    additional_count: 0,
    total: "1200.00",
    ...overrides,
  }
}

function creditSale(overrides: Partial<ISaleListRow> = {}): ISaleListRow {
  return sale({
    customer_id: CUSTOMER_ID,
    payment_terms: "credit",
    due_date: "2026-04-01",
    paid_total: "0.00",
    balance: "1200.00",
    ...overrides,
  })
}

describe("customerIdFromSearch", () => {
  it("saca el id de `?customer=` para que la URL sea compartible", () => {
    expect(customerIdFromSearch(`?customer=${CUSTOMER_ID}`)).toBe(CUSTOMER_ID)
  })

  it("sin el parámetro no hay cliente que abrir", () => {
    expect(customerIdFromSearch("")).toBeNull()
    expect(customerIdFromSearch("?q=María")).toBeNull()
  })

  it("un `customer` vacío o en blanco no es un id", () => {
    expect(customerIdFromSearch("?customer=")).toBeNull()
    expect(customerIdFromSearch("?customer")).toBeNull()
    expect(customerIdFromSearch("?customer=%20%20")).toBeNull()
  })

  it("recorta lo que venga alrededor del id", () => {
    expect(customerIdFromSearch("?customer=%20abc%20")).toBe("abc")
  })

  it("lo lee aunque no sea el primer parámetro de la query", () => {
    expect(customerIdFromSearch(`?q=Gonz%C3%A1lez&customer=${CUSTOMER_ID}`)).toBe(CUSTOMER_ID)
  })
})

describe("customerDetailHref", () => {
  it("arma el enlace canónico a los detalles de un cliente", () => {
    expect(customerDetailHref(CUSTOMER_ID)).toBe(`/customers?customer=${CUSTOMER_ID}`)
  })
})

describe("customerDetailView", () => {
  it("muestra nombre, teléfono y nota del cliente", () => {
    const view = customerDetailView(customer())

    expect(view.customerId).toBe(CUSTOMER_ID)
    expect(view.name).toBe("María González")
    expect(view.phone).toBe("8888 1234")
    expect(view.note).toBe("Paga los viernes")
  })

  it("un teléfono o una nota ausentes se pintan con guion y no en blanco", () => {
    const view = customerDetailView(customer({ phone: null, note: null }))

    expect(view.phone).toBe("—")
    expect(view.note).toBe("—")
  })

  it("formatea el saldo por cobrar y el vencido como dinero", () => {
    const view = customerDetailView(customer())

    expect(view.outstanding).toBe("C$ 1,600.50")
    expect(view.overdue).toBe("C$ 200.00")
  })

  it("un cliente sin deuda muestra cero, nunca un guion", () => {
    const view = customerDetailView(
      customer({ outstanding_balance: "0.00", overdue_balance: "0.00" }),
    )

    expect(view.outstanding).toBe("C$ 0.00")
    expect(view.overdue).toBe("C$ 0.00")
  })

  it("sólo marca el vencido cuando hay algo vencido", () => {
    expect(customerDetailView(customer()).overdueAlert).toBe(true)

    const vigente = customerDetailView(
      customer({ outstanding_balance: "1600.50", overdue_balance: "0.00" }),
    )
    expect(vigente.overdueAlert).toBe(false)
  })
})

describe("customerPurchaseHistory: las filas", () => {
  it("lista todas las compras del cliente, de contado y a crédito", () => {
    const history = customerPurchaseHistory([
      creditSale({ id: "credito-1" }),
      sale({ id: "contado-1", payment_terms: "immediate", balance: null }),
    ])

    expect(history.rows.map((row) => row.id)).toEqual(["credito-1", "contado-1"])
  })

  it("una fila de contado trae fecha, mercadería, condición, estado y total", () => {
    const [row] = customerPurchaseHistory([
      sale({ payment_terms: "immediate", balance: null, status: "completed" }),
    ]).rows

    expect(row).toEqual({
      id: SALE_ID,
      href: `/sales/detail?id=${SALE_ID}`,
      date: "14/03/2026",
      product: "Camisa",
      terms: "Contado",
      status: "Completada",
      total: "C$ 1,200.00",
      // Un pendiente de contado no es una deuda: la fila no inventa un saldo.
      balance: null,
      overdue: false,
    })
  })

  it("una fila a crédito suma su condición, saldo y estado pendiente", () => {
    const [row] = customerPurchaseHistory([creditSale()]).rows

    expect(row?.terms).toBe("Crédito")
    expect(row?.balance).toBe("C$ 1,200.00")
    expect(row?.status).toBe("Pendiente")
  })

  it("una venta ya saldada muestra su saldo en cero", () => {
    const [row] = customerPurchaseHistory([
      creditSale({ paid_total: "1200.00", balance: "0.00", status: "completed" }),
    ]).rows

    expect(row?.balance).toBe("C$ 0.00")
    expect(row?.status).toBe("Completada")
  })

  it("marca la venta vencida sólo cuando la API lo dice", () => {
    const [vencida] = customerPurchaseHistory([creditSale({ is_overdue: true })]).rows
    const [vigente] = customerPurchaseHistory([creditSale({ is_overdue: false })]).rows

    expect(vencida?.overdue).toBe(true)
    expect(vigente?.overdue).toBe(false)
  })

  it("una venta de contado nunca se marca vencida, aunque la bandera venga sucia", () => {
    const [row] = customerPurchaseHistory([
      sale({ payment_terms: "immediate", balance: null, is_overdue: true }),
    ]).rows

    expect(row?.overdue).toBe(false)
  })

  it("una venta cancelada se lee con su estado, sin cambiar el resto", () => {
    const [row] = customerPurchaseHistory([creditSale({ status: "cancelled" })]).rows

    expect(row?.status).toBe("Cancelada")
  })

  it("respeta el orden de la API: la más reciente primero", () => {
    const history = customerPurchaseHistory([
      creditSale({ id: "reciente", sale_date: "2026-03-20T15:30:00.000Z" }),
      sale({ id: "vieja", sale_date: "2026-03-01T15:30:00.000Z" }),
    ])

    expect(history.rows.map((row) => row.id)).toEqual(["reciente", "vieja"])
  })
})

describe("customerPurchaseHistory: el resumen", () => {
  it("cuenta las compras y suma los totales como dinero", () => {
    const history = customerPurchaseHistory([
      creditSale({ id: "uno", total: "1200.00" }),
      sale({ id: "dos", total: "1250.50" }),
    ])

    expect(history.count).toBe(2)
    expect(history.countLabel).toBe("2 compras")
    expect(history.total).toBe("C$ 2,450.50")
    expect(history.summary).toBe("2 compras · Total comprado C$ 2,450.50")
  })

  it("suma en centavos: diez más veinte centavos no arrastra el error del punto flotante", () => {
    const history = customerPurchaseHistory([
      sale({ id: "uno", total: "0.10" }),
      sale({ id: "dos", total: "0.20" }),
    ])

    expect(history.total).toBe("C$ 0.30")
  })

  it("con una sola compra el conteo va en singular", () => {
    expect(customerPurchaseHistory([sale()]).countLabel).toBe("1 compra")
  })

  it("sin compras no inventa filas y el resumen queda en cero", () => {
    const history = customerPurchaseHistory([])

    expect(history.rows).toEqual([])
    expect(history.count).toBe(0)
    expect(history.countLabel).toBe("0 compras")
    expect(history.total).toBe("C$ 0.00")
  })

  it("el texto del listado vacío se exporta para que la pantalla no lo repita", () => {
    expect(CUSTOMER_PURCHASES_EMPTY).toBe("Sin compras registradas")
  })
})
