# Briefs de diseño por módulo

Este documento existe para una tarea puntual: **producir el diseño visual de cada
pantalla** y después volcarlo a la tecnología del proyecto. No es un contrato de
implementación — ese es [`04-screens.md`](04-screens.md), que dice qué hace el
código. Aquí dice **qué hay que dibujar**.

La diferencia importa. `04-screens.md` obliga a que el código cumpla; este
documento obliga a que el diseño cumpla. Si el diseño y la spec discrepan, la
spec gana y el diseño se corrige.

## Cómo se traduce un diseño a este proyecto

El panel se estila con **55 custom properties** en `src/styles/global.css` y
`<style>` con scope de Astro. **No hay Tailwind y no se va a instalar.** Un
diseño entregado en clases utilitarias se traduce así:

| En el diseño | En este proyecto |
|--------------|------------------|
| `p-3` · `gap-2` · `mt-4` | `--space-1` … `--space-8` |
| `text-gray-500` | `--text-muted` · `--text-faint` |
| `text-gray-900` | `--text-primary` |
| `bg-white` · `bg-gray-50` | `--bg-elevated` · `--bg-base` · `--bg-inset` |
| `rounded-lg` | `--r-lg` · `--r-md` · `--r-sm` |
| `text-[13px]` | `--text-body` · `--text-sm` · `--text-label` · `--text-h3` |
| `h-9` · `min-h-[44px]` | `--touch-min` · `--row-height` |
| `text-indigo-600` | `--accent` · `--accent-strong` · `--accent-soft` |
| `border-gray-200` | `--border` · `--border-strong` |
| `text-red-600` · `text-green-600` | `--danger` · `--success` (y sus `-soft`) |

Tres reglas que no son negociables:

1. **Un valor sin token equivalente usa el token más cercano, y se declara en el
   commit.** No se inventan colores ni tamaños intermedios: un `#0f172a` suelto
   es una deuda que aparece en la tercera pantalla que se toca.
2. **El color significa algo o no se usa.** Verde es venta cobrada, ámbar es
   pendiente, rojo es cancelada. Nunca decorativo.
3. **No hay modo oscuro.** No es una omisión: `04-screens.md` y este README
   declaran que el sistema es claro de punta a punta, y un tema oscuro es un
   sistema de color completo, no un `invert`.

## Lo que hay que dibujar en todas las pantallas

Ninguna pantalla es una tabla y ya. Las cuatro tienen **tres estados**, y una
tabla de datos que solo se dibuja con datos prueba nada:

| Estado | Qué se ve |
|--------|-----------|
| **Carga** | La estructura ya montada y los valores sin dato: un guion em `—`, nunca `0` ni `C$ 0,00`. `aria-busy="true"` en el contenedor. |
| **Vacío** | Una invitación con enlace a la pantalla de alta. Nunca una fila gris: "No hay ventas registradas" con un botón para registrar la primera. |
| **Error** | Un mensaje ya traducido al español y un botón "Reintentar". |

El guion em en la carga es la parte que más se olvida en un mockup, y es la que
importa: entre la petición y la respuesta el dato **no existe**, y un `0` ahí es
un número falso. El `C$ 0,00` real de octubre es un dato; el `—` de carga es una
ausencia. No se dibujan igual.

## Común a las cuatro pantallas

- Barra de navegación con cuatro secciones: **Resumen**, **Ventas**, **Paquetes**,
  **Gastos**. La activa lleva `aria-current="page"` y no navega.
- El logo a la izquierda, el nombre del negocio a la derecha.
- **Filtrar por fechas** en las tres listas: dos campos de fecha y un botón. El
  filtro es un `GET`, así que las fechas viajan en la URL y la página es
  compartible.
- Botón primario en la esquina superior derecha de cada listado.
- La barra de navegación y el filtro de fechas **se dibujan en todas**: son
  chrome, se diseñan una vez.

---

# 1 · Módulo de ventas

Es el módulo más denso: **dos pantallas** y es el que se usa veinte veces por
tarde. Es el que más gana con una buena densidad.

## 1.1 `/sales` — Listado

**Barra de filtros** (una sola fila, todo alineado a la izquierda):

| Control | Opciones |
|---------|----------|
| Fecha desde | date picker |
| Fecha hasta | date picker |
| Canal | `live` (Mostrador) · `whatsapp` (WhatsApp) · *Sin filtro* |
| Estado | `pending` (Pendiente) · `completed` (Completada) · `cancelled` (Cancelada) · *Sin filtro* |
| Botón | "Filtrar" |

**Botones:** primario "Nueva venta" (a `/sales/new?type=live`) y secundario
"Venta por WhatsApp" (a `/sales/new?type=whatsapp`). El secundario es
distinto porque es otro flujo, no un modo del mismo: por WhatsApp la venta lleva
artículos adicionales.

**Tabla — ocho columnas:**

| # | Columna | Contenido |
|---|---------|-----------|
| 1 | Fecha | `DD/MM/AAAA` |
| 2 | Cliente | texto |
| 3 | Mercadería | texto libre, es el campo más largo |
| 4 | Canal | insignia: "Mostrador" o "WhatsApp" |
| 5 | Estado | **un `<select>` en la fila, no un botón** |
| 6 | Artículos | conteo; guion em si no hay |
| 7 | Total | moneda, `tabular-nums`, alineado a la derecha |
| 8 | Acciones | cambiar estado · imprimir |

La sexta columna de este brief era **Costo**, y se quitó después por pedido de
la dueña: mostraba el mismo número que **Total** en toda venta sin artículos
adicionales, así que no aportaba nada, y su rótulo había derivado en un segundo
"Total" que confundía. El listado conserva una sola columna de dinero.

Dos decisiones de diseño que hay que respetar y que no son evidentes:

**El Estado es un selector dentro de la fila.** Es lo que hace que cambiar el
estado sea una operación de una sola acción, sin abrir un diálogo. El precio es
que un clic de más cancela una venta, así que va con confirmación y el selector
vuelve a su valor anterior si se cancela. **El diseño tiene que hacer evidente
que esa columna es editable** — si parece texto, nadie lo va a usar.

La excepción es una venta ya cancelada: ahí no hay selector, hay una insignia y
una nota que explica que el estado no se puede cambiar. El diseño tiene que hacer
evidente esa diferencia, porque una columna inerte sin explicación se lee como un
error de la pantalla. Y cancelar desde una venta viva tiene que dejar el selector
inerte en el acto, sin esperar a recargar: la dueña acaba de ver que la acción
funcionó y no necesita que se lo digan de nuevo.

**Imprimir es una de las acciones de la fila.** Abre la factura de esa venta y
llama al diálogo de impresión del navegador. No es una ruta nueva: el documento
se arma en la misma pantalla, oculto, y las reglas de impresión lo convierten en
lo único que sale por la impresora. Es la pantalla más difícil de probar sin
datos reales.

## 1.2 `/sales/new` — Formulario

**Un archivo, dos canales.** La URL decide: `?type=live` o `?type=whatsapp`.

| Campo | Tipo | Requerido | Aparece |
|-------|------|-----------|---------|
| Cliente | texto, máx 200 | Sí | siempre |
| Mercadería principal | texto, máx 200 | Sí | siempre |
| Forma de pago | combo: Efectivo · Tarjeta de crédito | Sí | siempre |
| **Banco** | texto, máx 200 | **Sí, solo con Tarjeta** | **condicional** |
| Fecha | date | No, hoy por defecto | siempre |
| Estado | combo: Pendiente · Completada · Cancelada | No, Pendiente por defecto | siempre |
| Costo | texto con teclado numérico | Sí | siempre |

**El campo Banco es condicional y eso hay que dibujarlo.** Se muestra y se oculta
al cambiar la forma de pago. El diseño tiene que mostrar **las dos versiones**:
con Efectivo el campo no está; con Tarjeta aparece. Si solo dibujás la versión
con el banco, el diseño está incompleto.

**No hay campo de venta en este formulario.** La relación entre paquete y venta
la elige el formulario de paquete, no este. Es deliberado: si la venta elige su
paquete y el paquete elige su venta, hay dos caminos para escribir lo mismo y
alguien los usa mal.

**En canal WhatsApp, debajo de todo:** un bloque de artículos adicionales, que es
una tabla de renglones. Cada renglón tiene cuatro campos —nombre (requerido),
descripción (opcional), cantidad (mínimo 1, por defecto 1) e importe—, un botón
"Agregar artículo" y un "Quitar" por renglón. En canal Mostrador ese bloque no
existe. **El diseño tiene que dibujarlo repetido con al menos dos renglones**, porque
con uno solo no se ve el botón de quitar ni la renumeración.

**Al fallar el envío, el formulario no se limpia.** Es la regla que más se
contradice en la práctica: la dueña corrigió un importe y no quiere volver a
escribir el cliente. El error va en un sobre bajo el formulario, con el campo que
falló resaltado.

---

# 2 · Módulo de paquetes

## 2.1 `/packages` — Listado

Barra de filtros: fecha desde, fecha hasta, y un combo de **Método** con tres
opciones — Cargotrans, Delivery, Retiro — más un botón "Filtrar".

Botón primario "Registrar paquete".

**Tabla — cinco columnas:**

| # | Columna | Contenido |
|---|---------|-----------|
| 1 | Fecha | `DD/MM/AAAA` |
| 2 | Nombre | texto |
| 3 | Método | insignia: Cargotrans · Delivery · Retiro |
| 4 | Venta asociada | el identificador **truncado a 8 caracteres**, como enlace |
| 5 | Acciones | Editar · Eliminar |

La columna Venta asociada muestra un identificador corto, **no el nombre del
cliente**. Incorporar el nombre exigiría que la API traiga una carga anidada que
no trae. Y el enlace no va a la venta: va al listado de ventas filtrado por el
día del paquete, que es lo que la dueña quiere ver.

**Eliminar es el único borrado de todo el panel**, y es el más peligroso: sin
confirmación, un paquete desaparece. Con confirmación, un clic de más lo borra y
no hay forma de recuperarlo. **El diseño tiene que hacer la confirmación visible
y temida**, no un modal genérico.

**Editar no navega a una ruta nueva.** Va al mismo formulario de alta con
`?id=<uuid>` y ese formulario se da cuenta. Alta y edición son la misma pantalla
en dos modos, con título y botón distintos.

## 2.2 `/packages/new` — Formulario

| Campo | Tipo | Requerido |
|-------|------|-----------|
| Nombre | texto, máx 200 | Sí |
| Fecha | date | No, hoy por defecto |
| Método | combo: Cargotrans · Delivery · Retiro | Sí |
| Venta asociada | combo con todas las ventas | No |

**"Venta asociada" tiene una primera opción que dice "Sin venta asociada".** No
es decorativa: es la única forma de pasar "sin relación" por un formulario, y es
lo que **desvincula** un paquete mal asociado. Sin esa opción el paquete queda
atado a algo.

El combo lista todas las ventas. Si se está editando un paquete cuya venta no
aparece en la lista, esa venta se agrega como primera opción en vez de dejar el
valor suelto — un combo cuyo valor no está entre sus opciones se ve vacío, y el
formulario terminaría desvinculando el paquete sin que nadie lo haya tocado.

En modo edición el título dice "Editar paquete" y el botón "Guardar cambios".

---

# 3 · Módulo de gastos

El módulo más simple de los tres. Si está bien diseñado, se usa sin mirar.

## 3.1 `/expenses` — Listado

Barra de filtros: solo fecha desde y fecha hasta, más "Filtrar". **Sin filtro por
nombre ni por importe**: un mes de gastos entra en una pantalla, y la dueña busca
por fecha.

Botón primario "Registrar gasto".

**Tabla — cinco columnas:**

| # | Columna | Contenido |
|---|---------|-----------|
| 1 | Fecha | `DD/MM/AAAA` |
| 2 | Nombre | texto |
| 3 | Descripción | texto; **guion em si viene nula** |
| 4 | Importe | moneda, `tabular-nums`, a la derecha |
| 5 | Acciones | Eliminar |

## 3.2 `/expenses/new` — Formulario

Cuatro campos, sin condiciones, sin bloques dinámicos, sin modo edición.

| Campo | Tipo | Requerido |
|-------|------|-----------|
| Nombre | texto, máx 200 | Sí |
| Descripción | texto, máx 500 | No |
| Importe | texto con teclado numérico | Sí |
| Fecha | date | No, hoy por defecto |

**No hay pantalla de edición de gastos.** Corregir un gasto es borrarlo y
registrarlo de nuevo. Es una limitación conocida y documentada, no un olvido: si
el diseño la incluye, hay que avisarlo.

---

# 4 · `/` — Dashboard

Ya está implementado. El diseño de referencia es el actual, y el archivo que
produce su HTML es `src/pages/index.astro`. Sirve de ejemplo de a qué nivel de
detalle llega este documento: cuatro tarjetas en dos por dos, el filtro de fechas
encima, y las cuatro cifras entrando escalonadas con 0, 60, 120 y 180 ms de
retraso — lo que lo hace sentirse construido en lugar de aparecer de golpe.

Las cuatro cifras, en orden: **ingresos**, **ventas**, **gastos**, **paquetes
pendientes**. Cada tarjeta lleva un texto de apoyo de una línea que explica qué
está contando, no qué dice el número.

## Lo que este documento NO pide

| Lo que no se pide | Por qué |
|------------------|---------|
| Gráficos, series, sparklines | El endpoint devuelve cuatro escalares. Un gráfico exige una librería o varios cientos de líneas de SVG, y la dueña necesita el número, no la forma. |
| Paginación ni "cargar más" | Un mes entra en una pantalla. |
| Búsqueda global | No existe en la versión 1 y nadie la pidió. |
| Login, sesión, roles | Fuera de alcance por decisión documentada. |
| Notificaciones, badges de "nuevo" | No hay nada que notificar. |
| Modo oscuro | Un sistema de color completo, no un `invert`. |
| Temas configurables | Un solo tema. |
| Anclajes de teclado y atajos | La dueña trabaja con mouse; el foco visible sí está. |