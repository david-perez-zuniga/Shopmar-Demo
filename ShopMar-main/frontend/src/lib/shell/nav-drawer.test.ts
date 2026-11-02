import { afterEach, describe, expect, it } from "vitest"
import { APP_NAVIGATED } from "../app/events"
import { initNavDrawer } from "./nav-drawer"

function buildShell(): void {
  document.body.innerHTML = `
    <button data-nav-toggle aria-expanded="false" aria-controls="drawer">Menú</button>
    <div data-nav-scrim></div>
    <nav data-nav-drawer>
      <button data-nav-close>Cerrar</button>
      <a href="/summary">Resumen</a>
      <a href="/sales">Ventas</a>
    </nav>
    <main data-nav-inert><p>contenido</p></main>
  `
}

function q<T extends Element>(sel: string): T {
  return document.querySelector(sel) as T
}

let dispose: (() => void) | null = null

function start(): void {
  dispose = initNavDrawer()
}

afterEach(() => {
  dispose?.()
  dispose = null
  document.body.innerHTML = ""
  document.documentElement.style.overflow = ""
})

describe("nav-drawer", () => {
  it("devuelve null si el markup no tiene botón y drawer", () => {
    document.body.innerHTML = `<div>sin navegación</div>`
    expect(initNavDrawer()).toBeNull()
  })

  it("arranca cerrado y con el drawer fuera del orden de tabulación", () => {
    buildShell()
    start()

    const toggle = q<HTMLButtonElement>("[data-nav-toggle]")
    const drawer = q<HTMLElement>("[data-nav-drawer]")

    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(drawer.getAttribute("data-open")).toBe("false")
    expect(drawer.hasAttribute("inert")).toBe(true)
  })

  it("el botón abre el drawer y actualiza aria-expanded", () => {
    buildShell()
    start()

    const toggle = q<HTMLButtonElement>("[data-nav-toggle]")
    toggle.click()

    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(q<HTMLElement>("[data-nav-drawer]").getAttribute("data-open")).toBe("true")
    expect(q<HTMLElement>("[data-nav-drawer]").hasAttribute("inert")).toBe(false)
  })

  it("el segundo click del botón lo cierra", () => {
    buildShell()
    start()

    const toggle = q<HTMLButtonElement>("[data-nav-toggle]")
    toggle.click()
    toggle.click()

    expect(toggle.getAttribute("aria-expanded")).toBe("false")
  })

  it("el foco entra al drawer al abrirlo", () => {
    buildShell()
    start()

    q<HTMLButtonElement>("[data-nav-toggle]").click()

    const drawer = q<HTMLElement>("[data-nav-drawer]")
    expect(drawer.contains(document.activeElement)).toBe(true)
  })

  it("bloquea el scroll del documento al abrir y lo restaura al cerrar", () => {
    buildShell()
    start()

    const toggle = q<HTMLButtonElement>("[data-nav-toggle]")
    toggle.click()
    expect(document.documentElement.style.overflow).toBe("hidden")

    toggle.click()
    expect(document.documentElement.style.overflow).toBe("")
  })

  it("restaura el overflow previo en vez de asumir que estaba vacío", () => {
    document.documentElement.style.overflow = "scroll"
    buildShell()
    start()

    const toggle = q<HTMLButtonElement>("[data-nav-toggle]")
    toggle.click()
    toggle.click()

    expect(document.documentElement.style.overflow).toBe("scroll")
    document.documentElement.style.overflow = ""
  })

  it("Escape cierra el drawer y devuelve el foco al botón", () => {
    buildShell()
    start()

    const toggle = q<HTMLButtonElement>("[data-nav-toggle]")
    toggle.click()
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))

    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(toggle)
  })

  it("Escape con el drawer cerrado no hace nada", () => {
    buildShell()
    start()

    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it("el click en el scrim cierra el drawer", () => {
    buildShell()
    start()

    const toggle = q<HTMLButtonElement>("[data-nav-toggle]")
    toggle.click()
    q<HTMLElement>("[data-nav-scrim]").click()

    expect(toggle.getAttribute("aria-expanded")).toBe("false")
  })

  it("la X de la cabecera cierra el drawer", () => {
    buildShell()
    start()

    const toggle = q<HTMLButtonElement>("[data-nav-toggle]")
    toggle.click()
    q<HTMLButtonElement>("[data-nav-close]").click()

    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(toggle)
  })

  it("la X con el drawer cerrado no hace nada", () => {
    buildShell()
    start()

    expect(() => q<HTMLButtonElement>("[data-nav-close]").click()).not.toThrow()
    expect(q<HTMLButtonElement>("[data-nav-toggle]").getAttribute("aria-expanded")).toBe("false")
  })

  it("marca inert lo que queda atrás del drawer y lo saca al cerrar", () => {
    buildShell()
    start()

    const toggle = q<HTMLButtonElement>("[data-nav-toggle]")
    const main = q<HTMLElement>("main")

    toggle.click()
    expect(main.hasAttribute("inert")).toBe(true)

    toggle.click()
    expect(main.hasAttribute("inert")).toBe(false)
  })

  it("no falla si no hay scrim en el markup", () => {
    document.body.innerHTML = `
      <button data-nav-toggle>Menú</button>
      <nav data-nav-drawer><a href="/sales">Ventas</a></nav>
    `
    expect(() => start()).not.toThrow()

    q<HTMLButtonElement>("[data-nav-toggle]").click()
    expect(q<HTMLElement>("[data-nav-drawer]").getAttribute("data-open")).toBe("true")
  })

  it("disolve deja de responder el botón", () => {
    buildShell()
    const off = initNavDrawer()
    off?.()

    q<HTMLButtonElement>("[data-nav-toggle]").click()

    expect(q<HTMLButtonElement>("[data-nav-toggle]").getAttribute("aria-expanded")).toBe("false")
  })

  it("disolve restaura el scroll y saca los inert", () => {
    buildShell()
    const off = initNavDrawer()
    q<HTMLButtonElement>("[data-nav-toggle]").click()
    off?.()

    expect(document.documentElement.style.overflow).toBe("")
    expect(q<HTMLElement>("main").hasAttribute("inert")).toBe(false)
  })

  it("escucha el mismo corte que usa el armazon para pasar a escritorio", () => {
    buildShell()
    const queries: string[] = []
    const original = window.matchMedia
    window.matchMedia = ((query: string) => {
      queries.push(query)
      return {
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }
    }) as unknown as typeof window.matchMedia

    try {
      start()
    } finally {
      window.matchMedia = original
    }

    expect(queries).toEqual(["(min-width: 1024px)"])
  })

  it("se cierra solo cuando la ventana pasa a escritorio", () => {
    buildShell()
    const listeners: ((event: { matches: boolean }) => void)[] = []
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
        listeners.push(listener)
      },
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia

    try {
      start()
      q<HTMLButtonElement>("[data-nav-toggle]").click()
      expect(q<HTMLElement>("[data-nav-drawer]").getAttribute("data-open")).toBe("true")

      for (const listener of listeners) listener({ matches: true })

      expect(q<HTMLElement>("[data-nav-drawer]").getAttribute("data-open")).toBe("false")
      expect(q<HTMLButtonElement>("[data-nav-toggle]").getAttribute("aria-expanded")).toBe("false")
    } finally {
      window.matchMedia = original
    }
  })
})
/**
 * En la SPA el armazón no se reemplaza: sin este aviso, abrir el cajón en el
 * teléfono y tocar una sección dejaba el cajón abierto —y el documento sin
 * scroll— arriba de la vista nueva.
 */
describe("nav-drawer: cierre al navegar", () => {
  it("cerrar al navegar devuelve el scroll y no le roba el foco a la vista nueva", () => {
    buildShell()
    start()
    const toggle = q<HTMLButtonElement>("[data-nav-toggle]")
    const drawer = q<HTMLElement>("[data-nav-drawer]")

    toggle.click()
    expect(drawer.getAttribute("data-open")).toBe("true")
    expect(document.documentElement.style.overflow).toBe("hidden")

    document.dispatchEvent(new Event(APP_NAVIGATED))

    expect(drawer.getAttribute("data-open")).toBe("false")
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(drawer.hasAttribute("inert")).toBe(true)
    expect(q<HTMLElement>("[data-nav-inert]").hasAttribute("inert")).toBe(false)
    expect(document.documentElement.style.overflow).not.toBe("hidden")
    expect(document.activeElement).not.toBe(toggle)
  })

  it("con el cajón cerrado, navegar no toca el foco ni el scroll", () => {
    buildShell()
    start()
    const toggle = q<HTMLButtonElement>("[data-nav-toggle]")

    document.dispatchEvent(new Event(APP_NAVIGATED))

    expect(q<HTMLElement>("[data-nav-drawer]").getAttribute("data-open")).toBe("false")
    expect(document.documentElement.style.overflow).toBe("")
    expect(document.activeElement).not.toBe(toggle)
  })
})
