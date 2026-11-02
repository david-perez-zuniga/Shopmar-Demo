import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mountSummary } from "./summary"
import { dashboardSummaryDefaults } from "../core/fixtures"
import { SUMMARY_FIELDS } from "../summary/summary"
import type {
  IChannelBreakdown,
  IDailySeries,
  IDashboardSummary,
  IShipmentBreakdown,
} from "../core/types"

/**
 * La vista de resumen de la SPA (S2).
 *
 * Se monta el markup REAL de `components/views/SummaryView.astro` —el que el
 * router clona— con dos expansiones mecánicas, igual que el ajuste de
 * `colspan={COLS}` en los fixtures de paquetes: `<StatCard>` pasa a ser su
 * tarjeta renderizada (id + `.stat-value`, con los ids de `SUMMARY_FIELDS`) y
 * `<DateRangeFilter>` su `<form class="date-filter">`. Los dos son componentes
 * de build: sin expandirlos, jsdom no tiene los nodos que la vista consulta.
 *
 * Lo que se mira es lo que ve la clienta: seis tarjetas y tres gráficos en
 * esqueleto mientras la API no responde; cifras y gráficos cuando responde. El
 * filtro de fechas mueve la URL y vuelve a pedir los datos sin recargar el
 * documento.
 */
const mocks = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getDailySeries: vi.fn(),
  getChannelBreakdown: vi.fn(),
  getShipmentBreakdown: vi.fn(),
}))

vi.mock("../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/api")>()
  return {
    ...actual,
    dashboardApi: {
      ...actual.dashboardApi,
      getSummary: mocks.getSummary,
      getDailySeries: mocks.getDailySeries,
      getChannelBreakdown: mocks.getChannelBreakdown,
      getShipmentBreakdown: mocks.getShipmentBreakdown,
    },
  }
})

const VIEW = resolve("src/components/views/SummaryView.astro")

const SUMMARY: IDashboardSummary = {
  total_revenue: "1500.00",
  sales_count: 7,
  total_expenses: "300.00",
  ...dashboardSummaryDefaults,
}

const DAILY: IDailySeries = [
  { date: "2026-10-01", income: "1500.00", expense: "300.00", label: "1 oct" },
]

const BY_CHANNEL: IChannelBreakdown = [
  { channel: "live", count: 5, revenue: "1000.00", label: "Live" },
  { channel: "whatsapp", count: 2, revenue: "500.00", label: "WhatsApp" },
]

const BY_SHIPMENT: IShipmentBreakdown = [
  { method: "cargotrans", count: 4, label: "Cargotrans" },
  { method: "pickup", count: 3, label: "En tienda" },
]

/** El markup de la vista, cortado después del frontmatter y sin su `<style>`. */
function mountView(): HTMLElement {
  const source = readFileSync(VIEW, "utf8")
  const frontmatterEnd = source.indexOf("---", source.indexOf("---") + 3) + 3
  const stylesStart = source.indexOf("<style")
  const root = document.createElement("div")
  root.className = "app-view"
  root.setAttribute("data-view", "summary")
  root.innerHTML = source.slice(frontmatterEnd, stylesStart === -1 ? undefined : stylesStart)
  expandStatCards(root)
  expandDateFilter(root)
  document.body.append(root)
  return root
}

/** `<StatCard>` → la tarjeta que emite: id, rótulo y `.stat-value`. */
function expandStatCards(root: HTMLElement): void {
  const grid = root.querySelector<HTMLElement>("[data-stat-grid]")
  if (grid === null) throw new Error("la vista no trae [data-stat-grid]")
  grid.innerHTML = SUMMARY_FIELDS.map(
    (field) =>
      `<div class="stat-card" id="${field.id}"><p class="stat-label">${field.label}</p><p class="stat-value">—</p></div>`,
  ).join("")
}

/** `<DateRangeFilter>` → su `<form class="date-filter">` con los dos campos. */
function expandDateFilter(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>(".page-head-filter")
  if (host === null) throw new Error("la vista no trae .page-head-filter")
  host.innerHTML =
    '<form class="date-filter" method="get" action="/">' +
    '<input name="start_date" value="" /><input name="end_date" value="" />' +
    "</form>"
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function flush(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0))
}

/** Las cuatro llamadas del resumen resueltas con los datos del caso. */
function resolveApi(): void {
  mocks.getSummary.mockResolvedValue(SUMMARY)
  mocks.getDailySeries.mockResolvedValue(DAILY)
  mocks.getChannelBreakdown.mockResolvedValue(BY_CHANNEL)
  mocks.getShipmentBreakdown.mockResolvedValue(BY_SHIPMENT)
}

beforeEach(() => {
  window.history.replaceState(null, "", "/")
  for (const mock of Object.values(mocks)) mock.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ""
})

describe("vista de resumen: esqueleto y datos (S2)", () => {
  it("mientras carga deja las seis tarjetas y los tres gráficos en esqueleto", async () => {
    const pending = deferred<IDashboardSummary>()
    resolveApi()
    mocks.getSummary.mockReturnValue(pending.promise)
    const root = mountView()

    mountSummary(root)

    expect(root.querySelectorAll(".stat-value .skeleton.skeleton--value")).toHaveLength(6)
    expect(root.querySelectorAll(".chart-placeholder .skeleton.skeleton--block")).toHaveLength(3)
    // Nada de texto «Cargando…» donde hay esqueleto.
    expect(root.textContent).not.toContain("Cargando")

    pending.resolve(SUMMARY)
    await flush()
  })

  it("con los datos pinta las seis cifras y los tres gráficos, sin esqueleto", async () => {
    resolveApi()
    const root = mountView()

    mountSummary(root)
    await flush()

    for (const field of SUMMARY_FIELDS) {
      expect(root.querySelector(`#${field.id} .stat-value`)?.textContent).toBe(field.read(SUMMARY))
    }
    expect(root.querySelectorAll(".skeleton")).toHaveLength(0)
    expect(root.querySelector("[data-chart-daily] svg")).not.toBeNull()
    expect(root.querySelector("[data-chart-channel] svg")).not.toBeNull()
    expect(root.querySelector("[data-chart-shipment] svg")).not.toBeNull()
    expect(root.querySelector("[data-stat-grid]")?.getAttribute("aria-busy")).toBe("false")
  })

  it("el aviso de error se ve y «Reintentar» vuelve a pedir los datos", async () => {
    resolveApi()
    mocks.getSummary.mockRejectedValueOnce(new Error("sin red"))
    const root = mountView()

    mountSummary(root)
    await flush()

    const errorBox = root.querySelector<HTMLElement>("[data-error]")
    expect(errorBox?.hidden).toBe(false)
    expect(root.querySelector("[data-error-text]")?.textContent).toBe("sin red")

    root.querySelector<HTMLButtonElement>("[data-retry]")?.click()
    await flush()

    expect(root.querySelector<HTMLElement>("[data-error]")?.hidden).toBe(true)
    expect(root.querySelector("#stat-revenue .stat-value")?.textContent).toBe(
      SUMMARY_FIELDS[0]!.read(SUMMARY),
    )
  })
})

describe("vista de resumen: navegación sin recargar el documento (S2)", () => {
  it("enviar el filtro de fechas mueve la URL y vuelve a pedir el resumen", async () => {
    window.history.replaceState(null, "", "/?start_date=2026-10-01&end_date=2026-10-07")
    resolveApi()
    const root = mountView()

    mountSummary(root)
    await flush()

    const form = root.querySelector<HTMLFormElement>("form.date-filter")
    if (form === null) throw new Error("la vista no trae el form de fechas")
    form.requestSubmit()
    await flush()

    // El historial registra el rango y la API se pide de nuevo con él: no hay
    // pedido de documento ni vista reconstruida.
    expect(window.location.pathname).toBe("/")
    expect(new URLSearchParams(window.location.search).get("start_date")).toBe("2026-10-01")
    expect(new URLSearchParams(window.location.search).get("end_date")).toBe("2026-10-07")
    expect(mocks.getSummary).toHaveBeenCalledTimes(2)
    expect(mocks.getSummary.mock.calls[1]?.[0]).toMatchObject({
      start_date: "2026-10-01",
      end_date: "2026-10-07",
    })
  })
})
