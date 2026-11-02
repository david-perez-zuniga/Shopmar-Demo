/**
 * La vista de clientes de la SPA (S2).
 *
 * Es el mismo script de la pantalla de siempre con tres cambios: el ciclo lo
 * maneja el router (`mount` devuelve la limpieza), toda consulta al DOM se hace
 * contra la raíz de la vista y la búsqueda mueve la URL sin pedir el documento.
 *
 * La pantalla trae las cuatro piezas juntas —listado, buscador, alta/edición y
 * los dos diálogos de detalle y borrado— y todas viven en la misma plantilla, así
 * que el alta y la edición siguen funcionando igual y el diálogo se cierra al
 * guardar. Mientras la lista espera, la tabla muestra esqueletos (S2); los datos
 * se piden en cada montaje, así que nunca se ven saldos viejos (S3).
 */

import { pushQuery, replaceQuery } from "../app/start"
import { askConfirmWith } from "../core/confirm-dialog"
import { on, qs as querySelector, setText } from "../core/dom"
import { customersApi, salesApi } from "../core/api"
import { getErrorMessage } from "../core/errors"
import type { ICustomerWithBalances } from "../core/types"
import { customerRowView } from "../customers/customer-list"
import {
  CUSTOMER_PURCHASES_EMPTY,
  customerDetailView,
  customerIdFromSearch,
  customerPurchaseHistory,
  type ICustomerPurchaseRow,
} from "../customers/customer-detail"
import { validateCustomerForm } from "../customers/customer-form"
import { customerDeleteErrorMessage, customerFormErrorView } from "../customers/customer-errors"
import { customersQuery } from "../customers/customer-query"
import { rowClickOpensEdit } from "../customers/customer-row-click"
import { createListStatePainter } from "../lists/list-state"

/** Lo que el buscador espera antes de pedir la lista mientras se escribe. */
const SEARCH_DEBOUNCE_MS = 300

export function mountCustomers(root: HTMLElement): () => void {
  /** El `qs` de la vista: resuelve contra la raíz, nunca contra el documento. */
  const qs = <T extends Element>(sel: string) => querySelector<T>(sel, root)

  const tbody = qs<HTMLTableSectionElement>("[data-rows]")
  const table = qs<HTMLTableElement>("[data-table]")
  const ledger = qs<HTMLElement>(".ledger")
  const alertBox = qs<HTMLElement>("[data-alert]")
  const searchForm = qs<HTMLFormElement>("[data-search-form]")
  const searchInput = qs<HTMLInputElement>("#customer-search")
  const newButton = qs<HTMLButtonElement>("[data-new-customer]")
  const stateTemplate = qs<HTMLTemplateElement>("[data-state-template]")
  const skeletonTemplate = qs<HTMLTemplateElement>("[data-skeleton-template]")

  const dialog = qs<HTMLDialogElement>("[data-customer-dialog]")
  const form = qs<HTMLFormElement>("[data-customer-form]")
  const dialogTitle = qs<HTMLElement>("[data-dialog-title]")
  const submitButton = qs<HTMLButtonElement>("[data-submit]")
  const submitLabel = qs<HTMLElement>("[data-submit-label]")
  const cancelButton = qs<HTMLButtonElement>("[data-dialog-cancel]")
  const banner = qs<HTMLElement>("[data-form-banner]")

  // Diálogo de detalles (S19): el que abre el nombre de la tabla y el
  // `?customer=<uuid>` de la URL.
  const detailsDialog = qs<HTMLDialogElement>("[data-customer-detail-dialog]")
  const detailName = qs<HTMLElement>("[data-detail-name]")
  const detailPhone = qs<HTMLElement>("[data-detail-phone]")
  const detailNote = qs<HTMLElement>("[data-detail-note]")
  const detailOutstanding = qs<HTMLElement>("[data-detail-outstanding]")
  const detailOverdue = qs<HTMLElement>("[data-detail-overdue]")
  const detailSales = qs<HTMLElement>("[data-detail-sales]")
  const detailSalesState = qs<HTMLElement>("[data-detail-sales-state]")
  const detailSummary = qs<HTMLElement>("[data-detail-summary]")
  const detailEdit = qs<HTMLButtonElement>("[data-detail-edit]")

  // El cliente en edición: `null` es alta.
  let editingId: string | null = null
  let loaded: ICustomerWithBalances[] = []
  let loadToken = 0
  let searchTimer: number | undefined

  // El cliente abierto en el diálogo de detalles. Vive acá porque la URL se
  // deriva de él: abrir y cerrar mueve `?customer=`.
  let detailCustomer: ICustomerWithBalances | null = null
  let detailToken = 0
  // Un `?customer=` de la URL se abre una sola vez, cuando llega la lista.
  let pendingCustomerId: string | null = customerIdFromSearch(window.location.search)

  // El esqueleto de carga (S2) y la fila de estado viven en el tbody, igual que
  // en ventas, paquetes y gastos (S56): el encabezado de la tabla no desaparece.
  // El vacío sigue ofreciendo «Nuevo cliente», que acá abre el diálogo de alta en
  // vez de navegar; por eso la acción es un botón y la engancha la delegación.
  const paintState = createListStatePainter({
    template: stateTemplate,
    tbody,
    ledger,
    loadingText: "Cargando clientes…",
    emptyText: "No hay clientes registrados",
    emptyAction: { className: "state-action", href: "/customers", text: "Nuevo cliente" },
    retryClassName: "state-action",
    onRetry: () => void load(),
    skeleton: { template: skeletonTemplate, rows: 8 },
  })

  function emptyMessage(): string {
    return searchInput === null || searchInput.value.trim() === ""
      ? "No hay clientes registrados"
      : "No hay clientes que coincidan con la búsqueda"
  }

  function markBusy(busy: boolean): void {
    table?.setAttribute("aria-busy", busy ? "true" : "false")
  }

  function showAlert(message: string): void {
    setText(alertBox, message)
    alertBox.hidden = false
  }

  function hideAlert(): void {
    alertBox.hidden = true
    setText(alertBox, "")
  }

  function cell(classes: string, text: string): HTMLTableCellElement {
    const td = document.createElement("td")
    td.className = classes
    td.textContent = text
    return td
  }

  function actionButton(
    label: string,
    action: "edit" | "delete" | "details",
    customer: ICustomerWithBalances,
  ): HTMLButtonElement {
    const button = document.createElement("button")
    button.type = "button"
    button.className = `row-action row-action--${action}`
    button.dataset.action = action
    button.textContent = label
    button.setAttribute("aria-label", `${label} a ${customer.name}`)
    return button
  }

  function buildRow(customer: ICustomerWithBalances): HTMLTableRowElement {
    const view = customerRowView(customer)

    const tr = document.createElement("tr")
    tr.className = view.rowClass
    tr.dataset.customerId = view.customerId

    // La fila entera abre la edición (es lo que la dueña hace todo el tiempo);
    // el historial queda en su botón, que es también el camino de teclado y de
    // lector de pantalla. La fila no se vuelve un botón: cambiarle el rol
    // rompería la semántica de la tabla.
    const nameCell = document.createElement("td")
    nameCell.className = view.name.classes
    nameCell.textContent = view.name.text

    const actions = document.createElement("td")
    actions.className = "col-actions row-actions"
    actions.append(
      actionButton("Historial", "details", customer),
      actionButton("Editar", "edit", customer),
      actionButton("Borrar", "delete", customer),
    )

    tr.append(
      nameCell,
      cell(view.phone.classes, view.phone.text),
      cell(view.outstanding.classes, view.outstanding.text),
      cell(view.overdue.classes, view.overdue.text),
      actions,
    )
    return tr
  }

  function paintRows(customers: readonly ICustomerWithBalances[]): void {
    markBusy(false)
    tbody?.replaceChildren(...customers.map(buildRow))
  }

  /**
   * La URL que refleja el estado de la pantalla: la búsqueda y, si hay uno
   * abierto, el cliente del diálogo de detalles. Una sola función para las dos
   * formas de moverla (entrar al historial al buscar y corregir en silencio al
   * abrir o cerrar el detalle), así no se contradicen.
   */
  function hrefWithState(): string {
    const url = new URL(window.location.href)
    const q = searchInput?.value.trim() ?? ""
    if (q === "") url.searchParams.delete("q")
    else url.searchParams.set("q", q)
    // El diálogo de detalles también vive en la URL: así el enlace que llega
    // desde el recibo se puede copiar tal cual.
    if (detailCustomer === null) url.searchParams.delete("customer")
    else url.searchParams.set("customer", detailCustomer.id)
    return `${url.pathname}${url.search}${url.hash}`
  }

  /** Abrir y cerrar detalles no es una navegación: reescribe la entrada actual. */
  function syncUrl(): void {
    // Por el router y no por `window.history` directo: el buscador reescribe la
    // entrada actual (no apila un paso por letra) y aun así su valor queda en el
    // recuerdo de la pantalla, que es lo que se recupera al volver (S58).
    replaceQuery(hrefWithState())
  }

  /**
   * Una fila del historial de compras (S22): fecha, mercadería, condición,
   * estado, total y —sólo en una venta a crédito— el saldo con su marca de
   * vencida. La fila entera es el enlace al detalle de esa venta.
   */
  function purchaseRow(row: ICustomerPurchaseRow): HTMLLIElement {
    const li = document.createElement("li")
    li.className = "customer-sale"

    const link = document.createElement("a")
    link.className = "customer-sale-link"
    link.href = row.href
    link.setAttribute("data-astro-prefetch", "")

    const main = document.createElement("span")
    main.className = "customer-sale-main"

    const product = document.createElement("span")
    product.className = "customer-sale-product"
    product.textContent = row.product

    const meta = document.createElement("span")
    meta.className = "customer-sale-meta"

    const date = document.createElement("span")
    date.className = "customer-sale-date"
    date.textContent = row.date

    const terms = document.createElement("span")
    terms.className = "customer-sale-tag"
    terms.textContent = row.terms

    const status = document.createElement("span")
    status.className = "customer-sale-tag"
    status.textContent = row.status

    meta.append(date, terms, status)
    main.append(product, meta)

    const amounts = document.createElement("span")
    amounts.className = "customer-sale-amounts"

    const total = document.createElement("span")
    total.className = "customer-sale-money"
    total.textContent = row.total
    amounts.append(total)

    // El saldo sólo existe en una venta a crédito: en contado la venta ya se
    // cobró y no hay nada por mostrar.
    if (row.balance !== null) {
      const balance = document.createElement("span")
      balance.className = "customer-sale-balance"
      setText(balance, `Saldo ${row.balance}`)
      amounts.append(balance)
    }

    if (row.overdue) {
      const overdue = document.createElement("span")
      overdue.className = "customer-sale-overdue"
      setText(overdue, "Vencida")
      amounts.append(overdue)
    }

    link.append(main, amounts)
    li.append(link)
    return li
  }

  /**
   * Pinta el estado del pedido de ventas dentro del diálogo. Es una sola línea
   * de texto: cargando, vacío o el error tal como lo devolvió la API.
   */
  function paintPurchasesState(
    state: "loading" | "ready" | "empty" | "error",
    message = "",
  ): void {
    detailSales.hidden = state !== "ready"
    const text =
      state === "loading"
        ? "Cargando…"
        : state === "empty"
          ? message
          : state === "error"
            ? message
            : ""
    setText(detailSalesState, text)
    detailSalesState.hidden = text === ""
    detailSalesState.classList.toggle("customer-detail-sales-state--error", state === "error")
  }

  /**
   * Pide las ventas del cliente y llena el historial completo (S22): contado y
   * crédito, sin filtrar. El token descarta la respuesta de un cliente anterior
   * si la dueña cambia de cliente antes de que llegue el pedido.
   */
  async function loadCustomerPurchases(customerId: string): Promise<void> {
    const token = ++detailToken
    paintPurchasesState("loading")
    detailSummary.hidden = true
    setText(detailSummary, "")

    try {
      const { sales } = await salesApi.list({ customer_id: customerId })
      if (token !== detailToken) return

      const history = customerPurchaseHistory(sales)
      if (history.count === 0) {
        detailSales.replaceChildren()
        paintPurchasesState("empty", CUSTOMER_PURCHASES_EMPTY)
        return
      }

      setText(detailSummary, history.summary)
      detailSummary.hidden = false
      detailSales.replaceChildren(...history.rows.map(purchaseRow))
      paintPurchasesState("ready")
    } catch (error) {
      if (token !== detailToken) return
      detailSales.replaceChildren()
      paintPurchasesState("error", getErrorMessage(error))
    }
  }

  /** Abre los detalles de un cliente, con su URL y su historial de compras. */
  async function openDetails(customer: ICustomerWithBalances): Promise<void> {
    const view = customerDetailView(customer)

    detailCustomer = customer
    setText(detailName, view.name)
    setText(detailPhone, view.phone)
    setText(detailNote, view.note)
    setText(detailOutstanding, view.outstanding)
    setText(detailOverdue, view.overdue)
    detailOverdue.classList.toggle("cell-overdue", view.overdueAlert)

    syncUrl()
    if (!detailsDialog.open) detailsDialog.showModal()
    await loadCustomerPurchases(customer.id)
  }

  /** Cierra el diálogo de detalles y saca `?customer=` de la URL. */
  function closeDetails(): void {
    detailCustomer = null
    detailToken++
    if (detailsDialog.open) detailsDialog.close()
    syncUrl()
  }

  async function load(): Promise<void> {
    const token = ++loadToken
    hideAlert()
    paintState("loading")
    markBusy(true)

    try {
      const { customers } = await customersApi.list(customersQuery(searchInput?.value ?? ""))
      if (token !== loadToken) return

      loaded = customers
      if (customers.length === 0) {
        paintState("empty", emptyMessage())
        markBusy(false)
        return
      }
      paintRows(customers)
      paintState("ready")

      // Un `?customer=` compartido se abre recién ahora, con la lista ya
      // cargada. Si el id no existe —un cliente borrado, un enlace viejo— se
      // dice en voz baja en el aviso de la página: nunca un error de consola ni
      // una pantalla caída.
      if (pendingCustomerId !== null) {
        const id = pendingCustomerId
        pendingCustomerId = null
        const customer = customers.find((item) => item.id === id)
        if (customer === undefined) {
          showAlert("No encontramos ese cliente. Puede haber sido borrado o el enlace está mal.")
        } else {
          void openDetails(customer)
        }
      }
    } catch (error) {
      if (token !== loadToken) return
      loaded = []
      paintState("error", getErrorMessage(error))
      markBusy(false)
    }
  }

  function clearFieldErrors(): void {
    banner.hidden = true
    setText(banner, "")
    for (const error of form.querySelectorAll<HTMLElement>("[data-error]")) {
      error.hidden = true
      setText(error, "")
    }
    for (const wrapped of form.querySelectorAll<HTMLElement>(".field-error")) {
      wrapped.classList.remove("field-error")
    }
    for (const invalid of form.querySelectorAll<HTMLElement>("[aria-invalid]")) {
      invalid.removeAttribute("aria-invalid")
    }
  }

  function paintFieldError(key: string, message: string): boolean {
    const input = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${key}"]`)
    const error = form.querySelector<HTMLElement>(`[data-error="${key}"]`)
    if (input === null || error === null) return false

    input.closest<HTMLElement>(".field")?.classList.add("field-error")
    input.setAttribute("aria-invalid", "true")
    setText(error, message)
    error.hidden = false
    return true
  }

  function openDialog(customer: ICustomerWithBalances | null): void {
    editingId = customer?.id ?? null

    clearFieldErrors()
    form.reset()

    const nameInput = form.querySelector<HTMLInputElement>('[name="name"]')
    const phoneInput = form.querySelector<HTMLInputElement>('[name="phone"]')
    const noteInput = form.querySelector<HTMLTextAreaElement>('[name="note"]')
    if (nameInput !== null) nameInput.value = customer?.name ?? ""
    if (phoneInput !== null) phoneInput.value = customer?.phone ?? ""
    if (noteInput !== null) noteInput.value = customer?.note ?? ""

    setText(dialogTitle, customer === null ? "Nuevo cliente" : "Editar cliente")
    setText(submitLabel, customer === null ? "Guardar cliente" : "Guardar cambios")

    dialog.showModal()
    nameInput?.focus()
  }

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault()
    clearFieldErrors()

    const read = (name: string): string =>
      form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value ?? ""

    const result = validateCustomerForm({
      name: read("name"),
      phone: read("phone"),
      note: read("note"),
    })

    if (!result.valid || result.payload === null) {
      for (const [key, message] of Object.entries(result.errors)) {
        paintFieldError(key, message)
      }
      form.querySelector<HTMLInputElement | HTMLTextAreaElement>("[aria-invalid]")?.focus()
      return
    }

    submitButton.disabled = true
    try {
      if (editingId === null) await customersApi.create(result.payload)
      else await customersApi.update(editingId, result.payload)
    } catch (error) {
      const view = customerFormErrorView(error)
      for (const [key, message] of Object.entries(view.fields)) {
        paintFieldError(key, message)
      }
      setText(banner, view.banner)
      banner.hidden = false
      return
    } finally {
      submitButton.disabled = false
    }

    // Al guardar, el diálogo se cierra y la lista se vuelve a pedir: el alta y la
    // edición se ven en la tabla sin recargar el documento.
    dialog.close()
    await load()
  }


  /**
   * Pregunta antes de borrar con el `ConfirmDialog` de la pantalla. El mensaje
   * se escribe en el momento porque el componente es uno solo para cualquier
   * cliente. Sin diálogo disponible, la respuesta es «no»: nunca se borra sin
   * preguntar.
   */
  async function confirmDelete(customer: ICustomerWithBalances): Promise<boolean> {
    const answer = askConfirmWith(
      root,
      `Se va a borrar a ${customer.name}. Esta acción no se puede deshacer.`,
    )
    if (answer === null) return false
    return answer
  }

  async function deleteCustomer(customer: ICustomerWithBalances): Promise<void> {
    const confirmed = await confirmDelete(customer)
    if (!confirmed) return

    hideAlert()
    try {
      await customersApi.remove(customer.id)
    } catch (error) {
      showAlert(customerDeleteErrorMessage(error))
      return
    }

    loaded = loaded.filter((item) => item.id !== customer.id)
    tbody?.querySelector(`[data-customer-id="${customer.id}"]`)?.remove()
    if (loaded.length === 0) paintState("empty", emptyMessage())
  }

  if (newButton !== null) on(newButton, "click", () => openDialog(null))
  if (cancelButton !== null) on(cancelButton, "click", () => dialog.close())
  if (form !== null) on(form, "submit", (event) => void handleSubmit(event))

  // Cierra el modal al tocar el fondo, como cualquier diálogo nativo.
  if (dialog !== null) {
    on(dialog, "click", (event) => {
      if (event.target === dialog) dialog.close()
    })
  }

  if (detailsDialog !== null) {
    for (const close of detailsDialog.querySelectorAll<HTMLElement>("[data-detail-close]")) {
      on(close, "click", () => closeDetails())
    }

    on(detailsDialog, "click", (event) => {
      if (event.target === detailsDialog) closeDetails()
    })

    // `Escape` cierra el `<dialog>` sin pasar por `closeDetails`; el evento
    // `close` deja la URL y el estado en el mismo lugar que el botón Cerrar.
    on(detailsDialog, "close", () => {
      if (detailCustomer === null) return
      detailCustomer = null
      detailToken++
      syncUrl()
    })
  }

  // Desde los detalles se abre el formulario de edición que ya existe: el
  // diálogo se cierra para no dejar dos capas apiladas y los datos se releen
  // de la lista en memoria al guardar.
  if (detailEdit !== null) {
    on(detailEdit, "click", () => {
      const customer = detailCustomer
      closeDetails()
      const fresh = loaded.find((item) => item.id === customer?.id)
      if (fresh !== undefined) openDialog(fresh)
    })
  }

  if (searchForm !== null) {
    on(searchForm, "submit", (event) => {
      event.preventDefault()
      window.clearTimeout(searchTimer)
      // Buscar es una navegación de la vista: la URL entra al historial por el
      // router y la lista se vuelve a pedir, sin cargar el documento.
      pushQuery(hrefWithState())
      void load()
    })
  }

  if (searchInput !== null) {
    on(searchInput, "input", () => {
      window.clearTimeout(searchTimer)
      searchTimer = window.setTimeout(() => {
        // Mientras se escribe se reescribe la entrada actual: buscar «a», «an»,
        // «ana» no puede dejar tres pasos en el historial.
        syncUrl()
        void load()
      }, SEARCH_DEBOUNCE_MS)
    })
  }

  // Delegación: las filas y los estados se reemplazan en cada carga, así que
  // los botones no se cablean uno por uno.
  if (tbody !== null) {
    on(tbody, "click", (event) => {
      const target = event.target
      if (!(target instanceof Element)) return

      // El vacío ofrece «Nuevo cliente»: abre el mismo diálogo que el botón del
      // encabezado, sin salir de la pantalla.
      if (target.closest("[data-state-action]") !== null) {
        openDialog(null)
        return
      }

      const button = target.closest<HTMLButtonElement>("[data-action]")
      const row = target.closest<HTMLElement>("[data-customer-id]")
      const customer = loaded.find((item) => item.id === row?.dataset.customerId)
      if (customer === undefined) return

      if (button === null) {
        // Clic en la fila, fuera de sus botones: abre la edición. `rowClickOpensEdit`
        // descarta los clics con modificador, los botones que viven adentro y una
        // selección de texto en curso.
        // El helper decide sobre un `MouseEvent` real: el listener delegado tipa `Event`.
        if (event instanceof MouseEvent && rowClickOpensEdit(event)) openDialog(customer)
        return
      }

      if (button.dataset.action === "details") void openDetails(customer)
      else if (button.dataset.action === "edit") openDialog(customer)
      else void deleteCustomer(customer)
    })
  }

  if (searchInput !== null) {
    searchInput.value = new URLSearchParams(window.location.search).get("q") ?? ""
  }
  void load()

  return () => {
    window.clearTimeout(searchTimer)
    if (dialog !== null && dialog.open) dialog.close()
    if (detailsDialog !== null && detailsDialog.open) detailsDialog.close()
  }
}
