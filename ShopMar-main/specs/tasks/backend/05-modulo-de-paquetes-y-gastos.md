# 05 — Módulo de paquetes y gastos

## Estado Actual

No existen los directorios `backend/src/modules/packages/` ni `backend/src/modules/expenses/`. El esquema ya tiene `package` y `expense` después de `tasks/db/01` y `tasks/db/02`.

Los siete endpoints:

| Método | Ruta | Módulo |
|--------|------|--------|
| `POST` | `/api/v1/packages` | packages |
| `GET` | `/api/v1/packages` | packages |
| `PUT` | `/api/v1/packages/:id` | packages |
| `DELETE` | `/api/v1/packages/:id` | packages |
| `POST` | `/api/v1/expenses` | expenses |
| `GET` | `/api/v1/expenses` | expenses |
| `DELETE` | `/api/v1/expenses/:id` | expenses |

## Objetivo

Los siete endpoints de paquetes y gastos funcionando con la misma arquitectura por capas de ventas, con el borrado lógico como única operación de eliminación y con el `sale_id` opcional del paquete como un enlace que se puede crear, cambiar y desvincular.

## Alcance

- Crear `backend/src/modules/packages/` con sus cinco directorios y sus ocho archivos.
- Crear `backend/src/modules/expenses/` con sus cinco directorios y sus siete archivos.
- Registrar los dos módulos en `backend/src/app.ts`.
- Ampliar `backend/src/tests/fakes.ts` con `makePackage` y `makeExpense`.
- Crear los cuatro archivos de prueba: `packages.service.test.ts`, `packages.mappers.test.ts`, `expenses.service.test.ts` y `expenses.mappers.test.ts`.

**Archivos tocados:** `backend/src/modules/packages/**` (nuevo), `backend/src/modules/expenses/**` (nuevo), `backend/src/app.ts`, `backend/src/tests/fakes.ts`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| `GET /api/v1/packages/:id` | El listado trae todos los campos de un paquete. Una lectura individual no aporta nada que la lista no dé, y ninguna pantalla la necesita: el formulario de edición precarga con los datos de la fila que ya tiene en memoria. |
| `PATCH /api/v1/packages/:id` | `PUT` es el reemplazo completo. Un parche parcial obligaría a distinguir "no enviado" de "enviado como `null`", que es la ambigüedad que `sale_id: nullish()` ya resuelve. |
| `PUT /api/v1/expenses/:id` y `PATCH /api/v1/expenses/:id` | Un gasto mal registrado se borra lógicamente y se vuelve a crear. Es la misma decisión que aplica a las ventas, con la diferencia de que aquí el borrado lógico sí afecta los agregados del dashboard. |
| `GET /api/v1/expenses/:id` | Igual que en paquetes: la lista trae todos los campos y no hay pantalla que lea un gasto suelto. |
| Una columna de estado de paquete | **El modelo no la tiene.** "Pendiente" significa "registrado y no borrado" (decisión D-007). Agregarla es un cambio de decisión con impacto en el esquema, no una omisión. |
| Un campo `status` o `category` en gastos | La mercadería y los gastos son texto libre (decisión D-002). Una tabla de categorías obligaría a elegir de una lista cerrada algo que la dueña ya sabe escribir. |
| Filtrar gastos por `name` o por importe | El listado se filtra por fecha, que es como la dueña busca. Un mes cabe en una pantalla. |
| La agregación de `pending_packages_count` | Es `tasks/backend/06-modulo-de-dashboard.md`. |
| Paginación en gastos | Decisión D-006. `page` y `limit` producen `400` por el `.strict()` del `ExpensesQuerySchema`. El listado de paquetes usa `GET /sales` con `page` y `per_page` (decisión D-011). |
| Propagar un borrado de paquete a la venta | El borrado lógico de un paquete no toca su venta. Un envío entregado no anula la venta que lo originó. |

## Tareas

### Módulo de paquetes

1. Crear `packages/domain/packages.entities.ts` con `IPackageEntity` (los ocho campos de `package`: `id`, `name`, `package_date`, `method`, `sale_id`, `created_at`, `updated_at`, `deleted_at`).
2. Crear `packages/domain/packages.repository.port.ts` con `IPackageRepository`: `create(data)`, `findAll(params)`, `findById(id)` y `softDelete(id)`. Y `IListPackagesParams` con `start_date?`, `end_date?` y `method?`.
3. Crear `packages/domain/packages.types.ts` con `CreatePackageData`, `UpdatePackageData` y `IPackageResponse`.
4. Crear `packages/presentation/packages.dto.ts` con `CreatePackageDtoSchema` (`.strict()`, con `name` de 1 a 200, `package_date` con `z.coerce.date().optional()`, `method` con `z.enum(["cargotrans","delivery","retiro"])` y `sale_id` con `z.string().uuid().nullish()`), `UpdatePackageDtoSchema` (**la misma forma que el de alta**, también `.strict()`, porque `PUT` es un reemplazo completo), `PackageIdParamSchema` (con `z.string().uuid("Package id must be a valid UUID")`) y `PackagesQuerySchema` (los tres filtros, `.strict()`).
5. Crear `packages/infrastructure/prisma-package.repository.ts` con un `packageSelect` que traiga los ocho campos.
6. En el repositorio, implementar `create` con `prisma.package.create` y el `packageSelect`. **Sin transacción**: hay una sola escritura. Si el `sale_id` no existe, PostgreSQL viola la clave foránea, Prisma lanza `P2003` y el manejador lo traduce a `400` con `"Sale not found"`.
7. En el repositorio, implementar `findAll` con `where: { deleted_at: null }`, los filtros opcionales por `package_date` y por `method`, y orden `package_date: "desc"` y luego `id: "desc"`.
8. En el repositorio, implementar `findById` con `where: { id, deleted_at: null }`. Devuelve `null`, no lanza.
9. En el repositorio, implementar `softDelete(id)` con `prisma.package.update({ where: { id }, data: { deleted_at: new Date() } })`. **Prohibido `delete()`**: nada se borra físicamente.
10. Crear `packages/presentation/packages.mappers.ts` con `mapPackageToResponse(pkg)`. El paquete no tiene importes, así que el mapper solo copia los campos y convierte las fechas. No hay aritmética aquí.
11. Crear `packages/application/packages.service.ts` con `createPackageService(repository)`. `create` normaliza `sale_id` vacío o `undefined` a `null` y fija `package_date` en el instante actual cuando no viene. `getById` lanza `NotFoundError("Package not found")` si el repositorio devuelve `null`. `update` llama a `findById` primero y lanza el mismo error si no existe. `delete` llama a `findById` primero, y **solo después** a `softDelete`.
12. Crear `packages/presentation/packages.controller.ts` con los cuatro métodos, validando con `.parse()` antes de llamar al servicio. `create` responde `201`; los otros tres, `200`. `delete` responde `200` con `{ message: "Package deleted successfully" }`.
13. Crear `packages/presentation/packages.routes.ts` con las cuatro rutas y **ningún `preHandler` de guard**.
14. Crear `_tests_/packages.service.test.ts`: `create` devuelve el paquete creado; `create` propaga `NotFoundError` cuando el `sale_id` no existe, con el repositorio simulando `P2003` mediante un `makeP2003()`; `getById` lanza `NotFoundError`; `delete` llama a `softDelete` y **no** a un `delete` físico; `update` con `sale_id: null` desvincula.

### Módulo de gastos

15. Crear `expenses/domain/expenses.entities.ts` con `IExpenseEntity` (los ocho campos de `expense`).
16. Crear `expenses/domain/expenses.repository.port.ts` con `IExpenseRepository`: `create(data)`, `findAll(params)` y `softDelete(id)`. Y `IListExpensesParams` con `start_date?` y `end_date?`.
17. Crear `expenses/domain/expenses.types.ts` con `CreateExpenseData` e `IExpenseResponse`.
18. Crear `expenses/presentation/expenses.dto.ts` con `CreateExpenseDtoSchema` (`.strict()`, con `name` de 1 a 200, `description` con `z.string().max(500).nullish()`, `total` con `MONEY_PATTERN` y `expense_date` con `z.coerce.date().optional()`), `ExpenseIdParamSchema` (con `z.string().uuid("Expense id must be a valid UUID")`) y `ExpensesQuerySchema` (los dos filtros de fecha, `.strict()`).
19. Crear `expenses/infrastructure/prisma-expense.repository.ts` con un `expenseSelect` que traiga los ocho campos, e implementar `create`, `findAll` (con `deleted_at: null`, rango sobre `expense_date` y orden `expense_date: "desc"` y luego `id: "desc"`) y `softDelete` (con `prisma.expense.update`, nunca `delete`).
20. Crear `expenses/presentation/expenses.mappers.ts` con `mapExpenseToResponse(expense)`, convirtiendo `total` con `toMoneyString`. La clave `description` **siempre viaja**, con `null` cuando no se informó, para que la forma del recurso sea estable.
21. Crear `expenses/application/expenses.service.ts` con `createExpenseService(repository)`. `create` fija `expense_date` en el instante actual cuando no viene. `getById` lanza `NotFoundError("Expense not found")` si el repositorio devuelve `null`. `delete` llama a `getById` primero y después a `softDelete`.
22. Crear `expenses/presentation/expenses.controller.ts` con los tres métodos. `create` responde `201`; `list` y `delete`, `200`. `delete` responde con `{ message: "Expense deleted successfully" }`.
23. Crear `expenses/presentation/expenses.routes.ts` con las tres rutas y **ningún `preHandler` de guard**.
24. Registrar los dos módulos en `backend/src/app.ts` con `api.register(packagesRoutes, { prefix: "/packages" })` y `api.register(expensesRoutes, { prefix: "/expenses" })` dentro del bloque de `/api/v1`.
25. Ampliar `backend/src/tests/fakes.ts` con `makePackage(overrides)` y `makeExpense(overrides)`, con `total` como `Prisma.Decimal`. Los fakes modelan entidades, y las entidades llevan importes como `Decimal`.
26. Crear `_tests_/packages.mappers.test.ts`: el mapper devuelve los ocho campos; un paquete con `sale_id: null` devuelve `sale_id: null` y no lo omite; las fechas viajan en ISO 8601 UTC.
27. Crear `_tests_/expenses.service.test.ts`: `create` devuelve el gasto con `expense_date` por defecto; `list` devuelve el arreglo completo sin metadatos de paginación; `delete` propaga `NotFoundError`.
28. Crear `_tests_/expenses.mappers.test.ts`: `total` viaja como la cadena exacta; `description` viaja como `null` cuando no se informó, y la clave **está presente**; `deleted_at` **no** aparece en la respuesta.
29. Ejecutar `pnpm --filter shpr test` y confirmar que todas las pruebas pasan.
30. Verificar con `curl`: un `POST /packages` devuelve `201`; un `PUT /packages/:id` con un solo campo devuelve `400` con la lista de campos faltantes; un `PUT /packages/:id` con `sale_id: null` devuelve `200` y desvincula; un `DELETE /packages/:id` devuelve `200` con el mensaje y un segundo `DELETE` del mismo id devuelve `404`; un `POST /expenses` con `total: "-50.00"` devuelve `400`; un `DELETE /expenses/:id` devuelve `200` con el mensaje.

## Criterios de Done

- [x] `backend/src/modules/packages/` y `backend/src/modules/expenses/` existen, cada uno con `domain/`, `application/`, `infrastructure/`, `presentation/` y `_tests_/`.
- [x] `grep -c "from \"@prisma/client\"" backend/src/modules/packages/domain/*.ts backend/src/modules/expenses/domain/*.ts` devuelve `0` en todos.
- [x] Un `POST /api/v1/packages` con un `sale_id` inexistente devuelve `400` con `code: "BAD_REQUEST"` y `message: "Sale not found"`, no `500`.
- [x] Un `PUT /api/v1/packages/:id` con un solo campo devuelve `400` con la lista de campos faltantes, porque `PUT` es reemplazo completo.
- [x] Un `PUT /api/v1/packages/:id` con `sale_id: null` devuelve `200` y el paquete deja de aparecer en el campo `packages` de `GET /api/v1/sales/:id`.
- [x] Un `DELETE /api/v1/packages/:id` devuelve `200` con `{ "message": "Package deleted successfully" }` y **no** borra la fila: `select count(*) from package where id = '<uuid>'` devuelve `1` y `deleted_at` dejó de ser `NULL`.
- [x] Un segundo `DELETE /api/v1/packages/:id` del mismo identificador devuelve `404`.
- [x] Un `GET /api/v1/packages?method=bitcoin` devuelve `400` con el prefijo `method`.
- [x] Un `GET /api/v1/expenses?page=2` devuelve `400`, no `200`.
- [x] La respuesta de un gasto siempre trae la clave `description`, con `null` cuando no se informó.
- [x] Ninguna respuesta de ningún endpoint trae `deleted_at`.
- [x] `pnpm --filter shpr test` pasa el 100%, incluidas las ocho pruebas nuevas de los dos módulos.
- [x] `pnpm --filter shpr typecheck` termina con código de salida `0`.

### Evidencia — AUD-09 (`backend/05`)

#### CORR-10 — el criterio 91 se cumplía a medias, y la parte que faltaba era la importante

El criterio pide un `400` "con la lista de campos faltantes". Ejecutado, el `PUT`
devuelve:

```
PUT {}                              → 400 {"message":"name: Required",
                                           "details":["name: Required","method: Required"]}
PUT {"name":"Solo nombre"}          → 400 {"message":"method: Required"}
```

La lista **sí** viaja, pero en `details`, y `message` lleva solo el primero. Y
eso no es un defecto del módulo de paquetes: es el contrato de `error-handler.ts`
para todos los endpoints, y está bien pensado — `message` con el prefijo del
campo es lo que exigen los criterios 95, 96 y 100, y `details` da el resto.

La prueba existente solo comprobaba `expect(res.json().message).toMatch(/^method:/)`.
Es decir: pasaba la mitad del criterio y no miraba la mitad que lo justifica. Se
agregaron dos pruebas:

- un cuerpo vacío trae `message: "name: Required"` **y** `details` con los dos;
- un cuerpo con un solo campo deja **un** campo fuera, porque `package_date` es
  `optional`, y entonces `details` **no** aparece.

La segunda importa tanto como la primera: sin ella, un `details` que siempre
mandara una lista de un elemento también pasaría, y el handler estaría inventando
estructura que no tiene.

#### CORR-11 — el criterio 98 hacía una afirmación universal con dos pruebas

`Ninguna respuesta de ningún endpoint trae deleted_at` estaba cubierto por **dos**
aserciones, en `POST /packages` y `POST /expenses`. Hay diez endpoints.

Y lo que hace ese criterio importante es que hoy es una **convención, no una
garantía**: los repositorios piden la columna explícitamente —
`prisma-sale.repository.ts:20` y `:34`, `prisma-package.repository.ts:14`,
`prisma-expense.repository.ts:14`, los cuatro con `deleted_at: true`— porque el
borrado lógico se filtra en el `where`, no en el `select`. La columna viaja
entonces desde la base hasta la entidad, y que no llegue a la respuesta depende
de que cada mapper nombre las claves una por una. El día que alguien escriba
`...sale` en un mapper, `deleted_at` y `payment_bank` salen juntos, y con dos
aserciones nada lo nota.

Se agregó una prueba transversal que recorre los diez endpoints y busca la clave
`deleted_at` **a cualquier profundidad**, en lugar de solo en el nivel superior:
los artículos de una venta y los paquetes de su venta son objetos anidados, y una
búsqueda superficial los dejaría pasar.

Comprobada por mutación, dos veces, porque la primera no probó lo que debía:

| Mutación | Resultado |
| --- | --- |
| `deleted_at: source.deleted_at` (referencia inexistente) | falla, pero por un `500` — detectaba el error, no la fuga |
| `deleted_at: "2020-01-01T00:00:00.000Z"` (literal, no rompe nada) | **falla con `expected [ …(2) ] to deeply equal []`** — dos endpoints filtrando |
| restaurado | pasa |

La primera mutación dio un falso positivo de la methodology: el test detectaba algo,
pero por el `500` y no por la clave. Por eso se repitió con una mutación que filtra
de verdad. Un test que falla por el motivo equivocado no demuestra el criterio,
igual que uno que no puede fallar.

`backend/05` queda **13/13**. Suite **126/126**, era 123: los tres tests nuevos.
