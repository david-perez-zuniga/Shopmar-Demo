// Subir `VERSION` es la única forma de purgar la caché: el `activate` borra
// toda caché que no sea la de esta versión. Y como el navegador compara el
// archivo del service worker byte a byte, cualquier cambio acá (incluida esta
// constante) es un despliegue nuevo: instala, se activa y toma el control.
//
// 5.0.0 — el worker nuevo ya no espera. Antes quedaba en `waiting` hasta que
// alguien tocara el aviso de versión nueva, y en una PWA instalada en el
// teléfono ese toque no llega nunca: el panel se quedaba con el build anterior
// para siempre, con su HTML cacheado y sus chunks de `/_astro/` cacheados, así
// que ningún arreglo desplegado se veía. Lo que protegía el aviso era no
// cortarle una venta a medio cargar con una recarga, y eso lo sigue protegiendo
// `src/lib/shell/pwa.ts`: `controllerchange` sólo recarga si la persona aceptó,
// así que el panel abierto no se recarga solo. La venta a medio cargar tampoco
// se pierde: el borrador vive en `localStorage` (`sale-draft.ts`).
const VERSION = "5.0.0"

const SHELL_CACHE = `shopmar-shell-${VERSION}`
const API_CACHE = `shopmar-api-${VERSION}`
const OFFLINE_URL = "/offline"
// El armazón es **uno solo** para todas las rutas del panel (D1, D2): cada ruta
// sirve el mismo documento y lo que cambia es la plantilla que monta el router.
// Se guarda bajo esta clave canónica y se sirve a cualquier ruta desde acá, así
// una pantalla que nadie visitó todavía tampoco queda sin armazón.
const SHELL_URL = "/"
// Las rutas que sirven el armazón del panel. Son las mismas de
// `src/lib/app/router.ts` (el service worker no comparte módulos con la app, así
// que la lista se repite acá: una ruta nueva se suma en los dos lados). Cualquier
// otra dirección —`/offline`, el 404, marcadores viejos como `/sales/<id>`— no es
// una vista y conserva su propio documento: si el armazón se sirviera para todo,
// un enlace roto dejaría una pantalla vacía en vez de la página que explica la
// mudanza (D-017).
const PANEL_ROUTES = [
  "/",
  "/sales",
  "/sales/new",
  "/sales/detail",
  "/customers",
  "/packages",
  "/expenses",
  "/expenses/new",
  "/new",
]
const CACHED_AT = "X-ShopMar-Cached-At"
const NAV_TIMEOUT = 3000
const API_TIMEOUT = 2500

const SHELL_ASSETS = [
  OFFLINE_URL,
  // El armazón se precarga al instalar: la primera apertura después de un
  // despliegue no espera red para pintar el documento (D6). Las plantillas de
  // cada vista viajan dentro de este HTML.
  SHELL_URL,
  "/favicon.svg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
]

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function isShellAsset(pathname) {
  return (
    pathname === "/favicon.svg" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons/")
  )
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached !== undefined) return cached
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
  }
  return response
}

// La navegación sirve el armazón desde la caché **al instante** y revalida
// detrás (D6). Antes era red primero con un tope de 3 segundos, así que abrir el
// panel en frío —o tocar una tab desde otro documento— esperaba el ida y vuelta
// del HTML: eso es el delay que reportó la dueña (S1), y con el panel ya
// instalado como PWA se notaba en cada arranque.
//
// La copia guardada es una sola, bajo `SHELL_URL`: cualquier ruta del panel se
// responde con ella (no se mira la ruta ni la query, porque el HTML es idéntico
// y la URL la lee el script del cliente). Una ruta que nadie visitó no puede
// quedar sin armazón.
//
// Lo que no se pierde es el refresco. En segundo plano se pide el documento y,
// si contesta bien, se reemplaza la copia. `cache: "no-store"` es deliberado:
// con el caché HTTP del navegador de por medio, el armazón podía quedarse
// pegado al build anterior para siempre —el defecto de S52—, y el síntoma era
// que `Ctrl+Shift+R` mostraba la versión nueva y la recarga normal no.
async function handleNavigation(event) {
  const request = event.request
  const cache = await caches.open(SHELL_CACHE)
  const path = new URL(request.url).pathname.replace(/\/+$/, "")

  // `/offline` no es una vista del panel: es el documento de respaldo y tiene
  // que seguir existiendo como tal. Si se sirviera del armazón canónico, una
  // navegación sin copia no tendría adónde caer.
  if (path === OFFLINE_URL) {
    return networkFirstNavigation(request, cache, OFFLINE_URL)
  }

  // Una dirección que no es del panel (el 404, un marcador viejo) no se sirve
  // del armazón: va a la red como antes y no se guarda, así el servidor sigue
  // contestando lo suyo.
  if (!PANEL_ROUTES.includes(path)) {
    return networkFirstNavigation(request, cache, null)
  }

  const shell = await cache.match(SHELL_URL)
  if (shell !== undefined) {
    revalidateShell(event, cache, request)
    return shell
  }

  // Primera vez en esta versión: todavía no hay copia, así que la red es el
  // único camino. Se guarda bajo la clave canónica para que la próxima
  // navegación —a esta ruta o a cualquier otra— ya no espere.
  return networkFirstNavigation(request, cache, SHELL_URL)
}

/**
 * Red primero para el armazón que todavía no está en caché. Si la red no
 * contesta dentro del tope, o falla, se responde con la copia y en última
 * instancia con `/offline`.
 *
 * Una respuesta con estado de error se devuelve tal cual y no se guarda: no
 * conviene disfrazar un 500 del servidor de estáticos de una copia vieja, porque
 * eso esconde el problema. Con `key` en `null` no se guarda nada: es el camino
 * de los documentos que no son el armazón.
 */
async function networkFirstNavigation(request, cache, key) {
  try {
    const response = await withTimeout(fetch(request), NAV_TIMEOUT)
    if (key !== null && response.ok) {
      await cache.put(key, response.clone())
    }
    return response
  } catch (error) {
    const cached = key === null ? undefined : await cache.match(key, { ignoreSearch: true })
    if (cached !== undefined) return cached
    const offline = await cache.match(OFFLINE_URL)
    if (offline !== undefined) return offline
    throw error
  }
}

/**
 * Revalida el armazón en segundo plano, sin que la navegación espere.
 *
 * Se guarda sólo una respuesta ok; un error de la red o del servidor deja la
 * copia anterior en su lugar. `waitUntil` extiende la vida del evento para que
 * el pedido no se corte cuando la navegación termina; si el navegador ya cerró
 * ese ciclo la respuesta ya viajó igual, así que perder el refresco no puede
 * romper la pantalla.
 */
function revalidateShell(event, cache, request) {
  const refresh = fetch(request.url, { cache: "no-store", credentials: "same-origin" })
    .then((response) => (response.ok ? cache.put(SHELL_URL, response.clone()) : undefined))
    .catch(() => undefined)
  try {
    event.waitUntil(refresh)
  } catch (error) {
    // Sin ciclo de vida abierto no hay refresco, pero la respuesta ya se sirvió.
  }
}

async function handleApi(request) {
  // La autenticación no se cachea **nunca** (T6): si el `me` quedara guardado,
  // después del logout este handler podría servir un `200` viejo y el panel
  // creería que la sesión sigue viva, rompiendo la regla del 401. El resto de
  // la caché de API sigue igual.
  if (new URL(request.url).pathname.includes("/api/v1/auth/")) {
    return fetch(request)
  }

  const cache = await caches.open(API_CACHE)
  try {
    const response = await withTimeout(fetch(request), API_TIMEOUT)
    if (response.ok) {
      const stored = response.clone()
      const at = new Date().toISOString()
      const headers = new Headers(stored.headers)
      headers.set(CACHED_AT, at)
      headers.set("Last-Modified", at)
      await cache.put(
        request,
        new Response(stored.body, {
          status: stored.status,
          statusText: stored.statusText,
          headers,
        }),
      )
    }
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached !== undefined) {
      const at = cached.headers.get(CACHED_AT) ?? cached.headers.get("Last-Modified")
      const headers = new Headers(cached.headers)
      if (at !== null) {
        headers.set(CACHED_AT, at)
        headers.set("Last-Modified", at)
      }
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      })
    }
    throw error
  }
}

self.addEventListener("install", (event) => {
  // Instalar precarga el armazón y pide activarse ya. `skipWaiting` va dentro del
  // `waitUntil` para que la activación no pueda adelantarse a la precarga: si el
  // worker tomara el control con `SHELL_CACHE` a medio llenar, la primera
  // navegación caería al camino de red sin copia. La recarga por
  // `controllerchange` está desactivada salvo aceptación explícita
  // (`pwa.ts`), así que activar solo no interrumpe a nadie.
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
      self.skipWaiting(),
    ]),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== SHELL_CACHE && name !== API_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("message", (event) => {
  const data = event.data
  if (data === null || data === undefined) return

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting()
    return
  }

  // Una escritura exitosa no puede quedar tapada por una copia previa: `api.ts`
  // manda este aviso después de cada POST/PATCH/DELETE exitoso y acá se borra
  // la caché de la API entera. Sin esto, el `handleApi` de arriba —que responde
  // con la copia guardada cuando la red tarda más de 2,5 segundos o falla—
  // devolvía la lista anterior a la escritura, así que una venta recién
  // registrada no aparecía en la tabla (S1). Borrar por `VERSION` en `activate`
  // no alcanza: eso pasa una vez por despliegue, no por escritura. Se borra la
  // caché completa y no la entrada de la ruta escrita porque la respuesta de un
  // alta invalida más de lo que escribe: los listados, los KPIs del período y el
  // resumen del dashboard.
  if (data.type === "API_CACHE_CLEAR") {
    event.waitUntil(caches.delete(API_CACHE))
  }
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin
  const isDocument =
    request.mode === "navigate" ||
    (sameOrigin &&
      request.destination === "" &&
      !url.pathname.startsWith("/_astro/") &&
      !url.pathname.includes("/api/") &&
      !isShellAsset(url.pathname))

  if (isDocument) {
    event.respondWith(handleNavigation(event))
    return
  }

  if (sameOrigin && url.pathname.startsWith("/_astro/")) {
    event.respondWith(cacheFirst(request, SHELL_CACHE))
    return
  }

  if (url.origin === self.location.origin && isShellAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE))
    return
  }

  if (url.pathname.includes("/api/")) {
    event.respondWith(handleApi(request))
    return
  }
})
