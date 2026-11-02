import type {
  ICreateCustomerRequest,
  ICreateExpenseRequest,
  ICreateLiveSaleRequest,
  ICreateSalePaymentRequest,
  ICreateWhatsappSaleRequest,
  ICustomerResponse,
  ICustomerWithBalances,
  IDashboardSummary,
  IDailySeries,
  IChannelBreakdown,
  IShipmentBreakdown,
  IErrorEnvelope,
  IExpenseResponse,
  IMessageResponse,
  IPackageKpis,
  ISaleListRow,
  ISaleResponse,
  ISalesWithDetailsResponse,
  IUpdateCustomerRequest,
  SaleStatus,
} from "./types"
import {
  REVALIDATE_AFTER_MS,
  type CachePolicy,
  cacheKeyFor,
  clearCache,
  clearInflight,
  currentGeneration,
  inflightRequest,
  isCacheable,
  readEntry,
  shouldRevalidate,
  trackInflight,
  writeEntry,
} from "./cache"
import { expireSession } from "../auth/session"
import { resolveApiBase, type IPageOrigin } from "./api-base"
import { handleMockRequest, isMockApiEnabled, MockHttpError } from "./mock-api"

export type { CachePolicy } from "./cache"

/**
 * El origen de la página, o `null` cuando no hay navegador (SSR, build).
 * `location.origin` no existe en todos los documentos: se arma con lo que sí.
 */
function pageOrigin(): IPageOrigin | null {
  if (typeof window === "undefined") return null
  const { origin, protocol } = window.location
  if (origin === undefined || origin === "") return null
  return { origin, protocol }
}

/**
 * La base de la API, resuelta en el navegador y no sólo en el build (S1):
 * `api-base.ts` explica por qué una URL absoluta de otro origen sobre HTTPS se
 * reescribe al camino relativo —si no, la cookie de sesión viaja como cookie de
 * terceros y el `me` devuelve 401—. Se exporta para poder comprobar que el valor
 * horneado pasó por esa regla.
 */
export const API_BASE = resolveApiBase(
  import.meta.env.PUBLIC_API_URL as string | undefined,
  pageOrigin(),
)

/**
 * Lo mismo que `RequestInit` más una perilla del panel: `authRedirect`.
 *
 * La regla del `401` —borrar la sesión local y volver a `/login`— vive en
 * `apiFetch`, así que ninguna vista la repite. Las dos excepciones son pedidos
 * que **esperan** un `401` como respuesta legítima: el login (credenciales
 * inválidas) y el `me` bloqueante del guard (que decide él y no debe navegar
 * antes de montar). Esas dos pasan `authRedirect: false`.
 */
export interface IApiInit extends RequestInit {
  authRedirect?: boolean
}

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message?: string,
  ) {
    super(message ?? code)
    this.name = "ApiError"
  }
}

export function readCachedAt(headers: Headers): string | null {
  const value = headers.get("X-ShopMar-Cached-At") ?? headers.get("Last-Modified")
  return value === null || value === "" ? null : value
}

export async function apiFetch<T>(
  path: string,
  init?: IApiInit,
  policy: CachePolicy = "swr",
): Promise<T> {
  const url = `${API_BASE}${path}`
  const method = init?.method ?? "GET"

  // Toda escritura exitosa vacía la caché entera: es la forma barata de no
  // mostrar un dato con el estado de hace un minuto. Un fallo no la vacía.
  if (!isCacheable(method)) {
    const { data } = await requestFromNetwork<T>(url, init, true)
    clearCache()
    clearServiceWorkerCache()
    return data
  }

  return cachedGet<T>(cacheKeyFor(method, url), url, init, policy)
}

/**
 * Avisa al service worker que borre su propia caché de la API (S1).
 *
 * `clearCache()` limpia la copia en memoria de la pestaña, pero el service
 * worker guarda la respuesta HTTP completa y la sirve cuando la red tarda más
 * de 2,5 segundos o falla. Sin este aviso, un GET lento después de registrar una
 * venta devolvía la lista **anterior** a la escritura, y la venta recién
 * registrada no aparecía en la tabla. Va sólo después de una escritura exitosa,
 * con las dos guardas de abajo: en SSR no hay `navigator`, y sin service worker
 * registrado o sin worker controlando la página no hay a quién avisarle.
 *
 * El mensaje lo escucha el handler de `public/sw.js` con este mismo `type`.
 * También lo usa el logout (T6): al cerrar sesión no puede quedar una respuesta
 * cacheada que el próximo usuario vea como propia.
 */
export function clearServiceWorkerCache(): void {
  if (typeof navigator === "undefined") return
  // Puede no existir: navegador viejo, o modo privado sin service workers.
  const container: ServiceWorkerContainer | undefined = navigator.serviceWorker
  container?.controller?.postMessage({ type: "API_CACHE_CLEAR" })
}

function publishStale(at: string | null): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("shopmar:stale-data", { detail: { at } }))
}

type NetworkResult<T> = { data: T; at: string | null }

async function requestFromNetwork<T>(
  url: string,
  init: IApiInit | undefined,
  publish: boolean,
): Promise<NetworkResult<T>> {
  // La perilla del panel no se manda a `fetch`: es nuestra, no del navegador.
  const { authRedirect = true, ...requestInit } = init ?? {}

  // Modo demo: no hay servidor. El path se resuelve contra el estado en memoria
  // que vive en `mock-api.ts`; la caché, las escrituras y los errores siguen
  // pasando por la misma capa que con una API real.
  if (isMockApiEnabled()) {
    try {
      const data = await handleMockRequest<T>(url.slice(API_BASE.length), requestInit)
      return { data, at: null }
    } catch (error) {
      if (error instanceof MockHttpError) {
        if (error.status === 401 && authRedirect) expireSession()
        throw new ApiError(error.code, error.status, error.message)
      }
      throw error
    }
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...requestInit,
      // La cookie `HttpOnly` de la sesión viaja en **todas** las peticiones, sin
      // que ninguna vista lo recuerde: sin esto el navegador no la manda en un
      // pedido cross-origin y todo `/api/v1` responde `401` (T6).
      credentials: "include",
      // `Content-Type: application/json` sólo cuando hay cuerpo. Un DELETE sin
      // cuerpo con esa cabecera lo rechaza Fastify con
      // `FST_ERR_CTP_EMPTY_JSON_BODY` (400), y el borrado de un recurso no tiene
      // nada que enviar.
      headers: {
        ...(requestInit.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...requestInit.headers,
      },
    })
  } catch {
    throw new ApiError("NETWORK_ERROR", 0)
  }

  const at = readCachedAt(response.headers)
  // La revalidación de fondo no publica: lo que ve la pantalla sigue siendo el
  // dato cacheado, y el aviso de datos viejos tiene que seguir diciendo la verdad.
  if (publish) publishStale(at)

  if (!response.ok) {
    const body: IErrorEnvelope | null = await response.json().catch(() => null)
    // La regla de oro (T6, D7): un `401` es el servidor diciendo que la sesión
    // no vale, así que se borra la copia local y se vuelve a `/login`. Un 403,
    // un 5xx o un error de red no dicen eso y no desloguean a nadie.
    if (response.status === 401 && authRedirect) expireSession()
    throw new ApiError(body?.code ?? "INTERNAL_ERROR", response.status, body?.message)
  }

  if (response.status === 204) return { data: undefined as T, at }
  return { data: (await response.json()) as T, at }
}

// Un solo pedido por clave en vuelo: dos llamadas idénticas comparten el mismo
// `Promise`. Sólo se guarda lo que resuelve; un rechazo nunca se cachea.
function loadCached<T>(
  key: string,
  url: string,
  init: IApiInit | undefined,
  publish: boolean,
): Promise<T> {
  const existing = inflightRequest<T>(key)
  if (existing !== undefined) return existing

  // La generación se captura antes de salir a la red. Si una escritura vació la
  // caché mientras el pedido estaba en vuelo, el dato se devuelve igual a quien
  // lo pidió, pero no repuebla la caché con un valor previo a la escritura.
  const generation = currentGeneration()

  const request = requestFromNetwork<T>(url, init, publish)
    .then(({ data, at }) => {
      if (generation === currentGeneration()) {
        writeEntry(key, { data, at, storedAt: Date.now() })
      }
      return data
    })
    .finally(() => {
      if (inflightRequest(key) === request) clearInflight(key)
    })

  trackInflight(key, request)
  return request
}

async function cachedGet<T>(
  key: string,
  url: string,
  init: IApiInit | undefined,
  policy: CachePolicy,
): Promise<T> {
  // `fresh` ignora la entrada asentada y siempre va a la red. Puede compartir un
  // pedido en vuelo con `swr`, pero nunca recibe un valor cacheado.
  if (policy === "swr") {
    const entry = readEntry<T>(key)
    if (entry !== undefined) {
      if (shouldRevalidate(Date.now() - entry.storedAt, REVALIDATE_AFTER_MS)) {
        void loadCached<T>(key, url, init, false).catch(() => undefined)
      }
      publishStale(entry.at)
      return entry.data
    }
  }

  return loadCached<T>(key, url, init, true)
}

export type ISalesListParams = {
  start_date?: string
  end_date?: string
  type?: string
  status?: string
  shipment_method?: string
  payment_terms?: string
  customer_id?: string
  // Sólo ventas a crédito con saldo y vencimiento pasado.
  overdue?: boolean
  page?: number
  per_page?: number
  include_kpis?: boolean
}

export type ISalesListResponse = {
  sales: ISaleListRow[]
  total: number
  kpis?: IPackageKpis
}

export type ISalesWithDetailsParams = {
  page?: number
  per_page?: number
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value))
  }
  const query = search.toString()
  return query === "" ? "" : `?${query}`
}

export const salesApi = {
  list(params: ISalesListParams = {}): Promise<ISalesListResponse> {
    return apiFetch(`/sales${buildQuery(params)}`)
  },

  // Detalle en lote: una llamada trae muchas ventas completas, para que el
  // build no pida una por página. El nombre espeja la ruta del backend.
  listWithDetails(params: ISalesWithDetailsParams = {}): Promise<ISalesWithDetailsResponse> {
    return apiFetch(`/sales/with-details${buildQuery(params)}`)
  },

  getById(id: string, policy: CachePolicy = "swr"): Promise<ISaleResponse> {
    return apiFetch(`/sales/${id}`, undefined, policy)
  },

  updateStatus(id: string, status: SaleStatus, amountPaid?: string): Promise<ISaleResponse> {
    return apiFetch(`/sales/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, ...(amountPaid === undefined ? {} : { amount_paid: amountPaid }) }),
    })
  },

  updateShipmentMethod(id: string, shipment_method: string): Promise<ISaleResponse> {
    return apiFetch(`/sales/${id}/shipment-method`, {
      method: "PATCH",
      body: JSON.stringify({ shipment_method }),
    })
  },

  createLive(data: ICreateLiveSaleRequest): Promise<ISaleResponse> {
    return apiFetch("/sales/live", { method: "POST", body: JSON.stringify(data) })
  },

  createWhatsapp(data: ICreateWhatsappSaleRequest): Promise<ISaleResponse> {
    return apiFetch("/sales/whatsapp", { method: "POST", body: JSON.stringify(data) })
  },

  registerPayment(id: string, data: ICreateSalePaymentRequest): Promise<ISaleResponse> {
    return apiFetch(`/sales/${id}/payments`, { method: "POST", body: JSON.stringify(data) })
  },

  deletePayment(id: string, paymentId: string): Promise<ISaleResponse> {
    return apiFetch(`/sales/${id}/payments/${paymentId}`, { method: "DELETE" })
  },
}

export type ICustomersListParams = {
  q?: string
  include_balances?: boolean
}

export const customersApi = {
  list(params: ICustomersListParams = {}): Promise<{ customers: ICustomerWithBalances[] }> {
    return apiFetch(`/customers${buildQuery(params)}`)
  },

  create(data: ICreateCustomerRequest): Promise<ICustomerResponse> {
    return apiFetch("/customers", { method: "POST", body: JSON.stringify(data) })
  },

  update(id: string, data: IUpdateCustomerRequest): Promise<ICustomerResponse> {
    return apiFetch(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) })
  },

  remove(id: string): Promise<IMessageResponse> {
    return apiFetch(`/customers/${id}`, { method: "DELETE" })
  },
}

export type IExpensesListParams = {
  start_date?: string
  end_date?: string
}

export type IDashboardSummaryParams = {
  start_date?: string
  end_date?: string
  /** Minutos al este de UTC del navegador; lo usa la serie horaria del gráfico. */
  tz_offset?: number
}

export const expensesApi = {
  list(params: IExpensesListParams = {}): Promise<{ expenses: IExpenseResponse[] }> {
    return apiFetch(`/expenses${buildQuery(params)}`)
  },

  create(data: ICreateExpenseRequest): Promise<IExpenseResponse> {
    return apiFetch("/expenses", { method: "POST", body: JSON.stringify(data) })
  },

  remove(id: string): Promise<IMessageResponse> {
    return apiFetch(`/expenses/${id}`, { method: "DELETE" })
  },
}

export const dashboardApi = {
  getSummary(params: IDashboardSummaryParams = {}): Promise<IDashboardSummary> {
    return apiFetch(`/dashboard/summary${buildQuery(params)}`)
  },

  getPackageKpis(params: IDashboardSummaryParams = {}): Promise<IPackageKpis> {
    return apiFetch(`/dashboard/packages/kpis${buildQuery(params)}`)
  },

  getDailySeries(params: IDashboardSummaryParams = {}): Promise<IDailySeries> {
    return apiFetch(`/dashboard/daily-series${buildQuery(params)}`)
  },

  getChannelBreakdown(params: IDashboardSummaryParams = {}): Promise<IChannelBreakdown> {
    return apiFetch(`/dashboard/by-channel${buildQuery(params)}`)
  },

  getShipmentBreakdown(params: IDashboardSummaryParams = {}): Promise<IShipmentBreakdown> {
    return apiFetch(`/dashboard/by-shipment${buildQuery(params)}`)
  },
}
