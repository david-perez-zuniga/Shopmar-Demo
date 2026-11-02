import { afterEach, describe, expect, it, vi } from "vitest"
import {
  formatStaleNotice,
  initPwa,
  shouldActivateUpdate,
  shouldShowUpdateNotice,
} from "./pwa"

type RegistrationStub = {
  waiting: ServiceWorker | null
  installing: ServiceWorker | null
  addEventListener: (type: string, fn: (event: Event) => void) => void
  removeEventListener: (type: string, fn: (event: Event) => void) => void
}

function stubServiceWorker(registration: RegistrationStub): void {
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: {
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: () => {},
      removeEventListener: () => {},
      controller: null,
    },
    configurable: true,
  })
}

function buildShell(): void {
  document.body.innerHTML = `
    <div data-update-notice hidden>
      <button type="button" data-update-accept>Actualizar</button>
    </div>
    <div data-stale-notice hidden><span data-stale-text></span></div>
  `
}

function updateNotice(): HTMLElement {
  return document.querySelector("[data-update-notice]") as HTMLElement
}

function acceptButton(): HTMLButtonElement {
  return document.querySelector("[data-update-accept]") as HTMLButtonElement
}

function staleNotice(): HTMLElement {
  return document.querySelector("[data-stale-notice]") as HTMLElement
}

function staleText(): HTMLElement {
  return document.querySelector("[data-stale-text]") as HTMLElement
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  document.body.innerHTML = ""
  vi.unstubAllGlobals()
  delete (window.navigator as unknown as Record<string, unknown>).serviceWorker
})

describe("pwa decisions", () => {
  it("avisa solo cuando hay una versión esperando", () => {
    expect(shouldShowUpdateNotice(true)).toBe(true)
    expect(shouldShowUpdateNotice(false)).toBe(false)
  })

  it("activa solo cuando hay versión esperando y la persona aceptó", () => {
    expect(shouldActivateUpdate(true, true)).toBe(true)
    expect(shouldActivateUpdate(true, false)).toBe(false)
    expect(shouldActivateUpdate(false, true)).toBe(false)
    expect(shouldActivateUpdate(false, false)).toBe(false)
  })
})

describe("formatStaleNotice", () => {
  it("dice de cuándo son los datos guardados", () => {
    const text = formatStaleNotice("2026-10-10T14:30:00.000Z")
    expect(text).toContain("10/10/2026")
    expect(text.toLowerCase()).toContain("guardados")
  })

  it("no rompe con un valor inválido", () => {
    expect(formatStaleNotice("no-es-fecha")).toContain("Sin conexión")
  })
})

describe("initPwa stale notice", () => {
  it("muestra el aviso cuando la API responde desde la caché", () => {
    buildShell()
    initPwa()

    window.dispatchEvent(
      new CustomEvent("shopmar:stale-data", { detail: { at: "2026-10-10T14:30:00.000Z" } }),
    )

    expect(staleNotice().hasAttribute("hidden")).toBe(false)
    expect(staleText().textContent).toContain("10/10/2026")
  })

  it("oculta el aviso cuando llega un dato fresco", () => {
    buildShell()
    initPwa()

    window.dispatchEvent(
      new CustomEvent("shopmar:stale-data", { detail: { at: "2026-10-10T14:30:00.000Z" } }),
    )
    window.dispatchEvent(new CustomEvent("shopmar:stale-data", { detail: { at: null } }))

    expect(staleNotice().hasAttribute("hidden")).toBe(true)
  })

  it("oculta el aviso cuando el navegador vuelve a estar en línea", () => {
    buildShell()
    initPwa()

    window.dispatchEvent(
      new CustomEvent("shopmar:stale-data", { detail: { at: "2026-10-10T14:30:00.000Z" } }),
    )
    window.dispatchEvent(new Event("online"))

    expect(staleNotice().hasAttribute("hidden")).toBe(true)
  })
})

describe("initPwa update notice", () => {
  it("no muestra el aviso si no hay versión esperando", async () => {
    buildShell()
    stubServiceWorker({
      waiting: null,
      installing: null,
      addEventListener: () => {},
      removeEventListener: () => {},
    })

    initPwa()
    await flush()

    expect(updateNotice().hasAttribute("hidden")).toBe(true)
  })

  it("muestra el aviso cuando ya hay una versión esperando al cargar", async () => {
    buildShell()
    stubServiceWorker({
      waiting: {} as ServiceWorker,
      installing: null,
      addEventListener: () => {},
      removeEventListener: () => {},
    })

    initPwa()
    await flush()

    expect(updateNotice().hasAttribute("hidden")).toBe(false)
  })

  it("activar la versión nueva solo sucede tras el pedido de la persona", async () => {
    buildShell()
    const postMessage = vi.fn()
    stubServiceWorker({
      waiting: { postMessage } as unknown as ServiceWorker,
      installing: null,
      addEventListener: () => {},
      removeEventListener: () => {},
    })

    initPwa()
    await flush()

    expect(postMessage).not.toHaveBeenCalled()
    acceptButton().click()
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" })
  })
})
