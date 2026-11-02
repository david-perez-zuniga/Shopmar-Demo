/**
 * El registro de vistas de la SPA (S1).
 *
 * Cada vista se declara una vez con su `mount(root)` y devuelve, si necesita
 * limpiar listeners, una función de limpieza. El registro garantiza el
 * invariante que hace segura la navegación: **antes de montar una vista se
 * desmonta la anterior**, y un montaje que falla no deja una limpieza colgada.
 */

import type { ViewId } from "./router"

export type ViewCleanup = () => void

/**
 * Recibe la raíz de la vista —el clon de su plantilla ya insertado— y devuelve
 * la limpieza. Toda consulta al DOM de una vista se hace contra esa raíz.
 */
export type ViewMount = (root: HTMLElement) => void | ViewCleanup

export interface IViewRegistry {
  register(view: ViewId, mount: ViewMount): void
  /** Desmonta la vista actual y monta la que corresponde. */
  mount(view: ViewId, root: HTMLElement): void
  unmount(): void
  /** Si la vista tiene implementación: sin ella, el enlace no se intercepta. */
  has(view: ViewId): boolean
}

export function createViewRegistry(): IViewRegistry {
  const mounts = new Map<ViewId, ViewMount>()
  let cleanup: ViewCleanup | null = null

  function unmount(): void {
    const pending = cleanup
    cleanup = null
    if (pending !== null) pending()
  }

  return {
    register(view, mount) {
      mounts.set(view, mount)
    },

    mount(view, root) {
      unmount()
      const mount = mounts.get(view)
      if (mount === undefined) return
      const result = mount(root)
      cleanup = typeof result === "function" ? result : null
    },

    unmount,

    has(view) {
      return mounts.has(view)
    },
  }
}
