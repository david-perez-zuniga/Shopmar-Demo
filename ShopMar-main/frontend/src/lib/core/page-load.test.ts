import { afterEach, describe, expect, it, vi } from "vitest"
import { onPageLoad } from "./page-load"

function mountMarker(page = "demo"): void {
  document.body.innerHTML = `<div data-page="${page}"></div>`
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("page-load", () => {
  it("inicializa la pantalla cuando el documento ya está listo", () => {
    mountMarker()
    const setup = vi.fn()

    onPageLoad("demo", setup)

    expect(setup).toHaveBeenCalledTimes(1)
  })

  it("no inicializa nada cuando el marcador de la página no está presente", () => {
    const setup = vi.fn()

    onPageLoad("demo", setup)

    expect(setup).not.toHaveBeenCalled()
  })

  it("acepta un setup que no devuelve limpieza", () => {
    mountMarker()

    expect(() => onPageLoad("demo", () => undefined)).not.toThrow()
  })
})
