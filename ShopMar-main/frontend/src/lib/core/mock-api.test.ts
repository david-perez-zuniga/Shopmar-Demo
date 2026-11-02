import { beforeEach, describe, expect, it } from "vitest"
import { handleMockRequest, resetMockState } from "./mock-api"
import type { ICreateExpenseRequest, IExpenseResponse, ISaleResponse } from "./types"

const get = <T>(path: string): Promise<T> => handleMockRequest<T>(path)
const post = <T>(path: string, body: unknown): Promise<T> =>
  handleMockRequest<T>(path, { method: "POST", body: JSON.stringify(body) })

beforeEach(() => {
  resetMockState()
})

describe("el backend de mentira", () => {
  it("arranca con datos de ventas, clientes y gastos", async () => {
    const { expenses } = await get<{ expenses: IExpenseResponse[] }>("/expenses")
    const { customers } = await get<{ customers: unknown[] }>("/customers")
    const { sales } = await get<{ sales: unknown[] }>("/sales")

    expect(expenses.length).toBeGreaterThan(0)
    expect(customers.length).toBeGreaterThan(0)
    expect(sales.length).toBeGreaterThan(0)
  })

  it("registra un gasto y lo devuelve en el listado del día", async () => {
    const today = new Date().toISOString().slice(0, 10)
    const created = await post<IExpenseResponse>("/expenses", {
      name: "Gasto de prueba",
      description: "Registrado desde la demo",
      total: "123.45",
      expense_date: today,
    } satisfies ICreateExpenseRequest)

    expect(created.id).toBeTruthy()
    expect(created.total).toBe("123.45")

    const { expenses } = await get<{ expenses: IExpenseResponse[] }>(
      `/expenses?start_date=${today}&end_date=${today}`,
    )
    expect(expenses.some((expense) => expense.id === created.id)).toBe(true)
  })

  it("registra una venta y la devuelve en el listado", async () => {
    const before = await get<{ total: number }>("/sales")
    const created = await post<ISaleResponse>("/sales/live", {
      customer_name: "Cliente de prueba",
      product_name: "Producto de prueba",
      payment_method: "cash",
      status: "completed",
      amount_paid: "500.00",
      cost: "500.00",
    })

    expect(created.total).toBe("500.00")
    const after = await get<{ total: number }>("/sales")
    expect(after.total).toBe(before.total + 1)
  })

  it("el resumen refleja el gasto recién registrado", async () => {
    const today = new Date().toISOString().slice(0, 10)
    const before = await get<{ total_expenses: string }>(
      `/dashboard/summary?start_date=${today}&end_date=${today}`,
    )
    await post("/expenses", { name: "Nuevo gasto", total: "10.00", expense_date: today })
    const after = await get<{ total_expenses: string }>(
      `/dashboard/summary?start_date=${today}&end_date=${today}`,
    )

    expect(Number(after.total_expenses)).toBe(Number(before.total_expenses) + 10)
  })
})
