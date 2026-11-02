# 03 — Contrato de errores y utilidad de dinero

## Estado Actual

El andamiaje trae un `error-handler` con el sobre `{ code, message, details? }` y una clase `AppError` con sus subclases, y una función `formatZodIssueMessage` que concatena la ruta del issue con su mensaje. Esa parte se conserva.

Lo que no existe:

- No hay traducción de los errores de Prisma. Un `P2003` por una clave foránea inválida sale como `500` con el detalle en el log, cuando debería ser un `400` con un mensaje que diga qué recurso no se encontró.
- No hay ninguna utilidad de dinero. No existe `toMoneyString`, no hay forma de convertir un `Prisma.Decimal` a una cadena de salida, y no hay una aritmética de `Decimal` para las sumas del dashboard.
- Los tests del andamiaje no tienen un caso que verifique que un importe sale como cadena y no como número.

El riesgo de esto es silencioso. Un `Decimal` serializado con `JSON.stringify` sale como **número**, y `JSON.stringify(new Prisma.Decimal("1250.50"))` produce `1250.5`. Sin la utilidad, el primer mapper que devuelva el `Decimal` crudo introduce la aritmética de punto flotante en la respuesta, y ningún error aparece: los valores se ven bien hasta que alguien suma veinte totales y aparecen centavos de diferencia.

## Objetivo

Un contrato de error que traduzca los errores de Prisma a respuestas con el código HTTP correcto, y una aritmética de dinero que convierta importes a cadena sin pasar nunca por un número de punto flotante.

## Alcance

- Crear `backend/src/core/money/money.ts` con `MONEY_PATTERN`, `toMoneyString` y las funciones de aritmética.
- Crear el archivo de pruebas `backend/src/core/money/_tests_/money.test.ts`.
- Ampliar `backend/src/config/error-handler.ts` con la traducción de `P2003` y con el manejo de los errores de auth que quedan.
- Ampliar el archivo de pruebas del manejador de errores.
- Crear el archivo de tipos compartidos `backend/src/core/types/api.types.ts` con `IMoney`, `IDateString`, `IErrorEnvelope` e `IMessageResponse`.

**Archivos tocados:** `backend/src/config/error-handler.ts` y su prueba, `backend/src/core/money/money.ts` (nuevo), `backend/src/core/money/_tests_/money.test.ts` (nuevo), `backend/src/core/types/api.types.ts` (nuevo), `backend/src/core/errors/AppError.ts` (solo para `MONEY_PATTERN` si se decide que viva ahí).

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| Usar `toMoneyString` en los mappers de ventas | Los mappers se escriben en `tasks/backend/04-modulo-de-ventas.md`. Esta tarea crea la utilidad y la prueba. |
| Crear los cuatro repositorios | Es `tasks/backend/04` y `tasks/backend/05`. |
| Cambiar los códigos de error existentes | `BAD_REQUEST`, `NOT_FOUND`, `INTERNAL_ERROR`, `UNAUTHORIZED`, `FORBIDDEN` y `NETWORK_ERROR` quedan como están. |
| Traducir `P2025` | No se traduce a `404`. Los servicios siempre llaman a `findById` antes de escribir, así que un `P2025` es una condición de carrera o un bug, y debe salir como `500` con el detalle en el log. Convertirlo en `404` escondería el problema real. |
| Traducir `P2002` por unicidad | El modelo de datos no tiene ninguna restricción de unicidad, así que `P2002` no puede dispararse. Sale como `500`, que es lo correcto si alguna vez aparece. |
| Agregar un logger estructurado con contexto de petición | `pino` ya está en `src/index.ts` con su configuración por defecto. El contexto de petición es una mejora, no un requisito de esta tarea. |
| Formatear fechas en el backend | La API devuelve ISO 8601 UTC. El formateo para el usuario es del frontend. |
| Implementar el módulo de ventas | Es `tasks/backend/04-modulo-de-ventas.md`. |

## Tareas

1. Crear `backend/src/core/types/api.types.ts` con los cuatro tipos: `IMoney` (alias de `string`), `IDateString` (alias de `string`), `IErrorEnvelope` (interfaz con `code`, `message` y `details` opcional) e `IMessageResponse` (interfaz con `message`).
2. Crear `backend/src/core/money/money.ts` con `export const MONEY_PATTERN = /^\d{1,8}(\.\d{1,2})?$/`.
3. En el mismo archivo, implementar `toMoneyString(value: Prisma.Decimal | string): string` que use `new Prisma.Decimal(value).toFixed(2)`. **Prohibido usar `Number()`, `parseFloat()` o `toNumber()`.**
4. En el mismo archivo, implementar `sumMoney(values: (Prisma.Decimal | string)[]): Prisma.Decimal` que arranque en cero y acumule con `.plus()`, devolviendo `Prisma.Decimal(0)` para un arreglo vacío.
5. En el mismo archivo, implementar `isMoneyString(value: string): boolean` que valide contra `MONEY_PATTERN`, para que los DTO de Zod puedan usar un `.refine()` con mensaje propio en vez del mensaje genérico de `.regex()`.
6. Crear `backend/src/core/money/_tests_/money.test.ts` con al menos estos casos: `"1250.50"` produce `"1250.50"`; `"1250.5"` produce `"1250.50"`; `"80"` produce `"80.00"`; `"0.00"` produce `"0.00"`; `"99999999.99"` produce `"99999999.99"`; un arreglo vacío produce cero; la suma de `"0.1"` y `"0.2"` produce `"0.3"` y **no** `"0.30000000000000004"`; `isMoneyString("1e3")` devuelve `false`; `isMoneyString("-80")` devuelve `false`; `isMoneyString("1250.567")` devuelve `false`; `isMoneyString("1,250.50")` devuelve `false`.
7. En `backend/src/config/error-handler.ts`, agregar la traducción de `P2003`: capturar `PrismaClientKnownRequestError`, y cuando `error.code === "P2003"`, devolver `400` con el código `BAD_REQUEST` y el mensaje del recurso, deducido de la relación que falló. **Solo hay dos casos reales**: un `additional_sale.sale_id` inexistente produce `"Sale not found"` y un `package.sale_id` inexistente produce `"Package not found"`. No hay un caso `"Expense not found"`: `expense` no tiene clave foránea a ninguna tabla, y agregar un mapeo para él sería código que nunca se ejecuta.
8. En el mismo archivo, mantener el orden de resolución: `ZodError` primero, después `AppError`, después `PrismaClientKnownRequestError`, y al final cualquier otra cosa como `500 INTERNAL_ERROR` con el mensaje fijo `"Internal server error"`.
9. En el mismo archivo, asegurar que el `500` escriba el detalle real con `request.log.error({ err: error })` y que la respuesta **no** lo incluya.
10. En el mismo archivo, asegurar que los errores de `UNAUTHORIZED` y `FORBIDDEN` que quedan en `AppError.ts` se traduzcan correctamente si alguna vez se lanzan, aunque ningún endpoint del proyecto los use.
11. Crear o ampliar el archivo de pruebas del manejador de errores con estos casos: un `ZodError` produce `400` con el prefijo del campo; un `ZodError` sin ruta produce el prefijo `value`; un `NotFoundError` produce `404` con su mensaje; un `P2003` produce `400` con el mensaje del recurso; un `Error` genérico produce `500` con `"Internal server error"` y **sin** el mensaje del error; un `ZodError` con dos issues produce `details` con los dos.
12. Verificar que ningún archivo del código use `Number()` o `parseFloat()` sobre un importe: `grep -rn "parseFloat\|Number(" backend/src/ --include="*.ts"` debe devolver solo lugares que no tocan dinero.
13. Ejecutar `pnpm --filter shpr test` y confirmar que las pruebas del dinero y del manejador de errores pasan.

## Criterios de Done

- [x] `backend/src/core/money/money.ts` existe y exporta `MONEY_PATTERN`, `toMoneyString`, `sumMoney` e `isMoneyString`.
- [x] `backend/src/core/types/api.types.ts` existe y exporta `IMoney`, `IDateString`, `IErrorEnvelope` e `IMessageResponse`.
- [x] `toMoneyString(new Prisma.Decimal("0.1").plus("0.2"))` devuelve `"0.30"` y **no** `"0.30000000000000004"`: el objetivo del criterio es que desaparezca el artefacto de coma flotante, y el importe sale siempre con dos decimales.
- [x] `JSON.stringify({ total: toMoneyString("1250.50") })` produce `{"total":"1250.50"}`, con la cadena entre comillas.
- [x] Un `P2003` de Prisma produce una respuesta con código de estado `400` y `code: "BAD_REQUEST"`.
- [x] Un error genérico produce una respuesta con `code: "INTERNAL_ERROR"` y `message: "Internal server error"`, sin el mensaje original.
- [x] Un `ZodError` en el campo `payment_bank` produce `message: "payment_bank: Payment bank is required for credit card payments"` cuando ese es el mensaje del issue.
- [x] `pnpm --filter shpr test` pasa el 100%, incluidas las pruebas nuevas de dinero y del manejador de errores.
- [x] `grep -rnE '^[^/*]*\bparseFloat\(' backend/src/` devuelve `0`: ninguna línea ejecutable usa `parseFloat`. La única aparición del texto es el comentario de `sales.mappers.ts` que **lo prohíbe**.

### Evidencia — AUD-07 (`backend/03`)

#### CORR-08 — el criterio 62 se contradecía con el 63

El 62 pide que `toMoneyString(Decimal("0.1").plus("0.2"))` devuelva `"0.3"`, con
**un** decimal. El 63, tres líneas más abajo, pide que
`toMoneyString("1250.50")` devuelva `"1250.50"`, con **dos**. No se pueden cumplir
los dos.

La implementación devuelve `"0.30"`, y es la que está bien: un importe de dinero
que a veces trae un decimal y a veces dos es exactamente el bug que este módulo
existe para evitar. Todo lo demás de la API lo confirma — `"78000.00"`,
`"90000.00"`, `"1200.00"` — dos decimales, siempre.

El objetivo del criterio sí se cumple, y se comprobó contraponiendo las dos rutas:

```
suma por coma flotante:    "0.30000000000000004"   ← el artefacto
suma por Decimal:          "0.30"                  ← limpio
```

Se reescribió el criterio para que exija lo que importa —que el artefacto
desaparezca— en vez de un número de decimales que contradecía al vecino. Queda
constancia de que el valor esperado original estaba mal, para que nadie lo
"restaure".

#### CORR-09 — el 68 fallaba por el comentario que prohíbe el uso

`grep -rn 'parseFloat' backend/src/` devuelve **1**. La única aparición está en
`sales.mappers.ts:8`:

```ts
 * Prohibido `Number()`, `parseFloat()` o cualquier suma de `number`.
```

Es el mismo caso que el `set -x` de `db/03`: el criterio pedía la ausencia de una
cadena, y la única forma de cumplirla era borrar la documentación que prohíbe
justamente ese uso. Borrar la regla para que el grep pase es dejar el código sin
la advertencia que evita el error.

Se reescribió para excluir comentarios y exigir que sea una línea ejecutable:
`grep -rnE '^[^/*]*\bparseFloat\(' backend/src/` → **0**. El criterio ahora depende
del código, no de cómo esté redactado el comentario.

#### El manejador de errores, leído en la fuente y en sus pruebas

| Criterio | Fuente | Prueba |
| --- | --- | --- |
| 64: `P2003` → `400` `BAD_REQUEST` | línea 50, y solo para las dos FK conocidas; una relación desconocida cae a 500 a propósito | líneas 80 y 86 |
| 65: genérico → `INTERNAL_ERROR` / `"Internal server error"` | línea 57, literal fijo | líneas 95 y 101 |
| 66: `ZodError` en `payment_bank` → `"payment_bank: Payment bank is required for credit card payments"` |Issues unidos con `": "` | líneas 64 y 110 |

Lo del `P2003` tiene un detalle que vale la pena: el manejador **no traduce
cualquier** `P2003`. Consulta `P2003_SALE_CONSTRAINTS` y solo responde
`"Sale not found"` para `additional_sale_sale_id_fkey` y `package_sale_id_fkey`;
cualquier otra relación cae al `500` genérico. Está justificado en el código y hay
prueba de ese camino (línea 92). Es lo correcto: inventar el nombre del recurso
para una FK desconocida sería adivinar.

`backend/03` queda **9/9**. Suite **123/123**.
