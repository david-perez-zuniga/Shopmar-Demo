import { describe, expect, it } from "vitest"
import { rowClickOpensEdit } from "./customer-row-click"

/**
 * Una fila como la que arma la pantalla de clientes, reducida a lo que importa
 * para decidir si un clic abre la edición: una celda común, la del nombre y la
 * de acciones con sus botones.
 */
function buildTable(): HTMLTableSectionElement {
  const tbody = document.createElement("tbody")
  tbody.innerHTML = `
    <tr data-customer-id="c1">
      <td class="col-name">María González</td>
      <td class="col-phone">8888 1234</td>
      <td class="col-money">C$ 0.00</td>
      <td class="col-actions">
        <button type="button" data-action="details">Historial</button>
        <button type="button" data-action="edit">Editar</button>
        <button type="button" data-action="delete">Borrar</button>
      </td>
    </tr>`
  document.body.replaceChildren(tbody)
  return tbody
}

/** `dispatchEvent` es sincrónico: el evento que se devuelve es el que hay que decidir. */
function fire(target: Element, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init })
  target.dispatchEvent(event)
  return event
}

describe("rowClickOpensEdit: qué clic abre la edición", () => {
  it("un clic en una celda común abre la edición", () => {
    const tbody = buildTable()
    const cell = tbody.querySelector(".col-name") as Element
    expect(rowClickOpensEdit(fire(cell))).toBe(true)
  })

  it("el texto de la celda también abre, salvo que esté seleccionado", () => {
    const tbody = buildTable()
    const cell = tbody.querySelector(".col-money") as HTMLElement
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(cell)
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(rowClickOpensEdit(fire(cell))).toBe(false)

    selection?.removeAllRanges()
    expect(rowClickOpensEdit(fire(cell))).toBe(true)
  })

  it("los botones de la fila se quedan con su clic", () => {
    const tbody = buildTable()
    for (const action of ["details", "edit", "delete"]) {
      const button = tbody.querySelector(`[data-action="${action}"]`) as Element
      expect(rowClickOpensEdit(fire(button))).toBe(false)
    }
  })

  it("un clic con modificador, o con otro botón, no abre la edición", () => {
    const tbody = buildTable()
    const cell = tbody.querySelector(".col-name") as Element
    expect(rowClickOpensEdit(fire(cell, { ctrlKey: true }))).toBe(false)
    expect(rowClickOpensEdit(fire(cell, { metaKey: true }))).toBe(false)
    expect(rowClickOpensEdit(fire(cell, { button: 1 }))).toBe(false)
  })

  it("un clic ya cancelado por otro manejador no abre la edición", () => {
    const tbody = buildTable()
    const cell = tbody.querySelector(".col-name") as Element
    const event = fire(cell)
    event.preventDefault()
    expect(rowClickOpensEdit(event)).toBe(false)
  })
})
