import { describe, expect, it } from "vitest"
import type { ICustomerWithBalances } from "../core/types"
import { customerRowView, isZeroMoney } from "./customer-list"

function customer(overrides: Partial<ICustomerWithBalances> = {}): ICustomerWithBalances {
  return {
    id: "c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42",
    name: "María González",
    phone: "8888 1234",
    note: null,
    created_at: "2026-09-28T15:12:44.318Z",
    updated_at: "2026-09-28T15:12:44.318Z",
    outstanding_balance: "0.00",
    overdue_balance: "0.00",
    ...overrides,
  }
}

describe("customerRowView", () => {
  it("pinta el nombre y el teléfono del cliente", () => {
    const view = customerRowView(customer())

    expect(view.customerId).toBe("c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42")
    expect(view.name.text).toBe("María González")
    expect(view.phone.text).toBe("8888 1234")
  })

  it("un teléfono ausente se pinta con guion, no vacío", () => {
    expect(customerRowView(customer({ phone: null })).phone.text).toBe("—")
  })

  it("formatea los dos saldos con el helper de dinero", () => {
    const view = customerRowView(
      customer({ outstanding_balance: "1600.50", overdue_balance: "200.00" }),
    )

    expect(view.outstanding.text).toBe("C$ 1,600.50")
    expect(view.overdue.text).toBe("C$ 200.00")
  })

  it("un cliente sin deuda muestra 0.00 y nunca un guion", () => {
    const view = customerRowView(customer())

    expect(view.outstanding.text).toBe("C$ 0.00")
    expect(view.overdue.text).toBe("C$ 0.00")
    expect(view.outstanding.text).not.toBe("—")
    expect(view.overdue.text).not.toBe("—")
  })

  it("el saldo por cobrar va alineado a la derecha y en cifras tabulares", () => {
    const view = customerRowView(customer())

    expect(view.outstanding.classes).toContain("right")
    expect(view.outstanding.classes).toContain("num-sm")
    expect(view.overdue.classes).toContain("right")
    expect(view.overdue.classes).toContain("num-sm")
  })

  it("marca el vencido sólo cuando hay algo vencido", () => {
    expect(customerRowView(customer()).overdue.classes).not.toContain("cell-overdue")

    const withOverdue = customerRowView(
      customer({ outstanding_balance: "1600.50", overdue_balance: "1600.50" }),
    )
    expect(withOverdue.overdue.classes).toContain("cell-overdue")
  })

  it("una deuda vigente sin vencimiento no se marca como vencida", () => {
    const view = customerRowView(
      customer({ outstanding_balance: "1600.50", overdue_balance: "0.00" }),
    )

    expect(view.outstanding.classes).toContain("cell-total")
    expect(view.overdue.classes).not.toContain("cell-overdue")
  })

  it("la fila conserva el id del cliente en su clase y en su llave", () => {
    const view = customerRowView(customer())

    expect(view.rowClass).toBe("ledger-row")
    expect(view.customerId).toBe("c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42")
  })
})

describe("isZeroMoney", () => {
  it.each(["0", "0.0", "0.00", "00.00", "000.000"])("reconoce %s como cero", (value) => {
    expect(isZeroMoney(value)).toBe(true)
  })

  it.each(["0.01", "1", "1600.50", "1000.00", "0.10"])("reconoce %s como deuda", (value) => {
    expect(isZeroMoney(value)).toBe(false)
  })
})
