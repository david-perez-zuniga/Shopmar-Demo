# Componentes

Los componentes `.astro` compartidos en `src/components/`, más el `Layout.astro` que los envuelve a todos y el `App.astro` que sirve el documento de la SPA. La regla que decide dónde va cada cosa es una sola: **si el bloque se repite en más de una pantalla, es un componente; si ocurre una sola vez, vive en su vista**.

## Componentes

| Componente | Archivo | Se usa en |
|------------|---------|----------|
| `App.astro` | `src/components/App.astro` | El documento de la SPA (D-023): lo sirven las nueve rutas del panel |
| `Layout.astro` | `src/layouts/Layout.astro` | El armazón, montado una vez por `App.astro` |
| `Nav.astro` | `src/components/Nav.astro` | Solo desde `Layout.astro` |
| `BottomNav.astro` | `src/components/BottomNav.astro` | Solo desde `Nav.astro` |
| `StatCard.astro` | `src/components/StatCard.astro` | `/` (cuatro veces) |
| `BarChart.astro` | `src/components/BarChart.astro` | **Ninguna** (sin uso) |
| `DonutChart.astro` | `src/components/DonutChart.astro` | **Ninguna** (sin uso) |
| `DateRangeFilter.astro` | `src/components/DateRangeFilter.astro` | `/`, `/sales`, `/packages` y `/expenses` (el filtro de fechas) |
| `StatusBadge.astro` | `src/components/StatusBadge.astro` | `InvoicePrint.astro` (la factura de `/sales/detail`) |
| `SaleActions.astro` | `src/components/SaleActions.astro` | `SalesView.astro` y `PackagesView.astro` (las dos altas de venta del encabezado) |
| `ConfirmDialog.astro` | `src/components/ConfirmDialog.astro` | `CustomersView.astro` (borrar) y `SaleNewView.astro` (cancelar) |
| `InvoicePrint.astro` | `src/components/InvoicePrint.astro` | `SaleDetailView.astro` |

**Componentes sin uso.** `BarChart.astro` y `DonutChart.astro` no los importa nada en esta rama. Los gráficos que existen son los que inyecta `src/lib/summary/` en `SummaryView.astro` (el resumen), no estos dos componentes. Dejarlos sin tocar fue una decisión explícita, no un olvido.

**El markup de cada vista no es un componente suelto.** Los nueve `components/views/<Vista>View.astro` no están en la tabla porque no son piezas compartidas: cada uno pertenece a una ruta y lo monta el router dentro de `[data-app-root]` (D-023). Su hoja vive al lado (`sales.css`, `packages.css`, …).

**El estilo de los gráficos no vive en esos componentes.** El marcado del donut y de las barras lo inyecta JavaScript en `SummaryView.astro`: `renderDonutChart` y `renderBarChart` (`src/lib/summary/`) escriben ese HTML con `container.innerHTML` sobre los ganchos `[data-chart-channel]`, `[data-chart-shipment]` y `[data-chart-daily]`. Astro compila el `<style>` de un componente scopeándolo con un atributo `data-astro-cid-*`, y un nodo creado por `innerHTML` después de la hidratación no lleva ese atributo: cualquier regla escrita en `DonutChart.astro` o `BarChart.astro` **nunca alcanza al marcado vivo**. Por eso el estilo de la leyenda del donut se movió a `src/components/views/summary.css`, la hoja de la vista, que sí comparte el alcance con los nodos inyectados (el detalle está en `05-estilado.md`). `BarChart.astro` arrastra el mismo problema y sigue igual, porque restilizar el gráfico de barras quedó fuera de ese arreglo.

### `Layout.astro`

El shell. Lo monta `App.astro`, y es el mismo para las nueve vistas: el router sólo cambia el contenido de `[data-app-root]` (D-023).

| Prop | Tipo | Por defecto | Qué hace |
|------|------|-------------|----------|
| `title` | `string` | — | `<title>` y `og:title`. Requerida. |
| `description` | `string` | `PUBLIC_SITE_DESCRIPTION` | `<meta name="description">`. |
| `activeSection` | `'summary' \| 'sales' \| 'packages' \| 'expenses'` | — | Marca con `aria-current="page"` el enlace activo en la barra superior, la barra lateral y el drawer. |
| `wide` | `boolean` | `false` | Cuando es `true`, el contenido ocupa el ancho completo de 1120px en lugar de la columna de lectura. Las tablas lo necesitan. |

```astro
---
interface Props {
  title: string
  description?: string
  activeSection?: "summary" | "sales" | "packages" | "expenses"
  wide?: boolean
}
const { title, description, activeSection, wide = false } = Astro.props
---
```

Contiene, en este orden: el `<head>` con los tokens globales, el componente `Nav.astro`, el `<slot />` del contenido y el pie. `main` y `footer` van envueltos en `.shell-body`, que en escritorio se desplaza `var(--shell-sidebar)` a la derecha para dejarle sitio a la barra lateral.

**No** contiene el contenido de las tarjetas, ni de las tablas, ni los scripts de las pantallas. Cada pantalla trae su propio script, porque cada pantalla habla con un endpoint distinto.

### `Nav.astro`

El armazón de navegación. Lo importa `Layout.astro` y es el único componente que monta la estructura de navegación del shell.

- **Escritorio (≥ 1024px):** un `<aside class="shell-sidebar no-print">` fijo de `var(--shell-sidebar)` (232px) de ancho. Lleva la marca —monograma `S`, el nombre `ShopMar` y la línea `Ventas, gastos y envíos`—, los cuatro enlaces con su icono de `lucide-astro` (`LayoutDashboard` para Resumen, `ShoppingCart` para Ventas, `Package` para Paquetes, `Wallet` para Gastos) y el interruptor de tema al pie. La barra superior no se muestra.
- **Por debajo de 1024px:** la barra superior fija y el drawer lateral, con `initNavDrawer()`. El botón de menú y el nombre del producto viven en la barra superior; los cuatro enlaces se ven como fila horizontal de 768px a 1023px y dentro del drawer por debajo de 768px.
- **Por debajo de 768px, además:** la barra inferior de móvil (`BottomNav.astro`), descrita abajo. No reemplaza a la barra superior ni al drawer: se suma a lo que ya había.

`Nav.astro` define una sola vez el arreglo `links` —`{ id, label, href, icon }`, los cuatro destinos del armazón— y lo pasa a `BottomNav.astro` como prop. La barra lateral, la barra superior, el cajón y la barra inferior pintan entonces las mismas cuatro etiquetas y los mismos cuatro iconos; no hay una segunda lista de destinos que pueda divergir ni una segunda regla de activo. El activo lo decide `markActiveNav` (`src/lib/shell/nav-active.ts`) para los cuatro juegos a la vez, así que agregar la barra inferior no duplicó la lógica: agregó un juego a `LINK_SETS`.

El punto de corte es **1024px** en los dos lados. El drawer se autocierra en escritorio, así que su consulta de escritorio (`DESKTOP_QUERY` en `src/lib/shell/nav-drawer.ts`) usa exactamente `(min-width: 1024px)`. Si la barra lateral apareciera en un ancho y el drawer siguiera creyéndose móvil en ese mismo ancho, habría una franja sin navegación utilizable.

El interruptor de tema es un botón `[data-theme-toggle]` más. `initThemeToggle()` (en `src/lib/shell/theme-toggle.ts`) atiende **todos** los `[data-theme-toggle]` de la página, así que la barra superior de móvil y la barra lateral de escritorio cambian el tema a la vez y mantienen `aria-pressed` en sincronía. Las etiquetas `Modo claro` / `Modo oscuro` y los iconos se alternan por CSS a partir de `data-theme` en `<html>`, sin JavaScript.

### `BottomNav.astro`

La barra de navegación inferior de móvil. La importa y renderiza `Nav.astro`, que le pasa el mismo arreglo `links` de cuatro destinos que alimenta a la barra lateral. No la usa ninguna pantalla directamente y no reemplaza a ningún otro juego de enlaces.

| Prop | Tipo | Qué hace |
|------|------|----------|
| `links` | `readonly { id, label, href, icon }[]` | Los cuatro destinos del armazón, con su icono de `lucide-astro`. Los mismos que la barra lateral. |
| `activeSection` | `'summary' \| 'sales' \| 'packages' \| 'expenses'` | Marca el `<a>` activo con `aria-current="page"` en el primer pintado del servidor. |

Es un `<nav aria-label="Navegación inferior">` con un `<ul>` de **cinco columnas**: los cuatro destinos —cada uno con un `<a href>` real y al menos `var(--touch-min)` (44px) de alto— y, entre Ventas y Paquetes, una columna para el botón de acción. Lleva `no-print` y vive en el armazón, fuera de `[data-app-root]`: no se imprime y **no se remonta al cambiar de vista**, porque la navegación de la SPA sólo reemplaza el contenido (D-023). Es parte del armazón, no del contenido que se reemplaza.

**El botón de acción no es un quinto destino.** En la columna del medio vive un `<a href="/new">` circular con el icono `Plus`, `aria-label="Registrar venta o gasto"` y `data-astro-prefetch`, pintado con `--m3-primary` / `--m3-on-primary` —los mismos colores del botón primario, no un color nuevo—. Mide `60px`, lleva un glifo `Plus` de `26px` con `stroke-width` `2.4` y se levanta `18px` por encima del borde superior de la barra: su borde inferior queda dentro de ella, así que se lee levantado y apoyado a la vez. **No lleva la clase `bottom-nav-link`**: por eso `nav-active.ts` y su `LINK_SETS` lo ignoran y no puede quedar activo. Las columnas de los cuatro destinos conservan su orden y su mínimo táctil de 44px, así que el círculo queda centrado justo entre Ventas y Paquetes. Existe solo dentro de la barra, de modo que es móvil por construcción y no hay que agregarlo a ninguna otra superficie.

**Flota; no es un hueco.** El círculo se separa de la barra con dos cosas: un anillo fino de `2px` en `--m3-surface-container-lowest` —el color de la propia barra, así que sigue el tema— y `box-shadow: var(--shadow-overlay)`. Antes el anillo medía `4px` y, al ser del mismo color que la superficie, el círculo se leía como un agujero perforado en la barra. `--shadow-overlay` es la única sombra del sistema y está reservada a los overlays: un botón que flota sobre la barra es exactamente ese caso. El botón responde al toque con un `:active` de 2px hacia abajo (`transform: translate(-50%, 2px)`, la misma curva `--ease-out` del archivo) y conserva el anillo de foco de `--accent`, como todo lo interactivo del armazón. En oscuro `--m3-primary` se voltea a claro, así que el círculo claro sobre la barra oscura mantiene el contraste.

**Por qué una barra inferior y no tocar las que ya había.** La dueña navega el panel desde el teléfono, y ahí el cajón obliga a abrir un menú para cambiar de sección. La barra inferior pone los cuatro destinos a un toque, con el pulgar, sin menú intermedio. La condición es que sea **aditiva**: la barra lateral, la barra superior y el cajón siguen exactamente como estaban, y la barra inferior solo existe por debajo de 768px. El corte es el mismo que usa el resto del armazón móvil, no uno nuevo.

El alto de la barra vive en el token `--shell-bottom-bar` de `global.css`, que vale `0px` fuera de móvil y el mínimo táctil más su relleno por debajo de 768px. El contenido móvil lo reserva en su relleno inferior (`Layout.astro`), de modo que la última fila de un listado no queda debajo de la barra fija. El `padding-block-end` de la barra suma `--safe-bottom` (`env(safe-area-inset-bottom)`) para no chocar con el indicador de inicio de iOS.

### Los tres estados de una lista ya no son un componente

`TableState.astro` existió hasta T6 y se retiró cuando las vistas se mudaron a `components/views/`: el estado de carga es hoy un **esqueleto** (la primitiva `.skeleton` de `src/styles/skeleton.css`) y el vacío y el error los pinta `createListStatePainter` (`src/lib/lists/list-state.ts`), que clona la fila de estado dentro del tbody. Queda escrito acá para que nadie lo busque: no hay un `.astro` de estados y el criterio de D-023 es que la pieza compartida es la primitiva, no un componente que la envuelva.

### `StatCard.astro`

Una tarjeta del dashboard. Se usa cuatro veces en `/`.

| Prop | Tipo | Qué muestra |
|------|------|-------------|
| `label` | `string` | "Total de ingresos" |
| `value` | `string` | La cifra ya formateada por `formatMoney`, o el conteo como texto |
| `hint` | `string` | El texto de apoyo que define qué incluye el número |
| `tone` | `'default' \| 'success' \| 'warning' \| 'danger'` | El color del ícono, nunca el de la cifra |
| `icon` | `string` | Nombre del ícono de `lucide-astro` |

El `hint` **no es opcional**. Es la línea que evita que la dueña lea un número sin contexto, y es donde vive la explicación de D-007 y D-008: "registrados y no eliminados" en la tarjeta de paquetes, "incluidas las pendientes y sin las canceladas" en la de ingresos.

La cifra va en `--text-primary` con peso 650 y `font-variant-numeric: tabular-nums`, para que las cuatro cifras de la fila se alineen por su derecha y se puedan comparar de un vistazo. `tabular-nums` sobre texto de 40 píxeles es la diferencia entre una fila de números y cuatro cajas de ancho distinto.

### `DateRangeFilter.astro`

La barra de fechas de las cuatro pantallas con datos (S34): resumen, ventas, paquetes y gastos. Es un **`<select>`** (S36) con cuatro opciones —**«Hoy»**, **«Últimos 7 días»**, **«Último mes»** y **«Personalizado»**— y los dos campos de fecha cuando el rango es personalizado. **«Último mes» son treinta días contados desde hoy**, no un mes de calendario: así la ventana no cambia de tamaño según el día (S53). Sin fechas en la URL el valor por defecto es **Hoy**.

| Prop | Tipo | Qué hace |
|------|------|----------|
| `action` | `string` | La URL del `GET` en la variante `form` |
| `variant` | `"form" \| "fields"` | `form` (por defecto): el componente es el `<form>`, como en el resumen. `fields`: solo los campos, para incrustarse en la barra de herramientas de cada tabla, junto al botón «Filtros» que pliega el resto (S40) |
| `initialStart` · `initialEnd` | `string` | Valores iniciales, en `YYYY-MM-DD` |

**Los tres presets y sus rangos viven en `lib/lists/date-presets.ts`**, no en el componente: `Hoy` es un solo día y `Últimos 7 días` es la misma ventana que usa el resumen (`lastDaysRange`, hoy incluido y seis anteriores), así que las cuatro pantallas no pueden calcular días distintos. Elegir un preset escribe `start_date` y `end_date` y envía el formulario; elegir «Personalizado» revela los dos campos y lleva el foco a «Desde».

**No hay botón de envío ni «Limpiar» en el resumen** (S38): el formulario sigue existiendo para el envío programático, y cualquier cambio de un control filtra al instante (`wireAutoFilter`). En las tablas el botón «Filtrar» también se retiró y «Limpiar» se quedó.

**Sin fechas en la URL la pantalla usa hoy** (S36): el rango vacío se resuelve a hoy en `resolveDateRange`, y los cuatro lectores de filtros lo aplican, así el select y la consulta no pueden decir cosas distintas. Elegir «Personalizado» muestra los dos campos **ya completos con el rango vigente**, de modo que enviar sin editarlos no pierde el filtro. El rango sigue viajando en la URL, compartible y con el botón atrás del navegador funcionando. En las tablas el control se incrusta en el mismo `<form method="get">` de la fila, así el envío conserva canal, estado, condición y vencidas.

No hay `min` ni `max` cruzados entre los dos campos. Se permite el rango invertido, y la API responde con ceros; la interfaz lo detecta y avisa con el texto de apoyo "Sin datos en el rango seleccionado".

### `StatusBadge.astro`

La insignia de estado de una venta.

| Prop | Tipo | Qué hace |
|------|------|----------|
| `status` | `'pending' \| 'completed' \| 'cancelled'` | Decide el color |

```astro
<span class={`badge badge--${status}`}>{label}</span>
```

| Estado | Color | Etiqueta |
|--------|-------|----------|
| `pending` | `--warning` | Pendiente |
| `completed` | `--success` | Completada |
| `cancelled` | `--danger` | Anulada |

En el listado de ventas la insignia se sustituye por un `<select>` porque el estado se cambia en línea. El componente se usa solo en la factura, a través de `InvoicePrint.astro`.

### `ConfirmDialog.astro`

Un `<dialog>` nativo, no una superposición hecha a mano.

| Prop | Tipo | Qué hace |
|------|------|----------|
| `message` | `string` | El texto de confirmación |
| `actionLabel` | `string` | "Eliminar" |
| `onConfirm` | JavaScript | No es una prop: el `dialog` se abre desde el script de cada pantalla con `showModal()` |

`showModal()` da el foco al botón, cierra con `Escape` y pone `inert` al resto de la página sin una línea de código. Es la razón de usar un elemento nativo en lugar de un `div` con `position: fixed`.

Lo usa la pantalla de clientes para confirmar el borrado (`await dialog.showConfirm()` resuelve `true` al confirmar), con el mensaje escrito en el momento porque el diálogo es uno solo para cualquier cliente. Reemplaza a `window.confirm`, que bloquea el hilo y no se puede estilar.

El diálogo es la **única** capa superpuesta del panel, y por eso es la única que lleva sombra: `0 8px 30px rgba(0,0,0,0.08)`, el valor que el skill reserva para overlays.

Desde S20/S21 comparte la geometría de todos los modales (`global.css`): hoja anclada al borde derecho que entra deslizando de derecha a izquierda sobre un velo que se desvanece (220 ms, `ease-out`), `100dvh` de alto con scroll interno, y sin transformación cuando el sistema pide `prefers-reduced-motion: reduce`. Los otros dos son el overlay de estado/pago del listado de ventas y los diálogos de la pantalla de clientes; la animación y la altura viven en `global.css` para que no puedan divergir.

### `InvoicePrint.astro`

El documento de factura de la decisión D-009.

| Prop | Tipo | Qué muestra |
|------|------|----------|
| `sale` | `ISaleResponse \| null` | Los datos de la venta a facturar; `null` deja vacíos todos los ganchos |
| `visible` | `boolean` | Si el contenedor sale con la clase `invoice--visible` |

La pantalla del detalle (`/sales/detail?id=<uuid>`, D-017) monta el componente **vacío**, con `sale={null}`. La venta la trae el cliente y `renderSaleDetail` (de `src/lib/sales/sale-detail.ts`) la escribe por los ganchos `data-invoice-*` que el componente emite —número, fecha, cliente, mercadería, canal, pago, badge de estado, renglones de mercadería, renglones adicionales y total— y agrega la clase `invoice--visible`. El componente conserva la prop `sale` (opcional) para que el servidor pueda prellenarlo, pero hoy el único uso real lo llena desde el navegador.

En pantalla vive en el flujo normal dentro de la página de detalle. El botón "Imprimir" de `/sales/detail` llama a `window.print()`; con `?print=1`, el script del detalle imprime solo una vez que la venta está pintada. La presentación overlay (fixed, full-screen) dejó de utilizarse tras la navegación directa a la página de detalle. La estructura del documento: datos de la tienda arriba a la izquierda, número y fecha de la venta a la derecha, tabla de artículos con el coste principal y los artículos adicionales, total al pie. En pantalla usa los tokens; en impresión, `02-design.md` define el bloque `@media print` que lo convierte en un documento blanco y negro.

## Primitivas de CSS

Cuatro clases globales definidas en `05-estilado.md`, no componentes. Son reglas de una línea que se usan en más de tres pantallas y que no vale la pena convertir en componente.

| Clase | Qué hace | Dónde |
|-------|-----------|-------|
| `.btn` `.btn-primary` `.btn-secondary` `.btn-sm` | Los cuatro estados de un botón | Las ocho pantallas |
| `.card` | Superficie elevada con borde de un píxel | Dashboard, facturas, paneles |
| `.section-label` | Etiqueta en versalitas de 12px | Una por pantalla |
| `.badge` `.badge--pending` `.badge--completed` `.badge--cancelled` | Las tres insignias de estado | Listado de ventas, factura |
| `.data-table` | Tabla densa con reglas de un píxel y sin resortes | Los tres listados |
| `.form-grid` | Rejilla de dos columnas para los formularios | Los tres formularios |
| `.field` | Etiqueta, control y mensaje de error de un campo | Los tres formularios |
| `.toast` | Mensaje flotante de confirmación o de error | Todas las pantallas con escritura |
| `.empty-state` | Estado vacío con ícono, texto y enlace | Los tres listados |
| `.form-head` `.form-back` `.link-back` `.form-title` `.form-head-icon` `.form-card` | El armazón de un formulario de pantalla completa: encabezado, enlace de regreso, título y tarjeta | Los dos formularios de pantalla completa (`/sales/new` y `/expenses/new`); viven en `src/styles/forms.css` |

## Lo que no existe como componente

| Lo que no existe | Por qué |
|------------------|---------|
| Un `<Button.astro>` genérico | Un componente que solo envuelve un `<button>` y una clase no aporta nada. Se escribe `<button class="btn btn-primary">`. |
| Una tabla genérica parametrizada por columnas | Cada listado tiene columnas distintas y lógica de renderizado distinta. Una tabla configurable por props es un framework con menos funciones. |
| Un modal genérico | Hay un solo diálogo, con un solo propósito. |
| Un cliente de datos con reintento y caché | Ver `01-arquitectura.md`. |
| Un componente de formulario | Los tres formularios comparten `.form-grid` y `.field`, que es CSS. Compartir el HTML entre tres formularios con campos distintos exige props para cada campo, y el resultado es más difícil de leer que los tres formularios a mano. |

## El límite de los `<script>` de Astro

Astro extrae los `<script>` de cada `.astro` a un bundle por página, los deduplica y los ejecuta una sola vez. Tres consecuencias prácticas:

1. **Un `<script>` en `Layout.astro` se ejecuta en las siete páginas.** Por eso el de la barra lateral vive ahí y el de la tabla de ventas no.
2. **Dos páginas con el mismo script comparten el bundle.** Las cuatro pantallas con filtro de fechas pueden importar la misma función desde `src/lib/`.
3. **El script no puede usar variables del frontmatter.** Lo que el frontmatter calcula pasa al DOM por `data-*`, y el script lo lee. Es la frontera entre el mundo de Astro y el del navegador, y hay que respetarla.

En TypeScript, un `<script>` dentro de un `.astro` no hereda los tipos del frontmatter. Por eso los scripts se escriben con `document.querySelector<T>` explícito, o con los helpers de `dom.ts` que ya devuelven el tipo genérico.
