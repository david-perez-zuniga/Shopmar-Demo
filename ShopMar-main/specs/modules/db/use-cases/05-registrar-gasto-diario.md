# Caso de uso: registrar y borrar gastos diarios

## Actor

La dueña de la tienda, desde el panel administrativo.

## Disparador

Dos acciones distintas: **alta** desde `/expenses/new`, y **baja lógica** desde la fila de la tabla en `/expenses`.

Este caso cubre las dos porque comparten el mismo recurso y el mismo módulo, y porque la baja lógica es la única forma en que un gasto sale de los números del dashboard.

## Flujo principal — alta

1. **El panel abre el formulario.** `frontend/src/pages/expenses/new.astro` renderiza nombre, descripción (opcional), importe y fecha.
2. **La dueña completa el formulario.** `name`, `description`, `total` (como texto, con `inputmode="decimal"`) y `expense_date`. Si deja la fecha vacía, no se envía el campo.
3. **La dueña envía el formulario.** El `submit` arma el cuerpo con `new FormData(form)`, convierte la fecha a ISO 8601 cuando viene, y omite `description` si quedó vacía.
4. **El panel hace la petición.** `api.ts` ejecuta `fetch` contra `POST /api/v1/expenses`.
5. **El controlador valida el cuerpo.** `CreateExpenseDtoSchema.parse(request.body)`: `name` entre 1 y 200, `description` opcional hasta 500, `total` con `MONEY_PATTERN` y `expense_date` con `z.coerce.date().optional()`. Es `.strict()`.
6. **El servicio normaliza.** `createExpenseService(...).create(data)` fija `expense_date` en el instante actual cuando no viene.
7. **El repositorio inserta la fila.** `createExpenseRepository(db).create(data)` ejecuta `db.insert(expense).values(...).returning()`. `expense_date` es la **única** fecha de negocio con valor por defecto en la base de datos (`DEFAULT CURRENT_TIMESTAMP`), de modo que el INSERT funciona incluso si el campo se omite.

## Flujo principal — baja lógica

1. **La dueña pide borrar una fila.** En `/expenses`, el botón de borrar de la fila abre un `confirm()` con el texto "Eliminar este gasto?".
2. **La dueña confirma.** El `submit` de `DELETE /api/v1/expenses/<id>` se ejecuta con el `id` de la fila.
3. **El controlador valida el parámetro.** `ExpenseIdParamSchema.parse(request.params)`, que exige un UUID. Un identificador mal formado produce `400`, no `404`.
4. **El servicio comprueba que el gasto existe.** `getById(id)` y, si devuelve `null`, lanza `new NotFoundError("Expense not found")`.
5. **El repositorio marca el borrado.** `createExpenseRepository(db).softDelete(id)` ejecuta:

   ```ts
   await db.update(expense)
     .set({ deletedAt: new Date(), updatedAt: new Date() })
     .where(eq(expense.id, id))
   ```

   **No hay `DELETE` físico.** Se escribe la columna `deleted_at` y, en la misma sentencia, `updated_at`; la fila ya no aparece en ninguna lectura.
6. **El panel retira la fila de la tabla.** Con `200` y `{ "message": "Expense deleted successfully" }`, el script quita el `<tr>` del DOM y muestra una confirmación breve.

## Datos involucrados

### `expense` — una fila insertada (alta)

| Columna | Valor | Origen |
|---------|-------|--------|
| `id` | UUID generado | Generado en el código (`randomUUID()`) |
| `name` | Texto del campo | `name="name"`, cota 1–200 |
| `description` | Texto o `null` | `name="description"`, opcional, cota 500 |
| `total` | Cadena decimal | `name="total"`, `MONEY_PATTERN` |
| `expense_date` | Fecha elegida o `now()` | `name="expense_date"`, opcional, con `DEFAULT CURRENT_TIMESTAMP` |
| `created_at` | `now()` | `DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `now()` | Lo escribe el repositorio |
| `deleted_at` | `NULL` | Registro vivo |

### `expense` — una fila actualizada (baja)

| Columna | Cambio |
|---------|--------|
| `deleted_at` | **`NULL` → fecha actual.** El único campo que la dueña provoca. |
| `updated_at` | Actualizado por el repositorio en la misma sentencia. |
| Todas las demás | Sin cambios: el nombre, el importe y la fecha siguen siendo legibles con una consulta directa a la base. |

### Salida: el gasto creado

```json
{
  "id": "e4b90c15-7d38-4a26-bf70-1c93d5e80248",
  "name": "Transporte del local",
  "description": "Gasolina de la camioneta",
  "total": "85.00",
  "expense_date": "2026-09-28T19:45:00.000Z",
  "created_at": "2026-09-28T19:45:00.512Z",
  "updated_at": "2026-09-28T19:45:00.512Z"
}
```

### Salida: la baja

```json
{
  "message": "Expense deleted successfully"
}
```

## Alternativas y errores

| Situación | Detección | Respuesta |
|-----------|-----------|-----------|
| El `total` tiene tres decimales | `MONEY_PATTERN` | `400` con el prefijo `total` |
| El `total` viene como número JSON | `MONEY_PATTERN` espera cadena | `400` con el prefijo `total` |
| El `total` es negativo | `MONEY_PATTERN` rechaza el signo menos | `400` con el prefijo `total` |
| El `total` excede `99999999.99` | Ocho enteros como máximo | `400` con el prefijo `total` |
| `description` supera 500 caracteres | `z.string().max(500)` | `400` con el prefijo `description` |
| La fecha no parsea | `z.coerce.date()` | `400` con el prefijo `expense_date` |
| El `:id` del borrado no es un UUID | `ExpenseIdParamSchema` | `400` con `message: "id: Expense id must be a valid UUID"` |
| El gasto no existe al borrar | `getById` devuelve `null` | `404 NOT_FOUND` con `message: "Expense not found"` |
| El gasto ya está borrado lógicamente al borrar | `getById` filtra `deleted_at: null` | `404 NOT_FOUND`, no `200`. El borrado es idempotente desde el punto de vista del cliente: reintentar da `404`. |
| Una clave desconocida en el alta | `.strict()` | `400` con la lista de claves no reconocidas |

**No hay `409 CONFLICT` en ningún caso.** `expense` no tiene restricciones de unicidad. Dos gastos con el mismo nombre y el mismo importe en el mismo día son dos gastos distintos: puede haberse comprado dos veces lo mismo.

### Un caso de negocio que el modelo no cubre

Si la dueña registra un gasto por error y quiere **corregirlo** en lugar de borrarlo, el sistema no ofrece un endpoint de edición. `PUT /api/v1/expenses/:id` no está en los veintiún endpoints. La salida es borrar lógicamente y volver a registrar.

Es la misma decisión que en las ventas y los paquetes: los registros creados no se editan, se anulan o se borran. Aquí la única operación disponible es el borrado lógico, y la forma de corregir un error es rehacer el registro.

## Salida

| Elemento | Resultado |
|----------|-----------|
| Estado HTTP (alta) | `201 Created` con el gasto creado |
| Estado HTTP (baja) | `200 OK` con `{ "message": "Expense deleted successfully" }` |
| Ubicación en el panel | `/expenses`, con la fila nueva o con la fila retirada |
| Efecto en el dashboard (alta) | `total_expenses` aumenta en el importe, si la `expense_date` cae en el rango |
| Efecto en el dashboard (baja) | `total_expenses` deja de contar ese importe de inmediato, sin perder la fila |
| Efecto en el esquema | Una fila insertada, o una fila con `deleted_at` informado |
