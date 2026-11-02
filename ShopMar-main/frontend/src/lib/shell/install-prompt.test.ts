import { afterEach, describe, expect, it, vi } from "vitest"
import { detectIOS, detectStandalone, initInstallPrompt, resolveInstallUi } from "./install-prompt"

function stubMatchMedia(matches: (query: string) => boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

function stubUserAgent(value: string): void {
  Object.defineProperty(window.navigator, "userAgent", { value, configurable: true })
}

function stubStandaloneFlag(value: boolean): void {
  Object.defineProperty(window.navigator, "standalone", { value, configurable: true })
}

function buildBlocks(): void {
  document.body.innerHTML = `
    <div data-install-block hidden>
      <button type="button" data-install-button hidden>Instalar</button>
      <p data-install-hint hidden>iOS</p>
    </div>
  `
}

function block(): HTMLElement {
  return document.querySelector("[data-install-block]") as HTMLElement
}

function button(): HTMLButtonElement {
  return document.querySelector("[data-install-button]") as HTMLButtonElement
}

function hint(): HTMLElement {
  return document.querySelector("[data-install-hint]") as HTMLElement
}

afterEach(() => {
  document.body.innerHTML = ""
  vi.unstubAllGlobals()
  delete (window.navigator as Navigator & { standalone?: boolean }).standalone
})

describe("install-prompt logic", () => {
  it("oculta la instalación cuando la aplicación ya corre instalada", () => {
    expect(resolveInstallUi({ standalone: true, isIOS: false, hasInstallPrompt: false })).toBe("installed")
  })

  it("muestra el gesto de iOS cuando el dispositivo es iOS", () => {
    expect(resolveInstallUi({ standalone: false, isIOS: true, hasInstallPrompt: false })).toBe("ios-hint")
  })

  it("muestra el botón cuando el navegador ofrece el evento de instalación", () => {
    expect(resolveInstallUi({ standalone: false, isIOS: false, hasInstallPrompt: true })).toBe("install")
  })

  it("no muestra nada cuando el navegador no ofrece instalación", () => {
    expect(resolveInstallUi({ standalone: false, isIOS: false, hasInstallPrompt: false })).toBe("hidden")
  })

  it("la instalación manda sobre las demás señales", () => {
    expect(resolveInstallUi({ standalone: true, isIOS: true, hasInstallPrompt: true })).toBe("installed")
  })
})

describe("install-prompt detection", () => {
  it("detecta el modo instalado por display-mode standalone", () => {
    stubMatchMedia((query) => query === "(display-mode: standalone)")
    expect(detectStandalone()).toBe(true)
  })

  it("detecta el modo instalado por navigator.standalone en iOS", () => {
    stubMatchMedia(() => false)
    stubUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")
    stubStandaloneFlag(true)
    expect(detectStandalone()).toBe(true)
  })

  it("no detecta el modo instalado en un navegador común", () => {
    stubMatchMedia(() => false)
    stubUserAgent("Mozilla/5.0 (X11; Linux x86_64)")
    expect(detectStandalone()).toBe(false)
  })

  it("detecta iOS por el user agent", () => {
    stubUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")
    expect(detectIOS()).toBe(true)
  })
})

describe("install-prompt glue", () => {
  it("devuelve null cuando no hay bloque de instalación", () => {
    document.body.innerHTML = "<div>sin instalación</div>"
    expect(initInstallPrompt()).toBeNull()
  })

  it("revela el botón cuando el navegador dispara beforeinstallprompt", () => {
    stubMatchMedia(() => false)
    stubUserAgent("Mozilla/5.0 (X11; Linux x86_64)")
    buildBlocks()

    const dispose = initInstallPrompt()
    expect(block().hasAttribute("hidden")).toBe(true)

    const event = new Event("beforeinstallprompt")
    window.dispatchEvent(event)

    expect(block().hasAttribute("hidden")).toBe(false)
    expect(button().hasAttribute("hidden")).toBe(false)
    expect(hint().hasAttribute("hidden")).toBe(true)
    dispose?.()
  })

  it("llama a prompt al hacer clic en el botón capturado", async () => {
    stubMatchMedia(() => false)
    stubUserAgent("Mozilla/5.0 (X11; Linux x86_64)")
    buildBlocks()

    const dispose = initInstallPrompt()

    const event = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
    }
    event.prompt = vi.fn().mockResolvedValue(undefined)
    event.userChoice = Promise.resolve({ outcome: "accepted" })
    window.dispatchEvent(event)

    button().click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(event.prompt).toHaveBeenCalledTimes(1)
    dispose?.()
  })
})

/**
 * El mismo módulo sirve al armazón y al login: el bloque del login lleva sus
 * propias clases (la hoja del login es otra), así que el contrato que importa es
 * el de los atributos `data-install-*`, no el de los nombres de clase.
 */
describe("install-prompt en el login", () => {
  it("prende el bloque del login cuando el navegador ofrece instalar", () => {
    stubMatchMedia(() => false)
    stubUserAgent("Mozilla/5.0 (X11; Linux x86_64)")
    document.body.innerHTML = `
      <main data-page="login">
        <div class="login-install" data-install-block hidden>
          <button type="button" class="login-install-action" data-install-button hidden>
            Instalar aplicación
          </button>
          <p class="login-install-hint" data-install-hint hidden>iOS</p>
        </div>
      </main>
    `

    const dispose = initInstallPrompt()
    expect(block().hasAttribute("hidden")).toBe(true)

    window.dispatchEvent(new Event("beforeinstallprompt"))

    expect(block().hasAttribute("hidden")).toBe(false)
    expect(button().hasAttribute("hidden")).toBe(false)
    expect(hint().hasAttribute("hidden")).toBe(true)
    dispose?.()
  })

  it("en iOS muestra la indicación y no un botón que no puede funcionar", () => {
    stubMatchMedia(() => false)
    stubUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")
    document.body.innerHTML = `
      <main data-page="login">
        <div class="login-install" data-install-block hidden>
          <button type="button" class="login-install-action" data-install-button hidden>
            Instalar aplicación
          </button>
          <p class="login-install-hint" data-install-hint hidden>iOS</p>
        </div>
      </main>
    `

    const dispose = initInstallPrompt()

    expect(block().hasAttribute("hidden")).toBe(false)
    expect(button().hasAttribute("hidden")).toBe(true)
    expect(hint().hasAttribute("hidden")).toBe(false)
    dispose?.()
  })
})
