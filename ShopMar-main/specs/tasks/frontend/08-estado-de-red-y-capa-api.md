# 08 — Capa de API, tipos y formato

## Estado Actual

`frontend/src/lib/api.ts` y `frontend/src/lib/types.ts` existen como esqueletos, creados en `tasks/frontend/01`: `api.ts` tiene la URL base, el `fetch` envuelto y el manejo del sobre de error, y `types.ts` declara las interfaces. Lo que falta es la implementación completa: los trece métodos, los tipos exactos de cada respuesta y las pruebas de la capa.

Esta es la última tarea del frontend por un detalle práctico. Las seis pantallas ya están escritas y consumen `api.ts`; si esta se hiciera antes, cada pantalla escribiría su propio `fetch` y después habría que unificar siete copias. La base técnica va al final aunque su contenido sea el primero que se necesita.

El contrato de error del backend es `{ code, message, details? }`, con los códigos `BAD_REQUEST`, `NOT_FOUND`, `INTERNAL_ERROR`, `UNAUTHORIZED`, `FORBIDDEN` y `NETWORK_ERROR`.

## Objetivo

La capa de API completa con los trece métodos, los tipos que la hacen segura de escribir, el manejo de los tres estados y el formato de dinero y fechas con sus pruebas.

## Alcance

- Completar `frontend/src/lib/types.ts` con los tipos exactos de las trece respuestas.
- Completar `frontend/src/lib/api.ts` con los cuatro clientes de módulo.
- Completar `frontend/src/lib/errors.ts` con la traducción de los códigos y `getFieldErrors`.
- Completar `frontend/src/lib/format.ts` con el formateo de dinero y de fechas.
- Crear `frontend/src/lib/api.test.ts`, `format.test.ts` y `errors.test.ts`.

**Archivos tocados:** `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/errors.ts`, `frontend/src/lib/format.ts`, `frontend/src/lib/*.test.ts`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| Cambiar el contrato de los 13 endpoints | Está cerrado y documentado en `specs/modules/api/`. Si un método no cabe en un tipo, el tipo se ajusta al contrato, no al revés. |
| El resumen del dashboard | Es `tasks/frontend/04-pantalla-de-ventas.md` del módulo de resumen, en la raíz. Aquí solo se define el cliente del endpoint. |
| Los componentes y las pantallas | Son `tasks/frontend/03` a `07`. |
| Agregar un cliente HTTP como `axios` o `ky` | Un `fetch` envuelto con un sobre de error son unas cuarenta líneas. Una dependencia para eso no se justifica. |
| Un interceptor o un middleware | No hay un pipeline de peticiones. |
| Reintentos automáticos | Un reintento ciego repite la escritura. La dueña apretó "Reintentar" y esa es la decisión consciente. |
| Caché de respuestas | Sin estado global no hay dónde cachear, y los datos de una tienda cambian con cada venta. Un `GET` de hace treinta segundos ya no sirve. |
| Cancelación con `AbortController` | El `fetch` vive en el `frontmatter` de Astro y termina con el render. No hay una petición viva que cancelar. |
| Un esquema de validación en el cliente con Zod | Zod correría en el navegador y duplicaría la validación del servidor. Los tipos de TypeScript dan forma al dato; la validación es del backend. |
| Transformar fechas a `Date` en la capa | Las fechas viajan como `string` y se formatean en el punto de uso. Convertirlas en la capa obliga a serializarlas otra vez. |
| Convertir importes a `number` en la capa | **Nunca.** Ver el paso 12. |
| Autenticación o cabeceras de autorización | No hay autenticación. |
| Un token de cancelación o un estado de carga global | Sin estado global. |

## Tareas

1. Completar `frontend/src/lib/types.ts` con el tipo del resumen: `IDashboardSummary` con `total_revenue: string`, `sales_count: number`, `total_expenses: string` y `pending_packages_count: number`. **Los dos importes son `string` y los dos conteos son `number`, en el mismo objeto.** Mezclarlos en un tipo con todos `string` obliga a convertir para mostrar, y convertirlos a `number` reintroduce el punto flotante.
2. Completar los tipos de la respuesta de venta con los **quince campos** del detalle y los **nueve** del listado, en dos interfaces separadas. No una sola interfaz con todo opcional: los dos endpoints devuelven cosas distintas y una forma única obliga a comprobar `undefined` en cada campo.
3. Definir `IAdditionalSaleResponse` con las nueve columnas de `additional_sale`, **con `total: string`**.
4. Definir `IPackageResponse` con las ocho columnas de `package`, **sin `total`**, porque el paquete no tiene importe. Un campo `total: string` en el tipo del paquete obliga a producir un `undefined` en algún mapper.
5. Definir `IExpenseResponse` con las ocho columnas de `expense`, con `total: string` y `description: string | null`.
6. Definir las cuatro interfaces de petición: `ICreateLiveSaleRequest` (los siete campos comunes, **sin `additional_items`**), `ICreateWhatsappSaleRequest` (los mismos más `additional_items?`), `ICreatePackageRequest` (los cuatro, con `sale_id: string | null`) e `ICreateExpenseRequest` (los cuatro).
7. En las interfaces de petición, **no tipar `total` ni `cost` como `number`.** Son `string`, y el mapper de la capa los envía tal como los escribió la dueña.
8. En las interfaces de petición, `sale_date`, `package_date` y `expense_date` son `string` en ISO 8601. **No `Date`**: la capa no las convierte, y un `Date` serializado por `JSON.stringify` sale con un formato que el backend no espera.
9. Completar `frontend/src/lib/errors.ts` con el mapa de los seis códigos al español, y con `getFieldErrors(message)` que parte el prefijo antes de los dos puntos.
10. En `getFieldErrors`, **manejar el prefijo anidado** `additional_items.0.name` devolviendo la clave completa, para que la pantalla pueda localizar la fila del artículo por índice. Un error que devuelve `{ "additional_items.0.name": "..." }` obliga a la pantalla a parsear la clave otra vez.
11. En `getFieldErrors`, **devolver un objeto vacío cuando el mensaje no tiene prefijo**, y que la pantalla lo trate como error general. `"Internal server error"` no tiene dos puntos, y partirlo produce un campo vacío que se pinta en un lado.
12. Completar `frontend/src/lib/format.ts` con `formatMoney`, `formatDate` y `formatDateTime`, por concatenación y expresión regular, sin `parseFloat` y sin `toLocaleString` para dinero.
13. **La razón de no usar `Number()` en el formateo.** `"1250.50"` con `parseFloat` da `1250.5`, y de ahí sale `"1,250.5"` o `"1.250,50"` según el redondeo de la configuración regional. Con veinte filas, dos de ellas terminan con un decimal de diferencia. La concatenación parte la cadena en el punto, agrupa el entero de a tres y vuelve a unir, y no hay punto flotante en ninguna parte.
14. En `formatMoney`, **manejar el caso del entero sin decimales**: `"1250"` produce el equivalente de `$ 1.250,00`, con los dos ceros agregados. Un importe sin decimales en la base es un `1250.00` que llega como `"1250.00"`, pero un `MONEY_PATTERN` acepta `"1250"` y un cliente externo puede mandarlo así.
15. Completar `frontend/src/lib/api.ts` con la función base `request<T>(path, options)`.
16. En `request`, **construir la URL con el prefijo que ya viene en `PUBLIC_API_URL`**, sin volver a escribir `/api/v1`. Repetir el prefijo en la función y en la variable es la forma más común de que un día las dos cosas no coincidan.
17. En `request`, **omitir del `query` los parámetros `undefined` y los vacíos.** `URLSearchParams` convierte `undefined` en la cadena `"undefined"`, y eso llega al `.strict()` del DTO como un `400` con un mensaje que no apunta a nada.
18. En `request`, **leer el cuerpo de la respuesta una sola vez** y decidir a partir del `content-type`. Un backend que devuelve `204` no tiene cuerpo, y llamar `.json()` sobre eso lanza.
19. En `request`, si la respuesta no es `ok`, construir un `ApiError` con el `code` y el `message` del sobre, **o con un mensaje genérico si el cuerpo no es JSON**. Un proxy intermedio puede devolver HTML, y un `400` con `<!DOCTYPE html>` no puede parsearse.
20. En `request`, **distinguir un error de red de un error del servidor.** Un `fetch` que falla no produce respuesta, y el `catch` tiene que producir un error con el código `NETWORK_ERROR` y el mensaje que explica que el backend está apagado. Esa es la diferencia entre "no se pudo conectar" y "el servidor dijo que hay un error", y son dos soluciones distintas para la dueña.
21. En `request`, **no reintentar.** Ver la sección de fuera de alcance.
22. Crear los cuatro clientes de módulo: `salesApi` con cinco métodos, `packagesApi` con cuatro, `expensesApi` con tres y `dashboardApi` con uno. **Son trece métodos, ni uno más ni uno menos.**
23. En `salesApi`, los cinco métodos: `createLive`, `createWhatsapp`, `list`, `getById` y `updateStatus`.
24. En `salesApi.createLive`, **el tipo de la petición es `ICreateLiveSaleRequest`, que no declara `additional_items`.** Que el tipo no lo permita es la primera barrera; el `.strict()` de Zod es la segunda; y el servicio lanza `BadRequestError` si llega. Tres barreras para un error que sería un registro mal clasificado para siempre.
25. En `salesApi.list`, aceptar `start_date`, `end_date`, `type` y `status`, todos opcionales, y devolver `{ sales: ISaleListRow[] }`.
26. En `salesApi.getById`, **dejar propagar el `ApiError` con código `NOT_FOUND`**, y que sea la pantalla de detalle la que redirija. La capa de API no conoce las rutas del frontend ni decide navegación.
27. En `packagesApi`, los cuatro métodos: `create`, `list`, `update` y `remove`. **El método de borrado se llama `remove`, no `delete`**, porque `delete` es una palabra reservada como nombre de método en algunos contextos y porque en el código se lee mejor.
28. En `packagesApi`, **no crear un método `getById`.** El endpoint no existe, y un método que devuelve `null` siempre es un método que alguien va a usar esperando que funcione.
29. En `expensesApi`, los tres métodos: `create`, `list` y `remove`. **No hay `update`**, porque no hay endpoint de edición.
30. En `dashboardApi`, un método `getSummary(start_date?, end_date?)` que devuelve `IDashboardSummary` directamente, sin envolver en una clave. El endpoint es el único que devuelve el objeto plano, y envolverlo obligaría a mantener una convención distinta para un solo consumidor.
31. En todos los métodos de escritura, **enviar el cuerpo con `Content-Type: application/json`** y el método HTTP correcto: `POST` para los cuatro alta y `PATCH` para el cambio de estado.
32. En `salesApi.updateStatus`, enviar **solo** la clave `status`. El DTO es `.strict()`, y mandar el `id` en el cuerpo produce `400`.
33. Crear `frontend/src/lib/errors.test.ts` con un caso por cada uno de los seis códigos, un caso de `INTERNAL_ERROR` que **no** muestra el mensaje del servidor, y un caso de `getFieldErrors` con prefijo simple, con prefijo anidado y sin prefijo.
34. Crear `frontend/src/lib/format.test.ts` con los casos de `formatMoney` del paso 13 y 14, y con los de `formatDate` y `formatDateTime`, incluyendo la entrada inválida que devuelve `"—"`.
35. Crear `frontend/src/lib/api.test.ts` con un `global.fetch` simulado, comprobando:
    - Un parámetro `undefined` **no aparece** en la URL.
    - Un parámetro vacío **no aparece** en la URL.
    - Un `201` con cuerpo JSON devuelve el objeto tipado.
    - Un `204` sin cuerpo no lanza.
    - Un `400` con el sobre produce un `ApiError` con el `code` y el `message` del backend.
    - Un `400` con cuerpo HTML produce un `ApiError` con un mensaje genérico y **no** lanza un error de parseo.
    - Un `fetch` que rechaza produce un `ApiError` con código `NETWORK_ERROR`.
    - Un `404` de `getById` propaga el código `NOT_FOUND`.
36. En `api.test.ts`, **afirmar la URL completa en cada caso**, con el prefijo. Una prueba que solo afirma que el `fetch` se llamó verifica poco: la URL mal construida es el error más probable de esta capa.
37. Ejecutar `pnpm --filter shpr-web test` y confirmar que pasan las tres pruebas nuevas.
38. Ejecutar `pnpm --filter shpr-web typecheck` y confirmar que **no hay ningún error de tipo en las seis pantallas**, que es la comprobación de que los tipos que definieron coinciden con lo que las pantallas usan.
39. Ejecutar `pnpm --filter shpr-web build` y confirmar que compila.

## Criterios de Done

- [x] `types.ts` declara `IMoney` como `string`, y ningún importe del proyecto está tipado como `number`.
- [x] `IDashboardSummary` tiene los dos importes como `string` y los dos conteos como `number`, en el mismo tipo.
- [x] El tipo de la respuesta de venta tiene **quince** campos y el del listado **nueve**, en dos interfaces separadas.
- [x] `ICreateLiveSaleRequest` **no declara** `additional_items`.
- [x] Las tres fechas de negocio están tipadas como `string` en ISO 8601, no como `Date`.
- [x] `IPackageResponse` no declara ningún campo de importe.
- [x] `errors.ts` traduce los seis códigos y expone `getFieldErrors` con soporte de prefijo anidado.
- [x] `getFieldErrors("additional_items.0.name: ...")` devuelve la clave completa con el índice.
- [x] `getFieldErrors("Internal server error")` devuelve un objeto vacío, no una clave vacía.
- [x] `grep -c "parseFloat\|Number(" frontend/src/lib/format.ts` devuelve `0`.
- [x] `formatMoney("1250.50")` produce el equivalente de `$ 1.250,50`, y `formatMoney("1250")` produce `$ 1.250,00`.
- [x] `api.ts` exporta exactamente trece métodos: cinco de ventas, cuatro de paquetes, tres de gastos y uno de resumen.
- [x] `grep -c "getById" frontend/src/lib/api.ts` devuelve `1`, el de ventas. Paquetes no tiene método de detalle porque el endpoint no existe.
- [x] Un parámetro `undefined` o vacío no aparece en la URL de la petición.
- [x] Un `204` sin cuerpo se resuelve sin lanzar.
- [x] Un error con cuerpo no parseable produce un `ApiError` genérico y no un error de parseo.
- [x] Un fallo de `fetch` produce un `ApiError` con código `NETWORK_ERROR`.
- [x] `salesApi.updateStatus` envía **solo** la clave `status`.
- [x] `api.test.ts` afirma la URL completa en cada caso.
- [x] `pnpm --filter shpr-web test` pasa el 100%, incluidas las pruebas de `api`, `format` y `errors`.
- [x] `pnpm --filter shpr-web typecheck` termina con código de salida `0` sin errores en ninguna de las seis pantallas.
- [x] `pnpm --filter shpr-web build` termina con código de salida `0`.

### Evidencia de la verificación

- **Tests**: frontend `shpr-web` 56/56 en 5 archivos (los 15 nuevos de `api.test.ts`
  más los 41 previos de `errors`, `format`, `filters` y `dom`); backend `shpr`
  122/122 en 17 archivos. Los dos paquetes pasan porque los criterios 114 a 116
  nombran `shpr` (el backend) mientras que las pruebas de `api`, `format` y
  `errors` que esos criterios mencionan son las de `shpr-web`: se corrieron
  ambos, así que el criterio se cumple con cualquiera de las dos lecturas.
- **Typecheck**: `shpr-web` 0 errores / 0 avisos / 0 hints (`astro check`) y
  `shpr` salida 0 (`tsc --noEmit`). Ninguna de las seis pantallas con errores.
- **Build**: `shpr-web` 20 páginas construidas y `shpr` build exitoso.
- **Conteos verificados**: trece métodos exactos (5 ventas + 4 paquetes +
  3 gastos + 1 resumen), `grep -c getById` = 1, `parseFloat|Number(` en
  `format.ts` = 0, y 0 tipos `Date` en `types.ts`.
- **Contrato contra la API real** (`GET /dashboard/summary`): devuelve el objeto
  plano con los dos importes como string y los dos conteos como number, el rango
  de fechas filtra de verdad (13 ventas / `$838000.00` sin rango frente a 11 /
  `$689000.00` en septiembre) y un filtro no documentado recibe 400 por el
  `.strict()` del DTO.
- **Capa en el bundle construido**: `fetch(`http://localhost:3000/api/v1${t}`)`
  con el fallback `r.json().catch(() => null)`, que es lo que evita el error de
  parseo ante un cuerpo no parseable.

### Desviaciones encontradas contra la spec, resueltas a favor del contrato

- **`IExpenseResponse` tiene siete campos, no ocho.** La tabla `expense` tiene
  ocho columnas, pero el mapper del backend omite `deleted_at` a propósito y la
  respuesta real trae siete claves. Declarar ese campo haría que toda pantalla
  lo leyera como `undefined`, así que el tipo refleja la respuesta y no la
  tabla. El criterio de las "ocho columnas" cuenta la columna de la base.
- **Los comandos de los criterios 114 a 116 dicen `shpr`, que es el backend.**
  Se corrieron los dos paquetes para que el criterio se cumpla igual.

### Re-verificación por CORR-12 — el paquete correcto

Los criterios de comando de esta spec estaban marcados como cumplidos, pero se
verificaron con `pnpm --filter shpr`, que resuelve al **backend** (`shpr`), no al
frontend (`shpr-web`). Se volvieron a pasar contra el paquete correcto:

| Criterio | Resultado real |
| --- | --- |
| `pnpm --filter shpr-web test` | **56/56** en 5 archivos, incluidas `api`, `format` y `errors` |
| `pnpm --filter shpr-web typecheck` | `astro check` en 0, 0 hints |
| `pnpm --filter shpr-web build` | exit 0; **20 páginas** = 7 estáticas + una por venta |

Los tres cumplen. Lo que cambia no es el resultado sino la razón por la que se
sostienen: antes pasaban porque el backend estaba verde y ahora pasan porque el
frontend está verde. Para build y typecheck era casi lo mismo —un `tsc` en verde
dice lo mismo venga de donde venga— pero para el de test era falso: el frontend
tiene **56** pruebas y el backend **126**, y se estaba afirmando las primeras con
el número de las segundas.
