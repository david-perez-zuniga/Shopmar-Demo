import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mountPackagesList } from "./packages-list"
import { saleListRowDefaults } from "../core/fixtures"
import type { ISalesListResponse } from "../core/api"
import type { IPackageKpis, ISaleListRow } from "../core/types"

/**
 * La vista de paquetes de la SPA (S2).
 *
 * Se monta el markup REAL de `components/views/PackagesView.astro` —el que el
 * router clona dentro de `.app-view`— y se mira lo que ve la clienta: mientras
 * la API no responde, la tabla tiene filas de esqueleto y las cifras están en
 * esqueleto; cuando responde, las filas y las cifras reemplazan al esqueleto.
 *
 * La navegación de la vista (filtros y paginador) mueve la URL con el historial
 * y vuelve a pedir sólo la lista: se mira la URL y el pedido que sale, que es lo
 * que distingue una navegación interna de una recarga del documento.
 */
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  kpis: vi.fn(),
  updateShipmentMethod: vi.fn(),
}))

vi.mock("../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/api")>()
  return {
    ...actual,
    salesApi: {
      ...actual.salesApi,
      list: mocks.list,
      updateShipmentMethod: mocks.updateShipmentMethod,
    },
    dashboardApi: { ...actual.dashboardApi, getPackageKpis: mocks.kpis },
  }
})

const VIEW = resolve("src/components/views/PackagesView.astro")

const KPIS: IPackageKpis = {
  total: 148,
  cargotrans: 61,
  delivery: 43,
  pickup: 29,
  unassigned: 15,
}

function sale(overrides: Partial<ISaleListRow> = {}): ISaleListRow {
  return {
    id: "sale-1",
    sale_date: "2025-03-14",
    customer_name: "Ana Pérez",
    product_name: "Collar de plata",
    type: "live",
    status: "pending",
    cost: "0.00",
    payment_method: "cash",
    shipment_method: "cargotrans",
    additional_count: 0,
    total: "600.00",
    ...saleListRowDefaults,
    ...overrides,
  }
}

/**
 * El markup de la vista, tal como el router lo clona: se corta el componente
 * después del frontmatter, como hacen los fixtures de paquetes.
 */
function mountView(): HTMLElement {
  const source = readFileSync(VIEW, "utf8")
  const frontmatterEnd = source.indexOf("---", source.indexOf("---") + 3) + 3
  const root = document.createElement("div")
  root.className = "app-view"
  root.setAttribute("data-view", "packages")
  root.innerHTML = source.slice(frontmatterEnd)
  document.body.append(root)
  return root
}

function body(root: HTMLElement): HTMLElement {
  const tbody = root.querySelector<HTMLElement>("[data-packages-body]")
  if (tbody === null) throw new Error("la vista no trae [data-packages-body]")
  return tbody
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** Deja correr la promesa de la API y el repintado que dispara. */
function flush(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0))
}

beforeEach(() => {
  window.history.replaceState(null, "", "/packages")
  mocks.list.mockReset()
  mocks.kpis.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ""
})

describe("vista de paquetes: esqueleto y datos (S2)", () => {
  it("mientras carga pinta ocho filas de esqueleto y las cinco cifras en esqueleto", async () => {
    const pending = deferred<ISalesListResponse>()
    mocks.list.mockReturnValue(pending.promise)
    const root = mountView()

    mountPackagesList(root)

    expect(body(root).querySelectorAll("tr[data-skeleton-row]")).toHaveLength(8)
    expect(root.querySelectorAll('[data-kpi] .skeleton.skeleton--value')).toHaveLength(5)
    // La tabla se ve con su forma desde el primer frame: no hay texto de carga.
    expect(root.querySelector<HTMLElement>("[data-ledger]")?.hidden).toBe(false)
    expect(root.textContent).not.toContain("Cargando")

    pending.resolve({ sales: [sale()], total: 1, kpis: KPIS })
    await flush()
  })

  it("con los datos pinta las filas y las cifras y no queda ningún esqueleto", async () => {
    mocks.list.mockResolvedValue({ sales: [sale(), sale({ id: "sale-2" })], total: 2, kpis: KPIS })
    const root = mountView()

    mountPackagesList(root)
    await flush()

    expect(body(root).querySelectorAll("tr[data-skeleton-row]")).toHaveLength(0)
    expect(body(root).querySelectorAll("tr[data-sale-id]")).toHaveLength(2)
    expect(root.querySelector('[data-kpi="total"]')?.textContent).toBe("148")
    expect(root.querySelector('[data-kpi="cargotrans"]')?.textContent).toBe("61")
    expect(root.querySelectorAll(".skeleton")).toHaveLength(0)
    // La banda deja de estar ocupada cuando ya tiene sus cifras.
    expect(root.querySelector(".kpi-band")?.getAttribute("aria-busy")).toBe("false")
  })

  it("sin resultados pinta el estado vacío con su acción", async () => {
    mocks.list.mockResolvedValue({ sales: [], total: 0, kpis: { ...KPIS, total: 0 } })
    const root = mountView()

    mountPackagesList(root)
    await flush()

    const text = root.querySelector("[data-state-text]")
    expect(text?.textContent).toBe("No hay ventas en el rango seleccionado")
    expect(root.querySelector<HTMLElement>("[data-state-action]")?.hidden).toBe(false)
    expect(body(root).querySelectorAll("tr[data-skeleton-row]")).toHaveLength(0)
  })

  it("un error de la API se ve en la fila de estado", async () => {
    mocks.list.mockRejectedValue(new Error("sin red"))
    const root = mountView()

    mountPackagesList(root)
    await flush()

    expect(root.querySelector("[data-state-text]")?.textContent).toBe("sin red")
  })
})

describe("vista de paquetes: navegación sin recargar el documento (S2)", () => {
  it("cambiar de página del paginador mueve la URL y vuelve a pedir la lista", async () => {
    mocks.list.mockResolvedValue({ sales: [sale()], total: 30, kpis: KPIS })
    const root = mountView()

    mountPackagesList(root)
    await flush()

    const next = [...root.querySelectorAll<HTMLButtonElement>("[data-pager] button")].find(
      (button) => button.textContent === "Siguiente",
    )
    if (next === undefined) throw new Error("el paginador no trae «Siguiente»")
    next.click()
    await flush()

    // El historial registra la página y la lista se pide de nuevo con ese
    // número: no hay pedido de documento ni vista reconstruida.
    expect(window.location.pathname).toBe("/packages")
    expect(new URLSearchParams(window.location.search).get("page")).toBe("2")
    expect(mocks.list).toHaveBeenCalledTimes(2)
    expect(mocks.list.mock.calls[1]?.[0]).toMatchObject({ page: 2 })
    expect(body(root).querySelectorAll("tr[data-sale-id]")).toHaveLength(1)
  })

  it("enviar los filtros mueve la URL y vuelve a pedir la lista filtrada", async () => {
    mocks.list.mockResolvedValue({ sales: [sale()], total: 1, kpis: KPIS })
    const root = mountView()

    mountPackagesList(root)
    await flush()

    const form = root.querySelector<HTMLFormElement>("form.filter-row")
    if (form === null) throw new Error("la vista no trae el form de filtros")
    form.insertAdjacentHTML(
      "beforeend",
      '<input type="hidden" name="shipment_method" value="delivery" />',
    )
    form.requestSubmit()
    await flush()

    expect(window.location.pathname).toBe("/packages")
    expect(new URLSearchParams(window.location.search).get("shipment_method")).toBe("delivery")
    expect(mocks.list.mock.calls[1]?.[0]).toMatchObject({ shipment_method: "delivery" })
  })
})
