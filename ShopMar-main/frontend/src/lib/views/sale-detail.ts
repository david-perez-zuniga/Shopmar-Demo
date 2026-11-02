/**
 * La vista de detalle de venta de la SPA (S2).
 *
 * Es el mismo script de la pantalla de siempre con tres cambios: el ciclo lo
 * maneja el router (`mount` devuelve la limpieza), toda consulta al DOM se hace
 * contra la raíz de la vista y el `id` —que viaja en la query, D-017— se lee de
 * la URL en **cada montaje**, así que un enlace compartido siempre abre su venta.
 *
 * Tres cosas que la pantalla no puede perder y por eso se conservan tal cual:
 * - Imprimir es `window.print()` sobre la factura ya pintada; `?print=1` la
 *   dispara sola cuando la venta llegó. Nunca se imprime el esqueleto: se
 *   imprime después del dato, no después de un reloj.
 * - Un `id` ausente o inválido es un estado de la pantalla —venta no
 *   encontrada— y no un pedido a la API ni un error de consola.
 * - Volver al listado es `navigateTo`: otra vista, sin pedir el documento.
 *
 * Mientras la venta viaja, la factura ya tiene su forma (S2): el esqueleto de la
 * plantilla ocupa el lugar del título, los importes, los renglones y los pagos,
 * así que no hay texto «Cargando». El dato se pide `fresh` en cada montaje, así
 * que después de registrar un pago el detalle no muestra el saldo viejo (S3).
 */

import { navigateTo } from "../app/start"
import { on, qs as querySelector, clear, setText } from "../core/dom"
import { ApiError, salesApi } from "../core/api"
import { getErrorMessage } from "../core/errors"
import { createListStatePainter } from "../lists/list-state"
import {
  renderSaleDetail,
  saleDetailFromLocation,
  type ISaleDetailView,
} from "../sales/sale-detail"

export function mountSaleDetail(root: HTMLElement): () => void {
  /** El `qs` de la vista: resuelve contra la raíz, nunca contra el documento. */
  const qs = <T extends Element>(sel: string) => querySelector<T>(sel, root)

  // D-017: el detalle es una vista de la SPA y el `id` y el `print=1` viajan en
  // la query. Se leen al cargar, en cada montaje, nunca una sola vez por
  // documento. Cuando la vista se monta la URL ya es la de esta pantalla: el
  // router la mueve antes de montar (`lib/app/start.ts`).
  const readLocation = () => saleDetailFromLocation(window.location.href)

  const stateHost = qs<HTMLElement>("[data-state-host]")
  const page = qs<HTMLElement>("[data-page='sale-detail']")
  const content = qs<HTMLElement>("[data-detail-content]")
  const skeleton = qs<HTMLElement>("[data-detail-skeleton]")
  const printButton = qs<HTMLButtonElement>("[data-print]")
  const backLink = qs<HTMLAnchorElement>("[data-back]")

  // El vacío y el error son el mismo bloque `.state-msg` de las listas. La carga
  // no pasa por acá: la dibuja el esqueleto de la factura (S2).
  const paintState = createListStatePainter({
    host: stateHost,
    ledger: content,
    loadingText: "Cargando venta…",
    emptyText: "No encontramos esa venta. Puede haber sido cancelada o el enlace está mal.",
    emptyAction: { className: "btn-filter", href: "/sales", text: "Ver ventas" },
    retryClassName: "btn-filter",
    onRetry: () => void load(),
  })

  /** Mientras la venta viaja, la factura ya tiene la forma de lo que va a llegar. */
  function paintSkeleton(): void {
    clear(stateHost)
    stateHost.hidden = true
    content.hidden = true
    skeleton.hidden = false
    page.setAttribute("aria-busy", "true")
  }

  /** Pinta el estado definitivo y se lleva el esqueleto. */
  function paintMessage(state: "ready" | "empty" | "error", message?: string): void {
    skeleton.hidden = true
    page.setAttribute("aria-busy", "false")
    paintState(state, message)
  }

  function paintMeta(view: ISaleDetailView): void {
    setText(qs("[data-detail-created]"), view.meta.created)
    setText(qs("[data-detail-updated]"), view.meta.updated)
    setText(qs("[data-detail-rows]"), view.meta.rows)
  }

  // El router desmonta la vista antes de montar la siguiente; la bandera evita
  // que una respuesta en vuelo pinte sobre una pantalla que ya no está.
  let cancelled = false

  async function load(): Promise<void> {
    if (cancelled) return

    // `location` se resuelve acá y no al montar: es el estado de la URL en el
    // momento en que esta vista empieza a pedir, no el de la vista anterior.
    const location = readLocation()

    paintSkeleton()
    if (!location.valid) {
      paintMessage("empty")
      return
    }

    try {
      // `fresh`: el detalle es el dato que se está por modificar, así que nunca
      // se sirve de la caché de la visita anterior.
      const sale = await salesApi.getById(location.id, "fresh")
      if (cancelled) return

      const view = renderSaleDetail(sale)
      paintMeta(view)
      paintMessage("ready")
      document.title = `Venta ${view.number} · ShopMar`

      // Imprimir recién ahora que la venta está pintada: el esqueleto vacío no
      // sirve. Sin `setTimeout`: la impresión espera al dato, no al reloj.
      if (location.print) window.print()
    } catch (error) {
      if (cancelled) return
      if (error instanceof ApiError && error.code === "NOT_FOUND") {
        paintMessage("empty", getErrorMessage(error))
        return
      }
      paintMessage("error", getErrorMessage(error))
    }
  }

  if (printButton !== null) on(printButton, "click", () => window.print())

  // Volver es cambiar de vista: `navigateTo` monta el listado sin pedir el
  // documento. El `href` sigue en el markup para abrirlo en otra pestaña.
  if (backLink !== null) {
    on(backLink, "click", (event) => {
      // Un clic con modificador o del botón del medio es del navegador.
      if (
        event instanceof MouseEvent &&
        (event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey)
      ) {
        return
      }
      event.preventDefault()
      navigateTo(backLink.getAttribute("href") ?? "/sales")
    })
  }

  // El esqueleto entra en el mismo frame en que la vista se monta.
  paintSkeleton()
  void load()

  return () => {
    cancelled = true
  }
}
