# 14 — El panel se comporta como aplicación cliente: navegación suave, caché de datos y detalle sin build

## Estado Actual

El panel ya es una compilación estática que consume la API en el navegador (D-005 vigente) y **ya tiene un router de cliente**: `src/layouts/Layout.astro:44` monta `<ClientRouter />` de `astro:transitions`. Cada clic en un enlace same-origin se intercepta, se pide el HTML de la ruta nueva, se reemplaza el `<body>` y se dispara `astro:page-load`; los scripts de pantalla ya están escritos para ese ciclo (`src/lib/core/page-load.ts`). Falta cerrar cuatro huecos, y uno de ellos no es de performance sino de frescura del dato.

### 1. El prefetch arranca cuando la persona ya está clickeando

`astro.config.mjs:5` declara `prefetch.defaultStrategy: 'tap'`, y `src/components/Nav.astro:38,95,136` repite `data-astro-prefetch="tap"` en los tres juegos de enlaces del armazón (barra lateral, cajón móvil y barra inferior).

`tap` engancha `touchstart` y `mousedown` (`node_modules/astro/dist/prefetch/index.js:22-34`): el pedido del HTML sale en el mismo instante en que la persona aprieta el botón. `prefetchAll` no está activado, así que ningún enlace fuera del armazón prefetchea.

### 2. El armazón se destruye en cada navegación

`transition:persist` no aparece en ningún archivo del proyecto. En cada navegación se reemplaza el `<body>` entero: `Nav`, el `<footer>` (`src/layouts/Layout.astro:63`) y el bloque de avisos se vuelven a crear, y sus scripts se vuelven a inicializar (`src/components/Nav.astro:631` reinicia el cajón, el tema y el prompt de instalación en cada `astro:page-load`).

`Nav` recibe `activeSection` y renderiza `sidebar-link--active` con `aria-current="page"` **en el servidor** (`src/components/Nav.astro:31-33`, tres veces). Eso es lo que hace que persistirlo no sea gratis.

### 3. No hay caché de datos: cada pantalla vuelve a pedir todo

`apiFetch` (`src/lib/core/api.ts:37`) va derecho a la red en cada llamada: no hay caché en memoria ni deduplicación de pedidos en vuelo. Volver de un detalle al listado repite la pantalla completa.

Los destinos que más lo sufren: `src/pages/sales/index.astro:357`, `src/pages/expenses/index.astro:181`, `src/pages/packages/index.astro:291` y las cinco llamadas de `src/pages/summary.astro`.

La infraestructura para avisar de datos viejos ya existe y no se toca: el service worker marca `X-ShopMar-Cached-At`, `apiFetch` lo lee (`:48`) y publica `shopmar:stale-data`, y `src/lib/shell/pwa.ts:47-67` muestra el aviso con la hora del dato.

### 4. El detalle de venta se fabrica en build, una página por venta

`src/pages/sales/[id].astro:15` usa `getStaticPaths()`: baja las ventas por lotes con `GET /api/v1/sales/with-details` y emite **una carpeta HTML por venta**. Medido sobre el `dist/` de hoy:

| Dato | Valor |
|---|---|
| Páginas totales del build | 5019 (medido por el verificador sobre `ac94faa^`) |
| Archivos dentro de `dist/sales/` | 5013 |
| Peso de `dist/` | 79 MB, casi todo `dist/sales/` |
| Pedidos HTTP del build a la API | 50 (eran 5001 antes de `build-depende-del-api`) |

Los números del build anterior **se mueven con la base**: cada venta sembrada agrega una página de detalle. Las cifras de esta tabla son las que midió el verificador independiente sobre `ac94faa^` con la base en **5011 ventas**; las que quedaron escritas antes en este documento —5008 páginas y 99 MB— salieron de una base distinta y no son reproducibles byte a byte. Lo que no cambia es el orden de magnitud de la diferencia: de ~5000 páginas a 10.

Y la consecuencia que no es de performance: **una venta registrada después del último build no tiene página de detalle**. El listado la muestra fresca, pero su enlace "Ver detalle" apunta a una ruta que no existe. Está documentado como límite en `specs/modules/frontend/08-pwa.md:75` y `specs/tasks/frontend/13-pwa-offline.md:17`, donde la estrategia de navegación tiene que evitar guardar un 404 justamente por esto.

Además, `[id].astro` es el **único** consumidor de la API en build: si la API no responde, `getStaticPaths` devuelve `[]` (`:37-40`) y el sitio sale sin ninguna página de detalle. Ninguna otra página tiene `getStaticPaths` ni `await` en el frontmatter.

### 5. Defecto encontrado en el camino: la impresión automática del detalle nunca funcionó

`src/pages/sales/[id].astro:97` lee `Astro.url.searchParams.get("print")` **desde un `<script>` de cliente**. `Astro` no existe en el navegador, y el bundle del build lo confirma: `dist/_astro/_id_.astro_astro_type_script_index_0_lang.C1I82Hsc.js` contiene literalmente `Astro.url.searchParams.get("print")`.

Consecuencia: cada carga de una página de detalle tira `ReferenceError: Astro is not defined` en la consola, y el `?print=1` que genera la fila del listado (`src/lib/sales/sale-list-row.ts:130`) no imprime nada. El botón "Imprimir" sí funciona, porque su listener se registra antes de la línea que explota.

Nadie lo detectó porque esa ruta no tiene ninguna prueba: el caso está descrito en `specs/modules/frontend/04-screens.md:106-107,119-123` y en `specs/tasks/frontend/05-formulario-de-venta.md:67`, pero no hay test unitario ni caso de QA que lo ejecute.

### 6. Lo que ya está a favor

Dos hechos del proyecto hacen que la Opción A sea barata, y no hay que construirlos:

- **`InvoicePrint` ya está diseñado para llenarse desde el cliente.** `src/components/README.md:49` documenta que el componente "se rellena por ganchos `data-invoice-*`" y describe el procedimiento completo (escribir cada valor con `textContent`, cambiar la clase del badge a `badge--<status>`, agregar los renglones al tbody, hacer visible `invoice--visible`, llamar a `window.print()`). El componente ya emite todos esos ganchos (`src/components/InvoicePrint.astro`, 147 líneas) y acepta `sale?: ISaleResponse | null` con `visible?: boolean`. Lo que falta es el script que lo llena.
- **Las páginas son estáticas y su HTML no depende de la query.** Está escrito en cuatro pantallas y en `src/lib/lists/filter-controls.ts:4`: "El HTML se prerenderiza sin query string: los controles solo pueden reflejar [el valor por defecto]". Eso es lo que permite que el service worker sirva el mismo shell para `/sales?page=2` y `/sales?page=3` (tarea 6).

## Objetivo

Que el panel se comporte como una aplicación de cliente sin dejar de ser una compilación estática: precarga al mirar un enlace, armazón que sobrevive la navegación, una pantalla ya visitada que se pinta sin pedir nada, y un detalle de venta resuelto en el navegador contra la API —fresco, para cualquier venta, con la impresión automática funcionando y sin que el build dependa de la API ni emita 5000 páginas.

## Decisiones

Las tres que quedan (el prefetch, la persistencia del armazón y la caché de datos) se registran en `specs/docs/07-decisiones.md` al implementar la unidad que las ejecuta, con la numeración siguiente a D-017. La cuarta, la forma de la URL, ya está registrada como **D-017**.

**D-A1 — El prefetch del armazón es `viewport`, no `tap`.** El costo de prefetchear es un documento HTML del armazón (nunca datos: el prefetch de Astro no llama a la API), y el beneficio es el pedido en vuelo antes de que la persona decida. En un panel de cuatro rutas fijas, todas visibles al cargar, `viewport` con el atributo por enlace es el punto correcto. Se descarta `tap` (llega tarde) y se descarta `prefetchAll: true`, porque después de esta tarea cada fila del listado tiene un enlace de detalle distinto y prefetchear diez variantes del mismo shell es trabajo tirado.

**D-A2 — El armazón se persiste con `transition:persist` y el enlace activo se marca en el cliente.** Persistir `Nav` y el `<footer>` evita reconstruir el DOM y reinicializar sus tres controladores en cada navegación. El precio es que el HTML viejo sobrevive, y con él el `sidebar-link--active` y el `aria-current` que hoy salen del servidor: hay que re-marcarlos en `astro:page-load`. Se conserva el render del servidor para el primer pintado —evita el parpadeo del link activo— y el marcado del cliente corrige las navegaciones siguientes.

**D-A3 — Hay caché de datos en memoria, con deduplicación y política por llamada.** Sólo `GET`. Un `Map` de URL a `{ data, at }` para la sesión, un `Map` de URL a `Promise` para los pedidos en vuelo, y dos políticas: `swr` para listados y agregaciones (se pinta lo cacheado al instante y se revalida atrás) y `fresh` para el detalle de una venta, que es el dato que se está por modificar. Toda escritura exitosa (`POST`, `PATCH`, `DELETE`) vacía la caché: es la forma barata de no mostrar una venta con el estado de hace un minuto. Se descarta cachear en `localStorage` (sobrevive a la sesión y agrega una migración de formato) y se descarta una librería de datos (rompe el presupuesto de dependencias de `specs/modules/frontend/01-arquitectura.md`).

**D-A4 — El detalle de venta es una ruta estática más, llenada en el cliente.** El `id` viaja en la URL y la venta se pide con `GET /api/v1/sales/:id` desde el navegador; el HTML que se sirve es siempre el mismo shell. Se descarta por completo `getStaticPaths`: el build deja de hablar con la API, deja de emitir una carpeta por venta y deja de publicar detalles que envejecen con cada alta. Se descarta también "generar la página del detalle al crear la venta", que exigiría escribir en el `dist/` desplegado desde la API.

**La forma de la URL quedó resuelta en la tarea 1 y es `/sales/detail?id=<uuid>`**, con las tres consecuencias que la decisión D-017 detalla: se agrega `src/pages/404.astro` porque `/sales/<id>` deja de existir, el service worker tiene que ignorar la query al buscar en la caché de navegación, y el build deja de leer la API.

## Alcance

- `specs/docs/07-decisiones.md` (las cuatro decisiones nuevas y la revisión de D-009 y D-005)
- `frontend/astro.config.mjs` (la estrategia de prefetch)
- `frontend/src/layouts/Layout.astro` (el `transition:persist` del armazón)
- `frontend/src/components/Nav.astro` (el atributo de prefetch y el marcado del activo)
- `frontend/src/lib/shell/nav-active.ts` (nuevo) y su prueba
- `frontend/src/lib/core/cache.ts` (nuevo) y su prueba
- `frontend/src/lib/core/api.ts` (la caché integrada, el aviso de datos viejos)
- `frontend/src/lib/core/api.test.ts` (deduplicación, invalidación y política)
- `frontend/src/lib/sales/sale-detail.ts` (nuevo) y su prueba
- `frontend/src/lib/sales/sale-list-row.ts` (el `href` del detalle y del `?print=1`)
- `frontend/src/pages/sales/[id].astro` (eliminado o convertido en el shell del detalle)
- `frontend/src/components/InvoicePrint.astro` (los rótulos que se mudan a la capa pura)
- `frontend/public/sw.js` (el precache del shell de detalle y la clave de caché de navegación)
- `frontend/src/pages/404.astro` (nuevo: la forma nueva de la URL deja huérfano a `/sales/<id>`)
- `specs/modules/frontend/01-arquitectura.md`, `03-componentes.md`, `04-screens.md`, `08-pwa.md`
- `specs/docs/03-ejecucion-local.md`, `specs/documentacion-cliente.md`
- `specs/tasks/README.md`

## Fuera de alcance

| Lo que no se hace | Por qué |
|---|---|
| Un router de cliente propio o un framework de UI | Es la Opción B del análisis, y exige reescribir las nueve pantallas. Esta tarea no cambia el modelo: sigue habiendo un documento por ruta. |
| Estado compartido entre pantallas | Sin store no hay estado compartido, y no hay ninguna pantalla que hoy lo necesite. La caché de datos de la tarea 4 resuelve el caso real (no repetir el pedido) sin introducir un store. |
| Registrar ventas sin conexión y sincronizar después | Ya está fuera de alcance en `13-pwa-offline.md`, por la misma razón: sin idempotencia en la API, un reintento duplica. Esta tarea no la habilita. |
| Cambiar la paginación del servidor | D-011 vigente. El prefetch de la tarea 2 sólo precarga el HTML del armazón; los datos siguen llegando al navegar. |
| Bajar el límite de peticiones del backend | Sigue siendo decisión de producto. Nunca fue el cuello de botella real. |
| Reducir el volumen del seed de 5000 ventas | Es una herramienta de carga, no un defecto. Con la tarea 5 el build deja de depender de él. |
| Precargar los datos de la próxima pantalla | Es un paso más allá del prefetch de HTML y necesita saber qué va a pedir la pantalla siguiente. Sin números que lo justifiquen, es adivinar. |
| Interceptar `POST`, `PUT`, `PATCH` o `DELETE` en el service worker | Ya está fuera de alcance en `13-pwa-offline.md`. La caché de la tarea 4 vive en memoria de la página y no toca escrituras. |

## Tareas

Cada unidad es un commit de la rama de la funcionalidad, con su prueba y su documentación adentro. Las líneas son estimaciones para dimensionar la revisión.

### T1 — La forma de la URL del detalle (cerrada)

El usuario eligió **`/sales/detail?id=<uuid>`**: cero configuración de host, funciona en cualquier servidor de archivos, y `/sales/<id>` pasa a ser un 404. Queda registrado como **D-017** en `specs/docs/07-decisiones.md`, con las dos alternativas descartadas y sus motivos (el respaldo del host depende de configuración no versionada; el shell servido desde `/404.html` nunca se cachearía, porque el service worker solo guarda respuestas con `response.ok`).

Lo que la decisión arrastra hacia las tareas 5 y 6: la pantalla `404.astro`, y `ignoreSearch` en la caché de navegación del service worker.

Evidencia: commit `856dccc` (el plan y D-017), rama `feat/panel-cliente`.

### T2 — Prefetch de `tap` a `viewport` (unidad 1, ~30 líneas)

- `astro.config.mjs`: `prefetch.defaultStrategy` pasa a `'viewport'`, `prefetchAll` sigue apagado.
- `src/components/Nav.astro:38,95,136`: el atributo pasa a `data-astro-prefetch` sin valor en los tres juegos de enlaces.
- `src/lib/sales/row-navigation.ts`: el comentario de cabecera nombra "el prefetch por `tap`"; con esta tarea deja de ser cierto.
- `specs/modules/frontend/01-arquitectura.md`: la estrategia y por qué.
- Verificación: caso de QA con Playwright que carga `/` y afirma que se pidió `/packages` antes de cualquier clic. Sin la tarea, ese pedido no existe con `tap`. **El caso pertenece a esta unidad**, porque es la única prueba que tiene: no se difiere a la tarea 7.
- `Risk: none` — sólo cambia cuándo sale un pedido de HTML del armazón; no toca datos, permisos ni contratos.

Evidencia: commit `257ad88`, con **D-018**. El RED lo reprodujo el padre con `defaultStrategy: 'tap'` (`1 failed`) y el GREEN con `'viewport'` (`1 passed`), contra el servidor de desarrollo en `:4321`; no se tomó la palabra de quien escribió el cambio. Además: `pnpm test` 490/490 en 37 archivos y `astro check` con 0 errores y 0 advertencias.

Desvío declarado: el filtro del caso no puede ser `resourceType() === "document"`, porque Chromium reporta el `<link rel="prefetch">` como `"other"`. El filtro acepta `document`, `other` y `fetch`, y compara por pathname; queda escrito en el caso y en D-018 para que nadie lo "corrija" después.

### T3 — El armazón sobrevive la navegación (unidad 2, ~120 líneas)

- La persistencia del armazón, con claves propias: `transition:persist="shell-sidebar"` en el `<aside>`, `"shell-topbar"` en el `<header>`, `"shell-scrim"` en el scrim del cajón y `"shell-drawer"` en el `<nav>` del cajón —las cuatro raíces de `Nav.astro`—, y `"shell-foot"` en el `<footer>` de `Layout.astro`, que es el único del layout. El scrim se persiste junto con el cajón porque su visibilidad es el otro lado del mismo estado.
- **Hallazgo medido antes de escribir esta unidad:** `transition:persist` sobre el componente `<Nav />` no sirve. El componente tiene **cuatro raíces** (`aside`, `header`, `div` del scrim y `nav` del cajón) y Astro descarta la directiva en silencio: el HTML servido no lleva ningún `data-astro-transition-persist`. Verificado empíricamente contra el servidor de desarrollo — con un elemento plano la directiva sí emite el atributo, con o sin valor—. Por eso va adentro de `Nav.astro`, una por raíz.
- **Claves explícitas obligatorias:** el emparejamiento del router busca por valor (`newElement.querySelector('[data-astro-transition-persist="<valor>"]')`, `node_modules/astro/dist/transitions/swap-functions.js:99`). Con varios elementos persistidos y el valor vacío, todos los viejos apuntarían al mismo nuevo. Astro autogenera claves únicas para una directiva sin valor en elementos planos, pero no hay que depender de eso: cada elemento persistido lleva su nombre.
- `src/lib/shell/nav-active.ts` (nuevo): una función pura `activeSectionFor(pathname)` que mapea la sección por el **primer segmento** de la ruta —`/`, `/sales`, `/sales/new`, `/sales/<id>`, `/sales/detail`, `/packages`, `/expenses`— a la sección del armazón, y una capa DOM `markActiveNav(section)` que pone `sidebar-link--active` y `aria-current="page"` en los enlaces que corresponden y los quita del resto. Los **tres** juegos de enlaces (barra lateral, barra superior y cajón) tienen que quedar consistentes.
- `src/components/Nav.astro:631`: el handler de `astro:page-load` que ya reejecuta el cajón, el tema y el prompt de instalación suma el re-marcado del activo.
- `activeSection` se sigue pasando desde las páginas: da el estado correcto en el primer pintado y evita el parpadeo. El cliente corrige las navegaciones siguientes.
- Pruebas: `nav-active.test.ts` con el mapeo puro (incluye la ruta de detalle, que pertenece a la sección de ventas) y una prueba de DOM en jsdom sobre un armazón de prueba con los tres juegos de enlaces.
- Verificación, con dos afirmaciones y un orden que importa:
  - **Preservación (hoy pasa, tiene que seguir pasando):** tras navegar `/sales` → `/packages` con un clic real, los **tres** elementos con `aria-current="page"` —uno por juego de enlaces: barra lateral, barra superior y cajón— apuntan a `/packages`, y ninguno apunta a otra sección. Hoy los pinta el servidor, después los pinta el cliente: la afirmación es la misma.
  - **Comportamiento nuevo (es el RED de la unidad):** el nodo del armazón **sobrevive** la navegación. Antes de navegar, marcar el elemento persistido con una propiedad de JS (`el.dataset.probe = "sigue"`); después de navegar, la propiedad sigue ahí. Un nodo recreado la pierde. Hoy no existe ningún elemento persistido, así que la afirmación falla antes del cambio.
- `Risk: none` — el único daño posible es el link activo equivocado, que es visible y está cubierto por las pruebas y por la verificación de Playwright.

Evidencia: commit `e3c5881`, con **D-019**. El RED lo reprodujo el padre quitando las cinco claves de persistencia: el caso falla en la línea del `probe` (`Expected: "sigue"`, `Received: null`), con la afirmación de preservación ya pasada, así que discrimina el comportamiento nuevo y no la regresión. Además: `pnpm test` 503/503 en 38 archivos, `astro check` sin errores ni advertencias, y el HTML servido lleva las cinco claves (`shell-sidebar`, `shell-topbar`, `shell-scrim`, `shell-drawer`, `shell-foot`).

Nota de operación, encontrada al verificar: después de tocar un archivo hay que esperar a que el servidor de desarrollo recompile antes de correr el caso de Playwright, o se mide el código anterior y el verde sale falso. Una corrida posterior al `cp` de restauración falló una vez por eso y pasó al repetirse.

### T4 — Caché de datos en memoria (unidad 3, ~200 líneas)

- `src/lib/core/cache.ts` (nuevo): política pura y testeable —`shouldRevalidate(policy, age, ttl)`, `cacheKeyFor(method, url)`, `isCacheable(method)`— y el almacén (`Map` de datos, `Map` de pedidos en vuelo, `clear()`).
- `src/lib/core/api.ts`: `apiFetch` consulta la caché antes de la red, comparte el `Promise` cuando hay un pedido idéntico en vuelo, guarda el `at` que ya lee de los encabezados y **publica `shopmar:stale-data` con ese `at` cuando sirve de la caché**, con lo que el aviso de `src/lib/shell/pwa.ts` dice la verdad sin ningún cambio ahí. Un fallo nunca se cachea. Toda escritura exitosa vacía la caché.
- La política la declara quien llama, y el valor por defecto es `swr`: los listados y las agregaciones no cambian nada y quedan cubiertos por el defecto. La política `fresh` la va a usar el detalle de venta de la tarea 5, que es el dato que se está por modificar. **Esta unidad no toca ninguna pantalla.**
- Pruebas en `src/lib/core/api.test.ts` con `fetch` falso: dos llamadas idénticas en paralelo producen **un** pedido; dos secuenciales dentro del TTL producen uno; una escritura invalida la lectura siguiente; un `Promise` rechazado no queda guardado; el `at` que llega por `shopmar:stale-data` es el del dato servido.
- Documentación: `specs/modules/frontend/01-arquitectura.md` (la capa nueva y sus dos políticas) y `08-pwa.md` (el aviso de datos viejos ahora también cubre la caché de la memoria).
- `Risk: none` — es una caché de lectura en memoria de la página, con las escrituras invalidando por completo. El modo de falla (pintar un dato viejo) tiene aviso visible y prueba que lo fija.

### T5 — El detalle de venta se resuelve en el cliente (unidad 4, ~350 líneas)

- `src/lib/sales/sale-detail.ts` (nuevo) con la división que el proyecto ya usa en el resto de `src/lib/`:
  - `saleDetailView(sale)` puro: número de factura (los ocho primeros caracteres del `id`), rótulo del canal, texto del pago, clase del badge, la fecha, el total y los grupos de `groupInvoiceRows`;
  - `saleDetailFromLocation(href)` puro: saca el `id` y el `print=1` de la URL, y devuelve si la URL es válida;
  - `renderSaleDetail(sale)` sobre el DOM, escribiendo **por los ganchos `data-invoice-*`** que el componente ya emite, exactamente como lo documenta `src/components/README.md:49`.
- `src/components/InvoicePrint.astro`: los rótulos `typeLabels` y el armado de `paymentText` se mudan a la capa pura, porque hoy viven en el frontmatter y no se pueden probar. El componente sigue aceptando `sale` y `visible` y no cambia su estructura.
- La página del detalle, `src/pages/sales/detail.astro`, reemplaza a `[id].astro`: armazón, `InvoicePrint` con `sale={null}`, y un script que pide la venta, la pinta, hace visible la capa y resuelve los tres estados —cargando, venta inexistente (`NOT_FOUND` está traducido en `src/lib/core/errors.ts:5`), y error con reintento— reutilizando los pintadores que ya existen. Actualiza `document.title` con el número de venta.
- **La impresión automática se implementa de nuevo y bien**: `print=1` se lee de `window.location.search`, no de `Astro.url`. El `ReferenceError` que hoy hay en la consola desaparece, y el enlace `?print=1` de `src/lib/sales/sale-list-row.ts:130` imprime.
- `src/pages/sales/[id].astro`: se elimina `getStaticPaths` y todo su camino de error, incluido el aviso `[sales] API inalcanzable en build` (su único consumidor era esta ruta).
- `src/lib/sales/sale-list-row.ts`: los dos `href` apuntan a `/sales/detail?id=<id>` (el de `?print=1` incluido).
- `src/pages/404.astro` (nuevo): una pantalla mínima dentro del armazón que dice que la venta se mudó desde `/sales/<id>` y enlaza a Ventas. Es la contrapartida de haber elegido la forma 2 de la URL: sin ella, un marcador viejo cae en el 404 pelado del servidor. Hoy no existe ningún `404.astro` en el proyecto.
- Pruebas: `sale-detail.test.ts` para la capa pura (con las cuatro combinaciones de canal y pago, y una URL sin `id`), y una prueba en jsdom de que `renderSaleDetail` llena todos los ganchos —incluida la clase del badge y los renglones adicionales— sobre el marcado real del componente.
- **El caso de QA de la impresión automática pertenece a esta unidad**, no se difiere: es la regresión del defecto que la unidad arregla, y sin él la unidad no tiene prueba de su parte más frágil. Va en `qa/tests/cases/ventas.md` como `TC-VEN-*` (el detalle ya vive en ese catálogo) con su `.spec.ts`, el backend levantado con datos, y la afirmación de que `window.print()` se llamó solo al abrir con `print=1`. Regla del caso: falla antes del cambio y pasa después.
- **Medición obligatoria, antes y después** (ver Criterios de Done): páginas del build, peso de `dist/`, y la misma cantidad de páginas con la API caída.
- Verificación con `gentle-ai-verify`: contar las páginas del build antes y después, construir con la API inalcanzable y confirmar `exit 0`, y abrir un detalle con `?print=1` para confirmar que imprime sola.
- `Risk: item 3` — la URL del detalle es un contrato que la dueña ya usa: historial, marcadores, y el `?print=1` que genera cada fila del listado. Los enlaces que la aplicación misma genera se corrigen en esta unidad, pero los guardados por fuera se rompen. Mitigación: `404.astro` devuelve a Ventas en vez de dejar a la persona en un error pelado. La verificación independiente de esta unidad es obligatoria, y si la revisión nativa está encendida, la unidad entra sola en su propio commit para que se pueda revisar aislada.

Evidencia: commit `ac94faa`, sobre la decisión **D-017**. Medición hecha por el padre sobre el build del propio commit: **10 páginas HTML**, **708 K** (el verificador midió 660 K sobre su propio build), `dist/sales` con sólo `detail`, `index.html` y `new`, y build en **1,36 s** con `PUBLIC_API_URL=http://127.0.0.1:9` —misma cantidad de páginas que el build normal—, o sea que el frontend dejó de necesitar el backend para compilar. `grep -rl "Astro\.url" dist/` sin resultados. **551/551** pruebas en 40 archivos, `astro check` con 0 errores y 0 advertencias, y `TC-VEN-055` (impresión automática) en verde en 903 ms.

El RED del caso de impresión no se pudo volver a reproducir después del cambio porque la ruta vieja ya no existe: lo que sí está verificado por el padre, antes de esta unidad, es la causa —el bundle del build contenía `Astro.url.searchParams.get("print")`— y la firma del fallo reportado (`[pageerror] Astro is not defined`) es la de esa causa.

Dos correcciones de revisión entraron antes del commit, las dos sobre lo mismo: que la prueba y el marcado digan la verdad. `sale-list-row.test.ts` reescribía los `href` de la expectativa antes de comparar, así que los cuatro fixtures de fila se actualizaron por el camino que documenta el README de fixtures (tercera actualización deliberada) y la comparación volvió a ser contra el fixture crudo. Y la línea "Suma de mercadería", que `renderSaleDetail` creaba por su cuenta, pasó a tener gancho propio en `InvoicePrint.astro`: duplicaba el marcado de la factura y dejaba la rama del componente en código muerto.

### T6 — El service worker sirve el shell del detalle sin red (unidad 5, ~60 líneas)

- `frontend/public/sw.js`:
  - el shell del detalle se agrega a `SHELL_ASSETS`, para que una navegación sin red a un detalle abra el armazón;
  - la búsqueda en la caché de navegación pasa a `cache.match(request, { ignoreSearch: true })`: la búsqueda resuelve contra cualquier variante del mismo pathname, así que una navegación sin copia exacta se sirve del shell precacheado. Es seguro porque el HTML se prerenderiza sin query string y la query la lee el script del cliente (`src/lib/lists/filter-controls.ts:4`). **Corregido después de la verificación independiente**: esto amplía la búsqueda, no la escritura, así que el caso «comparten una sola entrada de caché» que este plan decía antes era falso; `refreshNavigation` guarda la URL exacta y la caché crece una entrada por variante igual que antes;
  - `VERSION` sube, que es lo que hace que el navegador detecte la versión nueva.
- Deja de ser necesario el cuidado de `08-pwa.md:75` sobre no guardar un 404: la ruta del detalle existe siempre.
- Verificación: con Playwright, abrir `/sales/detail` con la red cortada y afirmar que se ve el armazón y el aviso de datos viejos con la hora del dato cacheado.
- `Risk: item 1 (una clave de caché de navegación demasiado amplia puede servir el armazón de una ruta para otra)`. La mitigación ya está probada por construcción —todas las rutas estáticas tienen su propio pathname y sólo la query se ignora— y se verifica con la navegación offline de arriba **y** con una navegación online a dos rutas distintas.

Evidencia: commit `367ba43`. El diferencial lo reprodujo el padre sobre el `astro preview` del build: con el `sw.js` de HEAD, **1 failed**; con el nuevo, **2 passed**. `ignoreSearch` quedó **sólo** en `handleNavigation` (`sw.js:72`), y `cacheFirst` (`:49`) y `handleApi` (`:111`) conservan el match exacto. La suite del frontend sigue en **551/551**.

Dos desvíos del enunciado, los dos por medición y no por comodidad:

- **El flujo literal no medía la unidad.** Abrir el detalle con red, recargar bajo control y reabrir la misma URL sin red ya pasaba antes del cambio: la recarga controlada deja cacheado el documento exacto, y `handleNavigation` lo sirve. El caso borra a propósito esa copia exacta antes de cortar la red, y con eso el shell queda frío y la diferencia entre tener y no tener `ignoreSearch` es observable. Sin ese paso, el caso era un verde que no probaba nada.
- **El caso no corre en el servidor de desarrollo.** En `astro dev` los módulos de la página viven en `/src/` y `/@vite/`, fuera del `cacheFirst`, así que sin red no corre el JS y la factura nunca se pinta. El caso se salta contra `:4321` con ese motivo escrito en el catálogo, y su criterio real se corre contra el build: `cd frontend && pnpm build`, `astro preview`, y `SHPR_UI_URL` apuntando ahí.

**Verificación independiente (`gentle-ai-verify`): 7 de 7 confirmadas y el riesgo nombrado refutado.** El verificador midió por su cuenta: seis rutas conservan su propio `[data-page]` **online y sin red** —ninguna sirve el armazón de otra—, `ignoreSearch` es la única ocurrencia del archivo (`sw.js:72`) con `cacheFirst` (`:49`) y `handleApi` (`:111`) exactos, ninguna respuesta con estado ≥400 entra a la caché, sin copia la navegación cae en `/offline`, el diferencial se reproduce (1 failed → 2 passed) y `VERSION` 3.1.0 se detecta. 551/551.

Y encontró algo más útil que un bug: **la justificación que este plan y D-017 escribieron era falsa.** `ignoreSearch` amplía la **búsqueda**, no la escritura: `refreshNavigation` y el camino de red guardan la URL exacta, así que tras visitar dos ids hay tres entradas de `/sales/detail` (el precache sin query más una por id) y el almacenamiento crece por variante igual que antes. Lo que la unidad compra es que una navegación **sin copia exacta** se resuelva con el shell precacheado. Corregido en D-017, en `08-pwa.md`, en el comentario del `sw.js` y acá.

Su sonda de aislamiento de rutas se adoptó como tercer caso de `TC-NAV-003`: es la prueba directa del riesgo nombrado y cubre la mitad que faltaba —la vuelta sin red—. Dos avisos quedan declarados: `/sales/detail/` con barra final no casa con el precache (la aplicación nunca genera esa URL), y la acumulación por variante no se midió contra la cuota de Cache Storage.

### T7 — El catálogo de QA del detalle queda al día

- `qa/tests/cases/`: todo caso que cite `/sales/[id]` pasa a la forma nueva, y se registra la familia de la impresión automática. Los casos del detalle que hoy describen una ruta pre-renderizada dejan de ser ciertos a partir de D-017.
- `specs/tasks/qa/02-descubrimiento-y-generacion-de-casos.md`: la tabla de rutas del inventario, que lista `/sales/[id]`.
- El `.spec.ts` de la impresión automática no se escribe acá: es de T5, porque es la prueba de esa unidad.

### T8 — Documentación y cierre

- `specs/modules/frontend/01-arquitectura.md`: el prefetch, `transition:persist`, la caché de datos, el detalle en el cliente y **que el build ya no necesita la API** (hoy el documento describe el árbol con `[id].astro` y el detalle pre-renderizado, `:96,115`).
- `specs/modules/frontend/03-componentes.md:16-18,173`: dónde se usa `InvoicePrint` y quién lo llena.
- `specs/modules/frontend/04-screens.md:14,106-107,119-123`: la ruta del detalle y la impresión automática.
- `specs/modules/frontend/08-pwa.md:23,75,111`: el límite del detalle pre-renderizado desaparece, la tabla de navegación gana el `ignoreSearch`, y la fila "El build necesita la API levantada" deja de ser cierta.
- `specs/docs/03-ejecucion-local.md:98-110`: la sección "Build y producción" y la fila de solución de problemas que dice que el build necesita el backend.
- `specs/documentacion-cliente.md:148`: la ruta del detalle en la tabla de pantallas.
- `specs/docs/07-decisiones.md`: las cuatro decisiones y la revisión de D-009 (la factura es un estado de impresión de una pantalla; el detalle deja de ser una ruta por venta).
- `specs/tasks/README.md`: el área 14, el conteo de frontend y el total.
- `specs/tasks/frontend/05-formulario-de-venta.md:67,97`: la tarea dice que un alta redirige a `/sales/{id}` y el código redirige a `/sales` (`src/pages/sales/new.astro:627`). Es una deriva previa, no de esta tarea: se corrige en la misma pasada para que no confunda a quien lea el detalle.
- `specs/tasks/frontend/13-pwa-offline.md:17`: su Estado Actual describe el límite que esta tarea elimina.

Evidencia: commit `e484ade`. Diez archivos de specs, más cuatro afirmaciones falsas que quedaban fuera de las anclas originales y que el cierre no podía dejar en pie: la tabla «Lo que hay hoy» de `08-pwa.md` —decía que no había manifest, service worker, metadatos ni áreas seguras—, el conteo del build como invariante y el dato de `sales/<id>.html` por venta en `06-testing.md`, y la justificación del endpoint `with-details` en `api/02-sales.md`, cuyo consumidor era el build. `pnpm test` en 551/551 y los tres casos del área en verde.

D-005 y D-009 quedaron **enmendadas**, no reescritas: una línea de estado que cita las decisiones nuevas y conserva el núcleo de cada una.

## Cierre del área

| Unidad | Commit | Qué dejó |
|---|---|---|
| T1 | `856dccc` | El plan del área y **D-017** |
| T2 | `257ad88` | Prefetch `viewport` y **D-018** |
| T3 | `e3c5881` | Armazón persistido y **D-019** |
| T4 | `fe3af2a` | Caché de datos y **D-020** |
| T5 | `ac94faa` | El detalle en el cliente, sin `getStaticPaths` |
| T6 | `367ba43` | El service worker sirviendo el shell sin red |
| T7 | `e0be60a` | El catálogo de QA al día |
| T8 | `e484ade` | El cierre de la documentación |

Más los commits de corrección: `1ae2859`, `3b1946c`, `9d1ed9a`, `fec0ff3`, `4c71e7e`, `b75a327`.

**Lo prometido, medido**: 5019 → **10** páginas HTML; 79 MB → **708 K** (el verificador independiente midió 660 K sobre su propio build); build en **1,36 s** con `PUBLIC_API_URL` apuntando a un puerto muerto; y `grep -rl "Astro\.url" dist/` sin resultados.

**Lo que queda abierto**, con su evidencia y sin decorar. Nada de esto bloquea la entrega, y todo está declarado:

| Deuda | Estado |
|---|---|
| El criterio 14 no se puede cumplir: la suite de QA no colecciona por un defecto previo de `qa/tests/fixtures/ui.ts` | Espera decisión del usuario |
| `TC-NAV-003` se salta en el entorno por defecto de la suite y su criterio real corre contra el build | Documentado en el catálogo |
| `R4-SWR-1`, el hallazgo que la revisión nativa no pudo atribuir | Deuda declarada; su asunto plausible está en D-020 |
| `salesApi.listWithDetails` quedó huérfano: T5 le quitó su único consumidor | Hallazgo abierto |
| `/sales/detail/` con barra final no casa con el precache; la cuota de Cache Storage no se midió | Avisos del verificador de T6, declarados |

La **verificación independiente de T6 llegó después de este cierre** y salió mejor de lo que estaba previsto: 7 de 7 confirmadas, el riesgo nombrado **refutado** con seis rutas conservando su propio armazón online y sin red, y una corrección que entró en `738b330` porque la justificación de `ignoreSearch` que este plan y D-017 escribían era falsa: amplía la búsqueda, no la escritura. La revisión nativa de la rama, en cambio, quedó **declinada por el usuario** para el candidato de turno.

**Lo que no se hizo, y por qué**: nada del «Fuera de alcance» se tocó. En particular, la opción B del análisis —un router de cliente propio o un framework de UI— no se rozó: el panel sigue siendo una compilación estática con un documento por ruta, que era la premisa de todo el trabajo.

## Criterios de Done

Se ejecutan desde `frontend/` salvo donde diga otra cosa, con el backend levantado y la base sembrada.

```bash
cd frontend
pnpm test                       # vitest: la suite entera, con las pruebas nuevas
pnpm exec astro check           # tipos y plantillas
rm -rf dist && pnpm build       # exit 0
```

| # | Comprobación | Comando | Esperado |
|---|---|---|---|
| 1 | Páginas del build | `find dist -name '*.html' \| wc -l` | **menos de 25** (eran 5019 sobre `ac94faa^`, con 5011 ventas en la base) |
| 2 | Peso del build | `du -sh dist` | **menos de 2 MB** (eran 79 MB) |
| 3 | Carpetas por venta | `ls dist/sales` | sólo `new` y `detail` |
| 4 | El build no depende de la API | `PUBLIC_API_URL=http://127.0.0.1:9 pnpm build` | `exit 0` y la **misma** cantidad de páginas que el punto 1 (hoy: `exit 0` y cero páginas de detalle) |
| 5 | El defecto de impresión no queda | `grep -rl "Astro\.url" dist/` | sin resultados |
| 6 | Una venta nueva tiene detalle sin reconstruir | registrar una venta y abrir su detalle | carga con el dato fresco, sin haber corrido el build |
| 7 | El detalle sin red | navegar a un detalle ya visitado con el servicio cortado | armazón visible y el aviso de datos viejos con la hora |
| 8 | El armazón no se reconstruye | navegar entre dos secciones y comparar el nodo persistido | el mismo nodo antes y después |
| 9 | El link activo sigue bien | navegar entre las cuatro secciones | los tres elementos con `aria-current="page"` —uno por juego de enlaces— apuntan a la sección actual, y ninguno a otra |
| 10 | Una pantalla visitada no vuelve a pedir | volver a un listado ya abierto y mirar la pestaña de red | ninguna llamada a la API para los datos servidos de la caché |
| 11 | Prefetch | cargar `/` y mirar la pestaña de red | el HTML de las cuatro secciones se pidió sin ningún clic |
| 12 | La impresión automática | abrir un detalle con `?print=1` | el diálogo de impresión aparece solo y la consola queda limpia |
| 13 | La ruta vieja no queda pelada | abrir `/sales/<uuid>` | la pantalla `404.astro` con la explicación y el enlace a Ventas |
| 14 | QA | `cd ../qa && pnpm exec playwright test` | **bloqueada por un defecto previo**: la suite no colecciona (ver "Riesgos"). Los casos del área que sí corren —`TC-NAV-001`, `TC-NAV-002` y `TC-VEN-055`— pasan |

Las comprobaciones 4, 6, 7, 12 y 13 no se pueden hacer por lectura de código: se ejecutan.

## Slices de revisión

La rama `feat/panel-cliente` acumula las cinco unidades. Para la revisión se cortan en slices de unas 400 líneas autoradas; el corte vive en la rama, no en un push.

| Slice | Unidades | Líneas | Estado |
|---|---|---|---|
| 1 | T1 + T2 | 391 | commiteado (`856dccc`, `257ad88`, `1ae2859`) |
| 2 | T3 | 236 | commiteado (`e3c5881`, `3b1946c`) |
| 3 | T4 | 542 | commiteado (`fe3af2a`) |
| 4 | T5 | 832 | commiteado (`ac94faa`), y va **sola** en su pull request |
| 5 | T6 | ~140 | commiteado (`367ba43`, `b75a327`) |
| 6 | T7 + T8 | ~290 | commiteado (`e0be60a`, `e484ade`) |

Los slices 3 y 4 quedaron por encima de las 400 líneas: en T4 son 284 líneas de pruebas y en T5 son 380, y separarlas del código que prueban rompería la regla de que la prueba viaje con el comportamiento. T5 va sola en su pull request por `Risk: item 3` y por su verificación independiente. Empujar la rama y abrir los pull requests es decisión del usuario.

## Revisión nativa (RDD encendido)

La rama entera se revisó como **un solo candidato consolidado** (`base-ref` `caa2b03`, 34 archivos, 2173 líneas), en `tier: medium` y con las lentes **risk**, **resilience** y **reliability**.

| Dato | Valor |
|---|---|
| Lineage | `review-78043c3f4ae27dc9` |
| Target | `sha256:a7d422aed9666e1778dc6d45163a14188eb6481d67ad767be231c89be1e96283` |
| Resultado | **`escalated`** — cierre terminal con `reason_code: native_stop_required` |
| Motivo | `unknown_causality` sobre el hallazgo `R4-SWR-1` (lente resilience) |
| Artefactos admitidos | `rart1_81b92e…` (risk) y `rart1_909917…` (resilience) |

El proveedor **no aprobó ni rechazó**: cerró con hallazgos severos que no pudo atribuir al candidato, y su propia acción es informativa. La lente de resilience ya había declarado ese mismo hallazgo como `unverified_location` y el cierre lo reiteró como causalidad desconocida. **No se quemó ninguna autoridad** —no hubo `acknowledge-approved`, porque no hubo `approved`— y la entrega sigue dependiendo de la política ordinaria del repositorio.

Dos cosas que esta revisión **no** hizo: no ofreció ruta de corrección (el presupuesto de 200 líneas quedó sin usarse) y no expuso el texto del hallazgo, sólo su identificador. El asunto plausible de `R4-SWR-1` es la ventana de 30 s de la caché `swr` —una entrada de menos de 30 s se sirve sin aviso, porque `at` es `null` en una respuesta fresca; está aceptado a propósito en **D-020**—, pero eso es una lectura por el identificador y la lente, no una atribución. Queda como **deuda declarada**, no como defecto confirmado.

La corrida grupal de las tres lentes falló una vez por transporte (`Stream ended without finish_reason` en `review-risk`, sin mutación y sin revisores enviados) y se retomó de a un slot, como indica el contrato.

## Riesgos y deuda que esta tarea deja

| Punto | Qué se acepta |
|---|---|
| La URL del detalle depende del host (forma 1) | Si el host no se configura, `/sales/<id>` devuelve 404. Por eso la tarea 1 es un prerrequisito y no un detalle: la decisión se toma antes de escribir el código. |
| La caché de datos sobrevive mientras la pestaña esté abierta | Recargar siempre trae datos frescos. En una pestaña abierta mucho tiempo, un `swr` puede mostrar un listado de hace minutos: lo cubre el aviso de datos viejos, que ya existía. |
| El prefetch gasta ancho de banda | Cuatro documentos de armazón, ya en la caché del service worker después de la primera visita. Sin datos de por medio. |
| `ignoreSearch` es correcto **hoy** | Vale mientras ninguna ruta decida su HTML por query string en el servidor. Como el build es estático, eso no puede pasar sin un adaptador: la decisión queda anotada en `08-pwa.md` para que la próxima persona no la revierta por reflejo. |
| El defecto de `Astro.url` pudo haber afectado QA | No hay evidencia de que alguien haya dependido de la impresión automática. Al agregar el caso de QA queda cubierto para siempre. |
| **La suite de QA no colecciona, y es previo** | `qa/tests/fixtures/ui.ts:69` declara un `afterEach` con parámetros que no son fixtures (`consoleMessages`, `networkLog`), así que cualquier spec que importe ese archivo falla al coleccionar y `playwright test` sin filtro termina en `Total: 0 tests in 0 files`. El archivo es **idéntico a HEAD**, del commit `fb66320` ("checkpoint de QA-03 sin terminar"): no lo introdujo el área 14, pero deja el criterio 14 sin poder cumplirse. Los casos del área —`TC-NAV-001`, `TC-NAV-002`, `TC-NAV-003` y `TC-VEN-055`— no importan ese archivo y corren. **Decisión pendiente del usuario**: arreglarlo como unidad aparte, fuera del área 14. |
| **`TC-NAV-003` no corre en el entorno por defecto de la suite** | El caso mide el service worker sobre el build estático, y en `astro dev` los módulos de la página viven fuera de la caché del service worker: sin red no corre el JS. Contra `:4321` se salta con el motivo escrito. No es una limitación de la unidad sino del entorno de la suite: el service worker existe para el artefacto construido. Su comando quedó escrito en el catálogo, y el padre lo corrió verde en diferencial. Queda como deuda de encaje: si la suite quiere cubrirlo de verdad, necesita un runner contra `astro preview`. |
