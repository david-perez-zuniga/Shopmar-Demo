import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { mountNew } from "./new"

/**
 * La vista `/new` de la SPA (T7).
 *
 * Se monta el markup REAL de `components/views/NewView.astro` —el que el router
 * clona dentro de `.app-view`— y se mira lo que ve la persona: las dos opciones
 * del nivel 1, el acordeón que revela los dos canales y los tres destinos que
 * llevan a los formularios.
 *
 * La pantalla no tiene script propio: el acordeón es un `<details>` nativo. Eso
 * es lo que se protege acá, porque es la razón por la que la vista no necesita
 * cableado: si alguien le agregara un `toggle` a mano, el toque abriría y
 * cerraría en el mismo gesto y «Registrar venta» parecería no responder.
 */
const VIEW = resolve("src/components/views/NewView.astro")

/** El markup de la vista, cortado después del frontmatter, como el router. */
function mountView(): HTMLElement {
  const source = readFileSync(VIEW, "utf8")
  const frontmatterEnd = source.indexOf("---", source.indexOf("---") + 3) + 3
  const root = document.createElement("div")
  root.className = "app-view"
  root.setAttribute("data-view", "new")
  root.innerHTML = source.slice(frontmatterEnd)
  document.body.append(root)
  return root
}

function details(root: HTMLElement): HTMLDetailsElement {
  const element = root.querySelector<HTMLDetailsElement>("details")
  if (element === null) throw new Error("la vista no trae el acordeón")
  return element
}

function hrefs(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll("a[href]"), (anchor) => anchor.getAttribute("href") ?? "")
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("vista /new: selector de registro (T7)", () => {
  it("montar no cablea nada: el acordeón lo abre el <details> nativo, una sola vez", () => {
    const root = mountView()

    mountNew(root)
    const accordion = details(root).querySelector<HTMLElement>("summary")
    accordion?.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(details(root).open).toBe(true)
    // Un segundo toque lo cierra: el gesto lo resuelve el navegador, no un
    // listener que pudiera quedar montado de la vista anterior.
    accordion?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(details(root).open).toBe(false)
  })

  it("los dos niveles reparten el registro a los tres formularios", () => {
    const root = mountView()

    mountNew(root)

    expect(hrefs(root)).toEqual([
      "/sales/new?type=whatsapp",
      "/sales/new?type=live",
      "/expenses/new",
    ])
    // Los dos canales viven dentro del acordeón: abrirlo es lo que los muestra.
    expect(details(root).textContent).toContain("Venta en tienda")
    expect(details(root).textContent).toContain("Venta por Live")
  })

  it("un solo botón tinta por nivel: la venta es primaria y el gasto delineado", () => {
    const root = mountView()

    mountNew(root)

    const accordion = details(root).querySelector("summary")
    expect(accordion?.classList.contains("btn")).toBe(true)
    expect(accordion?.classList.contains("btn-primary")).toBe(true)
    expect(root.querySelectorAll(".btn-primary")).toHaveLength(1)

    const expense = root.querySelector<HTMLAnchorElement>('a[href="/expenses/new"]')
    expect(expense?.classList.contains("btn-secondary")).toBe(true)
    expect(expense?.textContent).toContain("Registrar gasto")
  })

  it("conserva el gancho de las pantallas: data-page y el título", () => {
    const root = mountView()

    mountNew(root)

    expect(root.querySelector('[data-page="new"]')).not.toBeNull()
    expect(root.querySelector("h1")?.textContent).toBe("Registrar")
  })
})
