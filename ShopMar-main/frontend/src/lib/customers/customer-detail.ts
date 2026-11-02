/**
 * Detalles de un cliente (S19, S22): el modelo de vista puro del diálogo.
 *
 * Cuatro piezas, todas sin DOM:
 * - `customerIdFromSearch` lee el `?customer=<uuid>` que hace compartible el
 *   enlace del recibo. Un id que no existe no es un error de parseo: es un
 *   cliente que la lista no va a encontrar, y la pantalla lo dice en voz baja.
 * - `customerDetailView` deriva el encabezado y los saldos del cliente que ya
 *   trae `include_balances`. Los importes se formatean como dinero y nunca se
 *   convierten a número.
 * - `customerPurchaseHistory` arma el historial completo de compras del cliente
 *   (S22): todas sus ventas, de contado y a crédito, más el resumen que dice
 *   cuántas son y cuánto compró. La API ya las devuelve de la más reciente a la
 *   más vieja, así que acá no se reordena nada: se conserva el orden del
 *   servidor.
 *
 * El cableado del `<dialog>` —abrir, cerrar, pintar— vive en el `<script>` de
 * `pages/customers/index.astro`, como en el resto de los listados.
 */

import { formatDate, formatMoney } from "../core/format"
import type { ICustomerWithBalances, ISaleListRow } from "../core/types"
import { centsToMoney, toCents } from "../sales/payment"
import { labelFor } from "../sales/sale-status"
import { EMPTY_CELL, isZeroMoney } from "./customer-list"

/** Lo que muestran los datos del cliente en el diálogo de detalles. */
export interface ICustomerDetailView {
  customerId: string
  name: string
  /** Guion cuando el teléfono no está cargado, nunca una celda vacía. */
  phone: string
  /** Guion cuando no hay nota. */
  note: string
  /** Saldo por cobrar, ya formateado como dinero. */
  outstanding: string
  /** Parte vencida de ese saldo, ya formateada como dinero. */
  overdue: string
  /** `true` cuando hay algo vencido: se marca el número, no se decora. */
  overdueAlert: boolean
}

/** Una fila del historial de compras del cliente (S22). */
export interface ICustomerPurchaseRow {
  id: string
  /** Destino de la fila: el detalle de esa venta (D-017). */
  href: string
  date: string
  /** Mercadería de la venta (`product_name`), tal como la devuelve la API. */
  product: string
  /** `"Contado"` o `"Crédito"`, el mismo vocabulario de la factura. */
  terms: string
  /** `"Pendiente"`, `"Completada"` o `"Cancelada"`. */
  status: string
  total: string
  /**
   * Saldo por cobrar, ya formateado como dinero. `null` en una venta de
   * contado: su `balance` no es una deuda y no se inventa un cero.
   */
  balance: string | null
  /** `true` sólo en una venta a crédito vencida (`is_overdue`). */
  overdue: boolean
}

/** El resumen del historial: cuántas compras son y cuánto suman. */
export interface ICustomerPurchaseHistory {
  count: number
  /** `"1 compra"` / `"4 compras"`, ya pluralizado. */
  countLabel: string
  /** Suma de los totales, formateada como dinero. */
  total: string
  /** La línea completa que se pinta arriba de la lista. */
  summary: string
  rows: ICustomerPurchaseRow[]
}

/** Texto del bloque cuando el cliente no tiene ninguna compra. */
export const CUSTOMER_PURCHASES_EMPTY = "Sin compras registradas"

/**
 * Vocabulario de la condición de pago. Es el mismo de `PAYMENT_TERMS_LABELS`
 * (`lib/sales/sale-detail.ts`); se repite acá —dos palabras— para no arrastrar
 * el renderizador de la factura al diálogo de clientes, y porque importarlo
 * cerraría un ciclo: `sale-detail` ya importa este módulo.
 */
const TERMS_LABELS: Record<ISaleListRow["payment_terms"], string> = {
  immediate: "Contado",
  credit: "Crédito",
}

/**
 * Lee el `customer` de una query string (`?customer=<uuid>`). Devuelve `null`
 * cuando falta o viene en blanco: un `?customer=` vacío es un enlace roto, no
 * un cliente.
 */
export function customerIdFromSearch(search: string): string | null {
  const id = (new URLSearchParams(search).get("customer") ?? "").trim()
  return id === "" ? null : id
}

/**
 * Enlace canónico a los detalles de un cliente. Es el destino del nombre en el
 * recibo y en el detalle de la venta, y por eso vive acá y no en cada pantalla:
 * una sola forma de armar la URL.
 */
export function customerDetailHref(customerId: string): string {
  return `/customers?customer=${customerId}`
}

/** Deriva el encabezado, los datos y los dos saldos del cliente. */
export function customerDetailView(customer: ICustomerWithBalances): ICustomerDetailView {
  return {
    customerId: customer.id,
    name: customer.name,
    phone: customer.phone === null || customer.phone.trim() === "" ? EMPTY_CELL : customer.phone,
    note: customer.note === null || customer.note.trim() === "" ? EMPTY_CELL : customer.note,
    outstanding: formatMoney(customer.outstanding_balance),
    overdue: formatMoney(customer.overdue_balance),
    // Misma regla que la fila del listado: el vencido se marca sólo cuando hay
    // algo vencido, y se decide por la forma de la cadena, no con aritmética.
    overdueAlert: !isZeroMoney(customer.overdue_balance),
  }
}

/**
 * El historial **completo** de compras del cliente (S22): todas sus ventas, en
 * el orden de la API. Antes se filtraba a las de crédito y la dueña sólo veía
 * la cuenta por cobrar, no lo que el cliente compró.
 *
 * La suma de los totales se hace en centavos con el helper del módulo de pagos:
 * los importes son cadenas y convertirlas con `parseFloat` reintroduciría el
 * error del punto flotante que el resto del cliente evita.
 */
export function customerPurchaseHistory(
  sales: readonly ISaleListRow[],
): ICustomerPurchaseHistory {
  let totalCents = 0
  for (const sale of sales) {
    const cents = toCents(sale.total)
    // Un total que no parsea no puede romper el resumen; el listado de ventas
    // es la fuente del dato y siempre trae dos decimales.
    if (cents !== null) totalCents += cents
  }

  const count = sales.length
  const countLabel = count === 1 ? "1 compra" : `${count} compras`
  const total = formatMoney(centsToMoney(totalCents))

  return {
    count,
    countLabel,
    total,
    summary: `${countLabel} · Total comprado ${total}`,
    rows: sales.map((sale) => ({
      id: sale.id,
      href: `/sales/detail?id=${sale.id}`,
      date: formatDate(sale.sale_date),
      product: sale.product_name,
      terms: TERMS_LABELS[sale.payment_terms],
      status: labelFor(sale.status),
      total: formatMoney(sale.total),
      // En contado el saldo es nulo por contrato; el guion no aplica porque no
      // hay celda de saldo, y el marcador de vencida es siempre falso.
      balance: sale.balance === null ? null : formatMoney(sale.balance),
      overdue: sale.payment_terms === "credit" && sale.is_overdue,
    })),
  }
}
