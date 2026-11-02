# PWA — propuesta para instalar el panel en el teléfono

## La idea en una frase

Convertir el panel en una aplicación instalable en el teléfono del local: que se abra desde su propio ícono, sin la barra del navegador, y que ante un corte de wifi muestre el último dato conocido en lugar de una pantalla de error.

## Por qué

El panel se usa parado, en el mostrador, con una mano y con la otra atendiendo. Hoy eso significa abrir el navegador, escribir o buscar la dirección, y convivir con la barra de direcciones comiéndose 50px de alto en la pantalla más chica que hay en el local. Una aplicación instalada elimina esos tres pasos y además el navegador deja de descartar el shell entre visitas.

El segundo motivo pesa más con el tiempo: el wifi del local no es confiable, y hoy un corte se ve como el estado de error de cada pantalla. Con la capa de caché correcta, un corte de red se ve como el mismo panel con los datos de hace un rato y un aviso discreto, que es una situación mucho mejor que una pantalla vacía.

## Lo que hay hoy

| Hecho | Evidencia |
|---|---|
| Compilación 100% estática | `astro.config.mjs` no declara `output` ni integraciones; el build emite **12 HTML** (eran 5019 con una carpeta por venta antes de D-017) más los JS y CSS que Astro extrae a `dist/_astro/` |
| Las rutas del panel sirven el mismo documento | desde T1 cada ruta del panel (`/`, `/sales`, `/sales/new`, `/sales/detail`, `/customers`, `/packages`, `/expenses`, `/expenses/new`, `/new`) renderiza el armazón de `components/App.astro` con las nueve plantillas adentro (D1, D2). `/offline` es el único documento propio, porque es el respaldo y tiene que existir aunque no haya armazón en caché |
| Manifest, service worker y metadatos | `frontend/public/` tiene `manifest.webmanifest`, `sw.js`, `icons/` y `screenshots/`; `Layout.astro` declara `theme-color`, `apple-touch-icon` y `apple-mobile-web-app-*`, y el viewport lleva `viewport-fit=cover` |
| Áreas seguras | el armazón y las hojas usan `env(safe-area-inset-*)` |
| Presupuesto de dependencias cero | `specs/modules/frontend/01-arquitectura.md` lo declara; `package.json` solo tiene `astro` y `lucide-astro` |
| Origen de producción ya previsto | `specs/modules/backend/04-security.md:150` documenta `https://panel.tienda.local` |
| El detalle de cada venta es una sola página estática | `src/pages/sales/detail.astro` lee el `id` de la query (D-017): el build emite una sola página para todas las ventas y no consulta la API |

## Las tres restricciones que definen la propuesta

**1. Sin contexto seguro no hay service worker.** Los service workers solo se registran en un origen seguro: HTTPS, o `http://localhost` como excepción para desarrollo. Servido por IP en la red del local (`http://192.168.1.10:4321`) el registro falla y no hay forma de evitarlo desde el código. Consecuencia: la PWA real necesita que el panel se sirva por HTTPS. El proyecto ya lo tiene previsto como `https://panel.tienda.local`, pero eso arrastra un segundo problema: **si el panel es HTTPS y la API sigue en `http://…:3000`, el navegador bloquea los pedidos por contenido mixto**. Los dos tienen que hablar el mismo esquema, o la API tiene que ir por el mismo origen que el panel.

**2. El plugin estándar no cubre este Astro.** `@vite-pwa/astro` declara compatibilidad con `astro` en `^1.6.0`, `^2`, `^3`, `^4` y `^5`. Este proyecto usa `astro ^7.2.1`. Adoptarlo obliga a forzar la instalación y a asumir que la integración sigue funcionando con un major que no declara soportar. Sumado al presupuesto de dependencias cero, esto inclina la decisión.

**3. La compilación es estática y los datos llegan después.** El HTML de cada pantalla sale del build, pero los datos los pide el navegador con `fetch` (`src/lib/core/api.ts:31`). Eso separa limpiamente las dos capas que hay que cachear: el shell, que es inmutable y se puede guardar sin riesgo, y las respuestas de la API, que son datos y necesitan una política distinta.

## Decisión: hacerlo a mano, sin dependencias

| | Opción A — manifest y service worker escritos a mano | Opción B — `@vite-pwa/astro` |
|---|---|---|
| Dependencias | ninguna; los PNG se generan con `magick`, que ya está instalado | dos de desarrollo (`@vite-pwa/astro` y `workbox-window`) más `workbox-build` |
| Compatibilidad | no depende de ningún major de Astro | declara hasta `^5`; hay que forzar con `astro ^7.2.1` |
| Precarga del build | no tiene lista de precarga: usa estrategias en tiempo de ejecución | genera la lista con los hashes del build |
| Control de las estrategias | total, el archivo se lee entero en un minuto | hay que aprender la configuración de Workbox para cambiarla |
| Mantenimiento | un archivo propio, sin actualizaciones de terceros | sigue el ciclo del plugin |

Se elige **A**. El argumento decisivo no es solo el presupuesto: es que la aplicación es un sitio estático chico, con nombres de archivo ya hasheados por el build, y eso hace que una estrategia en tiempo de ejecución sea suficiente. La lista de precarga de la opción B agrega valor cuando hay cientos de assets que conviene bajar de una sola vez; acá el shell entero pesa menos que una foto.

Si la opción B se quisiera igual, la tarea 12 incluye el paso de verificar la compatibilidad antes de adoptarla, en vez de asumirla.

## Arquitectura propuesta

| Archivo | Qué es | Se versiona |
|---|---|---|
| `frontend/public/manifest.webmanifest` | El manifiesto: nombre, íconos, colores, `start_url` y modo `standalone`. | sí |
| `frontend/public/sw.js` | El service worker, con su versión (hoy `4.0.0`) y sus estrategias de caché. El `install` precarga el armazón canónico `/` (el documento único, con las plantillas de todas las vistas adentro), `/offline` y los estáticos sin hash (`favicon.svg`, `manifest.webmanifest` e íconos). | sí |
| `frontend/public/icons/*.png` | Los íconos rasterizados del logo actual, incluida la variante enmascarable. | sí |
| `frontend/src/lib/shell/pwa.ts` | Registro del service worker, detección de actualización y de estado de red, con la lógica pura separada para poder probarla. | sí |
| `frontend/src/pages/offline.astro` | La pantalla que se muestra cuando una navegación falla sin caché disponible. | sí |
| `frontend/src/layouts/Layout.astro` | Los `meta` de aplicación y el registro del service worker. | sí |
| `frontend/src/lib/shell/theme-toggle.ts` | Suma el mantenimiento de `theme-color` al cambiar de tema. | sí |
| `frontend/src/styles/global.css` | `viewport-fit=cover` y las áreas seguras del armazón. | sí |

Todo lo que tiene que existir como archivo servido va en `public/`, así que Astro lo copia tal cual a `dist/` y no hay nada que configurar en `astro.config.mjs`.

## Estrategias de caché

| Pedido | Estrategia | Por qué |
|---|---|---|
| Navegación (HTML del mismo origen) | **caché primero** sobre una sola copia del armazón, en segundo plano de la navegación; si no hay copia, red primero con un tope de 3 segundos; si la red falla, `/offline` | un arranque en frío tampoco espera red: el armazón es el mismo para todas las rutas y guardarlo una vez alcanza (D6). Ver «Navegación: el armazón se sirve al instante» |
| Clave del armazón | una sola entrada, `SHELL_URL = "/"` | todas las rutas del panel devuelven el mismo HTML y la query la lee el script del cliente, así que se guarda una vez bajo la clave canónica y se sirve a cualquier ruta. Una pantalla que nadie visitó no queda sin armazón, y la caché no crece por variante (`/sales/detail?id=<uuid>`, `/sales?start_date=…`). `/offline` se guarda aparte, por su URL: es el respaldo, no el armazón. `cacheFirst` y `handleApi` conservan el match exacto, donde la URL sí distingue la respuesta |
| `/_astro/*` (JS y CSS) | caché primero | el nombre lleva el hash del contenido, así que una copia guardada no puede quedar vieja |
| `favicon.svg`, `icons/*`, `manifest.webmanifest` | caché primero | son estáticos y no cambian sin cambiar el build |
| `GET` a la API | red primero, con un tope de 2,5 segundos; si falla, la última respuesta guardada | el último dato conocido es mucha mejor pantalla que el estado de error. La copia se vacía entera con cada escritura exitosa: ver «Invalidación de la caché de la API» |
| `POST`, `PUT`, `PATCH`, `DELETE` | no se interceptan | registrar una venta no puede reintentarse solo ni duplicarse; el error ya lo muestra la pantalla |
| Respuestas con estado 400 o mayor | no se guardan nunca | cachear un 404 o un error de validación envenena la caché y el error queda pegado |

La marca de dato viejo se resuelve en el mismo service worker: cuando una respuesta sale de la caché, se reconstruye agregando un encabezado propio. `api.ts` lo lee y la pantalla muestra el aviso de que los datos son del último momento con red. Es una lógica pura, va en `lib/` y se prueba con las herramientas que ya hay.

### Invalidación de la caché de la API

Una escritura exitosa **vacía la caché de la API entera**, y esa es la única forma en que se invalida: la marca de dato viejo sigue funcionando igual —el service worker sigue poniendo `X-ShopMar-Cached-At` cuando sirve de su caché— pero después de un `POST`, `PATCH` o `DELETE` exitoso ya no queda copia que pueda tapar lo escrito.

Sin esto la caché de la API se quedaba pegada a la lista previa a la escritura: `apiFetch` vaciaba su caché en memoria (`clearCache()`), pero el service worker seguía guardando la respuesta HTTP completa y la servía cuando la red tardaba más de `API_TIMEOUT` (2,5 s) o fallaba. El síntoma medido (S1) fue ése: una venta recién registrada no aparecía en la tabla porque el listado que llegaba era la copia anterior al alta.

El contrato entre las dos capas es un mensaje:

| Quién | Qué hace |
|---|---|
| `src/lib/core/api.ts` | después de una escritura exitosa, junto a `clearCache()`, manda `{ type: "API_CACHE_CLEAR" }` al worker que controla la página (`navigator.serviceWorker.controller.postMessage`). Con guardas: en SSR no hay `navigator`, y sin service worker registrado o sin worker controlando la página no hay a quién avisarle. Un fallo de escritura no lo manda |
| `public/sw.js` | al recibir `API_CACHE_CLEAR` borra la caché de la API completa (`caches.delete(API_CACHE)`) dentro de un `waitUntil` |

Se borra la caché **completa** y no la entrada de la ruta escrita porque un alta invalida más de lo que escribe: los listados, los KPIs del período y el resumen del dashboard. Y no alcanza con el borrado por `VERSION` del `activate`, que pasa una vez por despliegue: la escritura ocurre muchas veces por sesión.

El handler tiene que ser de la versión nueva del worker, así que este arreglo se ve recién cuando el `4.0.0` controla la pestaña; mientras el worker anterior responda, su `handleApi` sigue sirviendo copias previas a la escritura.

### Navegación: el armazón se sirve al instante (D6)

La navegación es **caché primero sobre el armazón, con revalidación detrás**: si hay una copia del documento, se responde **ya** —sin esperar la red— y en segundo plano se pide el mismo documento con `event.waitUntil(fetch(…))`; si esa respuesta es `ok`, reemplaza la copia. Si no hay copia (primer arranque de esa versión del worker), la navegación es red primero con el tope de siempre (`NAV_TIMEOUT`, 3 s) y guarda lo que llegue; si la red falla, `/offline`.

**Por qué cambió.** Hasta T7 la navegación era red primero, y eso se pagaba en cada arranque en frío —abrir el panel desde el ícono, o llegar desde otro documento— con un ida y vuelta de HTML antes de pintar. Es exactamente el delay que reportó la dueña (S1): con la app instalada, tocar una tab parecía instantáneo sólo cuando el documento ya estaba montado, y abrir el panel volvía a esperar. Ahora el documento se sirve del caché y la navegación deja de depender de la red.

**Una sola copia, bajo la clave canónica `/`.** Todas las rutas del panel devuelven el mismo HTML (D1, D2) y la query la lee el script del cliente, así que el armazón se guarda **una vez** bajo `/` y se sirve a cualquier ruta del panel —incluida `/sales/detail?id=<uuid>`, que antes necesitaba su propio precache (D-017)—. Con eso una pantalla que nadie visitó tampoco queda sin armazón, y la caché deja de crecer por variante. `/offline` se guarda aparte, por su URL: si se sirviera del armazón canónico, el respaldo no existiría.

**Sólo las rutas del panel.** El armazón se sirve para las nueve rutas del panel, que están listadas en `PANEL_ROUTES` dentro de `sw.js` (la misma lista de `lib/app/router.ts`: el worker no comparte módulos con la app, así que se repite y una ruta nueva se suma en los dos lados). Cualquier otra dirección conserva su propio documento y va a la red como antes: `/offline` es el respaldo, `/summary` su redirección, y un marcador viejo como `/sales/<id>` sigue mostrando la página 404 que explica la mudanza a `/sales/detail?id=<id>` (D-017). Servirle el armazón a todo convertiría un enlace roto en una pantalla vacía, que es peor que un 404 que dice qué pasó.

**Por qué no vuelve el defecto de S52.** El problema de la navegación caché primero original era el refresco sin garantías: si se perdía, el HTML viejo quedaba guardado para siempre. Acá el refresco tiene dos guardas. Primero, corre **en todas** las navegaciones servidas de la caché, no sólo cuando a la pestaña le sobra tiempo; `waitUntil` extiende la vida del evento para que el pedido no se corte al terminar la navegación. Segundo, pide con `cache: "no-store"`, así que el caché HTTP del navegador no puede devolver el HTML de antes y dejarlo guardado otra vez. El síntoma de S52 —`Ctrl+Shift+R` mostraba la versión nueva y la recarga normal volvía a la anterior— no puede repetirse: la copia que se sirve es la última que la red confirmó, y se reemplaza sola.

Un matiz deliberado: si la red contesta con un estado de error (por ejemplo un `500` del servidor de estáticos) esa respuesta se devuelve tal cual cuando no hay copia, **no** se guarda y no sustituye la copia vieja. Disfrazar un error del servidor de una página cacheada esconde el problema y confunde el diagnóstico.

El tope de 3 segundos quedó sólo en el camino sin copia. En el camino normal no hay espera que topear: la respuesta ya está en el disco, y el pedido de red corre por detrás.

### Versionado de caché

**Cualquier cambio en `frontend/public/sw.js` es una purga de caché.** El navegador compara el archivo del service worker byte a byte: si cambia una coma, hay instalación nueva. Esa instalación nueva abre la caché `shopmar-shell-<VERSION>` y su `activate` borra toda caché cuyo nombre no sea el de la versión actual, o sea las `shopmar-shell-*` y `shopmar-api-*` anteriores.

De ahí la regla operativa: **cada despliegue que toca `sw.js` sube `VERSION`**. Cambiar el archivo sin subir la versión instala un worker nuevo que reutiliza el nombre de caché viejo y por lo tanto conserva lo guardado, que es el defecto que este documento documenta. La versión actual es **`5.0.0`**: el salto desde `3.1.0` fue el que purgó las cachés contaminadas por la navegación caché primero, el de `3.2.0` a `3.3.0` trajo el handler `API_CACHE_CLEAR` que vacía la caché de la API después de cada escritura exitosa (S1), el de `3.3.0` a `4.0.0` es el cambio de estrategia de navegación (D6): el armazón se guarda bajo la clave canónica `/` y se sirve al instante. El salto de major es deliberado acá: las cachés `3.x` tienen el armazón guardado **por URL exacta** (`/sales`, `/packages`, …), así que reutilizar el nombre dejaría entradas que la estrategia nueva nunca lee y la primera navegación de cada ruta volvería a pedir red.

El paso a `5.0.0` agrega `skipWaiting()` en `install`: el worker nuevo se activa solo. Antes esperaba a que la persona aceptara el aviso, y en una PWA instalada en el teléfono ese toque no llega nunca, así que el panel se quedaba con el build anterior indefinidamente —con su armazón cacheado y sus chunks de `/_astro/` cacheados— y ningún arreglo desplegado se veía. Lo que protegía el aviso era no cortarle una venta a medio cargar con una recarga, y eso sigue protegido por `pwa.ts`: `controllerchange` sólo recarga si la persona aceptó, así que el panel abierto **no** se recarga solo. La venta a medio cargar tampoco se pierde: el borrador vive en `localStorage` (`sale-draft.ts`).

Importante: la estrategia nueva **no** se aplica a una pestaña que todavía controla el worker anterior. El código que responde es el del worker instalado, así que mientras el `3.3.0` siga controlando la pestaña la navegación sigue esperando la red, con o sin purga. El arreglo se ve recién cuando el `4.0.0` toma el control (ver la sección siguiente).

### Consecuencia operativa de este arreglo

Los usuarios que ya tienen el panel instalado o abierto quedan con el worker `3.3.0` controlando la pestaña hasta que el navegador instale el nuevo. A partir de `5.0.0` eso **no depende de que la persona acepte nada**: el `sw.js` nuevo dispara `updatefound`, el `install` precarga el armazón y llama a `skipWaiting()`, el worker se activa, purga las cachés viejas y `clients.claim()` toma el control. La recarga por `controllerchange` sigue esperando una aceptación explícita, así que la pestaña abierta no se recarga debajo de nadie: lo que cambia es que la navegación siguiente —y todo `fetch` posterior— ya lo responde el worker nuevo.

El aviso «Hay una versión nueva del panel disponible» con el botón «Actualizar y recargar» sigue en el armazón para el caso en que la persona quiera recargar ya, pero deja de ser el camino obligatorio: `registration.waiting` normalmente queda vacío porque el worker nuevo salta a `activating`. Antes de `5.0.0` había que aceptar el aviso o cerrar todas las pestañas del panel; hasta que eso pasaba, el síntoma sobrevivía al despliegue porque el worker viejo seguía respondiendo con su estrategia vieja.

### Las dos capas de caché

El aviso de datos viejos cubre ahora **dos cachés distintas**, y conviene no confundirlas:

| Capa | Dónde vive | Cuánto dura | Qué guarda |
|------|------------|-------------|------------|
| Service worker (`public/sw.js`) | `CacheStorage` del navegador | entre sesiones, hasta que el navegador la desaloje, cambie `VERSION` o una escritura exitosa la vacíe | respuestas HTTP completas, incluida la navegación y los `GET` a la API |
| Memoria de la pestaña (`src/lib/core/cache.ts`) | el heap de la pestaña | hasta recargar o cerrar la pestaña | el cuerpo ya parseado de los `GET`, con su `at` y la marca de cuándo se guardó |

El service worker marca `X-ShopMar-Cached-At` cuando sirve de su caché; `api.ts` guarda ese valor junto al dato y lo vuelve a publicar en `shopmar:stale-data` cuando sirve de la caché en memoria. Así el aviso de `pwa.ts` dice la hora correcta sin importar cuál de las dos capas respondió. Recargar siempre vacía la capa de memoria y deja la del service worker como estaba.

La navegación lee **una sola** entrada de la caché del shell, la clave canónica `/`, y la sirve a cualquier ruta del panel: no hay búsqueda por variante ni `ignoreSearch` en el camino de navegación, porque el armazón es el mismo documento para todas las rutas. La estrategia sigue sin guardar un 404, y su respaldo sigue siendo `/offline`.

## Instalación y actualización

**Android y escritorio** exponen un evento de instalación: se muestra un botón que lo dispara. **iOS no expone ninguno**: la única vía es Compartir y después "Añadir a pantalla de inicio". Para iOS la interfaz tiene que enseñar el gesto con un texto breve, y para que el ícono y el nombre salgan bien hacen falta `apple-touch-icon` y los `meta` de `apple-mobile-web-app-*`.

**El botón se ofrece en dos lugares, y el segundo es el que hace falta de verdad: `/login`.** El diseño original lo ponía sólo en la barra lateral, que vive detrás de la sesión: a la pantalla donde alguien todavía no entró —la del empleado nuevo, la del teléfono recién configurado— no llegaba nunca. Ahora el bloque `data-install-block` está también en el documento de `/login`, y esa pantalla declara el `manifest`, el `apple-touch-icon` y los `meta` de iOS, más el registro del service worker (`initPwa`). Sin esos tres el navegador no considera la página instalable y `beforeinstallprompt` no llega, así que el botón no aparecería. El mecanismo es **uno solo** (`lib/shell/install-prompt.ts`, que recorre todos los bloques del documento) y el bloque del login lleva sus propias clases porque la hoja de esa pantalla es otra: el contrato entre el marcado y el módulo son los atributos `data-install-*`, y `lib/shell/login-install.test.ts` fija que el documento no pierda ninguna de las dos mitades. El botón del armazón se queda: cada uno aparece donde la persona está.

**El service worker se registra desde el login, no sólo desde el panel.** La instalación lo exige y no cambia qué se guarda: el `install` sigue precargando el armazón canónico `/` y la purga sigue dependiendo de la `VERSION` de `sw.js`, que este cambio no toca.

**Las actualizaciones no deben ser silenciosas.** El service worker nuevo queda esperando y la pantalla avisa que hay una versión nueva, con un botón para recargar. Una venta a medio cargar no puede perderse porque un despliegue decidió recargar la página.

El `theme-color` merece una línea aparte: el tema de este panel lo elige el usuario y se guarda en `localStorage`, así que puede no coincidir con la preferencia del sistema. Por eso no alcanza con dos `meta` con `media="(prefers-color-scheme: …)"`: el color tiene que actualizarlo el mismo módulo que ya cambia `data-theme`.

## Las dos fases

| Fase | Tarea | Qué entrega | Depende de |
|---|---|---|---|
| 1 | [`12-pwa-instalable.md`](../../tasks/frontend/12-pwa-instalable.md) | El panel se instala y se abre como aplicación, con ícono, nombre y colores propios. Sin caché de datos todavía. | el origen HTTPS |
| 2 | [`13-pwa-offline.md`](../../tasks/frontend/13-pwa-offline.md) | El service worker, las estrategias de caché, la pantalla sin conexión y el aviso de versión nueva. | la fase 1 |

La fase 1 se puede verificar entera sin service worker, y la fase 2 sin ella no tiene dónde registrarse. Partirlas permite revisar cada una por separado y deja la primera utilizable aunque la segunda se postergue.

## Fuera de alcance

| Lo que no se hace | Por qué |
|---|---|
| Registrar ventas sin conexión y sincronizar después | Es la parte tentadora y es la más peligrosa: exige una cola local, un identificador de idempotencia en la API y una regla escrita para los conflictos. Sin esa regla, el mismo pedido puede quedar cargado dos veces o perderse, y eso es peor que un error visible. Merece su propia propuesta. |
| Notificaciones push | No hay nada que notificar que el panel no muestre al abrirse, y agrega un servidor de push y claves. |
| Sincronización en segundo plano (`Background Sync`) | Es la mitad de la tarea anterior, y su utilidad depende de que exista la cola de escritura. |
| Una aplicación nativa o un envoltorio tipo Capacitor | El objetivo es no instalar nada desde una tienda ni mantener un segundo proyecto. |
| Servir el panel con HTTPS | Es infraestructura, no frontend: va en el proxy del host que ya sirve los archivos estáticos. Queda como prerrequisito de la fase 1, no como tarea de código. |
| Cambiar la compilación estática por render en servidor | La decisión D-005 sigue en pie. Una PWA no la necesita. |

## Riesgos y límites conocidos

| Riesgo | Detalle y mitigación |
|---|---|
| El panel por HTTPS con la API por HTTP | El navegador bloquea los pedidos por contenido mixto. Hay que servir la API por HTTPS o por el mismo origen que el panel. Es el bloqueante más probable y hay que resolverlo antes de la fase 1. |
| Servido por IP en la red del local | Sin HTTPS el registro del service worker falla y la aplicación no se instala. La excepción de `http://localhost` no aplica a una IP. |
| El navegador puede vaciar la caché | El almacenamiento no es infinito y el navegador puede descartar la caché de un sitio poco usado. La aplicación tiene que seguir funcionando sin ella, y por eso cada estrategia tiene un camino a la red. |
| Un despliegue llegaba recién cuando se aceptaba el aviso | Era el comportamiento hasta `4.0.0`: el worker nuevo esperaba (sin `skipWaiting` automático) a que la persona aceptara, y un panel instalado que nunca aceptaba seguía con el worker anterior controlando la pestaña. Desde `5.0.0` el `install` llama a `skipWaiting()` y el worker se activa solo; lo que sigue esperando aceptación es la **recarga**, no la activación. |
| Imprimir la factura desde la aplicación instalada | En iOS la impresión desde una aplicación instalada es más limitada que desde Safari. Conviene probarlo antes de retirar el acceso por navegador. |
| El ícono enmascarable | Android recorta el ícono a una forma variable. Si el dibujo no deja margen, se corta la camiseta. Por eso la variante enmascarable se genera con el dibujo reducido y fondo lleno. |

## Cómo se comprueba que la propuesta se cumplió

Cada fase tiene sus comandos en su propio archivo. Lo que vale para las dos:

1. `pnpm build` termina y los archivos nuevos (`manifest.webmanifest`, `sw.js`, `icons/`) aparecen en `dist/`.
2. El HTML construido de cada ruta referencia el manifiesto, el `theme-color` y el `apple-touch-icon`, y el viewport incluye `viewport-fit=cover`.
3. En el navegador, la pestaña Aplicación de las herramientas de desarrollo no reporta errores de manifiesto ni de service worker.
4. `pnpm test` sigue verde, con las pruebas nuevas de la lógica de `lib/shell/pwa.ts`.
5. El humo con el service worker **activo** (`serviceWorkers: "allow"`, no bloqueado: bloquearlo mide otra cosa, porque `page.route` no intercepta lo que pide el worker): cargar `/`, esperar a que el worker controle la página, navegar entre tabs sin `load` de documento, y con la red cortada abrir en frío una ruta que nadie visitó —el armazón sale de la caché y monta la vista, nunca `/offline`—. Lo complementa el caso contrario: sin copia del armazón, la navegación sí cae en `/offline`.
6. La prueba que de verdad importa y no se puede automatizar acá: instalar el panel en el teléfono del local, abrirlo desde el ícono, y activar el modo avión para confirmar que la aplicación abre y muestra el último dato.
