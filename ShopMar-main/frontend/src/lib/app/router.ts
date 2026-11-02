/**
 * El mapa de rutas del panel, en su parte pura (S1).
 *
 * Una ruta es una vista: el documento es siempre el mismo y lo que cambia es la
 * plantilla que el router monta. Este módulo no toca el DOM ni `window`, así que
 * la tabla de rutas y los títulos se prueban sin navegador.
 *
 * Las rutas son las mismas de siempre y llevan barra final o `/index.html` sin
 * distinguirse: un host estático puede redirigir `/sales` a `/sales/` y las dos
 * formas tienen que resolver a la misma vista.
 */

/**
 * Las nueve vistas del panel. El orden no significa nada; el tipo sí.
 *
 * `/new` es la última que se sumó (T7): el selector que abre el botón de la
 * barra inferior. No es una sección —no aparece en la navegación y ninguna
 * pestaña queda activa—, pero es una vista más: si no lo fuera, su enlace
 * pediría el documento y el toque del FAB seguiría teniendo el delay de S1.
 */
export const VIEWS = [
  "summary",
  "sales",
  "sale-new",
  "sale-detail",
  "customers",
  "packages",
  "expenses",
  "expense-new",
  "new",
] as const

export type ViewId = (typeof VIEWS)[number]

/** El título del documento por vista. Es lo único que cambia del `<head>`. */
export const VIEW_TITLES: Record<ViewId, string> = {
  summary: "Resumen · ShopMar",
  sales: "Ventas · ShopMar",
  "sale-new": "Nueva venta · ShopMar",
  "sale-detail": "Detalle de venta · ShopMar",
  customers: "Clientes · ShopMar",
  packages: "Paquetes · ShopMar",
  expenses: "Gastos · ShopMar",
  "expense-new": "Nuevo gasto · ShopMar",
  new: "Registrar · ShopMar",
}

/**
 * Si el contenido de la vista se lee a ancho completo (`wide`) o en columna. Es
 * una clase del armazón, no del documento: el router la ajusta al montar.
 */
export const VIEW_WIDE: Record<ViewId, boolean> = {
  summary: true,
  sales: true,
  "sale-new": true,
  "sale-detail": true,
  customers: true,
  packages: true,
  expenses: true,
  "expense-new": true,
  // La única vista en columna: el selector son dos botones y un acordeón, y
  // antes era un documento con el ancho de lectura del armazón
  // (`.reading`, 65ch). Se conserva esa medida para no cambiar la pantalla.
  new: false,
}

const VIEW_BY_PATH: Readonly<Record<string, ViewId>> = {
  "/": "summary",
  "/sales": "sales",
  "/sales/new": "sale-new",
  "/sales/detail": "sale-detail",
  "/customers": "customers",
  "/packages": "packages",
  "/expenses": "expenses",
  "/expenses/new": "expense-new",
  "/new": "new",
}

/** `/sales/`, `/sales/index.html` y `/sales` son la misma ruta. */
export function normalizePath(pathname: string): string {
  const withoutIndex = pathname.replace(/\/index\.html$/, "/")
  const withoutSlash = withoutIndex.replace(/\/+$/, "")
  return withoutSlash === "" ? "/" : withoutSlash
}

/** La vista de una ruta, o `null` si la ruta no es del panel. */
export function viewForPath(pathname: string): ViewId | null {
  return VIEW_BY_PATH[normalizePath(pathname)] ?? null
}

/**
 * Lo que el router necesita de una URL. `search` viaja crudo —con el `?` si lo
 * tiene o vacío— porque los lectores de filtros existentes (`readSalesFilters`,
 * `readExpensesFilters`, …) reciben exactamente eso y no se tocan.
 */
export interface IAppLocation {
  view: ViewId
  path: string
  search: string
}

/** La vista y la query de una URL, o `null` si la ruta no es del panel. */
export function resolveLocation(pathname: string, search = ""): IAppLocation | null {
  const view = viewForPath(pathname)
  if (view === null) return null
  return { view, path: normalizePath(pathname), search }
}

/** La URL de una vista con su query, para el historial y los enlaces internos. */
export function hrefFor(view: ViewId, search = ""): string {
  const path = Object.keys(VIEW_BY_PATH).find((candidate) => VIEW_BY_PATH[candidate] === view)
  if (path === undefined) return "/"
  const query = search === "" || search === "?" ? "" : search.startsWith("?") ? search : `?${search}`
  return `${path}${query}`
}
