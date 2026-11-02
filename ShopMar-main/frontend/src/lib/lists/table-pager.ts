import { readPage, readPerPage } from "./filters"
import { clampPage, pageRows, pageWindow, totalPages } from "./pagination"

export type TablePagerState = {
  page: number
  pages: number
  total: number
  perPage: number
}

export interface IPagerHistory {
  pushState(data: unknown, unused: string, url?: string | URL | null): void
  replaceState(data: unknown, unused: string, url?: string | URL | null): void
}

export type TablePagerOptions<Row> = {
  body: HTMLTableSectionElement | null
  pager: HTMLElement | null
  buildRow: (row: Row) => HTMLTableRowElement
  rows?: readonly Row[]
  perPage: number
  page?: number
  onRender?: (state: TablePagerState) => void
  scrollTarget?: HTMLElement | null
  /**
   * Lo único que el paginador necesita del historial. Es estructural a
   * propósito: `window.history` lo cumple, y una vista puede pasar un adaptador
   * que mande los cambios por el router, sin castear.
   */
  history?: IPagerHistory
  location?: Location
}

export type TablePager<Row> = {
  setRows(rows: readonly Row[]): void
  setPerPage(perPage: number): void
  goToPage(page: number): void
  render(): void
  dispose(): void
}

/**
 * Paginador de cliente: guarda las filas ya cargadas y solo rehace la página
 * visible. No pide nada a la API y no navega: el cambio de página es un
 * `pushState(null, ...)` para que el `popstate` propio se encargue del atrás.
 *
 * El `state` del `pushState` tiene que ser `null`: el historial guarda la URL y
 * nada más —la vista es dueña de su estado y lo vuelve a leer de la query—, así
 * que volver con atrás no puede arrastrar datos que ya no valen.
 */
export function createTablePager<Row>(options: TablePagerOptions<Row>): TablePager<Row> {
  const historyRef = options.history ?? window.history
  const locationRef = options.location ?? window.location

  const body = options.body
  const pagerHost = options.pager
  const buildRow = options.buildRow
  const onRender = options.onRender
  const scrollTarget = options.scrollTarget ?? null

  let rows: readonly Row[] = options.rows ?? []
  // Tamaño de página con el que se construyó: es el default al que vuelve el
  // `popstate` cuando la URL ya no trae `per_page` (Back tras cambiarlo).
  const defaultPerPage = options.perPage
  let perPage = options.perPage
  let page = options.page ?? readPage(locationRef.search)
  // El scroll es para una página nueva, no para el primer pintado de los datos.
  let lastRenderedPage: number | null = null

  function baseHref(): string {
    const href = locationRef.href
    if (typeof href === "string" && href !== "") return href
    return `http://localhost${locationRef.pathname ?? "/"}${locationRef.search ?? ""}`
  }

  function urlWith(mutate: (url: URL) => void): string {
    const url = new URL(baseHref())
    mutate(url)
    return url.toString()
  }

  function writeUrl(mutate: (url: URL) => void): void {
    historyRef.pushState(null, "", urlWith(mutate))
  }

  // Reescribe la entrada actual sin agregar historial. El `state` sigue siendo
  // `null` por la misma razón que en `pushState`: Astro ignora esas entradas.
  function replaceUrl(mutate: (url: URL) => void): void {
    historyRef.replaceState(null, "", urlWith(mutate))
  }

  function makeButton(
    label: string,
    className: string,
    disabled: boolean,
    onClick?: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button")
    button.className = className
    button.type = "button"
    button.textContent = label
    button.disabled = disabled
    if (onClick !== undefined) button.addEventListener("click", onClick)
    return button
  }

  function paintPager(current: number, pages: number): void {
    if (pagerHost === null) return
    pagerHost.replaceChildren()

    pagerHost.append(
      makeButton("Anterior", "page-btn", current <= 1, () => goToPage(current - 1)),
    )

    for (const slot of pageWindow(current, pages)) {
      if (slot === "gap") {
        const gap = document.createElement("span")
        gap.className = "page-gap"
        gap.textContent = "…"
        gap.setAttribute("aria-hidden", "true")
        pagerHost.append(gap)
        continue
      }
      if (slot === current) {
        const active = makeButton(String(slot), "page-btn page-btn--current", false)
        active.setAttribute("aria-current", "page")
        pagerHost.append(active)
        continue
      }
      pagerHost.append(makeButton(String(slot), "page-btn", false, () => goToPage(slot)))
    }

    pagerHost.append(
      makeButton("Siguiente", "page-btn", current >= pages, () => goToPage(current + 1)),
    )
  }

  function render(): void {
    const total = rows.length
    const pages = totalPages(total, perPage)
    page = clampPage(page, total, perPage)

    // Si la URL pedía una página que no existe, se corrige la entrada actual
    // (replace, no push). Sin filas no hay página que escribir y no se toca la
    // URL. En el flujo normal de `goToPage` la URL ya trae el valor recortado,
    // así que esto no se dispara.
    if (total > 0 && readPage(locationRef.search) !== page) {
      replaceUrl((url) => url.searchParams.set("page", String(page)))
    }

    // `pageRows` recorta antes de construir: nunca se arma una fila para
    // descartarla. `buildRow` corre una vez por fila visible.
    if (body !== null) {
      body.replaceChildren(...pageRows(rows, page, perPage).map(buildRow))
    }
    paintPager(page, pages)

    onRender?.({ page, pages, total, perPage })

    if (lastRenderedPage !== null && lastRenderedPage !== page) {
      // jsdom no implementa `scrollIntoView`: el encadenado opcional es obligatorio.
      scrollTarget?.scrollIntoView?.({ block: "start" })
    }
    lastRenderedPage = page
  }

  function goToPage(target: number): void {
    page = clampPage(target, rows.length, perPage)
    writeUrl((url) => url.searchParams.set("page", String(page)))
    render()
  }

  function setPerPage(next: number): void {
    perPage = next
    page = 1
    writeUrl((url) => {
      url.searchParams.set("per_page", String(next))
      url.searchParams.delete("page")
    })
    render()
  }

  function setRows(next: readonly Row[]): void {
    rows = next
    render()
  }

  // El atrás del navegador rehace la tabla desde las filas en memoria. Si la
  // URL ya no trae `per_page` se vuelve al tamaño con el que se construyó.
  function onPopState(): void {
    page = readPage(locationRef.search)
    perPage = new URLSearchParams(locationRef.search).has("per_page")
      ? readPerPage(locationRef.search)
      : defaultPerPage
    render()
  }

  window.addEventListener("popstate", onPopState)

  function dispose(): void {
    window.removeEventListener("popstate", onPopState)
  }

  return { setRows, setPerPage, goToPage, render, dispose }
}
