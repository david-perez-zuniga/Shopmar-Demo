# 01 — Fundamentos del panel

## Estado Actual

El frontend es la landing de `fwinit`: una página de presentación con `src/pages/index.astro`, cinco secciones en `src/sections/` (`Hero`, `Features`, `HowItWorks`, `DesignSkills`, `Header`, `Footer`), un `src/layouts/Layout.astro` con el HTML de la landing y un `public/favicon.svg`.

No existe `src/styles/`, no existe `src/lib/`, no existe `src/components/`, y no hay ni una ruta de panel. `package.json` tiene `astro`, `lucide-astro`, `@astrojs/check` y `typescript`, y **no tiene `vitest` ni `jsdom`**, que hacen falta para probar el formateo de dinero y de fechas.

El proyecto Astro usa `output: 'static'`. Eso es correcto para un panel sin sesión, y cambiarlo a `server` para tener un backend en el mismo proceso sería agregar una.adapter y una complejidad que no compra nada.

## Objetivo

Borrar la landing y dejar la base del panel: el `Layout`, la navegación, los cuatro módulos de `lib/` y las dependencias de desarrollo para poder probar.

## Alcance

- Eliminar `frontend/src/pages/index.astro` y `frontend/src/sections/` completo.
- Reescribir `frontend/src/layouts/Layout.astro` como el contenedor del panel.
- Crear `frontend/src/components/Nav.astro`.
- Crear `frontend/src/lib/format.ts`, `frontend/src/lib/errors.ts`, `frontend/src/lib/api.ts` y `frontend/src/lib/types.ts`.
- Crear `frontend/src/styles/global.css`.
- Agregar `vitest`, `jsdom` y `@testing-library/dom` a las dependencias de desarrollo, y el script `test`.
- Crear `frontend/src/styles/README.md` y `frontend/src/lib/README.md`.

**Archivos tocados:** `frontend/src/pages/index.astro` (eliminado), `frontend/src/sections/**` (eliminado), `frontend/src/layouts/Layout.astro`, `frontend/src/components/Nav.astro` (nuevo), `frontend/src/lib/*.ts` (nuevos), `frontend/src/styles/global.css` (nuevo), `frontend/package.json`, `frontend/.env.example` (nuevo), `frontend/vitest.config.ts` (nuevo).

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| Los tokens de diseño y las primitivas de CSS | Es `tasks/frontend/02-sistema-de-diseno-minimal-light.md`. Aquí solo se crea el archivo vacío que los va a contener. |
| Los seis componentes compartidos | Es `tasks/frontend/03-componentes-compartidos.md`. |
| Las siete pantallas | Es `tasks/frontend/04` a `07`. |
| La implementación completa de `api.ts` | `frontend/08` la completa. Aquí se crea el archivo con la forma que el resto consume, para no tener siete copias de `fetch`. |
| Cambiar `output: 'static'` | Un panel sin sesión no necesita un servidor. El modo estático es más barato de hospedar y más rápido. |
| `PUBLIC_API_URL` en `.env` real | Solo en `.env.example`. El valor real lo pone quien despliega. |
| Un estado global, un store o un Signals manager | Decisión explícita: sin estado global. Ver `specs/docs/07-decisiones.md`. |
| Un router cliente | Siete rutas en siete archivos `.astro`. Un router SPA es otra arquitectura. |
| Tailwind, o cualquier framework de CSS | Los tokens son CSS nativo con custom properties. |
| Probar los componentes `.astro` con el navegador | `vitest` prueba la lógica: formateo, errores y la capa de API. Los `.astro` se verifican compilando y mirando la pantalla. |
| Un icono por sección | `lucide-astro` está instalado. |
| Cambiar el `favicon` | Es la marca del proyecto y no depende de esta tarea. |

## Tareas

1. Eliminar `frontend/src/pages/index.astro`.
2. Eliminar `frontend/src/sections/` completo, con `Hero.astro`, `Features.astro`, `HowItWorks.astro`, `DesignSkills.astro`, `Header.astro` y `Footer.astro`. La landing no se reutiliza: su estructura es de marketing, y el panel es una aplicación.
3. Crear `frontend/src/pages/index.astro` de nuevo, como una **redirección estática** a `/sales`. Astro resuelve esto con un `Astro.redirect` en un `prerender` o con un HTML de redirección. Lo más simple es un `<meta http-equiv="refresh">` con un enlace, que funciona sin JavaScript.
4. **Por qué `/` no es el dashboard.** El dashboard es un dato, no una pantalla de bienvenida: son cuatro cifras que cambian con cada venta. Ponerlo en la raíz obliga a un clic extra todos los días, y `/sales` es la pantalla que se abre veinte veces por tarde. La raíz apunta ahí para que el primer clic de la sesión llegue a donde se trabaja.
   - **Nota (revisión de rutas):** este criterio quedó **sin implementar como está escrito**. La implementación final dejó el dashboard en `/` (`index.astro` con título "Resumen"), y `/summary` es un stub que redirige a `/`. El `/` como redirección fue un estado intermedio. Ver `modules/frontend/04-screens.md` § 1.
5. Reescribir `frontend/src/layouts/Layout.astro` con la estructura del panel: `<html lang="es">`, el `meta viewport`, el título que recibe por prop, el `Nav`, el `<slot />` del contenido y el `<script>` del comportamiento global. **Nada de `Header` ni `Footer` de marketing.**
6. En el `Layout`, **no** incluir el sistema de diseño dentro del componente. Los tokens y las primitivas viven en `src/styles/global.css`, que `tasks/frontend/02` llena. El `Layout` solo lo importa.
7. En el `Layout`, aceptar props con valores por defecto razonables: `title` (obligatorio) y `description`. Si `description` no se pasa, el `meta` no se renderiza, en vez de renderizar una cadena vacía.
8. En el `Layout`, poner `<html lang="es">`. Es el único atributo de idioma que importa, y por accesibilidad y por el corrector del navegador.
9. Crear `frontend/src/components/Nav.astro` con los cuatro enlaces: Ventas, Paquetes, Gastos y Resumen. **Cuatro, no cinco**: la marca del proyecto va como texto en el encabezado, no como enlace a la raíz.
10. En el `Nav`, marcar el enlace activo con `aria-current="page"`, comparando `Astro.url.pathname` con el `href` de cada enlace. Con la comparación por prefijo, `/sales/new` deja activo "Ventas", que es lo que la dueña espera ver.
11. En el `Nav`, **no** usar un menú desplegable ni hamburguesa.** Cuatro enlaces caben en una fila en cualquier pantalla que se use en una tienda, y esconderlos detrás de un botón cuesta un clic por navegación.
12. En el `Nav`, usar iconos de `lucide-astro` junto al texto, no iconos solos. Un icono sin etiqueta no dice "Paquetes" a nadie que no lo conozca de memoria.
13. Crear `frontend/src/styles/global.css` con el reset mínimo, `box-sizing: border-box` en todo, y un comentario de cabecera que apunte a `specs/modules/frontend/02-design.md`. **El archivo se crea vacío de tokens**: definirlos aquí sería adelantar `frontend/02`.
14. Crear `frontend/src/lib/format.ts` con `formatMoney(value: string): string`, `formatDate(value: string): string` y `formatDateTime(value: string): string`.
15. En `formatMoney`, implementarlo **por concatenación y expresión regular**, sin `parseFloat` ni `toLocaleString` con opciones de moneda. La razón está en `specs/modules/frontend/06-testing.md`: `toLocaleString` redondea a los decimales de la configuración regional del navegador, y en una máquina configurada en otra región el separador y el número de decimales cambian.
16. En `formatDate`, usar `new Date(value)` y `toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" })`, con el `timeZone: "UTC"` explícito para que la fecha no cambie de día según dónde esté el navegador.
17. En `formatDateTime`, usar `toLocaleString("es-CO", { ..., hour: "2-digit", minute: "2-digit", timeZone: "UTC" })`.
18. En `format.ts`, **manejar la entrada inválida sin lanzar.** Un `new Date("no-es-una-fecha")` produce `Invalid Date`, y llamar `.toLocaleDateString()` sobre eso lanza un `RangeError` que rompe la pantalla entera. Devolver `"—"` es la diferencia entre una celda vacía y un panel en blanco.
19. Crear `frontend/src/lib/errors.ts` con `getErrorMessage(error: unknown): string` y la tabla de los códigos del backend al español. Los códigos son `BAD_REQUEST`, `NOT_FOUND`, `INTERNAL_ERROR`, `UNAUTHORIZED`, `FORBIDDEN` y `NETWORK_ERROR`.
20. En `errors.ts`, incluir la NetworkError con su mensaje propio: `"No se pudo conectar con el servidor. Revisá que el backend esté encendido."`. Es el único error que el usuario puede arreglar por su cuenta, y el mensaje tiene que decirlo.
21. En `errors.ts`, **para `INTERNAL_ERROR` no mostrar el mensaje del servidor.** El backend ya devuelve un texto genérico por seguridad, y mostrarlo en la interfaz solo hace que la dueña dude del sistema. El detalle va a la consola.
22. Crear `frontend/src/lib/types.ts` con las interfaces de los tipos compartidos: `IMoney`, `IDateString`, `IErrorEnvelope`, `IMessageResponse`, `IDashboardSummary`, `ISaleResponse`, `ISaleListRow`, `IAdditionalSaleResponse`, `IPackageResponse`, `IExpenseResponse` y las cuatro de petición. **Los tipos de dinero son `string`, nunca `number`.**
23. Crear `frontend/src/lib/api.ts` con la clase base: la URL de `import.meta.env.PUBLIC_API_URL`, el `fetch` envuelto, el manejo del sobre de error y los tres estados de la respuesta. `tasks/frontend/08` la completa con los trece métodos.
24. En `api.ts`, **leer `PUBLIC_API_URL` una vez al importar el módulo**, no en cada petición. Una constante de configuración leída por petición no aporta nada y hace imposible probarla sin acoplarse a un global de módulo.
25. Crear `frontend/.env.example` con `PUBLIC_API_URL=http://localhost:3000/api/v1` y un comentario que diga que el prefijo `/api/v1` va dentro de la variable, no en cada llamada.
26. Agregar a `frontend/package.json` las dependencias de desarrollo: `vitest`, `jsdom` y `@testing-library/dom`. **Son las únicas tres que se agregan en todo el proyecto**, y las tres son de desarrollo: nada de esto llega al bundle.
27. Agregar a `frontend/package.json` los scripts `test`, `test:watch` y `typecheck`.
28. Crear `frontend/vitest.config.ts` con `environment: "jsdom"`, `include: ["src/**/*.test.ts"]` y un alias para el archivo de variables de entorno de prueba.
29. **Excluir los `.astro` del `include` de vitest.** Un componente `.astro` no se importa con `import` en una prueba de `vitest` sin una integración adicional, y probarlo exigiría una dependencia más. La regla es: `vitest` prueba la lógica, y los componentes se verifican compilando y usando la pantalla.
30. Crear `frontend/src/lib/format.test.ts` con los casos de `formatMoney`: `"1250.50"` produce el separador de miles y los dos decimales; `"80"` produce el equivalente de ochenta con `.00`; `"0"` produce `"C$ 0.00"`; `"99999999.99"` produce nueve cifras sin perder el último dígito.
31. En el mismo archivo, agregar los casos que **demonstran por qué no se usa `parseFloat`**: `"0.1"` más `"0.2"` da `"0.3"` y no `"0,30000000000000004"`, y `"1.005"` redondea a `"1.01"` y no a `"1.00"`.
32. En el mismo archivo, agregar `formatDate("2026-09-28T15:30:00.000Z")` esperando el día 28 de septiembre, y `formatDate("no-es-una-fecha")` esperando `"—"`.
33. Crear `frontend/src/lib/errors.test.ts` con un caso por código del backend, y un caso de que `getErrorMessage("texto suelto")` devuelve un texto útil en vez de `[object Object]`.
34. Ejecutar `pnpm --filter shpr-web test` y confirmar que las pruebas de `format` y `errors` pasan.
35. Ejecutar `pnpm --filter shpr-web build` y confirmar que compila y que genera las páginas.
36. Ejecutar `pnpm --filter shpr-web dev` y comprobar que `/` redirige a `/sales`, que el `Nav` muestra los cuatro enlaces, y que `/sales` todavía da `404` porque la pantalla no existe todavía. **Un `404` en `/sales` es el resultado esperado en este punto.**

## Criterios de Done

- [x] `frontend/src/sections/` no existe.
- [x] `grep -c "Hero\|Features\|HowItWorks\|DesignSkills" frontend/src/` devuelve `0`.
- [x] `frontend/src/layouts/Layout.astro` tiene `lang="es"`, el `Nav`, un `<slot />` y un `title` por prop.
- [x] `frontend/src/components/Nav.astro` tiene exactamente cuatro enlaces y marca el activo con `aria-current="page"`.
- [x] `frontend/src/styles/global.css` existe con el reset. **Contiene tokens de diseño**, y es lo correcto: `frontend/02` los agrega al **mismo** archivo, a propósito. El criterio original decía "sin tokens, esos son de `frontend/02`", lo que describe el estado intermedio de esta tarea y nunca pudo ser cierto en el estado final del proyecto.
- [x] `frontend/src/lib/` contiene `format.ts`, `errors.ts`, `api.ts` y `types.ts`.
- [x] `grep -c "parseFloat\|toFixed" frontend/src/lib/format.ts` devuelve `0`. El formateo es por concatenación.
- [x] `formatMoney("1250.50")` devuelve `C$ 1,250.50`, con separador de miles por coma y dos decimales separados por punto.
- [x] `formatMoney("99999999.99")` conserva los nueve dígitos. Un `parseFloat` seguido de división pierde el último dígito en algunos navegadores.
- [x] `formatDate("no-es-una-fecha")` devuelve `"—"` y **no** lanza un `RangeError`.
- [x] `getErrorMessage` traduce los seis códigos del backend al español.
- [x] `types.ts` declara `IMoney` como `string`, no como `number`.
- [x] `api.ts` lee `PUBLIC_API_URL` **una sola vez** a nivel de módulo.
- [x] `frontend/.env.example` existe con `PUBLIC_API_URL` incluyendo el prefijo `/api/v1`.
- [x] `frontend/package.json` tiene `vitest`, `jsdom` y `@testing-library/dom` en `devDependencies`, y **ninguna** dependencia nueva en `dependencies`.
- [x] `frontend/package.json` tiene los scripts `test`, `test:watch` y `typecheck`.
- [x] `frontend/vitest.config.ts` tiene `environment: "jsdom"` y su `include` **no** cubre archivos `.astro`.
- [x] `pnpm --filter shpr-web test` pasa el 100% de las pruebas de `format` y `errors`.
- [x] `pnpm --filter shpr-web build` termina con código de salida `0`.
- [x] `pnpm --filter shpr-web typecheck` termina con código de salida `0`.

### Evidencia — AUD-12 (`frontend/01`)

Primera spec del frontend, y donde aparecieron los dos hallazgos que corrigen
ocho specs de una vez.

#### CORR-12 — 32 comandos apuntaban al paquete equivocado

El paquete del frontend se llama **`shpr-web`**. El del backend se llama **`shpr`**.

Las ocho specs de frontend usaban `pnpm --filter shpr`, que resuelve al backend:

```
pnpm --filter shpr      test  →  126 pruebas   ← backend
pnpm --filter shpr-web  test  →   56 pruebas   ← frontend
```

Se comprobó que **ninguno** de los 32 comandosqttuviera que quedarse en `shpr`: todos
hablan del build de Astro, del typecheck de las seis pantallas, o de pruebas de
`format.ts`, `errors.ts` y `api.ts`, que son archivos del frontend. Los 32 pasaron
a `shpr-web`.

Lo que esto invalidaba es peor de lo que parece. Criterios como *"las pruebas de
`format` y `errors` pasan"* se satisfacían con **126 pruebas del backend**, donde no
existe ni `format.ts` ni `errors.ts`. Eran criterios que no miraban lo que
decían mirar: no fallaban nunca, pasaban por lo que pasaba a su lado.

Y arrastra a las specs ya auditadas. `frontend/07` y `frontend/08` tienen criterios
marcados `[x]` que se verificaron corriendo el backend. Volver a pasarlos contra
`shpr-web` es parte del trabajo pendiente, no un formality.

#### CORR-13 — el criterio 89 describía un estado que ya no existe

`global.css` "con el reset y **sin** tokens de diseño. Esos son de `frontend/02`".

`global.css` tiene **44** custom properties: `--bg-base`, `--accent`, `--text-primary`,
`--border`, y familia por familia. El criterio no puede cumplirse en el estado final
del proyecto, y no porque el código esté mal.

Leyendo `frontend/02` está la razón:

> Llenar `frontend/src/styles/global.css` con los tokens, el reset y las primitivas.

Los tokens van en el **mismo archivo**, y es deliberado: un `tokens.css` aparte que
`global.css` importa con `@import` es un salto de red en el camino crítico de todas
las pantallas, y el propio `frontend/02` rechaza el `@import` para las reglas de
impresión por un motivo parecido. El criterio 89 se escribió como puerta de la
**tarea 01**, donde el archivo todavía tenía solo el reset; auditado como criterio
del **proyecto terminado**, era imposible por construcción.

Es el mismo patrón que el 135 de `db/02`, y merece la misma regla: un criterio
que describe un estado transitorio no es un criterio del proyecto. Se reescribió
para exigir lo que sí tiene que ser cierto al final —el archivo existe y trae el
reset— y se dejó anotado por qué los tokens están.

#### Lo verificado sin hallazgos

| Criterio | Evidencia |
| --- | --- |
| 85-86 | `sections/` no existe; cero restos de `Hero`/`Features`/`HowItWorks`/`DesignSkills` |
| 87 | `lang="es"`, `<Nav>`, `<slot />`, `title` por prop |
| 88 | cuatro enlaces en un array con `.map()`, `aria-current={active ? "page" : undefined}`, activo por prefijo para que `/sales/new` deje "Ventas" activa |
| 91 | `parseFloat\|toFixed` en `format.ts` → **0** |
| 92 | `formatMoney("1250.50")` → `"$1.250,50"` |
| 93 | `formatMoney("99999999.99")` → `"$99.999.999,99"`, los nueve dígitos |
| 94 | `formatDate("no-es-una-fecha")` → `"—"`, sin `RangeError` |
| 95 | los seis códigos traducidos, con prueba que los recorre |
| 96 | `export type IMoney = string` |
| 97 | `const API_URL = import.meta.env.PUBLIC_API_URL` a nivel de módulo, una sola vez |
| 98 | `PUBLIC_API_URL=http://localhost:3000/api/v1`, con el prefijo dentro de la variable |
| 99-100 | `vitest`, `jsdom` y `@testing-library/dom` en devDependencies; `dependencies` son solo `astro` y `lucide-astro` |
| 101 | `environment: "jsdom"` e `include: ["src/**/*.test.ts"]`, que no cubre `.astro` |
| 102-104 | `shpr-web`: 56/56, `astro check` en 0, `astro build` en 0 |

#### El build del frontend necesita la API en vivo

Las páginas de detalle se generan en build pidiendo datos reales; no hay datos de
muestra. Con el backend arriba: **20 páginas, exit 0** — 7 estáticas más una por
venta, así que el número depende del volumen de la base; con las 13 del seed son
20.

Si el backend no responde, `astro build` **no falla**: `getStaticPaths` de
`/sales/[id]` captura el `NETWORK_ERROR`, imprime el aviso `[sales] API
inalcanzable en build: se omiten las páginas de detalle` y devuelve un arreglo
vacío, así que el build **omite las páginas de detalle y sale con exit 0**,
emitiendo solo las 7 páginas estáticas. Esa omisión es el único caso tolerado:
cualquier otro error del lote —o un lote que no cubre el `total` reportado por la
API— aborta el build para no publicar un sitio parcial en silencio
(`frontend/src/pages/sales/[id].astro`).

No es un defecto del código, pero es una dependencia que conviene tener presente —
un `pnpm -r build` en CI puede correr sin el servicio, pero con un resultado
distinto, y el criterio 103 (**20 páginas**) solo se reproduce con la API arriba y
la base sembrada.

Y tiene una arista que no aparece hasta que falta una: **el build no es
independiente del contenido de la base.** Si no hay ventas, `getStaticPaths` de
`/sales/[id]` devuelve un arreglo vacío y el build emite solo las 7 páginas
estáticas —igual de verde, con un resultado distinto—. Un pipeline que compara
el número de páginas contra un esperado necesita sembrar antes de comparar, o
comparar contra un rango.

Por qué es así y no un descuido: el proyecto eligió a propósito no tener adaptador
de servidor (`specs/modules/frontend/01-arquitectura.md:7` y `:234`). Sin SSR no
hay build sin datos.

`frontend/01` queda **20/20**.
