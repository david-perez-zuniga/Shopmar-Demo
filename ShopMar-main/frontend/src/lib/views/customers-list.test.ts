import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mountCustomers } from "./customers-list"
import type { ICustomerWithBalances, ISaleListRow } from "../core/types"
import { saleListRowDefaults } from "../core/fixtures"

/**
 * La vista de clientes de la SPA (S2).
 *
 * Se monta el markup REAL de `components/views/CustomersView.astro` —el que el
 * router clona dentro de `.app-view`— y se mira lo que ve la clienta: mientras
 * la API no responde, la tabla tiene ocho filas de esqueleto, sin texto
 * «Cargando…»; cuando responde, las filas y los saldos ocupan su lugar.
 *
 * La pantalla trae el alta y la edición en el mismo formulario, así que la
 * prueba recorre el alta completa: abrir el diálogo, escribir el nombre, guardar
 * y ver el diálogo cerrado con la lista pedida de nuevo. La búsqueda mueve la
 * URL sin pedir el documento.
 *
 * jsdom no implementa `HTMLDialogElement.showModal`, así que se reemplaza por el
 * mismo efecto que tiene en el navegador: marcar el diálogo como abierto. El
 * `close` sí existe y es el que usa la vista.
 */
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  salesList: vi.fn(),
}))

vi.mock("../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/api")>()
  return {
    ...actual,
    customersApi: {
      ...actual.customersApi,
      list: mocks.list,
      create: mocks.create,
      update: mocks.update,
      remove: mocks.remove,
    },
    salesApi: { ...actual.salesApi, list: mocks.salesList },
  }
})

const VIEW = resolve("src/components/views/CustomersView.astro")
const MODULE = resolve("src/lib/views/customers-list.ts")

function customer(overrides: Partial<ICustomerWithBalances> = {}): ICustomerWithBalances {
  return {
    id: "c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42",
    name: "María González",
    phone: "8888 1234",
    note: null,
    created_at: "2026-09-28T15:12:44.318Z",
    updated_at: "2026-09-28T15:12:44.318Z",
    outstanding_balance: "1600.50",
    overdue_balance: "0.00",
    ...overrides,
  }
}

function sale(overrides: Partial<ISaleListRow> = {}): ISaleListRow {
  return {
    id: "sale-1",
    sale_date: "2025-03-14",
    customer_name: "María González",
    product_name: "Collar de plata",
    type: "live",
    status: "pending",
    cost: "100.00",
    payment_method: "cash",
    shipment_method: "pickup",
    additional_count: 0,
    total: "600.00",
    ...saleListRowDefaults,
    ...overrides,
  }
}

/** El markup de la vista, cortado después del frontmatter, como el router. */
function mountView(): HTMLElement {
  const source = readFileSync(VIEW, "utf8")
  const frontmatterEnd = source.indexOf("---", source.indexOf("---") + 3) + 3
  const root = document.createElement("div")
  root.className = "app-view"
  root.setAttribute("data-view", "customers")
  root.innerHTML = source.slice(frontmatterEnd)
  document.body.append(root)
  return root
}

function body(root: HTMLElement): HTMLElement {
  const tbody = root.querySelector<HTMLElement>("[data-rows]")
  if (tbody === null) throw new Error("la vista no trae [data-rows]")
  return tbody
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

beforeEach(() => {
  window.history.replaceState(null, "", "/customers")
  mocks.list.mockReset()
  mocks.create.mockReset()
  mocks.update.mockReset()
  mocks.remove.mockReset()
  mocks.salesList.mockReset()
  mocks.salesList.mockResolvedValue({ sales: [sale()] })
  // jsdom no trae `showModal` ni `close`: se reemplazan por su efecto
  // observable, que es el que la vista consulta (`open` y `returnValue`).
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "")
  }
  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
    value?: string,
  ) {
    this.removeAttribute("open")
    if (value !== undefined) this.returnValue = value
  }
})

afterEach(() => {
  document.body.innerHTML = ""
})

describe("vista de clientes: esqueleto y datos (S2)", () => {
  it("mientras carga pinta ocho filas de esqueleto y no hay texto de espera", async () => {
    const pending = deferred<{ customers: ICustomerWithBalances[] }>()
    mocks.list.mockReturnValue(pending.promise)
    const root = mountView()

    mountCustomers(root)

    expect(body(root).querySelectorAll("tr[data-skeleton-row]")).toHaveLength(8)
    expect(root.textContent).not.toContain("Cargando")
    // La tabla se ve ocupada mientras espera, igual que en los otros listados.
    expect(root.querySelector("[data-table]")?.getAttribute("aria-busy")).toBe("true")

    pending.resolve({ customers: [customer()] })
    await flush()
  })

  it("con los datos pinta las filas y los saldos y no queda ningún esqueleto", async () => {
    mocks.list.mockResolvedValue({ customers: [customer()] })
    const root = mountView()

    mountCustomers(root)
    await flush()

    expect(body(root).querySelectorAll("tr[data-skeleton-row]")).toHaveLength(0)
    expect(body(root).querySelectorAll("tr[data-customer-id]")).toHaveLength(1)
    expect(body(root).textContent).toContain("María González")
    expect(body(root).textContent).toContain("C$ 1,600.50")
    expect(root.querySelectorAll(".skeleton")).toHaveLength(0)
    expect(root.querySelector("[data-table]")?.getAttribute("aria-busy")).toBe("false")
  })

  it("sin resultados pinta el estado vacío con el alta a mano", async () => {
    mocks.list.mockResolvedValue({ customers: [] })
    const root = mountView()

    mountCustomers(root)
    await flush()

    expect(root.querySelector("[data-state-text]")?.textContent).toBe("No hay clientes registrados")
    expect(root.querySelector<HTMLElement>("[data-state-action]")?.hidden).toBe(false)
    expect(body(root).querySelectorAll("tr[data-skeleton-row]")).toHaveLength(0)
  })

  it("un error de la API se ve en la fila de estado", async () => {
    mocks.list.mockRejectedValue(new Error("sin red"))
    const root = mountView()

    mountCustomers(root)
    await flush()

    expect(root.querySelector("[data-state-text]")?.textContent).toBe("sin red")
  })
})

describe("vista de clientes: alta y edición en la misma pantalla (S2)", () => {
  it("el alta guarda contra la API y cierra el diálogo", async () => {
    mocks.list.mockResolvedValue({ customers: [customer()] })
    mocks.create.mockResolvedValue(customer({ id: "nuevo" }))
    const root = mountView()

    mountCustomers(root)
    await flush()

    root.querySelector<HTMLButtonElement>("[data-new-customer]")?.click()
    const dialog = root.querySelector<HTMLDialogElement>("[data-customer-dialog]")
    expect(dialog?.open).toBe(true)
    expect(root.querySelector("[data-dialog-title]")?.textContent).toBe("Nuevo cliente")

    const form = root.querySelector<HTMLFormElement>("[data-customer-form]")
    if (form === null) throw new Error("la vista no trae el formulario")
    const name = form.querySelector<HTMLInputElement>('[name="name"]')
    if (name === null) throw new Error("el formulario no trae el campo del nombre")
    name.value = "Ana Pérez"
    form.requestSubmit()
    await flush()

    expect(mocks.create).toHaveBeenCalledWith({ name: "Ana Pérez", phone: null, note: null })
    // El diálogo se cierra al guardar y la lista se vuelve a pedir.
    expect(dialog?.open).toBe(false)
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })

  it("el nombre vacío no viaja al servidor: el error se pinta junto al campo", async () => {
    mocks.list.mockResolvedValue({ customers: [customer()] })
    const root = mountView()

    mountCustomers(root)
    await flush()

    root.querySelector<HTMLButtonElement>("[data-new-customer]")?.click()
    const form = root.querySelector<HTMLFormElement>("[data-customer-form]")
    if (form === null) throw new Error("la vista no trae el formulario")
    form.requestSubmit()
    await flush()

    expect(mocks.create).not.toHaveBeenCalled()
    expect(form.querySelector('[data-error="name"]')?.textContent).toBe("Ingresá el nombre del cliente")
    expect(root.querySelector<HTMLDialogElement>("[data-customer-dialog]")?.open).toBe(true)
  })

  it("la fila abre la edición con los datos del cliente y guarda los cambios", async () => {
    mocks.list.mockResolvedValue({ customers: [customer()] })
    mocks.update.mockResolvedValue(customer())
    const root = mountView()

    mountCustomers(root)
    await flush()

    const edit = root.querySelector<HTMLButtonElement>('[data-action="edit"]')
    edit?.click()

    const form = root.querySelector<HTMLFormElement>("[data-customer-form]")
    if (form === null) throw new Error("la vista no trae el formulario")
    expect(root.querySelector("[data-dialog-title]")?.textContent).toBe("Editar cliente")
    const phone = form.querySelector<HTMLInputElement>('[name="phone"]')
    expect(phone?.value).toBe("8888 1234")

    if (phone !== null) phone.value = "7777 0000"
    form.requestSubmit()
    await flush()

    expect(mocks.update).toHaveBeenCalledWith("c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42", {
      name: "María González",
      phone: "7777 0000",
      note: null,
    })
    expect(root.querySelector<HTMLDialogElement>("[data-customer-dialog]")?.open).toBe(false)
  })
})

describe("vista de clientes: lo que ya hacía la pantalla sigue funcionando", () => {
  /**
   * El `ConfirmDialog.astro` real no lo expande jsdom (es un componente de
   * build), así que se inyecta su diálogo con el mismo marcado que consulta la
   * vista. El `close` de jsdom no emite el evento `close`, que es el que resuelve
   * la pregunta en el navegador: se emite a mano después de escribirlo.
   */
  function withConfirmDialog(root: HTMLElement): HTMLDialogElement {
    root.insertAdjacentHTML(
      "beforeend",
      '<dialog class="confirm-dialog"><p id="confirm-message"></p>' +
        '<button type="button" value="cancel">Cancelar</button>' +
        '<button type="submit" value="confirm">Borrar</button></dialog>',
    )
    const dialog = root.querySelector<HTMLDialogElement>("dialog.confirm-dialog")
    if (dialog === null) throw new Error("no se pudo montar el diálogo de confirmación")
    return dialog
  }

  it("el historial del cliente abre sus compras y deja el id en la URL", async () => {
    mocks.list.mockResolvedValue({ customers: [customer()] })
    const root = mountView()

    mountCustomers(root)
    await flush()

    root.querySelector<HTMLButtonElement>('[data-action="details"]')?.click()
    await flush()

    const id = "c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42"
    expect(new URLSearchParams(window.location.search).get("customer")).toBe(id)
    expect(mocks.salesList).toHaveBeenCalledWith({ customer_id: id })
    expect(root.querySelector("[data-detail-name]")?.textContent).toBe("María González")
    expect(root.querySelector("[data-detail-sales]")?.textContent).toContain("Collar de plata")
  })

  it("un enlace compartido con ?customer= abre el detalle al cargar", async () => {
    window.history.replaceState(null, "", "/customers?customer=c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42")
    mocks.list.mockResolvedValue({ customers: [customer()] })
    const root = mountView()

    mountCustomers(root)
    await flush()

    expect(root.querySelector<HTMLDialogElement>("[data-customer-detail-dialog]")?.open).toBe(true)
    expect(root.querySelector("[data-detail-name]")?.textContent).toBe("María González")
  })

  it("el borrado pregunta antes y no borra si se cancela", async () => {
    mocks.list.mockResolvedValue({ customers: [customer()] })
    const root = mountView()
    const dialog = withConfirmDialog(root)

    mountCustomers(root)
    await flush()

    root.querySelector<HTMLButtonElement>('[data-action="delete"]')?.click()
    await flush()

    expect(dialog.open).toBe(true)
    expect(dialog.querySelector("#confirm-message")?.textContent).toContain("María González")

    dialog.querySelector<HTMLButtonElement>('button[value="cancel"]')?.click()
    await flush()

    expect(dialog.open).toBe(false)
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(root.querySelectorAll("tr[data-customer-id]")).toHaveLength(1)
  })

  it("confirmar el borrado llama a la API y quita la fila", async () => {
    mocks.list.mockResolvedValue({ customers: [customer()] })
    mocks.remove.mockResolvedValue({ message: "ok" })
    const root = mountView()
    const dialog = withConfirmDialog(root)

    mountCustomers(root)
    await flush()

    root.querySelector<HTMLButtonElement>('[data-action="delete"]')?.click()
    await flush()

    dialog.close("confirm")
    dialog.dispatchEvent(new Event("close"))
    await flush()

    expect(mocks.remove).toHaveBeenCalledWith("c47a0e93-2b81-4f60-8d35-1a9e6c0b7f42")
    expect(root.querySelectorAll("tr[data-customer-id]")).toHaveLength(0)
  })
})

describe("vista de clientes: navegación sin recargar el documento (S2)", () => {
  it("buscar mueve la URL y vuelve a pedir la lista con el término", async () => {
    mocks.list.mockResolvedValue({ customers: [customer()] })
    const root = mountView()

    mountCustomers(root)
    await flush()

    const form = root.querySelector<HTMLFormElement>("[data-search-form]")
    const input = root.querySelector<HTMLInputElement>("#customer-search")
    if (form === null || input === null) throw new Error("la vista no trae el buscador")
    input.value = " ana "
    form.requestSubmit()
    await flush()

    expect(window.location.pathname).toBe("/customers")
    expect(new URLSearchParams(window.location.search).get("q")).toBe("ana")
    expect(mocks.list).toHaveBeenCalledTimes(2)
    expect(mocks.list.mock.calls[1]?.[0]).toMatchObject({ q: "ana", include_balances: true })
  })

  it("el módulo navega con el primitivo del router y no atiende el popstate", () => {
    const source = readFileSync(MODULE, "utf8")

    // Dos primitivos del router, uno por intención: `pushQuery` para el envío del
    // buscador (entrada nueva en el historial) y `replaceQuery` para el rebote de
    // la escritura y el abrir/cerrar del diálogo, que reescriben la entrada actual
    // sin apilar una por letra (S58).
    expect(source).toMatch(/import \{ pushQuery, replaceQuery \} from "\.\.\/app\/start"/)
    expect(source).toMatch(/pushQuery\(hrefWithState\(\)\)/)
    expect(source).toMatch(/replaceQuery\(hrefWithState\(\)\)/)
    expect(source).not.toMatch(/window\.location\.assign/)
    expect(source).not.toMatch(/window\.history\.replaceState/)
    expect(source).not.toMatch(/addEventListener\("popstate"/)
  })
})
