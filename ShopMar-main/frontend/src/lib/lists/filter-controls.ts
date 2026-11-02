/**
 * Hidratación de los controles de filtro desde `window.location.search`.
 *
 * Las páginas son estáticas: el HTML se prerenderiza sin query string, así que
 * los controles salen con sus defaults y el valor activo solo puede venir del
 * cliente. Este módulo es el único lugar donde ese mapeo vive.
 */

import { activeFilterCount } from "./filters"
import { safeSessionStorage } from "../core/storage"
import {
  presetFor,
  presetRange,
  resolveDateRange,
  type DatePreset,
  type DateRange,
} from "./date-presets"

export type FilterValues = Record<string, string>

export type FilterSubmitOptions = {
  form: HTMLFormElement | null
  /** Ruta de la lista a la que apunta el filtro. */
  path: string
  /** `<select>` de tamaño de página: vive fuera del form y hay que reinyectarlo. */
  /** Navegación de cada pantalla: recargar el documento o empujar el historial. */
  navigate: (url: string) => void
}

function isFormControl(
  control: Element | RadioNodeList | null,
): control is HTMLInputElement | HTMLSelectElement {
  return control instanceof HTMLInputElement || control instanceof HTMLSelectElement
}

export function setControlValue(control: Element | RadioNodeList | null, value: string): void {
  if (isFormControl(control)) {
    control.value = value
  }
}

export function hydrateFilterControls(form: HTMLFormElement | null, values: FilterValues): void {
  if (form === null) return
  for (const [name, value] of Object.entries(values)) {
    setControlValue(form.elements.namedItem(name), value)
  }
}

export function readFilterQuery(form: HTMLFormElement, extras: FilterValues = {}): string {
  const params = new URLSearchParams()
  for (const field of form.elements) {
    if (
      (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) &&
      field.name !== "" &&
      // El preset de fechas se marca con `data-query-ignore`: es estado de la UI
      // que se deriva de `start_date`/`end_date` (`presetFor`). Si viajara en la
      // query habría dos fuentes de verdad para el mismo rango (S35). Aplica al
      // `<select>` y a cualquier control, no sólo a los inputs.
      !field.hasAttribute("data-query-ignore") &&
      field.value !== ""
    ) {
      params.set(field.name, field.value)
    }
  }
  for (const [name, value] of Object.entries(extras)) {
    if (value !== "") params.set(name, value)
  }
  return params.toString()
}

export function filterHref(path: string, query: string): string {
  return query === "" ? path : `${path}?${query}`
}

/**
 * Conecta el submit del form de filtros con la URL de la lista.
 *
 * El `<select id="per-page">` vive fuera del form, así que el submit debe
 * reinyectarlo en la query o el per_page elegido se perdería.
 */
export function wireFilterSubmit(options: FilterSubmitOptions): void {
  const { form, path, navigate } = options
  if (form === null) return
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    navigate(filterHref(path, readFilterQuery(form)))
  })
}

/**
 * Filtra **de una sola vez** (S38): cualquier cambio en un control del formulario
 * lo envía, sin botón «Filtrar».
 *
 * El preset de fechas queda afuera a propósito: `wireDatePresets` ya escribe el
 * rango y envía, y con «Personalizado» el envío tiene que esperar a que se
 * escriban las fechas.
 */
export function wireAutoFilter(form: HTMLFormElement | null): void {
  if (form === null) return
  form.addEventListener("change", (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target instanceof HTMLSelectElement && target.hasAttribute("data-preset")) return
    form.requestSubmit()
  })
}

/**
 * URL de limpieza: sin filtros, conservando solo el tamaño de página elegido.
 *
 * El `per_page` por defecto no se escribe en la URL para no ensuciarla; el
 * select lo vuelve a reflejar en el cliente al hidratar.
 */
export function clearFilterHref(path: string): string {
  // Sin tamaño de página que conservar (S41): limpiar es la ruta pelada.
  return filterHref(path, "")
}

/** Raíz del control de fechas: el `<form>` o el contenedor incrustado en él. */
export type DatePresetRoot = HTMLElement | null

const PRESET_SELECTOR = "select[data-preset]"
const DATE_FIELDS_SELECTOR = "[data-date-fields]"
const START_SELECTOR = "input[name='start_date']"
const END_SELECTOR = "input[name='end_date']"

function presetControl(root: DatePresetRoot): HTMLSelectElement | null {
  if (root === null) return null
  return root.querySelector<HTMLSelectElement>(PRESET_SELECTOR)
}

function setDateFieldsVisible(root: DatePresetRoot, visible: boolean): void {
  const fields = root?.querySelector<HTMLElement>(DATE_FIELDS_SELECTOR) ?? null
  if (fields !== null) fields.hidden = !visible
}

function writeDateRange(root: DatePresetRoot, range: DateRange): void {
  setControlValue(root?.querySelector(START_SELECTOR) ?? null, range.start_date)
  setControlValue(root?.querySelector(END_SELECTOR) ?? null, range.end_date)
}

/**
 * Marca la opción que representa el rango de la URL y muestra los dos campos solo
 * cuando el rango es «Personalizado».
 *
 * Los campos llevan las fechas igual: aunque estén ocultos siguen viajando en el
 * envío del form, así que el preset tiene que haberlas escrito antes.
 */
export function hydrateDatePresets(
  root: DatePresetRoot,
  range: DateRange,
  today: Date = new Date(),
): void {
  // El rango que se escribe es el **resuelto**: sin fechas en la URL el valor por
  // defecto es hoy (S36), así «Personalizado» aparece completo y el envío no
  // queda sin fechas.
  const resolved = resolveDateRange(range.start_date, range.end_date, today)
  const preset = presetFor(resolved.start_date, resolved.end_date, today)
  const control = presetControl(root)
  if (control !== null) control.value = preset
  writeDateRange(root, resolved)
  setDateFieldsVisible(root, preset === "custom")
}

/**
 * Conecta las tres opciones con los dos campos de fecha y con el envío del form.
 *
 * «Hoy» y «Últimos 7 días» escriben el rango y reenvían el form de la fila, así
 * que el resto de los filtros —canal, estado, condición, vencidas, método y el
 * tamaño de página— viaja intacto y la navegación la decide la pantalla
 * (`wireFilterSubmit` en los listados, el handler propio del resumen).
 *
 * «Personalizado» no envía: primero hay que escribir las fechas. Destapa los
 * campos y deja el foco en «Desde» para no obligar a buscar el campo con el ratón.
 */
export function wireDatePresets(root: DatePresetRoot, today: Date = new Date()): void {
  if (root === null) return
  const form = root instanceof HTMLFormElement ? root : root.closest("form")

  const control = presetControl(root)
  if (control === null) return
  control.addEventListener("change", () => {
    const preset = control.value as DatePreset
    if (preset === "custom") {
      setDateFieldsVisible(root, true)
      root.querySelector<HTMLInputElement>(START_SELECTOR)?.focus()
      return
    }
    writeDateRange(root, presetRange(preset, today))
    setDateFieldsVisible(root, false)
    form?.requestSubmit()
  })
}

/**
 * Mantiene los controles hidratados con una segunda pasada en `pageshow`.
 *
 * El navegador restaura los valores de los controles del formulario desde el
 * historial de sesión cuando se vuelve con el botón atrás, y lo hace **después**
 * de `astro:page-load`, así que se queda con la última palabra: la lista ya
 * reflejaba la URL pero el control seguía mostrando el filtro viejo. Repetir la
 * hidratación en `pageshow` cubre también una restauración desde bfcache, donde
 * `astro:page-load` no vuelve a dispararse.
 */
export function rehydrateOnPageshow(hydrate: () => void): void {
  hydrate()
  window.addEventListener("pageshow", () => hydrate())
}

/* ---------------------------------------------------------------------------
 * Botón «Filtros» (S40)
 *
 * Las tres pantallas con tabla muestran el período siempre y esconden el resto
 * de los filtros detrás de un botón. El período es el filtro de contexto —cambia
 * qué período se está mirando— y las demás opciones son refinaciones de ese
 * período: por eso una queda a la vista y las otras no.
 *
 * El panel arranca cerrado, recuerda su estado durante la sesión (filtrar recarga
 * la página, y volver a abrirlo en cada recarga sería peor que el problema) y el
 * botón lleva el número de filtros activos, que es la única señal de que hay algo
 * aplicado cuando el panel está cerrado.
 * ------------------------------------------------------------------------- */

/** Prefijo de la clave de `sessionStorage`: el estado se recuerda por ruta. */
const FILTERS_PANEL_KEY = "shopmar.filters.open"

const TOGGLE_SELECTOR = "[data-filters-toggle]"
const PANEL_SELECTOR = "[data-filters-panel]"
const COUNT_SELECTOR = "[data-filters-count]"
const COUNT_VALUE_SELECTOR = "[data-filters-count-value]"
const CLEAR_LINK_SELECTOR = "[data-filter-clear]"

/** El pulso corto del sistema, el mismo de los modales (`--dur-base`). */
const PANEL_TRANSITION_MS = 220

/**
 * Clave de `sessionStorage` del panel de una pantalla.
 *
 * Lleva la ruta porque ventas, paquetes y gastos comparten el mecanismo pero no
 * el estado: abrir los filtros de una no abre los de las otras.
 */
export function filtersToggleKey(path: string): string {
  return `${FILTERS_PANEL_KEY}:${path}`
}

export type FiltersToggleOptions = {
  /** Ruta de la pantalla (`/sales`, `/packages`, `/expenses`), como en `wireFilterSubmit`. */
  path: string
  /** `sessionStorage` inyectable; sin esto se usa el del navegador. */
  storage?: Storage | null
  /** «Hoy» de referencia del conteo, igual que `hasActiveFilters`. */
  today?: Date
}

export type FiltersToggle = {
  /**
   * Vuelve a calcular el número de filtros activos y la visibilidad de
   * «Limpiar». Se llama en cada rehidratación, como el resto de los controles.
   */
  sync: () => void
}

function readOpenState(storage: Storage | null, key: string): boolean {
  if (storage === null) return false
  try {
    return storage.getItem(key) === "1"
  } catch {
    return false
  }
}

function writeOpenState(storage: Storage | null, key: string, open: boolean): void {
  if (storage === null) return
  try {
    storage.setItem(key, open ? "1" : "0")
  } catch {
    // Sin almacenamiento el panel funciona igual: sólo no recuerda el estado.
  }
}

function prefersReducedMotion(): boolean {
  // `matchMedia` no existe en todos los entornos: sin él, no hay animación.
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/** Los filtros del formulario, leídos con las mismas reglas que viajan en la URL. */
function formFilters(form: HTMLFormElement): Record<string, string> {
  const filters: Record<string, string> = {}
  new URLSearchParams(readFilterQuery(form)).forEach((value, name) => {
    filters[name] = value
  })
  return filters
}

/**
 * Conecta el botón «Filtros» con el panel, el contador y `sessionStorage`.
 *
 * El estado abierto se aplica de entrada sin animación (al entrar a la pantalla
 * el panel ya está donde tiene que estar) y sólo el toque del botón anima. El
 * alto de `auto` no se puede transicionar en CSS, así que se mide el contenido y
 * se anima con la Web Animations API; sin ella, o con `prefers-reduced-motion`,
 * el cambio es instantáneo.
 */
export function wireFiltersToggle(
  form: HTMLFormElement | null,
  options: FiltersToggleOptions,
): FiltersToggle {
  const noop: FiltersToggle = { sync: () => undefined }
  if (form === null) return noop
  // Alias: el estrechamiento de un parámetro no sobrevive dentro de las funciones
  // que se declaran más abajo, y el `form` de una pantalla nunca es nulo acá.
  const formEl: HTMLFormElement = form

  const toggleNode = formEl.querySelector<HTMLButtonElement>(TOGGLE_SELECTOR)
  const panelNode = formEl.querySelector<HTMLElement>(PANEL_SELECTOR)
  if (toggleNode === null || panelNode === null) return noop
  // Tipos no nulos explícitos: las funciones de abajo se declaran (y podrían
  // llamarse) antes de la comprobación, así que no heredan su estrechamiento.
  const toggle: HTMLButtonElement = toggleNode
  const panel: HTMLElement = panelNode

  const storage = options.storage === undefined ? safeSessionStorage() : options.storage
  const key = filtersToggleKey(options.path)

  // El `aria-controls` sale del id real del panel: el atributo y el nodo no
  // pueden desincronizarse.
  if (panel.id !== "") toggle.setAttribute("aria-controls", panel.id)

  let open = readOpenState(storage, key)
  let animation: Animation | null = null

  function setExpanded(): void {
    toggle.setAttribute("aria-expanded", open ? "true" : "false")
  }

  function canAnimate(): boolean {
    return typeof panel.animate === "function" && !prefersReducedMotion()
  }

  function paint(animate: boolean): void {
    animation?.cancel()
    animation = null
    panel.classList.remove("is-animating")
    if (!animate || !canAnimate()) {
      panel.hidden = !open
      return
    }
    // Al abrir hay que destapar antes de medir; al cerrar, medir lo que se ve.
    if (open) panel.hidden = false
    const from = open ? 0 : panel.offsetHeight
    const to = open ? panel.scrollHeight : 0
    // El recorte del contenido solo hace falta mientras la caja cambia de alto.
    panel.classList.add("is-animating")
    animation = panel.animate(
      [
        { height: `${from}px`, opacity: open ? 0 : 1 },
        { height: `${to}px`, opacity: open ? 1 : 0 },
      ],
      { duration: PANEL_TRANSITION_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    )
    animation.addEventListener("finish", () => {
      panel.classList.remove("is-animating")
      if (!open) panel.hidden = true
    })
  }

  function sync(): void {
    const count = activeFilterCount(formFilters(formEl), options.today ?? new Date())
    const pill = formEl.querySelector<HTMLElement>(COUNT_SELECTOR)
    if (pill !== null) {
      pill.hidden = count === 0
      // El número vive en su propio nodo: el pill puede llevar además el texto
      // que leen los lectores de pantalla («filtros activos»).
      const value = pill.querySelector<HTMLElement>(COUNT_VALUE_SELECTOR) ?? pill
      value.textContent = String(count)
    }
    // «Limpiar» (S39) aparece con el mismo conteo: si el contador dice 0, no hay
    // nada que limpiar. Sale de acá y no de cada pantalla para que no haya dos
    // cuentas del mismo estado.
    const clearLink = formEl.querySelector<HTMLElement>(CLEAR_LINK_SELECTOR)
    if (clearLink !== null) clearLink.hidden = count === 0
  }

  toggle.addEventListener("click", () => {
    open = !open
    setExpanded()
    writeOpenState(storage, key, open)
    // El foco se queda en el botón: al cerrar, el panel se oculta y un foco
    // adentro se perdería. En Safari un clic no enfoca el botón por sí solo.
    toggle.focus({ preventScroll: true })
    paint(true)
  })

  setExpanded()
  paint(false)
  sync()

  return { sync }
}
