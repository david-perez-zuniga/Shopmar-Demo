export function totalPages(total: number, perPage: number): number {
  if (perPage <= 0) return 1
  return Math.max(1, Math.ceil(total / perPage))
}

export function clampPage(page: number, total: number, perPage: number): number {
  return Math.min(Math.max(1, page), totalPages(total, perPage))
}

export function pageRows<T>(rows: readonly T[], page: number, perPage: number): T[] {
  if (perPage <= 0 || page < 1) return []
  return rows.slice((page - 1) * perPage, page * perPage)
}

export function pageRange(page: number, total: number, perPage: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 }
  const safe = clampPage(page, total, perPage)
  const from = (safe - 1) * perPage + 1
  return { from, to: Math.min(total, safe * perPage) }
}

/**
 * Texto del pie de tabla: rango visible + etiqueta de lo que hay en el total.
 *
 * Cuando la página muestra el total entero el rango se omite y queda solo la
 * etiqueta; sin filas el pie es un guion. La etiqueta (ventas, gastos, …) la
 * pone cada pantalla.
 */
export function footerText(
  state: { page: number; total: number; perPage: number },
  labelFor: (total: number) => string,
): string {
  if (state.total === 0) return "—"
  const { from, to } = pageRange(state.page, state.total, state.perPage)
  const label = labelFor(state.total)
  return from === 1 && to === state.total ? label : `Mostrando ${from}–${to} de ${label}`
}

export type PageSlot = number | "gap"

/** URL relativa de la lista con otra página, conservando los filtros activos. */
export function pageHref(path: string, search: string, page: number): string {
  const params = new URLSearchParams(search)
  params.set("page", String(page))
  return `${path}?${params.toString()}`
}

export function pageWindow(current: number, pages: number, radius = 1): PageSlot[] {
  if (pages <= 0) return []

  const wanted = new Set<number>([1, pages])
  for (let page = current - radius; page <= current + radius; page += 1) {
    if (page >= 1 && page <= pages) wanted.add(page)
  }
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)

  const sorted = [...wanted].sort((a, b) => a - b)
  const slots: PageSlot[] = []
  let previous = 0
  for (const page of sorted) {
    if (previous !== 0 && page - previous > 1) slots.push("gap")
    slots.push(page)
    previous = page
  }
  return slots
}