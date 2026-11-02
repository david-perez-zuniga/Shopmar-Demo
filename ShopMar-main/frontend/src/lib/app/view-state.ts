/**
 * La última consulta de cada pantalla, recordada durante la sesión (S58).
 *
 * El estado de una lista vive en la URL —`start_date`/`end_date`, los filtros de
 * refinación y la página—, así que **volver** al listado es volver a esa URL. El
 * problema era el enlace de regreso: «Volver» del detalle, «Cancelar» del alta y
 * la propia navegación apuntan a la ruta pelada, y sin fechas la pantalla abre
 * en «Hoy» (S36). Resultado: elegir «Últimos 7 días», abrir una venta y volver
 * mostraba otra vez el día de hoy.
 *
 * La solución no toca las URLs públicas: cada pantalla recuerda la consulta que
 * la persona estaba mirando y el router la recupera al entrar sin query. Se
 * guarda en `sessionStorage` con la misma familia de claves que el estado del
 * panel de filtros (`shopmar.filters.open:<ruta>`) y por la misma razón —filtrar
 * en ventas recarga el documento, así que un recuerdo en memoria se perdía justo
 * en la pantalla que más lo necesita—. El olvido es explícito: el enlace
 * «Limpiar» (S39) es el único que borra el recuerdo.
 *
 * Tres reglas que este módulo deja fijadas, todas puras sobre un `Storage`
 * inyectado:
 * 1. La URL manda. Si la query trae algo, eso es lo que se usa.
 * 2. Atrás y adelante mandan sobre el recuerdo: reescribir una entrada del
 *    historial para recuperar el filtro haría que el botón atrás no cambie nada.
 * 3. Un detalle o un formulario no recuerdan nada: su query es un `id` o un
 *    canal, y reabrirlos con el último valor sería abrir otra cosa.
 */

import { normalizePath } from "./router"

/** Prefijo de la clave de `sessionStorage`, hermano de `shopmar.filters.open`. */
export const VIEW_STATE_PREFIX = "shopmar.view.state"

/**
 * Las pantallas que recuerdan su consulta: las listas con filtros o paginado.
 *
 * Son las cinco del armazón que se consultan con parámetros. `/sales/detail`,
 * `/sales/new`, `/expenses/new` y `/new` quedan afuera a propósito (regla 3).
 */
const REMEMBERED_PATHS: readonly string[] = ["/", "/sales", "/packages", "/expenses", "/customers"]

/**
 * Los parámetros que **son** la consulta de una lista.
 *
 * Una sola lista para las cinco pantallas a propósito: los nombres no se pisan
 * entre ellas —`type` es el canal en ventas y el canal del alta en un formulario
 * que no se recuerda— y así sumar un filtro nuevo es una línea acá y nada más.
 * Lo que no está acá no se recuerda nunca: `id` y `print` de un detalle y
 * `customer` de clientes —el cliente abierto en el diálogo— quedarían fuera por
 * construcción, y reabrir un diálogo desde el recuerdo no es volver a donde
 * estabas.
 */
const STATE_PARAMS: readonly string[] = [
  "start_date",
  "end_date",
  "type",
  "status",
  "shipment_method",
  "payment_terms",
  "overdue",
  "page",
  "q",
]

/**
 * El atributo del enlace «Limpiar» (S39).
 *
 * El router lo mira para saber que ese clic es el **reinicio explícito** de la
 * pantalla y no una entrada más a la lista: es el único que olvida lo recordado.
 * Vive acá —y no en el cableado de filtros— porque el estado recordado también
 * vive acá; los tres listados ya lo llevan en su marcado.
 */
export const CLEAR_FILTER_ATTRIBUTE = "data-filter-clear"

/** La clave de `sessionStorage` de una pantalla. */
export function viewStateKey(path: string): string {
  return `${VIEW_STATE_PREFIX}:${normalizePath(path)}`
}
/** Si la pantalla recuerda su consulta. */
export function isRememberedPath(path: string): boolean {
  return REMEMBERED_PATHS.includes(normalizePath(path))
}

/**
 * La parte de la query que es estado de una pantalla: los parámetros de
 * `STATE_PARAMS` que tienen valor, en ese orden, con el `?` delante.
 *
 * Se filtran los vacíos porque un `?status=` no es un filtro aplicado: los
 * lectores de filtros ya lo tratan como ausencia, y recordarlo ensuciaría la URL
 * recuperada sin cambiar la pantalla.
 */
export function stateSearch(search: string): string {
  const source = new URLSearchParams(search)
  const state = new URLSearchParams()
  for (const name of STATE_PARAMS) {
    const value = source.get(name) ?? ""
    if (value !== "") state.set(name, value)
  }
  const query = state.toString()
  return query === "" ? "" : `?${query}`
}

/** La consulta recordada de una pantalla, o `""` si no hay ninguna. */
export function readViewState(path: string, storage: Storage | null): string {
  if (storage === null || !isRememberedPath(path)) return ""
  try {
    // Se vuelve a filtrar al leer: lo guardado pudo quedar de una versión
    // anterior del módulo o de otra pantalla con la misma clave.
    return stateSearch(storage.getItem(viewStateKey(path)) ?? "")
  } catch {
    return ""
  }
}

/**
 * Guarda la consulta que la persona está mirando.
 *
 * Una consulta vacía **no borra** lo recordado: el que borra es «Limpiar»
 * (`forgetViewState`). Así pasar por una entrada del historial sin filtros no se
 * lleva puesto el filtro de la sesión.
 */
export function rememberViewState(
  path: string,
  search: string,
  storage: Storage | null,
): void {
  if (storage === null || !isRememberedPath(path)) return
  const state = stateSearch(search)
  if (state === "") return
  try {
    storage.setItem(viewStateKey(path), state)
  } catch {
    // Sin almacenamiento la pantalla funciona igual: sólo no recuerda.
  }
}

/** Olvida la consulta de una pantalla. Es lo que hace el enlace «Limpiar». */
export function forgetViewState(path: string, storage: Storage | null): void {
  if (storage === null) return
  try {
    storage.removeItem(viewStateKey(path))
  } catch {
    // Igual que al guardar: sin almacenamiento no hay nada que borrar.
  }
}

/**
 * La query con la que la pantalla tiene que abrir: la de la URL o, si viene sin
 * nada, la recordada.
 */
export function restoreViewSearch(
  path: string,
  search: string,
  storage: Storage | null,
): string {
  if (search !== "" || !isRememberedPath(path)) return search
  return readViewState(path, storage)
}
