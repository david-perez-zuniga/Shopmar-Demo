import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  STATUS_OPTIONS,
  STATUS_STYLE,
  applyStatusLook,
  buildStatusSelect,
  labelFor,
  statusAriaLabel,
  statusLock,
  statusLook,
  statusOptions,
} from "./sale-status"
import type { ISaleListRow, SaleStatus } from "../core/types"
import { saleListRowDefaults } from "../core/fixtures"

/**
 * Líneas base congeladas del `<select>` de estado. Ver
 * `fixtures/sales/README.md`: no se regeneran para que pase un test.
 */
const FIXTURES = resolve("src/lib/fixtures/sales")

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8")
}

/** El mismo caso que produjo los fixtures: id, fecha y clienta fijos. */
function saleWith(status: SaleStatus): ISaleListRow {
  return {
    ...saleListRowDefaults,
    id: "s-20250314-001",
    sale_date: "2025-03-14",
    customer_name: "María Fernanda López",
    product_name: "Vestido floral manga corta",
    type: "live",
    status,
    cost: "1250.00",
    payment_method: "cash",
    shipment_method: "pickup",
    additional_count: 0,
    total: "1450.50",
  }
}

function buildCell(status: SaleStatus): HTMLTableCellElement {
  return buildStatusSelect(saleWith(status), () => {})
}

function selectOf(status: SaleStatus): HTMLSelectElement {
  const select = buildCell(status).querySelector("select")
  if (select === null) throw new Error("buildStatusSelect no construyó un <select>")
  return select
}

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

/** El fixture guarda el HTML serializado; el módulo devuelve el markup crudo. */
function rendered(raw: string): string {
  const host = document.createElement("span")
  host.innerHTML = raw
  return host.innerHTML
}

/** El icono real de la fila congelada, serializado por el mismo jsdom. */
function fixtureIcon(rowFixture: string): string {
  const host = document.createElement("tbody")
  host.innerHTML = fixture(rowFixture)
  const link = host.querySelector(".icon-btn")
  if (link === null) throw new Error(`sin .icon-btn en ${rowFixture}`)
  return link.innerHTML
}

const CASES: ReadonlyArray<{ status: SaleStatus; file: string; label: string }> = [
  { status: "pending", file: "sale-status-select-pending.html", label: "Pendiente" },
  { status: "completed", file: "sale-status-select-completed.html", label: "Completada" },
  { status: "cancelled", file: "sale-status-select-cancelled-locked.html", label: "Cancelada" },
]

describe("sale-status: equivalencia con los fixtures congelados", () => {
  for (const { status, file } of CASES) {
    it(`reproduce ${file} byte a byte`, () => {
      const select = selectOf(status)
      const expected = fixture(file)
      expect(select.outerHTML, describeDiff(select.outerHTML, expected)).toBe(expected)
    })
  }

  // El fixture no puede proteger esto: jsdom no serializa `option.selected`.
  describe("selección (lo que el fixture no serializa)", () => {
    for (const { status, file } of CASES) {
      it(`con estado ${status} queda elegida solo la opción ${status}`, () => {
        const select = selectOf(status)
        expect(select.value).toBe(status)

        const options = Array.from(select.options)
        expect(options.map((option) => option.value)).toEqual([
          "completed",
          "pending",
          "cancelled",
        ])
        for (const option of options) {
          expect(option.selected, `opción ${option.value} con estado ${status}`).toBe(
            option.value === status,
          )
        }

        expect(fixture(file)).not.toContain("selected")
      })
    }
  })

  it("la fila recién construida no trae la nota de bloqueo (el select no estaba montado)", () => {
    expect(buildCell("cancelled").querySelector(".status-locked")).toBeNull()
  })
})

describe("labelFor", () => {
  it("traduce los tres estados", () => {
    expect(labelFor("pending")).toBe("Pendiente")
    expect(labelFor("completed")).toBe("Completada")
    expect(labelFor("cancelled")).toBe("Cancelada")
  })
})

describe("statusLock", () => {
  it("cancelled es final: título definitivo y nota de bloqueo", () => {
    expect(statusLock("cancelled")).toEqual({
      final: true,
      title: "Cancelada es definitiva: esta venta no se puede cambiar de estado",
      note: "Cancelada es definitiva: no se puede cambiar",
    })
  })

  it("pending y completed comparten el título de confirmación rápida y no llevan nota", () => {
    for (const status of ["pending", "completed"] as SaleStatus[]) {
      expect(statusLock(status)).toEqual({
        final: false,
        title: "Cambiar de estado solicita confirmación rápida",
        note: null,
      })
    }
  })
})

describe("statusAriaLabel", () => {
  it("la rama cancelada avisa que el estado no se puede cambiar", () => {
    expect(statusAriaLabel("María Fernanda López", "cancelled")).toBe(
      "Estado de la venta a María Fernanda López: cancelada, no se puede cambiar",
    )
  })

  it("las otras dos ramas usan el texto corto", () => {
    for (const status of ["pending", "completed"] as SaleStatus[]) {
      expect(statusAriaLabel("María Fernanda López", status)).toBe(
        "Estado de la venta a María Fernanda López",
      )
    }
  })
})

describe("STATUS_OPTIONS y STATUS_STYLE", () => {
  it("lista los estados en el orden del fixture: completed, pending, cancelled", () => {
    expect(STATUS_OPTIONS).toEqual(["completed", "pending", "cancelled"])
  })

  it("cada estado tiene su clase y su etiqueta", () => {
    expect(STATUS_STYLE).toEqual({
      completed: { classes: "status-select--completed", label: "Completada" },
      pending: { classes: "status-select--pending", label: "Pendiente" },
      cancelled: { classes: "status-select--cancelled", label: "Cancelada" },
    })
  })
})

describe("statusLook", () => {
  it("cancelled tacha, marca la fila y usa el recibo", () => {
    const look = statusLook("cancelled")
    expect(look.cancelled).toBe(true)
    expect(look.struck).toBe(true)
    expect(look.rowClass).toBe("ledger-row row--cancelled")
    expect(look.printTitle).toBe("Imprimir comprobante de venta cancelada")
    expect(rendered(look.printIcon)).toBe(fixtureIcon("sale-row-live-cancelled.html"))
  })

  it("pending y completed comparten el look sin tachaduras ni marca", () => {
    const printerIcon = fixtureIcon("sale-row-live-pending.html")
    for (const status of ["pending", "completed"] as SaleStatus[]) {
      const look = statusLook(status)
      expect(look.cancelled).toBe(false)
      expect(look.struck).toBe(false)
      expect(look.rowClass).toBe("ledger-row")
      expect(look.printTitle).toBe("Imprimir comprobante")
      expect(rendered(look.printIcon)).toBe(printerIcon)
    }
  })

  it("recibo e impresora son iconos distintos", () => {
    expect(statusLook("cancelled").printIcon).not.toBe(statusLook("pending").printIcon)
  })
})

// S13: en una venta a crédito el estado de cobro lo escribe el libro de pagos,
// así que el selector no ofrece «Completada» como destino. El único destino que
// queda es cancelar, y el estado vigente se muestra como opción fija (elegida y
// no seleccionable) para que la celda siga diciendo la verdad.
describe("statusOptions: venta de contado", () => {
  it("ofrece los tres estados, como siempre, y ninguno queda fijo", () => {
    for (const status of ["completed", "pending", "cancelled"] as SaleStatus[]) {
      const options = statusOptions({ status, payment_terms: "immediate" })
      expect(options.map((option) => option.value)).toEqual([
        "completed",
        "pending",
        "cancelled",
      ])
      expect(options.every((option) => option.fixed === false)).toBe(true)
      expect(options.filter((option) => option.selected).map((option) => option.value)).toEqual([
        status,
      ])
    }
  })
})

describe("statusOptions: venta a crédito", () => {
  it("pendiente sólo permite cancelar", () => {
    const options = statusOptions({ status: "pending", payment_terms: "credit" })

    expect(options).toEqual([
      { value: "pending", label: "Pendiente", selected: true, fixed: true },
      { value: "cancelled", label: "Cancelada", selected: false, fixed: false },
    ])
    expect(options.some((option) => option.value === "completed")).toBe(false)
  })

  it("cobrada por el libro muestra Completada como estado vigente, no como destino", () => {
    const options = statusOptions({ status: "completed", payment_terms: "credit" })

    expect(options).toEqual([
      { value: "completed", label: "Completada", selected: true, fixed: true },
      { value: "cancelled", label: "Cancelada", selected: false, fixed: false },
    ])
  })

  it("cancelada no ofrece ningún destino", () => {
    expect(statusOptions({ status: "cancelled", payment_terms: "credit" })).toEqual([
      { value: "cancelled", label: "Cancelada", selected: true, fixed: true },
    ])
  })
})

describe("buildStatusSelect: el select de una venta a crédito", () => {
  /** El mismo `saleWith` de arriba, con la condición de pago que se quiera. */
  function cell(sale: Partial<ISaleListRow>): HTMLTableCellElement {
    return buildStatusSelect({ ...saleWith("pending"), ...sale }, () => {})
  }

  function selectOfCell(cell: HTMLTableCellElement): HTMLSelectElement {
    const select = cell.querySelector("select")
    if (select === null) throw new Error("buildStatusSelect no construyó un <select>")
    return select
  }

  it("no ofrece Completada y arranca en el estado vigente", () => {
    const select = selectOfCell(cell({ payment_terms: "credit", balance: "550.50" }))

    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "pending",
      "cancelled",
    ])
    expect(select.value).toBe("pending")
    expect(select.disabled).toBe(false)
    expect(select.options[0]?.disabled).toBe(true)
    expect(select.options[1]?.disabled).toBe(false)
  })

  it("una venta de contado conserva las tres opciones habilitadas", () => {
    const select = selectOfCell(cell({ payment_terms: "immediate", balance: null }))

    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "completed",
      "pending",
      "cancelled",
    ])
    expect(Array.from(select.options).every((option) => option.disabled)).toBe(false)
  })
})

describe("applyStatusLook: reconstruye las opciones de una venta a crédito", () => {
  function mountedCreditRow(): { row: HTMLTableRowElement; select: HTMLSelectElement } {
    const table = document.createElement("table")
    const body = document.createElement("tbody")
    table.append(body)
    document.body.append(table)
    const sale: ISaleListRow = { ...saleWith("pending"), payment_terms: "credit", balance: "550.50" }
    const row = document.createElement("tr")
    row.append(buildStatusSelect(sale, () => {}))
    body.append(row)
    const select = row.querySelector("select")
    if (select === null) throw new Error("la fila no tiene <select>")
    return { row, select }
  }

  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("al cancelar queda una sola opción y el select bloqueado", () => {
    const { row, select } = mountedCreditRow()
    const sale: ISaleListRow = { ...saleWith("pending"), payment_terms: "credit", balance: "550.50" }

    applyStatusLook(select, sale, "cancelled")

    expect(Array.from(select.options).map((option) => option.value)).toEqual(["cancelled"])
    expect(select.disabled).toBe(true)
    expect(row.classList.contains("row--cancelled")).toBe(true)
  })

  it("una venta de contado conserva sus tres opciones al cambiar de estado", () => {
    const table = document.createElement("table")
    const body = document.createElement("tbody")
    table.append(body)
    document.body.append(table)
    const sale = saleWith("pending")
    const row = document.createElement("tr")
    row.append(buildStatusSelect(sale, () => {}))
    body.append(row)
    const select = row.querySelector("select")
    if (select === null) throw new Error("la fila no tiene <select>")

    applyStatusLook(select, sale, "completed")

    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "completed",
      "pending",
      "cancelled",
    ])
    expect(select.value).toBe("completed")
    expect(select.disabled).toBe(false)
  })
})
