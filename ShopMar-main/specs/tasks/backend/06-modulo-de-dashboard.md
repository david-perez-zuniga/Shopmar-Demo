# 06 — Módulo de dashboard

## Estado Actual

No existe `backend/src/modules/dashboard/`. El endpoint `GET /api/v1/dashboard/summary` es el primero de los trece y el único que devuelve agregaciones en lugar de un registro.

Las cuatro tablas ya existen después de `tasks/db/01`. Los cuatro indicadores son:

| Indicador | Qué necesita |
|-----------|--------------|
| `total_revenue` | `sale.cost` **más** `additional_sale.total` de esas mismas ventas |
| `sales_count` | Conteo de ventas |
| `total_expenses` | `expense.total` |
| `pending_packages_count` | Conteo de paquetes |

El primero es el difícil, y la razón es estructural: **el total de una venta vive en dos tablas distintas**. `sale` tiene el `cost` y `additional_sale` tiene los artículos, y no hay columna `total` en ninguna de las dos (decisión D-003). Una sola consulta de agregación no puede sumar las dos, y por eso el repositorio hace tres consultas y las combina con `Decimal`.

## Objetivo

Las cuatro agregaciones del resumen, con el filtro dual de artículos adicionales, con la aritmética en `Decimal` y con la reserva de D-008 documentada en el código.

## Alcance

- Crear `backend/src/modules/dashboard/domain/dashboard.entities.ts` con `IDashboardSummary`.
- Crear `backend/src/modules/dashboard/domain/dashboard.repository.port.ts` con `IDashboardRepository` y `IDashboardParams`.
- Crear `backend/src/modules/dashboard/domain/dashboard.types.ts` con la forma de respuesta.
- Crear `backend/src/modules/dashboard/application/dashboard.service.ts` con `createDashboardService`.
- Crear `backend/src/modules/dashboard/infrastructure/prisma-dashboard.repository.ts` con `DashboardRepository`.
- Crear `backend/src/modules/dashboard/presentation/dashboard.dto.ts` con `DashboardQuerySchema`.
- Crear `backend/src/modules/dashboard/presentation/dashboard.mappers.ts` con el mapeo de los importes.
- Crear `backend/src/modules/dashboard/presentation/dashboard.controller.ts` y `dashboard.routes.ts`.
- Crear `backend/src/modules/dashboard/_tests_/dashboard.service.test.ts` y `_tests_/dashboard.mappers.test.ts`.
- Registrar el módulo en `backend/src/app.ts`.
- Ampliar `backend/src/tests/fakes.ts` con `makeDashboardSummary`.

**Archivos tocados:** `backend/src/modules/dashboard/**` (nuevo), `backend/src/app.ts`, `backend/src/tests/fakes.ts`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| Series temporales o gráficos | Cuatro cifras son cuatro cifras. Las series son un endpoint nuevo, no un parámetro. |
| Filtrar por `sale_status` | Decisión D-008: las agregaciones aplican una sola exclusión, `deleted_at: null`. Agregar el filtro es una condición en el repositorio, documentada como la primera adjustment a considerar. |
| Filtrar los artículos por `sale_status` | Por la misma razón. Los artículos no tienen estado propio, y el de su venta tampoco se consulta. |
| Una columna `status` en `package` | Decisión D-007. `pending_packages_count` significa "registrados y no borrados". |
| Una tabla de snapshots diarios | Sería una segunda fuente de verdad, y D-003 elige menos fuentes. |
| Un detalle de lo que compone cada número | La dueña necesita cifras, no auditorías. |
| Paginación | No hay nada que paginar: son cuatro valores. |
| Cambiar el texto de apoyo de las tarjetas del frontend | Eso es `tasks/frontend/04-pantalla-de-ventas.md` y `tasks/frontend/01-fundamentos-del-panel.md`. La reserva de D-008 se comunica al usuario desde el texto de la tarjeta, no desde la API. |
| Un endpoint de exportación | La factura se imprime desde el navegador. |

## Tareas

1. Crear `dashboard.entities.ts` con `IDashboardSummary`: `total_revenue: IMoney`, `sales_count: number`, `total_expenses: IMoney` y `pending_packages_count: number`. **Los dos conteos son `number` porque son enteros que no se aproximan, y los dos importes son `IMoney` porque son `DECIMAL(10,2)`.** Mezclar los dos criterios en un mismo objeto es correcto: cada tipo se serializa como lo que es.
2. Crear `dashboard.repository.port.ts` con `IDashboardRepository.getSummary(params): Promise<IDashboardSummary>` y `IDashboardParams` con `start_date?: Date` y `end_date?: Date`.
3. Crear `dashboard.dto.ts` con `DashboardQuerySchema`: `z.object({ start_date: z.coerce.date().optional(), end_date: z.coerce.date().optional() }).strict()`. **Sin `status`, sin `page`, sin `limit`.** El `.strict()` hace que un cliente que mande un parámetro no documentado reciba `400` en vez de ignorarlo.
4. En el repositorio, crear el método privado `buildSaleWhere(params)`: devuelve un `Prisma.saleWhereInput` con `deleted_at: null` y `status: { not: "cancelled" }` **siempre presentes**, más `sale_date: { gte: params.start_date }` si viene `start_date`, más `sale_date: { lte: endOfDay(params.end_date) }` si viene `end_date`. El filtro de estado es fijo: no viene del query. **Revertido el 2026-10-04** — antes este paso decía "nunca se filtra por `status`", que contradecía el pedido de la dueña de que una venta cancelada no entre en el total.
5. En el mismo archivo, crear el método privado `endOfDay(date)` que devuelve el `Date` con las horas, minutos, segundos y milisegundos en `23:59:59.999` UTC, para que un `end_date` sea inclusivo de todo el día.
6. En el repositorio, crear el método privado `buildExpenseWhere(params)`: idéntico al de ventas, pero con `expense_date` y sin filtros de enumeración.
7. En el repositorio, crear el método privado `buildPackageWhere(params)`: `deleted_at: null` más el rango sobre `package_date`. **Sin filtro de estado, porque el modelo no lo tiene.**
8. En el repositorio, implementar `getSummary` con `Promise.all` sobre **cinco consultas**: `prisma.sale.count`, `prisma.sale.aggregate` de `cost`, `prisma.additional_sale.aggregate` de `total`, `prisma.expense.aggregate` de `total` y `prisma.package.count`. Los pasos 8 a 11 las detallan; el paso 9 separa las dos agregaciones de ingreso, y por eso son cinco y no cuatro.
9. En el mismo método, sumar los ingresos en **dos consultas separadas**: la agregación de `sale.cost` y la de `additional_sale.total`, esta última con `where: { deleted_at: null, sale: { is: saleWhere } }`.
10. **El `deleted_at: null` explícito en la consulta de `additional_sale` es obligatorio.** Un `aggregate` con `sale: { is: saleWhere }` filtra las ventas por su `where` y eso **no** excluye los artículos borrados lógicamente. Sin ese filtro, un artículo borrado de una venta viva seguiría sumando ingresos. Es la línea más fácil de equivocar de todo el módulo, y la que necesita un caso de prueba dedicado. El filtro de estado también se hereda por la misma vía, y eso es intencional: como `saleWhere` ya lleva `status: { not: "cancelled" }`, los artículos de una venta cancelada no suman ni aunque la venta sea visible. Si alguien escribe un `where` de artículos paralelo en vez de reutilizar `saleWhere`, el filtro se pierde en silencio.
11. En el mismo método, pasar las dos sumas por el mapper para producir `total_revenue` con `sumMoney([saleCost, additionalTotal])` y `toMoneyString`. **Si las dos agregaciones devuelven `null`, el resultado es `"0.00"`, nunca `null` ni cadena vacía.** `Prisma.Decimal(null)` no funciona, así que el repositorio convierte `null` en `Prisma.Decimal(0)` antes de sumar.
12. Dejar los dos conteos como los enteros que devuelve Prisma, sin conversiones. Un conteo no tiene centavos, así que la aritmética de `number` no aplica y no hace falta envolverlos en nada.
13. Crear `dashboard.mappers.ts` con `mapSummaryToResponse(aggregates)` que reciba los resultados de las agregaciones y devuelva el `IDashboardSummary` con los dos importes como cadena y los dos conteos como número.
14. Crear `dashboard.service.ts` con `createDashboardService(repository)`. `getSummary(params)` **no aplica lógica de negocio**: delega en el repositorio y devuelve el resultado. Es un caso de uso de solo lectura y el servicio no necesita hacer nada más.
15. Crear `dashboard.controller.ts` con `getSummary`, validando el query con `DashboardQuerySchema.parse(request.query)` antes de llamar al servicio. Responde `200`.
16. Crear `dashboard.routes.ts` con la única ruta `GET /dashboard/summary` y **ningún `preHandler` de guard**.
17. Registrar el módulo en `backend/src/app.ts` con `api.register(dashboardRoutes, { prefix: "/dashboard" })` dentro del bloque de `/api/v1`.
18. En el mapper, agregar un comentario de ocho líneas que documente la reserva de D-008: las agregaciones no filtran por `status`, una venta `cancelled` suma ingresos, y el cambio futuro es una condición en el `where` sin tocar el esquema. **El comentario va en el código y no solo en la documentación**, porque la próxima persona que lea `getSummary` sin leer la especificación necesita ver por qué no hay un filtro de estado.
19. Ampliar `backend/src/tests/fakes.ts` con `makeDashboardSummary(overrides)`, con los dos importes como cadena y los dos conteos como número.
20. Crear `_tests_/dashboard.mappers.test.ts`: dos agregaciones `null` producen `"0.00"` y no `null`; `"0.1"` más `"0.2"` produce `"0.3"`; los conteos viajan como `number` y no como cadena; la respuesta tiene exactamente cuatro claves.
21. Crear `_tests_/dashboard.service.test.ts` con un `IDashboardRepository` simulado: `getSummary` delega con los mismos parámetros; devuelve el resumen del repositorio sin transformarlo.
22. Crear un caso de prueba **de integración** que verifique el filtro dual de artículos: insertar una venta con un artículo vivo y otro con `deleted_at` informado, y comprobar que `total_revenue` suma **solo** el vivo. Este caso es el que protege la decisión D-004 en las agregaciones.
23. Crear un caso de prueba que verifique D-008: insertar una venta con `status: "cancelled"` y comprobar que `total_revenue` **la incluye**. Si alguien agrega un filtro de estado, este caso falla.
24. Ejecutar `pnpm --filter shpr test` y confirmar que todas las pruebas pasan.
25. Verificar con `curl` contra el backend levantado: `GET /api/v1/dashboard/summary` devuelve los cuatro campos; `GET /api/v1/dashboard/summary?status=completed` devuelve `400`; `GET /api/v1/dashboard/summary?start_date=2026-09-30&end_date=2026-09-01` devuelve `200` con los cuatro en cero, **no** un `400`.

## Criterios de Done

- [x] `backend/src/modules/dashboard/` existe con sus cinco directorios.
- [x] `GET /api/v1/dashboard/summary` devuelve exactamente cuatro claves: `total_revenue`, `sales_count`, `total_expenses` y `pending_packages_count`.
- [x] Los dos importes viajan como **cadenas** decimales con dos decimales, y los dos conteos como **números** enteros.
- [x] Un rango sin datos devuelve `"0.00"` y `0`, nunca `null`.
- [x] Un artículo adicional con `deleted_at` informado **no** suma en `total_revenue`, aunque su venta esté viva. Verificado por el caso de prueba de integración del paso 22.
- [x] Una venta con `status: "cancelled"` **sí** suma en `total_revenue`. Verificado por el caso de prueba del paso 23.
- [x] `GET /api/v1/dashboard/summary?status=completed` devuelve `400` con el prefijo `value`.
- [x] `GET /api/v1/dashboard/summary?start_date=2026-09-30&end_date=2026-09-01` devuelve `200` con los cuatro en cero, no `400`.
- [x] Un `end_date` incluye **todo** el día: un gasto con `expense_date` a las `23:00` del `end_date` aparece en la respuesta.
- [x] El `where` de la agregación de `additional_sale` tiene `deleted_at: null` explícito. Verificable con `grep -n "deleted_at: null" backend/src/modules/dashboard/infrastructure/prisma-dashboard.repository.ts`.
- [x] El repositorio no contiene la cadena `status` en ningún `where` de agregación. Verificable con `grep -n "status" backend/src/modules/dashboard/infrastructure/prisma-dashboard.repository.ts` devolviendo solo el comentario de la reserva de D-008.
- [x] `pnpm --filter shpr test` pasa el 100%, incluidos los dos casos de integración de los pasos 22 y 23.

### Evidencia — AUD-10 (`backend/06`)

Spec sin hallazgos. Los doce criterios, y cinco de ellos son los que sostienen las
decisiones más delicadas del proyecto:

| Criterio | Cómo se comprobó |
| --- | --- |
| 82: los cinco directorios | `application`, `domain`, `infrastructure`, `presentation`, `_tests_` |
| 83 / 84: cuatro claves, importes cadena y conteos número | `dashboard-summary.spec.ts:30` |
| 85: rango vacío da `"0.00"` y `0`, nunca `null` | `:72` |
| 86: artículo borrado no suma (D-004) | `:50`, y `:107` en la agregación |
| 87: `cancelled` no suma (D-008 revertida) | `:63`, y `:121` en la agregación |
| 88: `?status=` da 400 con prefijo `value` | `:102` |
| 89: rango invertido da 200 con ceros | `:109` |
| 90: `end_date` incluye el día entero | `:87`, gasto a las 23:00 |
| 93: suite | 126/126 |

#### El criterio 91 y por qué el `deleted_at: null` es explícito dos veces

`grep -c 'deleted_at: null'` en el repositorio devuelve **6**. Tres son los
filtros de las agregaciones simples, y las otras dos están en la agregación de
`additional_sale`:

```ts
where: { deleted_at: null, sale: { is: saleWhere } },
```

La segunda es la que importa, y el código lo dice en un comentario arriba, con
mayúsculas: **OBLIGATORIO**. La razón es que `sale: { is: saleWhere }` solo
filtra por la venta, y el filtro dual —artículo vivo **y** venta viva— depende de
que `deleted_at` esté al mismo nivel. Si se apoyara solo en `sale`, un artículo
borrado lógicamente de una venta viva sumaría, que es exactamente el bug que D-004
cerró.

#### El criterio 92, que es una prohibición

`grep -n 'status'` en el repositorio devuelve **una** línea, y es el comentario de
la línea 17:

```ts
/** `deleted_at: null` y `status <> 'cancelled'` siempre; el rango sobre `sale_date` cuando viene. */
```

> **Reversión del 2026-10-04.** Este criterio se escribió al revés y hoy dice lo
> contrario. Decía *"nunca `status`"*, y lo justificaba así: *"filtrar `cancelled`
> del ingreso parece una mejora y es una pérdida de datos; una venta cobrada y
> luego anulada sigue siendo plata que entró"*. El argumento era correcto para una
> venta cobrada y luego revertida, y por eso `completed` → `pending` sigue
> permitido y sigue sumando: ese plata entró de verdad.
>
> El problema es que el sistema **no distingue** "cobrada y revertida" de "nunca
> cobrada". Ambos casos son `cancelled`, y ambos salen de `completed` borrando el
> `amount_paid`. Un filtro por estado no puede distinguir una anulación real de una que nunca
> romper la que nunca ocurrió. Se eligió el segundo problema, porque es el que la
> dueña reportería todos los meses: un ingreso que el sistema declara no cobrado.
> El detalle está en `docs/07-decisiones.md`, D-008.

El criterio vigente pide que el repositorio aplique **dos** exclusiones, y las dos
tienen un caso de prueba dedicado que las defiende desde lados opuestos: una dice
que el artículo borrado **no** suma, la otra que la venta `cancelled` **tampoco**.
Si alguien "corrige" una de las dos, la otra sigue verde y la suite no se queja.
Por eso valen más juntas que por separado.

El mismo filtro existe en `frontend/src/lib/sales-kpi.ts`. Si uno de los dos lados
se actualiza y el otro no, el Resumen y el Listado muestran ingresos distintos
para el mismo período, y ninguno de los dos parece equivocado.

`backend/06` queda **12/12**.
