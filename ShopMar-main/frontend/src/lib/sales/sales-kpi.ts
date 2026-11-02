import { formatMoney } from "../core/format"
import type { ISaleListRow } from "../core/types"

export interface ISalesKpi {
  total: string
  mostrador: string
  whatsapp: string
  pendientes: string
  count: number
  mostradorCount: number
  whatsappCount: number
  pendientesCount: number
}

const money = (value: string): number => Number.parseFloat(value) || 0

const asMoney = (value: number): string => value.toFixed(2)

export function salesKpi(rows: readonly ISaleListRow[]): ISalesKpi {
  let total = 0
  let mostrador = 0
  let whatsapp = 0
  let pendientes = 0
  let count = 0
  let mostradorCount = 0
  let whatsappCount = 0
  let pendientesCount = 0

  for (const row of rows) {
    if (row.status === "cancelled") continue

    const amount = money(row.total)
    total += amount
    count += 1

    if (row.type === "live") {
      mostrador += amount
      mostradorCount += 1
    } else if (row.type === "whatsapp") {
      whatsapp += amount
      whatsappCount += 1
    }

    if (row.status === "pending") {
      pendientes += amount
      pendientesCount += 1
    }
  }

  return {
    total: asMoney(total),
    mostrador: asMoney(mostrador),
    whatsapp: asMoney(whatsapp),
    pendientes: asMoney(pendientes),
    count,
    mostradorCount,
    whatsappCount,
    pendientesCount,
  }
}

export function operationsLabel(count: number): string {
  return `${count} ${count === 1 ? "operación comercial" : "operaciones comerciales"}`
}

export const KPI_FIELDS = [
  { id: "kpi-total", label: "Total Período", read: (k: ISalesKpi): string => formatMoney(k.total) },
  { id: "kpi-live", label: "Venta de Live", read: (k: ISalesKpi): string => formatMoney(k.mostrador) },
  { id: "kpi-whatsapp", label: "Ventas en tienda", read: (k: ISalesKpi): string => formatMoney(k.whatsapp) },
  { id: "kpi-pendientes", label: "Pendientes de Cobro", read: (k: ISalesKpi): string => formatMoney(k.pendientes) },
] as const