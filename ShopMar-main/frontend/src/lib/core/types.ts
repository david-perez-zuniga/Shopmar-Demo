export type IMoney = string
export type IDateString = string

export type SaleType = "live" | "whatsapp"
export type SaleStatus = "pending" | "completed" | "cancelled"
export type PaymentMethod = "cash" | "credit_card"
// Cuándo se paga (D-022): al momento (contado) o después (crédito). No se
// confunde con `PaymentMethod`, que dice con qué se paga.
export type PaymentTerms = "immediate" | "credit"
export type AdditionalSaleKind = "merchandise" | "additional"
export type ShipmentMethod = "cargotrans" | "delivery" | "pickup" | "unassigned"
export type SaleCategory = "pantalones" | "camisas" | "chaquetas" | "sudaderas"

export interface IErrorEnvelope {
  code: string
  message?: string
}

export interface IMessageResponse {
  message: string
}

/** Los dos roles del sistema (`07-auth.md`). El servidor los exige igual. */
export type UserRole = "admin" | "seller"

/**
 * El usuario que devuelven `POST /auth/login` y `GET /auth/me`, y lo único que
 * el panel guarda como copia local de la sesión (T6). No lleva token: la
 * cookie `HttpOnly` es la sesión, esto es solo lo que el panel sabe de ella.
 */
export interface IUser {
  id: string
  username: string
  email: string
  role: UserRole
}

/** El sobre compartido por el login y el `me`: `{ user }`. */
export interface IMeResponse {
  user: IUser
}

export interface IDashboardSummary {
  total_revenue: IMoney
  sales_count: number
  total_expenses: IMoney
  // Caja medida por `paid_at`, no por `sale_date`: una venta a crédito de enero
  // cobrada en marzo aparece acá en marzo (D-022).
  collected_revenue: IMoney
  // Saldo de las ventas a crédito del rango y su parte vencida.
  outstanding_receivables: IMoney
  overdue_receivables: IMoney
}

export interface ISalePaymentResponse {
  id: string
  sale_id: string
  amount: IMoney
  paid_at: IDateString
  payment_method: PaymentMethod
  payment_bank: string | null
  note: string | null
  created_at: IDateString
  updated_at: IDateString
}

export interface ICustomerResponse {
  id: string
  name: string
  phone: string | null
  note: string | null
  created_at: IDateString
  updated_at: IDateString
}

export interface ICustomerWithBalances extends ICustomerResponse {
  // Derivados de las ventas a crédito vivas con saldo: nunca se guardan.
  outstanding_balance: IMoney
  overdue_balance: IMoney
}

export interface IPackageKpis {
  total: number
  cargotrans: number
  delivery: number
  pickup: number
  unassigned: number
}

export interface IAdditionalSaleResponse {
  id: string
  sale_id: string
  name: string
  description: string | null
  quantity: number
  total: IMoney
  kind: AdditionalSaleKind
  created_at: IDateString
  updated_at: IDateString
}

export interface ISaleResponse {
  id: string
  type: SaleType
  customer_name: string
  product_name: string
  // La venta agrupa varias categorías (S1, S2): es la lista del catálogo que
  // devuelve la API, no un valor único. La pantalla no la muestra (S3).
  category: SaleCategory[]
  payment_method: PaymentMethod
  payment_bank: string | null
  sale_date: IDateString
  status: SaleStatus
  cost: IMoney
  shipment_method: ShipmentMethod
  amount_paid: IMoney | null
  change_given: IMoney | null
  created_at: IDateString
  updated_at: IDateString
  additional_items: IAdditionalSaleResponse[]
  additional_count: number
  total: IMoney
  // Condición de pago y cuenta por cobrar (D-022).
  customer_id: string | null
  payment_terms: PaymentTerms
  due_date: IDateString | null
  // `paid_total` es la suma del libro de pagos y la única fuente del saldo.
  paid_total: IMoney
  // Nulo en una venta de contado: un pendiente de contado no es una deuda.
  balance: IMoney | null
  // Se calcula contra la fecha de hoy; nunca se guarda.
  is_overdue: boolean
  payments: ISalePaymentResponse[]
  payments_count: number
}

export interface ISaleListRow {
  id: string
  sale_date: IDateString
  customer_name: string
  product_name: string
  type: SaleType
  status: SaleStatus
  cost: IMoney
  payment_method: PaymentMethod
  shipment_method: ShipmentMethod
  additional_count: number
  total: IMoney
  customer_id: string | null
  payment_terms: PaymentTerms
  due_date: IDateString | null
  paid_total: IMoney
  balance: IMoney | null
  is_overdue: boolean
}

// Lote de detalle: muchas ventas con la forma completa de ISaleResponse más el
// total del conjunto y si quedan páginas. Lo consume el build para generar las
// páginas /sales/[id] sin pedir una venta por HTTP a la vez.
export interface ISalesWithDetailsResponse {
  sales: ISaleResponse[]
  total: number
  page: number
  per_page: number
  has_more: boolean
}

export interface IExpenseResponse {
  id: string
  name: string
  description: string | null
  total: IMoney
  expense_date: IDateString
  created_at: IDateString
  updated_at: IDateString
}

export interface ICreateLiveSaleRequest {
  // O el cliente registrado (`customer_id`, obligatorio con crédito) o el nombre
  // libre de una venta de contado. Nunca los dos.
  customer_name?: string
  customer_id?: string
  payment_terms?: PaymentTerms
  // Obligatorio con `payment_terms: "credit"`.
  due_date?: string
  // Cobro en el mostrador: `completed` exige `amount_paid` (S9).
  status?: "pending" | "completed"
  amount_paid?: IMoney
  // Teléfono del cliente, cuando el formulario lo pide con el checkbox: el
  // servidor lo guarda en el cliente y la venta viaja en la misma llamada (S23).
  customer_phone?: string
  product_name: string
  // Opcional desde S47: el campo se retiró del formulario y la API guarda un
  // arreglo vacío cuando la clave no viaja. Si viaja, sigue siendo una lista del
  // catálogo y sin repetidas. La respuesta la sigue devolviendo (ISaleResponse).
  category?: SaleCategory[]
  // Condicional desde S57: obligatorio en contado y **prohibido** en crédito,
  // donde cada pago registra el suyo y el servidor guarda `cash` de registro.
  payment_method?: PaymentMethod
  payment_bank?: string
  sale_date?: string
  cost: IMoney
  additional_items?: ICreateAdditionalSaleRequest[]
}

export interface ICreateAdditionalSaleRequest {
  name: string
  description?: string
  quantity?: number
  total: IMoney
  kind?: AdditionalSaleKind
}

export interface ICreateWhatsappSaleRequest extends ICreateLiveSaleRequest {}

export interface ICreateSalePaymentRequest {
  amount: IMoney
  paid_at?: string
  payment_method: PaymentMethod
  payment_bank?: string | null
  note?: string | null
}

export interface ICreateCustomerRequest {
  name: string
  phone?: string | null
  note?: string | null
}

export interface IUpdateCustomerRequest {
  name?: string
  phone?: string | null
  note?: string | null
}

export interface ICreateExpenseRequest {
  name: string
  description?: string | null
  total: IMoney
  expense_date?: string
}
export interface IDailySeriesPoint {
  date: IDateString
  income: IMoney
  expense: IMoney
  label: string
}
export type IDailySeries = IDailySeriesPoint[]

export interface IChannelBreakdownPoint {
  channel: "whatsapp" | "live"
  count: number
  revenue: IMoney
  label: string
}
export type IChannelBreakdown = IChannelBreakdownPoint[]

export interface IShipmentBreakdownPoint {
  method: ShipmentMethod
  count: number
  label: string
}
export type IShipmentBreakdown = IShipmentBreakdownPoint[]
