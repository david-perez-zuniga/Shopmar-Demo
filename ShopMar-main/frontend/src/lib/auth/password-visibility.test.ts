import { beforeEach, describe, expect, it } from "vitest"
import { initPasswordVisibility } from "./password-visibility"

function build(): { button: HTMLButtonElement; input: HTMLInputElement } {
  document.body.innerHTML = `
    <input id="password" type="password" />
    <button type="button" id="toggle" aria-label="Mostrar la contraseña" aria-pressed="false"></button>
  `
  const input = document.querySelector<HTMLInputElement>("#password")
  const button = document.querySelector<HTMLButtonElement>("#toggle")
  if (input === null || button === null) throw new Error("markup incompleto")
  return { button, input }
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("mostrar la contraseña", () => {
  it("arranca oculta y con el botón diciendo qué va a hacer", () => {
    const { button, input } = build()

    initPasswordVisibility(button, input)

    expect(input.type).toBe("password")
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(button.getAttribute("aria-label")).toBe("Mostrar la contraseña")
  })

  it("el primer toque la muestra y el segundo la vuelve a ocultar", () => {
    const { button, input } = build()
    initPasswordVisibility(button, input)

    button.click()
    expect(input.type).toBe("text")
    expect(button.getAttribute("aria-pressed")).toBe("true")
    expect(button.getAttribute("aria-label")).toBe("Ocultar la contraseña")

    button.click()
    expect(input.type).toBe("password")
  })

  it("al tocarlo el foco vuelve al campo, no se queda en el ojo", () => {
    const { button, input } = build()
    initPasswordVisibility(button, input)
    input.focus()

    button.click()

    expect(document.activeElement).toBe(input)
  })

  it("hide() la oculta para el envío sin cambiar un estado ya oculto", () => {
    const { button, input } = build()
    const visibility = initPasswordVisibility(button, input)

    visibility.toggle()
    expect(input.type).toBe("text")

    visibility.hide()
    expect(input.type).toBe("password")
    expect(button.getAttribute("aria-pressed")).toBe("false")
  })

  it("sin botón o sin campo no rompe: devuelve el control igual", () => {
    expect(() => initPasswordVisibility(null, null)).not.toThrow()
    const control = initPasswordVisibility(null, null)
    expect(control.toggle()).toBe(true)
    expect(() => control.hide()).not.toThrow()
  })
})
