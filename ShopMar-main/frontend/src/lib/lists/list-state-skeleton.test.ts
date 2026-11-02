import { describe, expect, it, vi } from "vitest"
import { createListStatePainter } from "./list-state"

/**
 * El esqueleto de carga (S2): la tabla ya tiene la forma de lo que va a llegar.
 * Se prueba sobre el pintor porque es el único lugar que decide entre esqueleto
 * y fila de estado.
 */
function build(options: { skeletonRows?: number } = {}) {
  const ledger = document.createElement("div")
  const tbody = document.createElement("tbody")
  const stateTemplate = document.createElement("template")
  stateTemplate.innerHTML = `<tr><td colspan="3"><p data-state-text></p><a data-state-action hidden></a></td></tr>`
  const skeletonTemplate = document.createElement("template")
  skeletonTemplate.innerHTML = `<tr class="skeleton-row"><td><span class="skeleton skeleton--cell"></span></td></tr>`

  const paint = createListStatePainter({
    template: stateTemplate,
    tbody,
    ledger,
    emptyColspan: 3,
    loadingText: "Cargando…",
    emptyText: "No hay nada",
    emptyAction: { className: "state-action", href: "/x", text: "Crear" },
    retryClassName: "state-action",
    onRetry: () => undefined,
    skeleton:
      options.skeletonRows === undefined
        ? undefined
        : { template: skeletonTemplate, rows: options.skeletonRows },
  })
  return { paint, tbody }
}

describe("esqueleto de carga de las listas", () => {
  it("mientras carga pinta N filas de esqueleto, sin texto de espera", () => {
    const { paint, tbody } = build({ skeletonRows: 4 })

    paint("loading")

    expect(tbody.querySelectorAll("[data-skeleton-row]")).toHaveLength(4)
    expect(tbody.textContent).toBe("")
  })

  it("sin esqueleto declarado el estado de carga sigue siendo la fila con texto", () => {
    const { paint, tbody } = build()

    paint("loading")

    expect(tbody.querySelectorAll("[data-skeleton-row]")).toHaveLength(0)
    expect(tbody.textContent).toContain("Cargando…")
  })

  it("con datos, el esqueleto se retira del tbody", () => {
    const { paint, tbody } = build({ skeletonRows: 2 })
    paint("loading")

    paint("ready")

    expect(tbody.querySelectorAll("[data-skeleton-row]")).toHaveLength(0)
  })

  it("el error sigue mostrando el mensaje y el reintento, no el esqueleto", () => {
    const { paint, tbody } = build({ skeletonRows: 2 })
    const onRetry = vi.fn()
    paint("loading")

    paint("error", "Se cayó la red")

    expect(tbody.querySelectorAll("[data-skeleton-row]")).toHaveLength(0)
    expect(tbody.textContent).toContain("Se cayó la red")
    expect(onRetry).not.toHaveBeenCalled()
  })
})
