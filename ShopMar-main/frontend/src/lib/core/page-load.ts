import { onReady } from "./ready"

export type PageCleanup = () => void

/**
 * Inicialización de una pantalla que **todavía no** es una vista de la SPA (S1).
 *
 * La SPA no reemplaza documentos, así que no hay un evento por navegación: lo
 * que queda es inicializar una vez, cuando el documento está listo, si la
 * pantalla está presente. Es el puente para las pantallas que siguen fuera del
 * router —hoy sólo el documento de «sin conexión» del service worker—, y no un
 * ciclo de vida: una vista de la SPA monta y desmonta con `mountExpenseNew`,
 * `mountSalesList` y compañía.
 */
export function onPageLoad(page: string, setup: () => void | PageCleanup): void {
  onReady(() => {
    if (document.querySelector(`[data-page="${page}"]`) === null) return
    setup()
  })
}
