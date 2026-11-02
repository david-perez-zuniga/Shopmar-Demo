# Pruebas del frontend

## Qué se prueba y qué no

El frontend tiene **lógica de presentación**, no lógica de negocio. La regla que decide es una sola: *si el backend valida algo, no se prueba en el frontend; si el backend no puede saberlo, se prueba*.

| Se prueba | No se prueba |
|-----------|--------------|
| `formatMoney` con entradas válidas e inválidas | Que el formulario de venta envíe los campos correctos (el backend lo rechaza si no) |
| `formatDate` y las funciones de etiqueta de enum | Que la tabla de ventas pinte bien las filas (eso es una plantilla) |
| Los helpers de `dom.ts` | El ancho responsive de la barra lateral |
| El orden de los parámetros en `URLSearchParams` | La appearance de un `confirm()` nativo |
| El manejo de `ApiError` en `api.ts` con un `fetch` simulado | Un recorrido completo de la interfaz |

La segunda columna es la que sorprende. Un panel de nueve vistas CRUD sin estado global no necesita Playwright: lo que hay que verificar ya está verificado por las pruebas del backend, y lo que queda —el ancho de una columna, el texto de un botón— no falla de una forma que valga una suite.

## Herramientas

El andamiaje de `fwinit` no dejó herramienta de pruebas en el frontend. Se agrega **una sola**:

| Herramienta | Motivo |
|-------------|--------|
| **Vitest** | Ya está en el backend. La misma herramienta, la misma configuración por proyecto, un solo `vitest` que corre los dos paquetes. No hay una razón real para que las pruebas de `formatMoney` usen una herramienta distinta de las del servicio de ventas. |
| `@vitest/coverage-v8` en modo `--coverage` | Solo cuando se pide explícitamente. No se agrega a `test` para no pagar la instrumentación en cada ejecución. |
| `jsdom` | Necesario para probar `dom.ts`, que toca `document`. Las dos funciones de `format.ts` son puras y no lo requieren. |

**No** se agrega Playwright, ni Testing Library, ni jsdom-global-setup, ni `@happy-dom`. Tres dependencias de prueba para un panel sin lógica de negocio sería más código de configuración que código probado.

## Configuración

`frontend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
})
```

`package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "astro check"
  },
  "devDependencies": {
    "vitest": "^4.0.0",
    "jsdom": "^28.0.0"
  }
}
```

El script `check` es `astro check`, que es el verificador de tipos y de plantillas de Astro. No es una prueba: es el equivalente frontend de `tsc --noEmit`, y el andamiaje ya traía `@astrojs/check` como dependencia de desarrollo.

## Archivos de prueba

Los archivos de prueba son `*.test.ts` colocados junto al módulo que prueban; `src/lib/fixtures/` guarda datos, no pruebas.

| Archivo | Qué cubre | Casos |
|---------|-----------|--------|
| `format.test.ts` | `formatMoney`, `formatDate`, las cuatro tablas de etiquetas de enum | 18 |
| `api.test.ts` | `apiFetch` con un `fetch` simulado | 7 |
| `dom.test.ts` | `qs`, `on`, `setText`, `clear` | 6 |
| `types.test.ts` | Verificación de tipos de los importes como `string` | compilación, sin casos en ejecución |

## `format.test.ts` — el archivo que más valor tiene

`formatMoney` es la función donde un error se traduce directamente en un número mal mostrado. Y es la contraparte en el cliente de la decisión D-003: si alguien "simplifica" la función con `Number(value).toLocaleString()`, los centavos dejan de cuadrar y ninguna prueba de integración lo detecta.

```ts
import { describe, expect, it } from "vitest"
import { formatMoney, formatDate, saleStatusLabel } from "../format"

describe("formatMoney", () => {
  it("agrupa los miles con punto y el decimal con coma", () => {
    expect(formatMoney("1250.50")).toBe("C$ 1.250,50")
    expect(formatMoney("4837500.00")).toBe("C$ 4.837.500,00")
  })

  it("no pierde centavos cuando el valor no trae decimales", () => {
    expect(formatMoney("80")).toBe("C$ 80,00")
  })

  it("devuelve el valor tal cual si no cumple el patrón", () => {
    expect(formatMoney("")).toBe("")
    expect(formatMoney("no es un número")).toBe("no es un número")
  })

  it("no usa punto flotante: el resultado es exacto", () => {
    // 0.1 + 0.2 = 0.30000000000000004 en IEEE 754
    expect(formatMoney("0.30")).toBe("C$ 0,30")
  })
})
```

| Caso | Entrada | Salida esperada | Por qué importa |
|------|---------|-----------------|------------------|
| Separadores | `"4837500.00"` | `"C$ 4.837.500,00"` | El formato es la primera lectura de un número monetario |
| Sin decimales | `"80"` | `"C$ 80,00"` | La API puede devolver `"80"` de PostgreSQL; el panel no puede mostrar `C$ 80` junto a `C$ 1.250,50` |
| Con un solo decimal | `"1250.5"` | `"C$ 1.250,50"` | Un `Decimal` de PostgreSQL puede serializarse sin el segundo decimal |
| Entrada inválida | `"abc"` | `"abc"` | La función no lanza; devuelve lo que recibió, para que un dato raro no rompa la pantalla |
| Cero | `"0.00"` | `"C$ 0,00"` | El dashboard con un rango sin datos muestra cero, no un hueco |
| Centavos que no se pierden | `"0.30"` | `"C$ 0,30"` | La prueba que vigila la decisión D-003 |
| Etiqueta de enum | `"credit_card"` | `"Tarjeta de crédito"` | La traducción vive en un solo lugar |
| Enum desconocido | `"bitcoin"` | `"bitcoin"` | Si la API agrega un valor, la pantalla no revienta; muestra el valor crudo |

## `api.test.ts` — la frontera de la red

Siete casos con un `global.fetch` sustituido por un `vi.fn()`. Lo que se verifica es el contrato del sobre de error y la construcción de la URL, no la respuesta de la API real.

| Caso | Configuración | Verificación |
|------|---------------|--------------|
| Éxito con cuerpo | `fetch` resuelve con `ok: true` y un JSON | Devuelve el objeto tipado |
| Prefijo de la URL | `fetch` es espiado | La llamada es `C$ {PUBLIC_API_URL}/api/v1/dashboard/summary` |
| Error del servidor | `ok: false`, `status: 500`, cuerpo `{ code: "INTERNAL_ERROR" }` | Lanza `ApiError` con `code: "INTERNAL_ERROR"` y `status: 500` |
| Error de validación | `ok: false`, `status: 400`, cuerpo `{ code: "BAD_REQUEST", message: "cost: ..." }` | Lanza `ApiError` con el código del servidor |
| Red caída | `fetch` rechaza | Lanza `ApiError` con `code: "NETWORK_ERROR"` y `status: 0` |
| Cuerpo no JSON | `ok: false` y `.json()` falla | Lanza `ApiError` con `INTERNAL_ERROR`, no con un error de parseo |
| Respuesta vacía | `ok: true`, `status: 204` | Devuelve `undefined` sin llamar a `.json()` |

El caso de "red caída" es el que más importa en la práctica: la API vive en otro proceso de la red local, y que se caiga es un escenario normal, no una excepción. La interfaz necesita distinguir "no pude conectarme" de "el servidor tuvo un error", y esa distinción nace exactamente en este archivo.

## `dom.test.ts` — los cuatro helpers

Seis casos con un `document.body` construido en cada prueba. La clave es que cada prueba arma su propio DOM y no depende del orden.

| Caso | Verificación |
|------|--------------|
| `qs` encuentra un elemento por selector | Devuelve el elemento, no `null` |
| `qs` devuelve `null` cuando no existe | No lanza |
| `qs` acepta un `root` distinto de `document` | Encuentra dentro de un contenedor creado en la prueba |
| `on` registra el manejador | Un `click` dispara la función exactamente una vez |
| `setText` escribe el contenido | `textContent` es el texto pasado, y no interpretando HTML |
| `clear` vacía el contenedor | `replaceChildren()` deja cero hijos |

`setText` usa `textContent` y no `innerHTML`. Es la diferencia entre escribir `"Ana & Sons"` y escribir un elemento `<script>` con ese contenido. En un panel donde los nombres de cliente son texto libre de la dueña, esa línea de código es la que evita un XSS, y por eso tiene una prueba.

## `types.test.ts` — la defensa de D-003 a nivel de tipos

No es un archivo de pruebas en ejecución: es un archivo que **no compila** si alguien cambia un tipo.

```ts
import type { IDashboardSummary } from "../types"

// La prueba es la propia anotación del tipo.
const resumen: IDashboardSummary = {
  total_revenue: "4837500.00",   // string, no number
  sales_count: 128,
  total_expenses: "124530.00",
  pending_packages_count: 17,
}

// @ts-expect-error  los importes no pueden ser number
const invalido: IDashboardSummary = { ...resumen, total_revenue: 4837500 }
```

El `@ts-expect-error` es la prueba: si alguien cambia `total_revenue` a `number`, el archivo deja de compilar y `astro check` falla. Es la forma más barata de proteger una decisión arquitectónica, y no requiere un solo `it()`.

## Qué se verifica sin pruebas automáticas

| Aspecto | Cómo se verifica |
|---------|------------------|
| Las rutas del panel existen y responden | `pnpm build` y `ls dist/*.html dist/*/index.html`: están las rutas fijas de `01-arquitectura.md`, incluida `sales/detail/index.html` (el detalle es una sola página estática desde D-017) |
| No hay clases de CSS sin usar | `astro check` más una revisión de `global.css` |
| El contraste cumple AA | Los ratios están calculados en `02-design.md`; se revisan contra los tokens |
| El `focus-visible` está en todo lo interactivo | Una regla global lo cubre; no hay `outline: none` en el repositorio |
| El panel se ve bien con movimiento reducido | El bloque `prefers-reduced-motion` es global; verificar con la preferencia activada |
| La factura imprime solo ella | `@media print` en `src/styles/print.css`; verificar con la vista de impresión del navegador |

La fila del `dist/` es la prueba de que el sistema de rutas está completo, y es la que falla si alguien olvida una ruta. No necesita un framework: `ls dist/*.html dist/*/index.html` y comprobar que cada ruta fija de `01-arquitectura.md` tiene su archivo. El conteo exacto **sí** sirve como invariante: el detalle es una sola página estática desde D-017 —no una por venta— y las rutas del panel son las nueve de `PANEL_ROUTES` más `/offline`, el 404 y `/summary`, así que el total del build no depende de la base de datos.

## Por qué no hay Playwright

Seis razones concretas, no unachew resta genérica:

1. **No hay lógica de negocio en el navegador.** Todo lo que un recorrido end-to-end verificaría —el importe de la venta, el total, el filtro por fecha, el borrado lógico— ya está cubierto por las pruebas de los servicios y repositorios del backend.
2. **Serían siete recorridos para un panel de un usuario.** El volumen de pruebas de navegador crece con el número de pantallas, y la cobertura que aporta aquí es marginal frente a su costo de mantenimiento: un `pnpm build` de Astro que falla por un error de plantilla ya atrapa la mayoría de los errores de construcción.
3. **Cada dependencia de navegador en un sistema sin framework es una decisión grande.** Playwright arrastra sus navegadores (~300 MB), su servidor de pruebas y su modelo de asincronía. El frontend no tiene nada de eso.
4. **El fallo que más se cuela en un panel estático es un error de plantilla, y `astro check` lo detecta.** Un `undefined` en una expresión de Astro, una prop que no existe, un import mal escrito: todos son errores de compilación, no de ejecución.
5. **La decisión es revisable.** Cuando haya un flujo con estado real entre pantallas —por ejemplo, si la v2 introduce un store con caché— esta decisión se revisa y se agrega Playwright. La decisión no es "nunca habrá pruebas de navegador", es "no las hay mientras no haya estado en el cliente".
6. **El presupuesto de dependencias del frontend es cero.** Las únicas son `astro` y `lucide-astro`. Playwright y Testing Library rompen ese presupuesto por sí solos; `vitest` y `jsdom` para las pruebas unitarias son el precio de poder verificar la aritmética del dinero, y ese precio vale la pena pagarlo.

**Nota (decisión D-010):** estas seis razones gobiernan **dentro del paquete frontend** —dónde vive el código y qué dependencias declara `frontend/package.json`— y siguen vigentes: `frontend/package.json` no gana ninguna dependencia. La verificación de flujos completos en el navegador existe, pero como **proceso externo**: Playwright corre desde el workspace `qa/` (ver `modules/qa/` y sus tareas en `tasks/qa/`), con su propia dependencia de desarrollo y su salida en `qa-results/`. Ninguna de las seis razones se contradice: ninguna decía "no hay que verificar", decía "no hay que verificar desde el paquete frontend".
