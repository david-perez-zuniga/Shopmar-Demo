/**
 * La vista de gastos de la SPA (S2).
 *
 * Es el mismo script de la pantalla de siempre con tres cambios: el ciclo lo
 * maneja el router (`mount` devuelve la limpieza), toda consulta al DOM se hace
 * contra la raíz de la vista —así dos vistas montadas en momentos distintos no
 * pueden pisarse los `[name]`— y la navegación interna (el período y el
 * paginador) mueve la URL sin pedir el documento.
 *
 * Los datos se piden en cada montaje y en cada cambio de filtro: la vista no
 * guarda listas entre navegaciones, así que nunca se ven cifras ni filas viejas
 * (S3). Mientras la respuesta viaja, la banda y la tabla muestran esqueletos
 * (S2): la pantalla ya tiene la forma de lo que va a llegar y no hay texto
 * «Cargando…».
 */

import { pushQuery } from "../app/start"
import { qs as querySelector, setText } from "../core/dom"
import { expensesApi } from "../core/api"
import { getErrorMessage } from "../core/errors"
import { formatCords } from "../core/format"
import { expensesKpi, expensesKpiLabelAndNote, expensesLabel } from "../expenses/expenses-kpi"
import { renderExpenseListRow } from "../expenses/expense-list-row"
import { activeFilterCount, readExpensesFilters, readPerPage } from "../lists/filters"
import {
  clearFilterHref,
  hydrateDatePresets,
  hydrateFilterControls,
  wireAutoFilter,
  wireDatePresets,
  wireFilterSubmit,
} from "../lists/filter-controls"
import { createListStatePainter } from "../lists/list-state"
import { footerText } from "../lists/pagination"
import { createTablePager } from "../lists/table-pager"
import type { IExpenseResponse } from "../core/types"

export function mountExpensesList(root: HTMLElement): () => void {
  /** El `qs` de la vista: resuelve contra la raíz, nunca contra el documento. */
  const qs = <T extends Element>(sel: string) => querySelector<T>(sel, root)

  // El gancho del tbody es `[data-rows]` en esta pantalla (paquetes usa
  // `[data-packages-body]`): se consulta el que trae el markup, no un nombre
  // inventado por el script.
  const tbody = qs<HTMLTableSectionElement>("[data-rows]")
  const ledger = qs<HTMLElement>("[data-ledger]")
  const stateTemplate = qs<HTMLTemplateElement>("[data-state-template]")
  const skeletonTemplate = qs<HTMLTemplateElement>("[data-skeleton-template]")
  const filtersForm = qs<HTMLFormElement>(".filter-row")
  const band = qs<HTMLElement>(".kpi-band")

  const perPage = readPerPage(window.location.search)

  // El HTML se prerenderiza sin query string: los controles solo pueden reflejar
  // el filtro activo hidratándose en el cliente. No dispara carga ni navegación.
  // Se rehidrata en cada montaje y no en `pageshow`: en la SPA no hay documento
  // que esperar y el router ya vuelve a montar la vista al volver con atrás, así
  // que un listener extra solo dejaría el DOM viejo retenido por navegación.
  function hydrateFromUrl(): void {
    const filters = readExpensesFilters(window.location.search)
    hydrateFilterControls(filtersForm, filters)
    hydrateDatePresets(filtersForm, filters)
    const clearLink = qs<HTMLAnchorElement>("[data-filter-clear]")
    if (clearLink !== null) {
      // Gastos no tiene botón «Filtros» (S40): el enlace se muestra solo cuando
      // hay algo aplicado, con la misma regla que el contador de las otras dos.
      clearLink.hidden = activeFilterCount(filters) === 0
      clearLink.href = clearFilterHref("/expenses")
    }
  }

  hydrateFromUrl()

  function paintKpi(expenses: readonly IExpenseResponse[]): void {
    const kpi = expensesKpi(expenses)
    const { label, note } = expensesKpiLabelAndNote(readExpensesFilters(window.location.search))

    // El esqueleto del markup es un hijo más del hueco: escribir el total lo
    // reemplaza, así que no queda ningún bloque detrás de la cifra.
    setText(qs("[data-kpi='total']"), formatCords(kpi.total))
    setText(qs("[data-kpi-label]"), label)
    setText(qs("[data-kpi-note]"), note)

    if (band !== null) band.setAttribute("aria-busy", "false")
  }

  // La lista ya está en memoria: cambiar de página solo rehace el tbody y el
  // paginador, sin pedir el documento ni la lista otra vez (D-013).
  //
  // El paginador de cliente es el dueño de las filas y de la ventana de páginas,
  // pero la URL la mueve el router: `pushQuery` entra al historial sin remontar
  // la vista. El `replaceState` es solo la corrección silenciosa de una página
  // fuera de rango, así que no agrega un paso al historial.
  const pagerHistory = {
    pushState: (_state: unknown, _title: string, url?: string | URL | null): void => {
      if (url === undefined || url === null) return
      pushQuery(String(url))
    },
    replaceState: (state: unknown, title: string, url?: string | URL | null): void => {
      window.history.replaceState(state, title, url ?? null)
    },
  }

  const pager = createTablePager<IExpenseResponse>({
    body: tbody,
    pager: qs<HTMLElement>("[data-pager]"),
    buildRow: renderExpenseListRow,
    perPage,
    history: pagerHistory,
    scrollTarget: qs<HTMLElement>(".table-wrap"),
    onRender(state) {
      setText(qs("[data-foot-text]"), footerText(state, expensesLabel))
    },
  })

  const paintState = createListStatePainter({
    // Modo fila (S56): el estado se clona dentro del tbody y el ledger sigue
    // visible, así que el encabezado y el paginador no desaparecen.
    template: stateTemplate,
    tbody,
    ledger,
    loadingText: "Cargando gastos…",
    emptyText: "No hay gastos en el rango seleccionado",
    emptyAction: {
      className: "state-action",
      href: "/expenses/new",
      text: "Registrar el primer gasto",
    },
    retryClassName: "state-action",
    onRetry: () => void load(),
    // Esqueleto de carga (S2): ocho filas con la forma del listado en vez de la
    // fila con texto de espera.
    skeleton: { template: skeletonTemplate, rows: 8 },
  })

  // Dos pedidos pueden solaparse (cambiar de rango mientras la primera carga
  // sigue en vuelo). Cada carga lleva un número y solo la última puede pintar:
  // una respuesta vieja que llega tarde no pisa lo que la clienta está viendo.
  // La limpieza lo invalida, así que un pedido en vuelo tampoco pinta sobre una
  // vista que el router ya desmontó.
  let loadToken = 0

  async function load(): Promise<void> {
    const token = ++loadToken
    paintState("loading")
    const filters = readExpensesFilters(window.location.search)
    try {
      const { expenses } = await expensesApi.list(filters)
      if (token !== loadToken) return

      paintKpi(expenses)

      if (expenses.length === 0) {
        pager.setRows([])
        paintState("empty")
        return
      }

      pager.setRows(expenses)
      paintState("ready")
    } catch (error) {
      if (token !== loadToken) return
      pager.setRows([])
      paintState("error", getErrorMessage(error))
    }
  }

  // Cambiar el período es una navegación de la vista: la URL la mueve el router
  // (`pushQuery`) y la vista solo re-lee su estado y vuelve a pedir sus datos,
  // así que el documento no se recarga. El paginador reusa las filas ya
  // cargadas y escribe su `page` en el historial con el mismo efecto.
  function navigateWithinView(url: string): void {
    pushQuery(url)
    hydrateFromUrl()
    void load()
  }

  if (filtersForm !== null) {
    wireFilterSubmit({
      form: filtersForm,
      path: "/expenses",
      navigate: (url) => navigateWithinView(url),
    })
    // Un preset reenvía la fila entera y cae en el submit de arriba.
    wireDatePresets(filtersForm)
    wireAutoFilter(filtersForm)
  }

  void load()

  return () => {
    loadToken += 1
    pager.dispose()
  }
}
