import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { initNavDrawer } from "./nav-drawer"

const source = readFileSync(resolve("src/components/Nav.astro"), "utf8")

function markup(): string {
  const afterFrontmatter = source.indexOf("---", 3) + 3
  return source.slice(afterFrontmatter, source.indexOf("<style>"))
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

describe("nav-wiring", () => {
  it("el componente inicializa el módulo del drawer", () => {
    expect(source).toMatch(/import\s*\{\s*initNavDrawer\s*\}\s*from\s*"\.\.\/lib\/shell\/nav-drawer"/)
    // La SPA no reemplaza documentos: el armazón se inicializa una vez, al
    // cargar el documento, no en cada `astro:page-load`.
    expect(source).toMatch(/onReady\(\(\) => \{/)
    expect(source).toMatch(
      /for\s*\(\s*const\s+init\s+of\s+\[initNavDrawer,\s*initThemeToggle,\s*initInstallPrompt,\s*initSessionNav\]/,
    )
  })

  it("el armazón trae el usuario y el botón de cerrar sesión en la lateral y en el cajón (T7)", () => {
    document.body.innerHTML = markup()

    // Las dos superficies comparten el atributo, así que no pueden divergir.
    expect(document.querySelectorAll("[data-session-block]")).toHaveLength(2)
    expect(document.querySelectorAll("[data-session-logout]")).toHaveLength(2)
    expect(document.querySelectorAll("[data-session-user]")).toHaveLength(2)
  })

  it("el markup real del componente satisface lo que el drawer busca", () => {
    document.body.innerHTML = markup()

    expect(source).toContain("data-nav-toggle")
    expect(source).toContain("data-nav-drawer")
    expect(source).toContain("data-nav-close")
    expect(source).toContain("data-nav-scrim")
    expect(initNavDrawer()).not.toBeNull()
  })

  it("el botón del markup real abre y cierra el drawer", () => {
    document.body.innerHTML = markup()
    start()

    const toggle = document.querySelector("[data-nav-toggle]") as HTMLButtonElement
    const drawer = document.querySelector("[data-nav-drawer]") as HTMLElement

    toggle.click()
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(drawer.getAttribute("data-open")).toBe("true")
    expect(drawer.hasAttribute("inert")).toBe(false)

    toggle.click()
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(drawer.getAttribute("data-open")).toBe("false")
  })

  it("el botón de cerrar del markup real cierra el drawer", () => {
    document.body.innerHTML = markup()
    start()

    const toggle = document.querySelector("[data-nav-toggle]") as HTMLButtonElement
    const close = document.querySelector("[data-nav-close]") as HTMLButtonElement

    toggle.click()
    close.click()

    expect(toggle.getAttribute("aria-expanded")).toBe("false")
  })

  it("el armazón monta la barra inferior sobre los mismos enlaces", () => {
    // La barra inferior es parte del armazón: `Nav.astro` la trae y le pasa el
    // mismo arreglo `links`, y `BottomNav.astro` la marca `no-print`. Sin
    // directivas de transición: en la SPA el documento no se reemplaza, así que
    // no hay nada que persistir entre navegaciones.
    expect(source).toMatch(/import\s+BottomNav\s+from\s+"\.\/BottomNav\.astro"/)
    expect(source).toMatch(/<BottomNav\s+links=\{links\}\s+activeSection=\{activeSection\}\s*\/>/)

    const bottomSource = readFileSync(resolve("src/components/BottomNav.astro"), "utf8")
    expect(bottomSource).toContain('aria-label="Navegación inferior"')
    expect(bottomSource).toContain("no-print")
    expect(bottomSource).toMatch(/links\.map\(/)

    // Ni la barra ni el armazón llevan directivas de transición (se escriben
    // `transition:<nombre>=`): las animaciones CSS de las dos hojas no cuentan.
    const directives = /\btransition:[a-z-]+\s*=/
    expect(bottomSource).not.toMatch(directives)
    expect(source).not.toMatch(directives)
  })
})
