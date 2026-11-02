import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mountExpenseNew } from "./expense-new"
import { ApiError } from "../core/api"
import { todayLocal } from "../core/date"

/**
 * La vista de alta de gasto de la SPA (S1, S2).
 *
 * Se monta el markup REAL de `components/views/ExpenseNewView.astro` —el que el
 * router clona dentro de `.app-view`— y se mira lo que ve la dueña y lo que
 * viaja a la API: el formulario abre con la fecha de hoy, cuenta los caracteres
 * mientras se escribe, guarda con un único `POST /expenses` y vuelve al listado
 * sin recargar el documento, y el 400 del servidor se pinta en su campo.
 *
 * La vista no tiene esqueleto de arranque y es deliberado: el formulario no
 * espera datos —abre vacío con la fecha de hoy— así que no hay ninguna espera
 * que dibujar (S2).
 */
const mocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  create: vi.fn(),
}))

vi.mock("../app/start", () => ({ navigateTo: mocks.navigateTo }))

vi.mock("../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/api")>()
  return {
    ...actual,
    expensesApi: { ...actual.expensesApi, create: mocks.create },
  }
})

const VIEW = resolve("src/components/views/ExpenseNewView.astro")
const MODULE = resolve("src/lib/views/expense-new.ts")

const cleanups: Array<() => void> = []

/** El markup de la vista, cortado después del frontmatter, como el router. */
function mountView(options: { restoredName?: string } = {}): HTMLElement {
  const source = readFileSync(VIEW, "utf8")
  const frontmatterEnd = source.indexOf("---", source.indexOf("---") + 3) + 3
  const root = document.createElement("div")
  root.className = "app-view"
  root.setAttribute("data-view", "expense-new")
  root.innerHTML = source.slice(frontmatterEnd)
  // Un valor repuesto por el navegador al recargar llega como atributo del
  // markup, antes de que corra el script: se siembra igual para probarlo.
  if (options.restoredName !== undefined) {
    root.querySelector<HTMLInputElement>("#expense-name")?.setAttribute("value", options.restoredName)
  }
  document.body.append(root)
  cleanups.push(mountExpenseNew(root))
  return root
}

function hook<T extends Element = HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (element === null) throw new Error(`falta ${selector} en la vista de alta de gasto`)
  return element
}

function form(root: HTMLElement): HTMLFormElement {
  return hook<HTMLFormElement>(root, "[data-expense-form]")
}

/** Escribe en un control como lo haría la dueña: valor + `input` que burbujea. */
function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function errorFor(root: HTMLElement, key: string): HTMLElement {
  return hook(root, `[data-error="${key}"]`)
}

function toast(root: HTMLElement): HTMLElement {
  return hook(root, "#success-toast")
}

/** Deja correr la promesa de la API y el repintado que dispara. */
function flush(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0))
}

beforeEach(() => {
  window.history.replaceState(null, "", "/expenses/new")
  mocks.navigateTo.mockReset()
  mocks.create.mockReset()
  mocks.create.mockResolvedValue({
    id: "exp-nueva",
    name: "Alquiler de local",
    description: null,
    total: "1500.00",
    expense_date: todayLocal(),
    created_at: `${todayLocal()}T12:00:00.000Z`,
    updated_at: `${todayLocal()}T12:00:00.000Z`,
  })
})

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe("el formulario arranca listo, sin espera (S2)", () => {
  it("monta los campos con la fecha de hoy y sin esqueleto", () => {
    const root = mountView()

    expect(hook<HTMLInputElement>(root, "[data-expense-date]").value).toBe(todayLocal())
    expect(hook<HTMLButtonElement>(root, "[data-submit]").disabled).toBe(false)
    expect(root.querySelectorAll(".skeleton").length).toBe(0)
    expect(hook(root, "#name-counter").textContent).toBe("0 / 200")
    expect(hook(root, "#desc-counter").textContent).toBe("0 / 500")
  })

  it("cuenta los caracteres de nombre y descripción mientras se escribe", () => {
    const root = mountView()

    typeInto(hook<HTMLInputElement>(root, "#expense-name"), "Luz")
    typeInto(hook<HTMLTextAreaElement>(root, "#expense-desc"), "Recibo 4021")

    expect(hook(root, "#name-counter").textContent).toBe("3 / 200")
    expect(hook(root, "#desc-counter").textContent).toBe("11 / 500")
  })

  it("cuenta lo que el navegador repuso al recargar el formulario", () => {
    const root = mountView({ restoredName: "Alquiler" })

    expect(hook<HTMLInputElement>(root, "#expense-name").value).toBe("Alquiler")
    expect(hook(root, "#name-counter").textContent).toBe("8 / 200")
  })

  it("los enlaces de volver apuntan al listado de gastos", () => {
    const root = mountView()

    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>("[data-cancel-link]"))
    expect(links.length).toBe(2)
    for (const link of links) expect(link.getAttribute("href")).toBe("/expenses")
  })
})

describe("guardar (S1, D-003)", () => {
  it("hace un solo POST con el cuerpo esperado y vuelve al listado sin recargar", async () => {
    vi.useFakeTimers()
    const root = mountView()
    typeInto(hook<HTMLInputElement>(root, "#expense-name"), "  Alquiler de local  ")
    typeInto(hook<HTMLInputElement>(root, "#expense-amount"), "1500")
    typeInto(hook<HTMLTextAreaElement>(root, "#expense-desc"), "  Recibo 4021  ")
    hook<HTMLInputElement>(root, "[data-expense-date]").value = "2026-03-04"

    form(root).requestSubmit()
    await vi.advanceTimersByTimeAsync(0)

    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create.mock.calls[0]?.[0]).toEqual({
      name: "Alquiler de local",
      total: "1500",
      description: "Recibo 4021",
      expense_date: "2026-03-04",
    })

    // El aviso de éxito se ve, pero la pantalla todavía no se movió.
    expect(toast(root).classList.contains("is-visible")).toBe(true)
    expect(mocks.navigateTo).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1200)

    expect(mocks.navigateTo).toHaveBeenCalledTimes(1)
    expect(mocks.navigateTo).toHaveBeenCalledWith("/expenses")
  })

  it("sin descripción ni fecha el cuerpo no lleva esas claves", async () => {
    vi.useFakeTimers()
    const root = mountView()
    typeInto(hook<HTMLInputElement>(root, "#expense-name"), "Insumos")
    typeInto(hook<HTMLInputElement>(root, "#expense-amount"), "250.50")
    hook<HTMLInputElement>(root, "[data-expense-date]").value = ""

    form(root).requestSubmit()
    await vi.advanceTimersByTimeAsync(0)

    expect(mocks.create.mock.calls[0]?.[0]).toEqual({ name: "Insumos", total: "250.50" })
  })

  it("el 400 del servidor se pinta en su campo, avisa arriba y no navega", async () => {
    const root = mountView()
    typeInto(hook<HTMLInputElement>(root, "#expense-name"), "Insumos")
    typeInto(hook<HTMLInputElement>(root, "#expense-amount"), "0")
    mocks.create.mockRejectedValue(
      new ApiError("BAD_REQUEST", 400, "total: debe ser mayor a cero"),
    )

    form(root).requestSubmit()
    await flush()

    expect(errorFor(root, "total").textContent).toBe("debe ser mayor a cero")
    expect(errorFor(root, "total").hidden).toBe(false)
    expect(hook(root, "#expense-amount").getAttribute("aria-invalid")).toBe("true")
    expect(hook<HTMLElement>(root, "#expense-amount").closest(".field")?.className).toContain(
      "field-error",
    )
    const banner = hook<HTMLElement>(root, "[data-form-banner]")
    expect(banner.hidden).toBe(false)
    expect(banner.textContent).toBe("La solicitud no es válida. Revisá los datos ingresados.")
    expect(toast(root).classList.contains("is-visible")).toBe(false)
    expect(mocks.navigateTo).not.toHaveBeenCalled()
    // El envío fallido devuelve el formulario a su estado usable.
    expect(hook<HTMLButtonElement>(root, "[data-submit]").disabled).toBe(false)
    expect(hook(root, "[data-submit-label]").textContent).toBe("Registrar gasto")
  })

  it("un segundo intento limpia los errores del primero", async () => {
    const root = mountView()
    typeInto(hook<HTMLInputElement>(root, "#expense-name"), "Insumos")
    typeInto(hook<HTMLInputElement>(root, "#expense-amount"), "0")
    mocks.create.mockRejectedValueOnce(new ApiError("BAD_REQUEST", 400, "total: debe ser mayor a cero"))

    form(root).requestSubmit()
    await flush()
    expect(errorFor(root, "total").hidden).toBe(false)

    form(root).requestSubmit()
    await flush()

    expect(errorFor(root, "total").hidden).toBe(true)
    expect(hook<HTMLElement>(root, "[data-form-banner]").hidden).toBe(true)
  })
})

describe("navegación y limpieza (S1)", () => {
  it("volver al listado es una navegación de la SPA, no una recarga", () => {
    const source = readFileSync(MODULE, "utf8")

    expect(source).toMatch(/import \{ navigateTo \} from "\.\.\/app\/start"/)
    expect(source).toMatch(/navigateTo\(/)
    expect(source).not.toMatch(/window\.location\.assign/)
    // El ciclo de la SPA lo maneja el router: nada de `onPageLoad` acá.
    expect(source).not.toMatch(/onPageLoad/)
  })

  it("desmontar la vista antes del aviso cancela la vuelta al listado", async () => {
    vi.useFakeTimers()
    const root = mountView()
    typeInto(hook<HTMLInputElement>(root, "#expense-name"), "Insumos")
    typeInto(hook<HTMLInputElement>(root, "#expense-amount"), "250.50")

    form(root).requestSubmit()
    await vi.advanceTimersByTimeAsync(0)
    expect(toast(root).classList.contains("is-visible")).toBe(true)

    // El router desmonta la vista (navegación con atrás, otra tab): el aviso que
    // ya no está en pantalla no puede mover la URL de la vista que sí está.
    for (const cleanup of cleanups.splice(0)) cleanup()
    await vi.advanceTimersByTimeAsync(2000)

    expect(mocks.navigateTo).not.toHaveBeenCalled()
  })
})
