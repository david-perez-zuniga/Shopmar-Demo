# Pantallas

Nueve pantallas. Esta es la referencia de campo por campo: qué se pide a la API, qué se pinta, y qué hace la vista de cada una. Ocho piden datos o escriben, y comparten la misma estructura de tres estados (esqueleto, vacío, error), el mismo sistema de diseño y el mismo `api.ts`; la novena, `/new` (§8), no pide ni escribe: es el selector que abre el botón de acción de la barra inferior.

Las nueve son **vistas de la SPA**: el documento es uno solo (`components/App.astro`) y el router monta la plantilla de la ruta, así que cambiar de pantalla no pide red. El markup de cada una vive en `components/views/<Vista>View.astro` y su comportamiento en `lib/views/<vista>.ts` con `mount<X>(root)`; la página de `pages/` que corresponde a la ruta sólo sirve el armazón. `/new` se sumó en T7: era la última pantalla que todavía cargaba un documento propio.

**`/login` no es una de las nueve.** Es un documento propio fuera del armazón —el panel todavía no se abrió, así que no hay navegación que mostrar— y tiene su propia spec en `09-auth.md`: la vista, el guard del router, la caché del `me`, el logout y qué ve cada rol (D-024). Lo mismo vale para `/offline` y `/404`, que ya vivían fuera del router.

## Mapa de navegación

```
[ / ]  Ventas  Paquetes  Gastos
  │       │        │        │
  │       │        │        └── /expenses ──> /expenses/new
  │       │        └─────────── /packages ──> /packages/new
  │       └──────────────────── /sales ─────> /sales/new?type=live
  │                                │          /sales/new?type=whatsapp
  └────────────────────────────────┴────────── /sales/detail?id=<uuid> — detalle e impresión de factura
```

La barra lateral tiene cinco enlaces, uno por sección. Ninguna pantalla tiene enlace a sí misma en la barra: el enlace activo lleva `aria-current="page"` y no navega.

**El botón `+` de la barra inferior abre `/new`**, que no es una sección y por eso no aparece en la barra lateral, la barra superior ni el cajón: es la única entrada a esa pantalla.

```
/new ──> Registrar venta ──> Venta por Live       → /sales/new?type=live
                         └─> Venta por WhatsApp  → /sales/new?type=whatsapp
     └─> Registrar gasto ───────────────────────→ /expenses/new
```

### El armazón de navegación

Los cinco destinos —Resumen `/`, Ventas `/sales`, Clientes `/customers`, Paquetes `/packages`, Gastos `/expenses`— se ofrecen en cuatro superficies, y todas salen del mismo arreglo `links` de `Nav.astro`, así que no pueden nombrar lugares distintos ni mostrar iconos distintos:

| Superficie | Cuándo se ve | Para qué |
|------------|--------------|----------|
| Barra lateral fija | ≥ 1024px | La navegación principal de escritorio; deja el contenido a la derecha y no se repite en la barra superior |
| Barra superior con los cuatro enlaces | 768–1023px | La navegación horizontal en tablet, sin barra lateral |
| Cajón lateral | < 768px | El menú de móvil; la barra superior solo lleva el botón de menú y la marca |
| **Barra inferior** | **< 768px** | **Cuatro destinos a un toque —Resumen, Ventas, Paquetes y Gastos—, más el botón de acción; se suma al cajón, no lo reemplaza** |

La barra inferior existe porque en el teléfono el cajón obliga a abrir un menú para cambiar de sección, y el panel se usa mucho desde el teléfono. Pone **cuatro destinos** siempre visibles, con su icono y su etiqueta: Resumen, Ventas, Paquetes y Gastos. **Clientes no viaja en la barra inferior** (S17): se consulta desde la lateral, la superior y el cajón, y el pulgar no necesita ese destino. El filtro es `bottomNavLinks()` de `nav-active.ts` sobre el mismo arreglo `links` de `Nav.astro`, así que etiquetas, iconos y regla de activo no pueden divergir entre superficies. Es **aditiva**: la barra lateral, la barra superior y el cajón quedan exactamente como estaban. Vive en el armazón (`BottomNav.astro`, montado por `Nav.astro`), fuera de `[data-app-root]`, así que el router nunca la toca: ningún estado suyo se pierde al cambiar de vista y su activo lo repinta `markActiveNav` con la misma llamada que marca los otros tres juegos (D-023).

Además de los cuatro destinos, la barra inferior lleva **un botón de acción** (`+`) entre Ventas y Paquetes. No es un quinto destino: no recibe `links`, no lleva la clase `bottom-nav-link` y no entra en `LINK_SETS`, así que nunca se marca activo. Solo abre `/new` (§8).

---

## 1. `/` — Dashboard

**Archivo** `src/components/views/SummaryView.astro` (markup y hoja `summary.css`) · `src/lib/views/summary.ts` (`mountSummary`) · la ruta `src/pages/index.astro` sirve el armazón · **Componente de layout** `wide` · **Datos** `GET /api/v1/dashboard/summary`

> **La ruta de esta pantalla cambió, y hubo una contradicción.** Este módulo
> decía `/`, y `tasks/frontend/01-fundamentos-del-panel.md` criterio 4 decía que
> `/` **no** debe ser el dashboard sino una redirección a `/sales`, con un motivo:
> "`/sales` es la pantalla que se abre veinte veces por tarde". Las dos specs
> estaban justificadas y se contradecían, y durante un tiempo no hubo ninguna de
> las dos: `index.astro` era la redirección y el enlace del nav apuntaba a
> `/summary`, que no existía — un 404.
>
> **Se resolvió a favor de este módulo.** La implementación dejó el dashboard en
> `/` (`index.astro` con título "Resumen", el nav apuntando a `/` y `start_url`
> `/` en `tasks/frontend/12-pwa-instalable.md`), y `/summary` quedó como stub de
> compatibilidad que redirige a `/`. El criterio 4 de `01-fundamentos` describía
> el estado intermedio — la redirección existió mientras no había dashboard — y la
> tarea quedó anotada. La contradicción no era un error de una de las dos specs:
> era que nadie miró las dos juntas.

### Contenido

Seis tarjetas en una rejilla de tres por dos en escritorio (dos columnas desde 560px, una en
móvil). El `DateRangeFilter` vive en el **encabezado, arriba a la derecha**, y las tarjetas quedan inmediatamente debajo (S37): un `<select>` con **Hoy** (valor por defecto), **Últimos 7 días** o **Personalizado** (S34, S36). El rango se recuerda por ruta durante la sesión (S58): ir a ventas a mirar algo y volver al resumen no devuelve el período a «Hoy». La lista de tarjetas vive en
`SUMMARY_FIELDS` de `frontend/src/lib/summary/summary.ts` —id, rótulo, definición, ícono, tono y la
función que lee la cifra— y la pantalla solo la recorre: rótulo, definición y número no pueden
desincronizarse.

| Tarjeta | Dato | `hint` (texto de apoyo) | `tone` | Ícono |
|---------|------|------------------------|--------|-------|
| Vendido | `total_revenue` con `formatMoney` | "Ventas del período por fecha de venta, incluidas las pendientes y sin las canceladas" | `default` | `trending-up` |
| Ventas | `sales_count` | "Ventas del período por fecha de venta, sin contar las canceladas" | `default` | `receipt` |
| Gastos | `total_expenses` con `formatMoney` | "Gastos registrados en el período" | `default` | `wallet` |
| Cobrado | `collected_revenue` con `formatMoney` | "Caja cobrada en el período por fecha de pago: una venta a crédito de enero cobrada en marzo cuenta en marzo" | `success` | `trending-up` |
| Por cobrar | `outstanding_receivables` con `formatMoney` | "Saldo pendiente de las ventas a crédito del período, por fecha de venta" | `warning` | `receipt` |
| Vencido | `overdue_receivables` con `formatMoney` | "La parte de «Por cobrar» cuya fecha de vencimiento ya pasó" | `danger` | `receipt` |

Las seis cifras separan **devengado** de **caja** (D-022): `total_revenue` se imputa a `sale_date` y
`collected_revenue` a `paid_at`, así que una venta a crédito de enero cobrada en marzo suma en el
vendido de enero y en la caja de marzo. `outstanding_receivables` es el saldo de las ventas a crédito
del rango y `overdue_receivables` es su subconjunto vencido: nunca es mayor que el total por cobrar.

Los `hint` largos son deliberados: son la traducción en lenguaje llano de las decisiones D-008 y
D-022. La dueña no tiene que saber qué significa "agregación con filtro de estado" para entender que
una venta cancelada no suma, ni que el cobrado de marzo incluye lo que se fiado en enero. Las
pendientes sí cuentan en el vendido, y el texto lo dice: si no, el próximo pedido va a ser excluir
también las pendientes, y la explicación de por qué no se excluyen está en `docs/07-decisiones.md`.

El filtro de ventas del período vive también en `frontend/src/lib/sales/sales-kpi.ts`, que calcula
los totales de la pantalla de ventas. El `hint` describe la regla que implementan los dos lados; si
uno se actualiza y el otro no, este texto pasa a mentir sin que nada falle.

### Script

```
1. leer start_date y end_date de Astro.url.searchParams
2. construir la query con URLSearchParams, omitiendo vacíos
3. apiFetch(`/dashboard/summary${query}`)
4. con la respuesta: pintar las seis cifras —`formatMoney` para los importes, el número para el
   conteo— y ocultar el estado de carga
4b. si hay un rango en la URL, mostrar la etiqueta "desde DD/MM/AAAA · hasta DD/MM/AAAA"
5. si el rango no tiene datos, las tarjetas quedan visibles en `C$ 0.00` / `0` y debajo aparece el
   texto "Sin datos en el rango seleccionado": esconder la rejilla dejaría la pantalla en blanco sin
   decir por qué
6. si apiFetch lanza: mostrar el sobre de error con "Reintentar"
```

Las seis entradas de la tabla se aplican con `transition-delay` de 0ms, 60ms, 120ms, 180ms, 240ms y
300ms. La staggering es lo que hace que el dashboard se sienta construido en lugar de aparecer de
golpe.

### Lo que esta pantalla no tiene

| No tiene | Razón |
|----------|-------|
| Gráfico de ventas por día | Exige una librería o muchas líneas de SVG, y la dueña necesita el número |
| Selector de estado | D-008: el filtro por estado de las agregaciones es una regla fija del sistema, no un control para la dueña. Filtrar el resumen por estado agregaría una segunda noción de verdad junto a la de los números, y la dueña ya tiene el filtro por estado en `/sales` para inspeccionar |
| Enlace a "ver ventas del período" | El filtro por fechas ya existe en `/sales`; duplicarlo aquí sería un segundo formulario con la misma función |

---

## 2. `/sales` — Listado de ventas

**Archivo** `src/components/views/SalesView.astro` (markup y hoja `sales.css`) · `src/lib/views/sales-list.ts` (`mountSalesList`) · la ruta `src/pages/sales/index.astro` sirve el armazón · **Componente de layout** `wide` · **Datos** `GET /api/v1/sales` y `GET /api/v1/sales/:id`

### Contenido

- **Barra de filtros** (S40): el `DateRangeFilter` incrustado (`variant="fields"`) queda siempre a la vista —**Hoy**, **Últimos 7 días** o **Personalizado** con sus dos fechas (S34)— y a su lado, al otro extremo de la barra, el botón **«Filtros»** (`type="button"`, icono de embudo, `aria-expanded` y `aria-controls` apuntando al panel). El período no se esconde porque es el **filtro de contexto**: cambia qué período se mira, mientras que los demás campos refinan ese período. En móvil el período toma su línea y el botón baja debajo a ancho completo.
- El botón lleva el **número de filtros activos** en un chip: es la única señal de que hay algo aplicado cuando el panel está cerrado. Cuenta cada campo con valor —canal, estado, condición, vencidas— y el rango cuando no es el de hoy, con la misma regla que el enlace «Limpiar» (S39), así que el chip y el enlace nunca se contradicen. Con cero filtros el chip no se dibuja. El número se recalcula en cada rehidratación, igual que el resto de los controles (y en paquetes, también en cada navegación interna).
- **Panel colapsable** `<div data-filters-panel>`, cerrado en una visita nueva: guarda los filtros secundarios —`<select>` de canal (`type`), de estado (`status`) y de condición de pago (`payment_terms`: Todas / Contado / Crédito), más un checkbox "Vencidas" (`overdue=true`), que escribe un input oculto para que el filtro viaje por la misma maquinaria de URL que los demás (un checkbox desmarcado mandaría `overdue=on`)— y el enlace «Limpiar». Abre y cierra con una transición corta de alto y opacidad que `prefers-reduced-motion` apaga, y el foco se queda en el botón. Los campos conservan su alineación y sus separaciones de antes: el panel repite el flex que tenía la fila.
- El estado abierto/cerrado se recuerda en `sessionStorage` **por ruta** (`shopmar.filters.open:/sales`): el panel se rearma cada vez que la vista se monta —volver desde otra pantalla, recargar con F5— y volver a abrirlo en cada visita sería peor que tenerlo cerrado. Filtrar dentro de la pantalla ya no lo cierra, porque el formulario no se reconstruye (D-013). Un almacenamiento inválido, bloqueado o ausente degrada a **colapsado**, y el botón sigue funcionando aunque no pueda recordar nada.
- **No hay botón «Filtrar»** (S38): cualquier cambio aplica el filtro en el acto, también dentro del panel. El enlace «Limpiar» aparece únicamente cuando hay un filtro activo —los demás campos con valor, o un rango distinto del de hoy— (S39).
- **La consulta se recuerda y volver no la pierde (S58).** El rango, los filtros de refinación y la página *son* la URL de la pantalla, y el defecto estaba en el regreso: «Volver» del detalle, «Cancelar» del alta y los enlaces del armazón apuntan a la ruta pelada, que la pantalla lee como «Hoy» (S36). Elegir «Últimos 7 días», abrir una venta y volver mostraba otra vez el día de hoy. Ahora cada listado guarda en `sessionStorage`, **por ruta**, la última consulta que se miró (`shopmar.view.state:/sales`) y el router la recupera al entrar sin query, escribiéndola en la barra de direcciones para que la vista lea lo mismo que la persona ve. `frontend/src/lib/app/view-state.ts` es el único dueño de esa regla, con tres decisiones fijas: **la URL manda** sobre el recuerdo (una query propia nunca se pisa); **atrás y adelante mandan** sobre el recuerdo, porque reescribir la entrada del historial haría que el botón atrás no cambie lo que se ve; y sólo se recuerdan los parámetros de consulta —`start_date`, `end_date`, `type`, `status`, `shipment_method`, `payment_terms`, `overdue`, `page`, `q`—, nunca el `id` de un detalle, un `print` ni el `customer` del diálogo de clientes: reabrir eso desde el recuerdo no es volver a donde estabas. **«Limpiar» es el único que olvida** (S39), que es lo que hace que el botón siga significando lo mismo; y un almacenamiento bloqueado degrada a *no recordar*, nunca a romper la pantalla. La misma regla vale para los otros tres listados y para el resumen (todos usan el mismo filtro de fechas).
- **Filtrar no recarga el documento** (D-013). Cambiar el período o cualquier campo del panel mueve la URL con el router (`pushQuery`) y la vista vuelve a pedir **sólo la lista**, como paquetes y gastos: antes acá había una recarga completa del documento, así que elegir «Últimos 7 días» reconstruía HTML, scripts y estilos —y perdía el scroll y el panel abierto— para cambiar diez filas. El orden es la regla: primero se mueve la URL, después se rehidratan los controles y se pide la lista, así lo que se lee es el filtro nuevo; y como el `<form>` sigue siendo el mismo, el envío conserva canal, estado, condición y vencidas (S34, S35). Cargar a mano o abrir un enlace compartido funciona igual: la URL es el estado. La página visible se recorta sola si el filtro nuevo tiene menos páginas que la que se estaba mirando (`replaceState`, sin sumar un paso al historial).
- Botón primario "Nueva venta" (a `/sales/new?type=live`) y secundario "Venta por WhatsApp" (a `/sales/new?type=whatsapp`).
- Tabla densa con las columnas del listado: **Fecha**, **Cliente**, **Mercadería**, **Canal**, **Estado**, **Cobro**, **Artículos**, **Total**, **Acciones**. Muestra **diez filas por página, siempre** (S41): el selector «Ver» se retiró y un `per_page` viejo en la URL se ignora.
- El `<select>` de **Estado** nunca queda más angosto que su etiqueta más larga (`min-width: max-content` en `.status-wrap`): la tabla puede repartirse el ancho como quiera, pero el estado no se recorta a «Co» ni en un teléfono ni en el ancho intermedio donde la tabla se aprieta. El tope visual sigue siendo el de siempre —`max-width: 130px`—, y cuando el listado no entra el desplazamiento horizontal de `.table-wrap` es el que ya existía.
- Columna **Cobro** (D-022): en contado un guion —un pendiente de contado no es una deuda—; en crédito con saldo, el saldo y una segunda línea con "Vence <dd/mm/aaaa>" o "Vencida"; en crédito saldado, "Pagada".
- **Estado vacío (S56):** la misma fila que se clona dentro del tbody en paquetes —`<template data-state-template>` con `[data-state-text]` y `[data-state-action]`—, dentro de la tabla, con su encabezado y su pie visibles, el bloque `.empty-state` compartido y la acción **"Registrar la primera venta"** a `/sales/new?type=live` con la píldora `state-action` (S55). El `colspan` es 9, que es el número de columnas de la tabla; cargando, vacío y error son la misma fila y el error pone **"Reintentar"** en el hueco de la acción, con la misma clase.
- En una fila a crédito con saldo, la celda de acciones suma **"Registrar pago"**, que abre el modal de cobro (saldo pendiente, monto, fecha, método, banco condicional y nota).

La columna del precio (`cost`) se quitó por pedido de la dueña: repetía el mismo número que **Total** en toda venta sin artículos adicionales, así que no agregaba información, y su rótulo había derivado en un segundo "Total" que confundía. El listado queda con una sola columna de dinero.

### Script

```
1. leer los cuatro filtros de la URL (start_date, end_date, type, status)
2. apiFetch(`/sales${query}`) → respuesta { sales: [...] }
3. por cada fila, construir un <tr> con celdas de texto y dos elementos speciales:
   - la celda Estado es un <select> con los tres valores
   - la celda Acciones tiene dos botones: cambiar estado e imprimir
4. bindear el change de cada <select> de estado:
   - pedir confirmación con confirm()
   - si se cancela, restaurar el valor anterior del select
   - si se confirma, apiFetch(..., { method: "PATCH", body: { status } })
   - con 200: reemplazar la celda por la insignia del color nuevo
   - con 404: mostrar el error y recargar la tabla
5. bindear el click de cada botón de imprimir:
   - el botón es un enlace a `/sales/detail?id=${id}&print=1` (la ruta de detalle, D-017)
   - la página de detalle pide la venta al cliente, llena el InvoicePrint y, con `print=1`, llama a `window.print()` sola cuando la venta está pintada
6. vacíos: clonar `[data-state-template]` en el tbody con el mensaje "No hay ventas en el
   rango seleccionado" y la acción "Registrar la primera venta" a /sales/new?type=live,
   dejando la tabla y su pie visibles
7. "Registrar pago" (sólo crédito con saldo): abrir el modal con el saldo como tope,
   validar el monto sin parseFloat, enviar POST /sales/:id/payments y, con la
   respuesta, refrescar la fila (saldo, "Pagada", botón) y avisar por el toast
   existente. El modal es el mismo overlay del cambio de estado, con su foco,
   Escape y trampa de Tab.
```

La columna Estado es un `<select>` en cada fila, no un botón de acción. Es la decisión de diseño que hace que "cambiar el estado" sea una operación de una sola acción, sin abrir un diálogo. **En una venta a crédito el selector no ofrece "Completada"**: el estado de cobro lo decide el libro de pagos, así que la opción vigente queda fija y deshabilitada y el único destino es "Cancelada" (D-022). El `confirm()` es la red de seguridad: una cancelación se hace con dos clics.

**En una venta `cancelled` no hay `<select>`.** La celda muestra la insignia "Cancelada" y una nota que explica que el estado no se puede cambiar, y el `confirm()` ya no alcanza porque no hay nada que confirmar. Cancelar desde una venta viva deshabilita el selector en el acto, sin recargar la página.

El `confirm()` protege contra el clic de más, no contra el estado definitivo. Son dos cosas distintas: una se deshace con dos clics más, la otra no se deshace de ninguna manera, y por eso necesita una explicación visible y no un diálogo de confirmación.

### Factura imprimible

El botón de cada fila navega a la ruta de detalle `/sales/detail?id=<uuid>&print=1`:
la página es estática y el cliente pide `GET /api/v1/sales/:id`, llena el
`InvoicePrint` con los artículos adicionales y, cuando la URL trae `print=1`,
imprime sola una vez que la venta está pintada. El `@media print` de
`02-design.md` deja solo la factura en la impresión.

La barra del detalle (`.detail-toolbar`, con `no-print`) lleva "← Regresar" al
listado a la izquierda y el botón "Imprimir" a la derecha. El regreso siempre
queda a mano, y la impresión —la acción principal de esta pantalla— se va al
borde en vez de compartir fila con él. No hay una ruta
`/sales/invoice` (D-009): la impresión es un estado del detalle de la venta, no
una ruta propia de factura.

---

## 3. `/sales/new` — Formulario de venta

**Archivo** `src/components/views/SaleNewView.astro` (markup y hoja `sale-new.css`) · `src/lib/views/sale-new.ts` (`mountSaleNew`) · la ruta `src/pages/sales/new.astro` sirve el armazón · **Componente de layout** por defecto · **Datos** `GET /api/v1/customers?q=` al buscar en el modo «Cliente existente» o mientras se escribe el teléfono (búsqueda y aviso de teléfono repetido) · **Escritura** `POST /api/v1/sales/live` o `POST /api/v1/sales/whatsapp` · **Almacenamiento** `localStorage`, la clave `shopmar:sale-draft:<canal>:v1` (una por canal, con la versión de formato adentro)

### Contenido

El mismo archivo sirve los dos canales. El `type` de la URL decide qué se renderiza. El formulario se agrupa en **cuatro pasos colapsables por contexto**, no por implementación: La venta, Condición de pago, Cobro y Resumen (S24). Dentro de "La venta" hay **una sola lista**: **Mercadería**, los productos de la venta cargados uno tras otro (S44). El bloque **«Artículos adicionales»** (envío, accesorios u otros cargos aparte) **se retiró del formulario** (S42) y el bloque **«Más productos de mercadería»** se **fusionó con la mercadería principal** (S44), porque era la misma función repartida en dos lugares. La API sigue aceptando `additional_items`, pero desde esta pantalla sólo se cargan renglones de mercadería. El orden es la mejora: no se quitó ningún otro campo.

### Los cuatro pasos

| Nº | Paso | Lo que valida su «Siguiente» | Cómo arranca |
|----|------|------------------------------|--------------|
| 1 | **La venta** — «Quién compró, qué se llevó y a cuánto.» | con «Agregar cliente» encendido, el cliente según el modo —el nombre escrito con «Cliente nuevo» **o** un cliente del padrón con «Cliente existente»— y el teléfono si su checkbox está marcado (sólo en «Cliente nuevo»); con el bloque apagado no pide cliente (S63) y a crédito lo exige siempre, enciende el checkbox y no lo deja apagar. Además, la fecha y la **lista de productos**: el primero siempre con nombre y precio, y cada renglón extra también (un renglón extra vacío frena el paso) | **abierto**, y es el único: queda arriba, así que no hace falta desplazarse para encontrarlo |

**Los campos de dinero se sanean al escribir** (S51): el formulario es `novalidate`, así que el navegador dejaba tipear letras en el precio. Ahora cada campo de importe —los precios de los productos y el monto recibido— descarta lo que no puede formar un importe (letras, símbolos, más de un punto, más de dos decimales) y se pone **rojo con su mensaje** cuando lo que queda no cierra, sin esperar al envío. Un importe a medio escribir (`1250.`) no se marca: todavía no es un error.

**Arriba del botón «Siguiente» de «La venta»** se muestra el **total de los productos cargados**, con la misma cifra estimada que el resumen: es lo que la dueña confirma antes de avanzar, sin bajar al último paso (S46).
| 2 | **Condición de pago** — «Cuándo te paga: en el momento o después.» | con crédito, la fecha prometida (hoy o después); con contado, nada | cerrado y **bloqueado** hasta que «Siguiente» valide «La venta»; entonces se abre y queda «Rellenado» (S59) |
| 3 | **Cobro** — «Cómo se pagó esta venta.» / en crédito «No se cobra ahora: cada pago del libro guarda su propio método y banco.» (S57) | de contado: forma de pago y banco emisor con tarjeta, y el monto recibido sólo con «¿Cobraste ahora?» encendido; **con crédito no pide nada**: el paso está completo sin llenar | cerrado y **bloqueado** hasta que «Siguiente» valide «Condición de pago». Aunque con efectivo no tenga nada que pedir, «Rellenado» recién aparece con su propio «Siguiente» (S59) |
| 4 | **Resumen** — «Suma de lo cargado en pantalla…» | no tiene campos ni «Siguiente»: es el paso del envío | cerrado y **bloqueado** hasta que «Siguiente» valide «Cobro». En escritorio no es un paso: es la columna fija de la derecha (S60) |

Los títulos y las bajadas de los pasos 1 y 2 son textuales de la dueña (S26) y viven en `src/lib/sales/sale-form-steps.ts` junto al número de cada paso: el marcado los lee de ahí, así que la pantalla no puede contradecir lo que valida el botón.

**El encabezado de cada paso es un `<button>`** con `aria-expanded` y `aria-controls` sobre el cuerpo, no un div con `click`: el teclado y el lector de pantalla lo recorren como lo que es y el blanco del toque es el encabezado entero (`min-block-size: var(--touch-min)`). Muestra el número del paso, el título, la bajada y una **insignia de estado**: «Rellenado» con su marca cuando sus campos están bien y «Pendiente» cuando no. **El paso abierto no lleva insignia** —se ve abierto y su cuerpo está a la vista—, así que el estado nunca repite lo que la pantalla ya dice. El color nunca es el único portador: la insignia lo dice en palabras. Un toque en el encabezado abre o cierra ese paso —para volver a editar— **siempre que esté desbloqueado**: los que todavía no se alcanzaron no se abren y su insignia dice «Bloqueado» (S59). **Hay un solo paso abierto a la vez.**

**El estado no se guarda: se recalcula.** «Rellenado» no es un flag que se enciende al pasar de paso, es la respuesta de la validación de ese paso en el momento de pintar. Por eso un paso que estaba completo y que un cambio posterior invalida —pasar a crédito sin fecha prometida, borrar el nombre y soltar el cliente, borrar el precio, elegir tarjeta y dejar el banco vacío— deja de mostrarse rellenado en la siguiente pasada (S26), sin que nadie tenga que acordarse de apagarlo. Lo único que sí se recuerda es el **progreso**, y vive aparte del formulario porque la validez sola no puede saber si la dueña ya avanzó (S59): qué pasos se desbloquearon —sólo crece— y cuáles confirmó «Siguiente» —editar un campo de ese paso lo revoca—.

**«Siguiente» valida sólo su paso** (S25) y es el **único** camino que lo confirma y desbloquea el que sigue (S59). Si está bien, lo cierra y abre el que sigue, con el foco en el encabezado nuevo para que en el teléfono el paso quede a la vista sin buscar; si falta algo, pinta el error de cada campo con el mismo `paintFieldError` del 400, deja el paso abierto y no avanza. **Abrir o cerrar un paso no lo completa**: un paso se ve «Rellenado» recién cuando «Siguiente» lo validó, y si después se edita un campo suyo vuelve a «Pendiente» sin volver a bloquear los pasos que ya se habían abierto. La validación es **consciente de la condición de pago y del modo del cliente**: «La venta» pide lo que pide el modo abierto —el nombre escrito o un cliente del padrón— y con crédito la fecha prometida es obligatoria; con contado la fecha prometida no se mira. El cliente se valida en «La venta», que es donde está su bloque. **El último paso no tiene «Siguiente».**

**El envío final sigue validando todo** (S26), abiertos o colapsados los pasos. El paso «Resumen» no tiene campos propios: su validación es la del formulario completo, que junta la de los otros tres. Si el envío encuentra algo en un paso cerrado, lo abre antes de pintar, porque un control en `display: none` no se puede enfocar ni mostrar su mensaje. Por eso el `<form>` va con **`novalidate`**: la validación nativa no puede reportar sobre el contenido de un paso cerrado, y los mensajes en español los pinta la pantalla con la validación del modelo. Los atributos `required`, `pattern` y `min` se conservan porque son los que pintan el asterisco rojo y los que documentan la regla en el marcado; el 400 del servidor sigue siendo la red de seguridad (D-003).

**El registro está apagado hasta completar los tres pasos (S61).** El botón de envío arranca `disabled` y se habilita recién cuando «La venta», «Condición de pago» y «Cobro» están **confirmados** con su «Siguiente» y válidos, en escritorio y en móvil; el texto de al lado dice qué falta mientras está apagado. No alcanza con que los campos estén bien: sin el «Siguiente» que confirma, el paso sigue «Pendiente» y el registro sigue apagado. El envío no confía en el botón —`Enter` dentro de un campo dispara el `submit` igual— así que el manejador corta sin llamar a la API y abre el primer paso que falta, con sus errores pintados si los tiene.

En el teléfono el paso abierto ocupa el ancho completo y el «Siguiente» también; desde 640px el botón se achica y se alinea a la derecha. El cuerpo del paso conserva el `gap` que tenía la tarjeta, así que plegar y desplegar no mueve el resto del formulario, y los campos de adentro no cambiaron de estilo: el paso es un envoltorio, no un rediseño.

**En escritorio el resumen deja de ser un paso (S60).** Desde 1024px el formulario es una grilla de dos columnas: los pasos 1-3 a la izquierda y el resumen —desglose de importes, «Cancelar» y «Registrar venta de …»— en una columna a la derecha, **pegada al scroll** bajo el encabezado del armazón, así que los importes y el botón se ven mientras se completa cualquier paso. Esa columna no tiene número, ni insignia, ni chevron, ni se abre: muestra un título fijo («Resumen») y su cuerpo está siempre a la vista. Los pasos de la secuencia son tres y «Siguiente» en «Cobro» no abre nada: cierra los pasos y deja el foco en el botón que acaba de habilitarse. El acordeón sigue siendo uno solo en los dos anchos; lo que cambia es dónde vive el resumen. Por debajo de 1024px el resumen vuelve a ser el paso 4, al final, con el botón adentro. El punto de quiebre está escrito dos veces a propósito —`(min-width: 1024px)` en `sale-new.css` y en `lib/views/sale-new.ts`— porque el CSS decide el acomodo y el script decide si el resumen es un paso; cruzar el ancho repinta sin reescribir el marcado.

| Bloque | Campo | `name` | Tipo | Requerido | Visible en |
|--------|-------|--------|------|-----------|------------|
| La venta | Agregar cliente | — (`data-customer-enabled`) | checkbox `collect-check` con el rótulo **«Agregar cliente»** | No: **arranca apagado** (S63) | Ambos canales; **encendido y bloqueado con «Crédito»** |
| La venta | Modo del cliente | — | grupo de dos `<button>` con `aria-pressed`: **«Cliente nuevo»** (elegido por defecto) y **«Cliente existente»**, uno al lado del otro también en el teléfono | Sí, siempre hay uno elegido **con el bloque encendido** | Ambos canales |
| La venta | Cliente | `customer_name` | texto, max 200 | Sí, **en el modo «Cliente nuevo»** con el bloque encendido | Sólo con «Cliente nuevo» |
| La venta | Buscar cliente | `customer_id` | buscador `GET /customers?q=`, su lista de resultados y el chip del cliente elegido con «Quitar» | Sí, **en el modo «Cliente existente»** con el bloque encendido | Sólo con «Cliente existente» |
| La venta | Agregar número de teléfono | `customer_phone` | checkbox + `tel`, max 30 | Solo si el checkbox está marcado | Sólo con «Cliente nuevo» |
| La venta | Fecha de la venta | `sale_date` | `date` | Sí (viene con la fecha de hoy) | Ambos canales |
| La venta | Mercadería — nombre del producto | `product_name` (primer renglón) y `name` (los demás) | texto, max 200, uno por renglón | Sí en todos los renglones | Ambos canales |
| La venta | Mercadería — precio en córdobas | `cost` (primer renglón) y `total` (los demás) | texto, `inputmode="decimal"`, con el prefijo `C$` | Sí en todos los renglones | Ambos canales |
| Condición de pago | Condición | `payment_terms` | dos radios con la clase `pay-radio` | Sí (contado viene elegido) | Ambos canales |
| Condición de pago | Fecha de pago prometida | `due_date` | `date` | **Solo con `credit`** | Oculto por defecto; se revela con `change` en `payment_terms` |
| Cobro | Forma de pago | `payment_method` | dos radios con la clase `pay-radio` | Sí, **sólo de contado** | Ambos canales; **oculto con «Crédito»** (S57) |
| Cobro | Banco emisor | `payment_bank` | `<select>` con siete bancos de Nicaragua | **Solo con `credit_card`** | Oculto por defecto; se revela con `change` en el `payment_method` y **no existe con «Crédito»** |
| Cobro | ¿Cobraste ahora? + Monto recibido | `amount_paid` | checkbox `collect-check` + texto `inputmode="decimal"` | Solo de contado y con el interruptor encendido | Oculto por defecto; se revela con `change` en el checkbox |

**El cliente es opcional: «Agregar cliente» (S63).** La mayoría de las ventas son a consumidor final, así que el bloque del cliente —los dos modos, el nombre o el buscador y el teléfono— **arranca apagado** detrás de un checkbox «Agregar cliente», el mismo control del teléfono. Apagado, el bloque se esconde y queda **inerte** —botones y campos `disabled`, el bloque de los modos con `hidden`— y la venta viaja **sin `customer_id` y sin `customer_name`**: el servidor guarda el nombre genérico «Consumidor Final» en la factura y no crea ningún cliente, así que la lista de clientes no se llena de ventas anónimas. La pantalla **no manda el nombre genérico**: si lo mandara, el servidor lo resolvería contra el padrón y crearía ese cliente, que es justo lo que la regla evita. Encender el checkbox devuelve el bloque como estaba —lo cargado no se borra al apagarlo, sólo deja de viajar— y el nombre vuelve a ser obligatorio con su mensaje de siempre. **A crédito el cliente es obligatorio**: elegir «Crédito» enciende el checkbox, lo deja `disabled` y muestra el bloque, porque una deuda sin cliente no tiene a quién cobrarle; volver a contado devuelve la decisión a la dueña. Es la opción con menos piezas —el control ya lo dice y el paso pide el nombre con su mensaje, sin un error nuevo— y hace imposible registrar un crédito sin cliente desde esta pantalla. El checkbox **no viaja en el borrador** (S49): el borrador guarda el modo y lo cargado, y la venta abre sin cliente como cualquier otra.

**Dos botones eligen el camino del cliente (S43).** Arriba del bloque hay un grupo `role="group"` con dos `<button>` —**«Cliente nuevo»** y **«Cliente existente»**, los nombres textuales de la dueña— que se recorren con el teclado y llevan `aria-pressed` para que el lector de pantalla anuncie cuál está elegido. **«Cliente nuevo» viene seleccionado**, porque la mayoría de las ventas son a gente nueva. El elegido no se distingue sólo por el color: lleva la marca de verificación además del borde y la superficie activa, el mismo lenguaje de la insignia de los pasos. Cambiar de botón muestra el otro camino: el plegado `<details>` que tenía «Cliente existente» desapareció, porque no se entendía y había que descubrirlo.

**«Cliente nuevo» muestra sólo el nombre y el teléfono.** El campo **Cliente** es un texto plano con el rótulo «Cliente», el placeholder «Ej: María González» y la ayuda «Escribí el nombre: la venta lo registra como cliente.»; debajo va el checkbox **«Agregar número de teléfono»** con su campo (S23). La venta manda `customer_name` y, si el checkbox está encendido, `customer_phone`. El servidor resuelve el nombre contra el padrón o crea el cliente con ese nombre (S18), también con crédito (S29). El campo **no busca nada mientras se escribe**: sin lista debajo, escribir el nombre y avanzar es un solo gesto.

**«Cliente existente» muestra sólo el padrón.** Un buscador con el rótulo **«Buscar cliente»**, el placeholder «Nombre o teléfono» y la ayuda «Busca en el padrón mientras escribís.», que consulta `GET /api/v1/customers?q=` —a partir de la segunda letra, con `debounce` de 300 ms y descartando respuestas viejas—; su lista de resultados con nombre y teléfono; y el chip del cliente elegido con su «Quitar». Elegir uno enlaza la venta por `customer_id` y el bloque del teléfono se esconde: el número de ese cliente ya está en su ficha, así que la venta no manda `customer_phone`. «Quitar» vuelve al estado vacío del modo —el buscador limpio y con el foco—, **no al nombre escrito**, que es del otro camino; mientras no haya cliente elegido, «La venta» no deja avanzar con «Elegí un cliente existente».

**El modo decide el payload, y cambiar de modo no deja restos.** Con «Cliente nuevo» viajan `customer_name` y —si el checkbox está encendido— `customer_phone`, y **nunca** `customer_id`; con «Cliente existente» viaja sólo `customer_id` y **nunca** `customer_name` ni `customer_phone`. El modo vive en el estado puro del formulario (`customer-pick.ts`, `sale-form.ts`, `sale-form-steps.ts`), así que la regla se prueba sin DOM y la pantalla sólo cablea los botones. Al pasar a «Cliente nuevo» se suelta el cliente elegido —si quedara, el aviso de teléfono repetido lo tomaría como el cliente de la venta y su propio número no se avisaría (S28)— y al volver a «Cliente existente» el buscador arranca vacío. La API rechaza las dos claves juntas, así que esta regla es también lo que evita ese 400.

**El alta rápida de cliente ya no existe.** Crear un cliente es escribir su nombre en «Cliente nuevo»: el bloque «Nuevo cliente» con su nombre, su teléfono y su botón «Registrar cliente» se retiró junto con su script y sus estilos, porque era un segundo camino para hacer lo mismo y competía con el principal (S30). El teléfono opcional se sigue guardando con el checkbox de abajo (S23).

**El cliente vive en «La venta», no en «Condición de pago».** El bloque del cliente —los dos modos, el nombre, el buscador y el teléfono— existe en las dos condiciones de pago, así que no puede vivir en un paso que sólo mira el crédito; «Condición de pago» conserva lo que sí es del crédito —la fecha prometida—. Por eso `stepOfField` ubica `customer_id`, `customer_name` y `customer_phone` en `sale`, y la regla del cliente la resuelve ese paso: `validateCustomerChoice` pide el nombre escrito o un cliente del padrón según el modo, sin importar la condición de pago.

**El aviso de teléfono repetido (S28).** Con el checkbox del teléfono encendido en «Cliente nuevo», el número se compara **por dígitos** —sin espacios, guiones ni paréntesis, así que «8888 1234» y «88881234» son el mismo— contra los clientes que devuelve `GET /customers?q=<dígitos>`. Si el número ya es de un cliente aparece el aviso **«Número asociado a cliente existente»** con el nombre de ese cliente y dos salidas: **«Usar sus datos»** cambia al modo «Cliente existente» con ese cliente elegido —la venta queda con `customer_id` y su teléfono ya está en su ficha, así que no se manda `customer_phone`— y **«Escribir otro número»** vacía el campo, deja el checkbox encendido y devuelve el foco al teléfono. Mientras el aviso siga sin resolverse, el «Siguiente» de «La venta» y el envío final se frenan con el error del campo `customer_phone`, «Ese número es de otro cliente: usá sus datos o escribí otro número». La consulta usa el mismo `debounce` del buscador y también descarta respuestas viejas; en «Cliente existente» no corre, porque ahí no hay número que escribir; y si la consulta falla, el número se acepta como siempre: el aviso es una ayuda, no una dependencia de red.

**El paso «Cobro» cambia con la condición de pago (S57).** De contado es lo que siempre fue: la forma de pago, el banco emisor cuando es tarjeta y, con «¿Cobraste ahora?» encendido, el monto recibido. Con **«Crédito»** no se cobra en el momento, así que no hay método ni banco que elegir: los dos controles se esconden —envueltos en `[data-payment-fields]`, que el script oculta y deshabilita— y en su lugar queda una línea que explica que **cada pago del libro guarda su propio método y banco**. El paso queda **válido sin nada que llenar** (`validateStep("payment")` no reclama en crédito) y el alta viaja **sin `payment_method` ni `payment_bank`**: el servidor guarda `cash` como valor de registro porque la columna es obligatoria, y la factura imprime «Crédito». Volver a «Contado» devuelve los controles como estaban, con la misma regla del banco.

**La pantalla dice con qué estado va a quedar la venta (S62).** «¿Cobraste ahora?» no es un detalle de cobro: es lo que decide si la venta se guarda **completada** o **pendiente**. Por eso la tarjeta de cobro lo dice debajo del interruptor —«La venta se registrará como completada.» en verde, o «La venta quedará pendiente.» en ámbar— y el **resumen** lo repite antes de enviar, con una fila **«Estado de la venta»** y su insignia («Completada» / «Pendiente») más una línea que explica el porqué («…todavía no la cobraste», «…una venta a crédito nace debiendo»). A crédito la venta **siempre** nace pendiente, y el interruptor ni se muestra. La regla vive en una sola función pura, `previewSaleStatus` en `lib/sales/sale-form.ts`, la misma que aplica `buildSalePayload`: una prueba compara las dos para que la pantalla no pueda prometer un estado distinto del que se manda. El interruptor es un checkbox real, con la casilla dibujada a mano (1.25rem, tilde propia) para que se lea como el control que es, y no un cuadradito del tamaño del texto.

**Cada campo obligatorio lleva un asterisco rojo en su rótulo.** La marca sale del atributo `required` del control (`.field:has([required]) > .field-label::after`, en `new.css`), así que agregarle `required` a un campo nuevo alcanza para que quede marcado y no hay una segunda lista de campos obligatorios que se pueda desincronizar. El banco emisor, que es obligatorio solo con tarjeta, se marca y se desmarca con el estado. La fecha prometida declara `data-required` en su contenedor porque su control no es un `required` nativo, y la misma regla lo cubre. El encabezado del formulario lleva la leyenda "Campos obligatorios" (`.form-legend`) para que el asterisco se entienda sin adivinarlo.

**El campo Categoría ya no existe (S47).** Los cuatro chips —Pantalones, Camisas, Chaquetas, Sudaderas— se retiraron del formulario porque la dueña no los usaba: «veo que no es necesario, así que podés quitarlo». No era un dato que ninguna pantalla mostrara (D-021), así que la lista de categorías se quedó sin nadie que la eligiera. El marcado, sus estilos (`.category-*`, que ya no existen en `new.css`) y la validación de «al menos una» que vivía en `sale-form-steps.ts` se fueron con el campo, y el envío **no manda `category`**: la API la acepta opcional y guarda un arreglo vacío (S48). Las ventas ya guardadas conservan sus categorías, y el detalle sigue devolviendo la lista (vacía en las nuevas).

**El encabezado ya no repite la miga de pan.** Arriba del título hay un enlace "← Ir a ventas" al listado (`.form-back`, con `no-print`): la miga nombraba la misma sección que la barra lateral y que el título, y lo que la dueña necesita dentro del formulario es la salida, no un segundo rótulo del lugar donde ya está.

**El armazón del formulario es compartido.** El encabezado (`.form-head`), el enlace de regreso (`.form-back`/`.link-back`), el título (`.form-title`) y las tarjetas (`.form-card`) son las primitivas de `src/styles/forms.css`, las mismas que usa `/expenses/new` (§7). Antes cada formulario tenía su copia —`.panel` acá, `.page-head`/`.form-card` allá— y las dos ya habían divergido: el regreso salía con otro tamaño, el título caía cuarenta píxeles más abajo y la tarjeta de gasto se había quedado sin borde. Con una sola copia no pueden volver a separarse. Los bloques «La venta», «Cobro» y «Resumen» siguen en `sales/new.css`.

**La caja de los campos también es compartida.** El fondo relleno sin borde, el radio, la tipografía, el lugar del ícono y del prefijo `C$` y los anillos de foco y de error son las primitivas `.form-card .input` —con `textarea` y `select`, y sus modificadores— de `src/styles/forms.css`, las mismas que usa `/expenses/new`. Antes venta seguía el estilo global con borde y gasto la caja rellena, así que los dos formularios se leían como dos familias. El corte de la hoja compartida explica el porqué (05-estilado.md).

**El formulario no manda `status`.** La venta nace Pendiente y el estado se cambia desde el listado (§2), que es donde la dueña la marca como completada. El formulario tampoco manda ni elige el canal: el `type` lo fija el servidor a partir del endpoint.

**El formulario de venta no tiene ningún campo `sale_id`.** La relación entre un paquete y una venta la guarda el formulario del paquete, no el de la venta: es el paquete el que se registra después, cuando ya se sabe a qué venta corresponde. Meter un selector de venta acá además duplicaría la decisión en dos pantallas y daría dos caminos para escribir la misma relación.

**Los renglones de mercadería siguen viajando en `additional_items`, y eso contradice a `02-additional_sale.md`.** Esa spec dice que `additional_sale` solo puede pertenecer a una venta de WhatsApp y que `POST /sales/live` rechaza `additional_items` con `400`. El código no lo hace —`CreateLiveSaleDtoSchema` y `CreateWhatsappSaleDtoSchema` son **el mismo** esquema (`CreateSaleWithItemsSchema`)— y la decisión ya está tomada: el commit **`212db97`** ("feat(sales): show additional items section in live sales", mergeado a `main`) levantó el `hidden` de esa sección y el corte por canal, a pedido del usuario, con esta misma verificación. La QA tampoco tiene ningún caso de live con adicionales que espere `400`. Desde S42 el formulario ya no tiene la lista de artículos aparte, pero las filas de mercadería **siguen mandándose en `additional_items` con `kind: "merchandise"`**: el payload no cambió de forma, cambió la entrada desde esta pantalla (S42, S45).

Lo que sigue mal es la spec de base, y el riesgo es concreto: la ronda 1 de este rediseño leyó esa spec, escondió la sección en `live` y **regresó la decisión sin que nada fallara**. Por eso queda escrito acá. Si alguien vuelve a leer "solo WhatsApp" en `02-additional_sale.md`, la respuesta no es esconder el bloque: es corregir esa spec, o —si de verdad se quiere la regla— poner el guard en el DTO del backend, que es donde la regla vive.

Cada renglón manda su `kind`, y desde S44 el formulario sólo produce `"merchandise"`. Esa clasificación decide en qué grupo cae el renglón en la factura, y no es un detalle cosmético: la tabla "Mercadería" imprime `name` y `total` del producto principal **más** los renglones `merchandise`, y la tabla "Artículos adicionales" imprime `quantity`, `description` y `total`. Por eso la lista pide **sólo nombre y precio** —ofrecer cantidad o detalle ahí sería una pérdida silenciosa al imprimir—; los renglones `"additional"` que una venta vieja tenga guardados se siguen imprimiendo con sus cuatro campos en el detalle y en la factura, que es lo que no cambia con S44.

**La mercadería es una lista de productos, uno tras otro (S44).** El bloque conserva el paso, el encabezado en versalitas y el ritmo de la tarjeta, pero ya no es un nombre suelto más una lista plegable aparte: es **una sola lista** donde se carga producto tras producto. Cada renglón pide **nombre del producto** y **precio en córdobas** —el mismo campo de dinero de la casa, con su prefijo `C$` e `inputmode="decimal"`— y nada más; la descripción y la cantidad que tenían los renglones viejos se fueron con el bloque que las pedía. **El primer renglón siempre existe y no se puede quitar**: es la mercadería principal de la venta, la que viaja como `product_name` + `cost`. Los demás se agregan abajo con **«Agregar producto»** —el botón lleva el ícono `Plus` y deja el foco en el nombre del renglón nuevo— y llevan **«Quitar»** cada uno. Los renglones se llenan en cualquier orden, así que el foco del alta es una comodidad, no un requisito.

Los renglones se numeran ("Producto 1", "Producto 2") y la numeración se recalcula al agregar y al quitar, así que nunca queda un hueco. El orden del DOM es el orden del payload, y ese orden es el índice con el que se señala el renglón que falló: el primer producto es `product_name`/`cost`, los adicionales del servidor llegan como `additional_items.<j>` y la validación de la pantalla usa `items.<n>` contando la lista completa. El corrimiento entre los tres vocabularios lo resuelve `productFieldTarget` (`src/lib/sales/sale-rows.ts`), que es el único que sabe que el adicional `0` es el renglón `1` de la pantalla; por eso el mensaje se pinta sobre el renglón correcto.

**La validación de la lista.** El primer renglón es obligatorio —nombre y precio válido— y un renglón extra con el nombre o el precio vacío **frena el paso** con el error de ese renglón: la API aceptaría los productos ya cargados, pero un producto en blanco es un error de carga y no una fila opcional. Un precio mal escrito usa el mismo texto de dinero de la casa ("Escribí un importe como 1250.50"). El alta, la suma y el reparto del contrato —primer producto a `product_name`/`cost`, resto a `additional_items` con `kind: "merchandise"`— viven en el módulo puro `src/lib/sales/sale-rows.ts`, con sus pruebas: la pantalla sólo cablea el DOM.

**El campo Banco es una lista cerrada de bancos de Nicaragua, no texto libre (S4).** La operación de la dueña usa uno de los siete bancos del país —`BAC Credomatic`, `LAFISE`, `BANPRO`, `Ficohsa`, `AVANZ`, `ProCredit`, `BANEX`— y el campo de texto libre dejaba entrar bancos de otro país (el `placeholder` llegó a sugerir «Banco Santander, BBVA, Galicia…»). Ahora es un `<select>` con un marcador vacío («Seleccioná un banco») y los siete nombres en ese orden, sin opción «Otro». El catálogo vive en `src/lib/sales/banks.ts` —con su prueba al lado— para que la pantalla y la prueba lean la misma lista y no haya que mantener dos copias. **La API no cambia (S5):** `payment_bank` sigue siendo texto de hasta 100, sin enum del lado del servidor; la lista es una decisión de interfaz, así que los valores ya guardados se siguen imprimiendo, el detalle los pinta igual (`Tarjeta — <banco>`) y agregar un banco nuevo solo pide tocar esa constante, sin migración. El campo Banco es el único con lógica condicional en el cliente: el `change` de `payment_method` alterna el atributo `hidden` de su contenedor, más `disabled` y `required`. Arranca oculto, y al volver a efectivo se limpia. Ocultar no es validar, y la validación real es la del servidor (D-003 y la `CHECK` de la base).

El resumen muestra dos líneas mientras se escribe, espejando lo que esta pantalla puede cargar: **Mercadería** (la suma de los precios de la lista de productos) y **Total estimado**, que es ese mismo número porque ya no hay otra lista que sumar (S44, S45). Un precio que todavía no se puede leer se omite de la suma, y si ninguno se puede leer las dos líneas muestran «—» en vez de un cero. El total se rotula como estimado y la ayuda del bloque aclara que el total final lo confirma el servidor al registrar: la cuenta es del cliente y no reemplaza al `total` que devuelve la API. Debajo va la fila **«Estado de la venta»** con su insignia y su nota (S62), que es lo que la dueña lee al llegar al resumen después del último «Siguiente».

Los cuatro pasos llevan su número en el cuadro de 36px que antes tenía el ícono del bloque (`--surface-active`), y los botones llevan el suyo (`Plus` en «Agregar producto», `X` en «Quitar», `Check` al registrar, `ArrowRight` al pasar de paso, `ArrowLeft` al cancelar). La marca de verificación del modo del cliente elegido es la misma pieza que la insignia de los pasos, así que el formulario tiene un solo lenguaje para «esto está elegido». Es la vida del formulario sin salir del sistema: sin sombras, sin color decorativo y con el acento reservado para el foco y los enlaces.

### Script

```
1. leer type de la URL; si no es live|whatsapp, location.replace("/sales")
2. pintar el título y la etiqueta del botón según el canal
3. change de payment_method → togglear hidden, disabled y required del campo banco
4. click de "Agregar producto" → clonar el template de la lista, renumerar, insertar al final y enfocar el nombre del renglón nuevo
5. click de "Quitar" → eliminar el renglón, renumerar el resto (el primero no lleva el botón, así que la lista nunca queda vacía)
6. cualquier cambio de precio → recalcular el resumen sumando la lista (estimado, no autoritativo)
7. click en el encabezado de un paso → abrirlo y cerrar el resto, o cerrarlo si ya estaba abierto; un paso bloqueado no hace nada (su botón está `disabled` y el handler vuelve a comprobar el desbloqueo)
8. click de «Siguiente» → validar sólo los campos de ese paso; si están bien, **confirmarlo, desbloquear el siguiente**, cerrarlo y abrirlo con el foco en su encabezado; si no, pintar los errores y quedarse. En escritorio, «Siguiente» en «Cobro» cierra los pasos y enfoca el botón de registrar (S59, S60)
9. cualquier `input`/`change` del formulario, alta o quita de un renglón y elección de cliente → **revocar la confirmación del paso al que pertenece el control** y recalcular y repintar la insignia de los pasos, el estado del botón de registrar y su texto de ayuda (S59, S61)
10. `change` de «Agregar cliente» → mostrar u ocultar el bloque del cliente y dejar sus controles inertes o activos; la venta manda las claves del cliente sólo con el bloque encendido (S63)
11. `change` de la condición de pago → además de la fecha prometida y del cobro, encender y bloquear «Agregar cliente» con «Crédito» y devolverlo a la dueña con «Contado» (S63)
12. cruzar los 1024px → repintar el acomodo: el resumen pasa de columna fija a paso 4 y al revés, sin tocar el marcado (S60)
13. click de «Cliente nuevo» / «Cliente existente» → cambiar el modo: `aria-pressed` en los dos botones, mostrar el panel de ese camino (nombre y teléfono, o buscador, resultados y chip) y soltar lo que era del otro, para que el payload no mezcle `customer_name` con `customer_id`; el foco va al control del modo elegido
14. `input` en el buscador de «Cliente existente» → a partir de la segunda letra y con `debounce`, buscar en `GET /customers?q=` (nombre o teléfono) y ofrecer los resultados; Enter busca ya; click en un resultado → `customer_id` y chip del cliente elegido; «Quitar» → volver al estado vacío de ese modo, con el buscador limpio y enfocado. El campo Cliente no busca: es el nombre que la venta registra en «Cliente nuevo»
15. `input`/`change` en Teléfono (checkbox encendido y modo «Cliente nuevo») → con el mismo `debounce`, buscar por dígitos en `GET /customers?q=`; si el número ya es de otro cliente → aviso con su nombre y sus dos botones. «Usar sus datos» → cambiar a «Cliente existente» con ese cliente elegido y cerrar el aviso; «Escribir otro número» → vaciar el campo y enfocar
16. submit:
   - preventDefault()
   - validar los cuatro pasos de una vez (`validateStep("summary", …)`); si falta algo, pintarlo y abrir el primer paso con error
   - armar el cuerpo con los campos, convirtiendo la fecha a ISO y los importes a string (sin `category`: el campo se retiró, S47)
   - la lista de productos entra con el reparto de `productPayload`: el primero es `product_name` + `cost` y los demás van en `additional_items` con `kind: "merchandise"` (la clave no viaja si hay un solo producto)
   - método: POST /sales/live o POST /sales/whatsapp según el canal
   - 201: **borrar el borrador del canal** y `location.href = "/sales"`; la escritura exitosa además vacía la caché de la API del service worker (ver `08-pwa.md`, «Invalidación de la caché de la API»), para que el listado de `/sales` no llegue de una copia anterior al alta (S1)
   - 400: pintar el mensaje junto al campo que falló (por índice del payload, si es un renglón) y el resto en el sobre; el borrador **no** se toca
   - 500 o red: sobre de error con el mensaje del servidor; el borrador **no** se toca
17. al terminar el cableado —modo del cliente, lista de productos y condición de pago ya responden— **restaurar el borrador** del canal (S49); la fecha guardada sólo se restaura si no es anterior a hoy, y si lo es se usa hoy (S1)
18. guardado del borrador: `input`/`change` del formulario con `debounce` de 300 ms, más una escritura en `pagehide` y en la limpieza de la página, para que irse a media palabra no pierda la última tecla (S49)
19. click de «Cancelar» → `preventDefault()` y abrir el `ConfirmDialog`; confirmar **borra el borrador** y navega a `/sales`, cancelar deja el formulario y el borrador como estaban (S50)
```

El formulario **no limpia los campos al fallar**. La dueña corrigió un importe y no quiere volver a escribir el cliente, la mercadería y la fecha. El mensaje de error va en un sobre bajo el formulario, con el campo que falló highlighted.

### El borrador del formulario (S49, S50)

Ir a otra pantalla a consultar algo y volver no puede obligar a reescribir la venta entera. Mientras el formulario se llena, lo cargado se guarda en `localStorage` y al volver se repinta solo. **Fue un pedido textual**: «cuando estoy rellenando el formulario y voy a otra pagina a consultar otra informacion tengo que volver a rellenar los datos, eso es agotador, ayudame a que los datos del formulario persistan».

**La clave es una por canal e incluye la versión de formato:** `shopmar:sale-draft:live:v1` y `shopmar:sale-draft:whatsapp:v1`. El canal sale del `data-canal` del formulario, que ya decide el endpoint; la versión va en la clave **y** en el cuerpo guardado (`version: 1`), así que un borrador de otro formato se ignora en vez de restaurarse a medias. Lo que se está vendiendo en el mostrador no aparece al abrir la venta de WhatsApp, que es otra venta en curso.

**Qué guarda, y nada más:** el modo del cliente (`new` / `existing`), el nombre escrito, el cliente elegido (`id`, `name` y `phone`, lo justo para repintar el chip sin pedir la ficha a la API), el checkbox del teléfono y el número, los productos en su orden (nombre y precio), la condición de pago, la fecha prometida, la forma de pago y el banco, el interruptor «¿Cobraste ahora?» con el monto recibido, y la fecha de la venta. No guarda el resumen, el total ni las insignias: son derivaciones y se recalculan al restaurar. **Tampoco guarda el checkbox «Agregar cliente» (S63)**: la venta abre sin cliente, que es el caso normal, y lo cargado del bloque vuelve en cuanto se enciende.

**Qué restaura:** el modo correcto con su panel, el nombre escrito **o** el chip del cliente elegido, el teléfono y su checkbox, los renglones de mercadería —creando los que falten y quitando los que sobren, en el orden guardado—, el bloque de la condición con su vencimiento, el método con su banco, el cobro en el momento con su monto y la fecha. Después repinta el resumen, el total del paso y las insignias, con las mismas funciones que responden a los controles, así que lo restaurado queda en el mismo estado que si se hubiera tocado cada campo.

**La fecha de la venta no se restaura hacia el pasado (S1).** Un borrador guardado otro día fechaba la venta en ese día viejo, así que la venta recién registrada no aparecía en el listado por defecto, que es «Hoy»: se midió una venta creada a las 23:37Z con `sale_date` de dos días antes. La regla vive en la parte pura, `saleDateToRestore(saleDate, today)` en `src/lib/sales/sale-draft.ts`: una `saleDate` **anterior** a hoy no se restaura y se usa hoy; una de hoy **o futura** se respeta tal cual, porque fechar una venta adelante es una decisión de la dueña. La comparación es por string y exige el formato `YYYY-MM-DD` de `todayLocal`: con ese formato el orden alfabético es el cronológico y las dos fechas son del calendario local, no de UTC. Un valor con otro formato no se puede comparar así y también cae en hoy, para no dejar el campo de fecha vacío. El resto del borrador se restaura igual y la versión de formato no cambia (`v1`).

**Un borrador que no sirve se ignora, no se repara a medias.** Falta, es de otra versión, no es JSON válido, le falta un campo o trae un valor de otro tipo: `readSaleDraft` devuelve `null` y el formulario arranca vacío. Lo que sí se sanea sin descartar el borrador son las claves de más —adentro de un renglón quedan sólo `name` y `price`— y un cliente elegido que sobrevive a «Cliente nuevo», que ese modo no manda. Un borrador de «Cliente existente» sin cliente elegido se ignora, porque no hay chip que repintar ni `customer_id` que mandar.

**Cuándo se guarda.** Con `debounce` de unos 300 ms en cada `input`/`change` del formulario —una escritura por tecla no aporta nada— y una última vez en `pagehide` y en la limpieza de la página, para que navegar a media palabra no pierda la última tecla. Agregar o quitar un renglón también guarda: cambia el borrador aunque nadie escriba.

**Lo único que lo borra son dos acciones (S50):** la venta registrada —antes de navegar a `/sales`, así la próxima visita empieza limpia— y el «Cancelar» confirmado. Un envío fallido lo conserva; salir de la página, cambiar de paso o cambiar de modo, también.

**«Cancelar» pide confirmación.** El enlace ya no navega directo: abre el **`ConfirmDialog`** del sistema (el mismo de Clientes, no un `window.confirm`) con «Se van a descartar los datos de esta venta. Esta acción no se puede deshacer.» y la acción **«Descartar»**. Confirmar borra el borrador y navega a `/sales`; cancelar deja el formulario y el borrador intactos. Sin JavaScript el enlace conserva su `href` y sigue siendo la salida a `/sales`.

**Si el almacenamiento no está, la pantalla funciona igual.** El acceso va envuelto: en modo privado o con la cuota llena, leer devuelve `null` y escribir devuelve `false`, así que la persistencia se apaga sola en vez de romper el formulario. La forma guardada, la versión y la validación son de un módulo puro, `src/lib/sales/sale-draft.ts`, con sus pruebas; el `<script>` de la pantalla sólo lee y escribe controles.

---

## 4. `/packages` — Listado de paquetes

**Archivo** `src/components/views/PackagesView.astro` (markup y hoja `packages.css`) · `src/lib/views/packages-list.ts` (`mountPackagesList`) · la ruta `src/pages/packages/index.astro` sirve el armazón · **Componente de layout** `wide` · **Datos** `GET /api/v1/packages`

### Contenido

- **Encabezado:** el título y, a la derecha, las **mismas dos altas de venta que Ventas** —`SaleActions.astro`: «Venta en tienda» a `/sales/new?type=whatsapp` y «Venta por Live» a `/sales/new?type=live`—. Desde esta pantalla también se registra una venta, y tener el par en un componente evita que el copy o los destinos se desincronicen entre las dos pantallas.
- **Barra de filtros** (S40): el `DateRangeFilter` incrustado (`variant="fields"`) —**Hoy**, **Últimos 7 días** o **Personalizado** (S34)— siempre visible, con el botón **«Filtros»** a su lado y el **número de filtros activos** en un chip (cero filtros, sin chip). En móvil el período toma su línea y el botón baja debajo a ancho completo.
- **Panel colapsable**, cerrado en una visita nueva, con el `<select>` de método (`cargotrans`, `delivery`, `retiro`) y el enlace «Limpiar» (S39), que sigue apareciendo sólo con un filtro activo. Abre y cierra con una transición corta que `prefers-reduced-motion` apaga, el foco se queda en el botón y el estado se recuerda en `sessionStorage` por ruta (`shopmar.filters.open:/packages`) —aquí también se recalcula el chip en cada navegación interna, porque la tabla no recarga el documento (D-013)—. Un almacenamiento inválido o bloqueado degrada a colapsado. La consulta —rango, método y página— también se recuerda por ruta: volver acá desde otra pantalla no la pierde (S58, igual que en ventas).
- Botón primario "Registrar paquete" (a `/packages/new`).
- Tabla con: **Fecha**, **Nombre**, **Método**, **Venta asociada**, **Acciones**.
- **La tabla no hace scroll lateral** (S55): no fija anchos mínimos por columna —la mercadería se recorta con `cell-clamp`, que ya existía— así que entra en su contenedor desde 768px. La única excepción es el `<select>` de **Método**, que conserva el ancho de su etiqueta más larga (`min-width: max-content` en `.shipment-wrap`, con el tope de siempre de 130px) para que «Sin asignar» no se lea como «Sir» en un teléfono. Por debajo de ese corte, y sólo como último recurso, `.table-wrap` sigue desplazando en horizontal.
- **Estado vacío:** la fila que se clona dentro del tbody (`[data-state-template]`) con el bloque `.empty-state` compartido, el mensaje apagado y la acción **"Registrar venta"** a `/sales/new?type=live` con la píldora de tinta del sistema —no un enlace de texto— (S55). Es el mecanismo que ventas y gastos también usan desde S56.

La columna Venta asociada muestra el `sale_id` truncado a 8 caracteres como enlace a `/sales?start_date=<fecha>&end_date=<fecha>`, filtrando el listado de ventas por el día del paquete. No trae el nombre del cliente: incorporarlo exigiría una carga anidada que el endpoint no devuelve (nota de contrato en `03-api.md`).

### Script

```
1. leer start_date, end_date y method de la URL
2. apiFetch(`/packages${query}`) → respuesta { packages: [...] }
3. por cada fila: <tr> con fecha, nombre, insignia de método, enlace de venta, botones
4. botón Editar → location.href = /packages/new?id=<id>   (precarga el formulario)
5. botón Eliminar → confirm() → DELETE /packages/:id → quitar la fila
6. vacíos: la fila de estado del `[data-state-template]` con el mensaje "No hay paquetes
   registrados" y la acción a /packages/new
```

Editar y eliminar son las dos acciones por fila. Editar navega al formulario con el `id` en la query; el formulario detecta el parámetro y precarga los campos. Es la reutilización de la ruta de alta para el alta y la edición, sin una ruta `/packages/edit`.

**El formulario no pide `GET /api/v1/packages/:id` porque ese endpoint no existe.** El contrato tiene cuatro endpoints de paquete —alta, listado, `PUT` y `DELETE`— y ninguno devuelve un paquete suelto. La precarga sale del listado: el formulario pide `GET /api/v1/packages` sin filtros y localiza el registro por `id`. Un paquete es un envío registrado, la lista de envíos completa entra en una pantalla, y traer veinte filas para leer cuatro campos de una es más barato que agregar un endpoint que solo usaría un formulario.

---

## 5. `/packages/new` — Formulario de paquete

**Archivo** **Pendiente:** no existe todavía ni la vista ni su ruta (`src/pages/packages/new.astro`); se crea en `tasks/frontend/06-pantalla-de-paquetes.md` y, cuando exista, será otra vista de la SPA como las demás. · **Componente de layout** por defecto · **Datos** `GET /api/v1/sales` (para el selector) y `GET /api/v1/packages` (solo si trae `id`, para precargar) · **Escritura** `POST /api/v1/packages` o `PUT /api/v1/packages/:id`

### Contenido

| Campo | `name` | Tipo | Requerido |
|-------|--------|------|-----------|
| Nombre | `name` | texto, max 200 | Sí |
| Fecha | `package_date` | `date` | No (por defecto hoy) |
| Método | `method` | `<select>` (cargotrans, delivery, retiro) | Sí |
| Venta asociada | `sale_id` | `<select>` con "Sin venta asociada" como primera opción | No |

Cuando la URL trae `?id=<uuid>`, el título cambia a "Editar paquete", el botón dice "Guardar cambios" y el `method` del `fetch` pasa a `PUT`.

**El `PUT` es un reemplazo completo.** El formulario manda los cuatro campos siempre, no solo los que cambiaron. Mandar solo `name` devuelve `400` con la lista de los campos faltantes, porque `PUT` no es un parche.

### Script

```
1. si hay ?id, apiFetch("/packages") y localizar el registro por id para precargar
2. apiFetch("/sales") y armar el select de ventas, en los dos modos
3. submit:
   - armar el cuerpo con FormData
   - convertir package_date a ISO si viene
   - convertir sale_id vacío a null
   - método: POST o PUT según haya id
   - 201 o 200: location.href = "/packages"
   - 400: mensaje de error bajo el formulario
```

La opción "Sin venta asociada" con `value=""` es la que produce el `sale_id: null` que desvincula un paquete mal asociado. Es la única forma de pasar `null` por un formulario HTML, y por eso la opción existe.

**Si el paquete editado está vinculado a una venta que no viene en el listado de ventas, el `select` la agrega como primera opción** en vez de dejar el valor fuera de la lista. Un `select` cuyo valor no está entre sus opciones se renderiza vacío, y un formulario que manda `sale_id: null` sin que la dueña lo haya tocado desvincula el paquete por accidente.

---

## 6. `/expenses` — Listado de gastos

**Archivo** `src/components/views/ExpensesView.astro` (markup y hoja `expenses.css`) · `src/lib/views/expenses-list.ts` (`mountExpensesList`) · la ruta `src/pages/expenses/index.astro` sirve el armazón · **Componente de layout** `wide` · **Datos** `GET /api/v1/expenses`

### Contenido

- **Barra de filtros** (S40): el `DateRangeFilter` incrustado (`variant="fields"`) —**Hoy**, **Últimos 7 días** o **Personalizado** (S34)— siempre visible. **No hay botón «Filtros»**: es la única pantalla sin filtros de refinación, así que el panel estaría vacío; «Limpiar» aparece en la misma barra cuando hay algo aplicado (S39).
- **Panel colapsable**, cerrado en una visita nueva, con el enlace «Limpiar» (S39), que sigue apareciendo sólo cuando hay un rango propio. Gastos no tiene filtros de refinación —el período es todo—, así que es el panel más chico de los tres, pero el mecanismo es el mismo: transición corta que `prefers-reduced-motion` apaga, foco que se queda en el botón y estado recordado en `sessionStorage` por ruta (`shopmar.filters.open:/expenses`). Un almacenamiento inválido o bloqueado degrada a colapsado. El rango y la página se recuerdan por ruta (S58), así que volver desde «Nuevo gasto» —o desde cualquier otra pantalla— no devuelve la lista a «Hoy».
- Botón primario "Registrar gasto" (a `/expenses/new`).
- Tabla con: **Fecha**, **Nombre**, **Descripción**, **Importe**, **Acciones**.
- **Estado vacío (S56):** la misma fila que se clona dentro del tbody en paquetes —`<template data-state-template>` con `[data-state-text]` y `[data-state-action]`—, dentro de la tabla, con su encabezado y su pie visibles, el bloque `.empty-state` compartido y la acción **"Registrar el primer gasto"** a `/expenses/new` con la píldora `state-action` (S55). El `colspan` es 4, que es el número de columnas de la tabla, y el error pone **"Reintentar"** en el hueco de la acción.

La descripción puede ser `null`; la celda pinta un guion em cuando lo es. El importe va con `formatMoney` y `tabular-nums`.

### Script

```
1. leer start_date y end_date de la URL
2. apiFetch(`/expenses${query}`) → respuesta { expenses: [...] }
3. por cada fila: <tr> con los cuatro datos y un botón Eliminar
4. click en Eliminar → confirm() → DELETE /expenses/:id → quitar la fila
5. vacíos: clonar `[data-state-template]` en el tbody con el mensaje "No hay gastos en el
   rango seleccionado" y la acción "Registrar el primer gasto" a /expenses/new, dejando
   la tabla y su pie visibles
```

No hay filtro por nombre ni por importe. La dueña busca gastos por fecha, y el volumen de un mes cabe en una pantalla sin búsqueda.

---

## 7. `/expenses/new` — Formulario de gasto

**Archivo** `src/components/views/ExpenseNewView.astro` (markup y hoja `expense-new.css`) · `src/lib/views/expense-new.ts` (`mountExpenseNew`) · la ruta `src/pages/expenses/new.astro` sirve el armazón · **Componente de layout** por defecto · **Escritura** `POST /api/v1/expenses`

### Contenido

| Campo | `name` | Tipo | Requerido |
|-------|--------|------|-----------|
| Nombre | `name` | texto, max 200 | Sí |
| Descripción | `description` | texto, max 500 | No |
| Importe | `total` | texto, `inputmode="decimal"` | Sí |
| Fecha | `expense_date` | `date` | No (por defecto hoy) |

Es el formulario más simple de los tres: cuatro campos, sin condiciones, sin bloques dinámicos. No hay ruta de edición; corregir un gasto es borrarlo y registrarlo de nuevo (documentado en el caso de uso 05).

**Comparte el armazón y los campos con el formulario de venta (§3).** El encabezado (`.form-head`), el enlace "← Ir a gastos" (`.form-back`), el título con su ícono delante (`.form-title` + `.form-head-icon`) y la tarjeta (`.form-card`) son las primitivas de `src/styles/forms.css`, no reglas de esta pantalla: por eso el regreso cae a la misma altura que en venta y la tarjeta tiene el mismo borde, radio, fondo y relleno. Los campos también: la caja rellena sin borde, el radio, la tipografía, la geometría del ícono y del prefijo `C$` y los anillos de foco y de error son las mismas primitivas `.form-card .input` de esa hoja, así que `/expenses/new` y `/sales/new` enseñan el mismo control. El ícono es contenido y se conserva dentro del patrón; la pantalla aporta solo lo suyo —los contadores, la fila de fecha e importe, el mínimo del área de texto, el indicador nativo de la fecha, el aviso de error y el toast—, que sigue en `expenses/new.css`.

### Script

```
1. submit:
   - preventDefault()
   - armar el cuerpo con FormData
   - convertir expense_date a ISO si viene
   - método: POST /expenses
   - 201: location.href = "/expenses"
   - 400: mensaje de error bajo el formulario
```

---

## 8. `/new` — Selector de registro

**Archivo** `src/components/views/NewView.astro` (markup y hoja `new.css`) · `src/lib/views/new.ts` (`mountNew`, sin cableado) · la ruta `src/pages/new.astro` sirve el armazón · **Datos** ninguno · **Escritura** ninguna

**Es una vista de la SPA desde T7.** El botón `+` de la barra inferior enlaza a `/new`, y mientras esa ruta era un documento propio el toque pedía el HTML: era el último delay de navegación que quedaba (S1). Ahora el router clona la plantilla dentro de `.app-view`, el título del documento pasa a «Registrar · ShopMar» y ninguna pestaña queda activa. El enlace del FAB no cambió (`href="/new"`), así que la navegación observable es la misma; lo que cambió es cómo se sirve.

La vista **no tiene script**: el acordeón es un `<details>` nativo y los tres destinos son enlaces a vistas migradas, así que `mountNew` no cablea nada y no devuelve limpieza. Agregarle un `toggle` a mano sería un defecto: abriría y cerraría en el mismo gesto y «Registrar venta» parecería no responder. La pantalla usa el ancho de lectura del armazón (`.shell-main.reading`, 65ch) como cuando era un documento, porque `VIEW_WIDE.new` es `false`.

### Contenido

La pantalla que abre el botón de acción de la barra inferior de móvil. No pide datos y no escribe: solo reparte el registro entre los dos formularios que ya existen. No lleva `activeSection`, así que ninguna de las cuatro pestañas queda activa: `/new` no es una sección.

La pantalla tiene **dos niveles de decisión**, y cada nivel tiene **un solo botón tinta**:

**Nivel 1 — venta o gasto.**

- Un `h1` "Registrar".
- **Registrar venta**, un `<details>`/`<summary>` de al menos 64px de alto: al abrirlo revela los dos canales. Es el único `btn btn-primary` de la pantalla.
- **Registrar gasto**, un `<a href="/expenses/new">` de la misma altura y ancho completo, con `btn btn-secondary` (delineado) y el icono `Plus`.

**Nivel 2 — qué canal.** Dos baldosas iguales, una al lado de la otra (`grid-template-columns: 1fr 1fr`), de al menos 104px de alto cada una, con el icono arriba centrado y la etiqueta debajo:

- **Venta por WhatsApp** (`.new-channel--whatsapp`) a `/sales/new?type=whatsapp`: baldosa clara sobre `--m3-surface-container-low`, borde `--line` y el glifo de WhatsApp en `--success` — su misma identidad en el listado de ventas.
- **Venta por Live** (`.new-channel--live`) a `/sales/new?type=live`: baldosa tinta, `--m3-primary` de fondo con `--m3-on-primary` en icono y texto. Es el opuesto exacto de la anterior.

El revelado usa el `<details>` nativo y no JavaScript: se toglea con el teclado, conserva el anillo de foco del sistema y **no depende del ciclo de vida de la vista**. Las dos opciones del nivel 1 son alcanzables con el teclado.

**Por qué un solo botón tinta por nivel.** Antes había tres botones tinta visibles a la vez —"Registrar venta", "Venta por Live" y "Registrar gasto"— y solo el de WhatsApp difería: el color significaba "apretame" tres veces y no decía cuál era la acción principal de la pantalla. La jerarquía ahora la dice el peso: un primario por nivel, y el segundo botón del nivel 1 se distingue por forma (delineado) y no por un color nuevo.

**Por qué dos baldosas y no una lista.** Con los dos canales apilados a ancho completo y el mismo peso, la única diferencia entre ellos era el color del botón, y había que leer etiqueta por etiqueta para elegir. En dos baldosas iguales la decisión es una comparación: misma forma, mismo tamaño, y el contraste de fondo (claro contra tinta) separa los canales de un vistazo. En oscuro `--m3-primary` se voltea a claro, así que la oposición claro/tinta se mantiene; la etiqueta más larga envuelve en dos renglones a 390px sin recortarse.

**Por qué una pantalla intermedia y no dos destinos más en la barra.** La barra ya tiene cinco destinos al alcance del pulgar; meter venta y gasto como destinos la convertiría en una barra de siete y le quitaría el significado de "secciones". El botón `+` central abre una pantalla que sí pregunta qué se va a registrar, y cada opción reutiliza el formulario y las etiquetas que ya existen —sin nombrar la misma acción de dos maneras—. `/new` es accesible solo desde la barra inferior: es aceptado, porque la acción nace del teléfono y el escritorio ya tiene "Registrar gasto" en `/expenses` y los dos canales en `/sales`.

---

## 9. `/customers` — Clientes

**Archivo** `src/components/views/CustomersView.astro` (markup y hoja `customers.css`) · `src/lib/views/customers-list.ts` (`mountCustomers`) · la ruta `src/pages/customers/index.astro` sirve el armazón · **Componente de layout** `wide` · **Datos** `GET /api/v1/customers?include_balances=true`, `POST`, `PATCH` y `DELETE /api/v1/customers/:id`

Es la pantalla donde la entidad `customer` se vuelve útil para cobrar (D-022). Va después de Ventas en la navegación; en este documento cierra la lista para no renumerar las pantallas anteriores.

### Contenido

- Buscador (`q`) sobre nombre o teléfono, con el mismo patrón de búsqueda que los demás listados; la búsqueda se recuerda por ruta como en los otros listados (S58), pero el cliente abierto en el diálogo (`?customer=<id>`) **no**: volver a clientes después de mirar una venta no reabre un diálogo que la persona ya había cerrado.
- Botón primario "Nuevo cliente", que abre el mismo `<dialog>` que usa la edición.
- **Estado vacío:** la fila clonada dentro del tbody (`.empty-state`, `colspan` 5) con "No hay clientes registrados" —o "No hay clientes que coincidan con la búsqueda" cuando hay `q`— y el botón **"Nuevo cliente"** con la píldora `state-action` (`[data-empty-action]`). No es un enlace: abre el mismo `<dialog>` de alta, porque en esta pantalla crear un cliente no navega. La acción vive en el hueco que la plantilla de estado deja para el vacío, así que no hay un segundo camino de alta.
- Tabla con **Nombre**, **Teléfono** (guion cuando no hay), **Saldo por cobrar**, **Vencido** y **Acciones** (Historial, Editar, Borrar).
- Los dos saldos vienen derivados de la API (`outstanding_balance`, `overdue_balance`) y se formatean con `formatMoney`: un cliente sin deuda muestra `C$ 0.00`, nunca un guion, porque el cero es una respuesta y el guion sería una ausencia.

### Script

```
1. leer `q` de la URL y pedir customers con include_balances=true (debounce)
2. pintar las filas; el saldo vencido sólo se destaca cuando no es cero
3. "Nuevo cliente" / "Editar" abren un solo <dialog> con nombre, teléfono y nota
   - validar en el cliente y pintar el error por campo
   - POST o PATCH, y al volver recargar la lista
4. "Borrar" pide confirmación y llama DELETE
   - 409: mostrar el mensaje del servidor tal cual ("tiene ventas a crédito con
     saldo pendiente"), sin reemplazarlo por uno propio
   - 200: quitar la fila, con estado vacío si era la última
```

El borrado de un cliente **no toca sus ventas**: `sale.customer_name` es la instantánea que la factura sigue imprimiendo. Por eso el cliente con deuda no se puede borrar y el de una venta vieja ya cobrada sí.

### Lo que esta pantalla no tiene

| No tiene | Razón |
|----------|-------|
| Un alta de cliente desde el listado de ventas | Existe, pero en el formulario de venta: ahí es donde hace falta y en ese momento. La pantalla de clientes es para consultarlos y corregirlos. |
| Una página propia por cliente | El detalle es un diálogo sobre el listado, abrible por URL (`?customer=<id>`), no una ruta nueva: el listado ya tiene la lista en memoria y una ruta por cliente obligaría a otra carga y a otra pantalla que mantener. |
| Un estado vacío con enlace "Registrar el primero" | La fila de estado recibe un `<a href>` cuando la vista lo pide, y acá el alta es un modal de la misma página. El botón del encabezado es la entrada. |

### Detalles de un cliente

**El clic en una fila abre el diálogo de edición**, que es lo que la dueña hace todo el tiempo; el botón «Historial» de la fila abre los detalles, y es también el camino de teclado y de lector de pantalla, porque la fila no se convierte en un botón. Un clic con modificador, un botón de la fila o una selección de texto en curso no abren nada (mismo criterio que la navegación de fila del listado de ventas). El nombre del cliente en el recibo y en el detalle de una venta enlaza a `/customers?customer=<id>` (S19), y esa URL abre los detalles directamente. El diálogo muestra:

- Nombre, teléfono y nota (guion cuando faltan).
- Saldo por cobrar y vencido, los mismos derivados de la tabla.
- **Su historial completo de compras** (`GET /api/v1/sales?customer_id=<id>`): todas las ventas, de contado y a crédito, con fecha, mercadería, condición, estado, total y —en las de crédito— el saldo y la marca de vencida. Cada fila entera es un enlace a `/sales/detail?id=<id>`, y arriba de la lista un resumen dice cuántas compras son y cuánto suman (S22).
- Un pie con «Cerrar» y «Editar cliente», que abre el formulario de alta/edición que ya existe.

El `?customer=` es compartible: abrir el enlace abre el diálogo; cerrarlo lo quita de la URL sin recargar (`history.replaceState`) y conserva la búsqueda `q`. Un id que no existe no rompe la pantalla: avisa que el cliente pudo haberse borrado y deja el listado como estaba.

**El enlace del recibo sólo aparece si la venta tiene `customer_id`.** Las ventas históricas —anteriores a S18— quedan con el nombre en texto plano, y en papel el enlace no se imprime con subrayado ni cambia el texto.

---

## El patrón que las pantallas con datos y formularios comparten

Extraído de la repetición anterior, este es el esqueleto que se repite sin variación en las cuatro pantallas con datos y en los tres formularios:

| Paso | Qué hace | Dónde vive |
|------|----------|------------|
| Leer la URL | `location.search` al montar la vista (`resolveLocation` del router le pasa `pathname` y `search`) | La vista |
| Pedir | `apiFetch` de `lib/` | `lib/core/api.ts` |
| Estado de carga | El esqueleto de la tabla, los KPIs o el formulario, con `aria-busy` en el contenedor | La plantilla de la vista + `.skeleton` |
| Éxito | `replaceChildren` con las filas, o `navigateTo`/`pushQuery` a la lista | El módulo de la vista |
| Vacío | La fila de estado clonada dentro del tbody, con su enlace de creación | `lib/lists/list-state.ts` |
| Error | Sobre de error con el mensaje de la API y botón "Reintentar" | `lib/lists/list-state.ts` |

La regla de la separación es que este esqueleto no se convierte en una función genérica de "cargar tabla", porque cada tabla tiene columnas y un renderizado distintos. Lo que sí se comparte son las tres piezas que son idénticas: el estado de carga (la primitiva `.skeleton` de `src/styles/`), el de vacío y el de error (`createListStatePainter` en `lib/lists/list-state.ts`, que clona la fila de estado dentro del tbody).

### Un solo estado vacío para las cuatro tablas (S55, S56)

El estado de las cuatro tablas se ve **en el mismo lugar**: dentro de la tabla, con su encabezado visible. Paquetes y clientes clonan una fila `<tr>` dentro del tbody y dejan el ledger visible; ventas y gastos pintan ahora **la misma fila clonada** desde `lists/list-state.ts`, que cuando recibe `template` y `tbody` clona la plantilla en vez de escribir en un host. Ninguna pantalla cambia cuándo aparece cada estado. Lo que se unificó es el **lugar** y la **piel**: `.state-cell`, `.empty-state` y `.state-action` viven en `styles/global.css`, así que cargando, vacío y error son el mismo bloque centrado, con relleno vertical generoso, la leyenda en tinta apagada y una sola acción, y el encabezado y el pie de la tabla no desaparecen en ningún estado.

El pintor compartido tiene dos modos y la pantalla elige uno al construirlo. **Modo fila** (`template` + `tbody`): clona la fila de estado dentro del tbody y destapa el ledger **en todos** los estados, incluido `loading`, como paquetes. **Modo host** (sin plantilla): el de siempre —mensaje en el `[data-state-host]` hermano del `.ledger`, ledger solo con filas— y el tbody no se toca. Por eso el modo host conserva sus tests y cualquier consumidor que no pase plantilla sigue igual.

| Pieza | Regla |
|-------|-------|
| Bloque | `.empty-state`: columna centrada, `gap` de 16px y relleno de 64×24px dentro de un `<td class="state-cell">` que abarca todas las columnas (`colspan`) |
| Lugar | La fila de estado vive en el tbody, así que el `<thead>` y el `.ledger-foot` con su paginador quedan visibles, igual que en paquetes |
| Leyenda | Mismo tono y mismo tamaño en las dos formas del marcado (`.empty-state p` y `.empty-state .state-msg`); el aire lo pone el `gap`, no un margen por pantalla. El error es el único que cambia de color y avisa con `role="alert"` |
| Acción | `.empty-state .state-action` es la píldora de tinta del sistema: fondo `--ink`, texto `--on-ink`, radio de píldora, relleno 12×20, peso 600, hover/activo y anillo de foco. Es un `<a>` en el vacío y un `<button>` («Reintentar») en el error, y las dos cosas miden y pesan igual. El reintento ocupa **el mismo hueco** que la acción del vacío: la plantilla trae `[data-state-action]` y el pintor lo reemplaza por el botón |
| Ícono | No hay: el ícono de 32px que traía `TableState.astro` se retiró para que las cuatro tablas se vean idénticas |

Cada pantalla conserva su etiqueta y su destino: «Registrar la primera venta» (ventas), «Registrar venta» (paquetes) y «Registrar el primer gasto» (gastos). Clientes no ofrece acción en el vacío: su alta es el botón del encabezado y un modal de la misma página.

### El teléfono del cliente desde el formulario (S23)

Debajo del campo **Cliente** hay un checkbox **«Agregar número de teléfono»**, chico y **sobre la misma superficie hundida que el bloque del cliente** —texto de 12 px, en gris—, para que se lea como parte de ese bloque sin ocupar el alto de un bloque entero. El nombre escrito y el buscador del padrón, y también el bloque del teléfono, se apoyan en la **tarjeta hundida** que usan los productos (`.inset-card`: mismo `--bg-inset`, mismo borde y mismo radio), así que un bloque de cliente y una tarjeta de producto se leen como la misma clase de cosa y el campo blanco queda por encima. Es visible en los dos canales y en las dos condiciones; la explicación de para qué sirve vive dentro del campo, que solo aparece al marcarlo. Al marcarlo se revela un `input type="tel"` (`name="customer_phone"`, máximo 30) que pasa a ser obligatorio; al desmarcarlo se oculta, se deshabilita y no se envía. Si el cliente elegido del padrón ya tiene teléfono, el campo viene precargado y se puede corregir.

El número viaja en el alta de la venta y el servidor lo guarda en el cliente: nace con él si es nuevo, completa el que faltaba y reemplaza el que había. Es una sola llamada y no un `PATCH` posterior, así que el alta y el teléfono no pueden quedar desincronizados.

El alta rápida de cliente se retiró (S30): crear es escribir el nombre en el campo Cliente, y el servidor lo resuelve o lo crea en las dos condiciones (S18, S29). El checkbox **«Agregar número de teléfono»** sigue siendo el único camino para guardar el teléfono en el cliente —no hay un segundo campo que escriba el mismo dato—. Si el número escrito **ya es de otro cliente**, aparece el aviso de teléfono repetido con sus dos salidas y el envío se frena hasta resolverlo (§3, S28).
