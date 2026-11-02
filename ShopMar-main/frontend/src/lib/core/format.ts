// Sin tope de dígitos en la parte entera: un importe suelto está limitado por
// Decimal(10,2), pero estas funciones también formatean agregados (los KPI de
// ventas y gastos, y los totales del dashboard), que crecen con el volumen. El
// tope es una regla de validación del backend, no de presentación.
const MONEY = /^(\d+)(?:\.(\d+))?$/

const NEXT_DIGIT: Record<string, string> = {
  "0": "1",
  "1": "2",
  "2": "3",
  "3": "4",
  "4": "5",
  "5": "6",
  "6": "7",
  "7": "8",
  "8": "9",
}

function increment(value: string): string {
  const digits = value.split("")
  let i = digits.length - 1
  while (i >= 0 && digits[i] === "9") {
    digits[i] = "0"
    i--
  }
  if (i < 0) {
    digits.unshift("1")
  } else {
    digits[i] = NEXT_DIGIT[digits[i]]
  }
  return digits.join("")
}

function formatWithPrefix(value: string, prefix: string): string {
  const match = MONEY.exec(value)
  if (!match) return value

  let whole = match[1]
  let cents = match[2] ?? "00"

  if (cents.length > 2) {
    const roundUp = cents[2] >= "5"
    cents = cents.slice(0, 2)
    if (roundUp) {
      cents = increment(cents)
      if (cents === "100") {
        cents = "00"
        whole = increment(whole)
      }
    }
  } else if (cents.length === 1) {
    cents += "0"
  }

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${prefix}${grouped}.${cents}`
}

export function formatMoney(value: string): string {
  return formatWithPrefix(value, "C$ ")
}

export function formatCords(value: string): string {
  return formatWithPrefix(value, "C$ ")
}

function parseDate(value: string): Date | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: string): string {
  const date = parseDate(value)
  if (date === null) return "—"
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })
}

/**
 * Un **instante** (created_at, updated_at, paid_at) se muestra en la hora local
 * del navegador: la base guarda `timestamptz` y la API lo devuelve en UTC, así
 * que fijar `timeZone: "UTC"` acá hacía que una venta de las 18:24 se leyera como
 * las 00:24 del día siguiente.
 *
 * `formatDate` no lleva la misma regla a propósito: `sale_date` es un **día** de
 * negocio, no un instante, y se sigue leyendo en UTC para que el día no se corra.
 */
export function formatDateTime(value: string): string {
  const date = parseDate(value)
  if (date === null) return "—"
  return date.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}