/**
 * Backend de mentira para la demo (sin servidor).
 *
 * El panel conserva la misma capa de datos de siempre: `apiFetch` sigue
 * recibiendo un path (`/expenses`, `/sales`, …) y sigue resolviendo la caché.
 * Lo único que cambia es de dónde sale la respuesta. Cuando el modo mock está
 * encendido, `apiFetch` no llama a `fetch`: llama a `handleMockRequest`, que
 * implementa en memoria los mismos endpoints que usa la interfaz.
 *
 * Los datos viven en módulo, así que se pierden al refrescar la página. Es
 * deliberado: la demo no necesita persistencia y no queremos dejar datos de
 * prueba en el navegador de nadie.
 *
 * Lo que se implementa es el subconjunto que consume el frontend: auth, ventas,
 * clientes, gastos y los cinco agregados del resumen. Las escrituras (alta de
 * gasto, alta de venta, pagos, cambios de estado) actualizan el mismo arreglo en
 * memoria, por lo que la pantalla que se monta después ve el cambio.
 */

import type {
  IAdditionalSaleResponse,
  IChannelBreakdown,
  ICreateCustomerRequest,
  ICreateExpenseRequest,
  ICreateLiveSaleRequest,
  ICreateSalePaymentRequest,
  ICreateWhatsappSaleRequest,
  ICustomerResponse,
  ICustomerWithBalances,
  IDailySeries,
  IDailySeriesPoint,
  IDashboardSummary,
  IExpenseResponse,
  IMeResponse,
  IMessageResponse,
  IPackageKpis,
  ISaleListRow,
  ISalePaymentResponse,
  ISaleResponse,
  ISalesWithDetailsResponse,
  IShipmentBreakdown,
  IUpdateCustomerRequest,
  IUser,
  PaymentMethod,
  PaymentTerms,
  SaleCategory,
  SaleStatus,
  SaleType,
  ShipmentMethod,
} from "./types"

/** Error con la forma del sobre de la API. `api.ts` lo traduce a `ApiError`. */
export class MockHttpError extends Error {
  constructor(
    public code: string,
    public status: number,
    message?: string,
  ) {
    super(message ?? code)
    this.name = "MockHttpError"
  }
}

/**
 * ¿Se usa el backend de mentira?
 *
 * - `PUBLIC_USE_MOCK=true` lo fuerza (lo que hace `.env.example`).
 * - `PUBLIC_USE_MOCK=false` lo apaga.
 * - Sin la variable, se enciende solo si no hay `PUBLIC_API_URL`; es el modo
 *   demo por defecto del repositorio.
 * - En la suite de pruebas se apaga siempre que no se fuerce, para que las
 *   pruebas de `api.ts` sigan ejerciendo el `fetch` que ellas inyectan.
 */
export function isMockApiEnabled(): boolean {
  const flag = (import.meta.env.PUBLIC_USE_MOCK as string | undefined)?.trim()
  if (flag === "true") return true
  if (flag === "false") return false
  if (import.meta.env.MODE === "test") return false
  return ((import.meta.env.PUBLIC_API_URL as string | undefined) ?? "").trim() === ""
}

// ---------------------------------------------------------------------------
// Estado en memoria
// ---------------------------------------------------------------------------

interface MockPayment extends ISalePaymentResponse {}
interface MockAdditional extends IAdditionalSaleResponse {}

interface MockSale {
  id: string
  type: SaleType
  customer_id: string | null
  customer_name: string
  product_name: string
  category: SaleCategory[]
  payment_method: PaymentMethod
  payment_bank: string | null
  sale_date: string
  status: SaleStatus
  cost: string
  shipment_method: ShipmentMethod
  amount_paid: string | null
  change_given: string | null
  created_at: string
  updated_at: string
  additional_items: MockAdditional[]
  payment_terms: PaymentTerms
  due_date: string | null
  payments: MockPayment[]
}

interface MockExpense extends IExpenseResponse {}

interface MockCustomer extends ICustomerResponse {}

interface MockState {
  customers: MockCustomer[]
  sales: MockSale[]
  expenses: MockExpense[]
}

const USER: IUser = {
  id: "demo-user-admin",
  username: "admin",
  email: "admin@shopmar.local",
  role: "admin",
}

const DEFAULT_CUSTOMER_NAME = "Consumidor Final"

const pad = (value: number): string => String(value).padStart(2, "0")

/** El día de negocio local (`YYYY-MM-DD`) desplazado respecto de hoy. */
function dayKey(offsetDays = 0): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function isoDay(offsetDays = 0): string {
  return `${dayKey(offsetDays)}T00:00:00.000Z`
}

function isoAt(offsetDays: number, hour: number, minute = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0
}

function money(cents: number): string {
  return (cents / 100).toFixed(2)
}

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function today(): string {
  return dayKey(0)
}

function normalizeDay(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return match?.[1] ?? null
}

function inRange(day: string, start: string | null, end: string | null): boolean {
  if (start !== null && day < start) return false
  if (end !== null && day > end) return false
  return true
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

let idSequence = 0
function nextId(prefix: string): string {
  idSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${idSequence}`
}

// ---------------------------------------------------------------------------
// Semilla
// ---------------------------------------------------------------------------

interface SeedSaleOptions {
  id: string
  type: SaleType
  customerId: string | null
  customerName: string
  product: string
  cost: number
  saleDateOffset: number
  status: SaleStatus
  terms?: PaymentTerms
  dueDateOffset?: number
  paymentMethod?: PaymentMethod
  paymentBank?: string | null
  shipment?: ShipmentMethod
  additional?: Array<{
    name: string
    total: number
    description?: string
    quantity?: number
    kind?: IAdditionalSaleResponse["kind"]
  }>
  payments?: Array<{
    amount: number
    paidOffset: number
    method?: PaymentMethod
    bank?: string | null
    note?: string | null
  }>
  createdHour?: number
}

function makeSale(options: SeedSaleOptions): MockSale {
  const createdAt = isoAt(options.saleDateOffset, options.createdHour ?? 11)
  const saleId = options.id
  const additional = (options.additional ?? []).map((item, index) => ({
    id: `${saleId}-extra-${index + 1}`,
    sale_id: saleId,
    name: item.name,
    description: item.description ?? null,
    quantity: item.quantity ?? 1,
    total: money(toCents(item.total)),
    kind: item.kind ?? "additional",
    created_at: createdAt,
    updated_at: createdAt,
  }))
  const payments = (options.payments ?? []).map((payment, index) => {
    const paidAt = isoAt(payment.paidOffset, 12 + index, 15)
    return {
      id: `${saleId}-payment-${index + 1}`,
      sale_id: saleId,
      amount: money(toCents(payment.amount)),
      paid_at: paidAt,
      payment_method: payment.method ?? "cash",
      payment_bank: payment.bank ?? null,
      note: payment.note ?? null,
      created_at: paidAt,
      updated_at: paidAt,
    }
  })

  const paidCents = payments.reduce((sum, payment) => sum + toCents(payment.amount), 0)
  const createdAtRaw = createdAt
  return {
    id: saleId,
    type: options.type,
    customer_id: options.customerId,
    customer_name: options.customerName,
    product_name: options.product,
    category: [],
    payment_method: options.paymentMethod ?? "cash",
    payment_bank: options.paymentBank ?? null,
    sale_date: isoDay(options.saleDateOffset),
    status: options.status,
    cost: money(toCents(options.cost)),
    shipment_method: options.shipment ?? "unassigned",
    amount_paid: paidCents > 0 ? money(paidCents) : null,
    change_given: null,
    created_at: createdAtRaw,
    updated_at: createdAtRaw,
    additional_items: additional,
    payment_terms: options.terms ?? "immediate",
    due_date: options.dueDateOffset === undefined ? null : isoDay(options.dueDateOffset),
    payments,
  }
}

let state: MockState = createSeedState()

export function resetMockState(): void {
  state = createSeedState()
}

function createSeedState(): MockState {
  const customers: MockCustomer[] = [
    {
      id: "customer-maria",
      name: "María González",
      phone: "8888 1234",
      note: "Clienta frecuente. Prefiere entregas por la tarde.",
      created_at: isoAt(-40, 9),
      updated_at: isoAt(-40, 9),
    },
    {
      id: "customer-ana",
      name: "Ana Lucía Rojas",
      phone: "7777 4567",
      note: "Compra para su boutique.",
      created_at: isoAt(-32, 10),
      updated_at: isoAt(-32, 10),
    },
    {
      id: "customer-carlos",
      name: "Carlos Méndez",
      phone: "6666 7890",
      note: null,
      created_at: isoAt(-25, 15),
      updated_at: isoAt(-25, 15),
    },
    {
      id: "customer-sofia",
      name: "Sofía Ramírez",
      phone: "5555 1234",
      note: "Le gusta el estilo clásico.",
      created_at: isoAt(-18, 12),
      updated_at: isoAt(-18, 12),
    },
    {
      id: "customer-laura",
      name: "Laura Jiménez",
      phone: null,
      note: "Cliente mayorista.",
      created_at: isoAt(-9, 16),
      updated_at: isoAt(-9, 16),
    },
  ]

  const sales: MockSale[] = [
    makeSale({
      id: "seed-sale-01",
      type: "live",
      customerId: "customer-maria",
      customerName: "María González",
      product: "Blusa de lino",
      cost: 950,
      saleDateOffset: 0,
      status: "completed",
      paymentMethod: "cash",
      shipment: "pickup",
      payments: [{ amount: 950, paidOffset: 0 }],
      createdHour: 9,
    }),
    makeSale({
      id: "seed-sale-02",
      type: "whatsapp",
      customerId: "customer-ana",
      customerName: "Ana Lucía Rojas",
      product: "Vestido floral",
      cost: 1450,
      saleDateOffset: 0,
      status: "pending",
      terms: "credit",
      dueDateOffset: 12,
      shipment: "delivery",
      additional: [{ name: "Faja modeladora", total: 250, kind: "additional" }],
      payments: [{ amount: 500, paidOffset: 0 }],
      createdHour: 10,
    }),
    makeSale({
      id: "seed-sale-03",
      type: "live",
      customerId: "customer-carlos",
      customerName: "Carlos Méndez",
      product: "Camisa oxford",
      cost: 780,
      saleDateOffset: 0,
      status: "completed",
      paymentMethod: "credit_card",
      paymentBank: "BAC Credomatic",
      shipment: "cargotrans",
      payments: [{ amount: 780, paidOffset: 0, method: "credit_card", bank: "BAC Credomatic" }],
      createdHour: 11,
    }),
    makeSale({
      id: "seed-sale-04",
      type: "whatsapp",
      customerId: null,
      customerName: DEFAULT_CUSTOMER_NAME,
      product: "Pantalón jean",
      cost: 1200,
      saleDateOffset: 0,
      status: "completed",
      paymentMethod: "cash",
      shipment: "unassigned",
      payments: [{ amount: 1200, paidOffset: 0 }],
      createdHour: 13,
    }),
    makeSale({
      id: "seed-sale-05",
      type: "live",
      customerId: "customer-sofia",
      customerName: "Sofía Ramírez",
      product: "Falda plizada",
      cost: 650,
      saleDateOffset: 0,
      status: "pending",
      paymentMethod: "cash",
      shipment: "pickup",
      createdHour: 15,
    }),
    makeSale({
      id: "seed-sale-06",
      type: "whatsapp",
      customerId: "customer-ana",
      customerName: "Ana Lucía Rojas",
      product: "Conjunto deportivo",
      cost: 2100.5,
      saleDateOffset: -1,
      status: "pending",
      terms: "credit",
      dueDateOffset: -2,
      shipment: "delivery",
      payments: [{ amount: 800, paidOffset: -3, method: "credit_card", bank: "BAC Credomatic" }],
      createdHour: 10,
    }),
    makeSale({
      id: "seed-sale-07",
      type: "live",
      customerId: "customer-laura",
      customerName: "Laura Jiménez",
      product: "Blazer oversized",
      cost: 1800,
      saleDateOffset: -1,
      status: "completed",
      paymentMethod: "cash",
      shipment: "pickup",
      payments: [{ amount: 1800, paidOffset: -1 }],
      createdHour: 14,
    }),
    makeSale({
      id: "seed-sale-08",
      type: "whatsapp",
      customerId: "customer-maria",
      customerName: "María González",
      product: "Vestido de noche",
      cost: 450,
      saleDateOffset: -2,
      status: "cancelled",
      paymentMethod: "cash",
      shipment: "delivery",
      createdHour: 12,
    }),
    makeSale({
      id: "seed-sale-09",
      type: "live",
      customerId: "customer-carlos",
      customerName: "Carlos Méndez",
      product: "Pantalón formal",
      cost: 890,
      saleDateOffset: -2,
      status: "pending",
      paymentMethod: "cash",
      shipment: "cargotrans",
      createdHour: 16,
    }),
    makeSale({
      id: "seed-sale-10",
      type: "whatsapp",
      customerId: "customer-laura",
      customerName: "Laura Jiménez",
      product: "Set de accesorios",
      cost: 320,
      saleDateOffset: -3,
      status: "completed",
      paymentMethod: "credit_card",
      paymentBank: "Banpro",
      shipment: "unassigned",
      payments: [{ amount: 320, paidOffset: -3, method: "credit_card", bank: "Banpro" }],
      createdHour: 11,
    }),
    makeSale({
      id: "seed-sale-11",
      type: "live",
      customerId: "customer-sofia",
      customerName: "Sofía Ramírez",
      product: "Top de encaje",
      cost: 540,
      saleDateOffset: -4,
      status: "completed",
      paymentMethod: "cash",
      shipment: "delivery",
      payments: [{ amount: 540, paidOffset: -4 }],
      createdHour: 10,
    }),
    makeSale({
      id: "seed-sale-12",
      type: "whatsapp",
      customerId: "customer-ana",
      customerName: "Ana Lucía Rojas",
      product: "Abrigo de lana",
      cost: 2350,
      saleDateOffset: -4,
      status: "pending",
      terms: "credit",
      dueDateOffset: 3,
      shipment: "cargotrans",
      payments: [{ amount: 1000, paidOffset: -1 }],
      createdHour: 15,
    }),
    makeSale({
      id: "seed-sale-13",
      type: "live",
      customerId: "customer-maria",
      customerName: "María González",
      product: "Camisa de seda",
      cost: 1100,
      saleDateOffset: -5,
      status: "completed",
      paymentMethod: "cash",
      shipment: "pickup",
      payments: [{ amount: 1100, paidOffset: -5 }],
      createdHour: 9,
    }),
    makeSale({
      id: "seed-sale-14",
      type: "whatsapp",
      customerId: "customer-carlos",
      customerName: "Carlos Méndez",
      product: "Traje completo",
      cost: 3200,
      saleDateOffset: -6,
      status: "pending",
      terms: "credit",
      dueDateOffset: -5,
      shipment: "delivery",
      payments: [{ amount: 1200, paidOffset: -6 }],
      createdHour: 13,
    }),
    makeSale({
      id: "seed-sale-15",
      type: "live",
      customerId: "customer-laura",
      customerName: "Laura Jiménez",
      product: "Falda midi",
      cost: 720,
      saleDateOffset: -6,
      status: "completed",
      paymentMethod: "cash",
      shipment: "pickup",
      payments: [{ amount: 720, paidOffset: -6 }],
      createdHour: 16,
    }),
  ]

  const expenses: MockExpense[] = [
    {
      id: "seed-expense-01",
      name: "Compra de tela",
      description: "Rollo de lino y seda para la colección nueva",
      total: "1250.00",
      expense_date: isoDay(0),
      created_at: isoAt(0, 9, 20),
      updated_at: isoAt(0, 9, 20),
    },
    {
      id: "seed-expense-02",
      name: "Envío Cargotrans",
      description: "Paquetes despachados a Managua",
      total: "320.00",
      expense_date: isoDay(0),
      created_at: isoAt(0, 11, 5),
      updated_at: isoAt(0, 11, 5),
    },
    {
      id: "seed-expense-03",
      name: "Almuerzo del equipo",
      description: null,
      total: "180.00",
      expense_date: isoDay(0),
      created_at: isoAt(0, 13, 40),
      updated_at: isoAt(0, 13, 40),
    },
    {
      id: "seed-expense-04",
      name: "Material de empaque",
      description: "Bolsas, cinta y etiquetas",
      total: "95.50",
      expense_date: isoDay(0),
      created_at: isoAt(0, 16, 10),
      updated_at: isoAt(0, 16, 10),
    },
    {
      id: "seed-expense-05",
      name: "Publicidad en Instagram",
      description: "Campaña de la semana",
      total: "800.00",
      expense_date: isoDay(-1),
      created_at: isoAt(-1, 10, 0),
      updated_at: isoAt(-1, 10, 0),
    },
    {
      id: "seed-expense-06",
      name: "Luz del local",
      description: null,
      total: "640.00",
      expense_date: isoDay(-2),
      created_at: isoAt(-2, 9, 30),
      updated_at: isoAt(-2, 9, 30),
    },
    {
      id: "seed-expense-07",
      name: "Transporte",
      description: "Taxi al centro de distribucion",
      total: "150.00",
      expense_date: isoDay(-3),
      created_at: isoAt(-3, 15, 15),
      updated_at: isoAt(-3, 15, 15),
    },
    {
      id: "seed-expense-08",
      name: "Insumos de limpieza",
      description: null,
      total: "220.00",
      expense_date: isoDay(-4),
      created_at: isoAt(-4, 12, 45),
      updated_at: isoAt(-4, 12, 45),
    },
    {
      id: "seed-expense-09",
      name: "Mantenimiento de máquina",
      description: "Ajuste de la máquina de coser industrial",
      total: "450.00",
      expense_date: isoDay(-5),
      created_at: isoAt(-5, 11, 0),
      updated_at: isoAt(-5, 11, 0),
    },
    {
      id: "seed-expense-10",
      name: "Agua",
      description: null,
      total: "24.50",
      expense_date: isoDay(-6),
      created_at: isoAt(-6, 8, 50),
      updated_at: isoAt(-6, 8, 50),
    },
  ]

  return { customers, sales, expenses }
}

// ---------------------------------------------------------------------------
// Derivaciones
// ---------------------------------------------------------------------------

function saleAdditionalCents(sale: MockSale): number {
  return sale.additional_items.reduce((sum, item) => sum + toCents(item.total), 0)
}

function saleTotalCents(sale: MockSale): number {
  return toCents(sale.cost) + saleAdditionalCents(sale)
}

function salePaidCents(sale: MockSale): number {
  return sale.payments.reduce((sum, payment) => sum + toCents(payment.amount), 0)
}

function saleBalanceCents(sale: MockSale): number | null {
  if (sale.payment_terms !== "credit") return null
  return Math.max(saleTotalCents(sale) - salePaidCents(sale), 0)
}

function isOverdue(sale: MockSale): boolean {
  if (sale.payment_terms !== "credit") return false
  if (sale.status === "cancelled") return false
  const balance = saleBalanceCents(sale)
  if (balance === null || balance <= 0) return false
  const due = normalizeDay(sale.due_date)
  return due !== null && due < today()
}

function saleResponse(sale: MockSale): ISaleResponse {
  const payments = [...sale.payments].sort((a, b) => {
    const byDate = a.paid_at.localeCompare(b.paid_at)
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id)
  })
  const paidCents = salePaidCents(sale)
  return {
    id: sale.id,
    type: sale.type,
    customer_name: sale.customer_name,
    product_name: sale.product_name,
    category: [...sale.category],
    payment_method: sale.payment_method,
    payment_bank: sale.payment_bank,
    sale_date: sale.sale_date,
    status: sale.status,
    cost: sale.cost,
    shipment_method: sale.shipment_method,
    amount_paid: paidCents > 0 ? money(paidCents) : null,
    change_given: sale.change_given,
    created_at: sale.created_at,
    updated_at: sale.updated_at,
    additional_items: sale.additional_items.map((item) => ({ ...item })),
    additional_count: sale.additional_items.length,
    total: money(saleTotalCents(sale)),
    customer_id: sale.customer_id,
    payment_terms: sale.payment_terms,
    due_date: sale.due_date,
    paid_total: money(paidCents),
    balance: sale.payment_terms === "credit" ? money(saleBalanceCents(sale) ?? 0) : null,
    is_overdue: isOverdue(sale),
    payments: payments.map((payment) => ({ ...payment })),
    payments_count: payments.length,
  }
}

function saleListRow(sale: MockSale): ISaleListRow {
  const detail = saleResponse(sale)
  return {
    id: detail.id,
    sale_date: detail.sale_date,
    customer_name: detail.customer_name,
    product_name: detail.product_name,
    type: detail.type,
    status: detail.status,
    cost: detail.cost,
    payment_method: detail.payment_method,
    shipment_method: detail.shipment_method,
    additional_count: detail.additional_count,
    total: detail.total,
    customer_id: detail.customer_id,
    payment_terms: detail.payment_terms,
    due_date: detail.due_date,
    paid_total: detail.paid_total,
    balance: detail.balance,
    is_overdue: detail.is_overdue,
  }
}

function customerResponse(customer: MockCustomer): ICustomerWithBalances {
  let outstanding = 0
  let overdue = 0
  for (const sale of state.sales) {
    if (sale.customer_id !== customer.id) continue
    if (sale.status === "cancelled" || sale.payment_terms !== "credit") continue
    const balance = saleBalanceCents(sale) ?? 0
    if (balance <= 0) continue
    outstanding += balance
    if (isOverdue(sale)) overdue += balance
  }
  return {
    ...customer,
    outstanding_balance: money(outstanding),
    overdue_balance: money(overdue),
  }
}

function sortedSales(): MockSale[] {
  return [...state.sales].sort((a, b) => {
    const byDate = b.sale_date.localeCompare(a.sale_date)
    if (byDate !== 0) return byDate
    const byCreated = b.created_at.localeCompare(a.created_at)
    return byCreated !== 0 ? byCreated : b.id.localeCompare(a.id)
  })
}

function sortedExpenses(): MockExpense[] {
  return [...state.expenses].sort((a, b) => {
    const byDate = b.expense_date.localeCompare(a.expense_date)
    if (byDate !== 0) return byDate
    const byCreated = b.created_at.localeCompare(a.created_at)
    return byCreated !== 0 ? byCreated : b.id.localeCompare(a.id)
  })
}

// ---------------------------------------------------------------------------
// Consultas y mutaciones
// ---------------------------------------------------------------------------

function parseBody<T>(init: RequestInit | undefined): T {
  if (init?.body === undefined || init.body === null) return {} as T
  if (typeof init.body !== "string") return {} as T
  try {
    return JSON.parse(init.body) as T
  } catch {
    throw new MockHttpError("BAD_REQUEST", 400, "value: Invalid JSON body")
  }
}

function requireSale(id: string): MockSale {
  const sale = state.sales.find((candidate) => candidate.id === id)
  if (sale === undefined) throw new MockHttpError("NOT_FOUND", 404, "Sale not found")
  return sale
}

function requireCustomer(id: string): MockCustomer {
  const customer = state.customers.find((candidate) => candidate.id === id)
  if (customer === undefined) throw new MockHttpError("NOT_FOUND", 404, "Customer not found")
  return customer
}

function requireExpense(id: string): MockExpense {
  const expense = state.expenses.find((candidate) => candidate.id === id)
  if (expense === undefined) throw new MockHttpError("NOT_FOUND", 404, "Expense not found")
  return expense
}

function resolveCustomer(body: {
  customer_id?: string
  customer_name?: string
  customer_phone?: string
}): { id: string | null; name: string } {
  if (body.customer_id !== undefined && body.customer_id.trim() !== "") {
    const customer = requireCustomer(body.customer_id.trim())
    if (body.customer_phone !== undefined && body.customer_phone.trim() !== "") {
      customer.phone = body.customer_phone.trim()
      customer.updated_at = new Date().toISOString()
    }
    return { id: customer.id, name: customer.name }
  }

  const name = (body.customer_name ?? "").trim()
  if (name === "") return { id: null, name: DEFAULT_CUSTOMER_NAME }

  const existing = state.customers.find(
    (customer) => customer.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  )
  if (existing !== undefined) {
    if (body.customer_phone !== undefined && body.customer_phone.trim() !== "") {
      existing.phone = body.customer_phone.trim()
      existing.updated_at = new Date().toISOString()
    }
    return { id: existing.id, name: existing.name }
  }

  const now = new Date().toISOString()
  const created: MockCustomer = {
    id: nextId("customer"),
    name,
    phone:
      body.customer_phone !== undefined && body.customer_phone.trim() !== ""
        ? body.customer_phone.trim()
        : null,
    note: null,
    created_at: now,
    updated_at: now,
  }
  state.customers.push(created)
  return { id: created.id, name: created.name }
}

function validateMoney(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(value)) {
    throw new MockHttpError("BAD_REQUEST", 400, `${field}: Invalid money amount`)
  }
  return money(toCents(value))
}

function typeFromPath(path: string): SaleType {
  return path.includes("whatsapp") ? "whatsapp" : "live"
}

function createSale(
  path: string,
  body: ICreateLiveSaleRequest | ICreateWhatsappSaleRequest,
): ISaleResponse {
  const type = typeFromPath(path)
  if (typeof body.product_name !== "string" || body.product_name.trim() === "") {
    throw new MockHttpError("BAD_REQUEST", 400, "product_name: Product name is required")
  }
  const cost = validateMoney(body.cost, "cost")
  const terms: PaymentTerms = body.payment_terms === "credit" ? "credit" : "immediate"
  const saleDate = normalizeDay(body.sale_date) ?? today()
  const customer = resolveCustomer(body)
  const now = new Date().toISOString()

  if (terms === "credit") {
    if (body.due_date === undefined) {
      throw new MockHttpError("BAD_REQUEST", 400, "due_date: A credit sale needs a due date")
    }
    if (body.status !== undefined && body.status !== "pending") {
      throw new MockHttpError("BAD_REQUEST", 400, "status: A credit sale is created pending")
    }
  }

  const additionalItems: MockAdditional[] =
    type === "whatsapp"
      ? (body.additional_items ?? []).map((item, index) => ({
          id: nextId(`additional-${index + 1}`),
          sale_id: "",
          name: item.name,
          description: item.description ?? null,
          quantity: item.quantity ?? 1,
          total: validateMoney(item.total, "additional_items.total"),
          kind: item.kind ?? "additional",
          created_at: now,
          updated_at: now,
        }))
      : []

  const saleId = nextId("sale")
  for (const item of additionalItems) item.sale_id = saleId

  const totalCents = toCents(cost) + additionalItems.reduce((sum, item) => sum + toCents(item.total), 0)
  const status: SaleStatus = terms === "credit" ? "pending" : (body.status ?? "pending")
  const payments: MockPayment[] = []

  if (terms === "immediate" && status === "completed") {
    const amount = validateMoney(body.amount_paid ?? money(totalCents), "amount_paid")
    payments.push({
      id: nextId("payment"),
      sale_id: saleId,
      amount,
      paid_at: now,
      payment_method: body.payment_method ?? "cash",
      payment_bank: body.payment_bank ?? null,
      note: null,
      created_at: now,
      updated_at: now,
    })
  }

  const sale: MockSale = {
    id: saleId,
    type,
    customer_id: customer.id,
    customer_name: customer.name,
    product_name: body.product_name.trim(),
    category: Array.isArray(body.category) ? [...body.category] : [],
    payment_method: terms === "credit" ? "cash" : (body.payment_method ?? "cash"),
    payment_bank: terms === "credit" ? null : (body.payment_bank ?? null),
    sale_date: `${saleDate}T00:00:00.000Z`,
    status,
    cost,
    shipment_method: "unassigned",
    amount_paid: payments.length > 0 ? payments[0]?.amount ?? null : null,
    change_given: null,
    created_at: now,
    updated_at: now,
    additional_items: additionalItems,
    payment_terms: terms,
    due_date: terms === "credit" ? (normalizeDay(body.due_date) ?? null) : null,
    payments,
  }
  state.sales.push(sale)
  return saleResponse(sale)
}

function updateSaleStatus(id: string, body: { status?: SaleStatus; amount_paid?: string }): ISaleResponse {
  const sale = requireSale(id)
  if (sale.status === "cancelled") {
    throw new MockHttpError(
      "CONFLICT",
      409,
      `La venta de "${sale.customer_name}" está cancelada y no se le puede cambiar el estado.`,
    )
  }
  if (body.status !== "pending" && body.status !== "completed" && body.status !== "cancelled") {
    throw new MockHttpError("BAD_REQUEST", 400, "status: Invalid status")
  }

  if (
    body.status === "completed" &&
    sale.payment_terms === "immediate" &&
    body.amount_paid !== undefined
  ) {
    const amount = validateMoney(body.amount_paid, "amount_paid")
    sale.payments = [
      {
        id: nextId("payment"),
        sale_id: sale.id,
        amount,
        paid_at: new Date().toISOString(),
        payment_method: sale.payment_method,
        payment_bank: sale.payment_bank,
        note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
  }
  sale.status = body.status
  sale.updated_at = new Date().toISOString()
  return saleResponse(sale)
}

function registerPayment(id: string, body: ICreateSalePaymentRequest): ISaleResponse {
  const sale = requireSale(id)
  if (sale.payment_terms !== "credit") {
    throw new MockHttpError(
      "CONFLICT",
      409,
      `La venta de "${sale.customer_name}" es de contado: para marcarla cobrada usá el cambio de estado con el monto recibido.`,
    )
  }
  if (sale.status === "cancelled") {
    throw new MockHttpError("CONFLICT", 409, "La venta está cancelada y no recibe pagos.")
  }
  const amount = validateMoney(body.amount, "amount")
  const balance = saleBalanceCents(sale) ?? 0
  if (toCents(amount) <= 0) {
    throw new MockHttpError("BAD_REQUEST", 400, "amount: Payment amount must be greater than zero")
  }
  if (toCents(amount) > balance) {
    throw new MockHttpError(
      "BAD_REQUEST",
      400,
      `amount: Payment exceeds the outstanding balance: expected at most ${money(balance)}`,
    )
  }

  const now = new Date().toISOString()
  const paidAt = body.paid_at === undefined ? now : new Date(body.paid_at).toISOString()
  sale.payments.push({
    id: nextId("payment"),
    sale_id: sale.id,
    amount,
    paid_at: paidAt,
    payment_method: body.payment_method,
    payment_bank: body.payment_bank ?? null,
    note: body.note ?? null,
    created_at: now,
    updated_at: now,
  })
  if (saleBalanceCents(sale) === 0) sale.status = "completed"
  sale.updated_at = now
  return saleResponse(sale)
}

function deletePayment(id: string, paymentId: string): ISaleResponse {
  const sale = requireSale(id)
  const index = sale.payments.findIndex((payment) => payment.id === paymentId)
  if (index < 0) throw new MockHttpError("NOT_FOUND", 404, "Payment not found")
  sale.payments.splice(index, 1)
  if (sale.payment_terms === "credit" && (saleBalanceCents(sale) ?? 0) > 0) {
    sale.status = "pending"
  }
  sale.updated_at = new Date().toISOString()
  return saleResponse(sale)
}

function queryRange(search: URLSearchParams): { start: string | null; end: string | null } {
  return {
    start: normalizeDay(search.get("start_date")),
    end: normalizeDay(search.get("end_date")),
  }
}

function listSales(search: URLSearchParams): unknown {
  const { start, end } = queryRange(search)
  const type = search.get("type")
  const status = search.get("status")
  const shipment = search.get("shipment_method")
  const terms = search.get("payment_terms")
  const customerId = search.get("customer_id")
  const overdue = search.get("overdue") === "true"

  const filtered = sortedSales().filter((sale) => {
    const day = normalizeDay(sale.sale_date)
    if (day === null || !inRange(day, start, end)) return false
    if (type !== null && type !== "" && sale.type !== type) return false
    if (status !== null && status !== "" && sale.status !== status) return false
    if (shipment !== null && shipment !== "" && sale.shipment_method !== shipment) return false
    if (terms !== null && terms !== "" && sale.payment_terms !== terms) return false
    if (customerId !== null && customerId !== "" && sale.customer_id !== customerId) return false
    if (overdue && !isOverdue(sale)) return false
    return true
  })

  const page = Number(search.get("page"))
  const perPage = Number(search.get("per_page"))
  const paginated = Number.isInteger(page) && page > 0 && Number.isInteger(perPage) && perPage > 0
  const startIndex = paginated ? (page - 1) * perPage : 0
  const rows = paginated ? filtered.slice(startIndex, startIndex + perPage) : filtered

  const result: { sales: ISaleListRow[]; total: number; kpis?: IPackageKpis } = {
    sales: rows.map(saleListRow),
    total: filtered.length,
  }

  if (search.get("include_kpis") === "true") {
    // Los KPIs ignoran los filtros de estado, canal y envío: sólo el rango.
    result.kpis = packageKpis(start, end)
  }
  return result
}

function packageKpis(start: string | null, end: string | null): IPackageKpis {
  const kpis: IPackageKpis = { total: 0, cargotrans: 0, delivery: 0, pickup: 0, unassigned: 0 }
  for (const sale of state.sales) {
    if (sale.status === "cancelled") continue
    const day = normalizeDay(sale.sale_date)
    if (day === null || !inRange(day, start, end)) continue
    kpis.total += 1
    kpis[sale.shipment_method] += 1
  }
  return kpis
}

function listCustomers(search: URLSearchParams): { customers: ICustomerWithBalances[] } {
  const query = (search.get("q") ?? "").trim().toLocaleLowerCase()
  const customers = [...state.customers]
    .filter((customer) => {
      if (query === "") return true
      return (
        customer.name.toLocaleLowerCase().includes(query) ||
        (customer.phone ?? "").toLocaleLowerCase().includes(query)
      )
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map(customerResponse)
  return { customers }
}

function createCustomer(body: ICreateCustomerRequest): ICustomerResponse {
  const name = (body.name ?? "").trim()
  if (name === "") throw new MockHttpError("BAD_REQUEST", 400, "name: Name is required")
  if (body.phone !== undefined && body.phone !== null && body.phone.length > 30) {
    throw new MockHttpError("BAD_REQUEST", 400, "phone: Phone must be at most 30 characters")
  }
  const now = new Date().toISOString()
  const customer: MockCustomer = {
    id: nextId("customer"),
    name,
    phone: body.phone ?? null,
    note: body.note ?? null,
    created_at: now,
    updated_at: now,
  }
  state.customers.push(customer)
  return { ...customer }
}

function updateCustomer(id: string, body: IUpdateCustomerRequest): ICustomerResponse {
  const customer = requireCustomer(id)
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (name === "") throw new MockHttpError("BAD_REQUEST", 400, "name: Name is required")
    customer.name = name
  }
  if (body.phone !== undefined) customer.phone = body.phone
  if (body.note !== undefined) customer.note = body.note
  customer.updated_at = new Date().toISOString()
  return { ...customer }
}

function removeCustomer(id: string): IMessageResponse {
  const customer = requireCustomer(id)
  state.customers = state.customers.filter((candidate) => candidate.id !== customer.id)
  for (const sale of state.sales) {
    if (sale.customer_id === customer.id) sale.customer_id = null
  }
  return { message: "Customer deleted successfully" }
}

function listExpenses(search: URLSearchParams): { expenses: IExpenseResponse[] } {
  const { start, end } = queryRange(search)
  const expenses = sortedExpenses().filter((expense) => {
    const day = normalizeDay(expense.expense_date)
    return day !== null && inRange(day, start, end)
  })
  return { expenses: expenses.map((expense) => ({ ...expense })) }
}

function createExpense(body: ICreateExpenseRequest): IExpenseResponse {
  const name = (body.name ?? "").trim()
  if (name === "" || name.length > 200) {
    throw new MockHttpError("BAD_REQUEST", 400, "name: Name must be between 1 and 200 characters")
  }
  if (body.description !== undefined && body.description !== null && body.description.length > 500) {
    throw new MockHttpError(
      "BAD_REQUEST",
      400,
      "description: Description must be at most 500 characters",
    )
  }
  const total = validateMoney(body.total, "total")
  const expenseDate = normalizeDay(body.expense_date) ?? today()
  const now = new Date().toISOString()
  const expense: MockExpense = {
    id: nextId("expense"),
    name,
    description: body.description ?? null,
    total,
    expense_date: `${expenseDate}T00:00:00.000Z`,
    created_at: now,
    updated_at: now,
  }
  state.expenses.push(expense)
  return { ...expense }
}

function removeExpense(id: string): IMessageResponse {
  requireExpense(id)
  state.expenses = state.expenses.filter((expense) => expense.id !== id)
  return { message: "Expense deleted successfully" }
}

function dashboardSummary(search: URLSearchParams): IDashboardSummary {
  const { start, end } = queryRange(search)
  const inverted = start !== null && end !== null && start > end

  if (inverted) {
    return {
      total_revenue: "0.00",
      sales_count: 0,
      total_expenses: "0.00",
      collected_revenue: "0.00",
      outstanding_receivables: "0.00",
      overdue_receivables: "0.00",
    }
  }

  let revenue = 0
  let salesCount = 0
  let expenses = 0
  let collected = 0
  let outstanding = 0
  let overdue = 0

  for (const sale of state.sales) {
    if (sale.status === "cancelled") continue
    const day = normalizeDay(sale.sale_date)
    if (day === null || !inRange(day, start, end)) continue
    revenue += saleTotalCents(sale)
    salesCount += 1
    if (sale.payment_terms === "credit") {
      const balance = saleBalanceCents(sale) ?? 0
      if (balance > 0) {
        outstanding += balance
        if (isOverdue(sale)) overdue += balance
      }
    }
  }

  for (const sale of state.sales) {
    if (sale.status === "cancelled") continue
    for (const payment of sale.payments) {
      const day = normalizeDay(payment.paid_at)
      if (day !== null && inRange(day, start, end)) collected += toCents(payment.amount)
    }
  }

  for (const expense of state.expenses) {
    const day = normalizeDay(expense.expense_date)
    if (day !== null && inRange(day, start, end)) expenses += toCents(expense.total)
  }

  return {
    total_revenue: money(revenue),
    sales_count: salesCount,
    total_expenses: money(expenses),
    collected_revenue: money(collected),
    outstanding_receivables: money(outstanding),
    overdue_receivables: money(overdue),
  }
}

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

function weekdayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()}`
}

function dailySeries(search: URLSearchParams): IDailySeries {
  const start = normalizeDay(search.get("start_date"))
  const end = normalizeDay(search.get("end_date"))
  const tzOffset = Number(search.get("tz_offset"))
  const offsetMinutes = Number.isFinite(tzOffset) ? tzOffset : 0

  const activeSales = state.sales.filter((sale) => sale.status !== "cancelled")
  const incomeByDay = new Map<string, number>()
  for (const sale of activeSales) {
    const day = normalizeDay(sale.sale_date)
    if (day !== null) incomeByDay.set(day, (incomeByDay.get(day) ?? 0) + saleTotalCents(sale))
  }
  const expenseByDay = new Map<string, number>()
  for (const expense of state.expenses) {
    const day = normalizeDay(expense.expense_date)
    if (day !== null) expenseByDay.set(day, (expenseByDay.get(day) ?? 0) + toCents(expense.total))
  }

  // Un solo día: 24 puntos, uno por hora local de registro.
  if (start !== null && end !== null && start === end) {
    const hours = Array.from({ length: 24 }, () => ({ income: 0, expense: 0 }))
    for (const sale of activeSales) {
      const day = normalizeDay(sale.sale_date)
      if (day !== start) continue
      const local = new Date(new Date(sale.created_at).getTime() + offsetMinutes * 60_000)
      hours[local.getUTCHours()]!.income += saleTotalCents(sale)
    }
    for (const expense of state.expenses) {
      const day = normalizeDay(expense.expense_date)
      if (day !== start) continue
      const local = new Date(new Date(expense.created_at).getTime() + offsetMinutes * 60_000)
      hours[local.getUTCHours()]!.expense += toCents(expense.total)
    }
    return hours.map((point, hour) => ({
      date: `${start}T${pad(hour)}:00:00.000Z`,
      income: money(point.income),
      expense: money(point.expense),
      label: `${pad(hour)}:00`,
    }))
  }

  // Rango cerrado y razonable: un punto por día, con ceros donde no hubo movimiento.
  if (start !== null && end !== null && start <= end) {
    const days: string[] = []
    let cursor = start
    while (cursor <= end && days.length <= 366) {
      days.push(cursor)
      cursor = addDays(cursor, 1)
    }
    if (days.length <= 366 && days.length > 0) {
      return days.map<IDailySeriesPoint>((day) => ({
        date: day,
        income: money(incomeByDay.get(day) ?? 0),
        expense: money(expenseByDay.get(day) ?? 0),
        label: weekdayLabel(day),
      }))
    }
  }

  // Rango abierto o demasiado largo: sólo los días con movimiento.
  const movementDays = new Set([...incomeByDay.keys(), ...expenseByDay.keys()])
  if (movementDays.size === 0) {
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDays(today(), index - 6)
      return {
        date: day,
        income: "0.00",
        expense: "0.00",
        label: weekdayLabel(day),
      }
    })
  }
  return [...movementDays]
    .sort()
    .map<IDailySeriesPoint>((day) => ({
      date: day,
      income: money(incomeByDay.get(day) ?? 0),
      expense: money(expenseByDay.get(day) ?? 0),
      label: weekdayLabel(day),
    }))
}

function channelBreakdown(search: URLSearchParams): IChannelBreakdown {
  const { start, end } = queryRange(search)
  const points: IChannelBreakdown = [
    { channel: "live", count: 0, revenue: "0.00", label: "Mostrador" },
    { channel: "whatsapp", count: 0, revenue: "0.00", label: "WhatsApp" },
  ]
  const totals = new Map<string, number>()
  for (const sale of state.sales) {
    if (sale.status === "cancelled") continue
    const day = normalizeDay(sale.sale_date)
    if (day === null || !inRange(day, start, end)) continue
    const point = points.find((candidate) => candidate.channel === sale.type)
    if (point === undefined) continue
    point.count += 1
    totals.set(sale.type, (totals.get(sale.type) ?? 0) + saleTotalCents(sale))
  }
  for (const point of points) point.revenue = money(totals.get(point.channel) ?? 0)
  return points
}

function shipmentBreakdown(search: URLSearchParams): IShipmentBreakdown {
  const { start, end } = queryRange(search)
  const labels: Record<ShipmentMethod, string> = {
    cargotrans: "Cargotrans",
    delivery: "Delivery",
    pickup: "Pickup",
    unassigned: "Sin asignar",
  }
  const points: IShipmentBreakdown = (
    ["cargotrans", "delivery", "pickup", "unassigned"] as ShipmentMethod[]
  ).map((method) => ({ method, count: 0, label: labels[method] }))
  for (const sale of state.sales) {
    if (sale.status === "cancelled") continue
    const day = normalizeDay(sale.sale_date)
    if (day === null || !inRange(day, start, end)) continue
    const point = points.find((candidate) => candidate.method === sale.shipment_method)
    if (point !== undefined) point.count += 1
  }
  return points
}

// ---------------------------------------------------------------------------
// Router de mentira
// ---------------------------------------------------------------------------

/**
 * Atiende un path de la API (`/expenses`, `/sales/123/payments`) contra el
 * estado en memoria. Devuelve el cuerpo ya tipado o lanza `MockHttpError`.
 */
export async function handleMockRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = new URL(path, "http://mock.shopmar.local")
  const pathname = url.pathname
  const search = url.searchParams
  const method = (init?.method ?? "GET").toUpperCase()

  // Auth: la demo entra siempre con el usuario administrador. El login acepta
  // cualquier credencial no vacía para que la pantalla no quede inutilizable.
  if (pathname === "/auth/me" && method === "GET") {
    return ({ user: { ...USER } } satisfies IMeResponse) as T
  }
  if (pathname === "/auth/login" && method === "POST") {
    const body = parseBody<{ identifier?: string; password?: string }>(init)
    if ((body.identifier ?? "").trim() === "" || (body.password ?? "") === "") {
      throw new MockHttpError("UNAUTHORIZED", 401, "Invalid credentials")
    }
    return ({ user: { ...USER } } satisfies IMeResponse) as T
  }
  if (pathname === "/auth/logout" && method === "POST") {
    return undefined as T
  }

  if (pathname === "/dashboard/summary" && method === "GET") {
    return dashboardSummary(search) as T
  }
  if (pathname === "/dashboard/daily-series" && method === "GET") {
    return dailySeries(search) as T
  }
  if (pathname === "/dashboard/by-channel" && method === "GET") {
    return channelBreakdown(search) as T
  }
  if (pathname === "/dashboard/by-shipment" && method === "GET") {
    return shipmentBreakdown(search) as T
  }
  if (pathname === "/dashboard/packages/kpis" && method === "GET") {
    const { start, end } = queryRange(search)
    return packageKpis(start, end) as T
  }

  if (pathname === "/expenses" && method === "GET") {
    return listExpenses(search) as T
  }
  if (pathname === "/expenses" && method === "POST") {
    return createExpense(parseBody<ICreateExpenseRequest>(init)) as T
  }
  const expenseMatch = /^\/expenses\/([^/]+)$/.exec(pathname)
  if (expenseMatch !== null && method === "DELETE") {
    return removeExpense(decodeURIComponent(expenseMatch[1]!)) as T
  }

  if (pathname === "/customers" && method === "GET") {
    return listCustomers(search) as T
  }
  if (pathname === "/customers" && method === "POST") {
    return createCustomer(parseBody<ICreateCustomerRequest>(init)) as T
  }
  const customerMatch = /^\/customers\/([^/]+)$/.exec(pathname)
  if (customerMatch !== null) {
    const customerId = decodeURIComponent(customerMatch[1]!)
    if (method === "PATCH") {
      return updateCustomer(customerId, parseBody<IUpdateCustomerRequest>(init)) as T
    }
    if (method === "DELETE") return removeCustomer(customerId) as T
  }

  if (pathname === "/sales/with-details" && method === "GET") {
    const page = Number(search.get("page")) || 1
    const perPage = Math.min(Number(search.get("per_page")) || 100, 200)
    const all = sortedSales()
    const startIndex = (page - 1) * perPage
    const sales = all.slice(startIndex, startIndex + perPage).map(saleResponse)
    return ({
      sales,
      total: all.length,
      page,
      per_page: perPage,
      has_more: page * perPage < all.length,
    } satisfies ISalesWithDetailsResponse) as T
  }
  if (pathname === "/sales" && method === "GET") {
    return listSales(search) as T
  }
  if ((pathname === "/sales/live" || pathname === "/sales/whatsapp") && method === "POST") {
    return createSale(
      pathname,
      parseBody<ICreateLiveSaleRequest | ICreateWhatsappSaleRequest>(init),
    ) as T
  }

  const statusMatch = /^\/sales\/([^/]+)\/status$/.exec(pathname)
  if (statusMatch !== null && method === "PATCH") {
    return updateSaleStatus(
      decodeURIComponent(statusMatch[1]!),
      parseBody<{ status?: SaleStatus; amount_paid?: string }>(init),
    ) as T
  }

  const shipmentMatch = /^\/sales\/([^/]+)\/shipment-method$/.exec(pathname)
  if (shipmentMatch !== null && method === "PATCH") {
    const sale = requireSale(decodeURIComponent(shipmentMatch[1]!))
    const body = parseBody<{ shipment_method?: ShipmentMethod }>(init)
    if (body.shipment_method === undefined) {
      throw new MockHttpError("BAD_REQUEST", 400, "shipment_method: Required")
    }
    sale.shipment_method = body.shipment_method
    sale.updated_at = new Date().toISOString()
    return saleResponse(sale) as T
  }

  const paymentsMatch = /^\/sales\/([^/]+)\/payments$/.exec(pathname)
  if (paymentsMatch !== null && method === "POST") {
    return registerPayment(
      decodeURIComponent(paymentsMatch[1]!),
      parseBody<ICreateSalePaymentRequest>(init),
    ) as T
  }

  const paymentMatch = /^\/sales\/([^/]+)\/payments\/([^/]+)$/.exec(pathname)
  if (paymentMatch !== null && method === "DELETE") {
    return deletePayment(
      decodeURIComponent(paymentMatch[1]!),
      decodeURIComponent(paymentMatch[2]!),
    ) as T
  }

  const saleMatch = /^\/sales\/([^/]+)$/.exec(pathname)
  if (saleMatch !== null && method === "GET") {
    return saleResponse(requireSale(decodeURIComponent(saleMatch[1]!))) as T
  }

  throw new MockHttpError("NOT_FOUND", 404, `Mock endpoint not implemented: ${method} ${pathname}`)
}

/** Copia profunda del estado, para pruebas o depuración. */
export function __mockStateSnapshot(): MockState {
  return clone(state)
}
