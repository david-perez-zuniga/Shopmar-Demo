# 05 — Formulario de venta

## Estado Actual

`frontend/src/pages/sales/new.astro` no existe. Los componentes que necesita —`StatusBadge` para el `select` de estado y `Layout`— ya están.

El formulario tiene que cubrir los dos canales de venta, y esa es la parte con más lógica de la pantalla:

- `POST /sales/live` acepta los siete campos comunes y **rechaza** `additional_items` con `400`.
- `POST /sales/whatsapp` acepta los mismos siete más `additional_items`, con entre 1 y 50 elementos.
- `payment_bank` es obligatorio si `payment_method` es `credit_card`, y prohibido en los otros casos.
- El `type` lo fija el servidor. El formulario no lo manda, y **tampoco lo elige la dueña**: el canal se decide por el lugar desde donde se vende.

## Objetivo

Una sola pantalla que registre una venta en mostrador o por WhatsApp, con los artículos dinámicos, el campo de banco condicional y los errores de validación que dicen qué campo corregir.

## Alcance

- Crear `frontend/src/pages/sales/new.astro`.
- Crear `frontend/src/pages/sales/new.css`.
- Ampliar `frontend/src/lib/errors.ts` con el mapa de errores de validación del formulario.

**Archivos tocados:** `frontend/src/pages/sales/new.astro` (nuevo), `frontend/src/pages/sales/new.css` (nuevo), `frontend/src/lib/errors.ts`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| El listado de ventas | Es `tasks/frontend/04-pantalla-de-ventas.md`. |
| El selector de venta del formulario de paquete | Es `tasks/frontend/06-pantalla-de-paquetes.md`, y el paquete es el que guarda la referencia. |
| Editar una venta existente | El contrato no lo permite, y los importes cobrados no se editan. |
| Un selector de artículos desde un catálogo | No hay catálogo. La mercadería es texto libre. |
| Subir imágenes | No hay almacenamiento de archivos en el contrato. |
| Un asistente de varios pasos | Un formulario de una pantalla es más rápido que tres pasos, y son siete campos. |
| Guardar borradores | El navegador pierde la página al recargar y no hay dónde guardar. Una venta de tres campos se reescribe en veinte segundos. |
| Un selector de cliente desde una lista de clientes | No hay tabla de clientes. |
| Enviar la venta por correo o WhatsApp | Se registra; el contacto lo hace la dueña por su cuenta. |
| Un total calculado en vivo con aritmética de `number` | El total lo calcula el servidor. El formulario puede **mostrar** un estimado mientras se escribe, pero ese número es una ayuda visual, no el valor que se guarda. |
| Agregar un endpoint de artículos reutilizables | No está en el contrato de 13 endpoints. |
| Validar con una biblioteca de formularios | Zod corre en el backend. En el cliente, `required` y `pattern` nativos, más la traducción de la respuesta. |

## Tareas

1. Crear `frontend/src/pages/sales/new.astro` con el `Layout`, el título "Nueva venta" y `activeSection="sales"`.
2. En la pantalla, decidir el canal **una sola vez**, con un `hidden` que valga `live` o `whatsapp`, tomado de un parámetro de la URL: `/sales/new?type=whatsapp`. El canal no se elige con un control visible.
3. **Por qué el canal viene de la URL y no de un `<select>`.** La dueña registra una venta de mostrador en mostrador y una de WhatsApp sentada en el escritorio. Un control que se elige a mano se equivoca una vez, y esa venta queda con el tipo equivocado para siempre, porque no hay forma de corregirlo. La URL la pone quien llega, y el servidor confirma.
4. En la misma pantalla, mostrar el canal como un texto informativo y **no** como un campo editable. "Venta de mostrador" o "Venta por WhatsApp", con el ícono correspondiente.
5. Crear los campos del formulario: `customer_name`, `product_name`, `payment_method`, `payment_bank`, `sale_date`, `status` y `cost`.
6. En el campo de `cost`, usar `type="text"` con `inputmode="decimal"` y `pattern`, **no** `type="number"`. El `input type="number"` de los navegadores con configuración regional española muestra la coma como separador, la envía como punto, y el usuario ve un valor distinto del que escribió. Un `inputmode` con `pattern` deja escribir y valida.
7. En el campo de `cost`, **no normalizar el valor antes de enviarlo.** Se envía la cadena tal como se escribió y la valida `MONEY_PATTERN` en el backend. Convertir en el cliente reintroduce el punto flotante en el punto exacto donde se quiere evitar.
8. En el campo de `sale_date`, usar `type="date"`, que entrega `YYYY-MM-DD`. **El `<input type="date">` no tiene zona horaria**, y por eso el valor se convierte a ISO con `T00:00:00.000Z` antes de enviarse. Sin esa conversión, un `new Date("2026-09-28")` se interpreta en hora local y la venta queda corrida un día en las zonas con desplazamiento negativo.
9. En el campo de `sale_date`, **precargar con la fecha de hoy en hora local**, no con `new Date().toISOString().slice(0,10)`. Ese segundo es el día en UTC, y a las nueve de la noche en Colombia ya es el día siguiente. La dueña registra una venta de hoy y la ve archivada en mañana.
10. En el campo de `status`, usar un `select` con los tres estados, con `pending` por defecto. **Una venta que se está registrando todavía no se cobró**, y el estado es la primera de las dos cosas que la dueña tiene que cambiar a mano después de cobrar.
11. En el campo de `payment_method`, usar un `select` con `cash` y `credit_card`. **Solo dos opciones**, que son las que acepta el enum. Agregar "transferencia" sería ofrecer algo que el backend rechaza.
12. En el campo de `payment_bank`, **renderizarlo oculto y mostrarlo solo cuando `payment_method` sea `credit_card`**, con un `required` que se agrega y se quita en el mismo momento.
13. En el campo de `payment_bank`, **al cambiar de tarjeta a efectivo, limpiar el valor.** Un banco escondido con contenido produce el `400` "Payment bank is only allowed for credit card payments", y el mensaje es correcto pero la dueña no ve por qué.
14. Crear la sección de artículos adicionales, **visible solo cuando el canal es `whatsapp`**, con un botón "Agregar artículo".
15. En la sección de artículos, cada fila tiene nombre, descripción, cantidad e importe. **La descripción es opcional y la cantidad tiene valor por defecto 1.**
16. En la sección de artículos, **el botón "Agregar artículo" no crea una fila vacía al cargar la página.** Las filas aparecen cuando la dueña las pide. Tres filas vacías en pantalla dicen "esto hay que llenarlo" antes de que nadie haya decidido si hay artículos.
17. En la sección de artículos, el botón "Quitar" de cada fila **no aparece en la última fila que queda**, o deshabilita el botón completo cuando hay una sola. Una fila de artículos sin nada no es un artículo.
18. En la sección de artículos, **no calcular el total con aritmética de `number`.** Si se muestra un estimado mientras se escribe, se hace con la misma lógica de concatenación de `formatMoney` de `tasks/frontend/01`, no con `parseFloat`. El estimado se marca como preliminar y desaparece al enviar.
19. En la sección de artículos, **el estimado es opcional.** Si su implementación cuesta más de unas pocas líneas o introduces una aritmética dudosa, quitarlo. El servidor devuelve el total real en la respuesta y la pantalla lo muestra después del envío.
20. En el `submit`, validar en el cliente lo que el navegador puede validar: los campos `required`, el `pattern` del importe y el del banco cuando es tarjeta.
21. En el `submit`, **deshabilitar el botón y mostrar "Guardando..."** mientras la llamada está en vuelo. Un doble clic envía dos ventas, y como no hay forma de borrar una venta, la segunda queda registrada para siempre.
22. En el `submit`, **no limpiar el formulario antes de saber el resultado.** Si el `POST` falla, los datos escritos siguen ahí. Borrar el formulario y después fallar es perder veinte segundos de tipeo.
23. En el `submit`, con éxito: **redirigir a `/sales`** (el listado), donde la venta recién creada aparece en la primera fila y desde ahí se abre su detalle (`/sales/detail?id=<uuid>`). El código hace `window.location.assign("/sales")`; la intención original de llevar al detalle quedó como deriva registrada en H-09 de `qa/tests/cases/README.md`.
24. En el `submit`, con error: **mostrar el mensaje de `getErrorMessage` en la parte superior del formulario** y desplazar la vista al principio.
25. En el error de validación, **extraer el campo del prefijo del mensaje.** El backend responde `"cost: Invalid money format"`, y el formulario tiene que ubicar el error en el campo `cost` y no en un banner genérico. `errors.ts` expone `getFieldErrors(message)` que parte el prefijo antes de los dos puntos.
26. En el error de validación, **marcar el campo con `aria-invalid="true"` y mostrar el mensaje junto al campo**, no solo en el banner. Un formulario con el error arriba y el formulario abajo obliga a la dueña a buscar cuál de los siete campos falló.
27. En el error de validación de un artículo dinámico, marcar **la fila concreta**, con el índice. El backend reporta `additional_items.0.name: ...` y ese índice es el que dice qué fila tiene el problema.
28. En el error de negocio —"Payment bank is required for credit card payments"—, **mostrarlo junto al campo del banco**, que es donde está el problema, y no como un error general del formulario.
29. Crear `frontend/src/pages/sales/new.css` con lo específico: el ancho del formulario, la fila de artículo con su botón de quitar, el espacio de los mensajes de error y el tratamiento del canal informativo.
30. En el `new.css`, **no re-declarar tokens.** Todo sale de `global.css`.
31. En la pantalla, poner un enlace "Volver a ventas" con la clase `no-print`, arriba del formulario.
32. Ejecutar `pnpm --filter shpr-web build` y confirmar que la pantalla compila.
33. Verificar en el navegador los seis casos que importan: venta en efectivo sin artículos, venta en efectivo con artículos, venta con tarjeta y banco, venta con tarjeta y sin banco, venta a las once de la noche para comprobar que la fecha precargada es la local, y venta con un importe mal escrito para ver el error junto al campo.
34. Ejecutar `pnpm --filter shpr-web build` y confirmar que la pantalla compila.
35. Ejecutar `pnpm --filter shpr-web test` y confirmar que las pruebas de `errors.ts` siguen pasando, incluida la de `getFieldErrors`.

## Criterios de Done

- [x] `frontend/src/pages/sales/new.astro` y `frontend/src/pages/sales/new.css` existen.
- [x] El canal se toma de `?type=` y se manda como `hidden`. No hay un control visible para elegirlo.
- [x] Con `?type=live`, la sección de artículos **no se renderiza**, y mandarla igualmente produce el `400` con `value: Unrecognized key(s) in object: 'additional_items'` — el prefijo `value: ` lo pone siempre el sobre de error y `getFieldErrors` lo vuelve a separar para mandarlo al banner.
- [x] El campo de importe es `type="text"` con `inputmode="decimal"`, **no** `type="number"`.
- [x] El valor del importe se envía tal como se escribió, sin pasar por `parseFloat` ni por `Number`.
- [x] `sale_date` se precarga con la fecha local de hoy, y a las 23:30 muestra el día correcto, no el siguiente.
- [x] El `select` de forma de pago tiene **exactamente dos** opciones.
- [x] El campo de banco aparece solo con tarjeta, es `required` en ese caso, y **se limpia** al volver a efectivo.
- [x] El `select` de estado tiene `pending` por defecto.
- [x] La sección de artículos arranca vacía, y "Agregar artículo" agrega la primera fila.
- [x] Quitar la última fila que queda deja la sección sin una fila de artículo vacío.
- [x] El botón de envío se deshabilita y muestra "Guardando..." durante la llamada, y **vuelve a habilitarse en el `finally`**.
- [x] Un doble clic rápido produce **una sola** venta creada.
- [x] Un `POST` fallido **deja los datos escritos en el formulario**.
- [x] Un `POST` exitoso redirige a `/sales` (el listado), no al detalle (deriva H-09).
- [x] Un error de validación de `cost` aparece **junto al campo `cost`**, con `aria-invalid="true"`, y no solo en un banner arriba.
- [x] Un error de validación de `additional_items.0.name` marca **la primera fila** del artículo.
- [x] "Payment bank is required for credit card payments" aparece junto al campo del banco.
- [x] `getFieldErrors("cost: Invalid money format")` devuelve `{ cost: "Invalid money format" }`.
- [x] `grep -c "parseFloat" frontend/src/pages/sales/new.astro` devuelve `0`.
- [x] `grep -c "#[0-9a-fA-F]\{3,6\}" frontend/src/pages/sales/new.css` devuelve `0`. Los colores salen de los tokens.
- [x] `pnpm --filter shpr-web build` termina con código de salida `0`.
- [x] `pnpm --filter shpr-web test` pasa el 100%.
- [x] `pnpm --filter shpr-web typecheck` termina con código de salida `0`.

### Evidencia — AUD-16 (`frontend/05`)

#### CORR-17 — el mensaje del 400 estaba citado sin el prefijo que siempre lleva

El criterio 85 dice que mandar `additional_items` en una venta live produce el 400
con `Unrecognized key(s) in object: 'additional_items'`. Comprobado contra el
backend en vivo:

```
POST /api/v1/sales/live  {"customer_name":…,"additional_items":[…]}
→ 400 {"code":"BAD_REQUEST","message":"value: Unrecognized key(s) in object: 'additional_items'"}
```

El `400` y el texto están, peroIODO precedido de `value: `. Ese prefijo no es ruido:
es el sobre de error diciendo que la clave rechazada está en la raíz del objeto, y
`getFieldErrors` lo usa para decidir si el error es de campo o de banner — hay una
prueba que lo cubre (`errors.test.ts:70`). Un criterio que cita el mensaje sin el
prefijo induce a escribir la prueba mal.

La primera medición salió `Unrecognized key(s) in object: 'status', 'additional_items'`,
porque el payload de prueba llevaba también `status`, que una venta live
tampoco acepta. Vale dejarlo anotado: el rechazo es real y del mismo mecanismo,
pero la cita del criterio es por clave y conviene repetir la petición sin ruido.

#### El 95 se cumple sin bandera propia, y conviene saber por qué

El criterio pide que un doble clic rápido produzca **una sola** venta. No hay
ningún `isSaving` ni `submitting` en el código. La guarda es el propio `disabled`:

```js
submitBtn.disabled = true
setText(submitBtn, "Guardando…")
let created = null
try { created = await salesApi.createLive(payload) } finally { submitBtn.disabled = false }
```

Suficiente, y no por casualidad: desde `preventDefault()` hasta el `await` **no hay
punto de rendimiento**. El hilo de JavaScript no cede el control, así que el
segundo clic no puede despacharse hasta que el botón ya está deshabilitado —y un
control deshabilitado no dispara `click`. El orden importa; si el `disabled`
estuviera después del `await`, dos ventas.

#### El 92, comprobado contra el HTML emitido y no contra el fuente

El fuente tiene tres apariciones de `data-item-row` y eso sembró dudas: ¿la sección
arranca con filas? No. La fila viaja dentro de un `<template>`:

```html
<template id="item-row-template">
  <div class="item-row" data-item-row>
```

Y el build emite `<div data-item-row>` **1** vez —la del template, que es contenido
inerte— y `<template>` una. `data-items-list` sale como `</div>` vacío. La fila se
clona desde el template, sin inyectar cadenas, que además es la forma segura.

El 93 se apoya en `setRemoveDisabled()`, que deshabilita "Quitar" cuando
`rows.length === 1`: no se puede dejar la sección con una fila vacía porque no se
puede quitar la única que hay.

#### Una observación que ya no es una observación

`todayLocal()` estaba **copiada cinco veces**: el frontmatter y el script de
`sales/new.astro`, `expenses/new.astro` y `packages/new.astro`. Eran cinco copias
de cinco líneas que ya se habían copiado dos veces, porque el error de
`toISOString()` se descubrió en dos sitios y se corrigió dos veces.

**Resuelto** en `src/lib/date.ts`: cinco imports, cero copias. El motivo es la
propia regla de la arquitectura
(`specs/modules/frontend/01-arquitectura.md:63`) — lo que se repite vive en un
archivo, lo que ocurre una sola vez vive en la página — y ya estaba escrito acá
como cambio propio, con la solución nombrada.

Lo que se sospechaba del `<script>` resultó falso: los `<script>` de Astro se
procesan con Vite y ya importaban de `lib/` en las tres pantallas, así que el
módulo lo sirve igual que al frontmatter. **Un solo módulo, importado dos veces en
la misma página**, y en el build sale como chunk compartido entre las tres
pantallas en vez de tres copias.

De paso salió un defecto real: `/expenses/new` precargaba la fecha solo con el
snapshot de build, sin el refresco en runtime que sí tenían `sales/new` y
`packages/new`. En un sitio estático servido por días, registrar un gasto tres
días después del build lo fechaba tres días antes. El criterio 97 de
`frontend/07` decía "hoy" y solo se cumplía en el minuto de la compilación —
la misma trampa que CORR-12, un nivel más adentro. Corregido con el mismo helper.

#### Lo verificado sin hallazgos

| Criterio | Evidencia |
| --- | --- |
| 83 | `new.astro` y `new.css` presentes |
| 84 | `<input type="hidden" name="type" data-canal-input>` y **0** select/radio de canal |
| 86 | `cost` y el total de artículo: `type="text" inputmode="decimal"`; `quantity` sí es `number`, que es lo correcto |
| 87 | `cost: …?.value ?? ""`, **0** `parseFloat` |
| 88 | `getFullYear/getMonth/getDate`, no `toISOString()` — en `src/lib/date.ts`, con 5 tests propios; el caso de las 23:30 local es un test, no una nota |
| 89 | `payment_method` con **2** opciones; los 5 `<option>` del archivo son 2 de pago + 3 de estado |
| 90 | `bankInput.hidden = !isCard`, `required = isCard`, y `value = ""` al volver a efectivo |
| 91 | `<option value="pending" selected>` |
| 94 | `Guardando…` + `disabled`, y el `finally` los revierte |
| 96 | el `catch` no limpia el formulario, con el comentario que lo dice |
| 97 | `window.location.assign("/sales")` (deriva H-09: no lleva al detalle) |
| 98-100 | `paintFieldError` pone `aria-invalid="true"` + texto + destapa; las tres pruebas de `getFieldErrors` están en `errors.test.ts` |
| 102 | `grep -c parseFloat` → **0** |
| 103 | `grep -cE '#[0-9a-fA-F]{3,6}' new.css` → **0** |
| 104-106 | `build` exit 0; `test` **56/56**; `astro check` 0 errores, 0 hints |

`frontend/05` queda **24/24**.
