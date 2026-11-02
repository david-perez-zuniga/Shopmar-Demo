import { afterEach, describe, expect, it, vi } from "vitest"
import { initThemeToggle } from "./theme-toggle"

function buildButtons(): void {
  document.body.innerHTML = `
    <button data-theme-toggle aria-pressed="false">Tema</button>
    <button data-theme-toggle aria-pressed="false">Tema</button>
  `
}

function buttons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]"))
}

function stubPrefersDark(matches: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" ? matches : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

function addThemeColorMeta(): HTMLMetaElement {
  const meta = document.createElement("meta")
  meta.setAttribute("name", "theme-color")
  meta.setAttribute("content", "#f8f9ff")
  document.head.appendChild(meta)
  return meta
}

function themeColor(): string | null {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null
}

let dispose: (() => void) | null = null

afterEach(() => {
  dispose?.()
  dispose = null
  document.body.innerHTML = ""
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove())
  localStorage.clear()
  document.documentElement.removeAttribute("data-theme")
  vi.unstubAllGlobals()
})

describe("theme-toggle", () => {
  it("devuelve null si no hay botones de tema", () => {
    document.body.innerHTML = `<div>sin tema</div>`
    expect(initThemeToggle()).toBeNull()
  })

  it("aplica el tema guardado en localStorage al inicializar", () => {
    localStorage.setItem("shopmar:theme", "dark")
    buildButtons()
    dispose = initThemeToggle()

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
  })

  it("usa prefers-color-scheme cuando no hay tema guardado", () => {
    stubPrefersDark(true)
    buildButtons()
    dispose = initThemeToggle()

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
  })

  it("cae en claro cuando no hay tema guardado ni preferencia oscura", () => {
    stubPrefersDark(false)
    buildButtons()
    dispose = initThemeToggle()

    expect(document.documentElement.getAttribute("data-theme")).toBe("light")
  })

  it("marca aria-pressed en todos los botones", () => {
    localStorage.setItem("shopmar:theme", "dark")
    buildButtons()
    dispose = initThemeToggle()

    expect(buttons().every((button) => button.getAttribute("aria-pressed") === "true")).toBe(true)
  })

  it("el click en cualquiera de los botones cambia el tema y lo persiste", () => {
    localStorage.setItem("shopmar:theme", "light")
    buildButtons()
    dispose = initThemeToggle()

    buttons()[1].click()
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
    expect(localStorage.getItem("shopmar:theme")).toBe("dark")
    expect(buttons()[0].getAttribute("aria-pressed")).toBe("true")

    buttons()[0].click()
    expect(document.documentElement.getAttribute("data-theme")).toBe("light")
    expect(localStorage.getItem("shopmar:theme")).toBe("light")
    expect(buttons()[1].getAttribute("aria-pressed")).toBe("false")
  })

  it("dispose quita los listeners", () => {
    localStorage.setItem("shopmar:theme", "light")
    buildButtons()
    const off = initThemeToggle()
    off?.()

    buttons()[0].click()
    expect(document.documentElement.getAttribute("data-theme")).toBe("light")
  })

  it("actualiza theme-color al color claro al inicializar en claro", () => {
    addThemeColorMeta()
    stubPrefersDark(false)
    buildButtons()
    dispose = initThemeToggle()

    expect(themeColor()).toBe("#f8f9ff")
  })

  it("actualiza theme-color al color oscuro al aplicar el tema oscuro", () => {
    addThemeColorMeta()
    localStorage.setItem("shopmar:theme", "dark")
    buildButtons()
    dispose = initThemeToggle()

    expect(themeColor()).toBe("#0b121a")
  })

  it("acompaña el cambio de tema con el cambio de theme-color", () => {
    addThemeColorMeta()
    localStorage.setItem("shopmar:theme", "light")
    buildButtons()
    dispose = initThemeToggle()

    expect(themeColor()).toBe("#f8f9ff")

    buttons()[0].click()
    expect(themeColor()).toBe("#0b121a")

    buttons()[0].click()
    expect(themeColor()).toBe("#f8f9ff")
  })

  it("no falla cuando el meta theme-color no existe", () => {
    localStorage.setItem("shopmar:theme", "dark")
    buildButtons()
    expect(() => {
      dispose = initThemeToggle()
    }).not.toThrow()
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
  })
})
