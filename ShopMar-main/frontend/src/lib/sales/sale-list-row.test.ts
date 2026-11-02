import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  applyCreditToRow,
  creditColumnView,
  paymentActionAvailable,
  readSalesCreditFilters,
  renderSaleListRow,
  saleListRowView,
} from "./sale-list-row"
import type { ISaleListRow } from "../core/types"
import { saleListRowDefaults } from "../core/fixtures"

/**
 * Líneas base congeladas de la fila del listado. Ver
 * `fixtures/sales/README.md`: no se regeneran para que pase un test.
 */
const FIXTURES = resolve("src/lib/fixtures/sales")

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8")
}

/**
 * El mismo caso que produjo los fixtures: id, fecha, clienta, producto,
 * costo y total fijos. Solo varían `type`, `status` y `additional_count`.
 */
const BASE: ISaleListRow = {
    ...saleListRowDefaults,
  id: "s-20250314-001",
  sale_date: "2025-03-14",
  customer_name: "María Fernanda López",
  product_name: "Vestido floral manga corta",
  type: "live",
  status: "pending",
  cost: "1250.00",
  payment_method: "cash",
  shipment_method: "delivery",
  additional_count: 0,
  total: "1450.50",
}

function saleWith(overrides: Partial<ISaleListRow>): ISaleListRow {
  return { ...BASE, ...overrides }
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

/**
 * El arnés construyó la fila y serializó `outerHTML` **sin montarla** en un
 * documento; este test hace lo mismo. Montarla primero no debería cambiar la
 * serialización, pero si aparece una diferencia atada a eso hay que reportarla,
 * no maquillarla.
 */
function render(sale: ISaleListRow): string {
  return withoutCreditCell(renderSaleListRow(sale, () => {})).outerHTML
}

/**
 * Las líneas base se capturaron **antes** de la columna «Cobro» (S13), así que
 * este test las sigue usando para el resto de la fila y quita esa celda antes de
 * comparar. La columna nueva tiene sus propias pruebas más abajo; regenerar los
 * fixtures es un cambio de sus archivos, que este corte no toca.
 */
function withoutCreditCell(row: HTMLTableRowElement): HTMLTableRowElement {
  row.querySelector("[data-credit]")?.remove()
  return row
}

const CASES: ReadonlyArray<{
  file: string
  overrides: Partial<ISaleListRow>
}> = [
  {
    file: "sale-row-live-pending.html",
    overrides: { type: "live", status: "pending", additional_count: 0 },
  },
  {
    file: "sale-row-whatsapp-completed.html",
    overrides: { type: "whatsapp", status: "completed", additional_count: 2 },
  },
  {
    file: "sale-row-live-cancelled.html",
    overrides: { type: "live", status: "cancelled", additional_count: 0 },
  },
  {
    file: "sale-row-whatsapp-additional.html",
    overrides: { type: "whatsapp", status: "pending", additional_count: 1 },
  },
]

describe("sale-list-row: equivalencia con los fixtures congelados", () => {
  for (const { file, overrides } of CASES) {
    it(`reproduce ${file} byte a byte`, () => {
      const actual = render(saleWith(overrides))
      const expected = fixture(file)
      expect(actual, describeDiff(actual, expected)).toBe(expected)
    })
  }
})

describe("saleListRowView: canal", () => {
  it("live usa la píldora de mostrador", () => {
    const view = saleListRowView(saleWith({ type: "live" }))
    expect(view.channel.classes).toBe("pill pill--counter")
    expect(view.channel.label).toBe("Live")
  })

  it("whatsapp usa la píldora de tienda", () => {
    const view = saleListRowView(saleWith({ type: "whatsapp" }))
    expect(view.channel.classes).toBe("pill pill--wa")
    expect(view.channel.label).toBe("Tienda")
  })

  it("cada canal lleva su propio icono", () => {
    const live = saleListRowView(saleWith({ type: "live" }))
    const whatsapp = saleListRowView(saleWith({ type: "whatsapp" }))
    expect(live.channel.icon).not.toBe(whatsapp.channel.icon)
  })
})

describe("saleListRowView: look del estado", () => {
  it("pending no tacha y no marca la fila", () => {
    const view = saleListRowView(saleWith({ status: "pending" }))
    expect(view.cancelled).toBe(false)
    expect(view.struck).toBe(false)
    expect(view.rowClass).toBe("ledger-row")
    expect(view.date.classes).toBe("num-sm")
    expect(view.total.classes).toBe("right num-md cell-total")
  })

  it("completed comparte el look sin tachaduras", () => {
    const view = saleListRowView(saleWith({ status: "completed" }))
    expect(view.cancelled).toBe(false)
    expect(view.struck).toBe(false)
    expect(view.rowClass).toBe("ledger-row")
  })

  it("cancelled tacha la fila entera", () => {
    const view = saleListRowView(saleWith({ status: "cancelled" }))
    expect(view.cancelled).toBe(true)
    expect(view.struck).toBe(true)
    expect(view.rowClass).toBe("ledger-row row--cancelled")
    expect(view.date.classes).toBe("num-sm cell-struck")
    expect(view.customer.classes).toBe("label-md cell-strong cell-struck")
    expect(view.product.classes).toBe("cell-clamp cell-struck")
    expect(view.total.classes).toBe("right num-md cell-total cell-struck")
  })
})

describe("saleListRowView: celda de artículos adicionales", () => {
  it("con cero adicionales usa el guion largo en su celda outline", () => {
    const view = saleListRowView(saleWith({ additional_count: 0 }))
    expect(view.additional.text).toBe("—")
    expect(view.additional.classes).toBe("cell-outline label-sm")
  })

  it("con uno usa el singular", () => {
    const view = saleListRowView(saleWith({ additional_count: 1 }))
    expect(view.additional.text).toBe("1 art.")
    expect(view.additional.classes).toBe("items-chip")
  })

  it("con dos usa el plural", () => {
    const view = saleListRowView(saleWith({ additional_count: 2 }))
    expect(view.additional.text).toBe("2 arts.")
    expect(view.additional.classes).toBe("items-chip")
  })
})

describe("saleListRowView: enlace de impresión", () => {
  it("una venta vigente usa el título de impresión normal", () => {
    const view = saleListRowView(saleWith({ status: "pending" }))
    expect(view.print.title).toBe("Imprimir comprobante")
    expect(view.print.ariaLabel).toBe("Imprimir comprobante")
    expect(view.print.href).toBe("/sales/detail?id=s-20250314-001&print=1")
  })

  it("una venta cancelada usa el título de comprobante cancelado", () => {
    const view = saleListRowView(saleWith({ status: "cancelled" }))
    expect(view.print.title).toBe("Imprimir comprobante de venta cancelada")
    expect(view.print.ariaLabel).toBe("Imprimir comprobante de venta cancelada")
    expect(view.print.href).toBe("/sales/detail?id=s-20250314-001&print=1")
  })

  it("recibo e impresora son iconos distintos", () => {
    const pending = saleListRowView(saleWith({ status: "pending" }))
    const cancelled = saleListRowView(saleWith({ status: "cancelled" }))
    expect(cancelled.print.icon).not.toBe(pending.print.icon)
  })
})

describe("saleListRowView: enlace de detalle", () => {
  it("apunta a la venta y se llama Ver detalle", () => {
    const view = saleListRowView(saleWith({}))
    expect(view.detail.href).toBe("/sales/detail?id=s-20250314-001")
    expect(view.detail.text).toBe("Ver detalle")
  })

  it("codifica el id en los dos enlaces de la fila", () => {
    const view = saleListRowView(saleWith({ id: "a/b c" }))
    expect(view.detail.href).toBe("/sales/detail?id=a%2Fb%20c")
    expect(view.print.href).toBe("/sales/detail?id=a%2Fb%20c&print=1")
  })
})

// La columna del precio (`sale.cost`) se eliminó por pedido de la dueña: repetía el mismo
// número que Total en toda venta sin adicionales. El listado queda con una sola columna de
// dinero, así que la fila tiene ocho celdas y el precio no aparece en ninguna.
describe("renderSaleListRow: una sola columna de dinero", () => {
  it("sin la columna Cobro la fila tiene ocho celdas y el precio no aparece en ninguna", () => {
    const row = withoutCreditCell(renderSaleListRow(saleWith({}), () => {}))

    expect(row.querySelectorAll("td"), `celdas: ${row.outerHTML}`).toHaveLength(8)
    expect(row.outerHTML, "el precio ya no se muestra en la fila").not.toContain("C$ 1,250.00")
    expect(row.outerHTML, "el total sigue en la fila").toContain("C$ 1,450.50")
  })
})

// El clic en la fila no navega por su cuenta: reemite el clic sobre este enlace
// (ver `row-navigation.ts`), así que el `href` de acá es el único destino.
describe("renderSaleListRow: gancho de la fila clickeable", () => {
  it("el enlace de detalle lleva `data-detail` y el de impresión no", () => {
    const row = renderSaleListRow(saleWith({}), () => {})
    const detail = row.querySelector("[data-detail]")

    expect(detail).not.toBeNull()
    expect(detail?.tagName).toBe("A")
    expect(detail?.className).toBe("text-btn")
    expect(detail?.getAttribute("href")).toBe("/sales/detail?id=s-20250314-001")
    expect(detail?.textContent).toBe("Ver detalle")
    expect(row.querySelectorAll("[data-detail]")).toHaveLength(1)
  })
})

// La columna «Cobro» (S13) es la que hace visible la cuenta por cobrar: saldo y
// vencimiento en una venta a crédito, «Pagada» cuando el libro la saldó y el
// guion de siempre en una venta de contado, que no tiene nada que cobrar.
describe("creditColumnView", () => {
  it("una venta de contado no tiene nada que cobrar", () => {
    const view = creditColumnView(saleWith({ payment_terms: "immediate", balance: null }))

    expect(view.value).toBe("—")
    expect(view.valueClass).toBe("cell-outline label-sm")
    expect(view.hint).toBe("")
    expect(view.classes).toBe("cell-credit")
  })

  it("una venta a crédito con saldo muestra el saldo y el vencimiento", () => {
    const view = creditColumnView(
      saleWith({
        payment_terms: "credit",
        due_date: "2026-10-28T00:00:00.000Z",
        paid_total: "1550.00",
        balance: "550.50",
        is_overdue: false,
      }),
    )

    expect(view.value).toBe("C$ 550.50")
    expect(view.valueClass).toBe("num-md")
    expect(view.hint).toBe("Vence 28/10/2026")
    expect(view.hintClass).toBe("credit-note")
  })

  it("una venta vencida dice Vencida en lugar de la fecha", () => {
    const view = creditColumnView(
      saleWith({
        payment_terms: "credit",
        due_date: "2026-10-28T00:00:00.000Z",
        paid_total: "1550.00",
        balance: "550.50",
        is_overdue: true,
      }),
    )

    expect(view.value).toBe("C$ 550.50")
    expect(view.hint).toBe("Vencida")
    expect(view.hintClass).toBe("credit-note credit-note--overdue")
  })

  it("una venta a crédito ya saldada dice Pagada, sin segunda línea", () => {
    const view = creditColumnView(
      saleWith({
        payment_terms: "credit",
        due_date: "2026-10-28T00:00:00.000Z",
        paid_total: "2100.50",
        balance: "0.00",
        status: "completed",
      }),
    )

    expect(view.value).toBe("Pagada")
    expect(view.valueClass).toBe("cell-outline label-sm")
    expect(view.hint).toBe("")
  })
})

describe("paymentActionAvailable", () => {
  it("sólo una venta a crédito con saldo y viva admite un pago", () => {
    expect(
      paymentActionAvailable(
        saleWith({ payment_terms: "credit", balance: "550.50", status: "pending" }),
      ),
    ).toBe(true)
  })

  it("una venta de contado no registra pagos", () => {
    expect(paymentActionAvailable(saleWith({ payment_terms: "immediate", balance: null }))).toBe(
      false,
    )
  })

  it("una venta a crédito saldada ya no admite pagos", () => {
    expect(
      paymentActionAvailable(
        saleWith({ payment_terms: "credit", balance: "0.00", status: "completed" }),
      ),
    ).toBe(false)
  })

  it("una venta cancelada no admite pagos", () => {
    expect(
      paymentActionAvailable(
        saleWith({ payment_terms: "credit", balance: "550.50", status: "cancelled" }),
      ),
    ).toBe(false)
  })
})

/** Una venta a crédito con saldo, que es el caso que muestra la acción. */
const CREDIT: Partial<ISaleListRow> = {
  payment_terms: "credit",
  due_date: "2026-10-28T00:00:00.000Z",
  customer_id: "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16",
  paid_total: "1550.00",
  balance: "550.50",
  is_overdue: false,
}

describe("renderSaleListRow: la columna Cobro", () => {
  it("va inmediatamente después de la celda de estado", () => {
    const row = renderSaleListRow(saleWith(CREDIT), () => {})
    const cells = Array.from(row.children)

    expect(cells).toHaveLength(9)
    expect(cells[4]?.querySelector(".status-select")).not.toBeNull()
    expect(cells[5]?.hasAttribute("data-credit")).toBe(true)
    expect(cells[5]?.querySelector(".num-md")?.textContent).toBe("C$ 550.50")
    expect(cells[5]?.querySelector(".credit-note")?.textContent).toBe("Vence 28/10/2026")
  })

  it("una venta cancelada tacha el saldo como el resto de la fila", () => {
    const row = renderSaleListRow(saleWith({ ...CREDIT, status: "cancelled" }), () => {})
    const credit = row.querySelector<HTMLElement>("[data-credit]")

    expect(credit?.classList.contains("cell-struck")).toBe(false)
    expect(credit?.querySelector<HTMLElement>("[data-struck]")?.className).toBe(
      "num-md cell-struck",
    )
  })

  it("en una venta de contado la celda muestra el guion", () => {
    const row = renderSaleListRow(saleWith({}), () => {})
    expect(row.querySelector("[data-credit]")?.textContent).toBe("—")
    expect(row.querySelector("[data-payment]")).toBeNull()
  })
})

describe("renderSaleListRow: acción Registrar pago", () => {
  it("una venta a crédito con saldo lleva el botón dentro de las acciones", () => {
    const row = renderSaleListRow(saleWith(CREDIT), () => {}, () => {})
    const button = row.querySelector<HTMLButtonElement>("[data-payment]")

    expect(button).not.toBeNull()
    expect(button?.tagName).toBe("BUTTON")
    expect(button?.className).toBe("text-btn text-btn--payment")
    expect(button?.type).toBe("button")
    expect(button?.textContent).toBe("Registrar pago")
    expect(button?.closest("td")?.className).toBe("right no-print")
  })

  it("el clic avisa a la página con la venta de esa fila", () => {
    const sale = saleWith(CREDIT)
    const calls: Array<{ button: HTMLButtonElement; sale: ISaleListRow }> = []
    const row = renderSaleListRow(sale, () => {}, (button, target) => {
      calls.push({ button, sale: target })
    })

    row.querySelector<HTMLButtonElement>("[data-payment]")?.click()

    expect(calls).toHaveLength(1)
    expect(calls[0]?.sale).toBe(sale)
    expect(calls[0]?.button.dataset["payment"]).toBe("")
  })

  it("sin manejador el botón no existe", () => {
    const row = renderSaleListRow(saleWith(CREDIT), () => {})
    expect(row.querySelector("[data-payment]")).toBeNull()
  })
})

describe("applyCreditToRow: la fila después de un pago", () => {
  function mounted(sale: ISaleListRow): HTMLTableRowElement {
    const table = document.createElement("table")
    const body = document.createElement("tbody")
    table.append(body)
    document.body.append(table)
    const row = renderSaleListRow(sale, () => {}, () => {})
    body.append(row)
    return row
  }

  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("actualiza el saldo y deja el botón mientras quede deuda", () => {
    const sale = saleWith(CREDIT)
    const row = mounted(sale)

    sale.balance = "50.50"
    sale.paid_total = "2050.00"
    applyCreditToRow(row, sale)

    expect(row.querySelector("[data-credit] .num-md")?.textContent).toBe("C$ 50.50")
    expect(row.querySelector("[data-payment]")).not.toBeNull()
  })

  it("con el saldo en cero dice Pagada y quita el botón", () => {
    const sale = saleWith(CREDIT)
    const row = mounted(sale)

    sale.balance = "0.00"
    sale.paid_total = "2100.50"
    sale.status = "completed"
    applyCreditToRow(row, sale)

    expect(row.querySelector("[data-credit]")?.textContent).toBe("Pagada")
    expect(row.querySelector("[data-payment]")).toBeNull()
  })
})

// El filtro de crédito es un objeto puro: la página lo compone con
// `readSalesFilters` y lo manda tal cual a la API. Un valor que la API no
// entiende no puede llegar como filtro ni quedar pegado en el enlace «Limpiar».
describe("readSalesCreditFilters", () => {
  it("lee la condición de pago y el filtro de vencidas", () => {
    expect(readSalesCreditFilters("?payment_terms=credit&overdue=true")).toEqual({
      payment_terms: "credit",
      overdue: true,
    })
    expect(readSalesCreditFilters("?payment_terms=immediate")).toEqual({
      payment_terms: "immediate",
      overdue: false,
    })
  })

  it("sin parámetros no filtra nada", () => {
    expect(readSalesCreditFilters("")).toEqual({ payment_terms: "", overdue: false })
  })

  it("descarta valores que la API no entiende", () => {
    expect(readSalesCreditFilters("?payment_terms=fiado&overdue=si")).toEqual({
      payment_terms: "",
      overdue: false,
    })
  })
})
