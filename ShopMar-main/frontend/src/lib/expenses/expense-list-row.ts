/**
 * Fila del listado de gastos: modelo de vista puro + renderizador DOM.
 *
 * Frontera de pureza:
 * - La parte pura (`expenseListRowView`) convierte un `IExpenseResponse` en todo
 *   lo que se deriva de él sin tocar `document` ni `window`: las clases de la
 *   fila, el `data-expense-id` y, por celda, sus clases y su texto. La decisión
 *   del guion cuando la descripción viene vacía también es dato, no una rama del
 *   DOM.
 * - La parte DOM (`renderExpenseListRow`) arma el `<tr>` consumiendo ese modelo,
 *   sin resolver nada por su cuenta.
 *
 * Es un refactor puro del `renderRow` de `pages/expenses/index.astro`: reproduce
 * su salida byte a byte. Su único cambio posterior —autorizado aparte— es dónde
 * vive el recorte de una línea: pasó del `<td>` a un `<span>` interno (ver
 * `IDescriptionView`). La rareza a propósito está anotada en
 * `renderExpenseListRow`.
 */

import { formatCords, formatDate } from "../core/format"
import type { IExpenseResponse } from "../core/types"

/** Guion largo con el que se pinta una celda vacía. */
const EM_DASH = "—"

/** Una celda simple: sus clases completas y su texto. */
export interface ICellView {
  classes: string
  text: string
}

/**
 * Cómo pinta la descripción: `text` escribe el texto plano y `placeholder` el
 * guion dentro de un `<span class="cell-muted">`.
 */
export type IDescriptionMode = "text" | "placeholder"

/** La celda de descripción agrega el modo, que el render traduce a markup. */
export interface IDescriptionView extends ICellView {
  mode: IDescriptionMode
  /**
   * Clases del `<span>` interno que recorta el texto a una línea.
   *
   * No puede vivir en el `<td>`: `cell-clamp` necesita `display: -webkit-box`
   * para `line-clamp`, y una celda con otro `display` deja de ser `table-cell`
   * —pierde `vertical-align: middle` y el texto queda arriba—, además de pisar
   * el `display: none` con el que la hoja oculta `col-desc` en móvil.
   */
  textClasses: string
}

export interface IExpenseListRowView {
  /** Clases completas del `<tr>`. */
  rowClass: string
  /** Valor de `data-expense-id`. */
  expenseId: string
  date: ICellView
  name: ICellView
  description: IDescriptionView
  total: ICellView
}

/**
 * Deriva todo lo que la fila muestra a partir del gasto. La elección entre texto
 * y guion queda aquí, como modo, y no en una rama del DOM.
 */
export function expenseListRowView(expense: IExpenseResponse): IExpenseListRowView {
  const description = expense.description
  const hasDescription = description !== null && description !== ""

  return {
    rowClass: "ledger-row",
    expenseId: expense.id,
    date: {
      classes: "num-sm col-date",
      text: formatDate(expense.expense_date),
    },
    name: {
      classes: "cell-strong col-customer",
      text: expense.name,
    },
    description: {
      classes: "col-desc",
      textClasses: "cell-clamp",
      mode: hasDescription ? "text" : "placeholder",
      text: hasDescription ? description : EM_DASH,
    },
    total: {
      classes: "col-total right cell-total",
      text: formatCords(expense.total),
    },
  }
}

/**
 * Construye el `<tr>` de un gasto.
 *
 * Rareza preexistente (no se toca): `cell-clamp` se aplica siempre, aunque la
 * descripción sea corta o falte; no depende de su largo.
 */
export function renderExpenseListRow(expense: IExpenseResponse): HTMLTableRowElement {
  const view = expenseListRowView(expense)

  const tr = document.createElement("tr")
  tr.className = view.rowClass
  tr.dataset.expenseId = view.expenseId

  const date = document.createElement("td")
  date.className = view.date.classes
  date.textContent = view.date.text

  const name = document.createElement("td")
  name.className = view.name.classes
  name.textContent = view.name.text

  const description = document.createElement("td")
  description.className = view.description.classes
  // El recorte va en un `<span>`, no en el `<td>`: la celda tiene que seguir
  // siendo `table-cell`. Ver `IDescriptionView.textClasses`.
  const clamp = document.createElement("span")
  clamp.className = view.description.textClasses
  if (view.description.mode === "placeholder") {
    const muted = document.createElement("span")
    muted.className = "cell-muted"
    muted.textContent = view.description.text
    clamp.append(muted)
  } else {
    clamp.textContent = view.description.text
  }
  description.append(clamp)

  const total = document.createElement("td")
  total.className = view.total.classes
  total.textContent = view.total.text

  tr.append(date, name, description, total)
  return tr
}
