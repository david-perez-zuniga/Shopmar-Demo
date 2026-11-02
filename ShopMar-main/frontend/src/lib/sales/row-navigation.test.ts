import { describe, expect, it } from "vitest"
import { salesRowClickTarget } from "./row-navigation"

/**
 * jsdom no implementa la navegación: cuando un clic llega a un `<a>` de verdad
 * escupe «Not implemented: navigation» por stderr. Se cancela ese default —y solo
 * ese: cuando el clic empieza en una celda, `defaultPrevented` queda en `false` y
 * la decisión se evalúa igual— para que la salida de los tests quede limpia. La
 * navegación real se verifica en el navegador.
 */
document.addEventListener(
  "click",
  (event) => {
    if (event.target instanceof Element && event.target.closest("a") !== null) {
      event.preventDefault()
    }
  },
  true,
)

/**
 * Una fila como la que arma `renderSaleListRow`, reducida a lo que importa para
 * decidir si un clic navega: una celda común, la celda de estado con su select y
 * su caret, y la celda de acciones con el icono de impresión y el enlace de
 * detalle. El `<tbody>` es el que recibe el listener delegado.
 */
function build(): {
  tbody: HTMLTableSectionElement
  select: HTMLSelectElement
  caret: HTMLElement
  print: HTMLAnchorElement
  detail: HTMLAnchorElement
} {
  document.body.innerHTML = `
    <table>
      <tbody data-rows>
        <tr class="ledger-row">
          <td class="num-sm">14/03/2025</td>
          <td><span class="label-md cell-strong">María Restrepo</span></td>
          <td><span class="cell-clamp">Sudadera oversize bordada</span></td>
          <td><span class="pill pill--counter">Live</span></td>
          <td>
            <div class="status-wrap">
              <select class="status-select" data-sale-id="sale-7f3a91">
                <option value="completed">Completada</option>
                <option value="pending">Pendiente</option>
              </select>
              <span class="status-caret" aria-hidden="true"></span>
            </div>
          </td>
          <td class="center">—</td>
          <td class="right num-md cell-total">C$ 125,750.00</td>
          <td class="right no-print">
            <div class="row-actions">
              <a class="icon-btn" href="/sales/sale-7f3a91?print=1" title="Imprimir recibo"></a>
              <a class="text-btn" data-detail href="/sales/sale-7f3a91">Ver detalle</a>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  `

  const tbody = document.querySelector<HTMLTableSectionElement>("[data-rows]")
  const select = document.querySelector<HTMLSelectElement>(".status-select")
  const caret = document.querySelector<HTMLElement>(".status-caret")
  const print = document.querySelector<HTMLAnchorElement>(".icon-btn")
  const detail = document.querySelector<HTMLAnchorElement>("[data-detail]")
  if (tbody === null || select === null || caret === null || print === null || detail === null) {
    throw new Error("el arnés no pudo armar la fila")
  }
  return { tbody, select, caret, print, detail }
}

/** Un clic primario normal, sobre el elemento dado. */
function clickOn(target: Element, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

/** Selecciona todo el texto de un nodo, para simular un arrastre. */
function selectTextOf(element: Element): void {
  const selection = window.getSelection()
  if (selection === null) throw new Error("el entorno no tiene getSelection")
  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}

describe("salesRowClickTarget: qué clic navega", () => {
  it("un clic en una celda común devuelve el enlace de detalle de la fila", () => {
    const { tbody, detail } = build()
    const cell = tbody.querySelector<HTMLElement>("td.num-sm")
    if (cell === null) throw new Error("falta la celda")

    expect(salesRowClickTarget(clickOn(cell))).toBe(detail)
  })

  it("también navega desde el texto de una celda, no solo desde el `<td>`", () => {
    const { tbody, detail } = build()
    const text = tbody.querySelector<HTMLElement>(".cell-clamp")
    if (text === null) throw new Error("falta el texto de mercadería")

    expect(salesRowClickTarget(clickOn(text))).toBe(detail)
  })
})

describe("salesRowClickTarget: qué clic se queda con el control", () => {
  it("el select de estado no navega", () => {
    const { select } = build()
    expect(salesRowClickTarget(clickOn(select))).toBeNull()
  })

  it("una opción del select tampoco", () => {
    const { select } = build()
    const option = select.options[0]
    if (option === undefined) throw new Error("el select no tiene opciones")

    expect(salesRowClickTarget(clickOn(option))).toBeNull()
  })

  it("el icono de impresión no navega por la fila", () => {
    const { print } = build()
    expect(salesRowClickTarget(clickOn(print))).toBeNull()
  })

  // Es lo que corta la recursión: la fila reemite el clic sobre este enlace, el
  // evento vuelve al listener delegado y este tiene que devolver `null`.
  it("el propio enlace Ver detalle no vuelve a disparar la navegación de fila", () => {
    const { detail } = build()
    expect(salesRowClickTarget(clickOn(detail))).toBeNull()
  })

  it("el caret del select no navega cuando el evento lo alcanza", () => {
    const { caret } = build()
    // En el navegador el caret tiene `pointer-events: none` y el clic cae en el
    // `<select>`; acá se comprueba la defensa del propio caret.
    expect(salesRowClickTarget(clickOn(caret))).toBeNull()
  })
})

describe("salesRowClickTarget: clics que no son un clic de fila", () => {
  it("un clic con modificador se ignora", () => {
    const { tbody } = build()
    const cell = tbody.querySelector<HTMLElement>("td.num-sm")
    if (cell === null) throw new Error("falta la celda")

    for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"] as const) {
      expect(salesRowClickTarget(clickOn(cell, { [modifier]: true }))).toBeNull()
    }
  })

  it("un botón que no es el primario se ignora", () => {
    const { tbody } = build()
    const cell = tbody.querySelector<HTMLElement>("td.num-sm")
    if (cell === null) throw new Error("falta la celda")

    expect(salesRowClickTarget(clickOn(cell, { button: 1 }))).toBeNull()
    expect(salesRowClickTarget(clickOn(cell, { button: 2 }))).toBeNull()
  })

  it("un clic ya cancelado por otro manejador se ignora", () => {
    const { tbody } = build()
    const cell = tbody.querySelector<HTMLElement>("td.num-sm")
    if (cell === null) throw new Error("falta la celda")

    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    event.preventDefault()
    cell.dispatchEvent(event)

    expect(salesRowClickTarget(event)).toBeNull()
  })

  it("un clic que termina un arrastre de selección se ignora", () => {
    const { tbody } = build()
    const cell = tbody.querySelector<HTMLElement>("td.num-sm")
    if (cell === null) throw new Error("falta la celda")

    selectTextOf(cell)
    expect(salesRowClickTarget(clickOn(cell))).toBeNull()

    window.getSelection()?.removeAllRanges()
  })

  it("un clic fuera de una fila se ignora", () => {
    const { tbody } = build()
    expect(salesRowClickTarget(clickOn(tbody))).toBeNull()
  })

  it("una fila sin enlace de detalle —el estado vacío— se ignora", () => {
    document.body.innerHTML = `
      <table><tbody data-rows>
        <tr><td class="state-cell"><p>No hay ventas con esos filtros.</p></td></tr>
      </tbody></table>
    `
    const cell = document.querySelector<HTMLElement>(".state-cell")
    if (cell === null) throw new Error("falta la celda de estado")

    expect(salesRowClickTarget(clickOn(cell))).toBeNull()
  })

  it("un enlace de detalle sin `href` se ignora", () => {
    const { tbody, detail } = build()
    detail.removeAttribute("href")
    const cell = tbody.querySelector<HTMLElement>("td.num-sm")
    if (cell === null) throw new Error("falta la celda")

    expect(salesRowClickTarget(clickOn(cell))).toBeNull()
  })
})

describe("salesRowClickTarget: integración con el listener delegado", () => {
  /** El cableado real: el listener del `tbody` reemite el clic sobre el enlace. */
  function wire(tbody: HTMLElement): string[] {
    const navigations: string[] = []
    tbody.addEventListener("click", (event) => {
      const anchor = salesRowClickTarget(event)
      if (anchor === null) return
      navigations.push(anchor.href)
      anchor.click()
    })
    return navigations
  }

  it("reemite el clic sobre el enlace una sola vez, sin recursión", () => {
    const { tbody, detail } = build()

    const navigations = wire(tbody)
    const cell = tbody.querySelector<HTMLElement>(".cell-clamp")
    if (cell === null) throw new Error("falta la celda")

    clickOn(cell)

    expect(navigations).toEqual([detail.href])
  })

  it("un clic sobre el select de estado no produce ninguna reemisión", () => {
    const { tbody, select } = build()
    const navigations = wire(tbody)

    clickOn(select)

    expect(navigations).toEqual([])
  })
})
