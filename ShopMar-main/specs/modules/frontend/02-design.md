# Sistema de diseño — Minimal Light

El panel aplica el skill `minimal-light` a **toda** la aplicación: las ocho pantallas, sus componentes y sus estados. La adaptación es de contenido, no de estilo: donde el skill describe una landing con hero y testimonios, aquí hay una barra lateral y una tabla, y la estructura se ajusta al producto real. Los tokens, las reglas de contraste, el movimiento y los límites de decoración se aplican **sin modificar**.

## Tokens

Hay una sola fuente de verdad. Los roles canónicos se declaran dos veces en `src/styles/global.css` — una por tema, en `:root, :root[data-theme="light"]` y en `:root[data-theme="dark"]` — y ningún otro lugar del sistema declara un color literal. Componentes y pantallas leen un rol canónico o un alias, nunca un hex.

### Roles canónicos

| Rol | Claro | Oscuro |
|-----|-------|--------|
| `--bg` | `#f8f9ff` | `#0b121a` |
| `--surface` | `#ffffff` | `#0d151d` |
| `--surface-inset` | `#f1f3fa` | `#0a1017` |
| `--surface-raised` | `#ffffff` | `#131d27` |
| `--surface-active` | `#e9ecf6` | `#17222e` |
| `--line` | `rgba(11,18,26,.10)` | `rgba(255,255,255,.08)` |
| `--line-strong` | `rgba(11,18,26,.16)` | `rgba(255,255,255,.14)` |
| `--ink` | `#0b121a` | `#eef3f9` |
| `--ink-2` | `#4a5563` | `#9fb0c0` |
| `--ink-3` | `#7a8494` | `#6b7c8c` |
| `--accent` | `#4f46e5` | `#b9c0ff` |
| `--accent-ink` | `#ffffff` | `#0b121a` |
| `--success` | `#1a7f4e` | `#86f7b2` |
| `--success-surface` | `rgba(26,127,78,.08)` | `rgba(134,247,178,.12)` |
| `--warning` | `#b45309` | `#f5d87c` |
| `--warning-surface` | `rgba(180,83,9,.08)` | `rgba(245,216,124,.12)` |
| `--danger` | `#b42318` | `#ffb4ab` |
| `--danger-surface` | `rgba(180,35,24,.08)` | `rgba(255,180,171,.12)` |
| `--toast-bg` | `#213145` | `#eef3f9` |
| `--toast-ink` | `#eaf1ff` | `#0b121a` |
| `--scrim` | `rgba(11,18,26,.45)` | `rgba(0,0,0,.6)` |
| `--shadow-overlay` | `0 8px 30px rgba(0,0,0,.18)` | `0 8px 30px rgba(0,0,0,.55)` |

`#f8f9ff` (claro) y `#0b121a` (oscuro) son los anclajes fijos del cliente: no se desvían y no se introduce un tono nuevo. El cromo se queda neutro; los únicos valores cromáticos permitidos son el acento, los tres colores semánticos y la paleta de los gráficos.

### La capa de alias

Los nombres heredados (`--bg-*`, `--border*`, `--text-*`, `--r-*`, `--shadow-*`, `--overlay`) y los nombres Material 3 (`--m3-*`) no se declaran dos veces. Se declaran **una sola vez en `:root`, sin tema**, y cada uno apunta a un rol canónico:

```css
:root {
  --m3-primary: var(--ink);
  --m3-surface-container-low: var(--surface-inset);
  --m3-on-surface-variant: var(--ink-2);
  --bg-elevated: var(--surface);
  --text-muted: var(--ink-2);
  --r-md: var(--radius-md);
  --shadow-confirm: var(--shadow-overlay);
}
```

Como el alias apunta al rol, sigue el tema automáticamente: no hay una copia clara y otra oscura. Cambiar un rol canónico no obliga a tocar ninguna pantalla. La única excepción es el anillo de foco y el color de los enlaces, que usan `--accent` directamente (ver **Color**).

### Radios

Cuatro pasos, idénticos en los dos temas: `--radius-sm: 6px`, `--radius-md: 8px`, `--radius-lg: 12px`, `--radius-pill: 999px`. Los nombres heredados `--r-sm` / `--r-md` / `--r-lg` y `--m3-r-*` son alias de esos cuatro.


### Los tres colores que el skill no define

El skill declara `--accent` y nada más de color. Un panel de gestión necesita comunicar dos cosas que no son marca: **el estado de una venta** y **el éxito o el fallo de una operación**. Esas tres variables se agregan como extensión, con la restricción dura del skill de que nunca se mezclan con el acento para decorar.

| Variable | Valor | Uso único |
|----------|-------|-----------|
| `--success` | `#1a7f4e` | Insignia de venta `completed`, confirmación de una operación exitosa. |
| `--warning` | `#b45309` | Insignia de venta `pending`. |
| `--danger` | `#b42318` | Insignia de venta `cancelled`, botón de borrar, mensaje de error. |

Contraste verificado contra `--surface` (`#ffffff`) en claro y contra `--bg` (`#0b121a`) en oscuro:

| Color | Claro | Oscuro | Veredicto |
|-------|-------|--------|-----------|
| `--ink` | 18.8:1 | 16.9:1 | AAA |
| `--ink-2` | 7.6:1 | 8.5:1 | AAA |
| `--ink-3` | 3.8:1 | 4.4:1 | AA solo para texto grande o metadatos decorativos |
| `--accent` | 6.3:1 | 10.8:1 | AA como texto y AA con `--accent-ink` encima |
| `--success` | 5.0:1 | 14.3:1 | AA en claro y AAA en oscuro |
| `--warning` | 5.0:1 | 13.4:1 | AA en claro y AAA en oscuro |
| `--danger` | 6.6:1 | 11.1:1 | AA en claro y AAA en oscuro |

`--ink-3` **no se usa en el cuerpo del texto, ni en los campos de formulario, ni en nada que la dueña tenga que leer**. Solo en `.section-label`, en los metadatos y en el texto de apoyo de las tarjetas. Esa restricción viene del skill y es la trampa más fácil de violar por costumbre.

## Tipografía

La escala tipográfica vive en los tokens `--m3-fs-*`, `--m3-lh-*` y `--m3-ls-*`. Los alias de texto no declaran valores propios: apuntan a esa escala.

| Elemento | Token | Peso | Interlineado | Dónde |
|----------|-------|------|--------------|-------|
| Título de pantalla | `--m3-fs-headline-xl` | 650 | `--m3-lh-headline-xl` | El `<h1>` de cada una de las ocho pantallas |
| Título de sección | `--text-h3` (= `--m3-fs-headline-lg`) | 600 | `--m3-lh-headline-lg` | "Ventas del período", "Paquetes registrados" |
| Etiqueta de sección | `--text-label` (= `--m3-fs-label-sm`) | 600 | `--m3-lh-label-sm` | `.section-label`, en versalitas con `letter-spacing: 0.12em` y `--ink-3` |
| Cuerpo | `--text-body` (= `--m3-fs-body-lg`) | 400 | `--m3-lh-body-lg` | Párrafos, texto de apoyo de las tarjetas |
| Tabla y formularios | `--text-sm` (= `--m3-fs-body-md`) | 400/550 | `--m3-lh-body-md` | Celdas, `<input>`, `<select>`, botones |
| Cifras de la factura | `--font-mono` | 500 | 1.4 | Los importes del documento imprimible |

La escala de marketing (`--text-display`, `--text-h2`) **ya no existe**. Era un token de landing, y un panel de gestión no tiene un titular de 72 píxeles. `--text-h3`, `--text-body`, `--text-sm` y `--text-label` sobreviven solo como alias de la escala M3, sin valores propios.

Los pesos nunca bajan de 400 en el cuerpo ni de 600 en los títulos. La jerarquía viene del peso y del tamaño, no de aclarar el texto.

## Color

**El cromo es neutro.** Botones, chips, filas de navegación activas, controles de página actual y cualquier relleno sólido se pintan con `--ink` / `--surface-*`, nunca con color. Es automático: `--m3-primary` apunta a `--ink`, así que todo lo que antes era azul se vuelve neutro sin tocar un solo selector de pantalla.

El acento `#4f46e5` (claro) / `#b9c0ff` (oscuro) sobrevive **solo** en dos excepciones, y las dos están escritas:

| Excepción | Cómo |
|-----------|------|
| Anillo de foco | `outline: 2px solid var(--accent)` en todo `:focus` / `:focus-visible`, más el `border-color` o `box-shadow` que haga de anillo de foco |
| Enlaces del contenido | `color: var(--accent)` en los `a` de prosa y de celdas de tabla, incluido el hover |

Fuera de esas dos excepciones ningún selector usa `--accent`. Los bordes de las tablas, los fondos de las tarjetas, los textos secundarios y los botones son `--ink` sobre `--surface`. No hay segundo color de acento, no hay degradado, no hay color decorativo.

### El color como información

Las tres extensiones semánticas se usan **solo** donde hay información que leer:

| Dónde | Cómo |
|-------|------|
| Insignia de estado de venta | `pending` → `--warning` sobre `--warning-surface`; `completed` → `--success` sobre `--success-surface`; `cancelled` → `--danger` sobre `--danger-surface` |
| Errores de validación de un formulario | `--danger` en el mensaje, borde del campo a `--danger` |
| Confirmación de una operación exitosa | `--success` en el texto de confirmación, que desaparece solo a los 3 s |
| Botón de borrar | `--danger` como texto y borde, **nunca** relleno sólido rojo |

El fondo del mensaje de éxito es `--bg-inset` con el texto en `--success`. Nunca una franja verde brillante: el brillo es decoración, y la decoración es lo primero que sobra en un panel que se mira todos los días.

## Bordes, radios y elevación

```css
.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.card:hover { border-color: var(--border-strong); }
```

| Regla | Valor |
|-------|-------|
| Separación entre filas de tabla | Una línea de 1px en `--border` |
| Separación entre columnas | Ninguna. La tabla no usa bordes verticales. |
| Botón primario | `--r-md`, relleno 12px 24px, fondo `--ink` con `--bg` encima |
| Botón secundario | `--r-md`, fondo transparente, `1px solid var(--border-strong)` |
| Campo de formulario | `--r-sm`, `1px solid var(--border)`, relleno 10px 12px |
| Insignia | `--r-sm`, relleno 4px 8px, sin borde |
| Tarjeta del dashboard | `--r-lg`, `--surface` sobre `--bg` |
| Tarjeta en hover | El borde pasa a `--border-strong`. **Sin `transform`, sin brillo, sin sombra.** |

**Una sola sombra de overlay.** No hay sombras en tarjetas, filas ni botones: `--shadow-card`, `--shadow-raised`, `--m3-shadow-sm` y `--m3-shadow-header` apuntan a `none`. Todos los overlays comparten un único valor, `--shadow-overlay` (`0 8px 30px rgba(0,0,0,.18)` en claro y `.55` en oscuro), y `--shadow-confirm`, `--m3-shadow-xl`, `--m3-shadow-lg` y `--m3-shadow-drawer` son alias suyos.

La elevación normal se logra con contraste de fondo (`--surface` sobre `--bg`) y con el borde de un píxel, nunca con una sombra difusa.

## Movimiento

| Transición | Duración | Curva | Dónde |
|------------|----------|-------|-------|
| Hover de botón, de fila y de tarjeta | `--dur-fast` (150ms) | `--ease-out` | Cambio de color y de borde |
| Aparición de una tabla al cargar | `--dur-base` (220ms) | `--ease-out` | `opacity` de 0 a 1, sin desplazamiento |
| Entrada de las tarjetas del dashboard | `--dur-enter` (550ms) | `--ease-out` | `opacity` + `translateY(12px)` a 0, escalonada 60ms por tarjeta |
| Mensaje de confirmación | 220ms de entrada, 3 s de espera, 220ms de salida | `--ease-out` | `opacity` |
| Foco de teclado | Instantáneo | — | Cambia el `outline` sin transición, para que sea inmediato |

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .reveal { opacity: 1; transform: none; }
}
```

El bloque de movimiento reducido es **obligatorio** y no opcional. Con las transiciones apagadas, las cuatro tarjetas del dashboard se ven igual, solo que ya están visibles: la página se ve terminada sin animaciones, que es el criterio del skill.

El desplazamiento de la entrada es de 12px, no más. En Minimal Light el movimiento es una respiración, no una entrada teatral.

## Rejilla y espaciado

| Elemento | Valor |
|----------|-------|
| Ancho máximo del contenido | 1120px, centrado |
| Relleno horizontal de la página | 32px en escritorio, 16px en móvil |
| Relleno de las tarjetas | 24px (el mínimo del rango del skill) |
| Separación entre tarjetas del dashboard | 24px |
| Separación entre secciones de una pantalla | 48px |
| Ancho de la barra lateral | 240px fijos en escritorio; 64px solo con iconos en tablet; ausente en móvil, reemplazada por una fila de enlaces |
| Alto mínimo de un elemento táctil | 44px |
| Altura de fila de tabla | 44px |

El espacio en blanco es el diseño, no el relleno que sobra. Cuando una pantalla se siente cargada, la reacción correcta del skill es **quitar un elemento**, no agregar uno.

## El caso particular del panel: densidad

Minimal Light está pensado para páginas escasas de contenido, y un panel de gestión es lo contrario: necesita una tabla de ventas densa y un formulario que no desperdicie espacio. La adaptación es acotada y explícita:

| Dónde el panel se aparta del skill | Cómo y por qué |
|-----------------------------------|----------------|
| Relleno de 120–160px verticales de las secciones | Baja a 48px entre secciones. Una tabla de veinte filas con 150px de aire arriba es espacio vacío, no respiración. |
| `clamp(44px,6vw,72px)` para el titular | Baja a `--m3-fs-headline-xl` (24px). El titular de una pantalla de gestión es un rótulo, no una campaña. |
| Icono de 24px en un cuadrado de 40×40 | Las insignias de estado son de 12px, sin cuadrado. En una fila de tabla, un cuadrado de 40px con icono ocupa más alto que el resto de las celdas. |
| Generosidad de los titulares | Se mantiene. Cada pantalla tiene **una** etiqueta de sección y **un** titular. Nunca dos. |
| Bordes `--border` entre filas | Se mantiene, y es lo que hace legible una tabla densa sin resortes ni cebra. |

Lo que **no** se toca: el acento único, los bordes de un píxel, la ausencia de sombras, la ausencia de degradados, la tipografía de peso alto, el foco visible de 2px y el movimiento por debajo de 550ms.

## Impresión de la factura

La factura es el único lugar donde el sistema se aleja de los tokens, y el motivo es físico: la impresora no gasta tinta sobre fondos grises.

```css
@media print {
  .sidebar, .topbar, .filters, .data-table, .toast { display: none !important; }
  .invoice { position: static; display: block; }
  .invoice, .invoice * {
    background: #ffffff !important;
    color: #000000 !important;
    box-shadow: none !important;
    border-color: #999999 !important;
  }
  .invoice { border: 0.5pt solid #000000; padding: 24px; }
  @page { margin: 16mm; }
}
```

Cinco reglas obligatorias:

1. **Todo lo que no es la factura desaparece.** La barra lateral, la barra superior, los filtros, la tabla y los mensajes flotantes.
2. **La factura se muestra en flujo normal**, no en una posición absoluta fuera de pantalla. En pantalla es `position: fixed` con `opacity: 0` y `pointer-events: none`; en impresión pasa a `position: static` y `display: block`. Sin esto, el documento se imprimiría en la primera página y el resto quedaría en blanco.
3. **Fondos blancos y texto negro**, con `!important` porque los tokens tienen más especificidad que las reglas de impresión.
4. **Bordes de 0.5pt**, no de 1px. Un borde de 1px en una página A4 se ve grueso y gasta más tinta.
5. **`@page { margin: 16mm }`**, el margen por defecto de la impresora con un valor explícito que no depende de sus ajustes.

## Verificación de contraste

| Relación | Requisito | Cómo se verifica |
|----------|-----------|------------------|
| `--ink-2` (`--text-muted`) sobre `--bg` y `--surface` | ≥ 4.5:1 | 7.6:1 en claro, 8.5:1 en oscuro, cumple |
| `--ink-3` (`--text-faint`) | Solo texto grande (≥ 18.66px en negrita o 24px) o metadatos decorativos | 3.8:1 en claro, restringido a `.section-label` y al texto de apoyo de las tarjetas |
| Texto de `--accent-ink` sobre `--accent` | ≥ 4.5:1 | 6.3:1, cumple |
| `--ink` en los campos de formulario | Nunca `--ink-3` | El `color` del `input` es `--ink`; el `placeholder` sí puede ser `--ink-3` |
| Foco visible | `outline: 2px solid var(--accent)` con 2px de separación en **todo** interactivo | Regla global en `05-estilado.md` |
| `--ink-2` para el texto de las tablas | Es el color por defecto de las celdas | 7.6:1, cumple |

El `accent` por defecto del skill es `#4f46e5` y cumple los dos umbrales que el propio skill exige: 4.5:1 para texto y 3:1 para elementos grandes. En oscuro el token sube a `#b9c0ff`, que cumple 3:1 o más sobre `--bg`.
