/**
 * Método de envío de un paquete en el listado: estilos, opciones y el control.
 *
 * Frontera de pureza:
 * - La parte pura (el mapa de estilos, la lista ordenada de opciones, el
 *   `aria-label` y la clase del select) no toca `document` ni `window` ni recibe
 *   elementos: son derivaciones de un `ShipmentMethod`, comparables byte a byte
 *   con los fixtures congelados de `fixtures/packages/`.
 * - La parte DOM (`buildShipmentSelect`) recibe lo que necesita —la venta y el
 *   manejador de `change`— y nunca busca la función de la página por closure.
 * - El manejador del `change` (`createShipmentChangeHandler`) también recibe sus
 *   dependencias por parámetro —el PATCH y el refresco de KPIs— en vez de
 *   resolverlas por closure, así que se puede ejercitar sin la página.
 *
 * La extracción del `<script>` de `pages/packages/index.astro` fue un refactor
 * puro: reprodujo su salida byte a byte y congeló dos defectos —el `<td>` que
 * `buildShipmentSelect` devolvía y que la fila anidaba dentro de la celda de
 * método, y el modelo de fila que el manejador del `change` no actualizaba—.
 * Este commit los corrige a propósito; el diff de los cinco fixtures afectados
 * de `fixtures/packages/` es la prueba de que solo cambió eso.
 */

import { on } from "../core/dom"
import { CARET } from "../core/icons"
import type { ISaleListRow, ShipmentMethod } from "../core/types"

/** Firma del manejador de `change` del select de envío. */
export type ShipmentChangeHandler = (
  select: HTMLSelectElement,
  sale: ISaleListRow,
) => void

export interface IShipmentStyle {
  classes: string
  label: string
}

export const SHIPMENT_STYLE: Record<ShipmentMethod, IShipmentStyle> = {
  cargotrans: { classes: "shipment-select--cargotrans", label: "Cargotrans" },
  delivery: { classes: "shipment-select--delivery", label: "Delivery" },
  pickup: { classes: "shipment-select--pickup", label: "En tienda" },
  unassigned: { classes: "shipment-select--unassigned", label: "Sin asignar" },
}

/**
 * Orden con el que se listan las opciones. Es el orden de inserción de
 * `SHIPMENT_STYLE` y el que fijan los fixtures: cargotrans, delivery, pickup,
 * unassigned.
 */
export const SHIPMENT_OPTIONS = Object.keys(SHIPMENT_STYLE) as ShipmentMethod[]

/**
 * Clases completas del `<select>` para un método. El prefijo `shipment-select`
 * es fijo; el método solo cambia el modificador.
 */
export function shipmentSelectClasses(method: ShipmentMethod): string {
  return `shipment-select ${SHIPMENT_STYLE[method].classes}`
}

/** El `aria-label` del select, con el nombre de la clienta. */
export function shipmentAriaLabel(customerName: string): string {
  return `Método de envío de la venta a ${customerName}`
}

/**
 * Construye el control de método de envío: el `<div class="shipment-wrap">` que
 * envuelve el `<select>` y el caret.
 *
 * Devuelve exactamente lo que arma, sin el `<td>` descartable que la extracción
 * conservó por error. La fila lo inserta directo en la celda de método, así que
 * la celda queda
 * `<td class="col-channel" data-cell="method"><div class="shipment-wrap">…</div></td>`
 * en vez del `<td>` anidado (HTML inválido) que congelaban los fixtures.
 */
export function buildShipmentSelect(
  sale: ISaleListRow,
  onChange: ShipmentChangeHandler,
): HTMLDivElement {
  const wrap = document.createElement("div")
  wrap.className = "shipment-wrap"

  const select = document.createElement("select")
  select.className = shipmentSelectClasses(sale.shipment_method)
  select.dataset["saleId"] = sale.id
  select.setAttribute("aria-label", shipmentAriaLabel(sale.customer_name))

  for (const value of SHIPMENT_OPTIONS) {
    const option = document.createElement("option")
    option.value = value
    option.textContent = SHIPMENT_STYLE[value].label
    option.selected = value === sale.shipment_method
    select.append(option)
  }

  on(select, "change", () => void onChange(select, sale))
  wrap.append(select)

  const caret = document.createElement("span")
  caret.className = "shipment-caret"
  caret.setAttribute("aria-hidden", "true")
  caret.innerHTML = CARET
  wrap.append(caret)

  return wrap
}

/** Dependencias del manejador de `change`, inyectadas por la página. */
export interface IShipmentChangeDeps {
  /** PATCH `/sales/:id/shipment-method`. */
  updateShipmentMethod: (id: string, method: ShipmentMethod) => Promise<unknown>
  /** Vuelve a pedir los KPIs del filtro activo después de la mutación. */
  reloadKpis: () => void
}

/**
 * Manejador de `change` ya resuelto. La promesa permite esperar el PATCH en los
 * tests; sigue siendo asignable a `ShipmentChangeHandler` porque el retorno
 * `void` acepta cualquier retorno.
 */
export type ResolvedShipmentChangeHandler = (
  select: HTMLSelectElement,
  sale: ISaleListRow,
) => Promise<void>

/**
 * Devuelve el manejador de `change` del select de envío. La página le pasa el
 * PATCH y el refresco de KPIs; el módulo no los resuelve por closure.
 *
 * Comportamiento DOM, idéntico al del `<script>` original: ignora el cambio si
 * el método no cambió o si el select no está dentro de una fila, deshabilita el
 * select mientras el PATCH está en vuelo, repinta su clase con el método nuevo y
 * —si el PATCH falla— devuelve `select.value` al método anterior y avisa con
 * `alert`.
 */
export function createShipmentChangeHandler(
  deps: IShipmentChangeDeps,
): ResolvedShipmentChangeHandler {
  return async (select, sale) => {
    const next = select.value as ShipmentMethod
    const previous = sale.shipment_method
    if (next === previous) return

    const row = select.closest<HTMLTableRowElement>("[data-sale-id]")
    if (!row) return

    select.disabled = true

    try {
      await deps.updateShipmentMethod(sale.id, next)

      // El fix: el método nuevo va de vuelta al modelo de la fila. Sin esta
      // asignación el modelo quedaba viejo, un segundo cambio calculaba
      // `previous` desde un valor que el servidor ya no tenía y el rollback
      // restauraba ese método inexistente. Se escribe recién con la respuesta
      // OK, así que si el PATCH falla la fila conserva el método con el que
      // llegó y el `catch` puede volver a él.
      sale.shipment_method = next
      select.className = shipmentSelectClasses(next)
      deps.reloadKpis()
    } catch (err) {
      select.value = previous
      alert(`Error al cambiar método: ${err instanceof Error ? err.message : "Error desconocido"}`)
    } finally {
      select.disabled = false
    }
  }
}
