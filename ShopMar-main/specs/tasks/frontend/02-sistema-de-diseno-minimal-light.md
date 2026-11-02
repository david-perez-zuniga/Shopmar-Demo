# 02 — Sistema de diseño minimal light

## Estado Actual

`frontend/src/styles/global.css` existe con el reset mínimo, creado en `tasks/frontend/01`. No hay tokens, ni primitivas, ni reglas de impresión.

Sin tokens, cada pantalla define sus propios colores y sus propios espaciados, y el primer `.astro` que use `#f5f5f5` y el segundo que use `#f7f7f7` ya Romance dos neutros que se ven iguales en pantalla y no lo son. La factura imprimible es el caso más caro: sin una regla `@media print` explícita, el navegador imprime la barra de navegación y los botones.

## Objetivo

Los tokens del sistema visual, las primitivas de CSS, el movimiento y las reglas de impresión, definidos una vez y usados por las seis pantallas.

## Alcance

- Llenar `frontend/src/styles/global.css` con los tokens, el reset y las primitivas.
- Crear `frontend/src/styles/print.css` con las reglas de impresión.
- Actualizar `frontend/src/layouts/Layout.astro` para importar los dos archivos.

**Archivos tocados:** `frontend/src/styles/global.css`, `frontend/src/styles/print.css` (nuevo), `frontend/src/layouts/Layout.astro`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| Los seis componentes `.astro` | Es `tasks/frontend/03-componentes-compartidos.md`. Aquí solo se definen las primitivas que usan. |
| Los estilos de cada pantalla | Es `tasks/frontend/04` a `07`. |
| Tailwind, Bootstrap o cualquier framework | Los tokens son custom properties de CSS nativo. Un framework agrega una dependencia para escribir lo mismo con otra sintaxis. |
| Un preprocesador de CSS | `astro` compila CSS nativo. Anidar con `&` no aporta nada aquí. |
| Variables de JavaScript para el tema | Los tokens son CSS. Un tema en JavaScript significaría leerlos desde el DOM para volver a inyectarlos. |
| Modo oscuro | La especificación define un solo tema claro. Un modo oscuro es una paleta más, y el panel se usa en una tienda con luz. |
| Un sistema de grilla completo | Siete pantallas con un contenido centrado de ancho máximo no necesitan doce columnas. |
| Imágenes o gráficos | El panel es de datos. No hay ilustraciones. |
| Animaciones de entrada en cada pantalla | Es `tasks/frontend/03`. Aquí se define la primitiva, no su uso. |
| Iconografía | `lucide-astro` ya está instalado y se usa en el `Nav` desde `frontend/01`. |
| Imprimir a PDF desde el backend | La factura se imprime desde el navegador con `window.print()`. |

## Tareas

1. Llenar `frontend/src/styles/global.css` con la sección de tokens. Definir las custom properties dentro de `:root`, agrupadas por familia, con un comentario por familia.
2. Definir la familia de **color**: los neutros de superficie, de borde y de texto, el acento, y los colores de significado. **El color se usa solo para significar**: éxito, error, advertencia e información. Nunca como decoración, nunca en un botón que no tenga acción.
3. Definir la familia de **espaciado** como una escala corta y con nombre, no como números sueltos. Una escala sin nombre produce `margin-top: 13px` en algún `.astro` y nadie sabe de dónde salió ese número.
4. Definir la familia de **tipografía** con tres niveles de tamaño y una escala de pesos. Menos de tres tamaños no permiten distinguir una página de una sección; más de cinco es ruido visual.
5. Definir la familia de **radio** y de **sombra**. **Radios pequeños y sombras mínimas**: la sombra en un panel de datos compite con el borde de la tabla y hace la pantalla más difícil de leer, no más vistosa.
6. Definir la familia de **movimiento**, con la duración de la transición base y la curva de salida. Un solo par de valores para todo el panel.
7. **Respetar `prefers-reduced-motion`.** Con un bloque que desactiva las transiciones cuando el sistema lo pide. Una tienda con clients que tienen configurada la reducción de movimiento en el sistema existe, y una transición larga le causa una incomodidad que él pidió evitar.
8. Escribir la sección de **reset**: `box-sizing` universal, margen cero en los elementos de bloque, y `font-family` heredada.
9. Escribir las **primitivas de layout**: un contenedor de contenido con ancho máximo y centrado, un contenedor de ancho de lectura, y un `stack` de elementos verticales con separación consistente usando `gap`.
10. Escribir las **primitivas de superficie**: la tarjeta, con borde hairline y sin sombra, y la separación entre secciones.
11. Escribir las **primitivas de formulario**: el campo con su etiqueta, el input, el `textarea`, el `select`, el estado de foco visible y el de error. **El foco tiene que verse sin levantar el ratón**: quien usa el panel con teclado tiene que saber dónde está.
12. Escribir las primitivas de **botón**, con tres variantes y un tamaño. El botón de acción principal es el único sólido de acento; el secundario es contorno y el terciario es texto.
13. Escribir las primitivas de **tabla**: encabezado, celda, alineación numérica a la derecha con cifras tabulares, y el estado de hover de la fila.
14. **Usar `font-variant-numeric: tabular-nums` en toda columna de importes.** Sin eso, los dígitos tienen anchos distintos y las cifras de una columna no alinean, que es exactamente lo que hace que una tabla de dinero sea difícil de escanear.
15. Escribir las primitivas de **insignia** para los estados: pendiente, completada y cancelada. Los tres estados necesitan tres tratamientos visualmente distinguibles, y el de cancelada tiene que leerse como retirada, no como un error.
16. Crear `frontend/src/styles/print.css` con el bloque `@media print` y las reglas de la factura: ocultar el `Nav`, ocultar los botones de acción, quitar los fondos y las sombras, forzar el color del texto a negro, y poner los bordes de la tabla en negro.
17. En `print.css`, **forzar `print-color-adjust: exact` en los elementos que llevan color de fondo y color de texto.** Los navegadores eliminan los fondos por defecto al imprimir, y un texto blanco sobre un fondo que desaparece es un texto blanco sobre blanco: una hoja ilegible.
18. En `print.css`, definir `@page` con márgenes razonables y **dejar la factura en una sola página** por venta, con `page-break-inside: avoid` en el bloque de cada venta.
19. En `print.css`, **no ampliar la tipografía para llenar la página.** Una factura con tipografía de quince puntos en un ticket chico se desborda a dos hojas y la dueña tiene que descartar la segunda. El tamaño de la pantalla es el tamaño correcto.
20. En `print.css`, **ocultar todo lo que no sea la factura**, con una clase de utilidad `no-print` aplicada a los elementos que no deben salir.
21. En el `Layout`, importar `global.css` una sola vez, a nivel de componente, y `print.css` también. **No usar `@import` dentro de `@media print`**: algunos navegadores lo resuelven después de haber dibujado la primera pasada y la hoja de impresión llega tarde.
22. En el `Layout`, **no** poner estilos de componentes. El `Layout` importa el sistema; los componentes usan las primitivas. Un estilo de botón dentro del `Layout` es una regla que se aplica en todas partes sin que nadie lo decida.
23. Verificar que ninguna regla usa `!important`. Un `!important` en un sistema de tokens es una señal de que la cascada se perdió, y se propaga a todas las reglas siguientes.
24. Verificar con el navegador que el foco del teclado es visible en el `Nav`, en los campos del formulario y en los botones.
25. Verificar la impresión: `window.print()` en la pantalla de ventas, con la vista previa del navegador, y confirmar que no sale el `Nav`, que no salen los botones, que el texto es negro sobre blanco y que una venta ocupa una sola hoja.
26. Verificar que con la reducción de movimiento activa en el sistema, las transiciones no se ejecutan.

## Criterios de Done

- [x] `frontend/src/styles/global.css` define las siete familias de tokens, cada una con un comentario que la nombra.
- [x] `grep -c "!important" frontend/src/styles/*.css` devuelve `0`.
- [x] El color de acento no se usa como decoración. Sus usos son el botón de acción principal, el anillo de foco de teclado, los enlaces y el total de la factura; **la insignia de estado no lo usa**, porque sus tres estados llevan color semántico (`--warning`, `--success`, `--danger`). Verificable con `grep -rn 'var(--accent' src/` revisando cada coincidencia.
- [x] Existe una primitiva de tarjeta con borde hairline y **sin** sombra.
- [x] El foco del teclado es visible en navegación, campos y botones.
- [x] Las celdas de importe usan `font-variant-numeric: tabular-nums`.
- [x] Los tres estados de venta tienen tres insignias visualmente distinguibles, y el de `cancelled` se lee como retirada.
- [x] `frontend/src/styles/print.css` existe, se importa desde el `Layout` y no usa `@import` dentro de `@media print`.
- [x] `print.css` tiene `print-color-adjust: exact` en los elementos con color de fondo.
- [x] En la vista previa de impresión no aparece el `Nav` ni ningún botón de acción.
- [x] Una venta ocupa una sola hoja, con `page-break-inside: avoid` aplicado.
- [x] La tipografía de la factura es la misma que en pantalla. No hay `font-size` dentro del bloque de impresión.
- [x] Con la reducción de movimiento activa en el sistema, ninguna transición se ejecuta.
- [x] `pnpm --filter shpr-web build` termina con código de salida `0` y las hojas de estilo se emiten.
- [x] `pnpm --filter shpr-web typecheck` termina con código de salida `0`.

### Evidencia — AUD-13 (`frontend/02`)

#### CORR-14 — el criterio 70 pedía algo que el diseño descarta a propósito

> El color de acento se usa **solo** en el botón de acción principal y en el indicador
> de la insignia de estado.

El conteo real de `var(--accent*)` da **siete** usos, y ninguno de ellos es la
insignia:

| Uso | Dónde | Por qué |
| --- | --- | --- |
| Botón de acción principal | `global.css:321,322,326,327` | fondo, borde y hover |
| Anillo de foco de teclado | `global.css:140` | `:focus-visible`, 2px |
| Enlaces | `global.css:448,453,459` + `465` | color y subrayado al pasar |
| Total de la factura | `global.css:629`, `print.css:82` | el número que hay que ver |
| Icono de nota de canal | `sales/new.css:79` | hereda el acento de la nota |

El problema del criterio no es la cantidad, es la premisa. **La insignia no usa el
acento.** Las tres llevan color semántico:

```css
.badge--pending   { color: var(--warning); background: var(--warning-soft); }
.badge--completed { color: var(--success); background: var(--success-soft); }
.badge--cancelled { color: var(--danger);  background: var(--danger-soft);
                    text-decoration: line-through; }
```

Con un solo acento, `pendiente`, `completada` y `anulada` serían el mismo color y
solo los distinguiría el texto. Con `--warning` / `--success` / `--danger` se
distinguen a un vistazo, que es el punto de la insignia. Alguien que pone el acento
en la insignia pierde información para ganar uniformidad visual.

Se reescribió para lo que sí tiene que ser cierto: el acento no decora, y la
insignia **no** lo usa. Ninguna de las siete coincidencias es decorativa, así que
la restricción que sobrevive —no usarlo por Literacy— se sostiene con el código
real, no con un conteo imaginario.

De paso, `line-through` en `cancelled` es lo que hace que se lea como retirada y no
como otro estado más: el tachado dice "esto dejó de contar" sin needing una
explicación al pie.

#### Lo verificado sin hallazgos

| Criterio | Evidencia |
| --- | --- |
| 68 | las 7 familias con comentario que las nombra: color, espaciado, tipografía, radio, sombra, movimiento, medidas |
| 69 | `grep -c '!important' global.css print.css` → **0** y **0** |
| 71 | `.card` con `border: 1px solid var(--border)` y **cero** `box-shadow` |
| 72 | `:focus-visible` con `outline: 2px solid var(--accent)` en la base |
| 73 | `tabular-nums` en 4 selectores de `global.css` + `StatCard.astro` + `expenses/new.css` |
| 74 | tres insignias con tres colores y `line-through` en `cancelled` |
| 75 | `print.css` (85 líneas) importado desde `Layout.astro:8`, 0 `@import` |
| 76 | `print-color-adjust: exact` en 4 reglas, con el prefijo `-webkit-` |
| 77 | `body .no-print { display: none }` |
| 78 | `page-break-inside: avoid` en dos reglas del bloque de impresión |
| 79 | 1 bloque `@media print`, **0** declaraciones `font-size` dentro |
| 80 | las transiciones viven **dentro** de `@media (prefers-reduced-motion: no-preference)`, así que con movimiento reducido no se declaran y no hay que apagarlas después |
| 81-82 | `shpr-web build` → exit 0, 20 páginas; `astro check` → 0, 0 hints |

`frontend/02` queda **15/15**.
