import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mountExpensesList } from "./expenses-list"
import type { IExpenseResponse } from "../core/types"

/**
 * La vista de gastos de la SPA (S2).
 *
 * Se monta el markup REAL de `components/views/ExpensesView.astro` —el que el
 * router clona dentro de `.app-view`— y se mira lo que ve la clienta: mientras
 * la API no responde, la tabla tiene ocho filas de esqueleto y la cifra del KPI
 * está en esqueleto, sin texto «Cargando…»; cuando responde, las filas y el
 * total reemplazan al esqueleto.
 *
 * La navegación de la vista (el período y el paginador) mueve la URL sin pedir
 * el documento: se mira la URL, los pedidos que salen y —en el módulo— que no
 * haya `location.assign` ni un `popstate` propio.
 */
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
}))

vi.mock("../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/api")>()
  return {
    ...actual,
    expensesApi: { ...actual.expensesApi, list: mocks.list },
  }
})

const VIEW = resolve("src/components/views/ExpensesView.astro")
const MODULE = resolve("src/lib/views/expenses-list.ts")

function expense(overrides: Partial<IExpenseResponse> = {}): IExpenseResponse {
  return {
    id: "exp-1",
    name: "Proveedor Textiles del Norte",
    description: "Reposición de sudaderas",
    total: "12500.50",
    expense_date: "2025-03-04",
    created_at: "2025-03-04T12:00:00.000Z",
    updated_at: "2025-03-04T12:00:00.000Z",
    ...overrides,
  }
}

/** El markup de la vista, cortado después del frontmatter, como el router. */
function mountView(): HTMLElement {
  const source = readFileSync(VIEW, "utf8")
  const frontmatterEnd = source.indexOf("---", source.indexOf("---") + 3) + 3
  const root = document.createElement("div")
  root.className = "app-view"
  root.setAttribute("data-view", "expenses")
  root.innerHTML = source.slice(frontmatterEnd)
  document.body.append(root)
  return root
}

/** El gancho del tbody de esta pantalla: `[data-rows]`, como en el markup. */
function body(root: HTMLElement): HTMLElement {
  const tbody = root.querySelector<HTMLElement>("[data-rows]")
  if (tbody === null) throw new Error("la vista no trae [data-rows]")
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
  window.history.replaceState(null, "", "/expenses")
  mocks.list.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ""
})

describe("vista de gastos: esqueleto y datos (S2)", () => {
  it("mientras carga pinta ocho filas de esqueleto y la cifra en esqueleto", async () => {
    const pending = deferred<{ expenses: IExpenseResponse[] }>()
    mocks.list.mockReturnValue(pending.promise)
    const root = mountView()

    mountExpensesList(root)

    expect(body(root).querySelectorAll("tr[data-skeleton-row]")).toHaveLength(8)
    expect(root.querySelectorAll('[data-kpi="total"] .skeleton.skeleton--value')).toHaveLength(1)
    // La tabla se ve con su forma desde el primer frame: no hay texto de carga.
    expect(root.querySelector<HTMLElement>("[data-ledger]")?.hidden).toBe(false)
    expect(root.textContent).not.toContain("Cargando")

    pending.resolve({ expenses: [expense()] })
    await flush()
  })

  it("con los datos pinta las filas y el total y no queda ningún esqueleto", async () => {
    mocks.list.mockResolvedValue({
      expenses: [expense(), expense({ id: "exp-2", total: "3420.00" })],
    })
    const root = mountView()

    mountExpensesList(root)
    await flush()

    expect(body(root).querySelectorAll("tr[data-skeleton-row]")).toHaveLength(0)
    expect(body(root).querySelectorAll("tr[data-expense-id]")).toHaveLength(2)
    expect(root.querySelector('[data-kpi="total"]')?.textContent).toBe("C$ 15,920.50")
    expect(root.querySelectorAll(".skeleton")).toHaveLength(0)
    // La banda deja de estar ocupada cuando ya tiene su cifra.
    expect(root.querySelector(".kpi-band")?.getAttribute("aria-busy")).toBe("false")
  })

  it("sin resultados pinta el estado vacío con su acción", async () => {
    mocks.list.mockResolvedValue({ expenses: [] })
    const root = mountView()

    mountExpensesList(root)
    await flush()

    expect(root.querySelector("[data-state-text]")?.textContent).toBe(
      "No hay gastos en el rango seleccionado",
    )
    expect(root.querySelector<HTMLElement>("[data-state-action]")?.hidden).toBe(false)
    expect(body(root).querySelectorAll("tr[data-skeleton-row]")).toHaveLength(0)
  })

  it("un error de la API se ve en la fila de estado", async () => {
    mocks.list.mockRejectedValue(new Error("sin red"))
    const root = mountView()

    mountExpensesList(root)
    await flush()

    expect(root.querySelector("[data-state-text]")?.textContent).toBe("sin red")
  })
})

describe("vista de gastos: lo que ya hacía la pantalla sigue funcionando", () => {
  it("«Limpiar» aparece solo cuando el rango deja de ser el de hoy", async () => {
    mocks.list.mockResolvedValue({ expenses: [expense()] })
    const root = mountView()

    mountExpensesList(root)
    await flush()

    expect(root.querySelector<HTMLElement>("[data-filter-clear]")?.hidden).toBe(true)

    window.history.replaceState(null, "", "/expenses?start_date=2025-03-01&end_date=2025-03-31")
    const filtered = mountView()
    mountExpensesList(filtered)
    await flush()

    const clear = filtered.querySelector<HTMLAnchorElement>("[data-filter-clear]")
    expect(clear?.hidden).toBe(false)
    expect(clear?.getAttribute("href")).toBe("/expenses")
  })

  it("el pie cuenta los gastos con su etiqueta", async () => {
    mocks.list.mockResolvedValue({ expenses: [expense()] })
    const root = mountView()

    mountExpensesList(root)
    await flush()

    expect(root.querySelector("[data-foot-text]")?.textContent).toBe("1 gasto registrado")
  })
})

describe("vista de gastos: navegación sin recargar el documento (S2)", () => {
  it("enviar el período mueve la URL y vuelve a pedir la lista filtrada", async () => {
    mocks.list.mockResolvedValue({ expenses: [expense()] })
    const root = mountView()

    mountExpensesList(root)
    await flush()

    const form = root.querySelector<HTMLFormElement>("form.filter-row")
    if (form === null) throw new Error("la vista no trae el form de filtros")
    form.insertAdjacentHTML(
      "beforeend",
      '<input type="hidden" name="start_date" value="2025-03-01" />',
    )
    form.requestSubmit()
    await flush()

    // El historial registra el rango y la lista se pide de nuevo con ese filtro.
    expect(window.location.pathname).toBe("/expenses")
    expect(new URLSearchParams(window.location.search).get("start_date")).toBe("2025-03-01")
    expect(mocks.list).toHaveBeenCalledTimes(2)
    expect(mocks.list.mock.calls[1]?.[0]).toMatchObject({ start_date: "2025-03-01" })
  })

  it("el paginador mueve la URL y reusa las filas ya cargadas", async () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      expense({ id: `exp-${index + 1}`, total: "10.00" }),
    )
    mocks.list.mockResolvedValue({ expenses: rows })
    const root = mountView()

    mountExpensesList(root)
    await flush()

    const next = [...root.querySelectorAll<HTMLButtonElement>("[data-pager] button")].find(
      (button) => button.textContent === "Siguiente",
    )
    if (next === undefined) throw new Error("el paginador no trae «Siguiente»")
    next.click()
    await flush()

    expect(window.location.pathname).toBe("/expenses")
    expect(new URLSearchParams(window.location.search).get("page")).toBe("2")
    // Cambiar de página no vuelve a pedir la lista: las filas ya están en memoria.
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(body(root).querySelectorAll("tr[data-expense-id]")).toHaveLength(2)
  })

  it("el módulo navega con el primitivo del router y no atiende el popstate", () => {
    const source = readFileSync(MODULE, "utf8")

    expect(source).toMatch(/import \{ pushQuery \} from "\.\.\/app\/start"/)
    expect(source).toMatch(/pushQuery\(url\)/)
    expect(source).not.toMatch(/window\.location\.assign/)
    expect(source).not.toMatch(/addEventListener\("popstate"/)
    expect(source).not.toMatch(/removeEventListener\("popstate"/)
  })
})
