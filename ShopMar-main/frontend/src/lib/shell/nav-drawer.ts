import { APP_NAVIGATED } from "../app/events"

const DESKTOP_QUERY = "(min-width: 1024px)"

function findNodes(root: ParentNode) {
  const toggle = root.querySelector<HTMLButtonElement>("[data-nav-toggle]")
  const drawer = root.querySelector<HTMLElement>("[data-nav-drawer]")
  const scrim = root.querySelector<HTMLElement>("[data-nav-scrim]")
  const behind = Array.from(root.querySelectorAll<HTMLElement>("[data-nav-inert]"))

  if (toggle === null || drawer === null) return null
  return { toggle, drawer, scrim, behind }
}

export function initNavDrawer(root: ParentNode = document): (() => void) | null {
  const nodes = findNodes(root)
  if (nodes === null) return null

  const { toggle, drawer, scrim, behind } = nodes
  const root_ = root.ownerDocument?.documentElement ?? document.documentElement

  const closeBtn = root.querySelector<HTMLButtonElement>("[data-nav-close]")

  let previousOverflow = ""

  /**
   * `focus` es lo que distingue abrir/cerrar a mano de cerrar porque se navegó:
   * al navegar, el foco tiene que quedarse en la vista nueva, no volver al botón
   * que abrió el cajón.
   */
  function paint(open: boolean, options: { focus?: boolean } = {}): void {
    const focus = options.focus ?? true
    toggle.setAttribute("aria-expanded", String(open))
    drawer.setAttribute("data-open", String(open))

    if (open) {
      drawer.removeAttribute("inert")
      for (const el of behind) el.setAttribute("inert", "")
      previousOverflow = root_.style.overflow
      root_.style.overflow = "hidden"
      drawer.querySelector<HTMLElement>("a, button")?.focus()
      return
    }

    drawer.setAttribute("inert", "")
    for (const el of behind) el.removeAttribute("inert")
    root_.style.overflow = previousOverflow
    if (focus) toggle.focus()
  }

  function isOpen(): boolean {
    return drawer.getAttribute("data-open") === "true"
  }

  const onToggle = () => paint(!isOpen())

  // Navegar cambia la vista: el cajón se cierra, pero sin mover el foco.
  const onNavigate = () => {
    if (isOpen()) paint(false, { focus: false })
  }

  const onScrimClick = () => {
    if (isOpen()) paint(false)
  }

  const onCloseClick = () => {
    if (isOpen()) paint(false)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    if (!isOpen()) return
    event.preventDefault()
    paint(false)
  }

  const desktop = typeof window.matchMedia === "function" ? window.matchMedia(DESKTOP_QUERY) : null
  const onDesktop = (event: MediaQueryListEvent | MediaQueryList) => {
    if (event.matches) paint(false)
  }

  toggle.addEventListener("click", onToggle)
  scrim?.addEventListener("click", onScrimClick)
  closeBtn?.addEventListener("click", onCloseClick)
  document.addEventListener("keydown", onKeyDown)
  document.addEventListener(APP_NAVIGATED, onNavigate)
  desktop?.addEventListener("change", onDesktop)

  toggle.setAttribute("aria-expanded", "false")
  drawer.setAttribute("data-open", "false")
  drawer.setAttribute("inert", "")

  return function dispose(): void {
    toggle.removeEventListener("click", onToggle)
    scrim?.removeEventListener("click", onScrimClick)
    closeBtn?.removeEventListener("click", onCloseClick)
    document.removeEventListener("keydown", onKeyDown)
    document.removeEventListener(APP_NAVIGATED, onNavigate)
    desktop?.removeEventListener("change", onDesktop)
    root_.style.overflow = previousOverflow
    drawer.removeAttribute("inert")
    for (const el of behind) el.removeAttribute("inert")
  }
}