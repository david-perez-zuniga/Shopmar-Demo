/**
 * Query del listado de clientes.
 *
 * `include_balances` se pide siempre —el listado existe para mostrar el saldo
 * por cobrar— y `q` solo viaja cuando hay una búsqueda real. El backend ordena
 * por nombre y busca en nombre y teléfono (`ILIKE '%q%'`), así que acá no se
 * agrega ninguna otra regla: solo se recorta lo que la dueña escribió.
 */

import type { ICustomersListParams } from "../core/api"

export function customersQuery(rawQuery: string): ICustomersListParams {
  const q = rawQuery.trim()

  return q === "" ? { include_balances: true } : { q, include_balances: true }
}
