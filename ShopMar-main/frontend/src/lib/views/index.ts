/**
 * Las vistas registradas de la SPA (S1, S2).
 *
 * Cada tarea de la migración suma su línea acá. Una vista que no está
 * registrada no se intercepta: su enlace navega al documento viejo, así que la
 * app sigue funcionando mientras la migración avanza.
 */

import type { IViewRegistry } from "../app/views"
import { mountCustomers } from "./customers-list"
import { mountExpenseNew } from "./expense-new"
import { mountExpensesList } from "./expenses-list"
import { mountNew } from "./new"
import { mountPackagesList } from "./packages-list"
import { mountSaleDetail } from "./sale-detail"
import { mountSaleNew } from "./sale-new"
import { mountSalesList } from "./sales-list"
import { mountSummary } from "./summary"

export function registerViews(registry: IViewRegistry): void {
  registry.register("summary", mountSummary)
  registry.register("sales", mountSalesList)
  registry.register("sale-detail", mountSaleDetail)
  registry.register("sale-new", mountSaleNew)
  registry.register("packages", mountPackagesList)
  registry.register("customers", mountCustomers)
  registry.register("expenses", mountExpensesList)
  registry.register("expense-new", mountExpenseNew)
  registry.register("new", mountNew)
}
