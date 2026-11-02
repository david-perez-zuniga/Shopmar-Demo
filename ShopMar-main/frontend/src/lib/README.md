# src/lib

La capa de lógica de presentación: archivos pequeños, una responsabilidad
cada uno y **cero lógica de negocio** (eso lo valida y lo decide el backend).
Ver `specs/modules/frontend/01-arquitectura.md`.

Los módulos se agrupan por carpeta. **La carpeta dice a quién pertenece el
módulo, no cuántas pantallas lo importan.** Lo que decide entre `core/` y una
carpeta de familia es una sola pregunta: **¿el módulo conoce una pantalla o una
familia de pantallas?** Si no conoce ninguna, va a `core/`; si conoce una, va a
la carpeta de esa familia.

| Carpeta | Qué agrupa | Quién la usa |
|---------|------------|--------------|
| `app/` | El router de la SPA: tabla de rutas (pura), arranque, guard de sesión y registro de vistas. | Todas |
| `views/` | El comportamiento de cada vista: `mount<X>(root)` → `cleanup`. El markup vive en `components/views/`. | Una cada uno |
| `core/` | Plataforma y primitivas: contratos de la API, errores, formato, fechas, DOM y el gancho de ciclo de vida del documento que queda fuera del router. Ninguna conoce una pantalla. | Todas |
| `lists/` | La maquinaria que comparten las pantallas de listado: filtros, paginación y pintado del estado. | Los tres listados; `filters` y `filter-controls` también el resumen, porque el filtro de fechas es el mismo control |
| `sales/` | Los flujos de venta: listado, detalle, alta y el diálogo de cambio de estado. | Una familia |
| `expenses/`, `summary/` | Lo que solo usa esa pantalla. | Una |
| `packages/` | El listado de paquetes: la fila, el método de envío, el estado de tabla, su paginador y su banda KPI. | Una familia |
| `customers/` | La pantalla de clientes: la fila con sus saldos, el formulario de alta y edición, la query y el mapeo de errores del servidor. | Una |
| `auth/` | La sesión del panel: copia local del `me`, guard del arranque, llamadas de auth, login, logout y el usuario en la navegación (T6, T7). | Todas, pero no es `core/`: existe por la autenticación |
| `shell/` | El armazón: navegación, tema, PWA e instalación. | Todas, pero no es `core/`: existe por la página, no por la plataforma |

Una excepción honesta: `sales/sales-kpi.ts` exporta `operationsLabel`, que
`/packages` también importa. Ese módulo lo alcanzan dos pantallas y aun así vive
en `sales/`, porque son métricas de venta. No viola la regla: la carpeta
responde a quién pertenece el módulo, no a cuántas pantallas lo importan.

## `app/`

El router de la SPA (D-023). El documento es uno solo (`components/App.astro`) y cada ruta sirve el mismo armazón: lo que cambia es la plantilla que se clona en `[data-app-root]`.

| Archivo | Responsabilidad |
|---------|-----------------|
| `router.ts` | La tabla de rutas, **puro**: `VIEWS`, `ViewId`, `VIEW_TITLES`, `VIEW_WIDE`, `viewForPath`/`resolveLocation` y `hrefFor`. No toca el DOM ni `window`, así que las rutas y los títulos se prueban sin navegador. |
| `start.ts` | `startApp()`: corre el **guard de sesión antes de montar la primera vista** (T6: con copia del `me` monta al instante, sin copia pregunta, `401` manda a `/login`, red o `5xx` muestran el aviso con reintento), intercepta los clics de same-origin, **mueve la URL antes de montar** (leer `window.location` en el montaje tiene que devolver la pantalla nueva), atiende `popstate`, sube el scroll al tope y repinta el enlace activo. Exporta `navigateTo(href)` para cambiar de vista y `pushQuery(href)` para paginar y filtrar **sin remontar**. Una ruta sin vista registrada cae a `location.assign`. |
| `views.ts` | `createViewRegistry()`: `register`, `mount`, `unmount` y `has`. Garantiza el invariante de que antes de montar una vista se desmonta la anterior, y que un montaje que falla no deja una limpieza colgada. |

## `auth/`

La sesión del panel (T6, T7). La sesión de verdad es la cookie `HttpOnly` `shpr_session`, que este código no puede leer: lo de acá es la **copia de la última respuesta de `GET /auth/me`** y las decisiones que se toman con ella. Contrato: `specs/modules/api/07-auth.md`; comportamiento del panel: `specs/modules/frontend/09-auth.md`.

| Archivo | Responsabilidad |
|---------|-----------------|
| `session.ts` | La copia del `me` bajo `shopmar:me:v1` (guardar, leer, borrar, versión de formato) y las funciones puras de decisión: `decideSessionGate` con sus cuatro resultados y `expireSession` (la regla del `401`: borrar, limpiar datos y volver a `/login` con la ruta actual, idempotente si ya está en `/login`). |
| `login.ts` | La parte pura de `/login`: `safeNext`/`readNext` (solo rutas del panel, nunca un origen externo), `loginHref`, `validateLoginForm` (los dos campos) y `loginErrorMessage` (`Invalid credentials`, 429 y red). |
| `auth-api.ts` | `loginUser`, `fetchMe` y `logoutUser` sobre `apiFetch`. El login y el `me` del guard pasan `authRedirect: false`: un `401` ahí no es una sesión vencida. |
| `guard.ts` | `createSessionGate()`: con copia monta y revalida detrás; sin copia pregunta y distingue `200` / `401` / red-o-`5xx`. El almacenamiento y el `me` se inyectan para probar las tres ramas sin red. |
| `logout.ts` | `signOut()`: `POST /auth/logout`, borra la copia y las dos cachés y va a `/login`. Si el pedido falla por red, la copia se borra igual. |
| `session-ui.ts` | `renderSessionUser` e `initSessionNav`: pintan el usuario y su rol en la barra lateral y el cajón desde la copia del `me`, y conectan los botones «Cerrar sesión». Los avisa `shopmar:session-changed` cuando el guard confirma la sesión. |

## `views/`

El comportamiento de cada vista. Su markup vive en `components/views/<Vista>View.astro` y lo monta el router; acá va el `mount<X>(root)`, que devuelve (si hace falta) la limpieza de sus listeners. **Toda consulta al DOM de una vista va contra `root`**, nunca contra `document`: dos vistas no se pisan los `id` ni los `[name]`.

| Archivo | Vista |
|---------|-------|
| `index.ts` | `registerViews(registry)`: la lista de las nueve vistas registradas. Una vista sin registrar no se intercepta. |
| `summary.ts` | `/` — el resumen, sus KPIs y sus gráficos. |
| `sales-list.ts` | `/sales` — el listado, sus filtros y el cambio de estado en línea. |
| `sale-new.ts` | `/sales/new` — el alta de venta (borrador, pasos, validación). |
| `sale-detail.ts` | `/sales/detail` — el detalle y la factura. |
| `packages-list.ts` | `/packages` — el listado de envíos con su paginador y su banda KPI. |
| `customers-list.ts` | `/customers` — el listado con saldos y el diálogo de alta y edición. |
| `expenses-list.ts` | `/expenses` — el listado de gastos. |
| `expense-new.ts` | `/expenses/new` — el alta de gasto. |
| `new.ts` | `/new` — el selector de registro; no pide datos ni escribe. |

## `core/`

Plataforma y primitivas: contratos de la API, errores, formato, fechas, DOM y el
gancho de ciclo de vida de los scripts. Ninguna conoce una pantalla.

| Archivo | Responsabilidad |
|---------|-----------------|
| `api.ts` | El único `fetch` del panel: `credentials: "include"` en **todas** las peticiones, sobre de error, los tres estados y la regla del `401` —borra la copia del `me`, limpia la caché y vuelve a `/login`— sin que ninguna vista la repita (T6). `authRedirect: false` es la excepción explícita del login y del `me` bloqueante del guard. |
| `errors.ts` | `getErrorMessage` y la traducción de los códigos del backend al español. |
| `format.ts` | Dinero, fechas y etiquetas al español, trabajando sobre cadenas: sin conversiones a número ni formateo monetario regional. |
| `types.ts` | Las formas de la API, espejo de los contratos del backend. Los importes son `IMoney` = `string`, nunca `number` (D-003). |
| `dom.ts` | Cuatro helpers (`qs`, `on`, `setText`, `clear`) que los scripts de las pantallas repiten: seleccionar, escuchar, escribir texto y limpiar un contenedor. |
| `icons.ts` | `CARET`: el SVG del caret del `<select>`, que estaba duplicado byte a byte entre el script de paquetes y `sales/sale-status.ts`. Es un primitivo compartido y no conoce ninguna pantalla, así que vive en `core/`. Cualquier byte de más rompe los fixtures de ventas y de paquetes. |
| `date.ts` | `todayLocal`: el día de HOY en hora local para `<input type="date">`. Es una primitiva de fecha y no conoce ninguna pantalla, así que vive en `core/`; lo usan las tres pantallas que dan de alta, dos veces cada una —el frontmatter y el script—, y antes eran cinco copias. Ver `specs/tasks/frontend/05-formulario-de-venta.md`. |
| `page-load.ts` | `onPageLoad(page, setup)`: el puente para una pantalla que **todavía no** es una vista de la SPA. Corre el `setup` una vez, cuando el documento está listo, si la pantalla está presente. Lo usan los documentos que viven fuera del router: `/offline` (`pages/offline.astro`) y `/login` (`pages/login.astro`); las vistas de la SPA no pasan por acá: el router las monta y las limpia (`lib/views/`). |
| `storage.ts` | `safeLocalStorage()`: el acceso defensivo al `localStorage`, `null` en modo privado o con el almacenamiento bloqueado. Lo comparten el borrador de venta y la copia del `me`. |

## `lists/`

La maquinaria que comparten las pantallas de listado (`/sales`, `/packages`,
`/expenses`); el resumen también usa los filtros, porque el filtro de fechas es
el mismo control.

| Archivo | Responsabilidad |
|---------|-----------------|
| `filter-controls.ts` | `setControlValue`, `hydrateFilterControls`, `readFilterQuery`, `filterHref`, `clearFilterHref` y `rehydrateOnPageshow`; más `wireFilterSubmit`, el cableado del submit del formulario de filtros. |
| `filters.ts` | Lectura de la query: `readSalesFilters`, `readSummaryFilters`, `readPackagesFilters`, `readExpensesFilters`, `readPerPage`, `readPage`, `hasAnyFilter` y `toQuery`, más `PER_PAGE_OPTIONS` y `DEFAULT_PER_PAGE`. Puro: recibe la cadena de la query y no toca el DOM. Es donde vive la forma de cada filtro. |
| `list-state.ts` | `createListStatePainter`: recibe el host del estado y el ledger y devuelve el pintador de carga / vacío / error. Los textos y el destino del enlace son datos que pasa cada lista (puro); `paint()` toca el DOM. Las cuatro listas lo usan en modo fila (`/sales`, `/packages`, `/expenses` y `/customers`) y el detalle de venta en modo host. |
| `pagination.ts` | **Puros:** `totalPages`, `clampPage`, `pageRows`, `pageRange`, `footerText` (el rango del pie más su etiqueta), `pageHref`, `perPageHref` y `pageWindow`. **DOM:** `wirePerPageChange`. |
| `table-pager.ts` | `createTablePager(options)`: el paginador de los listados. Recibe las filas, el `buildRow` y los ganchos de render, y devuelve `setRows`, `setPerPage` y `dispose`. Toca el DOM, pero la aritmética que usa sale de `pagination.ts`. |

`/packages` **no** usa `table-pager.ts`, y no es un descuido: conserva su paginador local (`package-pager.ts`) porque pagina en el servidor —recibe el `total` aparte— mientras el compartido es dueño de un dataset de cliente y deriva el total de `rows.length`. El **estado de tabla** sí es el compartido desde T6: el pintor de `list-state.ts` en su modo fila —con `template` y `tbody` clona la fila de estado dentro de la tabla y deja el ledger visible— es el que usan las cuatro listas (ventas, paquetes, gastos y clientes). Sin plantilla conserva el modo antiguo, que escribe en el `[data-state-host]` y esconde el ledger; ese modo lo usa hoy el detalle de venta.

## `sales/`

Los flujos de venta: el listado, el detalle con su factura y el formulario de alta.

| Archivo | Responsabilidad |
|---------|-----------------|
| `confirm-dialog.ts` | `askConfirm(overlay, sale, next, confirmLabel, needsPayment)` y `formatReference`. Recibe la raíz del overlay, resuelve sus ids dentro de ella y engancha el listener del foco al `ownerDocument` del overlay. Es el diálogo que antes estaba hecho a mano en el script de ventas. |
| `invoice.ts` | `groupInvoiceRows(sale)`: agrupa los renglones de la factura —el coste principal y los artículos adicionales— y sus totales. Puro. |
| `payment.ts` | La aritmética del pago sobre cadenas: `toCents`, `centsToMoney`, `paymentMethodLabel`, `evaluatePayment`, `isPaymentAcceptable` y `describePayment`. Todo puro. Lo usan el diálogo, el formulario y la factura. |
| `sale-list-row.ts` | La fila del listado. **Puro:** `saleListRowView(sale)` decide cada celda (clases, texto, `title`, icono, `href` y la pluralización `1 art.` / `2 arts.`), `creditColumnView(sale)` la columna **Cobro** (saldo, "Vence …", "Vencida", "Pagada" o guion en contado), `paymentActionAvailable(sale)` y `readSalesCreditFilters`, que lee los dos filtros de crédito de la URL. **DOM:** `renderSaleListRow(sale, onStatusChange, onPayment?)` y `applyCreditToRow`, que refresca la fila con la venta que devuelve el cobro. No confundir con `sale-rows.ts`, que son las filas de adicionales del formulario de venta nueva. |
| `sale-rows.ts` | La **lista de productos** del formulario de alta (S44): `IProductRow`, la suma estimada, el mapeo de errores y `productPayload`, que reparte el primero como mercadería principal y el resto como renglones de mercadería. Es lo contrario de `sale-list-row.ts`, que es la fila del listado. |
| `sales-kpi.ts` | `salesKpi(rows)` y `KPI_FIELDS`: los indicadores del listado de ventas. Exporta además `operationsLabel(count)`, que `/packages` también importa. Puro. |
| `sale-status.ts` | Estado de venta. **Puros:** `STATUS_STYLE`, `STATUS_OPTIONS`, `labelFor`, `statusAriaLabel`, `statusLock` (la decisión `final`, con su título y su nota), `statusLook` (clase de fila, celdas tachadas, icono y título de impresión) y `statusOptions`/`statusOptionNodes`/`syncStatusOptions`, que aplican la regla de la venta a crédito: el estado vigente queda fijo y deshabilitado y el único destino es "Cancelada" (D-022). **DOM:** `buildStatusSelect`, `applySelectLocks` y `applyStatusLook`, que reciben los elementos sobre los que operan. |
| `payment-modal.ts` | El modal de cobro de una venta a crédito. **Puros:** `evaluatePaymentEntry` (monto > 0 y ≤ saldo, sin `parseFloat`), `describePaymentEntry` y `paymentPayload` (`{ amount, paid_at, payment_method, payment_bank, note }`). **DOM:** `askPayment(overlay, sale)`, que resuelve el monto o `null` y engancha foco, Escape y trampa de Tab como el diálogo de estado. |
| `sale-form.ts` | El formulario de alta. **Puro:** la condición de pago por defecto, `dueDateToIso`, `validateSaleCondition` (cliente y vencimiento en crédito; monto y vuelto en contado) y `buildSalePayload`, que produce el cuerpo exacto de cada caso. **DOM:** nada; el `.astro` solo cablea. |

## `customers/`

La pantalla de clientes (`/customers`), con la deuda de cada uno.

| Archivo | Responsabilidad |
|---------|-----------------|
| `customer-list.ts` | `customerRowView(customer)` y `isZeroMoney`, que compara cadenas de dinero sin `parseFloat`. Puro. |
| `customer-form.ts` | `validateCustomerForm` y la normalización del cuerpo de alta y edición. Puro. |
| `customer-query.ts` | `customersQuery(q)`: la query de la API con `include_balances` siempre encendido. Puro. |
| `customer-errors.ts` | `customerFormErrorView` (400 por campo) y `customerDeleteErrorMessage`, que devuelve verbatim el 409 del servidor. Puro. |

## `summary/`

La pantalla de resumen (`/`) y sus gráficos.

| Archivo | Responsabilidad |
|---------|-----------------|
| `summary.ts` | `SUMMARY_FIELDS` (las seis tarjetas del panel con rótulo, definición, icono, tono y lectura), `effectiveRange`, `lastDaysRange`, `countShipments`, `isEmptyRange` y `formatDateShort`: los campos del resumen y el armado de su filtro de fechas, con los últimos siete días como valor de respaldo. Puro. |
| `bar-chart.ts` | Gráfico de barras diario (ingresos/gastos): barras agrupadas, ticks del eje Y, etiquetas X, leyenda y cableado del tooltip. `layoutBarChart(daily, { width, mode })` es geometría pura —no toca el DOM y recibe el ancho como número—; `renderBarChart(container, daily, mode)` es la única capa DOM y lee `clientWidth` una sola vez. Esa frontera es el motivo del split. |
| `donut-chart.ts` | Donut configurable con total al centro y leyenda. `layoutDonut(segments, options)` es puro; `renderDonutChart(container, segments, options)` es la única capa que escribe el DOM. El resolvedor de color entra por opción para no acoplar el módulo a `chart-colors.ts`. |
| `chart-tooltip.ts` | La aritmética del clamp del tooltip de los gráficos. `tooltipPosition(...)` es puro: recibe números y un rect plano, nunca un `MouseEvent` ni un `DOMRect` vivo. |
| `chart-colors.ts` | Tokens de color de canal y de método de envío. `channelColor(point)` y `shipmentColor(point)` son lookups puros; el método desconocido cae en el fallback `--m3-outline`. |

## `expenses/`

La pantalla de gastos (`/expenses`) y su formulario.

| Archivo | Responsabilidad |
|---------|-----------------|
| `expenses-kpi.ts` | `expensesKpi(rows)`, `expensesLabel(count)` y `expensesKpiLabelAndNote(filters)`: los indicadores del listado de gastos y el rótulo y la nota de la banda según haya o no filtro de fechas. Puro. |
| `expense-list-row.ts` | La fila del listado. **Puro:** `expenseListRowView(expense)` decide las clases del `<tr>`, el `data-expense-id` y, por celda, sus clases y su texto; el guion de la descripción vacía queda como modo, no como rama del DOM. **DOM:** `renderExpenseListRow(expense)`. |

## `packages/`

El listado de paquetes (`/packages`): su fila, su método de envío, su paginador y su banda KPI. Conserva paginador local a propósito; ver la nota de `lists/`.

| Archivo | Responsabilidad |
|---------|-----------------|
| `package-row.ts` | La fila del listado. **Puro:** `packageRowView(sale)` deriva el `data-sale-id` y las clases y el texto de cada celda —la de método solo clases, porque el select se inserta dentro—. **DOM:** `renderPackageRow(sale, template, onChange)`, que clona la plantilla de la página. No pinta `additional_count`; rareza congelada. |
| `shipment-status.ts` | El método de envío de un paquete. **Puros:** `SHIPMENT_STYLE`, `SHIPMENT_OPTIONS`, `shipmentSelectClasses`, `shipmentAriaLabel` y `createShipmentChangeHandler` (el manejador del `change`, con el PATCH y el refresco de KPIs inyectados). **DOM:** `buildShipmentSelect(sale, onChange)`, que devuelve el `<div class="shipment-wrap">`. |
| `package-pager.ts` | `paintPackagePager(pager, current, pages, goToPage)`: el paginador propio de paquetes. No adopta `lists/table-pager.ts` (ver la nota de `lists/`); comparte la aritmética de la ventana (`pageWindow`) y pagina en el servidor. |
| `kpi-band.ts` | La banda KPI de paquetes. **Puro:** `kpiBandView(method)` decide qué tarjetas se ocultan y la nota. **DOM:** `paintPackageKpis(kpis)` y `renderKpiBand(view)`, con `paintKpiFilter()` como entrada desde la URL. |

## `shell/`

El armazón: navegación, tema y PWA. Lo usan todas las pantallas, pero no es `core/`
porque existe por la página, no por la plataforma.

| Archivo | Responsabilidad |
|---------|-----------------|
| `install-prompt.ts` | El prompt de instalación de la PWA: `resolveInstallUi` decide entre `installed`, `ios-hint`, `install` y `hidden` a partir de señales (puro); `initInstallPrompt(root)` lo cablea. `detectStandalone` y `detectIOS` son las señales del entorno. |
| `nav-drawer.ts` | `initNavDrawer(root)`: el cajón de navegación en móvil, con su función de limpieza. |
| `pwa.ts` | Los avisos del service worker: `shouldShowUpdateNotice`, `shouldActivateUpdate` y `formatStaleNotice` (puros), más `initPwa(root)`, que los cablea y también escucha el aviso de datos viejos. |
| `theme-toggle.ts` | `initThemeToggle(root)`: el tema claro/oscuro, persistido. Atiende todos los `[data-theme-toggle]` de la página a la vez. |

`fixtures/` no es un módulo: son líneas base congeladas, datos y no pruebas, con las que se compara la salida de la parte pura. Cada familia tiene las suyas, con su propio `README.md`: `fixtures/sales/` (listado de ventas), `fixtures/expenses/` (listado de gastos) y `fixtures/packages/` (listado de paquetes); en la raíz viven las de los gráficos del resumen (`bar-chart-*.html`, `donut-chart-*.html`, `chart-tooltip.json`), con su `README.md` que documenta la procedencia. **Regla:** los fixtures no se regeneran para que pase un test; si un test falla, el error está en el módulo. Hay **tres excepciones deliberadas**, cada una con su motivo medido en su propio README: `fixtures/sales/sale-confirm-dialog-cancel.html` y los cuatro `sale-row-*.html` (ver `fixtures/sales/README.md`) y los cinco de `fixtures/packages/` que corrigió `0d7ee14` (ver `fixtures/packages/README.md`). Acá solo se nombran; el porqué y el diff exacto viven en cada README. Ver `specs/tasks/frontend/11-refactor-resumen-con-graficos.md`.
