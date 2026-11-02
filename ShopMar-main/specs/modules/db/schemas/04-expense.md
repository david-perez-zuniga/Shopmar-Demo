# `expense` — Gasto diario

## Propósito

Registra un desembolso del negocio: transporte, alimentos, materiales de empaque, servicios del local. Es la tabla más simple del modelo porque no tiene ninguna relación: un gasto no pertenece a una venta, no se vincula a un paquete y no se reparte entre varios.

Su única función es alimentar el indicador `total_expenses` del dashboard y dar contexto al importe gastado en el período.

## Tabla

| Columna | Tipo Drizzle | Tipo SQL | Nulo | Por defecto | Notas |
|---------|--------------|----------|------|-------------|-------|
| `id` | `uuid("id").primaryKey()` | `UUID` | No | — | Clave primaria. El UUID lo genera la aplicación. |
| `name` | `text("name")` | `TEXT` | No | — | Concepto del gasto. Texto libre. Cota de 200 caracteres en Zod. |
| `description` | `text("description")` | `TEXT` | **Sí** | `NULL` | Detalle opcional. Cota de 500 caracteres en Zod. |
| `total` | `numeric("total", { precision: 10, scale: 2 })` | `DECIMAL(10,2)` | No | — | Importe del gasto. Máximo `99999999.99`. |
| `expense_date` | `timestamp("expense_date", { withTimezone: true, precision: 3 }).default(CURRENT_TIMESTAMP)` | `TIMESTAMP(3) WITH TIME ZONE` | No | `CURRENT_TIMESTAMP` | Fecha en que se produjo el gasto. El valor por defecto es el mismo que el de la columna, y el servicio lo usa como valor explícito para que la fecha del gasto y la de creación coincidan. |
| `created_at` | `timestamp("created_at", { precision: 3 }).default(CURRENT_TIMESTAMP)` | `TIMESTAMP(3)` | No | `CURRENT_TIMESTAMP` | Auditoría. |
| `updated_at` | `timestamp("updated_at", { precision: 3 }).$onUpdate(() => new Date())` | `TIMESTAMP(3)` | No | — | Auditoría. |
| `deleted_at` | `timestamp("deleted_at", { precision: 3 })` | `TIMESTAMP(3)` | **Sí** | `NULL` | Borrado lógico (decisión D-004). |

### Restricción `CHECK`

```sql
CONSTRAINT "expense_total_non_negative" CHECK ("total" >= 0)
```

Declarada con `check()` en `src/db/schema/expenses.ts` y escrita en el SQL de la migración generada.

### `expense_date` y `created_at` son fechas distintas

Es la única tabla donde la columna de fecha de negocio **tiene valor por defecto en la base de datos**. La razón es práctica: casi todos los gastos se registran el mismo día en que ocurren, y la dueña no quiere tener que elegir la fecha en el formulario.

Cuando sí se registra un gasto de una fecha anterior, el formulario envía `expense_date` explícitamente y esa es la fecha que manda. El filtro por rango del dashboard y del listado opera siempre sobre `expense_date`, nunca sobre `created_at`: un gasto de marzo cargado en junio tiene que aparecer en marzo, que es cuando ocurrió.

## Relaciones

**Ninguna.** `expense` no tiene ni declara campos de relación. No referencia `sale`, ni `package`, ni `additional_sale`, y ninguna de esas tablas la referencia.

La decisión de no vincular un gasto a una venta es concreta: un gasto puede haber servido para tres ventas distintas, y repartir su importe entre ellas exigiría una tabla de distribución que no aporta nada al objetivo real, que es saber cuánto se gastó en el período.

## Índices

| Índice | Columnas | Por qué |
|--------|----------|---------|
| `expense_expense_date_idx` | `expense_date` | Filtro y orden por defecto de `GET /api/v1/expenses` y de la agregación `total_expenses` del dashboard. |
| `expense_active_idx` | `expense_date, id`, parcial (`deleted_at IS NULL`) con `INCLUDE (total)` | Sirve a las dos consultas de la tabla: el listado (recorrido hacia atrás, sin nodo `Sort`) y el `SUM(total)` del dashboard como *index-only scan*: 10,4 ms → 0,28 ms con 50.000 filas. Parcial: no se declara en el esquema de Drizzle (ver `01-sale.md`). |
| `expense_deleted_at_idx` | *(sigue sin declararse)* | La condición `deleted_at IS NULL` ya la cubre `expense_active_idx` por ser parcial, así que un índice propio sobre `deleted_at` sigue sin hacer falta. |

```ts
index("expense_expense_date_idx").on(table.expenseDate),
```

## Notas

### Sin endpoint de actualización

Solo existen tres endpoints para gastos: `POST`, `GET` y `DELETE`. **No hay `PUT /api/v1/expenses/:id`.** Un gasto registrado por error se borra lógicamente y se vuelve a crear. La lista de veintiún endpoints del proyecto es cerrada y esta ausencia es intencional: reduce el número de formas en que un registro histórico puede cambiar.

### El borrado lógico no restituye nada

`DELETE /api/v1/expenses/:id` escribe `deleted_at` y la fila desaparece de todos los listados y de la agregación del dashboard. No hay endpoint de restauración en la versión 1. La única forma de recuperar el dato es consultar la tabla directamente en PostgreSQL, que es una operación de emergencia, no un flujo de uso. La razón es que el sistema tiene un solo usuario: la dueña puede permitirse el error y volver a escribir el gasto, y el registro original queda disponible para una corrección manual si hace falta.

### Importe del renglón completo

Como en `additional_sale`, `total` es el importe total del gasto y no hay cantidad ni precio unitario. Un gasto no se multiplica: no tiene `quantity`. El concepto de cantidad vive únicamente en los artículos adicionales de una venta.
