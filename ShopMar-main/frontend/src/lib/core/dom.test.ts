import { afterEach, describe, expect, it } from "vitest"
import { clear, on, qs, setText } from "./dom"

function buildBody(): void {
  document.body.innerHTML = `
    <div id="host">
      <p class="item">Uno</p>
      <button type="button">Click</button>
    </div>
  `
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("dom", () => {
  it("qs encuentra un elemento por selector", () => {
    buildBody()
    const item = qs<HTMLParagraphElement>(".item")
    expect(item).not.toBeNull()
    expect(item?.textContent).toBe("Uno")
  })

  it("qs devuelve null cuando no existe", () => {
    buildBody()
    expect(() => qs<HTMLElement>(".no-existe")).not.toThrow()
    expect(qs<HTMLElement>(".no-existe")).toBeNull()
  })

  it("qs acepta un root distinto de document", () => {
    buildBody()
    const host = qs<HTMLElement>("#host")
    const item = qs<HTMLParagraphElement>(".item", host)
    expect(item?.textContent).toBe("Uno")
  })

  it("on registra el manejador y dispara una vez por evento", () => {
    buildBody()
    let count = 0
    const button = qs<HTMLButtonElement>("button")
    on(button, "click", () => {
      count += 1
    })
    button.click()
    expect(count).toBe(1)
  })

  it("setText escribe el contenido como texto, no como HTML", () => {
    buildBody()
    const item = qs<HTMLParagraphElement>(".item")
    setText(item, 'Ana & Sons <script>alert(1)</script>')
    expect(item.textContent).toBe("Ana & Sons <script>alert(1)</script>")
    expect(item.querySelector("script")).toBeNull()
  })

  it("clear vacía el contenedor", () => {
    buildBody()
    const host = qs<HTMLElement>("#host")
    clear(host)
    expect(host.children.length).toBe(0)
  })
})