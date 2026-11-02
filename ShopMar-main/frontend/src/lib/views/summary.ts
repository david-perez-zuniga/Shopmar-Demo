/**
 * La vista de resumen de la SPA (S2).
 *
 * Es el mismo script de la pantalla de siempre con tres cambios: el ciclo lo
 * maneja el router (`mount` devuelve la limpieza), toda consulta al DOM se hace
 * contra la raíz de la vista y el filtro de fechas navega por `navigateTo` en
 * vez de recargar el documento.
 *
 * Mientras la API responde, las seis tarjetas y los tres gráficos muestran
 * esqueletos (S2): la pantalla ya tiene la forma de lo que va a llegar y no hay
 * texto «Cargando…». Los datos se piden en cada montaje, así que nunca se ven
 * cifras viejas (S3).
 */

import { dashboardApi } from "../core/api"
import { on, qs as querySelector, setText } from "../core/dom"
import { pushQuery } from "../app/start"
import { getErrorMessage } from "../core/errors"
import { utcOffsetMinutes } from "../core/date"
import { readSummaryFilters } from "../lists/filters"
import {
  filterHref,
  hydrateDatePresets,
  hydrateFilterControls,
  readFilterQuery,
  wireAutoFilter,
  wireDatePresets,
} from "../lists/filter-controls"
import {
  SUMMARY_FIELDS,
  dailyChartHeading,
  effectiveRange,
  formatDateShort,
  isEmptyRange,
  isSingleDayRange,
} from "../summary/summary"
import { renderBarChart } from "../summary/bar-chart"
import { renderDonutChart } from "../summary/donut-chart"
import { channelColor, shipmentColor } from "../summary/chart-colors"
import type { IDailySeriesPoint, IDashboardSummary } from "../core/types"

type ChartMode = "income" | "expense" | "both"

export function mountSummary(root: HTMLElement): () => void {
  /** El `qs` de la vista: resuelve contra la raíz, nunca contra el documento. */
  const qs = <T extends Element>(sel: string) => querySelector<T>(sel, root)

  const grid = qs<HTMLElement>("[data-stat-grid]")
  const empty = qs<HTMLElement>("[data-empty]")
  const errorBox = qs<HTMLElement>("[data-error]")
  const errorText = qs<HTMLElement>("[data-error-text]")
  const retry = qs<HTMLButtonElement>("[data-retry]")
  const rangeLabel = qs<HTMLElement>("[data-range-label]")
  const dailyChart = qs<HTMLElement>("[data-chart-daily]")
  const dailyTitle = qs<HTMLElement>("[data-chart-daily-title]")
  const dailySubtitle = qs<HTMLElement>("[data-chart-daily-subtitle]")
  const channelChart = qs<HTMLElement>("[data-chart-channel]")
  const shipmentChart = qs<HTMLElement>("[data-chart-shipment]")

  let chartMode: ChartMode = "both"
  let dailyCache: IDailySeriesPoint[] = []

  const valueOf = (id: string): HTMLElement | null => qs<HTMLElement>(`#${id} .stat-value`)

  const filterForm = qs<HTMLFormElement>("form.date-filter")

  /**
   * Esqueleto de las seis cifras (S2). Va acá y no en el markup porque
   * `StatCard` es un componente compartido que no recibe markup: la estructura
   * de la tarjeta es la de siempre y el hueco del valor arranca como bloque.
   */
  function paintCardSkeletons(): void {
    for (const field of SUMMARY_FIELDS) {
      const target = valueOf(field.id)
      if (target === null) continue
      const placeholder = document.createElement("span")
      placeholder.className = "skeleton skeleton--value"
      target.replaceChildren(placeholder)
    }
  }

  // El HTML se prerenderiza sin query string: los controles solo pueden reflejar
  // el filtro activo hidratándose en el cliente. No dispara carga ni navegación.
  // Corre en el montaje y no en `pageshow`: en la SPA no hay carga de documento
  // que esperar y el router ya vuelve a montar la vista en `pageshow`, así que
  // un listener extra solo retendría el DOM viejo en cada navegación.
  function hydrateFromUrl(): void {
    if (filterForm === null) return
    const filters = readSummaryFilters(window.location.search)
    const range = effectiveRange(filters)
    hydrateFilterControls(filterForm, range)
    // Sin query string el resumen usa hoy (S36): el select y los campos se
    // hidratan con ese rango, y no hay enlace «Limpiar» que limpiar (S38).
    hydrateDatePresets(filterForm, filters)

    if (rangeLabel !== null) {
      const parts: string[] = []
      if (range.start_date !== "") parts.push(`desde ${formatDateShort(range.start_date)}`)
      if (range.end_date !== "") parts.push(`hasta ${formatDateShort(range.end_date)}`)
      setText(rangeLabel, parts.join(" · "))
      rangeLabel.hidden = false
    }
  }

  hydrateFromUrl()

  // Cambiar el rango vuelve a pedir los datos y repinta la vista sin recargar el
  // documento: el historial registra el estado y el botón atrás funciona.
  //
  // La navegación se resuelve acá y no con `navigateTo` del router porque ese
  // helper todavía cae siempre a `location.assign` (su guarda busca la plantilla
  // dentro de `[data-app-root]`, y las plantillas son hermanas del contenedor),
  // así que usarlo hoy recargaría el documento.
  function navigateWithinView(url: string): void {
    // La URL la mueve el router; la vista sólo re-lee su estado y recarga sus
    // datos, así no hay dos formas de navegar en la app.
    pushQuery(url)
    hydrateFromUrl()
    void load()
  }

  if (filterForm !== null) {
    on(filterForm, "submit", (event) => {
      event.preventDefault()
      navigateWithinView(filterHref("/", readFilterQuery(filterForm)))
    })
    // «Hoy» y «Últimos 7 días» reenvían este mismo form, así que el rango viaja
    // por la URL igual que cuando se escribe a mano y el botón atrás funciona.
    wireDatePresets(filterForm)
    wireAutoFilter(filterForm)
  }

  function paint(summary: IDashboardSummary): void {
    if (grid === null) return
    // Las cifras se pintan siempre, también cuando el rango está vacío: el cero
    // sale formateado (C$ 0.00) y no como un guion que oculte que no hay datos.
    for (const field of SUMMARY_FIELDS) {
      const target = valueOf(field.id)
      if (target !== null) setText(target, field.read(summary))
    }
    grid.hidden = false
    if (empty !== null) empty.hidden = !isEmptyRange(summary)
  }

  function paintCharts(daily: any[], byChannel: any[], byShipment: any[]): void {
    dailyCache = daily
    renderBarChart(dailyChart, daily, chartMode)
    // La API identifica el canal como `whatsapp`; en la UI ese flujo es la venta
    // en tienda. La traducción vive acá para no tocar el contrato del backend.
    const channelSegments = byChannel.map((point) => ({
      ...point,
      label: point.channel === "whatsapp" ? "Tienda" : point.label,
    }))
    renderDonutChart(channelChart, channelSegments, {
      totalLabel: "TOTAL",
      totalValue: byChannel.reduce((s, c) => s + c.count, 0) + " ventas",
      color: channelColor,
    })
    renderDonutChart(shipmentChart, byShipment, {
      totalLabel: "PAQUETES",
      totalValue: byShipment.reduce((s, c) => s + c.count, 0) + " envíos",
      color: shipmentColor,
    })
  }

  function paintError(message: string): void {
    if (errorText !== null) setText(errorText, message)
    if (errorBox !== null) errorBox.hidden = false
    if (grid !== null) {
      grid.hidden = true
      grid.setAttribute("aria-busy", "false")
    }
    if (empty !== null) empty.hidden = true
  }

  // Dos cargas pueden solaparse (reintentar mientras la primera sigue en vuelo):
  // sólo la última pinta. La limpieza lo invalida, así que un pedido en vuelo
  // tampoco escribe sobre una vista que el router ya desmontó.
  let loadToken = 0

  async function load(): Promise<void> {
    if (grid === null) return
    const token = ++loadToken
    if (errorBox !== null) errorBox.hidden = true

    const filters = effectiveRange(readSummaryFilters(window.location.search))

    // Con un solo día el eje del gráfico son horas, así que la tarjeta cambia
    // de título con el mismo criterio con el que el backend elige granularidad
    // (S5).
    const heading = dailyChartHeading(isSingleDayRange(filters))
    if (dailyTitle !== null) setText(dailyTitle, heading.title)
    if (dailySubtitle !== null) setText(dailySubtitle, heading.subtitle)

    try {
      const [summary, daily, byChannel, byShipment] = await Promise.all([
        dashboardApi.getSummary(filters),
        // El gráfico de un solo día pone cada barra en la hora del reloj del
        // cliente: la API necesita el desplazamiento para saber cuál es esa hora.
        dashboardApi.getDailySeries({ ...filters, tz_offset: utcOffsetMinutes() }),
        dashboardApi.getChannelBreakdown(filters),
        dashboardApi.getShipmentBreakdown(filters),
      ])
      if (token !== loadToken) return
      paint(summary)
      paintCharts(daily, byChannel, byShipment)
      reveal()
    } catch (error) {
      if (token !== loadToken) return
      console.error("[resumen] Load error:", error)
      paintError(getErrorMessage(error))
    } finally {
      if (token === loadToken) grid.setAttribute("aria-busy", "false")
    }
  }

  function reveal(): void {
    if (grid === null) return
    const cards = grid.querySelectorAll<HTMLElement>(".stat-card")
    cards.forEach((card) => card.classList.add("reveal"))
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cards.forEach((card) => card.classList.add("visible"))
      })
    })
  }

  const chartModeSelect = qs<HTMLSelectElement>("#chart-daily-mode")
  if (chartModeSelect !== null) {
    chartModeSelect.value = chartMode
    on(chartModeSelect, "change", () => {
      chartMode = chartModeSelect.value as ChartMode
      if (dailyCache.length > 0) renderBarChart(dailyChart, dailyCache, chartMode)
    })
  }

  if (retry !== null) on(retry, "click", () => void load())

  paintCardSkeletons()
  void load()

  return () => {
    loadToken += 1
  }
}
