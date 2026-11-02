/**
 * Decisión de si un clic dentro del listado de ventas navega al detalle.
 *
 * La fila no es un enlace —no lo dice su rol ni su foco, y no debe decirlo:
 * cambiarle el rol rompería la semántica de la tabla—, así que navegar es una
 * comodidad para puntero. Lo que se decide acá es si el clic pertenece a la fila
 * o a un control que vive adentro de ella, y en el primer caso se devuelve el
 * ancla de **Ver detalle** de esa fila.
 *
 * Devolver el ancla en vez de un `href` deja el destino en una sola fuente de
 * verdad: quien llama reemite el clic sobre ese enlace, así que la navegación
 * pasa por el mismo camino que un clic humano (el router de la SPA, con el
 * prefetch de `viewport`) y no hay ninguna URL duplicada que se pueda
 * desincronizar.
 */

/** Los elementos que se quedan con su propio clic. */
const OWN_CLICK = "a, button, select, input, textarea, label, option, optgroup, summary"

/**
 * Una celda con controles adentro es zona de control: ni el relleno alrededor
 * del select de estado ni el hueco entre el icono de impresión y su enlace
 * vecino cambian de página. Sin esto, el caret del select —que tiene
 * `pointer-events: none` y por eso entrega el clic al `<select>`— sería el
 * límite exacto entre navegar y abrir el desplegable.
 */
const CONTROL_ZONE = "a, button, select, input, textarea, label"

/** El ancla que la fila tiene que reemitir. Ver `renderSaleListRow`. */
const DETAIL_LINK = "a[data-detail]"

function isPlainPrimaryClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  )
}

/**
 * `true` cuando el clic cierra un arrastre de selección. Seleccionar el nombre de
 * la clienta y soltar el botón no puede llevarse la página puesta.
 */
function endsTextSelection(): boolean {
  const selection = window.getSelection()
  return selection !== null && selection.isCollapsed === false
}

/**
 * Devuelve el enlace de detalle de la fila donde cayó el clic, o `null` cuando el
 * clic no debe navegar.
 */
export function salesRowClickTarget(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented) return null
  if (!isPlainPrimaryClick(event)) return null

  const target = event.target
  if (!(target instanceof Element)) return null

  if (target.closest(OWN_CLICK) !== null) return null
  if (endsTextSelection()) return null

  const row = target.closest("tr")
  if (row === null) return null

  const cell = target.closest("td")
  if (cell !== null && cell.querySelector(CONTROL_ZONE) !== null) return null

  const anchor = row.querySelector<HTMLAnchorElement>(DETAIL_LINK)
  if (anchor === null || !anchor.hasAttribute("href")) return null

  return anchor
}
