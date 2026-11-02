/**
 * Pintado del estado de la lista: cargando, vacío, error y listo.
 *
 * El pintor tiene dos modos y la pantalla elige uno al construirlo:
 *
 * - **Modo fila (S56)**, cuando llega `template` y `tbody`. Es el de paquetes:
 *   el estado se clona como una fila dentro del tbody y el `ledger` —la tabla
 *   con su encabezado y su pie— queda **visible en todos los estados**, así que
 *   el encabezado y el paginador nunca desaparecen.
 * - **Modo host**, cuando no hay plantilla. Es el de siempre: el mensaje se
 *   escribe en un `[data-state-host]` hermano del `.ledger`; con filas el host
 *   se oculta y el ledger se destapa, y en cualquier otro estado el intercambio
 *   es el inverso.
 *
 * El markup de los estados es el mismo en todas las pantallas; el texto, la
 * clase de la acción y el destino del enlace los pone cada una.
 */

import { clear, on, setText } from "../core/dom"

export type ListState = "loading" | "ready" | "empty" | "error"

export type ListStateOptions = {
  /** Host del mensaje de estado (modo host). Se ignora en modo fila. */
  host?: HTMLElement | null
  /** Tabla y pie. En modo fila se destapa siempre; en modo host, solo con filas. */
  ledger: HTMLElement | null
  /**
   * Plantilla `<tr>` de la fila de estado (modo fila). Tiene que traer
   * `[data-state-text]` y, si la pantalla ofrece acción, `[data-state-action]`.
   * Con plantilla válida manda el modo fila y el host deja de usarse.
   */
  template?: HTMLTemplateElement | null
  /** Tbody donde se inserta la fila clonada (modo fila). */
  tbody?: HTMLTableSectionElement | null
  /** Texto por defecto de "cargando". */
  loadingText: string
  /** Texto por defecto de "vacío", y fallback del error sin mensaje. */
  emptyText: string
  /**
   * Columnas que ocupa la fila de estado. Sirve para las pantallas que esconden
   * columnas secundarias mientras la tabla está vacía (S57): el `colspan` tiene
   * que coincidir con las columnas que quedan visibles.
   */
  emptyColspan?: number
  /** Acción que se ofrece cuando no hay filas. */
  emptyAction: { className: string; href: string; text: string }
  /** Clase del botón de reintento. */
  retryClassName: string
  /** Qué hacer al pulsar "Reintentar". */
  onRetry: () => void
  /**
   * Esqueleto de carga (S2). Mientras el listado espera datos se clona esta
   * plantilla de fila N veces en el tbody, en vez de mostrar el texto
   * «Cargando…»: la tabla ya tiene la forma de lo que va a llegar. Sin esto, el
   * estado de carga sigue siendo una fila con el mensaje, como siempre.
   */
  skeleton?: { template: HTMLTemplateElement | null; rows: number }
}

/**
 * Devuelve el `paint(state, message?)` que cada lista usaba por su cuenta. El
 * modo lo decide la pantalla al pasar o no la plantilla, y no cambia después:
 * sin plantilla el tbody no se toca.
 */
export function createListStatePainter(
  options: ListStateOptions,
): (state: ListState, message?: string) => void {
  return (state, message) => {
    if (options.template != null) {
      paintRow(options, state, message)
      return
    }
    paintHost(options, state, message)
  }
}

/** Mensaje del estado: el que manda la pantalla o el de su configuración. */
function messageFor(
  options: ListStateOptions,
  state: ListState,
  message: string | undefined,
): string {
  return message ?? (state === "loading" ? options.loadingText : options.emptyText)
}

/** Modo host: el mensaje vive fuera de la tabla y el ledger solo con filas. */
function paintHost(
  options: ListStateOptions,
  state: ListState,
  message: string | undefined,
): void {
  const host = options.host ?? null
  if (host === null) return

  clear(host)
  const isReady = state === "ready"
  host.hidden = isReady
  if (options.ledger !== null) options.ledger.hidden = !isReady
  if (isReady) return

  const paragraph = document.createElement("p")
  paragraph.className = state === "error" ? "state-msg state-msg--error" : "state-msg"
  if (state === "error") paragraph.setAttribute("role", "alert")
  paragraph.textContent = messageFor(options, state, message)
  host.append(paragraph)

  if (state === "empty") {
    const link = document.createElement("a")
    link.className = options.emptyAction.className
    link.href = options.emptyAction.href
    link.textContent = options.emptyAction.text
    host.append(link)
  }
  if (state === "error") host.append(retryButton(options))
}

/**
 * Modo fila: el estado es una fila del tbody y la tabla queda destapada, igual
 * que en paquetes. Sin plantilla válida no toca ni el tbody ni el ledger.
 */
function paintRow(
  options: ListStateOptions,
  state: ListState,
  message: string | undefined,
): void {
  const tbody = options.tbody ?? null
  const row = options.template?.content.firstElementChild?.cloneNode(true)
  if (!(row instanceof HTMLTableRowElement) || tbody === null) return

  // La fila de estado vive dentro del ledger. Sin destaparlo, un filtro sin
  // coincidencias mostraba una pantalla en blanco: sin encabezado y sin mensaje.
  if (options.ledger !== null) options.ledger.hidden = false

  if (state === "ready") {
    // El paginador ya escribió las filas en el tbody: acá solo caen la fila de
    // estado o las del esqueleto si quedaron de un pintado anterior.
    tbody.querySelector("[data-state-row]")?.remove()
    for (const row of tbody.querySelectorAll("[data-skeleton-row]")) row.remove()
    return
  }

  if (state === "loading" && paintSkeleton(options, tbody)) return

  row.setAttribute("data-state-row", "")
  // El `colspan` de la fila de estado se ajusta a las columnas visibles: cuando
  // la pantalla esconde las secundarias, la celda no puede seguir contando todas.
  if (options.emptyColspan !== undefined) {
    const cell = row.querySelector<HTMLTableCellElement>("td[colspan]")
    if (cell !== null) cell.colSpan = options.emptyColspan
  }
  const paragraph = row.querySelector<HTMLElement>("[data-state-text]")
  if (paragraph !== null) {
    // El error es el único estado que cambia de color y avisa al lector de
    // pantalla, aquí y en el modo host.
    if (state === "error") {
      paragraph.className = "state-msg state-msg--error"
      paragraph.setAttribute("role", "alert")
    }
    setText(paragraph, messageFor(options, state, message))
  }
  paintRowAction(options, row, state)
  tbody.replaceChildren(row)
}

/**
 * El esqueleto de carga (S2): clona la plantilla de fila las veces pedidas.
 * Devuelve `false` cuando la pantalla no declaró esqueleto, para que el estado
 * de carga caiga en la fila con el texto de siempre.
 */
function paintSkeleton(options: ListStateOptions, tbody: HTMLTableSectionElement): boolean {
  const template = options.skeleton?.template
  const count = options.skeleton?.rows ?? 0
  if (!(template instanceof HTMLTemplateElement) || count <= 0) return false

  const rows: Node[] = []
  for (let index = 0; index < count; index++) {
    const clone = template.content.cloneNode(true) as DocumentFragment
    const row = clone.firstElementChild
    if (row instanceof HTMLElement) row.setAttribute("data-skeleton-row", "")
    rows.push(clone)
  }
  tbody.replaceChildren(...rows)
  return true
}

/**
 * Acción de la fila de estado. El vacío usa el enlace de la pantalla y el error
 * pone «Reintentar» **en el mismo hueco** con la misma clase de acción, así que
 * los dos se ven como la misma píldora.
 */
function paintRowAction(
  options: ListStateOptions,
  row: HTMLTableRowElement,
  state: ListState,
): void {
  const action = row.querySelector<HTMLElement>("[data-state-action]")
  if (action === null) return

  if (state === "error") {
    action.replaceWith(retryButton(options))
    return
  }

  action.hidden = state !== "empty"
  if (state === "empty" && action instanceof HTMLAnchorElement) {
    action.className = options.emptyAction.className
    action.href = options.emptyAction.href
    setText(action, options.emptyAction.text)
  }
}

/** El botón de reintento, el mismo en los dos modos. */
function retryButton(options: ListStateOptions): HTMLButtonElement {
  const retry = document.createElement("button")
  retry.className = options.retryClassName
  retry.type = "button"
  retry.textContent = "Reintentar"
  on(retry, "click", () => options.onRetry())
  return retry
}
