/**
 * La vista de paquetes de la SPA (S2).
 *
 * Es el mismo script de la pantalla de siempre con tres cambios: el ciclo lo
 * maneja el router (`mount` devuelve la limpieza), toda consulta al DOM se hace
 * contra la raíz de la vista —así dos vistas montadas en momentos distintos no
 * pueden pisarse los `[name]`— y la navegación interna (filtros y paginador)
 * pasa por `pushQuery` del router: cambiar de página mueve la URL y repinta la
 * vista sin pedir el documento, en vez de recargar la pantalla entera para
 * cambiar diez filas (D-013).
 *
 * Los datos siguen viniendo de la API en cada montaje: el router no guarda
 * listas, así que nunca se ven filas viejas (S3). Mientras la respuesta viaja,
 * la tabla y la banda de KPI muestran esqueletos (S2).
 */

import { pushQuery } from "../app/start"
import { qs as querySelector, setText } from "../core/dom"
import { dashboardApi, salesApi } from "../core/api"
import { getErrorMessage } from "../core/errors"
import { readPage, readPerPage, readPackagesFilters } from "../lists/filters"
import {
  clearFilterHref,
  hydrateDatePresets,
  hydrateFilterControls,
  wireAutoFilter,
  wireDatePresets,
  wireFilterSubmit,
  wireFiltersToggle,
} from "../lists/filter-controls"
import { clampPage, footerText, pageHref, totalPages } from "../lists/pagination"
import { createListStatePainter } from "../lists/list-state"
import { operationsLabel } from "../sales/sales-kpi"
import { paintPackageKpis, paintKpiFilter } from "../packages/kpi-band"
import { paintPackagePager } from "../packages/package-pager"
import { renderPackageRow } from "../packages/package-row"
import { createShipmentChangeHandler } from "../packages/shipment-status"

export function mountPackagesList(root: HTMLElement): () => void {
  /** El `qs` de la vista: resuelve contra la raíz, nunca contra el documento. */
  const qs = <T extends Element>(sel: string) => querySelector<T>(sel, root)

  const tbody = qs<HTMLTableSectionElement>("[data-packages-body]")
  const rowTemplate = qs<HTMLTemplateElement>("[data-row-template]")
  const stateTemplate = qs<HTMLTemplateElement>("[data-state-template]")
  const skeletonTemplate = qs<HTMLTemplateElement>("[data-skeleton-template]")
  const ledger = qs<HTMLElement>("[data-ledger]")
  const pagerHost = qs<HTMLElement>("[data-pager]")
  const band = qs<HTMLElement>(".kpi-band")

  const filtersFromSearch = (): ReturnType<typeof readPackagesFilters> =>
    readPackagesFilters(window.location.search)

  const filterForm = qs<HTMLFormElement>("form.filter-row")

  // El botón «Filtros» y su panel (S40). El estado se recuerda por ruta durante
  // la sesión; el contador se recalcula en cada hidratación, y acá se rehidrata
  // también en cada montaje, así que el número nunca queda viejo.
  const filtersToggle = wireFiltersToggle(filterForm, { path: "/packages" })

  // El HTML se prerenderiza sin query string: los controles solo pueden reflejar
  // el filtro activo hidratándose en el cliente. No dispara carga ni navegación.
  // La banda KPI se re-evalúa en la misma pasada: también depende del filtro.
  function hydrateFromUrl(): void {
    const filters = readPackagesFilters(window.location.search)
    hydrateFilterControls(filterForm, filters)
    hydrateDatePresets(filterForm, filters)
    const clearLink = qs<HTMLAnchorElement>("[data-filter-clear]")
    if (clearLink !== null) {
      clearLink.href = clearFilterHref("/packages")
    }
    // El contador del botón y la visibilidad de «Limpiar» (S39) salen del mismo
    // conteo: una sola regla para las dos cosas.
    filtersToggle.sync()
    paintKpiFilter(root)
  }

  // La hidratación corre en el montaje y no cuelga de `pageshow`: en la SPA no
  // hay carga de documento que esperar, y el router ya vuelve a montar la vista
  // en `pageshow`, así que un listener extra solo dejaría una copia del DOM
  // viejo retenida por cada navegación.
  hydrateFromUrl()

  // Filtrar o paginar mueve la URL y vuelve a pedir solo la lista: el historial
  // registra el estado y la tabla se repinta sin recargar el documento. Un
  // `location.assign` acá obligaba al navegador a reconstruir la pantalla
  // entera —HTML, scripts y estilos— para cambiar diez filas (decisión D-013).
  //
  // La navegación se resuelve en la vista y no con `navigateTo` del router
  // porque ese helper todavía cae siempre a `location.assign` (su guarda busca
  // la plantilla dentro de `[data-app-root]`, y las plantillas son hermanas del
  // contenedor), así que usarlo hoy recargaría el documento.
  function navigateWithinView(url: string): void {
    // La URL la mueve el router; la vista sólo re-lee su estado y recarga sus
    // datos, así no hay dos formas de navegar en la app.
    pushQuery(url)
    hydrateFromUrl()
    void load()
  }

  if (filterForm !== null) {
    wireFilterSubmit({
      form: filterForm,
      path: "/packages",
      navigate: (url) => navigateWithinView(url),
    })
    // Un preset reenvía la fila entera y cae en el submit de arriba: la tabla se
    // repinta sin recargar el documento, igual que al cambiar el método.
    wireDatePresets(filterForm)
    wireAutoFilter(filterForm)
  }

  // El manejador del `change` vive en `lib/packages/shipment-status.ts` y recibe
  // por parámetro sus dos dependencias: el PATCH y este refresco de KPIs. Acá la
  // vista resuelve el filtro activo y arma los params; el módulo no navega ni
  // pide red por su cuenta.
  function reloadKpis(): void {
    const filters = filtersFromSearch()
    const params: { start_date?: string; end_date?: string } = {}
    if (filters.start_date !== "") params.start_date = filters.start_date
    if (filters.end_date !== "") params.end_date = filters.end_date
    loadKpis(params)
  }

  const onShipmentChange = createShipmentChangeHandler({
    updateShipmentMethod: (id, method) => salesApi.updateShipmentMethod(id, method),
    reloadKpis,
  })

  // La fila de estado se clona dentro del tbody y destapa el ledger en todos los
  // estados. Es el modo fila de `lists/list-state.ts`, el mismo del listado de
  // ventas, y con el mismo esqueleto de carga (S2): ocho filas con la forma de
  // los datos en vez de un texto «Cargando…». El `colspan` de la fila de estado
  // no se toca: es el que ya trae la plantilla, que lo toma de `COLS`.
  const paintState = createListStatePainter({
    template: stateTemplate,
    tbody,
    ledger,
    loadingText: "Cargando paquetes…",
    emptyText: "No hay ventas en el rango seleccionado",
    emptyAction: {
      className: "state-action",
      href: "/sales/new?type=live",
      text: "Registrar venta",
    },
    retryClassName: "state-action",
    onRetry: () => void load(),
    skeleton: { template: skeletonTemplate, rows: 8 },
  })

  /** Si el tbody tiene filas de datos. La fila de estado no cuenta: es una sola celda. */
  function hasRows(): boolean {
    return tbody !== null && tbody.querySelector("tr[data-sale-id]") !== null
  }

  function markBusy(busy: boolean): void {
    if (ledger !== null) ledger.setAttribute("aria-busy", busy ? "true" : "false")
  }

  function goToPage(target: number): void {
    navigateWithinView(pageHref("/packages", window.location.search, target))
  }

  // Refresco de KPIs posterior a una mutación (cambio de método de envío): ahí
  // ya no hay una lista que traer, así que se pide el agregado solo.
  function loadKpis(params: { start_date?: string; end_date?: string }): void {
    void dashboardApi
      .getPackageKpis(params)
      .then((kpis) => paintPackageKpis(kpis, root))
      .catch(() => undefined)
  }

  // Dos pedidos pueden solaparse (reintentar mientras la primera carga sigue en
  // vuelo). Cada carga lleva un número y sólo la última puede pintar: una
  // respuesta vieja que llega tarde no pisa la tabla que la clienta está viendo.
  // La limpieza lo invalida, así que un pedido en vuelo tampoco pinta sobre una
  // vista que el router ya desmontó.
  let loadToken = 0

  async function load(): Promise<void> {
    const token = ++loadToken
    // Con filas ya pintadas, el estado de carga vaciaba el tbody y la tabla se
    // encogía y volvía a crecer en cada salto de página. Cambiar de página es
    // volver a pedir la lista, no reconstruir la vista: se conserva lo que se
    // está viendo y la tabla queda marcada como ocupada. El esqueleto es para la
    // primera pintada, cuando no hay nada que conservar (S2).
    if (hasRows()) markBusy(true)
    else paintState("loading")

    const filters = filtersFromSearch()
    const params: {
      start_date?: string
      end_date?: string
      shipment_method?: string
      page: number
      per_page: number
      include_kpis: boolean
    } = {
      page: readPage(window.location.search),
      per_page: readPerPage(window.location.search),
      // Las filas y los KPIs salen del mismo filtro: pedirlos juntos evita una
      // segunda llamada y un segundo recorrido de la tabla por carga.
      include_kpis: true,
    }
    if (filters.start_date !== "") params.start_date = filters.start_date
    if (filters.end_date !== "") params.end_date = filters.end_date
    if (filters.shipment_method !== "") params.shipment_method = filters.shipment_method

    try {
      const salesRes = await salesApi.list(params)
      if (token !== loadToken) return

      if (salesRes.kpis !== undefined) paintPackageKpis(salesRes.kpis, root)
      if (band !== null) band.setAttribute("aria-busy", "false")

      if (salesRes.total === 0) {
        paintState("empty")
        return
      }

      const perPageVal = readPerPage(window.location.search)
      const total = salesRes.total
      const pages = totalPages(total, perPageVal)
      const current = clampPage(readPage(window.location.search), total, perPageVal)
      tbody?.replaceChildren(
        ...salesRes.sales.map((sale) => renderPackageRow(sale, rowTemplate, onShipmentChange)),
      )
      paintPackagePager(pagerHost, current, pages, goToPage)

      setText(
        qs("[data-foot-text]"),
        footerText({ page: current, total, perPage: perPageVal }, operationsLabel),
      )
      paintState("ready")
    } catch (error) {
      if (token !== loadToken) return
      paintState("error", getErrorMessage(error))
    } finally {
      // Sólo la última carga apaga la marca; si llegó tarde, la que manda ya la
      // dejó puesta y se encarga ella.
      if (token === loadToken) markBusy(false)
    }
  }

  void load()

  return () => {
    loadToken += 1
  }
}
