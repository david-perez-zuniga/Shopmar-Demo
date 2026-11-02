/**
 * Fila del listado de clientes: modelo de vista puro.
 *
 * La parte DOM —armar el `<tr>` y sus botones— vive en el script de
 * `pages/customers/index.astro`, porque el listado también necesita el modal y
 * los manejadores de edición y borrado. Acá solo se deriva lo que la fila
 * muestra: las clases y el texto de cada celda.
 *
 * Los dos saldos llegan de la API como cadenas decimales (`include_balances`);
 * se formatean con el helper de dinero y nunca se convierten a número. La
 * decisión de resaltar el vencido se toma por la forma de la cadena, no por
 * `parseFloat`, para no reintroducir la aritmética de punto flotante que el
 * resto del cliente evita.
 */

import { formatMoney } from "../core/format"
import type { ICustomerWithBalances } from "../core/types"

/** Guion largo con el que se pinta una celda vacía (un teléfono ausente). */
export const EMPTY_CELL = "—"

/** Una celda simple: sus clases completas y su texto. */
export interface ICustomerCellView {
  classes: string
  text: string
}

export interface ICustomerRowView {
  /** Clases completas del `<tr>`. */
  rowClass: string
  /** Valor de `data-customer-id`. */
  customerId: string
  name: ICustomerCellView
  phone: ICustomerCellView
  outstanding: ICustomerCellView
  overdue: ICustomerCellView
}

/**
 * `true` cuando la cadena decimal representa cero (`"0"`, `"0.00"`, `"00.000"`).
 * Es la única comprobación que la vista necesita del importe: una deuda de
 * `"0.00"` no es vencida y se pinta como cero, no como guion.
 */
export function isZeroMoney(value: string): boolean {
  return /^0+(?:\.0+)?$/.test(value.trim())
}

/**
 * Deriva todo lo que la fila muestra a partir del cliente con saldos.
 *
 * El saldo por cobrar es un importe total (`.cell-total`); el vencido solo se
 * marca (`.cell-overdue`) cuando hay algo vencido, porque el color es
 * información y no decoración.
 */
export function customerRowView(customer: ICustomerWithBalances): ICustomerRowView {
  const phone = customer.phone

  return {
    rowClass: "ledger-row",
    customerId: customer.id,
    name: {
      classes: "cell-strong col-customer",
      text: customer.name,
    },
    phone: {
      classes: "col-phone",
      text: phone === null || phone === "" ? EMPTY_CELL : phone,
    },
    outstanding: {
      classes: "num-sm col-money right cell-total",
      text: formatMoney(customer.outstanding_balance),
    },
    overdue: {
      classes: isZeroMoney(customer.overdue_balance)
        ? "num-sm col-money right"
        : "num-sm col-money right cell-overdue",
      text: formatMoney(customer.overdue_balance),
    },
  }
}
