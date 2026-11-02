# Estilado

## Una hoja global, CSS por vista

Astro permite estilos globales y de scope por componente. La decisión es: **los tokens y las primitivas son globales; el layout específico de cada pantalla vive en la hoja de su vista**, junto a su markup en `components/views/` (D-023).

| Dónde | Qué contiene | Por qué |
|-------|--------------|---------|
| `src/styles/global.css`, importado por `Layout.astro` | `:root` con los tokens, `reset` mínimo, primitivas (`.btn`, `.card`, `.badge`, `.data-table`, `.form-grid`, `.field`, `.toast`, `.empty-state`, `.section-label`) y foco global | Es lo que las nueve vistas comparten. Va en un archivo, no disperso en nueve hojas. |
| `src/styles/print.css`, importado por `Layout.astro` | El `@page` y todo el `@media print`: `.no-print`, el desplazamiento de `.shell-body` y las reglas de la factura | La factura se imprime desde la vista de detalle, y el estilo scopeado no alcanza a un nodo que el script del navegador muestra por clase. |
| `src/styles/skeleton.css`, importado por `Layout.astro` | La primitiva `.skeleton` con su shimmer, `aria-busy` y el apagado bajo `prefers-reduced-motion` | La usan las cuatro listas, los KPIs, los gráficos, el detalle y los formularios: si viviera en una hoja de vista, las demás la copiarían. |
| `components/views/<Vista>View.astro` + su hoja (`sales.css`, `packages.css`, …) | La rejilla de esa vista, sus columnas, su formulario, lo que no se repite | Viaja con la vista que la usa: nadie más la lee —el documento es uno solo— y nadie más la puede romper. |
| `global.css` | Los tokens de color del sistema y, con ellos, `--shell-sidebar` y `--shell-top-offset`. | Rara vez. |
| `<style is:global>` de `Layout.astro` | Solo el shell: el desplazamiento de `.shell-body` y el comportamiento en móvil | Es global porque el shell es un único documento, no una hoja por ruta. |
| `src/styles/filters.css`, importado por `Layout.astro` junto a `global.css` y `print.css` | La barra de filtros de las pantallas de listado: `.filter-bar`, `.filter-row`, `.filter-row--collapsible`, `.filter-toolbar`, `.filter-toggle` (con su chevron y su foco), `.filter-count`, `.filter-panel`, `.filter-fields`, `.field`, `.field--date`, `.field--select`, `.field-label`, `.field-input` y `.btn-filter` | Es el mismo componente en Ventas, Paquetes y Gastos. Estaba duplicado en las tres hojas de pantalla y dos de ellas ya habían divergido; con una sola copia no pueden volver a separarse. |
| `src/styles/forms.css`, importado por `Layout.astro` junto a `global.css`, `filters.css` y `print.css` | El armazón de los formularios de pantalla completa y la caja de sus campos: `.form-head`, `.form-back`, `.link-back`, `.form-title`, `.form-head-icon`, `.form-card`, `.control` y `.form-card .input` (con `textarea` y `select`) más sus modificadores (`.input-icon`, `.control-prefix`, `.input-prefix`, `.input-money`, `.input-select`, `.select-chevron`) y el estado de error | Es el mismo en `/sales/new` y `/expenses/new`. Estaba escrito dos veces —`.form-head`/`.panel` en la hoja de venta y `.page-head`/`.form-card` en la de gasto— y ya habían divergido: el enlace de regreso tenía otro tamaño, el título caía cuarenta píxeles más abajo y la tarjeta de gasto se había quedado sin borde. La caja de los campos siguió el mismo camino: gasto tenía la caja «rellena» (sin borde, superficie suave) y venta seguía la primitiva global (borde, fondo elevado), así que los dos formularios no se leían como la misma familia. Con una sola copia no pueden volver a separarse, por la misma razón que `filters.css`. |
| `src/components/views/summary.css`, importada por `SummaryView.astro` | El estilo del resumen que el `<style>` de un componente no puede gobernar: la leyenda del donut (`.donut-chart__legend` y sus renglones) y la disposición donut + leyenda | Su marcado lo inyecta JavaScript (`renderDonutChart`), y un `<style>` scopeado de componente nunca alcanza a un nodo inyectado. |

No hay CSS-in-JS, no hay `class` generada, no hay un archivo de estilos por componente. La razón es la misma que en el resto del módulo: la versión 1 no tiene suficientes repeticiones para justificar una abstracción, y cada capa de indirección en el estilo es un lugar más donde un token queda sin usar.

`forms.css` es la excepción que confirma la regla: gobierna **solo lo que los dos formularios de pantalla completa comparten** —el armazón (el encabezado con su enlace de regreso, el título y la tarjeta) y la caja de los campos (el fondo relleno, el radio, la tipografía, el lugar del ícono y del prefijo `C$` y los estados de foco y error)—, y nada más. La rejilla de `/sales/new` y sus bloques «La venta», «Cobro» y «Resumen» siguen en `components/views/sale-new.css`; los contadores, el `field-row`, el mínimo del área de texto y el aviso de `/expenses/new` siguen en `components/views/expense-new.css`. El corte es lo que se repite, no lo que se parece.

## El estilo de los gráficos inyectados

`renderDonutChart` y `renderBarChart` (`src/lib/summary/`) escriben el marcado de los gráficos con `container.innerHTML` dentro de `SummaryView.astro`. Ese marcado no existe cuando Astro compila el CSS y no lleva el `data-astro-cid-*` con el que se scopea el `<style>` de un componente, así que las reglas del donut viven en `src/components/views/summary.css` —la hoja de esa vista, importada desde su componente— y no en `DonutChart.astro`. Es la misma razón por la que el `@media print` de la factura es global: el estilo scopeado no alcanza a un nodo que escribe el navegador.

La leyenda del donut es el caso que dejó el problema a la vista. El módulo ya escribe buena parte de su aspecto en línea y deja la leyenda con `max-width: 280px`, así que sin una regla que lo revierta la leyenda no usa el ancho de la tarjeta y el `<style>` de `DonutChart.astro` nunca podía corregirlo. En `summary.css` la leyenda es `width: 100%` con `max-width: none !important`, sin marcadores de lista (`list-style: none` y `padding: 0` en el `ul`; el `padding-inline-start` del agente de usuario sangraba los renglones 40px y los angostaba), y cada `.donut-chart__legend-item` es una fila de ancho completo (`display: flex`, `align-items: center`, `justify-content: space-between`) con la etiqueta y su conteo apilados a la izquierda y la celda de dinero a la derecha, alineada a la derecha y sin saltar de línea. Desde **640px** el donut y la leyenda van en fila y la leyenda toma el resto: `flex: 1 1 auto; min-inline-size: 0`.

Donde el valor ya viaja en línea, la regla usa `!important`, porque un estilo en línea solo cede ante un `!important` de la hoja; es el caso de `max-width` en la leyenda y de `flex-direction` del contenedor (el módulo lo fija en `column`). El resto de las propiedades coincide con el valor que el módulo ya escribe y no lo necesita. Solo tokens: ningún hex, ningún color nuevo, y el aspecto de cada renglón es el mismo de antes; lo que cambia es que por fin ocupa la tarjeta.

## El archivo global

Los tokens viven en `src/styles/global.css`. Los roles canónicos se declaran dos veces —en `:root, :root[data-theme="light"]` y en `:root[data-theme="dark"]`— y son los de la tabla de `02-design.md`, más cuatro radios idénticos en los dos temas: `--radius-sm: 6px`, `--radius-md: 8px`, `--radius-lg: 12px`, `--radius-pill: 999px`.

Todo lo demás es una capa de alias sin tema: los nombres heredados (`--bg-*`, `--border*`, `--text-*`, `--r-*`, `--shadow-*`, `--overlay`) y los `--m3-*` se declaran una sola vez en `:root` apuntando a un rol canónico, así que siguen el tema solos.

El cromo es neutro. `--m3-primary` apunta a `--ink`, de modo que botones, chips, filas activas y controles de página actual se pintan en neutro sin tocar ninguna pantalla. El acento `--accent` sobrevive **solo** en dos excepciones escritas: los anillos de foco (`:focus` / `:focus-visible`) y el color de los enlaces de contenido. Y hay una sola sombra, `--shadow-overlay`; `--shadow-card`, `--shadow-raised` y los `--m3-shadow-*` que no son overlay apuntan a `none`.

El armazón declara además tres tokens de estructura, al lado de `--m3-header-h` en `global.css`: `--shell-sidebar: 232px`, el ancho de la barra lateral fija; `--shell-top-offset`, que resuelve a `var(--m3-header-h)` por debajo de 1024px y a `0px` a partir de ahí; y `--shell-bottom-bar`, que vale `0px` fuera de móvil y el mínimo táctil más su relleno por debajo de 768px. El propio `.shell-main` del armazón compensa la barra superior con `var(--shell-top-offset)` y la barra inferior con `var(--shell-bottom-bar)` en su relleno inferior, de modo que cada página se compensa una sola vez y en un solo lugar, y el relleno desaparece en escritorio.

```css
/* src/styles/global.css */

/* 1. Tokens: roles canónicos, capa de alias y escalas */
:root, :root[data-theme="light"] { /* ...ver 02-design.md... */ }
:root[data-theme="dark"] { /* ...ver 02-design.md... */ }
:root { /* alias y escalas, sin tema */ }

/* 2. Reset deliberado, no un reset de librería */
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-body);
  line-height: var(--leading-relaxed);
  -webkit-font-smoothing: antialiased;
}

/* 3. Foco visible: regla global e innegociable */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

/* 4. Primitivas */
.btn { display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 24px; border-radius: var(--r-md);
  font-size: var(--text-sm); font-weight: 550; cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out),
              color var(--dur-fast) var(--ease-out); }
.btn-primary { background: var(--m3-primary); color: var(--m3-on-primary); border: 1px solid var(--m3-primary); }
.btn-primary:hover { background: color-mix(in srgb, var(--m3-primary) 90%, var(--m3-on-primary)); border-color: color-mix(in srgb, var(--m3-primary) 90%, var(--m3-on-primary)); }
.btn-secondary { background: transparent; color: var(--text-primary);
  border: 1px solid var(--border-strong); }
.btn-secondary:hover { border-color: var(--text-primary); }
.btn-sm { padding: 8px 16px; font-size: 13px; }

.card { background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: var(--r-md); }
.card:hover { border-color: var(--border-strong); }

.data-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.data-table th { text-align: left; font-weight: 600; color: var(--text-faint);
  font-size: var(--text-label); letter-spacing: 0.12em; text-transform: uppercase;
  padding: 12px 16px; border-bottom: 1px solid var(--border-strong); }
.data-table td { padding: 12px 16px; border-bottom: 1px solid var(--border);
  color: var(--text-muted); }
.data-table tr:last-child td { border-bottom: none; }
.data-table .num { text-align: right; font-variant-numeric: tabular-nums;
  color: var(--text-primary); }

.badge { display: inline-block; padding: 4px 8px; border-radius: var(--r-sm);
  font-size: var(--text-label); font-weight: 600; }
.badge--pending   { color: var(--warning); background: var(--warning-surface); }
.badge--completed { color: var(--success); background: var(--success-surface); }
.badge--cancelled { color: var(--danger);  background: var(--danger-surface); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

## El orden de las reglas

Cuatro bloques, siempre en el mismo orden, en cada `<style>` de pantalla:

1. **Rejilla.** La disposición de la pantalla: qué va en columnas, cuántas, con qué separación. Es la primera regla porque es la que define la forma.
2. **Elementos.** Cada bloque de la pantalla: la tarjeta, la tabla, el formulario, la factura.
3. **Estados.** `.is-loading`, `.is-empty`, `.is-error`, `.field--error`, los `[hidden]`. Lo que se ve cuando algo no salió bien.
4. **Impresión.** Solo donde aplica: la factura de `/sales`. Va al final y solo dentro de `@media print`.

## Detalles de cada primitiva

### `.data-table` — densidad sin resortes

| Regla | Detalle |
|-------|---------|
| Cabecera | 12px en versalitas, `--text-faint`, `letter-spacing: 0.12em` |
| Celdas | 14px, `--text-muted`, `padding: 12px 16px` |
| Separación | Una línea de 1px en `--border` entre filas, `--border-strong` bajo la cabecera |
| Cifras | `.num` con `text-align: right` y `font-variant-numeric: tabular-nums` |
| Hover de fila | `background: var(--bg-inset)`, transición de 150ms |
| Zebra | **Ninguno.** El borde de un píxel ya separa las filas, y la zebra es un segundo sistema de separación |
| Bordes verticales | **Ninguno.** Solo el de abajo |

`tabular-nums` no es un detalle estético: sin él, la columna de importes tiene cada cifra con un ancho distinto y la tabla "bailona" al desplazar. Es la diferencia entre una columna de números y una columna de cajas.

### `.form-grid` — dos columnas, una excepción

Dos columnas en escritorio, una en móvil. La separación vertical entre campos es 20px, la horizontal 24px.

La excepción: los campos de ancho completo (el nombre de la venta de WhatsApp cuando hay artículos, la descripción de un gasto) ocupan las dos columnas con `grid-column: 1 / -1`. El ancho completo no es una excepción del grid, es una excepción de la regla: los campos cortos van en pareja, los largos ocupan la fila.

Cada campo es un `.field`:

```css
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: var(--text-label); font-weight: 600; color: var(--text-muted); }
.field input, .field select {
  padding: 10px 12px; border: 1px solid var(--border);
  border-radius: var(--r-sm); font-size: var(--text-sm);
  background: var(--bg-elevated); color: var(--text-primary);
}
.field input::placeholder { color: var(--text-faint); }
.field--error input { border-color: var(--danger); }
.field .error { color: var(--danger); font-size: var(--text-label); }
```

El `color: var(--text-primary)` del `input` es obligatorio: el `placeholder` puede ser `--text-faint`, pero el valor escrito es siempre `--text-primary`. La regla del skill sobre `--text-faint` es explícita en esto.

**La marca de campo obligatorio la dicta el atributo `required`, no el marcado.** El asterisco sale de `.field:has([required]) > .field-label::after`, y el encabezado del formulario lo explica una sola vez con `.form-legend`:

```css
.field:has([required]) > .field-label::after,
.field[data-required] > .field-label::after,
.form-legend::before { content: "*"; color: var(--danger); }
.field:has([required]) > .field-label::after,
.field[data-required] > .field-label::after { margin-inline-start: 2px; }
.form-legend::before { margin-inline-end: 4px; }
```

Agregarle `required` a un campo nuevo le pone el asterisco solo, y el banco emisor lo hereda cuando el cobro pasa a tarjeta. La alternativa —una lista de rótulos marcados a mano— se desincroniza la primera vez que alguien valida un campo nuevo en el servidor y se olvida del rótulo. El asterisco es decorativo: lo que un lector de pantalla anuncia es el `required` del control.

El grupo de categorías es la excepción que la regla admite sin una segunda lista: poner `required` en un checkbox volvería obligatorio **ese** chip, así que el `<fieldset>` declara `data-required` y la misma regla lo pinta. El atributo no valida nada —la regla de «al menos una» vive en el submit y, de fondo, en el DTO—; solo dice «este grupo se marca», que es lo que la regla lee.

### Los campos de los formularios de pantalla completa

Los campos de `/sales/new` y `/expenses/new` son la misma caja. La regla vive en `forms.css` y va prefijada con `.form-card` a propósito: `global.css` pinta todos los controles de la app —la barra de filtros de los listados usa la misma primitiva— y un `.input` suelto cambiaría pantallas que no tienen que ver con estos formularios. `.form-card` solo existe en estas dos pantallas, así que el estilo no puede escaparse.

```css
/* src/styles/forms.css */
.form-card .input, .form-card textarea, .form-card select {
  inline-size: 100%;
  padding-inline: var(--m3-space-md);
  border: 0;
  border-radius: var(--m3-r-lg);
  background: var(--m3-surface-container-low);
  box-shadow: var(--m3-shadow-sm);
  font-size: var(--m3-fs-body-md);
  color: var(--m3-on-surface);
  transition: background-color var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-fast) var(--ease-out);
}
.form-card .input::placeholder { color: var(--m3-outline); }
.form-card .input:hover { background: var(--m3-surface-container); }
.form-card .input:focus {
  outline: none;
  background: var(--m3-surface-container-lowest);
  box-shadow: inset 0 0 0 2px var(--accent);
}
.form-card .input:not(.textarea), .form-card select { min-height: var(--touch-min); }
.form-card .field-error .input {
  background: var(--m3-error-container);
  box-shadow: inset 0 0 0 2px var(--m3-error);
}
```

La caja no lleva borde: la separa del fondo la superficie `--m3-surface-container-low` y el radio `--m3-r-lg`. En foco se aclara (`--m3-surface-container-lowest`) y cambia el borde por un anillo interior de 2px en `--accent`, el acento reservado al foco en todo el sistema; en error, el fondo pasa a `--m3-error-container` y el anillo al `--m3-error`. Como `--m3-shadow-sm` vale `none`, la caja no lleva sombra: el relieve no es del sistema.

**El alto mínimo es `var(--touch-min)` —44px— y no `height`.** La hoja de gasto fijaba `height: 2.5rem` (40px) y quedaba por debajo del mínimo documentado para todo control interactivo; con `min-height` los dos formularios asientan a la misma altura y el campo puede crecer con su contenido. El área de texto queda afuera de esa regla: crece sola y su mínimo propio (6.5rem) vive en `expenses/new.css`.

La geometría que los modificadores necesitan también es compartida: `.control` (`position: relative; display: flex; align-items: center`), `.control-icon` y `.select-chevron` en `position: absolute` para superponerse al campo, `.input-icon`/`.input-prefix` reservando el arranque del texto, y `.control-prefix` como el `C$` en negrita a la izquierda. Así un ícono o el prefijo quedan centrados dentro de la caja en las dos pantallas.

El `<select>` del banco emisor de `/sales/new` (04-screens.md §3) es el primer campo que usa `.input-select` —`appearance: none` para borrar la flecha nativa— junto al `.select-chevron` compartido: la lista cerrada de bancos no trae un select con estilo propio, sino el mismo armazón de caja con el `Landmark` del `.control-icon` y la flecha del sistema.

### Los chips de selección múltiple

El campo de categorías de `/sales/new` es un grupo de chips: un `<label class="category-chip">` por valor, cada uno con su checkbox nativo. El chip es un control, no una etiqueta, así que hereda el blanco táctil del sistema (`min-height: var(--touch-min)`) y el estado seleccionado usa **los mismos tokens que la opción de pago activa** —borde `--text-primary` y fondo `--surface-active`—: un solo lenguaje de selección en el formulario, sin colores nuevos ni sombras.

```css
/* src/components/views/sale-new.css */
.category-chip {
  display: inline-flex; align-items: center; gap: var(--space-2);
  min-height: var(--touch-min); padding-inline: var(--space-4);
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--bg-elevated);
}
.category-chip:has(.category-check:checked) {
  border-color: var(--text-primary); background: var(--surface-active);
}
.category-chip:has(.category-check:focus-visible) {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
```

El estado sale de `:has(:checked)`, no de una clase que JavaScript tenga que sincronizar, y el foco se pinta en el chip entero y no en el checkbox de 1rem: un anillo de 2px alrededor de un cuadrado de 16px no se ve. Los chips envuelven en varias filas (`flex-wrap`), así el campo no pide una medida fija y funciona igual a 390px que a 1440px. En error, el borde de los cuatro chips pasa a `--m3-error` y el mensaje se pinta dentro del campo, junto al grupo.

### `.toast` — confirmación efímera

```css
.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  padding: 12px 24px; border-radius: var(--r-md);
  background: var(--bg-elevated); border: 1px solid var(--border);
  color: var(--text-primary); font-size: var(--text-sm);
  box-shadow: var(--shadow-overlay);
  opacity: 0; pointer-events: none;
  transition: opacity var(--dur-base) var(--ease-out);
}
.toast--visible { opacity: 1; }
.toast--error { color: var(--danger); border-color: var(--danger); }
.toast--success { color: var(--success); }
```

Aparece con `opacity` de 0 a 1 en 220ms, espera 3 segundos y desaparece. Es la única capa flotante aparte del diálogo, y lleva sombra por la misma razón que el diálogo: es un overlay.

Por debajo de 768px el aviso sube a `calc(var(--shell-bottom-bar) + var(--m3-space-lg))`: la barra inferior ocupa el borde de abajo y, sin ese corrimiento, la notificación quedaba apoyada sobre las pestañas —justo encima de lo que la dueña acaba de tocar—. Las tres pantallas que lo muestran (Ventas, Paquetes y Gastos) llevan el mismo corrimiento en su propia hoja, porque cada una ya fijaba su `bottom`.

El `box-shadow` es el valor único que el sistema reserva a los overlays (`--shadow-overlay`), y una notificación temporal es exactamente eso. El token resuelve a `0 8px 30px rgba(0,0,0,.18)` en claro y `.55` en oscuro. No hay sombra en ninguna tarjeta, en ninguna tabla y en ningún botón: `--shadow-card`, `--shadow-raised` y `--m3-shadow-sm` valen `none`.

### `.empty-state` — el estado vacío como invitación

```css
.empty-state { text-align: center; padding: 64px 24px; color: var(--text-muted); }
.empty-state svg { color: var(--m3-on-surface-variant); margin-bottom: 16px; }
.empty-state a { color: var(--accent); }
```

Un ícono de 32px en `--ink-2`, el mensaje, y el enlace de creación. El ícono es la ilustración del estado vacío; el único elemento en `--accent` de la pantalla vacía es el enlace, igual que en el resto del sistema.

## Reglas de impresión

Solo la factura del detalle de venta (`/sales/detail`) imprime. El bloque completo está en `02-design.md`; aquí va el criterio de aplicación:

| Regla | Dónde vive |
|-------|-----------|
| `@media print` en `src/styles/print.css`, importado por `Layout.astro` | La factura se imprime desde la vista `sale-detail`, y sus reglas son globales porque el estilo scopeado no alcanza al nodo que el script muestra por clase |
| `body .no-print { display: none }` | Global, en `src/styles/print.css`. La barra lateral y la barra superior llevan `no-print`: el armazón no imprime |
| `body .shell-body { margin-inline-start: 0 }` | Global. Sin esto la factura imprimiría desplazada por el hueco de la barra lateral |
| `position: static` en `.invoice` al imprimir | Global. Sin esto el documento se sale de la página |

La factura vive en un componente (`InvoicePrint.astro`) pero sus reglas de impresión son globales. Es la excepción donde la reutilización gana: si el bloque `@media print` estuviera en el `<style>` del componente, dejaría de aplicarse cuando Astro lo extrae, porque el estilo scopeado no alcanza a un elemento que el script del navegador muestra por `class`.

## Responsive

| Punto de corte | Cambio |
|----------------|--------|
| ≥ 1024px | Barra lateral fija de 232px (`--shell-sidebar`) y **sin barra superior**. `.shell-body` se desplaza con `margin-inline-start: var(--shell-sidebar)` y `--shell-top-offset` vale `0px`. Rejilla del dashboard en dos columnas, formularios en dos columnas |
| 768–1023px | Barra superior fija con los cuatro enlaces horizontales y el nombre del producto (`topbar-brand`). Sin barra lateral. Dashboard en dos columnas, formularios en dos columnas |
| < 768px | Barra superior con el botón de menú y el nombre del producto: los cuatro enlaces viven en el drawer lateral, **y una barra inferior fija (`BottomNav.astro`) con los mismos cuatro destinos** a un toque. El contenido móvil reserva el alto de la barra (`--shell-bottom-bar`) en su relleno inferior. Dashboard en una columna, formularios en una columna, tablas con desplazamiento horizontal (`overflow-x: auto`) |

El punto de corte es **1024px** y es el mismo valor en la hoja de la barra lateral (`.shell-sidebar`) y en la consulta `DESKTOP_QUERY` de `src/lib/shell/nav-drawer.ts`. El drawer se autocierra en escritorio; si la barra lateral apareciera antes que ese corte, o si el drawer siguiera creyéndose móvil por debajo de él, habría un rango de anchos sin navegación. Por eso los dos valores no pueden divergir.

**El relleno horizontal baja de 32px a 16px en móvil**, y el relleno vertical de las secciones baja de 48px a 32px. Nunca se elimina el espacio en blanco: es el estilo.

El objetivo táctil mínimo es 44px en todo lo interactivo, y el radio `--r-md` se mantiene constante entre puntos de corte. Una tabla que se desplaza horizontalmente en móvil es preferible a una que se comprime hasta que los importes no se leen.

## El relleno superior del armazón y el radio del resumen

El relleno superior de la página lo declara **el armazón**, una sola vez y en un solo lugar: `.shell-main` en `Layout.astro` usa `padding-block-start: calc(var(--shell-top-offset) + var(--m3-space-xl))`. Así el `--shell-top-offset` compensa la barra superior cuando existe y, cuando no, queda el `var(--m3-space-xl)` de margen real. Ninguna hoja de pantalla vuelve a declararlo: la que lo duplicaba (`expenses/new.css`) ya no lo tiene, porque el doble conteo daba 48px. El `min-height: calc(100vh - var(--shell-top-offset))` también es del armazón, no de las páginas.

La pantalla de resumen pide, además, **un solo radio de 6px**, y lo recibe de `--radius-sm`: las tarjetas KPI, las tarjetas de gráfico, el botón de filtro, el swatch de la leyenda, el tooltip y cada ítem de la leyenda del donut lo aplican por igual. La razón es del cliente, no del sistema: revisó esta pantalla y pidió esquinas de 6px en todas sus superficies. La escala global de radios **no cambia** (`--radius-sm`, `--radius-md`, `--radius-lg` siguen igual); el resumen solo elige el rol más cerrado para sus cajas. Los radios que son forma de dato —el anillo del donut, el `rx` de los `rect` del SVG y el `border-radius: 50%` del swatch circular— no son esquinas de una caja y no se tocan.

## El botón de acción de la barra inferior

La barra inferior de móvil es una rejilla y el botón de acción ocupa una de sus columnas: `repeat(5, minmax(0, 1fr))`, con los cuatro destinos en su orden y el botón entre Ventas y Paquetes. La columna del botón no aporta alto —su único hijo está en `position: absolute`—, así que los cuatro enlaces siguen fijando el alto de la fila y conservan su mínimo táctil de 44px.

El botón en sí lo definen estas reglas, en la hoja del componente `BottomNav.astro`:

| Regla | Valor | Por qué |
|-------|-------|---------|
| Caja | `inline-size` y `block-size` de 60px | Tiene que ser cuadrada: una caja no cuadrada con `border-radius: 50%` es una elipse. Con 60px cabe en la columna de la rejilla sin bajar los cuatro destinos de su mínimo táctil |
| Radio | `border-radius: 50%` | El círculo. Es forma, no esquina de una caja, así que no usa la escala `--radius-*` |
| Glifo | `26px` con `stroke-width: 2.4` | Un círculo de 60px con el `Plus` de 24px y el trazo por defecto se lee vacío; el trazo más grueso empareja el peso del icono con el del botón |
| Levante | `inset-block-start: -18px` | Lo saca por encima del borde superior de la barra; su borde inferior queda dentro de ella, así que se lee levantado y apoyado |
| Anillo | `border: 2px solid var(--m3-surface-container-lowest)` | El color de la propia barra, nunca un hex, así que sigue el tema. Fino a propósito: con 4px el círculo se leía como un hueco; con 2px solo lo separa del borde de la barra |
| Elevación | `box-shadow: var(--shadow-overlay)` | La única sombra del sistema, reservada a los overlays. Es lo que hace que el círculo flote sobre la barra en vez de parecer un agujero perforado. `:active` la quita junto con el descenso de 2px, así que el botón se "apoya" al presionarlo |
| Colores | `--m3-primary` / `--m3-on-primary` | Los mismos del botón primario; no introduce un color nuevo, y se voltean en oscuro |
| Estados | `:hover` con `color-mix` de los mismos dos tokens, `:active` con `transform: translate(-50%, 2px)`, `:focus-visible` con el anillo `--accent` | Los tres usan los tokens de transición del archivo (`--dur-fast`, `--ease-out`). En táctil no hay `:hover`, así que `:active` es el único acuse de toque |

El anillo fino más la sombra son la respuesta a "el FAB parece un hueco": el problema no era el color sino que el anillo de 4px del color de la superficie recortaba el círculo dentro de la barra. `--accent` sigue reservado al foco, como en todo lo interactivo del sistema.

## Las baldosas de canal de `/new`

La pantalla `/new` decide en dos niveles y cada uno usa una forma distinta para no confundirse entre sí. El nivel 1 son botones (`.btn`); el nivel 2 son **baldosas** (`.new-channel`), una forma nueva y la única del sistema:

| Regla | Valor | Por qué |
|-------|-------|---------|
| Rejilla | `grid-template-columns: 1fr 1fr` con `gap: var(--m3-space-md)` | Dos canales se eligen comparando, así que van uno al lado del otro y del mismo tamaño. Apilados a ancho completo había que leerlos de a uno |
| Alto | `min-block-size: 104px` | La baldosa es un blanco táctil grande, no un botón de barra: caben icono y etiqueta de dos renglones sin apretarse |
| Contenido | `flex-direction: column`, `align-items: center`, `justify-content: center`, `gap: var(--m3-space-sm)` | Icono de 28px arriba y etiqueta debajo, centrados |
| WhatsApp | `background: var(--m3-surface-container-low)`, `border: 1px solid var(--line)`, glifo en `--success` | Es la superficie suave que el sistema ya usa para este tipo de contenedor, y `--success` es la identidad que el canal ya tiene en el listado de ventas |
| Live | `background: var(--m3-primary)`, `color: var(--m3-on-primary)` | El opuesto exacto de la otra baldosa. En oscuro los dos tokens se voltean, así que la oposición claro/tinta se mantiene |

No hay colores nuevos: la diferencia entre los dos canales la llevan los mismos tokens que ya usa el resto del panel, y el color nunca es el único portador de información —cada baldosa lleva su etiqueta y su icono—.

## El desplegable nativo (`<details>`/`<summary>`)

El panel tiene una divulgación nativa, el selector `/new` (nivel 1, "Registrar venta" revela los dos canales), hecha con `<details>`/`<summary>`. El formulario de venta ya no usa `<details>`: sus bloques son pasos colapsables con un `<button>` y el cliente se elige con dos botones (S24, S43), y la mercadería es una sola lista de productos (S44). Es el mismo mecanismo en los dos lugares porque la razón es la misma: el `<summary>` es un botón para el teclado y para el lector de pantalla sin una línea de JavaScript, el togleo y el estado `open` los lleva el navegador, y **no necesita recablearse**: como el armazón no se reemplaza y la plantilla de la vista se clona entera, el estado de cada `<details>` vive mientras viva su vista (D-023).

| Regla | Valor | Por qué |
|-------|-------|---------|
| Marcador nativo | `list-style: none` + `summary::-webkit-details-marker { display: none }` | El triángulo del navegador cae en otra tipografía y no se puede apuntar con `--accent`: la divulgación lleva su propio chevron (`ChevronDown`), que apunta abajo cuando está cerrada y gira 180° al abrir |
| Chevron | Decorativo (`aria-hidden`), en `--text-faint`, con `transition: transform var(--dur-fast) var(--ease-out)` | El estado lo anuncia el `<summary>` expandido/contraído; el giro es solo el acuse visual, y `prefers-reduced-motion` lo apaga como al resto |
| Blanco táctil | `min-block-size: var(--touch-min)` en el `<summary>` (el selector de `/new` usa 64px) | Es un control interactivo y le toca el mínimo del sistema, igual que la caja de los campos |
| Puntero | `cursor: pointer` | Es un botón disfrazado de encabezado de sección |
| Foco | `outline: 2px solid var(--accent)` con `outline-offset: 2px` | El anillo del `:focus-visible` global, explícito en el `<summary>`; el foco nunca se quita |
| Encabezado | El `<h3>` (venta) o la etiqueta del `<summary>` (`/new`) viven adentro y siguen siendo el rótulo de la sección | Lo que el lector de pantalla anuncia como encabezado es el mismo texto que abre el bloque |
| Cuerpo | Un `<div>` propio dentro del `<details>`, con el ritmo interno del bloque | `<details>` no es un contenedor flex confiable en todos los motores; el envoltorio deja la disposición en manos del bloque y no de la divulgación |

Arrancar cerrado es la decisión de contenido, no de estilo: los dos canales son un segundo nivel de decisión y no tienen por qué estar en pantalla antes de que la dueña elija registrar una venta. Los pasos del formulario siguen la misma idea con otro mecanismo: el que está abierto es el que toca llenar y los demás esperan —bloqueados hasta que «Siguiente» los alcance (S59)—, y desde 1024px el resumen deja de ser un paso y pasa a ser una columna pegajosa a la derecha (S60).

## Fuentes

El sistema pide `Inter` como primera opción de `--font-sans` y `JetBrains Mono` para `--font-mono`. Las dos están **declaradas pero no cargadas**: el panel no hace una petición de red a un CDN de fuentes, y la pila cae en `system-ui` / `monospace` del sistema, que es lo que el propio skill recomienda como primera opción de rendimiento.

Cargar las fuentes con `font-display: swap` y `<link>` a un CDN agregaría una petición bloqueante a un panel que se usa en una red local, para obtener una diferencia tipográfica que el sistema operativo ya resuelve. La decisión es: tokens de fuente declarados, fuentes del sistema en uso, y la carga de Inter como una tarea opcional y separada, no como parte de este alcance.

## Accesibilidad en el CSS

| Regla | Implementación |
|-------|----------------|
| Foco visible en todo interactivo | `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` global, sin excepciones |
| El foco nunca se quita | No hay `outline: none` en ningún archivo. Si un elemento no debe tener anillo, es porque no es interactivo |
| Contraste del texto de la tabla | `--text-muted` sobre `--bg-elevated`: 7.6:1, muy por encima de AA |
| Estado de la tabla para lectores de pantalla | `aria-busy="true"` mientras carga, y las celdas de estado con su texto, no solo su color |
| El color nunca es el único portador de información | La insignia de estado lleva el texto ("Pendiente", "Completada", "Cancelada") además del color. Una persona que no distingue `--warning` de `--danger` lee las dos igual |
| Objetivos táctiles | `min-height: 44px` en botones, enlaces de navegación y celdas de acción |
| `prefers-reduced-motion` | Bloque global que apaga transiciones y animaciones |

La regla del color nunca es el único portador de información es la que más se olvida en un panel donde casi todo se codifica con color. Aquí la insignia lleva texto, el estado vacío lleva ícono y enlace, y el error lleva el mensaje de la API, no solo una línea roja.
