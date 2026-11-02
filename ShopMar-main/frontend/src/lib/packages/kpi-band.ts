/**
 * Banda KPI del listado de paquetes: valores del agregado y decisión de qué
 * tarjetas se ocultan cuando hay un filtro de método de envío.
 *
 * Con un filtro de método activo la banda solo puede sostener el total del
 * período y el método elegido: los agregados del dashboard excluyen las ventas
 * canceladas (D-008), así que mostrar las otras tarjetas completas contradice a
 * la tabla. El desglose ya viene en la respuesta de KPIs.
 *
 * La decisión (`kpiBandView`) es pura; el pintado (`renderKpiBand`) es DOM.
 */

import { qs, setText } from "../core/dom"
import { readPackagesFilters } from "../lists/filters"
import type { IPackageKpis } from "../core/types"

const KPI_FIELDS = ["total", "cargotrans", "delivery", "pickup", "unassigned"] as const

const FILTERED_NOTE = "Los totales del período no incluyen las ventas canceladas."

/** Vuelca el agregado de paquetes en las cinco tarjetas de la banda. */
export function paintPackageKpis(kpis: IPackageKpis, root: ParentNode = document): void {
  for (const field of KPI_FIELDS) {
    setText(qs(`[data-kpi="${field}"]`, root), String(kpis[field]))
  }
}

/**
 * Decisión pura de visibilidad: qué tarjetas se ocultan y si la nota del aviso
 * acompaña al filtro. `total` nunca se oculta; el método elegido tampoco.
 */
export interface KpiBandView {
  filtered: boolean
  isCardHidden: (field: string) => boolean
  note: string | null
}

export function kpiBandView(method: string): KpiBandView {
  const filtered = method !== ""
  return {
    filtered,
    isCardHidden: (field) => filtered && field !== "total" && field !== method,
    note: filtered ? FILTERED_NOTE : null,
  }
}

/** Aplica la decisión sobre la banda ya presente en el documento. */
export function renderKpiBand(view: KpiBandView, root: ParentNode = document): void {
  const band = qs<HTMLElement>(".kpi-band", root)
  if (band !== null) {
    if (view.filtered) band.setAttribute("data-kpi-filtered", "")
    else band.removeAttribute("data-kpi-filtered")
  }

  for (const card of root.querySelectorAll<HTMLElement>("[data-kpi-card]")) {
    const field = card.dataset.kpiCard ?? ""
    card.hidden = view.isCardHidden(field)
  }

  const note = qs<HTMLElement>("[data-kpi-note]", root)
  if (note !== null) {
    note.hidden = !view.filtered
    if (view.filtered && view.note !== null) setText(note, view.note)
  }
}

/**
 * Re-evalúa la banda desde la URL. La usan la hidratación y el popstate.
 *
 * `root` es la raíz de la vista cuando la pantalla ya es una vista de la SPA
 * (S2): así la banda se busca dentro de la vista montada y no en el documento.
 */
export function paintKpiFilter(root: ParentNode = document): void {
  const method = readPackagesFilters(window.location.search).shipment_method
  renderKpiBand(kpiBandView(method), root)
}
