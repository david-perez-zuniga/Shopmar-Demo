/**
 * Paginador del listado de paquetes: botones previo/siguiente y ventana de
 * páginas. Es un renderizador, no un paginador de datos.
 *
 * No adopta `lists/table-pager.ts`:
 * - Ese módulo es un paginador de cliente que es dueño del dataset y deriva el
 *   total de `rows.length`; `/packages` pagina en el servidor y recibe `total`
 *   aparte, así que solo comparte el renderizador de la ventana (`pageWindow`).
 * - Aun compartiendo el markup, `createTablePager` no sería byte-idéntico: su
 *   `makeButton` asigna `class` antes de `type`, y los fixtures exigen `type`
 *   antes de `class` en los botones numerados. El primer byte distinto queda en
 *   el offset 109 de `pager-first-page.html` (el prev deshabilitado alarga el
 *   prefijo) y en el offset 97 de `pager-middle-page-gaps.html`,
 *   `pager-last-page.html` y `pager-short-window.html`. No hay diferencia de
 *   comportamiento en el DOM, pero los fixtures son el contrato y están
 *   congelados: no se toca `table-pager.ts` para acomodar paquetes.
 *
 * El `goToPage` entra por parámetro, no por closure.
 */

import { on } from "../core/dom"
import { pageWindow } from "../lists/pagination"

export function paintPackagePager(
  pager: HTMLElement | null,
  current: number,
  pages: number,
  goToPage: (page: number) => void,
): void {
  if (pager === null) return
  pager.replaceChildren()

  const previous = document.createElement("button")
  previous.className = "page-btn"
  previous.type = "button"
  previous.textContent = "Anterior"
  previous.disabled = current <= 1
  on(previous, "click", () => goToPage(current - 1))

  const next = document.createElement("button")
  next.className = "page-btn"
  next.type = "button"
  next.textContent = "Siguiente"
  next.disabled = current >= pages
  on(next, "click", () => goToPage(current + 1))

  pager.append(previous)
  for (const slot of pageWindow(current, pages)) {
    if (slot === "gap") {
      const gap = document.createElement("span")
      gap.className = "page-gap"
      gap.textContent = "…"
      gap.setAttribute("aria-hidden", "true")
      pager.append(gap)
      continue
    }
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = String(slot)
    if (slot === current) {
      button.className = "page-btn page-btn--current"
      button.setAttribute("aria-current", "page")
    } else {
      button.className = "page-btn"
      on(button, "click", () => goToPage(slot))
    }
    pager.append(button)
  }
  pager.append(next)
}
