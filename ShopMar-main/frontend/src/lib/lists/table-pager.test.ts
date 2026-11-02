import { afterEach, describe, expect, it, vi } from "vitest"
import { createTablePager } from "./table-pager"
import type { TablePagerOptions } from "./table-pager"

type Row = { id: number }

const ROWS: readonly Row[] = Array.from({ length: 25 }, (_, index) => ({ id: index + 1 }))

const live: Array<{ dispose(): void }> = []

afterEach(() => {
  for (const pager of live.splice(0)) pager.dispose()
  document.body.innerHTML = ""
})

function mount(): { body: HTMLTableSectionElement; pager: HTMLElement } {
  document.body.innerHTML = `
    <table><tbody data-rows></tbody></table>
    <div class="pager" data-pager></div>
  `
  return {
    body: document.querySelector("[data-rows]") as HTMLTableSectionElement,
    pager: document.querySelector("[data-pager]") as HTMLElement,
  }
}

/**
 * Doble de `history`/`location` sincronizados: `pushState` mueve la URL del
 * doble, que es lo que el módulo vuelve a leer. Con eso se puede afirmar que el
 * cambio de página usa `pushState(null, ...)` y no una navegación.
 */
interface UrlDouble {
  location: Location
  history: History
  href(): string
  setHref(href: string): void
}

function makeUrlDouble(path = "/sales"): UrlDouble {
  let url = new URL(`http://localhost${path}`)
  const location = {
    get href() {
      return url.toString()
    },
    get search() {
      return url.search
    },
    get pathname() {
      return url.pathname
    },
  } as unknown as Location
  const history = {
    pushState: vi.fn((_state: unknown, _title: string, target: string | URL | null) => {
      url = new URL(String(target), url)
    }),
    replaceState: vi.fn((_state: unknown, _title: string, target: string | URL | null) => {
      url = new URL(String(target), url)
    }),
  } as unknown as History
  return {
    location,
    history,
    href: () => url.toString(),
    setHref(href) {
      url = new URL(href, url)
    },
  }
}

function buildStub(): (row: Row) => HTMLTableRowElement {
  return (row) => {
    const tr = document.createElement("tr")
    tr.textContent = String(row.id)
    return tr
  }
}

function create(
  extra: Partial<TablePagerOptions<Row>> = {},
  path = "/sales",
): { tablePager: ReturnType<typeof createTablePager<Row>>; dom: ReturnType<typeof mount>; url: UrlDouble; buildRow: (row: Row) => HTMLTableRowElement } {
  const dom = mount()
  const url = makeUrlDouble(path)
  const buildRow = extra.buildRow ?? vi.fn(buildStub()) as unknown as (row: Row) => HTMLTableRowElement
  const tablePager = createTablePager<Row>({
    body: dom.body,
    pager: dom.pager,
    buildRow,
    perPage: 10,
    history: url.history,
    location: url.location,
    ...extra,
  })
  live.push(tablePager)
  return { tablePager, dom, url, buildRow }
}

function clickButton(host: HTMLElement, label: string): void {
  const target = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  )
  if (target === undefined) throw new Error(`no hay botón "${label}"`)
  target.click()
}

describe("createTablePager", () => {
  it("construye solo las filas de la página visible", () => {
    const buildRow = vi.fn(buildStub())
    const { tablePager, dom } = create({ buildRow })

    tablePager.setRows(ROWS)

    expect(buildRow).toHaveBeenCalledTimes(10)
    expect(buildRow.mock.calls.map(([row]) => row.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
    expect(dom.body.children).toHaveLength(10)
  })

  it("el tamaño de la página no crece con el dataset", () => {
    const buildRow = vi.fn(buildStub())
    const { tablePager, dom } = create({ buildRow })
    const big = Array.from({ length: 250 }, (_, index) => ({ id: index + 1 }))

    tablePager.setRows(big)
    expect(buildRow).toHaveBeenCalledTimes(10)

    tablePager.goToPage(2)
    expect(buildRow).toHaveBeenCalledTimes(20)
    expect(dom.body.children).toHaveLength(10)
    expect(dom.body.children[0]?.textContent).toBe("11")
  })

  it("Siguiente repinta la página siguiente y escribe la URL sin navegar", () => {
    const onRender = vi.fn()
    const { tablePager, dom, url } = create({ onRender })

    tablePager.setRows(ROWS)
    clickButton(dom.pager, "Siguiente")

    expect(onRender).toHaveBeenLastCalledWith({ page: 2, pages: 3, total: 25, perPage: 10 })
    expect(dom.body.children[0]?.textContent).toBe("11")
    expect(url.href()).toContain("page=2")
    // El `state` es null a propósito: Astro ignora las entradas `null` y su
    // handler rompería con un objeto sin `index` al volver atrás.
    expect(url.history.pushState).toHaveBeenCalledWith(null, "", expect.stringContaining("page=2"))
  })

  it("Anterior vuelve a la página previa", () => {
    const { tablePager, dom, url } = create()

    tablePager.setRows(ROWS)
    tablePager.goToPage(3)
    clickButton(dom.pager, "Anterior")

    expect(url.href()).toContain("page=2")
    expect(dom.body.children[0]?.textContent).toBe("11")
  })

  it("popstate repinta la página que dice la URL desde las filas en memoria", () => {
    const buildRow = vi.fn(buildStub())
    const { tablePager, dom, url } = create({ buildRow })

    tablePager.setRows(ROWS)
    url.setHref("/sales?page=2")
    window.dispatchEvent(new PopStateEvent("popstate"))

    expect(buildRow).toHaveBeenCalledTimes(20)
    expect(dom.body.children[0]?.textContent).toBe("11")
    expect(url.history.pushState).not.toHaveBeenCalled()
  })

  it("una página fuera de rango se recorta a la última", () => {
    const onRender = vi.fn()
    const { tablePager, dom, url } = create({ onRender })

    tablePager.setRows(ROWS)
    tablePager.goToPage(99)

    expect(onRender).toHaveBeenLastCalledWith({ page: 3, pages: 3, total: 25, perPage: 10 })
    expect(url.href()).toContain("page=3")
    expect(dom.body.children).toHaveLength(5)
    expect(dom.body.children[0]?.textContent).toBe("21")
  })

  it("setPerPage repinta y borra page de la URL", () => {
    const onRender = vi.fn()
    const { tablePager, dom, url } = create({ onRender })

    tablePager.setRows(ROWS)
    tablePager.goToPage(3)
    tablePager.setPerPage(20)

    expect(onRender).toHaveBeenLastCalledWith({ page: 1, pages: 2, total: 25, perPage: 20 })
    expect(new URL(url.href()).searchParams.get("page")).toBeNull()
    expect(new URL(url.href()).searchParams.get("per_page")).toBe("20")
    expect(url.history.pushState).toHaveBeenLastCalledWith(null, "", expect.stringContaining("per_page=20"))
    expect(dom.body.children).toHaveLength(20)
  })

  it("dispose deja de escuchar popstate", () => {
    const buildRow = vi.fn(buildStub())
    const { tablePager, url } = create({ buildRow })

    tablePager.setRows(ROWS)
    const before = buildRow.mock.calls.length
    tablePager.dispose()

    url.setHref("/sales?page=3")
    window.dispatchEvent(new PopStateEvent("popstate"))

    expect(buildRow.mock.calls.length).toBe(before)
  })

  it("la página actual lleva aria-current y la clase del paginador", () => {
    const { tablePager, dom } = create()

    tablePager.setRows(ROWS)
    tablePager.goToPage(2)

    const current = dom.pager.querySelector('[aria-current="page"]')
    expect(current?.textContent).toBe("2")
    expect(current?.className).toBe("page-btn page-btn--current")
    expect(dom.pager.querySelector(".page-btn--current")).toBe(current)
  })

  it("los extremos quedan deshabilitados", () => {
    const { tablePager, dom } = create()

    tablePager.setRows(ROWS)
    expect(dom.pager.querySelector("button")?.disabled).toBe(true)

    tablePager.goToPage(3)
    const next = dom.pager.lastElementChild as HTMLButtonElement
    expect(next.textContent).toBe("Siguiente")
    expect(next.disabled).toBe(true)
  })

  it("vuelve al per_page de construcción cuando la URL ya no lo trae", () => {
    const onRender = vi.fn()
    const { tablePager, dom, url } = create({ onRender })

    tablePager.setRows(ROWS)
    tablePager.setPerPage(20)
    expect(dom.body.children).toHaveLength(20)

    url.setHref("/sales")
    window.dispatchEvent(new PopStateEvent("popstate"))

    expect(onRender).toHaveBeenLastCalledWith({ page: 1, pages: 3, total: 25, perPage: 10 })
    expect(dom.body.children).toHaveLength(10)
  })

  it("una página fuera de rango se escribe de vuelta con replaceState", () => {
    const onRender = vi.fn()
    const { tablePager, dom, url } = create({ onRender }, "/sales?page=99")

    tablePager.setRows(ROWS)

    expect(dom.body.children).toHaveLength(5)
    expect(dom.body.children[0]?.textContent).toBe("21")
    expect(onRender).toHaveBeenLastCalledWith({ page: 3, pages: 3, total: 25, perPage: 10 })
    expect(new URL(url.href()).searchParams.get("page")).toBe("3")
    expect(url.history.pushState).not.toHaveBeenCalled()
    expect(url.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("page=3"),
    )
  })

  it("setRows([]) limpia la tabla y un popstate posterior no construye filas", () => {
    const buildRow = vi.fn(buildStub())
    const { tablePager, dom, url } = create({ buildRow })

    tablePager.setRows(ROWS)
    const afterLoad = buildRow.mock.calls.length

    tablePager.setRows([])
    expect(dom.body.children).toHaveLength(0)
    expect(buildRow.mock.calls.length).toBe(afterLoad)

    url.setHref("/sales?page=2")
    window.dispatchEvent(new PopStateEvent("popstate"))

    expect(dom.body.children).toHaveLength(0)
    expect(buildRow.mock.calls.length).toBe(afterLoad)
  })

  it("hace scroll al cambiar de página pero no en el primer render", () => {
    const scrollTarget = document.createElement("div")
    const scrollIntoView = vi.fn()
    scrollTarget.scrollIntoView = scrollIntoView
    const { tablePager } = create({ scrollTarget })

    tablePager.setRows(ROWS)
    expect(scrollIntoView).not.toHaveBeenCalled()

    tablePager.goToPage(2)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" })
  })
})
