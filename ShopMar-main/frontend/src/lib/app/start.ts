/**
 * El arranque de la SPA: registra las vistas, escucha los enlaces y monta la
 * vista de la URL actual (S1).
 *
 * El documento es uno solo y cada ruta sirve el mismo armazón. Navegar es
 * clonar la plantilla de la vista destino dentro del contenedor: no hay pedido
 * de red ni cambio de documento, así que el toque cambia de pantalla en el
 * mismo frame. Los datos los sigue trayendo la API desde la vista montada.
 *
 * Una ruta cuya vista todavía no está migrada **no se intercepta**: el enlace
 * navega como antes y esa pantalla sigue siendo su propio documento. Eso es lo
 * que permite migrar de a una vista con la app funcionando en cada commit.
 */

import { activeSectionFor, markActiveNav } from "../shell/nav-active"
import { registerViews } from "../views"
import { createSessionGate, type ISessionGate, type SessionGateDecision } from "../auth/guard"
import { SESSION_CHANGED } from "../auth/session-ui"
import { VIEW_TITLES, VIEW_WIDE, normalizePath, resolveLocation, viewForPath, type IAppLocation, type ViewId } from "./router"
import { createViewRegistry, type IViewRegistry } from "./views"
import { APP_NAVIGATED } from "./events"
import { CLEAR_FILTER_ATTRIBUTE, forgetViewState, rememberViewState, restoreViewSearch } from "./view-state"
import { safeLocalStorage, safeSessionStorage } from "../core/storage"
import { resetLocalStateIfStale } from "../core/storage-reset"

interface IActiveApp {
  doc: Document
  win: Window
  container: HTMLElement
  /**
   * Dónde vive el recuerdo de la consulta de cada pantalla (S58). `null` cuando
   * el navegador lo tiene bloqueado: la app funciona igual, sólo no recuerda.
   */
  storage: Storage | null
  hasView: (view: ViewId) => boolean
  paint: (location: IAppLocation, options: { scroll: boolean }) => void
}

let active: IActiveApp | null = null

/**
 * Navega dentro de la SPA. Si el router todavía no arrancó —o la ruta no es una
 * vista montada— cae a una navegación normal, que siempre es correcta.
 */
export function navigateTo(href: string): void {
  if (active === null) {
    window.location.assign(href)
    return
  }
  const url = new URL(href, active.win.location.href)
  const location = resolveLocation(url.pathname, url.search)
  if (location === null || !active.hasView(location.view)) {
    active.win.location.assign(href)
    return
  }
  // Entrar a una lista sin query recupera lo que la persona estaba mirando
  // (S58): es el camino de «Volver» del detalle y del alta, y el de la
  // navegación del armazón. La entrada nueva se empuja ya con esa query, así
  // atrás devuelve la pantalla de la que se vino y no una copia vacía.
  const target = withRememberedSearch(location, active.storage)
  active.win.history.pushState(null, "", `${target.path}${target.search}`)
  active.paint(target, { scroll: true })
}

/**
 * La pantalla con la consulta recordada, si la URL no trae ninguna (S58).
 *
 * No escribe la URL: la entrada la arma quien navega —un `pushState` en los
 * clics y en `navigateTo`, un `replaceState` en la primera entrada—, y escribirla
 * dos veces dejaría pasos de más en el historial.
 */
function withRememberedSearch(location: IAppLocation, storage: Storage | null): IAppLocation {
  const search = restoreViewSearch(location.path, location.search, storage)
  return search === location.search ? location : { ...location, search }
}

/**
 * Cambia la query de la vista actual **sin remontarla**.
 *
 * Es el primitivo de paginar y filtrar: la vista re-lee su estado de la URL y
 * vuelve a pedir sus datos, así que no se pierde el scroll de la tabla ni el
 * foco del control que se acaba de tocar. `navigateTo` es para cambiar de vista
 * —otra pantalla—; esto es para seguir en la misma.
 */
export function pushQuery(href: string): void {
  if (active === null) {
    const url = new URL(href, window.location.href)
    rememberQuery(url, safeSessionStorage())
    window.history.pushState(null, "", href)
    return
  }
  const url = new URL(href, active.win.location.href)
  // Filtrar y paginar es la otra mitad del recuerdo (S58): lo que la persona
  // acaba de elegir es lo que la pantalla va a recuperar cuando vuelva. La
  // entrada del historial ya la escribe la vista que llama.
  rememberQuery(url, active.storage)
  active.win.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`)
}

/** Guarda la consulta de una URL recién puesta en la barra de direcciones. */
function rememberQuery(url: URL, storage: Storage | null): void {
  rememberViewState(normalizePath(url.pathname), url.search, storage)
}

/**
 * Cambia la query de la vista actual **sin dejar un paso nuevo en el historial**.
 *
 * Es el mismo registro que `pushQuery` —lo que la pantalla muestra queda anotado
 * en el recuerdo (S58)— para las vistas que reescriben su entrada en vez de
 * apilar una: el buscador de clientes, que no puede dejar un paso por cada
 * letra que se escribe, y el abrir y cerrar de su diálogo de detalles.
 */
export function replaceQuery(href: string): void {
  if (active === null) {
    window.history.replaceState(null, "", href)
    rememberQuery(new URL(href, window.location.href), safeSessionStorage())
    return
  }
  const url = new URL(href, active.win.location.href)
  active.win.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  rememberQuery(url, active.storage)
}

/**
 * Arranca la SPA sobre el documento ya renderizado.
 *
 * `registry` y `window` se inyectan sólo en las pruebas: permiten comprobar el
 * orden de la navegación —la URL antes de montar— con una vista falsa y un
 * documento sin `defaultView`, sin levantar las vistas reales ni pedir red.
 */
export interface IStartOptions {
  registry?: IViewRegistry
  window?: Window
  /**
   * `sessionStorage` inyectable para el recuerdo de la consulta de cada pantalla
   * (S58). Por defecto, el del navegador; `null` lo apaga.
   */
  storage?: Storage | null
  /**
   * El guard de sesión (T6). Por defecto, el real: la primera vista se monta
   * recién cuando la sesión está decidida. `null` lo apaga —lo usan las pruebas
   * del router, que no son de sesión— y un guard falso permite probar cada
   * resultado sin red.
   */
  gate?: ISessionGate | null
  /** El `location.replace` del navegador. Se inyecta en las pruebas. */
  navigate?: (href: string) => void
}

export function startApp(
  doc: Document = document,
  options: IStartOptions = {},
): void {
  const windowRef = options.window ?? doc.defaultView
  const container = doc.querySelector<HTMLElement>("[data-app-root]")
  if (windowRef === null || container === null) return
  // Sin `null` para las clausuras: el chequeo de arriba ya lo garantizó.
  const win: Window = windowRef
  const appRoot: HTMLElement = container

  const registry = options.registry ?? createViewRegistry()
  if (options.registry === undefined) registerViews(registry)

  const storage = options.storage === undefined ? safeSessionStorage(win) : options.storage

  const templates = new Map<string, HTMLTemplateElement>()
  for (const template of doc.querySelectorAll<HTMLTemplateElement>("template[data-view]")) {
    const view = template.dataset.view
    if (view !== undefined) templates.set(view, template)
  }

  const shellMain = doc.querySelector<HTMLElement>(".shell-main")

  function paint(location: IAppLocation, options: { scroll: boolean }): void {
    const template = templates.get(location.view)
    if (template === undefined) return

    // Cada pantalla que se pinta deja anotada su consulta (S58): es lo que se
    // recupera al volver, tanto desde un detalle como desde otra sección. Se
    // anota antes de montar, así lo que se guarda es la URL que la vista va a
    // leer, no lo que la vista decida después.
    rememberViewState(location.path, location.search, storage)

    // El contenedor se reemplaza entero: lo que quedó de la vista anterior no
    // puede seguir escuchando clicks ni reteniendo nodos.
    const root = doc.createElement("div")
    root.className = "app-view"
    root.setAttribute("data-view", location.view)
    root.append(template.content.cloneNode(true))
    appRoot.replaceChildren(root)
    registry.mount(location.view, root)

    // Avisa al armazón: lo que está abierto (el cajón de navegación) se cierra
    // solo porque la vista cambió, igual que cuando se recargaba el documento.
    doc.dispatchEvent(new CustomEvent(APP_NAVIGATED))

    doc.title = VIEW_TITLES[location.view]
    markActiveNav(activeSectionFor(location.path), doc)
    shellMain?.classList.toggle("reading", !VIEW_WIDE[location.view])
    if (options.scroll) win.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
  }

  function currentLocation(): IAppLocation | null {
    return resolveLocation(win.location.pathname, win.location.search)
  }

  /** El href interno de un enlace, o `null` si el navegador debe manejarlo. */
  function internalHref(anchor: HTMLAnchorElement): string | null {
    if (anchor.hasAttribute("download") || anchor.hasAttribute("data-astro-reload")) return null
    const target = anchor.getAttribute("target")
    if (target !== null && target !== "" && target !== "_self") return null
    let url: URL
    try {
      url = new URL(anchor.href, win.location.href)
    } catch {
      return null
    }
    if (url.origin !== win.location.origin || url.hash !== "") return null
    const view = viewForPath(url.pathname)
    if (view === null || !templates.has(view)) return null
    return `${url.pathname}${url.search}`
  }

  function onClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as Element | null)?.closest?.("a[href]") ?? null
    if (!(anchor instanceof HTMLAnchorElement)) return
    const href = internalHref(anchor)
    if (href === null) return
    event.preventDefault()
    const target = currentLocationFrom(href)
    // «Limpiar» (S39) es el único que olvida, y tiene que hacerlo **antes** de
    // que se recupere el recuerdo: si no, la ruta pelada del enlace volvería con
    // los filtros que la persona acaba de descartar (S58).
    if (anchor.hasAttribute(CLEAR_FILTER_ATTRIBUTE)) forgetViewState(target.path, storage)
    // La URL se mueve **antes** de montar. Si se pintara primero, una vista que
    // lee `window.location` en su montaje vería la pantalla anterior: eso hacía
    // que el detalle abierto desde una fila dijera «no encontramos esa venta».
    const location = withRememberedSearch(target, storage)
    win.history.pushState(null, "", `${location.path}${location.search}`)
    active?.paint(location, { scroll: true })
  }

  function currentLocationFrom(href: string): IAppLocation {
    const url = new URL(href, win.location.href)
    const location = resolveLocation(url.pathname, url.search)
    // `internalHref` ya garantizó que la ruta resuelve.
    return location as IAppLocation
  }

  /**
   * Atrás y adelante **no** recuperan el recuerdo (S58): la entrada del historial
   * ya dice qué se estaba mirando, y reescribirla con el último filtro haría que
   * el botón atrás dejara de cambiar lo que se ve.
   */
  function onPopState(): void {
    const location = currentLocation()
    if (location === null) {
      win.location.reload()
      return
    }
    paint(location, { scroll: false })
  }

  doc.addEventListener("click", onClick)
  win.addEventListener("popstate", onPopState)
  // Volver a la pestaña después de que el navegador la descartó no puede dejar
  // la vista vieja en pantalla: se vuelve a pintar la de la URL.
  win.addEventListener("pageshow", (event) => {
    if (!(event as PageTransitionEvent).persisted) return
    const location = currentLocation()
    if (location !== null) paint(location, { scroll: false })
  })

  active = {
    doc,
    win,
    container: appRoot,
    storage,
    hasView: (view) => templates.has(view) && registry.has(view),
    paint,
  }

  const gate = options.gate === undefined ? createSessionGate() : options.gate
  const navigate =
    options.navigate ??
    ((href: string) => {
      win.location.replace(href)
    })

  /**
   * El guard no pudo decidir (red caída o `5xx`): se conserva la copia del `me`
   * y se muestra el armazón con el aviso y el reintento. **No** se navega a
   * `/login`: hacerlo sería desloguear por un corte de red (D7).
   */
  function paintUndecided(fallback: IAppLocation): void {
    const root = doc.createElement("div")
    root.className = "app-view"
    root.setAttribute("data-session-offline", "")

    const notice = doc.createElement("div")
    notice.className = "shell-alert"
    notice.setAttribute("role", "status")

    const text = doc.createElement("span")
    text.className = "shell-alert-text"
    text.textContent = "Sin conexión. No pudimos confirmar tu sesión."

    const retry = doc.createElement("button")
    retry.type = "button"
    retry.className = "btn btn-secondary btn-sm"
    retry.setAttribute("data-session-retry", "")
    retry.textContent = "Reintentar"
    retry.addEventListener("click", () => {
      void gateThenPaint(currentLocation() ?? fallback)
    })

    notice.append(text, retry)
    root.append(notice)
    appRoot.replaceChildren(root)
  }

  /**
   * Pregunta al guard y recién después monta. Es lo que evita el parpadeo del
   * panel para quien no tiene sesión: la primera vista no se pinta hasta que la
   * sesión está decidida.
   */
  async function gateThenPaint(fallback: IAppLocation): Promise<void> {
    // La copia del `me` puede venir de una versión anterior a esta regla de
    // sesión y sobrevive a todo, así que un despliegue no se notaría hasta que
    // alguien cierre sesión a mano. Se purga **antes** de que el guard la lea:
    // sin copia, el guard pregunta `GET /auth/me` y, si la cookie ya no vale, el
    // `401` devuelve a `/login` (S1). Es idempotente y no toca el tema ni un
    // borrador de venta a medio cargar.
    resetLocalStateIfStale(safeLocalStorage())

    // La primera entrada de la sesión también recupera el recuerdo (S58) —una
    // recarga con la ruta pelada, el enlace de una notificación—, y acá la URL se
    // reescribe para que la barra de direcciones diga lo que se está viendo y el
    // guard mande al login la ruta completa en su `next`.
    const requested = currentLocation() ?? fallback
    const entry = withRememberedSearch(requested, storage)
    if (entry.search !== requested.search) {
      win.history.replaceState(null, "", `${entry.path}${entry.search}`)
    }

    if (gate === null) {
      paint(entry, { scroll: false })
      return
    }

    let decision: SessionGateDecision
    try {
      decision = await gate.check({ path: entry.path, search: entry.search })
    } catch {
      // Un guard roto no expulsa a nadie: la misma salida que un corte de red.
      decision = { action: "undecided" }
    }

    if (decision.action === "redirect") {
      navigate(decision.href)
      return
    }
    if (decision.action === "undecided") {
      paintUndecided(fallback)
      return
    }

    // La URL pudo moverse mientras el guard preguntaba: se pinta la de ahora.
    paint(currentLocation() ?? fallback, { scroll: false })
    // El armazón ya puede pintar quién es el usuario (barra lateral y cajón).
    win.dispatchEvent(new CustomEvent(SESSION_CHANGED))
  }

  const initial = currentLocation()
  if (initial !== null) void gateThenPaint(initial)
}
