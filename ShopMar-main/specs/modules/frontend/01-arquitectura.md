# Arquitectura del frontend

## Stack, versiones y comandos

| Pieza | Versión | Por qué |
|--------|---------|---------|
| `astro` | `^7.2.1` | Genera HTML estático en build. El panel son páginas estáticas sin render por request, así que no hace falta un adaptador de servidor ni SSR. |
| `typescript` | `^6.0.3` | Tipado de los `.astro`, de los helpers de `src/lib/` y de los scripts. En un proyecto sin framework, el compilador es la única red de seguridad. |
| `lucide-astro` | `^0.556.0` | Set de iconos tree-shakeable como componentes `.astro`. Es la única dependencia de UI del proyecto. |
| `@astrojs/check` | `^0.9.10` | `astro check` valida los `.astro` en CI local. |

| Comando | Qué hace |
|---------|----------|
| `pnpm install` | Instala dependencias. |
| `pnpm run dev` | `astro dev` — servidor de desarrollo con recarga. |
| `pnpm run build` | `astro build` — produce `dist/`. |
| `pnpm run preview` | Sirve `dist/` localmente para verificar el build. |
| `pnpm exec astro check` | Verificación de tipos y plantillas `.astro`. |

**Presupuesto de dependencias: cero.** No se agregan frameworks de UI, librerías de estado, clientes HTTP, librerías de fechas, ni frameworks de pruebas de navegador. Cualquier necesidad se resuelve con la plataforma: `fetch`, `Intl.DateTimeFormat` para formatear fechas, `Intl.NumberFormat` para importes, `URLSearchParams` para la query de `/sales/new`, y scripts nativos. La justificación completa está en `06-testing.md` y en la decisión D-005 de `docs/07-decisiones.md`.

## La idea en una frase

Un **solo documento estático** (`src/components/App.astro`, generado en build time) que lleva el armazón y, en plantillas `<template data-view>`, el HTML de las nueve vistas; un router propio de History API (`src/lib/app/`) clona la plantilla de la ruta en `[data-app-root]`, así que cambiar de pantalla no pide red; cada vista pide sus datos a la API al montarse (con skeletons mientras espera), y todo el comportamiento de la interfaz vive en `<script type="module">` nativo. Sin framework, sin store, sin servidor. Cada ruta del panel es un archivo de cinco líneas que sirve ese mismo documento con su vista declarada (D-023, que enmienda D-005 y reemplaza D-019).

## El árbol de archivos objetivo

```
frontend/
├── .env.example              # agrega PUBLIC_API_URL
├── astro.config.mjs          # sin adaptador, output estático
├── package.json              # astro + lucide-astro, nada más
├── tsconfig.json
└── src/
    ├── layouts/
    │   └── Layout.astro      # shell: <head>, tokens, barra lateral, script común
    ├── lib/
    │   ├── app/              # el router de la SPA (D-023)
    │   │   ├── router.ts     # tabla de rutas pura: viewForPath/hrefFor, VIEW_TITLES, VIEW_WIDE
    │   │   ├── start.ts      # arranque: intercepta clics, mueve la URL antes de montar, popstate, pushQuery
    │   │   ├── view-state.ts # la última consulta de cada lista, recordada por ruta (S58)
    │   │   └── views.ts      # registro de vistas: mount(root) → cleanup, desmonta antes de montar
    │   ├── views/            # el comportamiento de cada vista: mount<X>(root)
    │   │   ├── index.ts      # registerViews: las nueve vistas registradas
    │   │   ├── sales-list.ts · packages-list.ts · expenses-list.ts · customers-list.ts
    │   │   └── sale-new.ts · expense-new.ts · sale-detail.ts · summary.ts · new.ts
    │   ├── core/             # plataforma y primitivas: ninguna conoce una pantalla
    │   │   ├── api.ts        # fetch, sobre de error y caché en memoria; el único lugar donde hay fetch
    │   │   ├── cache.ts      # política de caché (pura) y almacén (entradas, pedidos en vuelo, clear)
    │   │   ├── types.ts      # formas de los tipos de la API; importes como string (D-003)
    │   │   ├── errors.ts     # getErrorMessage / getFieldErrors y la traducción de códigos
    │   │   ├── format.ts     # dinero (miles con punto, decimales con coma), fechas y enums en español
    │   │   ├── date.ts       # todayLocal: el día de HOY en hora local
    │   │   ├── dom.ts        # helpers de DOM: qs, on, setText, clear
    │   │   ├── icons.ts      # CARET: el SVG del caret del <select>, compartido por ventas y paquetes
    │   │   ├── storage.ts    # safeLocalStorage y safeSessionStorage: el almacenamiento que puede lanzar
    │   │   └── page-load.ts  # ciclo de vida del script de página (onPageLoad)
    │   ├── lists/            # las pantallas de listado
    │   │   ├── list-state.ts # createListStatePainter: pintado de carga / vacío / error
    │   │   ├── filters.ts    # lectura de la query: filtros y página
    │   │   ├── filter-controls.ts # hidratación y submit de los controles de filtro
    │   │   ├── pagination.ts # totalPages, pageRange, footerText y el cableado del pie
    │   │   └── table-pager.ts # paginador de los listados
    │   ├── sales/            # los flujos de venta
    │   │   ├── sale-status.ts    # estado de venta: look puro + capa DOM del <select>
    │   │   ├── sale-list-row.ts  # fila del listado: saleListRowView puro + renderSaleListRow
    │   │   ├── sale-rows.ts      # filas de adicionales del formulario de venta nueva
    │   │   ├── confirm-dialog.ts # diálogo de confirmación del cambio de estado
    │   │   ├── sales-kpi.ts      # indicadores del listado de ventas
    │   │   ├── payment.ts        # centavos, evaluación del pago y su descripción
    │   │   └── invoice.ts        # agrupación de renglones de la factura
    │   ├── expenses/         # los flujos de gasto
    │   │   ├── expenses-kpi.ts   # indicadores y rótulo/nota del listado de gastos
    │   │   └── expense-list-row.ts # fila del listado: expenseListRowView puro + renderExpenseListRow
    │   ├── packages/         # el listado de paquetes
    │   │   ├── package-row.ts        # fila: packageRowView puro + renderPackageRow
    │   │   ├── shipment-status.ts    # método de envío: estilos, opciones y el <select>
    │   │   ├── package-pager.ts      # paginador de servidor propio (no usa lists/table-pager.ts)
    │   │   └── kpi-band.ts           # banda KPI de paquetes
    │   ├── customers/        # la pantalla de clientes: fila, formulario, query y errores
    │   ├── summary/          # la pantalla de resumen y sus gráficos
    │   │   ├── summary.ts        # campos y armado del filtro de Resumen
    │   │   ├── bar-chart.ts      # barras del resumen (día por día o hora por hora): layoutBarChart puro + renderBarChart (DOM)
    │   │   ├── donut-chart.ts    # donut configurable: layoutDonut puro + renderDonutChart (DOM)
    │   │   ├── chart-tooltip.ts  # clamp del tooltip: tooltipPosition puro
    │   │   └── chart-colors.ts   # tokens de color de canal y de método de envío
    │   ├── shell/            # el armazón de la aplicación
    │   │   ├── nav-drawer.ts     # cajón de navegación en móvil
    │   │   ├── theme-toggle.ts   # tema claro/oscuro persistido
    │   │   ├── install-prompt.ts # estado del prompt de instalación PWA
    │   │   └── pwa.ts            # aviso de actualización del service worker
    │   └── fixtures/         # líneas base congeladas (datos, no pruebas): sales/, expenses/, packages/ y las de los gráficos
    ├── components/
    │   ├── App.astro         # el documento de la SPA: armazón + [data-app-root] + una plantilla por vista
    │   ├── views/            # el markup de cada vista y su hoja
    │   │   ├── SalesView.astro · sales.css
    │   │   ├── SummaryView.astro · summary.css
    │   │   ├── SaleNewView.astro · sale-new.css
    │   │   ├── SaleDetailView.astro · sale-detail.css
    │   │   ├── PackagesView.astro · packages.css
    │   │   ├── CustomersView.astro · customers.css
    │   │   ├── ExpensesView.astro · expenses.css
    │   │   ├── ExpenseNewView.astro · expense-new.css
    │   │   └── NewView.astro · new.css
    │   ├── StatCard.astro    # tarjeta del dashboard
    │   ├── DateRangeFilter.astro
    │   ├── StatusBadge.astro
    │   ├── ConfirmDialog.astro
    │   └── InvoicePrint.astro
    └── pages/                # un archivo por ruta; las del panel sirven el mismo armazón (D-023)
        ├── index.astro       # / — el resumen («dashboard»)
        ├── login.astro       # /login — el inicio de sesión, documento propio fuera del armazón (D-024)
        ├── summary.astro     # /summary — redirección a / para los marcadores viejos
        ├── new.astro         # /new — el selector de registro
        ├── offline.astro     # /offline — la sirve el service worker (PWA, ver 08-pwa.md)
        ├── 404.astro         # /404 — la ruta vieja /sales/<id> se mudó a /sales/detail (D-017)
        ├── sales/
        │   ├── index.astro   # /sales
        │   ├── detail.astro  # /sales/detail — el detalle se llena en el cliente (D-017)
        │   └── new.astro     # /sales/new
        ├── customers/
        │   └── index.astro   # /customers
        ├── packages/
        │   └── index.astro   # /packages
        └── expenses/
            ├── index.astro   # /expenses
            └── new.astro     # /expenses/new
```

Dos carpetas que el andamiaje no tiene: `lib/` y `components/`. Las dos se justifican por el criterio que separa el módulo: **lo que se repite vive en un archivo, lo que ocurre una sola vez vive en su vista**.

**Quién es dueño del markup.** `pages/` ya no contiene pantallas: cada archivo de ruta son cinco líneas con `<App view="…" />`. El markup vive en `components/views/<Vista>View.astro` —con su hoja al lado— y el comportamiento en `lib/views/<vista>.ts`, que exporta `mount<X>(root)`. Por eso un spec que hable del «archivo de la pantalla» nombra la vista, no la página.

## Las rutas del panel

Todas las rutas del panel sirven **el mismo documento** (`components/App.astro`): lo que cambia es la plantilla que monta el router (D-023). La columna «Pantalla» nombra la vista; el archivo de `pages/` que la sirve es el armazón con esa vista declarada.

| Ruta | Pantalla | Nota |
|------|----------|------|
| `/` | Resumen | Los cuatro indicadores. Es la pantalla de entrada y la vista `summary`. |
| `/login` | Inicio de sesión | **No es una vista de la SPA:** es un documento propio (`src/pages/login.astro`) fuera del armazón, porque la navegación del panel todavía no se abrió. El guard del router manda acá con `?next=` cuando la API responde `401`, y el login vuelve a la ruta pedida (D-024, `09-auth.md`). |
| `/summary` | — | **Redirección, no pantalla:** un `meta refresh` a `/` con un enlace, para que un marcador viejo no se rompa. No tiene enlaces entrantes, no es una vista del router y queda fuera de `PANEL_ROUTES` del service worker, así que conserva su propio documento. |
| `/sales` | Listado de ventas | Filtros, cambio de estado en línea y enlace al detalle de cada venta. |
| `/sales/detail?id=<uuid>` | Detalle de venta | La vista `sale-detail`, con su markup en `components/views/SaleDetailView.astro`: el `id` viaja en la query y el cliente pide `GET /api/v1/sales/:id`, pinta la factura y resuelve los tres estados (cargando, venta inexistente, error). La impresión automática es `?print=1`, leída de `window.location.search`. El build no consulta la API para publicar el detalle (D-017). No existe `/sales/invoice` (D-009 en su letra). |
| `/sales/new` | Formulario de venta | Una sola ruta para los dos canales: el `type` viaja en el query. La ruta extra existe porque el formulario necesita su propia URL. |
| `/packages` | Listado de paquetes | |
| `/packages/new` | Formulario de paquete | **Pendiente:** se crea en `tasks/frontend/06-pantalla-de-paquetes.md`. |
| `/expenses` | Listado de gastos | |
| `/expenses/new` | Formulario de gasto | |
| `/new` | Selector de registro | La abre el botón de acción de la barra inferior. No es una sección —no aparece en la navegación y ninguna pestaña queda activa—, pero es una **vista de la SPA** (T7): el markup vive en `components/views/NewView.astro` y el router lo monta, así que el toque del FAB no pide el documento. |
| `/offline` | Pantalla sin conexión | La sirve el service worker cuando una navegación falla (PWA, ver `08-pwa.md`). Es el único documento que queda fuera del router: su respaldo tiene que existir incluso cuando no hay armazón en caché. |
| `/404` | Ruta no encontrada | Pantalla mínima que explica que `/sales/<id>` se mudó y devuelve a Ventas (D-017). Sin ella, un marcador viejo cae en el 404 pelado del servidor. |

### La ruta de formulario no estaba en el inventario, y hace falta

La dueña registra una venta, un paquete o un gasto. Cada alta necesita un formulario con sus propios campos. Si el formulario viviera dentro de la pantalla de listado, habría dos problemas:

1. **No se puede recargar.** Si el formulario está embebido y algo falla, la dueña tiene que navegar de nuevo a mano para reintentarlo. Con su propia ruta, el reintento es F5.
2. **El estado de carga del listado se mezcla con el del formulario.** Una pantalla con una tabla que carga y un formulario que envía necesita dos estados de red simultáneos. Dos rutas, un estado cada una.

El formulario de ventas es un caso especial: **`/sales/new` sirve para los dos canales**, y el `type` viaja en el query (`?type=live` · `?type=whatsapp`). Una sola ruta, dos formularios, y la diferencia la hace el parámetro. La razón está en `modules/db/enums/01-sale_type.md`: la forma de la venta de WhatsApp incluye el bloque de artículos adicionales y la de mostrador no.

Desde `/sales`, el botón "Nueva venta" lleva a `?type=live`, y un segundo enlace, "Venta por WhatsApp", lleva a `?type=whatsapp`. Un `value` ausente o distinto de esos dos hace `location.replace("/sales")` en el frontmatter, antes de que se monte el script.

## La capa `lib/`

Una treintena de módulos pequeños, una responsabilidad cada uno. Ninguno contiene lógica de negocio. El listado actualizado y el detalle de cada export viven en `frontend/src/lib/README.md`. Las carpetas siguen una sola regla: **la carpeta dice a quién pertenece el módulo, no cuántas pantallas lo importan**. Lo que decide entre `core/` y una carpeta de familia es una sola pregunta: **¿el módulo conoce una pantalla o una familia de pantallas?** Si no conoce ninguna, va a `core/`; si conoce una, va a la carpeta de esa familia. A las carpetas de familia —`sales/`, `expenses/` y `summary/`— se sumó `packages/` cuando el listado de paquetes ganó sus propios módulos; la regla no cambió.

| Carpeta | Qué agrupa | Quién la usa |
|---------|------------|--------------|
| `app/` | El router de la SPA: la tabla de rutas (pura), el arranque que intercepta clics y mueve la URL, y el registro que monta y desmonta vistas. | Todas |
| `views/` | El comportamiento de cada vista: `mount<X>(root)` devuelve su `cleanup`. Su markup vive en `components/views/`. | Una cada uno |
| `core/` | Plataforma y primitivas: contratos de la API, errores, formato, fechas, DOM y el gancho de ciclo de vida del documento que está fuera del router (`/offline`). Ninguna conoce una pantalla. | Todas |
| `lists/` | La maquinaria que comparten las pantallas de listado: filtros, paginación y pintado del estado. | Los tres listados; `filters` y `filter-controls` también el resumen, porque el filtro de fechas es el mismo control |
| `sales/` | Los flujos de venta: listado, detalle, alta y el diálogo de cambio de estado. | Una familia |
| `expenses/`, `summary/` | Lo que solo usa esa pantalla. | Una |
| `packages/` | El listado de paquetes: fila, método de envío, estado de tabla, paginador y banda KPI. | Una familia |
| `shell/` | El armazón: navegación, tema, PWA e instalación. | Todas, pero no es `core/`: existe por la página, no por la plataforma |

Una excepción honesta: `sales/sales-kpi.ts` exporta `operationsLabel`, que `/packages` también importa. Ese módulo lo alcanzan dos pantallas y aun así vive en `sales/`, porque son métricas de venta. No viola la regla: la carpeta responde a quién pertenece el módulo, no a cuántas pantallas lo importan.

Todos siguen el mismo corte, y es el punto de la separación: una parte **pura** que deriva valores de sus entradas sin tocar `document` ni `window` —`STATUS_STYLE`, `labelFor`, `statusLock`, `statusLook`, `saleListRowView`, `footerText`, el cálculo de layout de los gráficos, `tooltipPosition`—, y una parte **imperativa** que recibe los elementos sobre los que opera y escribe el DOM —`buildStatusSelect`, `applySelectLocks`, `applyStatusLook`, `renderSaleListRow`, `createListStatePainter`, `wirePerPageChange`, `wireFilterSubmit`, `askConfirm`, `renderBarChart`, `renderDonutChart`. La parte pura es la que se compara contra los fixtures congelados de `lib/fixtures/`, y ese límite es lo que permite probar geometría y markup sin navegador.

### `api.ts` — el único lugar donde hay `fetch`

```ts
const API_URL = import.meta.env.PUBLIC_API_URL

export class ApiError extends Error {
  constructor(public code: string, public status: number) { super(code) }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`C$ {API_URL}/api/v1C$ {path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    })
  } catch {
    throw new ApiError("NETWORK_ERROR", 0)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new ApiError(body?.code ?? "INTERNAL_ERROR", response.status)
  }
  return response.status === 204 ? (undefined as T) : response.json()
}
```

Cuatro decisiones en treinta líneas:

| Decisión | Razón |
|----------|-------|
| `PUBLIC_API_URL` se lee del `import.meta.env` y no de un parámetro | Un solo lugar donde cambia la dirección de la API. Sin variables globales, sin `window.__CONFIG__`. |
| `credentials: "include"` en todas las peticiones | La sesión es una cookie `HttpOnly` de otro origen, y sin esta opción el navegador no la manda: todo `/api/v1` respondería `401`. Ninguna vista lo recuerda (D-024, `09-auth.md`). |
| El prefijo `/api/v1` va dentro de `api.ts` | Ninguna pantalla escribe la ruta completa. |
| Un fallo de red se distingue de un error del servidor | `NETWORK_ERROR` con `status: 0` permite que la interfaz diga "no pude conectarme" en lugar de "algo falló". |
| `body?.code ?? "INTERNAL_ERROR"` | Si el servidor devuelve algo que no es JSON, el panel no revienta. |
| Se propaga `ApiError`, no el `Response` | Cada pantalla decide qué hacer con un `400` y qué hacer con un `500`, sin reimplementar la lectura del sobre. |

Lo que `api.ts` **no** hace: no reintenta, no normaliza importes, no traduce códigos. Es un `fetch` con manejo de errores y una caché de lectura en memoria.

#### `cache.ts` — la caché de datos, con política y almacén separados

`apiFetch` acepta un tercer argumento con la política de caché; por defecto es `swr`, así que listados y agregaciones quedan cubiertos sin tocar ninguna pantalla. La política `fresh` existe para el detalle de venta de la tarea 5 del área 14, que es el dato que se está por modificar.

| Política | Comportamiento |
|----------|----------------|
| `swr` (defecto) | Con entrada cacheada devuelve el dato al instante; si la entrada superó el umbral de revalidación (`REVALIDATE_AFTER_MS`, 30 s) dispara **una** revalidación de fondo, deduplicada, que actualiza el almacén sin cambiar lo ya devuelto. Sin entrada, va a la red. |
| `fresh` | Ignora la entrada asentada y siempre va a la red. Puede compartir un pedido en vuelo con `swr`, pero nunca recibe un valor cacheado. |

`core/cache.ts` separa la política pura del almacén, como el resto de `lib/`:

| Pieza | Qué hace |
|-------|----------|
| `isCacheable(method)` | Sólo `GET`. |
| `cacheKeyFor(method, url)` | La clave del `Map`, con el método normalizado. |
| `shouldRevalidate(ageMs, thresholdMs)` | Pura; la frontera es inclusiva (`age >= threshold`). |
| `currentGeneration()` | La generación actual del almacén, para descartar escrituras de pedidos que salieron antes de una invalidación. |
| almacén | `Map` de entradas `{ data, at, storedAt }`, `Map` de pedidos en vuelo por clave y un contador de generación que `clearCache()` incrementa. |

Cuatro reglas sostienen el contrato observable:

1. Dos `GET` idénticos en vuelo comparten el mismo `Promise`.
2. Un `Promise` rechazado no se cachea **nunca** y no queda en el mapa de pedidos en vuelo.
3. Toda escritura exitosa (`POST`, `PATCH`, `DELETE`) vacía la caché entera **y avisa al service worker** con `{ type: "API_CACHE_CLEAR" }` para que borre la suya (`08-pwa.md`, «Invalidación de la caché de la API»): la copia en memoria de la pestaña no es la única que puede devolver un dato previo a la escritura. Un fallo de escritura no vacía nada.
4. `clearCache()` avanza la generación. Un `GET` captura la generación antes de salir a la red y sólo escribe la entrada si no cambió mientras estaba en vuelo: así una escritura que vacía la caché no queda repoblada por un dato previo a la escritura cuando el `GET` resuelve. El pedido igual devuelve su dato a quien lo pidió.

Cuando el dato sale de la caché en memoria, `api.ts` publica `shopmar:stale-data` con el `at` guardado —el `X-ShopMar-Cached-At` con que se sirvió— y no con el de un encabezado nuevo: el aviso de `lib/shell/pwa.ts` sigue diciendo la hora correcta.

### `format.ts` — traducción y presentación, sin tocar la API

```ts
const MONEY = /^(\d{1,8})(?:\.(\d{2}))?C$ /

export function formatMoney(value: string): string {
  const match = MONEY.exec(value)
  if (!match) return value
  const [, whole, cents = "00"] = match
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return `C$ C$ {grouped}.C$ {cents}`
}
```

Cuatro funciones, todas puras:

| Función | Qué hace | Detalle |
|---------|----------|---------|
| `formatMoney(value)` | `"4837500.00"` → `"C$ 4.837.500,00"` | Separador de miles con punto, decimal con coma, prefijo `C$ `. **Trabaja sobre la cadena con una expresión regular. Nunca `parseFloat`, nunca `Number`.** Es la contraparte en el cliente de la decisión D-003. |
| `formatDate(value)` | `"2026-09-28T15:30:00.000Z"` → `"28/09/2026"` | Construye la cadena con `slice` sobre el ISO, o con `Intl.DateTimeFormat` en `es-CO` con `timeZone: "UTC"`. Se usa para **días de negocio** (`sale_date`, `due_date`, `expense_date`): el día no depende del huso del que mira, y la API manda UTC. |
| `formatDateTime(value)` | Ídem, con la hora | Para **instantes** (`created_at`, `updated_at`, `paid_at`). Se muestra en la **hora local** del navegador, sin forzar `timeZone`: una venta de las 18:24 no puede leerse como las 00:24 del día siguiente. |
| `saleTypeLabel(value)`, `saleStatusLabel(value)`, `paymentMethodLabel(value)`, `packageMethodLabel(value)` | `"credit_card"` → `"Tarjeta de crédito"` | Objetos de lookup por clave. |

La traducción vive **aquí y en ningún otro lado**. La API habla inglés porque la base y los contratos son técnicos; el panel habla español porque es donde la dueña lee.

### `types.ts` — la forma de los datos, sin lógica

Interfaces que reflejan `modules/api/`: `IDashboardSummary`, `ISaleListRow`, `ISaleDetail`, `IAdditionalSaleItem`, `IPackage`, `IExpense`, `IErrorEnvelope`, `IMoney` (alias de `string`). Los importes están tipados como `string`, no como `number`. Esa es la defensa de la decisión D-003 a nivel de tipos: un `number` en la firma de un mapper es un error de compilación, no una surpresa en producción.

### `dom.ts` — los cuatro helpers que toda pantalla repite

```ts
export const qs  = <T extends Element>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T
export const on  = (el: Element, ev: string, fn: (e: Event) => void) =>
  el.addEventListener(ev, fn)
export const setText = (el: Element, text: string) => { el.textContent = text }
export const clear = (el: Element) => { el.replaceChildren() }
```

Cuarenta líneas que sustituyen a jQuery, a `lit` y a la mitad de las utilidades de un framework. Son las cuatro operaciones que las nueve vistas necesitan: seleccionar, escuchar, escribir texto y limpiar un contenedor.

## El flujo de datos de una pantalla

Toda pantalla sigue la misma secuencia, sin excepción:

```
1. La plantilla de la vista se clona en [data-app-root] con su esqueleto
2. El script de la vista pide los datos a la API
3. Mientras espera, la tabla, los KPIs y el detalle muestran su esqueleto
4. Llega la respuesta → se renderiza la tabla
   o bien → se muestra el sobre de error con "Reintentar"
```

El estado inicial no es "vacío" sino **"cargando"**, porque el `fetch` arranca en el mismo tick del montaje. Pintar vacío y luego cambiar a cargando produce un parpadeo que delata la espera, y un texto "Cargando..." deja el hueco de otra altura: el esqueleto ocupa el sitio de la cifra o de la celda, así que la tabla no salta cuando llegan los datos.

Tres estados, siempre los tres, en las cuatro pantallas con datos:

| Estado | Qué muestra | Cuándo |
|--------|-------------|--------|
| Cargando | El **esqueleto** de lo que va a venir —las filas de la tabla, las cifras del KPI, el detalle— con la tabla en `aria-busy="true"` | Antes de la primera respuesta |
| Vacío | "No hay ventas registradas" con el enlace para crear la primera | Respuesta `200` con el arreglo vacío |
| Error | El sobre con el mensaje de la API y un botón "Reintentar" | Cualquier excepción de `apiFetch` |
| Con datos | La tabla | El caso normal |

El estado de carga es un **esqueleto**, no un texto: la primitiva `.skeleton` (`src/styles/skeleton.css`) dibuja la estructura con un brillo que `prefers-reduced-motion` apaga. El vacío y el error los pinta `createListStatePainter` (`lib/lists/list-state.ts`), que clona la fila de estado dentro del tbody; no hay componente `.astro` para eso desde T6. El motivo sigue siendo el de siempre: sin un solo lugar para esos bloques, cada vista escribiría las mismas cuarenta líneas y algún día una olvidaría el estado vacío.

## Por qué no hay estado global

No hay store, no hay contexto, no hay `useState`, no hay archivo `06-estado.md`. La razón es concrete, no ideológica:

| Pregunta | Respuesta del sistema |
|----------|----------------------|
| ¿Cuántos datos comparte más de una pantalla a la vez? | **Ninguno.** El dashboard pide `summary`. El listado de ventas pide `sales`. El formulario de venta pide `sales` solo para armar el `<select>` de paquetes, y lo pide una vez. |
| ¿Cuántas pantallas están visibles al mismo tiempo? | **Una.** No hay ventanas emergentes, ni paneles superpuestos, ni pestañas que vivan en paralelo. |
| ¿Hay un estado que deba sobrevivir a una navegación? | **El armazón, entero** (D-023): vive fuera de `[data-app-root]`, así que la navegación no lo toca y no hay nada que persistir a mano. Además, las lecturas se sirven de una caché en memoria de la pestaña (D-020). Pero no hay un store de estado de negocio compartido entre pantallas: cada vista sigue pidiendo sus datos, y la caché sólo evita repetir el pedido. |
| ¿Habría un store si el volumen creciera? | Sí, y valdría la pena: un `Map` de ventas en memoria, invalidado al volver de un formulario. Esa es la v2. |

Un store hoy sería un `Map` con una entrada que nunca se lee dos veces, y cada línea de ese `Map` sería un lugar donde un dato puede quedar viejo sin que nadie lo note. El coste no se paga en líneas de código, se paga en errores silenciosos.

La decisión queda registrada en `docs/07-decisiones.md` como parte de D-005, y explica por qué el manifiesto de archivos del módulo no incluye un documento de estado.

## Variables de entorno

| Variable | Dónde se usa | Nueva |
|----------|--------------|-------|
| `PUBLIC_API_URL` | `src/lib/core/api.ts`, leído con `import.meta.env` | **Sí.** Se agrega a `frontend/.env.example` con valor de ejemplo `http://localhost:3000`. |
| `PUBLIC_SITE_URL` | `src/layouts/Layout.astro`, canonical y Open Graph | Se conserva, aunque en un panel interno el canonical es casi decorativo. |
| `PUBLIC_SITE_DESCRIPTION` | `src/layouts/Layout.astro`, `<meta name="description">` | Se conserva. El valor por defecto del andamiaje habla de una landing y hay que cambiarlo por una descripción del panel. |

Desde D-017 el build del frontend **no necesita el backend levantado**: `sales/[id].astro` era el único consumidor de la API en build y se reemplazó por el detalle estático. Medido: `PUBLIC_API_URL=http://127.0.0.1:9 pnpm build` sale `exit 0` con las mismas páginas que el build normal.

`PUBLIC_API_URL` **tiene que existir donde se compila el frontend**, no donde se sirve. Astro la incorpora al bundle durante el `build`. Si falta, `import.meta.env.PUBLIC_API_URL` es `undefined` y `C$ {undefined}/api/v1/...` es una URL inválida que falla en el primer `fetch`. El error aparece en el navegador, no en la terminal: por eso la tarea que la agrega incluye la verificación de que el valor esté presente en `.env` antes de compilar.

## `astro.config.mjs`

```js
import { defineConfig } from "astro/config"

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? "https://example.com",
  prefetch: { defaultStrategy: "viewport" },
  devToolbar: { enabled: false },
})
```

Sin `output: "server"`, sin `@astrojs/node`. El build produce `dist/` con un `.html` por ruta —todos con el mismo armazón (D-023)— más los assets que Astro extrae de los `<style>` y los `<script>` de cada componente.

### Prefetch: `viewport`, con el atributo por enlace

`prefetch.defaultStrategy` es `'viewport'` y `prefetchAll` queda apagado. Los tres juegos de enlaces del armazón (barra lateral, cajón móvil y barra inferior) llevan `data-astro-prefetch` sin valor, así que cada enlace adopta esa estrategia por defecto; ningún enlace fuera del armazón precarga.

`viewport` engancha un `IntersectionObserver`: cuando el enlace entra en pantalla, espera 300 ms y pide el documento. El costo de prefetchear es el documento del armazón —**nunca datos**, porque el prefetch de Astro pide el HTML y no llama a la API—, y el beneficio es el pedido en vuelo antes de que la persona decida. En un panel de cuatro rutas fijas, todas visibles al cargar, es el punto correcto.

Se descarta `tap` —engancha `touchstart`/`mousedown` y el pedido sale recién cuando la persona ya está apretando el botón: llega tarde— y se descarta `prefetchAll: true`, porque cada fila del listado tiene un enlace de detalle distinto y precargaría muchas variantes del mismo shell sin que nadie las mire.

**Desde D-023 el prefetch no está en el camino de la navegación.** Navegar entre vistas clona una plantilla y no pide documento, así que la ventaja que D-018 buscaba —el armazón en vuelo antes del toque— ya la da el propio documento único. La configuración y los atributos siguen como estaban, no se agrega nada nuevo, y su efecto observable es el que fija `TC-NAV-001` de `qa/`.

### El armazón no se reemplaza: la SPA sólo cambia el contenido

`components/App.astro` renderiza el armazón una vez: `Layout.astro` con `Nav.astro` (barra lateral, barra superior, scrim, cajón y barra inferior) y, en el `<slot>`, un `[data-app-root]` vacío con una `<template data-view>` por vista. El router clona la plantilla de la ruta dentro de ese contenedor, así que **ninguno de los nodos del armazón se reconstruye en una navegación**: el cajón conserva su estado, el tema y el prompt de instalación no se reinicializan y no hay nada que persistir a mano. Cuando se decidió lo contrario —con `<ClientRouter />` y `transition:persist`— el `<body>` se reemplazaba entero en cada clic; eso es lo que D-023 retiró.

El primer pintado lo sigue dando el servidor con la prop `activeSection` de `Layout.astro`, que `App.astro` deriva de la vista de la ruta; después de cada navegación el enlace activo lo repinta `markActiveNav(activeSectionFor(pathname))` de `src/lib/shell/nav-active.ts`, que corre en el mismo paso del router que monta la vista. Sin ese repintado, el armazón —que ahora sobrevive por diseño— quedaría marcando la sección anterior.

Lo que sí se rehace en cada navegación es el contenido: el router **desmonta** la vista anterior (su `cleanup`) antes de montar la siguiente, y cada vista consulta el DOM contra su propia raíz (`qs(sel, root)`), así que dos vistas no se pisan los `id` ni los `[name]`.

## Accesibilidad de la navegación

La barra lateral es una lista de enlaces, y cada enlace tiene:

- Un icono de `lucide-astro` de 18px, con `aria-hidden="true"` porque el texto del enlace ya dice lo mismo.
- Un `aria-current="page"` en el enlace de la pantalla activa, para que un lector de pantalla sepa dónde está.
- Un objetivo táctil de 44px de alto, según la regla del skill de diseño.

La navegación se hace con enlaces `<a href>`, no con `onclick`. El teclado, el botón atrás del navegador y el "abrir en pestaña nueva" funcionan sin una línea de código.
