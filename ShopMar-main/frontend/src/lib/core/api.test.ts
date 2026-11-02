import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
// La regla del 401 delega en `expireSession`; el módulo se mockea para fijar la
// delegación sin navegar de verdad en jsdom. El comportamiento de
// `expireSession` —borrar la copia, limpiar datos, volver a `/login`— se prueba
// en `lib/auth/session.test.ts` con su navegación inyectada.
import { expireSession } from "../auth/session"
import { ApiError, API_BASE, apiFetch, customersApi, dashboardApi, expensesApi, readCachedAt, salesApi } from "./api"
import { clearCache } from "./cache"

vi.mock("../auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/session")>()
  return { ...actual, expireSession: vi.fn() }
})

const API = "http://localhost:3000/api/v1"

const mockFetch = (
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) => {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init),
  )
  vi.stubGlobal("fetch", spy)
  return spy
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

// Deja correr las microtareas encadenadas de una revalidación de fondo sin
// usar temporizadores ni esperas reales.
const flushMicrotasks = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}

// Una `Response` que se resuelve a mano, para controlar cuándo termina un GET.
const deferredResponse = () => {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

afterEach(() => {
  clearCache()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("la base de la API (S1)", () => {
  // `.env.test` fija `PUBLIC_API_URL=http://localhost:3000/api/v1` y jsdom sirve
  // la página desde `http://localhost:3000`, así que es el mismo origen: la base
  // horneada se respeta y el resto de la suite sigue hablando con `API`. Lo que
  // este caso fija es que el valor **pasa por la regla** y no se reemplaza por
  // una constante: con otro origen y HTTPS, `resolveApiBase` lo reescribe.
  it("la base horneada del mismo origen se respeta tal cual", () => {
    expect(API_BASE).toBe(API)
  })
})

describe("la query", () => {
  it("un parámetro undefined NO aparece en la URL", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ sales: [] }))

    await salesApi.list({ start_date: "2026-09-01", end_date: undefined })

    expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/sales?start_date=2026-09-01`)
    expect(String(fetchSpy.mock.calls[0][0])).not.toContain("undefined")
  })

  

  it("sin filtros la URL queda pelada, sin interrogación colgante", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ expenses: [] }))

    await expensesApi.list()

    expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/expenses`)
  })

  it("la paginación viaja como page y per_page", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ sales: [], total: 0 }))

    await salesApi.list({ page: 2, per_page: 15 })

    expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/sales?page=2&per_page=15`)
  })

  it("include_kpis viaja como true y no como el booleano de JavaScript", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ sales: [], total: 0 }))

    await salesApi.list({ page: 1, per_page: 10, include_kpis: true })

    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${API}/sales?page=1&per_page=10&include_kpis=true`,
    )
  })

  it("el resumen usa el mismo rango y su propia ruta", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({}))

    await dashboardApi.getSummary({ start_date: "2026-09-01", end_date: "" })

    expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/dashboard/summary?start_date=2026-09-01`)
  })
})

describe("una respuesta con cuerpo", () => {
  it("un 201 con JSON devuelve el objeto tipado", async () => {
    const expense = {
      id: "e1",
      name: "Arriendo",
      description: null,
      total: "450000.00",
      expense_date: "2026-09-05T00:00:00.000Z",
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    }
    const fetchSpy = mockFetch(() => jsonResponse(expense, 201))

    const created = await expensesApi.create({
      name: "Arriendo",
      description: null,
      total: "450000.00",
      expense_date: "2026-09-05",
    })

    expect(created).toEqual(expense)
    expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/expenses`)
    expect(fetchSpy.mock.calls[0][1]?.method).toBe("POST")
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      name: "Arriendo",
      description: null,
      total: "450000.00",
      expense_date: "2026-09-05",
    })
  })

  it("un 204 sin cuerpo se resuelve sin lanzar", async () => {
    mockFetch(() => new Response(null, { status: 204 }))

    await expect(apiFetch("/sales/e1", { method: "DELETE" })).resolves.toBeUndefined()
  })
})

describe("el lote de detalle", () => {
  const lote = { sales: [], total: 0, page: 1, per_page: 100, has_more: false }

  it("apunta a /sales/with-details con page y per_page", async () => {
    const fetchSpy = mockFetch(() => jsonResponse(lote))

    await salesApi.listWithDetails({ page: 1, per_page: 100 })

    expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/sales/with-details?page=1&per_page=100`)
  })

  it("sin parámetros la URL queda pelada y el backend decide el tamaño", async () => {
    const fetchSpy = mockFetch(() => jsonResponse(lote))

    await salesApi.listWithDetails()

    expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/sales/with-details`)
  })

  it("devuelve las ventas completas más el total y has_more", async () => {
    const body = {
      sales: [{ id: "s1", customer_name: "Ana", additional_items: [] }],
      total: 5000,
      page: 1,
      per_page: 100,
      has_more: true,
    }
    mockFetch(() => jsonResponse(body))

    await expect(salesApi.listWithDetails({ page: 1, per_page: 100 })).resolves.toEqual(body)
  })
})

describe("una respuesta de error", () => {
  it("un 400 con el sobre produce un ApiError con el code y el message del backend", async () => {
    mockFetch(() =>
      jsonResponse(
        { code: "BAD_REQUEST", message: "name: Name is required" },
        400,
      ),
    )

    const error = await salesApi.getById("e1").catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe("BAD_REQUEST")
    expect((error as ApiError).status).toBe(400)
    expect((error as ApiError).message).toBe("name: Name is required")
  })

  it("un 400 con cuerpo NO parseable produce un ApiError genérico y no un error de parseo", async () => {
    mockFetch(
      () =>
        new Response("<!DOCTYPE html><html>502 Bad Gateway</html>", {
          status: 400,
          headers: { "Content-Type": "text/html" },
        }),
    )

    const error = await expensesApi.list().catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe("INTERNAL_ERROR")
    expect((error as ApiError).status).toBe(400)
    expect((error as ApiError).message).toBe("INTERNAL_ERROR")
  })

  it("un fetch que rechaza produce NETWORK_ERROR, que no es lo mismo que un error del servidor", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")))

    const error = await dashboardApi.getSummary().catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe("NETWORK_ERROR")
    expect((error as ApiError).status).toBe(0)
  })

  it("un 404 de getById propaga NOT_FOUND para que la pantalla redirija", async () => {
    mockFetch(() => jsonResponse({ code: "NOT_FOUND", message: "Sale not found" }, 404))

    const error = await salesApi.getById("no-existe").catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe("NOT_FOUND")
    expect((error as ApiError).status).toBe(404)
  })
})

describe("los verbos de escritura", () => {
  it("un DELETE sin cuerpo no manda Content-Type: Fastify rechaza un JSON vacío", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ message: "Cliente borrado" }))

    await customersApi.remove("c1")

    expect(fetchSpy.mock.calls[0][1]?.method).toBe("DELETE")
    expect(fetchSpy.mock.calls[0][1]?.body).toBeUndefined()
    const headers = (fetchSpy.mock.calls[0][1]?.headers ?? {}) as Record<string, string>
    expect(headers["Content-Type"]).toBeUndefined()
  })

  it("una escritura con cuerpo sí manda Content-Type", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ id: "c1" }))

    await customersApi.create({ name: "Ana" })

    const headers = (fetchSpy.mock.calls[0][1]?.headers ?? {}) as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/json")
  })

  it("updateStatus envía SOLO la clave status, porque el DTO es .strict()", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ id: "e1" }))

    await salesApi.updateStatus("e1", "completed")

    expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/sales/e1/status`)
    expect(fetchSpy.mock.calls[0][1]?.method).toBe("PATCH")
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      status: "completed",
    })
  })

  

  it("los dos POST de venta apuntan a su endpoint y no mandan el canal en el cuerpo", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ id: "e1" }))

    await salesApi.createLive({
      customer_name: "Ana",
      product_name: "Zapatillas",
      category: ["pantalones"],
      payment_method: "cash",
      cost: "1250.50",
    })
    await salesApi.createWhatsapp({
      customer_name: "Ana",
      product_name: "Zapatillas",
      category: ["pantalones"],
      payment_method: "cash",
      cost: "1250.50",
    })

    expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/sales/live`)
    expect(fetchSpy.mock.calls[1][0]).toBe(`${API}/sales/whatsapp`)
    for (const call of fetchSpy.mock.calls) {
      const body = JSON.parse(String(call[1]?.body))
      expect(body).not.toHaveProperty("type")
      expect(body).not.toHaveProperty("status")
      // La categoría viaja como lista: el DTO del backend rechaza el valor único.
      expect(body.category).toEqual(["pantalones"])
    }
  })

  it("manda el kind de cada renglón sin perderlo ni inventarlo", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ id: "e1" }))

    await salesApi.createWhatsapp({
      customer_name: "Ana",
      product_name: "Zapatillas",
      category: ["pantalones"],
      payment_method: "cash",
      cost: "1250.50",
      additional_items: [
        { name: "Segunda prenda", quantity: 1, total: "1500.00", kind: "merchandise" },
        { name: "Cinturón", quantity: 1, total: "300.00", kind: "additional" },
      ],
    })

    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))
    expect(body.additional_items.map((i: { kind: string }) => i.kind)).toEqual([
      "merchandise",
      "additional",
    ])
  })

  it("omite kind cuando el renglón no lo trae, sin mandarlo vacío", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ id: "e1" }))

    await salesApi.createWhatsapp({
      customer_name: "Ana",
      product_name: "Zapatillas",
      category: ["pantalones"],
      payment_method: "cash",
      cost: "1250.50",
      additional_items: [{ name: "Extra", quantity: 1, total: "300.00" }],
    })

    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))
    expect(body.additional_items[0]).not.toHaveProperty("kind")
  })

  it("los dos borrados usan DELETE y devuelven el mensaje del servidor", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ message: "deleted" }))

    await expensesApi.remove("e1")

    expect(fetchSpy.mock.calls[0][0]).toBe(`${API}/expenses/e1`)
    expect(fetchSpy.mock.calls[0][1]?.method).toBe("DELETE")
  })

  it("el resumen se devuelve plano, sin envolver en una clave", async () => {
    const summary = {
      total_revenue: "150000.00",
      sales_count: 12,
      total_expenses: "227900.00",
    }
    mockFetch(() => jsonResponse(summary))

    await expect(dashboardApi.getSummary()).resolves.toEqual(summary)
  })
})

describe("el encabezado que marca una respuesta de la caché", () => {
  it("lee X-ShopMar-Cached-At y cae en Last-Modified cuando el propio no está", () => {
    expect(
      readCachedAt(new Headers({ "X-ShopMar-Cached-At": "2026-10-10T14:30:00.000Z" })),
    ).toBe("2026-10-10T14:30:00.000Z")
    expect(readCachedAt(new Headers({ "Last-Modified": "2026-10-09T08:00:00.000Z" }))).toBe(
      "2026-10-09T08:00:00.000Z",
    )
    expect(readCachedAt(new Headers())).toBeNull()
  })

  it("avisa a la pantalla cuándo el dato viene de la caché", async () => {
    const events: Array<string | null> = []
    const listener = (event: Event) =>
      events.push((event as CustomEvent<{ at: string | null }>).detail.at)
    window.addEventListener("shopmar:stale-data", listener)

    mockFetch(
      () =>
        new Response(JSON.stringify({ sales: [] }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Last-Modified": "2026-10-10T14:30:00.000Z",
          },
        }),
    )

    await salesApi.list()
    window.removeEventListener("shopmar:stale-data", listener)

    expect(events).toEqual(["2026-10-10T14:30:00.000Z"])
  })

  it("avisa con null cuando el dato es fresco", async () => {
    const events: Array<string | null> = []
    const listener = (event: Event) =>
      events.push((event as CustomEvent<{ at: string | null }>).detail.at)
    window.addEventListener("shopmar:stale-data", listener)

    mockFetch(() => jsonResponse({ sales: [] }))

    await salesApi.list()
    window.removeEventListener("shopmar:stale-data", listener)

    expect(events).toEqual([null])
  })
})

describe("la caché de datos en memoria", () => {
  it("dos GET idénticos concurrentes comparten un solo pedido", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ sales: [] }))

    const [first, second] = await Promise.all([apiFetch("/sales"), apiFetch("/sales")])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
  })

  it("dos GET idénticos secuenciales dentro del umbral no repiten la red", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ sales: [{ id: "s1" }] }))

    const first = await apiFetch("/sales")
    const second = await apiFetch("/sales")

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
  })

  it("swr con una entrada vieja devuelve lo cacheado y revalida una sola vez en segundo plano", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"))
    let body: { sales: Array<{ id: string }> } = { sales: [{ id: "vieja" }] }
    const fetchSpy = mockFetch(() => jsonResponse(body))

    const first = await apiFetch("/sales")
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Un minuto después el umbral de revalidación ya se superó.
    vi.setSystemTime(new Date("2026-10-10T12:01:00.000Z"))
    body = { sales: [{ id: "nueva" }] }
    const second = await apiFetch("/sales")

    // Se devuelve lo viejo al instante y sale una sola revalidación de fondo.
    expect(second).toEqual(first)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    await flushMicrotasks()

    // El almacén quedó actualizado: la próxima lectura sirve lo nuevo sin red.
    const third = await apiFetch("/sales")
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(third).toEqual(body)
  })

  it("fresh ignora la entrada asentada y siempre va a la red", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ id: "s1" }))

    await apiFetch("/sales/s1", undefined, "fresh")
    await apiFetch("/sales/s1", undefined, "fresh")

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("swr y fresh concurrentes comparten el pedido en vuelo", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ id: "s1" }))

    const [bySwr, byFresh] = await Promise.all([
      apiFetch("/sales/s1"),
      apiFetch("/sales/s1", undefined, "fresh"),
    ])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(bySwr).toEqual(byFresh)
  })

  it("una escritura exitosa invalida la lectura siguiente", async () => {
    const fetchSpy = mockFetch((url) => {
      if (url.endsWith("/sales/x")) return jsonResponse({ id: "x" })
      if (url.endsWith("/expenses")) return jsonResponse({ id: "e1" }, 201)
      return jsonResponse({})
    })

    await apiFetch("/sales/x")
    await apiFetch("/expenses", { method: "POST", body: JSON.stringify({ name: "Arriendo" }) })
    await apiFetch("/sales/x")

    const reads = fetchSpy.mock.calls.filter(([url]) => String(url).endsWith("/sales/x"))
    expect(reads).toHaveLength(2)
  })

  it("un GET rechazado no se cachea y no queda en el mapa de pedidos en vuelo", async () => {
    const fetchSpy = mockFetch(() => Promise.reject(new TypeError("Failed to fetch")))

    const first = await apiFetch("/sales/x").catch((error: unknown) => error)
    const second = await apiFetch("/sales/x").catch((error: unknown) => error)

    expect(first).toBeInstanceOf(ApiError)
    expect((first as ApiError).code).toBe("NETWORK_ERROR")
    expect(second).toBeInstanceOf(ApiError)
    expect((second as ApiError).code).toBe("NETWORK_ERROR")
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("un error del servidor tampoco se cachea", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ code: "INTERNAL_ERROR" }, 500))

    await apiFetch("/sales/x").catch((error: unknown) => error)
    await apiFetch("/sales/x").catch((error: unknown) => error)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("al servir de la caché publica el at guardado y no uno nuevo", async () => {
    const events: Array<string | null> = []
    const listener = (event: Event) =>
      events.push((event as CustomEvent<{ at: string | null }>).detail.at)
    window.addEventListener("shopmar:stale-data", listener)

    mockFetch(
      () =>
        new Response(JSON.stringify({ sales: [] }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Last-Modified": "2026-10-10T14:30:00.000Z",
          },
        }),
    )

    await apiFetch("/sales")
    await apiFetch("/sales")
    window.removeEventListener("shopmar:stale-data", listener)

    expect(events).toEqual(["2026-10-10T14:30:00.000Z", "2026-10-10T14:30:00.000Z"])
  })

  it("un GET en vuelo no repuebla la caché después de una escritura", async () => {
    const pendingGet = deferredResponse()
    let getCount = 0
    const fetchSpy = mockFetch((_url, init) => {
      if (init?.method === "POST") return jsonResponse({ id: "e1" }, 201)
      getCount += 1
      if (getCount === 1) return pendingGet.promise
      return jsonResponse({ sales: [{ id: "posterior" }] })
    })

    // El GET sale a la red y queda en vuelo.
    const inFlight = apiFetch("/sales")

    // La escritura vacía la caché mientras el GET sigue en vuelo.
    await apiFetch("/expenses", { method: "POST", body: JSON.stringify({ name: "Arriendo" }) })

    // El GET resuelve con el dato previo a la escritura y se lo devuelve a quien lo pidió.
    pendingGet.resolve(jsonResponse({ sales: [{ id: "vieja" }] }))
    await expect(inFlight).resolves.toEqual({ sales: [{ id: "vieja" }] })

    // El GET siguiente tiene que ir otra vez a la red (no hay entrada repoblada),
    // y recibir el dato posterior a la escritura.
    const afterWrite = await apiFetch("/sales")

    expect(getCount).toBe(2)
    expect(afterWrite).toEqual({ sales: [{ id: "posterior" }] })
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith("/sales"))).toHaveLength(2)
  })
})

describe("dashboardApi.getDailySeries", () => {
  it("manda el reloj del cliente junto al rango", async () => {
    const fetchSpy = mockFetch(() => jsonResponse([]))

    await dashboardApi.getDailySeries({
      start_date: "2026-10-21",
      end_date: "2026-10-21",
      tz_offset: -360,
    })

    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${API}/dashboard/daily-series?start_date=2026-10-21&end_date=2026-10-21&tz_offset=-360`,
    )
  })
})

/**
 * Un gasto válido para el POST: la escritura exitosa es la que dispara el aviso
 * al service worker.
 */
const NEW_EXPENSE = {
  name: "Arriendo",
  description: null,
  total: "450000.00",
  expense_date: "2026-03-14",
}

/** Un `navigator.serviceWorker` con (o sin) worker controlando la página. */
function stubController(controller: { postMessage: (message: unknown) => void } | null): void {
  Object.defineProperty(navigator, "serviceWorker", {
    value: { controller },
    configurable: true,
  })
}

/**
 * Carga `public/sw.js` como lo haría el navegador: el archivo se sirve tal cual
 * —no pasa por el bundler, así que no puede importar módulos— y la única forma
 * de ejercitar su handler es evaluarlo con un `self` y un `caches` falsos.
 */
function loadServiceWorker(cachedKeys: string[] = []) {
  const listeners = new Map<string, (event: unknown) => void>()
  const deleted: string[] = []
  const puts: Request[] = []
  const self = {
    location: { origin: "http://localhost" },
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      listeners.set(type, handler)
    },
    skipWaiting: vi.fn(),
    clients: { claim: () => Promise.resolve() },
  }
  const caches = {
    open: async () => ({
      addAll: async () => undefined,
      match: async () => undefined,
      put: async (request: Request) => {
        puts.push(request)
      },
    }),
    keys: async () => cachedKeys,
    delete: async (name: string) => {
      deleted.push(name)
      return true
    },
  }
  // Vitest corre con la raíz del proyecto frontend como directorio de trabajo.
  const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8")
  new Function("self", "caches", source)(self, caches)
  // La versión que declara el archivo, para no repetirla en las pruebas.
  const version = /const VERSION = "([^"]+)"/.exec(source)?.[1] ?? ""
  return { listeners, deleted, self, puts, version, source }
}

describe("la caché de la API del service worker (S1)", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "serviceWorker")
  })

  it("una escritura exitosa avisa al service worker que borre su caché de API", async () => {
    const postMessage = vi.fn()
    stubController({ postMessage })
    mockFetch(() => jsonResponse({ id: "e1" }, 201))

    await expensesApi.create(NEW_EXPENSE)

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith({ type: "API_CACHE_CLEAR" })
  })

  it("un GET no avisa: sólo una escritura invalida la caché del service worker", async () => {
    const postMessage = vi.fn()
    stubController({ postMessage })
    mockFetch(() => jsonResponse({ sales: [], total: 0 }))

    await salesApi.list()

    expect(postMessage).not.toHaveBeenCalled()
  })

  it("una escritura fallida no avisa: el último dato bueno tiene que seguir en la caché", async () => {
    const postMessage = vi.fn()
    stubController({ postMessage })
    mockFetch(() => jsonResponse({ code: "BAD_REQUEST", message: "total: inválido" }, 400))

    await expensesApi.create(NEW_EXPENSE).catch(() => undefined)

    expect(postMessage).not.toHaveBeenCalled()
  })

  it("sin un worker controlando la página la escritura sigue funcionando igual", async () => {
    stubController(null)
    mockFetch(() => jsonResponse({ id: "e1" }, 201))

    await expect(expensesApi.create(NEW_EXPENSE)).resolves.toEqual({ id: "e1" })
  })
})

describe("el handler del service worker que vacía la caché de la API (S1)", () => {
  /** Manda un mensaje al worker cargado y espera lo que dejó pendiente. */
  async function send(data: unknown) {
    const worker = loadServiceWorker()
    const pending: Array<Promise<unknown>> = []
    const listener = worker.listeners.get("message")
    expect(listener).toBeDefined()
    listener?.({ data, waitUntil: (promise: Promise<unknown>) => pending.push(promise) })
    await Promise.all(pending)
    return worker
  }

  it("borra la caché de la API cuando llega el aviso de una escritura exitosa", async () => {
    const { deleted } = await send({ type: "API_CACHE_CLEAR" })

    expect(deleted).toHaveLength(1)
    // La caché de la API lleva la versión del worker en el nombre.
    expect(deleted[0]).toMatch(/^shopmar-api-/)
  })

  it("el aviso de versión nueva sigue funcionando y no borra la caché", async () => {
    const { deleted, self } = await send({ type: "SKIP_WAITING" })

    expect(self.skipWaiting).toHaveBeenCalledTimes(1)
    expect(deleted).toEqual([])
  })

  it("un mensaje desconocido no borra nada", async () => {
    const { deleted } = await send({ type: "OTRA_COSA" })

    expect(deleted).toEqual([])
  })
})

describe("la actualización del service worker (S1, S3)", () => {
  /** Dispara un evento de ciclo de vida del worker y espera lo que dejó pendiente. */
  async function fire(worker: ReturnType<typeof loadServiceWorker>, type: string) {
    const pending: Array<Promise<unknown>> = []
    const listener = worker.listeners.get(type)
    expect(listener).toBeDefined()
    listener?.({ waitUntil: (promise: Promise<unknown>) => pending.push(promise) })
    await Promise.all(pending)
  }

  it("declara una versión, y subirla es lo único que purga la caché", () => {
    const { version } = loadServiceWorker()

    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("instalar pide activarse ya, sin esperar un toque que en el teléfono nadie da", async () => {
    const worker = loadServiceWorker()

    await fire(worker, "install")

    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1)
  })

  it("activar borra toda caché de una versión anterior y conserva las vigentes", async () => {
    const worker = loadServiceWorker([
      "shopmar-shell-3.0.0",
      "shopmar-api-3.0.0",
      "shopmar-shell-4.0.0",
      `shopmar-shell-${loadServiceWorker().version}`,
      `shopmar-api-${loadServiceWorker().version}`,
    ])

    await fire(worker, "activate")

    const current = loadServiceWorker().version
    expect(worker.deleted).toEqual([
      "shopmar-shell-3.0.0",
      "shopmar-api-3.0.0",
      "shopmar-shell-4.0.0",
    ])
    expect(worker.deleted).not.toContain(`shopmar-shell-${current}`)
    expect(worker.deleted).not.toContain(`shopmar-api-${current}`)
  })
})

describe("la cookie de sesión viaja en toda petición (T6)", () => {
  it("un GET pide con credentials include: sin eso el navegador no manda la cookie", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ sales: [], total: 0 }))

    await salesApi.list()

    expect(fetchSpy.mock.calls[0][1]?.credentials).toBe("include")
  })

  it("una escritura también, incluido el login y el logout", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ message: "ok" }))

    await apiFetch("/auth/logout", { method: "POST" })
    await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ identifier: "ana" }) })

    expect(fetchSpy.mock.calls[0][1]?.credentials).toBe("include")
    expect(fetchSpy.mock.calls[1][1]?.credentials).toBe("include")
  })

  it("ninguna vista puede olvidarla: apiFetch la impone sobre la que reciba", async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ sales: [], total: 0 }))

    await apiFetch("/sales", { credentials: "omit" })

    expect(fetchSpy.mock.calls[0][1]?.credentials).toBe("include")
  })
})

describe("la regla del 401 (T6, D7)", () => {
  afterEach(() => {
    vi.mocked(expireSession).mockClear()
  })

  const unauthorized = () =>
    jsonResponse({ code: "UNAUTHORIZED", message: "Authentication required" }, 401)

  it("un 401 de cualquier pedido borra la sesión local y lanza el ApiError", async () => {
    mockFetch(unauthorized)

    const error = await salesApi.list().catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect((error as ApiError).code).toBe("UNAUTHORIZED")
    expect(vi.mocked(expireSession)).toHaveBeenCalledTimes(1)
  })

  it("un 403 no desloguea: la sesión es válida y lo que falta es un permiso", async () => {
    mockFetch(() => jsonResponse({ code: "FORBIDDEN", message: "Only an administrator" }, 403))

    await salesApi.list().catch(() => undefined)

    expect(vi.mocked(expireSession)).not.toHaveBeenCalled()
  })

  it("un error de red no desloguea: no dice nada sobre la validez de la cookie", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")))

    await salesApi.list().catch(() => undefined)

    expect(vi.mocked(expireSession)).not.toHaveBeenCalled()
  })

  it("el propio login declara que un 401 es credenciales inválidas y no sesión vencida", async () => {
    mockFetch(() => jsonResponse({ code: "UNAUTHORIZED", message: "Invalid credentials" }, 401))

    await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "ana", password: "mala" }),
      authRedirect: false,
    }).catch(() => undefined)

    expect(vi.mocked(expireSession)).not.toHaveBeenCalled()
  })
})

describe("el service worker no cachea la autenticación (T6)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Dispara el handler de `fetch` del worker con una URL y espera su respuesta. */
  async function fetchThroughWorker(path: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ user: { id: "u1" } })),
    )
    const worker = loadServiceWorker()
    const listener = worker.listeners.get("fetch")
    expect(listener).toBeDefined()
    let pending: Promise<Response> | undefined
    listener?.({
      request: new Request(`http://localhost${path}`),
      respondWith: (promise: Promise<Response>) => {
        pending = promise
      },
    })
    if (pending === undefined) throw new Error(`el worker no respondió a ${path}`)
    return { response: await pending, puts: worker.puts }
  }

  it("GET /auth/me va siempre a la red y no deja copia", async () => {
    const { response, puts } = await fetchThroughWorker("/api/v1/auth/me")

    expect(response.status).toBe(200)
    // Si el `me` se cacheara, después del logout un 200 viejo rompería la regla
    // del 401: el panel creería que la sesión sigue viva.
    expect(puts).toHaveLength(0)
  })

  it("el resto de la API sigue cacheándose como antes", async () => {
    const { puts } = await fetchThroughWorker("/api/v1/sales")

    expect(puts).toHaveLength(1)
  })
})
