import { describe, expect, it } from "vitest"
import { KPI_FIELDS, operationsLabel, salesKpi } from "./sales-kpi"
import type { ISaleListRow, SaleStatus, SaleType, ShipmentMethod } from "../core/types"
import { saleListRowDefaults } from "../core/fixtures"

const row = (over: Partial<ISaleListRow> = {}): ISaleListRow => ({
    ...saleListRowDefaults,
  id: "s-1",
  sale_date: "2026-10-01",
  customer_name: "Cliente",
  product_name: "Mercadería",
  type: "live" as SaleType,
  status: "completed" as SaleStatus,
  cost: "0.00",
  payment_method: "cash",
  shipment_method: "unassigned" as ShipmentMethod,
  additional_count: 0,
  total: "0.00",
  ...over,
})

describe("salesKpi", () => {
  it("un arreglo vacío da ceros, no NaN", () => {
    const k = salesKpi([])
    expect(k.total).toBe("0.00")
    expect(k.mostrador).toBe("0.00")
    expect(k.whatsapp).toBe("0.00")
    expect(k.pendientes).toBe("0.00")
    expect(k.count).toBe(0)
  })

  it("suma montos sin concatenar strings", () => {
    const k = salesKpi([row({ total: "187000.00" }), row({ total: "0.00" })])
    expect(k.total).toBe("187000.00")
    expect(Number.parseFloat(k.total)).toBe(187000)
  })

  it("suma decimales sin perderlos", () => {
    const k = salesKpi([row({ total: "0.10" }), row({ total: "0.20" })])
    expect(k.total).toBe("0.30")
  })

  it("desglosa por canal", () => {
    const k = salesKpi([
      row({ type: "live", total: "100.00" }),
      row({ type: "live", total: "50.00" }),
      row({ type: "whatsapp", total: "37.00" }),
    ])
    expect(k.mostrador).toBe("150.00")
    expect(k.mostradorCount).toBe(2)
    expect(k.whatsapp).toBe("37.00")
    expect(k.whatsappCount).toBe(1)
    expect(k.total).toBe("187.00")
  })

  it("las canceladas no suman en el total ni en el conteo", () => {
    const k = salesKpi([
      row({ status: "completed", total: "100.00" }),
      row({ status: "cancelled", total: "40.00" }),
    ])
    expect(k.total).toBe("100.00")
    expect(k.pendientes).toBe("0.00")
    expect(k.pendientesCount).toBe(0)
    expect(k.count).toBe(1)
  })

  it("las canceladas tampoco cuentan en el total de ventas ni en los canales", () => {
    const k = salesKpi([
      row({ type: "live", status: "completed", total: "100.00" }),
      row({ type: "live", status: "cancelled", total: "40.00" }),
      row({ type: "whatsapp", status: "cancelled", total: "70.00" }),
    ])
    expect(k.total).toBe("100.00")
    expect(k.count).toBe(1)
    expect(k.mostrador).toBe("100.00")
    expect(k.mostradorCount).toBe(1)
    expect(k.whatsapp).toBe("0.00")
    expect(k.whatsappCount).toBe(0)
  })

  it("cuenta solo las pendientes como pendientes", () => {
    const k = salesKpi([
      row({ status: "pending", total: "80.00" }),
      row({ status: "pending", total: "20.00" }),
      row({ status: "completed", total: "90.00" }),
      row({ status: "cancelled", total: "10.00" }),
    ])
    expect(k.pendientes).toBe("100.00")
    expect(k.pendientesCount).toBe(2)
    expect(k.count).toBe(3)
  })

  it("las pendientes siguen sumando: solo se excluye cancelled", () => {
    const k = salesKpi([
      row({ status: "pending", total: "80.00" }),
      row({ status: "cancelled", total: "40.00" }),
    ])
    expect(k.total).toBe("80.00")
    expect(k.count).toBe(1)
    expect(k.pendientes).toBe("80.00")
  })

  it("un total no numérico no contamina la suma con NaN", () => {
    const k = salesKpi([row({ total: "100.00" }), row({ total: "" })])
    expect(k.total).toBe("100.00")
    expect(k.total).not.toContain("NaN")
  })

  it("el rango de octubre real: 3 ventas, $187.000,00, 2 pendientes de $0,00", () => {
    const k = salesKpi([
      row({ type: "live", status: "completed", total: "100000.00" }),
      row({ type: "live", status: "pending", total: "87000.00" }),
      row({ type: "whatsapp", status: "pending", total: "0.00" }),
    ])
    expect(k.total).toBe("187000.00")
    expect(k.count).toBe(3)
    expect(k.pendientesCount).toBe(2)
  })
})

describe("KPI_FIELDS", () => {
  it("son cuatro y cada una lee su propia cifra", () => {
    expect(KPI_FIELDS.map((f) => f.id)).toEqual([
      "kpi-total",
      "kpi-live",
      "kpi-whatsapp",
      "kpi-pendientes",
    ])
    const k = salesKpi([
      row({ type: "live", status: "pending", total: "1000.00" }),
      row({ type: "whatsapp", status: "completed", total: "2000.00" }),
    ])
    const read = Object.fromEntries(KPI_FIELDS.map((f) => [f.id, f.read]))
    expect(read["kpi-total"]?.(k)).toContain("3,000")
    expect(read["kpi-live"]?.(k)).toContain("1,000")
    expect(read["kpi-whatsapp"]?.(k)).toContain("2,000")
    expect(read["kpi-pendientes"]?.(k)).toContain("1,000")
  })

  it("los rótulos son los del diseño, en minúsculas", () => {
    expect(KPI_FIELDS.map((f) => f.label)).toEqual([
      "Total Período",
      "Venta de Live",
      "Ventas en tienda",
      "Pendientes de Cobro",
    ])
  })

  // Con volumen real los totales del período pasan los cien millones: ahí el
  // formateo se caía y la tarjeta mostraba el número crudo, sin prefijo ni
  // separadores.
  it("un total de nueve dígitos sale formateado, no crudo", () => {
    const read = Object.fromEntries(KPI_FIELDS.map((f) => [f.id, f.read]))
    const k = salesKpi([row({ total: "215287440.00" })])
    expect(read["kpi-total"]?.(k)).toBe("C$ 215,287,440.00")
  })

  it("el pie de la tabla cuenta operaciones comerciales y las pluraliza", () => {
    expect(operationsLabel(6)).toBe("6 operaciones comerciales")
    expect(operationsLabel(1)).toBe("1 operación comercial")
    expect(operationsLabel(0)).toBe("0 operaciones comerciales")
  })
})