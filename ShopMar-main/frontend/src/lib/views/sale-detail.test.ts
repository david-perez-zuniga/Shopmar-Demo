import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../core/api"
import { mountSaleDetail } from "./sale-detail"
import { saleResponseDefaults } from "../core/fixtures"
import type { ISalePaymentResponse, ISaleResponse } from "../core/types"

/**
 * La vista de detalle de venta de la SPA (S2).
 *
 * Se monta el markup REAL de `components/views/SaleDetailView.astro` —el que el
 * router clona dentro de `.app-view`— y se mira lo que ve la clienta: mientras la
 * venta viaja, la factura ya tiene su forma (título, datos, renglones y pagos) y
 * no hay texto «Cargando»; cuando la API responde, la venta ocupa ese lugar.
 *
 * D-017: el `id` viaja en la query y la vista lo lee de la URL en cada montaje,
 * así que un `id` ausente es un estado de la pantalla —venta no encontrada— y no
 * un pedido a la API.
 *
 * `InvoicePrint` es un componente de Astro que jsdom no expande: en su lugar se
 * inyectan los ganchos que escribe `renderSaleDetail` (su contrato con el
 * componente real lo prueba `lib/sales/sale-detail.test.ts`).
 */
const mocks = vi.hoisted(() => ({ getById: vi.fn() }))

vi.mock("../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/api")>()
  return {
    ...actual,
    salesApi: { ...actual.salesApi, getById: mocks.getById },
  }
})

const VIEW = resolve("src/components/views/SaleDetailView.astro")
const MODULE = resolve("src/lib/views/sale-detail.ts")

const SALE_ID = "3f9c2b1a-0000-4000-8000-000000000000"
const OTHER_ID = "7d1e4c88-1111-4222-8333-444455556666"
const STAMP = "2026-03-14T15:30:00.000Z"

function payment(overrides: Partial<ISalePaymentResponse> = {}): ISalePaymentResponse {
  return {
    id: "pay-1",
    sale_id: SALE_ID,
    amount: "450.00",
    paid_at: STAMP,
    payment_method: "cash",
    payment_bank: null,
    note: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  }
}

function sale(overrides: Partial<ISaleResponse> = {}): ISaleResponse {
  return {
    ...saleResponseDefaults,
    id: SALE_ID,
    type: "live",
    customer_name: "Ana Pérez",
    product_name: "Camisa",
    category: ["camisas"],
    payment_method: "cash",
    payment_bank: null,
    sale_date: STAMP,
    status: "pending",
    cost: "1000.00",
    shipment_method: "delivery",
    amount_paid: null,
    change_given: null,
    created_at: STAMP,
    updated_at: STAMP,
    additional_items: [],
    additional_count: 0,
    total: "1000.00",
    payments: [payment()],
    payments_count: 1,
    ...overrides,
  }
}

/** Los ganchos que `renderSaleDetail` escribe, con la forma del componente. */
function invoiceMarkup(): string {
  return `
    <div class="invoice">
      <header class="invoice-head">
        <dl class="invoice-id">
          <div class="invoice-id-row"><dt>Venta</dt><dd data-invoice-number></dd></div>
          <div class="invoice-id-row"><dt>Fecha</dt><dd data-invoice-date></dd></div>
        </dl>
      </header>
      <section class="sale-block">
        <dl class="invoice-data">
          <div><dt>Cliente</dt><dd data-invoice-customer></dd></div>
          <div><dt>Mercadería</dt><dd data-invoice-product></dd></div>
          <div><dt>Canal</dt><dd data-invoice-type></dd></div>
          <div><dt>Pago</dt><dd data-invoice-payment></dd></div>
          <div><dt>Condición</dt><dd data-invoice-terms></dd></div>
          <div><dt>Estado</dt><dd data-invoice-status><span class="badge badge--pending">Pendiente</span></dd></div>
        </dl>
        <table class="invoice-table">
          <thead><tr><th>Mercadería</th><th class="num">Importe</th></tr></thead>
          <tbody data-invoice-merchandise-rows></tbody>
        </table>
        <p class="additional-sum" data-invoice-merchandise-extras hidden>
          <span>Suma de mercadería</span>
          <span class="num" data-invoice-merchandise-extras-sum></span>
        </p>
        <section class="additional" data-invoice-additional hidden>
          <h4 class="additional-title">Artículos adicionales</h4>
          <table class="invoice-table">
            <thead><tr><th class="num">Cant.</th><th>Nombre</th><th>Descripción</th><th class="num">Importe</th></tr></thead>
            <tbody data-invoice-additional-rows></tbody>
          </table>
          <p class="additional-sum">
            <span>Suma de artículos</span>
            <span class="num" data-invoice-additional-sum></span>
          </p>
        </section>
        <p class="total-row">
          <span class="total-label">Total</span>
          <span class="total" data-invoice-total></span>
        </p>
        <section class="invoice-credit" data-invoice-credit hidden>
          <dl class="invoice-credit-data">
            <div><dt>Vence</dt><dd data-invoice-due-date></dd></div>
            <div><dt>Pagado</dt><dd data-invoice-paid-total></dd></div>
            <div><dt>Saldo</dt><dd data-invoice-balance></dd></div>
          </dl>
          <p class="invoice-overdue" data-invoice-overdue hidden>Vencida</p>
        </section>
        <section class="invoice-payments" data-invoice-payments>
          <h4 class="additional-title">Pagos</h4>
          <table class="invoice-table" data-invoice-payments-table hidden>
            <thead><tr><th>Fecha</th><th>Método</th><th class="num">Importe</th></tr></thead>
            <tbody data-invoice-payment-rows></tbody>
          </table>
          <p class="invoice-payments-empty" data-invoice-payments-empty></p>
        </section>
      </section>
    </div>`
}

/** El markup de la vista, cortado después del frontmatter, como el router. */
function mountView(): HTMLElement {
  const source = readFileSync(VIEW, "utf8")
  const frontmatterEnd = source.indexOf("---", source.indexOf("---") + 3) + 3
  const root = document.createElement("div")
  root.className = "app-view"
  root.setAttribute("data-view", "sale-detail")
  root.innerHTML = source
    .slice(frontmatterEnd)
    .replace(/<InvoicePrint[^>]*\/>/, invoiceMarkup())
  document.body.append(root)
  return root
}

function hook<T extends Element = HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (element === null) throw new Error(`falta ${selector} en la vista de detalle`)
  return element
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** Deja correr la promesa de la API y el repintado que dispara. */
function flush(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0))
}

let print: ReturnType<typeof vi.fn>

beforeEach(() => {
  window.history.replaceState(null, "", `/sales/detail?id=${SALE_ID}`)
  mocks.getById.mockReset()
  print = vi.fn()
  vi.stubGlobal("print", print)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe("el esqueleto de la factura mientras la venta viaja (S2)", () => {
  it("muestra título, datos, renglones y pagos, y ni un texto «Cargando»", async () => {
    const pending = deferred<ISaleResponse>()
    mocks.getById.mockReturnValue(pending.promise)
    const root = mountView()

    mountSaleDetail(root)

    expect(hook<HTMLElement>(root, "[data-detail-skeleton]").hidden).toBe(false)
    expect(hook<HTMLElement>(root, "[data-detail-content]").hidden).toBe(true)
    expect(hook<HTMLElement>(root, "[data-state-host]").hidden).toBe(true)
    expect(hook(root, "[data-page='sale-detail']").getAttribute("aria-busy")).toBe("true")

    // El pedido sale en el mismo montaje: la URL ya es la de esta venta.
    await flush()

    // Título, importes, renglones y pagos: las cuatro partes de la factura.
    expect(root.querySelectorAll("[data-detail-skeleton] .skeleton").length).toBeGreaterThanOrEqual(4)
    expect(root.querySelector("[data-detail-skeleton] .invoice-skeleton-row")).not.toBeNull()
    expect(root.querySelector("[data-detail-skeleton] .invoice-skeleton-payments")).not.toBeNull()
    expect(root.textContent ?? "").not.toMatch(/Cargando/)
    expect(mocks.getById).toHaveBeenCalledWith(SALE_ID, "fresh")

    pending.resolve(sale())
  })

  it("pinta la venta con su total y sus pagos, y esconde el esqueleto", async () => {
    mocks.getById.mockResolvedValue(sale())
    const root = mountView()

    mountSaleDetail(root)
    await flush()

    expect(hook<HTMLElement>(root, "[data-detail-skeleton]").hidden).toBe(true)
    expect(hook<HTMLElement>(root, "[data-detail-content]").hidden).toBe(false)
    expect(hook(root, "[data-invoice-total]").textContent).toBe("C$ 1,000.00")
    expect(hook(root, "[data-invoice-number]").textContent).toBe("3f9c2b1a")
    expect(hook<HTMLElement>(root, "[data-invoice-payments-table]").hidden).toBe(false)
    expect(hook(root, "[data-invoice-payment-rows]").children).toHaveLength(1)
    expect(hook(root, "[data-invoice-payment-rows]").textContent).toContain("C$ 450.00")
    expect(hook(root, "[data-detail-rows]").textContent).toBe("Renglones: 0")
    expect(hook(root, "[data-detail-created]").textContent).toMatch(/^Creada /)
    expect(hook(root, "[data-page='sale-detail']").getAttribute("aria-busy")).toBe("false")
    expect(document.title).toBe("Venta 3f9c2b1a · ShopMar")
  })

  it("una venta sin pagos lo dice con palabras, no con una tabla vacía", async () => {
    mocks.getById.mockResolvedValue(sale({ payments: [], payments_count: 0 }))
    const root = mountView()

    mountSaleDetail(root)
    await flush()

    expect(hook<HTMLElement>(root, "[data-invoice-payments-table]").hidden).toBe(true)
    expect(hook<HTMLElement>(root, "[data-invoice-payments-empty]").hidden).toBe(false)
  })
})

describe("el id de la URL (D-017)", () => {
  it("sin id es un estado de la pantalla: venta no encontrada y ningún pedido", async () => {
    window.history.replaceState(null, "", "/sales/detail/")
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const root = mountView()

    mountSaleDetail(root)
    await flush()

    expect(mocks.getById).not.toHaveBeenCalled()
    expect(hook(root, "[data-state-host]").textContent).toContain("No encontramos esa venta")
    expect(hook<HTMLElement>(root, "[data-detail-skeleton]").hidden).toBe(true)
    expect(hook<HTMLElement>(root, "[data-detail-content]").hidden).toBe(true)
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it("lo lee en cada montaje, no una sola vez por documento", async () => {
    mocks.getById.mockResolvedValue(sale())

    const first = mountView()
    mountSaleDetail(first)
    await flush()
    first.remove()

    window.history.replaceState(null, "", `/sales/detail?id=${OTHER_ID}`)
    const second = mountView()
    mountSaleDetail(second)
    await flush()

    expect(mocks.getById.mock.calls.map((call) => call[0])).toEqual([SALE_ID, OTHER_ID])
  })

  it("una venta que ya no existe muestra el estado vacío con el mensaje de la API", async () => {
    mocks.getById.mockRejectedValue(new ApiError("NOT_FOUND", 404, "Venta no encontrada"))
    const root = mountView()

    mountSaleDetail(root)
    await flush()

    // Un 404 no es un error de la pantalla: es «esa venta no está», con el
    // mensaje amable que ya traduce la app.
    expect(hook(root, "[data-state-host]").textContent).toContain("Lo que buscás no existe")
    expect(hook<HTMLElement>(root, "[data-detail-skeleton]").hidden).toBe(true)
    expect(hook<HTMLElement>(root, "[data-detail-content]").hidden).toBe(true)
  })

  it("un error de red se puede reintentar sin recargar el documento", async () => {
    mocks.getById.mockRejectedValueOnce(new ApiError("NETWORK_ERROR", 0))
    mocks.getById.mockResolvedValueOnce(sale())
    const root = mountView()

    mountSaleDetail(root)
    await flush()

    expect(hook(root, "[data-state-host]").textContent).toContain("No se pudo conectar con el servidor")
    const retry = root.querySelector<HTMLButtonElement>("[data-state-host] button")
    if (retry === null) throw new Error("el estado de error no ofrece reintentar")
    retry.click()
    await flush()

    expect(mocks.getById).toHaveBeenCalledTimes(2)
    expect(hook(root, "[data-invoice-total]").textContent).toBe("C$ 1,000.00")
  })
})

describe("impresión de la factura", () => {
  it("el botón Imprimir imprime la factura pintada", async () => {
    mocks.getById.mockResolvedValue(sale())
    const root = mountView()
    mountSaleDetail(root)
    await flush()

    hook<HTMLButtonElement>(root, "[data-print]").click()

    expect(print).toHaveBeenCalledTimes(1)
  })

  it("?print=1 imprime recién cuando la venta está en pantalla, nunca el esqueleto", async () => {
    window.history.replaceState(null, "", `/sales/detail?id=${SALE_ID}&print=1`)
    const pending = deferred<ISaleResponse>()
    mocks.getById.mockReturnValue(pending.promise)
    const root = mountView()

    mountSaleDetail(root)
    expect(print).not.toHaveBeenCalled()

    let totalAtPrint = ""
    print.mockImplementation(() => {
      totalAtPrint = hook(root, "[data-invoice-total]").textContent ?? ""
    })
    pending.resolve(sale())
    await flush()

    expect(print).toHaveBeenCalledTimes(1)
    expect(totalAtPrint).toBe("C$ 1,000.00")
  })

  it("sin print=1 no imprime sola", async () => {
    mocks.getById.mockResolvedValue(sale())
    const root = mountView()

    mountSaleDetail(root)
    await flush()

    expect(print).not.toHaveBeenCalled()
  })
})

describe("navegación de la vista", () => {
  it("volver al listado es una navegación de la SPA, no una recarga", () => {
    const source = readFileSync(MODULE, "utf8")

    expect(source).toMatch(/import \{ navigateTo \} from "\.\.\/app\/start"/)
    expect(source).toMatch(/navigateTo\(/)
    expect(source).not.toMatch(/window\.location\.assign/)
    expect(source).not.toMatch(/addEventListener\("popstate"/)
    expect(source).not.toMatch(/removeEventListener\("popstate"/)
    // El ciclo de la SPA lo maneja el router: nada de `onPageLoad` acá.
    expect(source).not.toMatch(/onPageLoad/)
  })

  it("el enlace de regreso sigue apuntando a /sales, con una «a» de verdad", () => {
    const root = mountView()

    const back = hook<HTMLAnchorElement>(root, "[data-back]")

    expect(back.getAttribute("href")).toBe("/sales")
    expect(back.textContent).toContain("Regresar")
  })

  it("la pantalla se limpia cuando el router desmonta la vista", async () => {
    const pending = deferred<ISaleResponse>()
    mocks.getById.mockReturnValue(pending.promise)
    const root = mountView()

    const cleanup = mountSaleDetail(root)
    cleanup?.()
    pending.resolve(sale())
    await flush()

    // La respuesta tardía no puede pintar sobre la vista que ya no está.
    expect(hook(root, "[data-detail-content]").hidden).toBe(true)
  })
})
