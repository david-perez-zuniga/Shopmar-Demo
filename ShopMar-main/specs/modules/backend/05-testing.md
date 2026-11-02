# Pruebas

## Framework

**Vitest 3** (`vitest: ^3.0.0`), ejecutado con `pnpm test`, que es literalmente `vitest run`.

No hay `vitest.config.ts` en el repositorio. Vitest resuelve los imports usando la configuración de `tsconfig.json`, incluido el alias `@/* -> ./src/*`, de modo que las pruebas importan igual que el código de aplicación:

```ts
import { ConflictError } from "@/core/errors/AppError"
import { makeP2002 } from "@/tests/fakes"
import { createProductService } from "../../application/products.service"
```

Las pruebas usan `test` de `vitest` y `assert` de `node:assert/strict`, exactamente el estilo del archivo `backend/src/modules/products/_tests_/application/products.service.test.ts` que sirve de plantilla.

## Ubicación

```
backend/src/modules/<dominio>/_tests_/application/<dominio>.service.test.ts
```

El nombre de la carpeta es `_tests_` con guiones bajos, no `__tests__` ni `test`. La razón es que los archivos de prueba no forman parte de `src/**/*.ts` como código de aplicación y se distinguen de un vistazo en cualquier listado del árbol.

```
backend/src/tests/fakes.ts        # fábricas compartidas de errores de `pg`
```

## Qué se prueba

### Capa `application/` — sí, es el objetivo

Toda la capa de aplicación de los cuatro módulos tiene pruebas. Es el lugar donde viven las reglas de negocio, y las reglas son lo que hay que proteger.

| Módulo | Archivo | Casos mínimos |
|--------|---------|----------------|
| `dashboard` | `dashboard/_tests_/application/dashboard.service.test.ts` | Devuelve los cuatro indicadores; un rango sin datos devuelve `"0.00"` y `0`; el repositorio devuelve el rango aplicado. |
| `sales` | `sales/_tests_/application/sales.service.test.ts` | El total de una venta `live` es igual a su `cost`; el total de una venta `whatsapp` es `cost` más la suma de los adicionales; `createLive` lanza `BadRequestError` si llegan adicionales; `getById` lanza `NotFoundError` si no existe; `updateStatus` lanza `NotFoundError` sobre una venta borrada lógicamente; los importes salen como cadenas decimales exactas. |
| `packages` | `packages/_tests_/application/packages.service.test.ts` | `create` devuelve el paquete creado; `create` propaga `NotFoundError` cuando el `sale_id` no existe (el repositorio simula `P2003` con `makeP2003`); `getById` lanza `NotFoundError`; `delete` llama a `softDelete` y no a `update` físico; `update` con `sale_id: null` desvincula. |
| `expenses` | `expenses/_tests_/application/expenses.service.test.ts` | `create` devuelve el gasto con `expense_date` por defecto; `list` devuelve el arreglo completo sin metadatos de paginación; `delete` propaga `NotFoundError`. |

### Casos transversales que las pruebas deben cubrir

Estos casos aparecen en más de un módulo y no se pueden dejar fuera:

| Caso | Por qué importa |
|------|------------------|
| Los importes salen como **cadenas**, no como números | Es la invariante D-003. Un `assert.equal(typeof result.total, "string")` y un `assert.equal(result.total, "1250.50")` explícito detectan una regresión a `Number(decimal)`. |
| El total de una venta con dos adicionales es la suma exacta | Detecta un `Decimal` mal construido o un redondeo. Con `1250.50` y dos artículos de `850.00` y `100.00`, el total debe ser exactamente `"2200.50"`. |
| Una venta sin adicionales tiene `additional_count: 0` y `total` igual a `cost` | Detecta un `SUM` sobre `null`. |
| Un recurso inexistente produce `NotFoundError`, no `undefined` ni `null` | Es el contrato de error de la API. |
| Un recurso borrado lógicamente produce `NotFoundError` | Es la regla D-004 en la frontera. |
| Un `P2002` se traduce a `ConflictError` | Traducción de la capa de infraestructura. Patrón ya establecido con `makeP2002`. |
| Un `P2003` se traduce a `NotFoundError` en paquetes | Patrón ya establecido con `makeP2003`. |

### Doble uso de las fábricas de `src/tests/fakes.ts`

`src/tests/fakes.ts` expone dos funciones que ya existen en el repositorio y que se reutilizan tal cual:

```ts
makeP2002(target: string[])   // error de clave única duplicada
makeP2003(target: string)     // error de clave foránea violada
```

Se usan para simular los fallos de base de datos sin levantar PostgreSQL. No se agrega ninguna otra fábrica a este archivo en esta versión; si aparece una necesidad nueva (por ejemplo, `P2025`, registro no encontrado), se agrega junto a estas dos.

## Qué no se prueba en la versión 1

| Área | Por qué no |
|------|------------|
| Esquema de Zod de los DTO | Los esquemas son declarativos y su comportamiento ante entrada inválida es el de la librería. Un test por esquema duplicaría la especificación de la librería. Los casos de Zod que sí importan están cubiertos indirectamente: cuando un DTO rechaza algo, la respuesta es `400` y esa expectativa está en el contrato de `modules/api/`. |
| Repositorios de Drizzle contra una base real | Requeriría una base de datos en el entorno de pruebas. El proyecto tiene una sola base, en la red local de la tienda, y no un esquema separado para pruebas. |
| Endpoints con `app.inject()` | Sería la prueba de integración natural de Fastify, pero exige que el contenedor registre los repositorios reales y, por lo tanto, una base de datos. |
| Frontend | El proyecto no declara framework ni script de pruebas en `frontend/package.json`. Ver `modules/frontend/06-testing.md`. |

**Consecuencia asumida.** Los repositorios no tienen prueba automática. La cobertura real de esa capa aparece cuando la dueña usa el sistema, y los errores que se detecten se corrigen en la capa de aplicación, que sí está probada. Es el compromiso razonable para un sistema de un solo usuario: es preferible probar bien las reglas de negocio que invertirlas en una suite de integración que necesita una base de datos que nadie va a levantar.

## Fakes de repositorio

El patrón está establecido en `products/_tests_/application/products.service.test.ts` y se replica en los cuatro módulos nuevos:

```ts
const makeFakeSaleRepository = (overrides: Record<string, unknown> = {}) => ({
  findAll: async () => ({ sales: [makeSale()], total: 0 }),
  findById: async () => null,
  createWithNoAdditional: async (data) => makeSale({ ...data, id: "s9" } as unknown as ISaleEntity),
  createWithAdditional: async (data) => makeSale({ ...data, id: "s9" } as unknown as ISaleEntity),
  updateStatus: async (id, status) => makeSale({ id, status } as unknown as ISaleEntity),
  softDelete: async () => {},
  ...overrides,
})
```

Y la entidad de prueba, con `Decimal` real de `decimal.js` para que las pruebas de dinero sean significativas:

```ts
function makeSale(overrides: Partial<ISaleEntity> = {}): ISaleEntity {
  return {
    id: "s1",
    type: "whatsapp",
    customer_name: "María González",
    product_name: "Abrigo de lana gris",
    payment_method: "cash",
    payment_bank: null,
    sale_date: new Date(),
    status: "pending",
    cost: new Decimal("1250.50"),
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  }
}
```

Se usa `Decimal` de `decimal.js` de verdad, no un número ni un string simulado, porque el comportamiento que se quiere verificar es precisamente la conversión a cadena decimal con dos decimales fijos.

## Cobertura objetivo

No hay umbral de cobertura configurado en `package.json` ni en un archivo de cobertura. La meta es de comportamiento, no de porcentaje:

| Objetivo | Cómo se verifica |
|----------|------------------|
| Toda regla de negocio escrita en `docs/07-decisiones.md` tiene al menos un caso de prueba | Cada decisión tiene una línea de verificación en la tabla de casos transversales. |
| Cada método público de cada servicio tiene al menos un caso de éxito y uno de error | Revisión de la tabla de casos mínimos por módulo. |
| Los cuatro indicadores del dashboard tienen un caso con datos y uno sin datos | Evita que un rango vacío devuelva `null` en lugar de `"0.00"`. |
| Las tres reglas de dinero tienen un caso | Cadena, no número. Suma exacta de una venta con adicionales. Suma de un rango vacío. |
| Ninguna prueba necesita base de datos, ni servidor, ni red | `pnpm test` se ejecuta sin nada más levantado. |

## Comandos

| Comando | Qué ejecuta |
|---------|--------------|
| `pnpm test` | `vitest run`: toda la suite, una sola vez, y sale. |
| `pnpm run dev` | `tsx watch src/server.ts`. No ejecuta pruebas; es el servidor con recarga. |
| `pnpm run build` | `tsup`. No incluye pruebas; verificar antes de compilar. |

No hay script `test:watch`. Para ejecutar pruebas en modo interactivo se invoca `pnpm vitest` directamente, que es el binario que `pnpm test` ejecuta en modo `run`.
