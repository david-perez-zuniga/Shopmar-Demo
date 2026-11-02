import { describe, expect, it, vi } from "vitest"
import { createListStatePainter } from "./list-state"
import type { ListStateOptions } from "./list-state"

/**
 * Configuración real de /sales y /expenses: es el texto, la clase y el destino
 * que cada pantalla pasa hoy. El pintado tiene que dar exactamente el mismo
 * markup que daba cada script. En las dos pantallas la acción y el reintento
 * usan la píldora compartida `state-action` (S55).
 */
const VENTAS: Omit<ListStateOptions, "host" | "ledger" | "onRetry"> = {
  loadingText: "Cargando ventas…",
  emptyText: "No hay ventas en el rango seleccionado",
  emptyAction: {
    className: "state-action",
    href: "/sales/new?type=live",
    text: "Registrar la primera venta",
  },
  retryClassName: "state-action",
}

const GASTOS: Omit<ListStateOptions, "host" | "ledger" | "onRetry"> = {
  loadingText: "Cargando gastos…",
  emptyText: "No hay gastos en el rango seleccionado",
  emptyAction: {
    className: "state-action",
    href: "/expenses/new",
    text: "Registrar el primer gasto",
  },
  retryClassName: "state-action",
}

function mount(): { host: HTMLElement; ledger: HTMLElement } {
  const root = document.createElement("div")
  root.innerHTML = `<div data-state-host></div><div data-ledger hidden></div>`
  document.body.append(root)
  const host = root.querySelector<HTMLElement>("[data-state-host]")
  const ledger = root.querySelector<HTMLElement>("[data-ledger]")
  if (host === null || ledger === null) throw new Error("fixture incompleto")
  return { host, ledger }
}

function painter(
  config: Omit<ListStateOptions, "host" | "ledger" | "onRetry">,
  onRetry: () => void = () => undefined,
) {
  const { host, ledger } = mount()
  return { host, ledger, paint: createListStatePainter({ ...config, host, ledger, onRetry }) }
}

/**
 * Monta el modo fila tal como lo usan /sales y /expenses: el ledger con su
 * cabecera y su pie, el tbody de las filas y la plantilla del estado, que es la
 * misma de paquetes (`[data-state-text]` y `[data-state-action]`).
 */
function mountRows(colspan: number): {
  tbody: HTMLTableSectionElement
  ledger: HTMLElement
  template: HTMLTemplateElement
} {
  const root = document.createElement("div")
  root.innerHTML = `
    <div data-ledger hidden>
      <table>
        <thead><tr class="ledger-head"><th scope="col">Fecha</th></tr></thead>
        <tbody data-rows></tbody>
      </table>
      <div class="ledger-foot"><span data-foot-text>—</span></div>
    </div>
    <template data-state-template>
      <tr>
        <td class="state-cell" colspan="${colspan}">
          <div class="empty-state">
            <p data-state-text></p>
            <a href="/sales/new?type=live" class="state-action" data-state-action hidden>Registrar la primera venta</a>
          </div>
        </td>
      </tr>
    </template>`
  document.body.append(root)
  const tbody = root.querySelector<HTMLTableSectionElement>("[data-rows]")
  const ledger = root.querySelector<HTMLElement>("[data-ledger]")
  const template = root.querySelector<HTMLTemplateElement>("[data-state-template]")
  if (tbody === null || ledger === null || template === null) throw new Error("fixture incompleto")
  return { tbody, ledger, template }
}

function rowPainter(
  config: Omit<ListStateOptions, "ledger" | "onRetry" | "template" | "tbody">,
  onRetry: () => void = () => undefined,
  colspan = 9,
) {
  const { tbody, ledger, template } = mountRows(colspan)
  return {
    tbody,
    ledger,
    paint: createListStatePainter({ ...config, ledger, template, tbody, onRetry }),
  }
}

/** La fila de estado que quedó en el tbody, si hay una. */
function stateRow(tbody: HTMLTableSectionElement): HTMLTableRowElement | null {
  const row = tbody.firstElementChild
  return row instanceof HTMLTableRowElement ? row : null
}

describe("createListStatePainter", () => {
  it("con filas destapa el ledger y vacía el host de estado", () => {
    const { host, ledger, paint } = painter(VENTAS)
    paint("loading")

    paint("ready")

    expect(host.hidden).toBe(true)
    expect(ledger.hidden).toBe(false)
    expect(host.children).toHaveLength(0)
  })

  it("mientras carga esconde el ledger y muestra el mensaje de la pantalla", () => {
    const { host, ledger, paint } = painter(VENTAS)

    paint("loading")

    expect(host.hidden).toBe(false)
    expect(ledger.hidden).toBe(true)
    expect(host.children).toHaveLength(1)
    expect(host.children[0]?.tagName).toBe("P")
    expect(host.children[0]?.className).toBe("state-msg")
    expect(host.children[0]?.textContent).toBe("Cargando ventas…")
  })

  it("sin resultados suma el enlace de acción de ventas", () => {
    const { host, paint } = painter(VENTAS)

    paint("empty")

    expect(host.children).toHaveLength(2)
    const [message, link] = Array.from(host.children)
    expect(message?.className).toBe("state-msg")
    expect(message?.textContent).toBe("No hay ventas en el rango seleccionado")
    expect(link?.tagName).toBe("A")
    expect(link?.className).toBe("state-action")
    expect(link?.getAttribute("href")).toBe("/sales/new?type=live")
    expect(link?.textContent).toBe("Registrar la primera venta")
  })

  it("sin resultados en gastos usa la clase y el destino de gastos", () => {
    const { host, paint } = painter(GASTOS)

    paint("empty")

    const [, link] = Array.from(host.children)
    expect(link?.className).toBe("state-action")
    expect(link?.getAttribute("href")).toBe("/expenses/new")
    expect(link?.textContent).toBe("Registrar el primer gasto")
  })

  it("el error muestra el mensaje recibido y el botón de reintento", () => {
    const { host, paint } = painter(VENTAS)

    paint("error", "Sin conexión")

    expect(host.children).toHaveLength(2)
    const [message, retry] = Array.from(host.children)
    expect(message?.className).toBe("state-msg state-msg--error")
    expect(message?.getAttribute("role")).toBe("alert")
    expect(message?.textContent).toBe("Sin conexión")
    expect(retry?.tagName).toBe("BUTTON")
    expect(retry?.className).toBe("state-action")
    expect(retry?.getAttribute("type")).toBe("button")
    expect(retry?.textContent).toBe("Reintentar")
  })

  it("el reintento de gastos usa su propia clase", () => {
    const { host, paint } = painter(GASTOS)

    paint("error", "Error al cargar")

    const [, retry] = Array.from(host.children)
    expect(retry?.className).toBe("state-action")
  })

  it("pulsar Reintentar avisa a la pantalla", () => {
    const onRetry = vi.fn()
    const { host, paint } = painter(VENTAS, onRetry)

    paint("error", "Sin conexión")
    ;(host.children[1] as HTMLButtonElement).click()

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("dibuja un solo mensaje aunque se repita el mismo estado", () => {
    const { host, paint } = painter(VENTAS)

    paint("loading")
    paint("loading")

    expect(host.children).toHaveLength(1)
  })

  it("un error sin mensaje cae en el texto vacío de la pantalla", () => {
    const { host, paint } = painter(VENTAS)

    paint("error")

    expect(host.children[0]?.textContent).toBe("No hay ventas en el rango seleccionado")
  })

  it("un host ausente no revienta", () => {
    const paint = createListStatePainter({
      ...VENTAS,
      host: null,
      ledger: null,
      onRetry: () => undefined,
    })

    expect(() => paint("empty")).not.toThrow()
  })

  // Modo host sin plantilla: el tbody no existe para el pintor, aunque se lo
  // pasen. Es la garantía de que la fila clonada no se cuela sin plantilla.
  it("sin plantilla escribe en el host y deja el tbody intacto", () => {
    const { tbody, ledger } = mountRows(9)
    const host = document.createElement("div")
    document.body.append(host)
    const paint = createListStatePainter({ ...VENTAS, host, ledger, tbody, onRetry: () => undefined })

    paint("empty")

    expect(host.children).toHaveLength(2)
    expect(tbody.children).toHaveLength(0)
    expect(ledger.hidden).toBe(true)
  })
})

describe("createListStatePainter en modo fila", () => {
  it("pinta el estado dentro del tbody y deja el ledger visible", () => {
    const { tbody, ledger, paint } = rowPainter(VENTAS)

    paint("loading")

    expect(ledger.hidden).toBe(false)
    expect(tbody.children).toHaveLength(1)
    const row = stateRow(tbody)
    expect(row?.tagName).toBe("TR")
    const cell = row?.querySelector("td.state-cell")
    expect(cell?.getAttribute("colspan")).toBe("9")
    expect(row?.querySelector(".empty-state")).not.toBeNull()
    expect(row?.querySelector("[data-state-text]")?.textContent).toBe("Cargando ventas…")
    expect(row?.querySelector<HTMLElement>("[data-state-action]")?.hidden).toBe(true)
  })

  it("ajusta el colspan de la fila de estado a las columnas visibles (S57)", () => {
    const { tbody, paint } = rowPainter({ ...VENTAS, emptyColspan: 4 })

    paint("empty")

    const cell = stateRow(tbody)?.querySelector("td.state-cell")
    expect(cell?.getAttribute("colspan")).toBe("4")
  })

  it("sin resultados deja el texto y la acción de la pantalla en la fila clonada", () => {
    const { tbody, ledger, paint } = rowPainter(VENTAS)

    paint("empty")

    expect(ledger.hidden).toBe(false)
    const row = stateRow(tbody)
    expect(row?.querySelector("[data-state-text]")?.textContent).toBe(
      "No hay ventas en el rango seleccionado",
    )
    const action = row?.querySelector<HTMLElement>("[data-state-action]")
    expect(action?.tagName).toBe("A")
    expect(action?.className).toBe("state-action")
    expect(action?.getAttribute("href")).toBe("/sales/new?type=live")
    expect(action?.textContent).toBe("Registrar la primera venta")
    expect(action?.hidden).toBe(false)
  })

  it("sin resultados en gastos usa su etiqueta y su destino", () => {
    const { tbody, paint } = rowPainter(GASTOS)

    paint("empty")

    const row = stateRow(tbody)
    expect(row?.querySelector("[data-state-text]")?.textContent).toBe(
      "No hay gastos en el rango seleccionado",
    )
    const action = row?.querySelector<HTMLElement>("[data-state-action]")
    expect(action?.getAttribute("href")).toBe("/expenses/new")
    expect(action?.textContent).toBe("Registrar el primer gasto")
  })

  it("el error pone Reintentar en el hueco de la acción y avisa a la pantalla", () => {
    const onRetry = vi.fn()
    const { tbody, ledger, paint } = rowPainter(VENTAS, onRetry)

    paint("error", "Sin conexión")

    expect(ledger.hidden).toBe(false)
    const row = stateRow(tbody)
    const message = row?.querySelector<HTMLElement>("[data-state-text]")
    expect(message?.className).toBe("state-msg state-msg--error")
    expect(message?.getAttribute("role")).toBe("alert")
    expect(message?.textContent).toBe("Sin conexión")
    // Mismo hueco, mismo aspecto: la acción es un <button> con la clase de
    // acción, no un botón de otra familia.
    const slot = row?.querySelector(".empty-state")
    const retry = slot?.lastElementChild
    expect(slot?.children).toHaveLength(2)
    expect(retry?.tagName).toBe("BUTTON")
    expect(retry?.className).toBe("state-action")
    expect(retry?.getAttribute("type")).toBe("button")
    expect(retry?.textContent).toBe("Reintentar")
    ;(retry as HTMLButtonElement).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("con filas conserva lo que pintó el paginador y retira la fila de estado", () => {
    const { tbody, ledger, paint } = rowPainter(VENTAS)
    paint("empty")
    const real = document.createElement("tr")
    real.className = "ledger-row"
    tbody.append(real)

    paint("ready")

    expect(ledger.hidden).toBe(false)
    expect(tbody.children).toHaveLength(1)
    expect(tbody.firstElementChild).toBe(real)
  })

  it("dibuja una sola fila de estado aunque se repita el mismo estado", () => {
    const { tbody, paint } = rowPainter(VENTAS)

    paint("loading")
    paint("loading")

    expect(tbody.children).toHaveLength(1)
  })

  it("una plantilla vacía no toca el tbody ni el ledger", () => {
    const tbody = document.createElement("tbody")
    const ledger = document.createElement("div")
    ledger.hidden = true
    const template = document.createElement("template")
    const paint = createListStatePainter({
      ...VENTAS,
      ledger,
      template,
      tbody,
      onRetry: () => undefined,
    })

    expect(() => paint("empty")).not.toThrow()
    expect(tbody.children).toHaveLength(0)
    expect(ledger.hidden).toBe(true)
  })
})
