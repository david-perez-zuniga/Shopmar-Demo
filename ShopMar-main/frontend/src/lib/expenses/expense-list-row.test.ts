import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { expenseListRowView, renderExpenseListRow } from "./expense-list-row"
import type { IExpenseResponse } from "../core/types"

/**
 * Líneas base congeladas de la fila del listado de gastos. Ver
 * `fixtures/expenses/README.md`: no se regeneran para que pase un test.
 */
const FIXTURES = resolve("src/lib/fixtures/expenses")

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8")
}

/**
 * Los valores del caso salen del propio marcado de los tres fixtures —id, fecha,
 * nombre, descripción e importe—, no de una lista aparte: la igualdad byte a byte
 * de cada caso es la que los confirma.
 */
function expense(over: Partial<IExpenseResponse> = {}): IExpenseResponse {
  return {
    id: "exp-4c81",
    name: "Proveedor Textiles del Norte",
    description: "Reposición de sudaderas para la temporada.",
    total: "12500.50",
    expense_date: "2025-03-04",
    created_at: "2025-03-04T12:00:00.000Z",
    updated_at: "2025-03-04T12:00:00.000Z",
    ...over,
  }
}

const LONG_DESCRIPTION =
  "Compra de insumos & empaque para fin de temporada: cajas, etiquetas adhesivas, bolsas kraft y cinta de refuerzo para los despachos de la semana."

/**
 * En un `outerHTML` que no coincide, `toBe` imprime cientos de bytes idénticos
 * de un solo renglón. Esto deja a la vista el offset y la ventana de ambos.
 */
function describeDiff(actual: string, expected: string): string {
  const limit = Math.min(actual.length, expected.length)
  let offset = 0
  while (offset < limit && actual[offset] === expected[offset]) offset += 1
  const from = Math.max(0, offset - 40)
  return [
    `primera diferencia en el offset ${offset}`,
    `esperado: …${expected.slice(from, offset + 80)}…`,
    `actual:   …${actual.slice(from, offset + 80)}…`,
  ].join("\n")
}

/**
 * El arnés construyó la fila y serializó `outerHTML` **sin montarla** en un
 * documento; este test hace lo mismo.
 */
function render(row: IExpenseResponse): string {
  return renderExpenseListRow(row).outerHTML
}

const CASES: ReadonlyArray<{
  file: string
  overrides: Partial<IExpenseResponse>
}> = [
  {
    file: "expense-row-with-description.html",
    overrides: {},
  },
  {
    file: "expense-row-without-description.html",
    overrides: {
      id: "exp-77b2",
      name: "Transporte Cargotrans",
      description: null,
      total: "3420.00",
      expense_date: "2025-03-11",
    },
  },
  {
    // La descripción larga solo cambia los bytes del texto: `cell-clamp` es
    // incondicional, así que el marcado es igual al de la primera fila.
    file: "expense-row-long-description.html",
    overrides: {
      id: "exp-9ab0",
      name: "Insumos varios",
      description: LONG_DESCRIPTION,
      total: "980.75",
      expense_date: "2025-03-18",
    },
  },
]

describe("expense-list-row: equivalencia con los fixtures congelados", () => {
  for (const { file, overrides } of CASES) {
    it(`reproduce ${file} byte a byte`, () => {
      const actual = render(expense(overrides))
      const expected = fixture(file)
      expect(actual, describeDiff(actual, expected)).toBe(expected)
    })
  }
})

describe("expenseListRowView: descripción", () => {
  it("con texto usa el modo de texto plano", () => {
    const view = expenseListRowView(expense({ description: "Reposición de sudaderas." }))
    expect(view.description.mode).toBe("text")
    expect(view.description.text).toBe("Reposición de sudaderas.")
    expect(view.description.classes).toBe("col-desc")
    expect(view.description.textClasses).toBe("cell-clamp")
  })

  it("con null usa el guion en el span", () => {
    const view = expenseListRowView(expense({ description: null }))
    expect(view.description.mode).toBe("placeholder")
    expect(view.description.text).toBe("—")
  })

  it("con cadena vacía usa el guion igual que con null", () => {
    const view = expenseListRowView(expense({ description: "" }))
    expect(view.description.mode).toBe("placeholder")
    expect(view.description.text).toBe("—")
  })
})

describe("expenseListRowView: identificador y clases", () => {
  it("la fila lleva las clases y el data-expense-id", () => {
    const view = expenseListRowView(expense({ id: "exp-4c81" }))
    expect(view.rowClass).toBe("ledger-row")
    expect(view.expenseId).toBe("exp-4c81")
  })

  it("cada celda lleva sus clases completas", () => {
    const view = expenseListRowView(expense({}))
    expect(view.date.classes).toBe("num-sm col-date")
    expect(view.name.classes).toBe("cell-strong col-customer")
    expect(view.description.classes).toBe("col-desc")
    expect(view.description.textClasses).toBe("cell-clamp")
    expect(view.total.classes).toBe("col-total right cell-total")
  })

  it("formatea fecha e importe como la página", () => {
    const view = expenseListRowView(
      expense({ expense_date: "2025-03-04", total: "12500.50", name: "Proveedor" }),
    )
    expect(view.date.text).toBe("04/03/2025")
    expect(view.total.text).toBe("C$ 12,500.50")
    expect(view.name.text).toBe("Proveedor")
  })
})

describe("renderExpenseListRow: orden de las celdas", () => {
  it("apenda fecha, nombre, descripción e importe en ese orden", () => {
    const cells = renderExpenseListRow(expense({})).querySelectorAll("td")
    expect(cells).toHaveLength(4)
    expect(cells[0]?.className).toBe("num-sm col-date")
    expect(cells[1]?.className).toBe("cell-strong col-customer")
    expect(cells[2]?.className).toBe("col-desc")
    expect(cells[3]?.className).toBe("col-total right cell-total")
  })
})

// El recorte de una línea no puede vivir en el `<td>`: `cell-clamp` define
// `display: -webkit-box`, y una celda con otro `display` deja de ser
// `table-cell` —`vertical-align: middle` no aplica y el texto queda arriba—,
// además de anular el `display: none` con el que la hoja oculta `col-desc`.
// Es el mismo defecto que tenía la mercadería de `/packages`.
describe("renderExpenseListRow: el recorte vive en un span interno", () => {
  it("el `<td>` conserva `col-desc` y el `<span>` lleva `cell-clamp`", () => {
    const cell = renderExpenseListRow(expense({})).children[2]
    expect(cell?.tagName).toBe("TD")
    expect(cell?.className).toBe("col-desc")
    expect(cell?.firstElementChild?.tagName).toBe("SPAN")
    expect(cell?.firstElementChild?.className).toBe("cell-clamp")
    expect(cell?.textContent).toBe("Reposición de sudaderas para la temporada.")
  })

  it("el guion del caso sin descripción queda dentro del span", () => {
    const cell = renderExpenseListRow(expense({ description: null })).children[2]
    expect(cell?.className).toBe("col-desc")
    const clamp = cell?.firstElementChild
    expect(clamp?.className).toBe("cell-clamp")
    expect(clamp?.firstElementChild?.className).toBe("cell-muted")
    expect(clamp?.textContent).toBe("—")
  })

  it("ningún `<td>` lleva `cell-clamp`", () => {
    const row = renderExpenseListRow(expense({}))
    expect(row.querySelectorAll("td.cell-clamp")).toHaveLength(0)
    expect(row.querySelectorAll("span.cell-clamp")).toHaveLength(1)
  })
})
