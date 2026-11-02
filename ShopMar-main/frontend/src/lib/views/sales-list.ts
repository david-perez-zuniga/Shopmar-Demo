/**
 * La vista de ventas de la SPA (S1).
 *
 * Es el mismo script de la pantalla de siempre con dos cambios: el ciclo lo
 * maneja el router (`mount` devuelve la limpieza) y toda consulta al DOM se hace
 * contra la raiz de la vista, no contra el documento. Asi dos vistas montadas
 * en momentos distintos no pueden pisarse los `[name]`.
 */

import { on, qs as querySelector, setText } from "../core/dom"
import { pushQuery } from "../app/start"
import { salesApi } from "../core/api"
import { readPerPage, readSalesFilters } from "../lists/filters"
import { clearFilterHref, hydrateDatePresets, hydrateFilterControls, wireAutoFilter, rehydrateOnPageshow, setControlValue, wireDatePresets, wireFilterSubmit, wireFiltersToggle } from "../lists/filter-controls"
import { footerText } from "../lists/pagination"
import { createListStatePainter } from "../lists/list-state"
import { createTablePager } from "../lists/table-pager"
import { KPI_FIELDS, operationsLabel, salesKpi } from "../sales/sales-kpi"
import {
  applySelectLocks,
  applyStatusLook,
  labelFor,
} from "../sales/sale-status"
import { applyCreditToRow, readSalesCreditFilters, renderSaleListRow } from "../sales/sale-list-row"
import { salesRowClickTarget } from "../sales/row-navigation"
import { getErrorMessage } from "../core/errors"
import { askConfirm, formatReference } from "../sales/confirm-dialog"
import { askPayment } from "../sales/payment-modal"
import { formatMoney } from "../core/format"
import type { ISalesListParams } from "../core/api"
import type { ISaleListRow, SaleStatus } from "../core/types"

export function mountSalesList(root: HTMLElement): () => void {
  /** El `qs` de la vista: resuelve contra la raiz, nunca contra el documento. */
  const qs = <T extends Element>(sel: string) => querySelector<T>(sel, root)


  const toast = qs<HTMLElement>("#status-toast")
  const toastMessage = qs("#toast-message")
  const overlay = qs<HTMLElement>("#confirm-dialog")
  const paymentOverlay = qs<HTMLElement>("#payment-dialog")
  const stateTemplate = qs<HTMLTemplateElement>("[data-state-template]")
  const skeletonTemplate = qs<HTMLTemplateElement>("[data-skeleton-template]")
  const ledger = qs<HTMLElement>("[data-ledger]")
  const perPage = readPerPage(window.location.search)
  const filtersForm = qs<HTMLFormElement>(".filter-row")
  const overdueToggle = qs<HTMLInputElement>("#filter-overdue")
  const overdueValue = qs<HTMLInputElement>("#filter-overdue-value")

  // El botón «Filtros» y su panel (S40). El estado abierto se recuerda por ruta
  // durante la sesión y el contador se recalcula en cada rehidratación, como el
  // resto de los controles.
  const filtersToggle = wireFiltersToggle(filtersForm, { path: "/sales" })

  /**
   * Los filtros del listado son los de siempre más los de la venta a crédito
   * (S13). `overdue` no puede viajar como checkbox del form —un checkbox
   * desmarcado manda `on` igual— así que se traduce a `overdue=true` solo cuando
   * corresponde, tanto en la URL como en el pedido a la API.
   */
  function currentFilters(): ISalesListParams {
  const credit = readSalesCreditFilters(window.location.search)
  return {
    ...readSalesFilters(window.location.search),
    ...(credit.payment_terms === "" ? {} : { payment_terms: credit.payment_terms }),
    ...(credit.overdue ? { overdue: true } : {}),
  }
  }

  // El HTML se prerenderiza sin query string: los controles solo pueden reflejar
  // el filtro activo hidratándose en el cliente. No dispara carga ni navegación.
  //
  // Se llama al montar y en cada cambio de filtro (`navigateWithinView`): filtrar
  // ya no recarga el documento, así que la hidratación no puede colgar sólo del
  // `pageshow`. `rehydrateOnPageshow` se queda igual porque el navegador restaura
  // los controles desde el historial de sesión **después** del montaje, y ahí es
  // la última palabra la tiene el formulario, no la URL.
  function hydrateFromUrl(): void {
  const filters = readSalesFilters(window.location.search)
  const credit = readSalesCreditFilters(window.location.search)
  hydrateFilterControls(filtersForm, { ...filters, payment_terms: credit.payment_terms })
  // Sin query string el rango está vacío: el control queda en «Personalizado»
  // con los dos campos a la vista, igual que la fila de antes (S35).
  hydrateDatePresets(filtersForm, filters)
  if (overdueToggle !== null) overdueToggle.checked = credit.overdue
  setControlValue(overdueValue, credit.overdue ? "true" : "")
  const clearLink = qs<HTMLAnchorElement>("[data-filter-clear]")
  if (clearLink !== null) {
    clearLink.href = clearFilterHref("/sales")
  }
  // El contador del botón y la visibilidad de «Limpiar» (S39) salen del mismo
  // conteo: una sola regla para las dos cosas.
  filtersToggle.sync()
  }

  rehydrateOnPageshow(hydrateFromUrl)

  // El checkbox visible escribe el oculto que sí viaja en el envío del form.
  if (overdueToggle !== null && overdueValue !== null) {
  on(overdueToggle, "change", () => {
    setControlValue(overdueValue, overdueToggle.checked ? "true" : "")
  })
  }

  const tbody = qs<HTMLTableSectionElement>("[data-rows]")

  // La fila no es un enlace —no lo dice su rol ni su foco, y el enlace Ver detalle
  // ya es alcanzable con el teclado—: el clic en la fila es una comodidad para
  // puntero que reemite el clic sobre ese enlace, así que el destino sigue siendo
  // su `href` y la navegación la resuelve el router. La decisión de si el clic
  // pertenece a la fila vive en `salesRowClickTarget`.
  //
  // El listener va sobre el `tbody` y no sobre `document` porque la vista se monta
  // y se desmonta con su tabla: un listener de documento sobreviviría a la
  // limpieza de la vista y acumularía uno por visita.
  const onRowClick = (event: MouseEvent): void => {
  salesRowClickTarget(event)?.click()
  }
  tbody.addEventListener("click", onRowClick)

  // La lista ya está en memoria: cambiar de página solo rehace el tbody y el
  // paginador, sin pedir el documento ni la lista otra vez.
  //
  // La URL la mueve el router (`pushQuery`) y no `window.history` directo, como
  // en gastos: así el cambio de página entra al historial por la misma puerta que
  // el resto de las navegaciones y queda anotado en el recuerdo de la pantalla
  // (S58), porque volver al listado tiene que devolver también la página. El
  // `replaceState` es solo la corrección silenciosa de una página fuera de rango.
  const pagerHistory = {
  pushState: (_state: unknown, _title: string, url?: string | URL | null): void => {
    if (url === undefined || url === null) return
    pushQuery(String(url))
  },
  replaceState: (state: unknown, title: string, url?: string | URL | null): void => {
    window.history.replaceState(state, title, url ?? null)
  },
  }

  const pager = createTablePager<ISaleListRow>({
  body: tbody,
  pager: qs<HTMLElement>("[data-pager]"),
  buildRow: (sale) => renderSaleListRow(sale, onStatusChange, onRegisterPayment),
  perPage,
  history: pagerHistory,
  scrollTarget: qs<HTMLElement>(".table-wrap"),
  onRender(state) {
    setText(qs("[data-foot-text]"), footerText(state, operationsLabel))
  },
  })

  let toastTimer = 0

  function showToast(message: string): void {
  if (toast === null || toastMessage === null) return
  setText(toastMessage, message)
  toast.classList.add("is-visible")
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800)
  }

  async function onStatusChange(select: HTMLSelectElement, sale: ISaleListRow): Promise<void> {
  const next = select.value as SaleStatus
  const previous = sale.status
  if (next === previous) return

    const answer = await askConfirm(
      overlay,
      sale,
      next,
      next === "cancelled" ? "Cancelar venta" : "Confirmar cambio",
      next === "completed",
    )
    if (!answer.ok) {
      select.value = previous
      return
    }

  const row = select.closest("tr")
  row?.setAttribute("data-updating", "")
  select.disabled = true
  try {
      await salesApi.updateStatus(sale.id, next, answer.amountPaid)
    sale.status = next
    applyStatusLook(select, sale, next)
    const effect =
      next === "cancelled"
        ? " Deja de sumar en el total del período y ya no se puede cambiar."
        : ""
    showToast(`${formatReference(sale).replace(/^la /, "La ")} actualizada a ${labelFor(next)}.${effect}`)
  } catch (error) {
    select.value = previous
    const note = document.createElement("p")
    note.className = "row-error"
    note.textContent = getErrorMessage(error)
    select.closest(".status-wrap")?.insertAdjacentElement("afterend", note)
    window.setTimeout(() => note.remove(), 6000)
  } finally {
    applySelectLocks(select, sale.status)
    row?.removeAttribute("data-updating")
  }
  }

  /**
   * «Registrar pago» de una venta a crédito (S13). El modal devuelve el cuerpo
   * exacto del pago; la respuesta de la API es el detalle de la venta, así que la
   * fila se actualiza con lo que el libro respondió y no con una cuenta propia.
   */
  async function onRegisterPayment(button: HTMLButtonElement, sale: ISaleListRow): Promise<void> {
  const answer = await askPayment(paymentOverlay, sale)
  if (!answer.ok) return

  const row = button.closest("tr")
  row?.setAttribute("data-updating", "")
  button.disabled = true
  try {
    const updated = await salesApi.registerPayment(sale.id, answer.payload)
    sale.balance = updated.balance
    sale.paid_total = updated.paid_total
    sale.is_overdue = updated.is_overdue
    sale.status = updated.status

    const select = row === null ? null : row.querySelector<HTMLSelectElement>(".status-select")
    if (row !== null && select !== null) {
      applyStatusLook(select, sale, updated.status)
      applyCreditToRow(row, sale)
    }

    showToast(
      `${formatReference(sale).replace(/^la /, "La ")} registró un pago de ${formatMoney(answer.payload.amount)}.`,
    )
  } catch (error) {
    const note = document.createElement("p")
    note.className = "row-error"
    note.textContent = getErrorMessage(error)
    row?.querySelector(".status-wrap")?.insertAdjacentElement("afterend", note)
    window.setTimeout(() => note.remove(), 6000)
  } finally {
    button.disabled = false
    row?.removeAttribute("data-updating")
  }
  }

  function paintKpi(rows: readonly ISaleListRow[]): void {
    const kpi = salesKpi(rows)
    for (const field of KPI_FIELDS) {
      setText(qs(`[data-kpi="${field.id}"]`), field.read(kpi))
    }
    const band = qs<HTMLElement>(".kpi-band")
    if (band !== null) band.setAttribute("aria-busy", "false")
  }

  const paintState = createListStatePainter({
  // Modo fila (S56): el estado se clona dentro del tbody y el ledger sigue
  // visible, así que el encabezado y el paginador no desaparecen.
  template: stateTemplate,
  emptyColspan: 4,
  tbody,
  ledger,
  loadingText: "Cargando ventas…",
  emptyText: "No hay ventas en el rango seleccionado",
  emptyAction: {
    // La píldora de tinta de la piel compartida: el vacío y el error se
    // dibujan como en paquetes, gastos y clientes (S55).
    className: "state-action",
    href: "/sales/new?type=live",
    text: "Registrar la primera venta",
  },
  retryClassName: "state-action",
  onRetry: () => void load(),
  // S2: mientras carga, ocho filas de esqueleto en vez del texto.
  skeleton: { template: skeletonTemplate, rows: 8 },
  })

  async function load(): Promise<void> {
    paintState("loading")
    try {
      const data = await salesApi.list(currentFilters())
      paintKpi(data.sales)
      if (data.sales.length === 0) {
        pager.setRows([])
        paintState("empty")
        return
      }
      pager.setRows(data.sales)
      paintState("ready")
    } catch (error) {
      pager.setRows([])
      paintState("error", getErrorMessage(error))
    }
  }

  // Cambiar el período es una navegación de la vista, igual que en paquetes y
  // gastos (D-013): la URL la mueve el router (`pushQuery`), la vista re-lee su
  // estado y vuelve a pedir sólo la lista. Antes acá había un
  // `window.location.assign`, así que elegir «Últimos 7 días» reconstruía la
  // pantalla entera —HTML, scripts y estilos— para cambiar diez filas.
  function navigateWithinView(url: string): void {
    pushQuery(url)
    hydrateFromUrl()
    void load()
  }

  wireFilterSubmit({
  form: filtersForm,
  path: "/sales",
  navigate: (url) => navigateWithinView(url),
  })
  // Los presets reenvían este mismo form: el rango se escribe en los dos campos y
  // la navegación la sigue decidiendo `wireFilterSubmit`, con los demás filtros.
  wireDatePresets(filtersForm)
  wireAutoFilter(filtersForm)
  void load()

  return () => {
  tbody.removeEventListener("click", onRowClick)
  pager.dispose()
  }
  }
