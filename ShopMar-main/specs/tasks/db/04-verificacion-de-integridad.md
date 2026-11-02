# 04 — Verificación de integridad

## Estado Actual

Después de `db/01`, `db/02` y `db/03` la base debería tener cuatro tablas, cuatro enums, ocho índices, dos claves foráneas, cinco restricciones `CHECK` y 37 columnas. **"Debería" es la parte peligrosa.**

Un esquema puede estar mal y todas las pruebas de aplicación pasar. Si `additional_sale` pierde su `deleted_at`, el filtro de artículos del dashboard devuelve el doble de ingresos y ninguna prueba unitaria lo detecta, porque los dobles de prueba no tienen columnas. Si un `CHECK` desaparece del SQL, `prisma validate` sigue diciendo que el esquema es válido, porque Prisma nunca los vio.

La verificación tiene que hacerse **contra el catálogo de PostgreSQL**, no leyendo el archivo del esquema. El archivo dice lo que alguien quiso escribir; el catálogo dice lo que existe.

Además, las pruebas de integración necesitan datos que el seed de `db/01` no crea: un artículo borrado lógicamente, un paquete desvinculado y una venta cancelada.

## Objetivo

Un conjunto de consultas que comparan el catálogo real contra el documento de esquemas, y las pruebas de integración que demuestran las tres invariantes del modelo con datos que las obligan a cumplirse.

## Alcance

- Crear `backend/scripts/verify-schema.sql` con las consultas de verificación.
- Crear `backend/src/tests/helpers/factories.ts` con las fábricas de prueba.
- Crear `backend/src/tests/integration/money.spec.ts`, `dashboard-aggregation.spec.ts`, `soft-delete.spec.ts` y `package-relation.spec.ts`.
- Ampliar `backend/src/scripts/seed.ts` con los casos límite, comentados.

**Archivos tocados:** `backend/scripts/verify-schema.sql` (nuevo), `backend/src/tests/helpers/factories.ts` (nuevo), `backend/src/tests/integration/*.spec.ts` (nuevos), `backend/src/scripts/seed.ts`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| Cambiar el modelo de datos | Las tres invariantes se respetan con el modelo actual. Agregar una columna para simplificar código de aplicación es cambiar la especificación. |
| Escribir el código de los cuatro módulos | Es `tasks/backend/04`, `05` y `06`. Aquí se preparan los datos y las pruebas que los verifican. |
| Un trigger que propague el borrado lógico | Un trigger haría el trabajo de la aplicación sin que nadie lo vea en el código. La regla es explícita en el servicio. |
| Propagar el borrado lógico de una venta a sus artículos | **Decisión explícita: no se propaga.** Una venta `cancelled` conserva sus artículos visibles en el detalle, y por eso los artículos se excluyen del dashboard por su propio `deleted_at`, no por el estado de su venta. |
| Un índice compuesto `(sale_id, deleted_at)` | Los ocho índices de la especificación son de una sola columna. Sustituirlos requiere el `EXPLAIN` de `db/02`. |
| Restaurar registros borrados lógicamente | No hay endpoint de restauración. |
| Migrar datos del andamiaje | No hay datos de negocio reales. |
| Pruebas de rendimiento o de carga | Verificar que un índice se usa es `db/02`. |
| Un doble de API con MSW para el backend | El backend se prueba contra una base real. |
| Cambiar el formato de la factura | Eso es frontend. |
| Un reporte de cobertura de código | `vitest --coverage` corre aparte y no decide si la base es correcta. |

## Tareas

### Verificación del catálogo

1. Crear `backend/scripts/verify-schema.sql` con una consulta que liste las tablas reales de `public` y las compare con las cuatro esperadas, marcando cada falta como error.
2. En el mismo archivo, consultar `pg_type` con `typtype = 'e'` y listar los cuatro enums con sus valores, en ese orden: `sale_type`, `sale_status`, `payment_method`, `package_method`.
3. En el mismo archivo, verificar que `payment_method` tiene **exactamente dos** valores, `cash` y `credit_card`. Si aparece un tercero, la consulta falla: un valor de pago no documentado significa que hay un camino de escritura que nadie probó.
4. En el mismo archivo, contar las columnas reales por tabla y compararlas con el documento: `sale` 12, `additional_sale` 9, `package` 8, `expense` 8, con un total de 37.
5. En el mismo archivo, listar los índices desde `pg_indexes` filtrando por el sufijo `_idx` y verificar que hay exactamente ocho, y que los nombres coinciden con los del esquema.
6. En el mismo archivo, verificar el tipo real de cada columna de fecha, distinguiendo las dos familias. Esta es la verificación que más valor tiene, porque la diferencia es invisible en la lectura del esquema:
   ```sql
   SELECT table_name, column_name, data_type, datetime_precision
   FROM information_schema.columns
   WHERE table_schema = 'public' AND data_type LIKE 'timestamp%'
   ORDER BY table_name, column_name;
   ```
   Las tres fechas de negocio (`sale_date`, `package_date`, `expense_date`) deben salir como `timestamp with time zone`, y las doce marcas de auditoría como `timestamp without time zone`.
7. En el mismo archivo, verificar que los tres importes son `numeric(10,2)` y que la escala es exactamente `2`. Un `numeric` sin precisión pasa las pruebas de la aplicación y rompe el redondeo.
8. En el mismo archivo, verificar que **ninguna columna de nombre tiene `character varying`**. Un `varchar(200)` que alguien agregó por costumbre contradice la especificación y recorta información que la dueña escribió.
9. En el mismo archivo, listar las restricciones `CHECK` desde `pg_constraint` y verificar que están **las cinco**, con sus nombres y sus expresiones. La tabla del documento de esquemas muestra cuatro filas porque agrupa en una la expresión de `additional_sale.total` y la de `expense.total`, pero el catálogo tiene cinco objetos. **La comprobación es por nombre de restricción, no por expresión**: si el criterio buscara solo la expresión, la base podría tener cuatro de cinco y la verificación pasaría igual. Los cinco nombres son `sale_payment_method_bank_check`, `sale_cost_non_negative`, `additional_sale_total_non_negative`, `additional_sale_quantity_min` y `expense_total_non_negative`.
10. En el mismo archivo, verificar las dos claves foráneas desde `information_schema` y confirmar sus `on_delete`: `Cascade` para `additional_sale` y `SetNull` para `package`.
11. En el mismo archivo, verificar que `additional_sale.sale_id` es `NOT NULL` y que `package.sale_id` acepta `NULL`. Una relación que cambió de opcional a obligatoria rompe el alta de un paquete retirado sin venta.
12. En el mismo archivo, verificar que solo `expense_date` tiene valor por defecto entre las tres fechas de negocio, y que `status` y `quantity` tienen los suyos.
13. Agregar a `backend/package.json` el script `db:verify` que ejecuta este archivo con `psql`, con `set -e` para que un fallo en cualquier consulta termine con código distinto de `0`.

### Datos de prueba

14. Crear `backend/src/tests/helpers/factories.ts` con cinco funciones que reciben un `PrismaClient` y devuelven lo creado: `createSale(overrides)`, `createAdditionalSale(saleId, overrides)`, `createPackage(overrides)`, `createExpense(overrides)` y `createSaleWithAdditional(overrides)`.
15. En las fábricas, usar valores por defecto que **no** dependan del seed: una venta `live` de `cash` con `cost` `"1000.00"`, sin artículos, `status: "pending"` y `sale_date` de hoy. Cada campo se sobrescribe individualmente.
16. En las fábricas, **crear los importes con `new Prisma.Decimal("1000.00")` de `@prisma/client/runtime/library`**, nunca con un literal numérico. Una fábrica que devuelve `1000` le está enseñando al resto de las pruebas que un número sirve, que es exactamente el error que `tasks/backend/03` existe para impedir.
17. Crear `backend/src/tests/integration/money.spec.ts` con estos casos contra la base real:
    - Un gasto con `new Prisma.Decimal("0.1").plus("0.2")` se persiste y se relee como `"0.3"`.
    - Un gasto con `new Prisma.Decimal("0.30")` se relee como `"0.30"`, con el cero significativo conservado. **Este caso falla si alguien cambió la columna a `FLOAT` o a `NUMERIC` sin precisión.**
    - Un gasto con el máximo `"99999999.99"` se persiste sin truncamiento.
    - Un gasto con `"99999999.999"` es rechazado por la base, porque la columna es `DECIMAL(10,2)`.

### Agregaciones del dashboard

18. Crear `backend/src/tests/integration/dashboard-aggregation.spec.ts` con el caso más importante del proyecto, el filtro dual de artículos:
    - Crear una venta con `cost: "1000.00"`.
    - Crear un artículo con `total: "200.00"` y `deleted_at: null`.
    - Crear un segundo artículo con `total: "300.00"` y `deleted_at` informado, con un `update` directo a la base para simular el borrado lógico.
    - Consultar el resumen del dashboard sin rango de fechas.
    - **Afirmar que `total_revenue` es `"1200.00"` y no `"1500.00"`.** El artículo borrado no cuenta, aunque su venta esté viva.
19. En el mismo archivo, agregar el caso de D-008: crear una venta con `status: "cancelled"` y `cost: "500.00"`, y afirmar que `total_revenue` **la incluye**. Si alguien agrega un filtro de estado, esta prueba falla y avisa.
20. En el mismo archivo, agregar el caso de la venta borrada lógicamente: crear una venta con `cost: "700.00"` y `deleted_at` informado, y afirmar que `total_revenue` **no** la incluye y que `sales_count` no la cuenta.
21. En el mismo archivo, agregar el caso del rango: dos ventas, una dentro y otra fuera, y afirmar que las agregaciones solo ven la primera. Probar los dos límites, incluida una venta a las `23:59:59.999` del `end_date`, que **sí** debe aparecer.
22. En el mismo archivo, agregar el caso de los gastos: uno dentro del rango, uno fuera y uno borrado lógicamente, y afirmar que `total_expenses` solo suma el primero.
23. En el mismo archivo, agregar el caso de los paquetes: uno registrado y uno borrado lógicamente, y afirmar que `pending_packages_count` es `1`.

### Borrado lógico y relaciones

24. Crear `backend/src/tests/integration/soft-delete.spec.ts` con los tres comportamientos:
    - Un `DELETE` de paquete deja la fila en la base con `deleted_at` informado, y `select count(*) from package where id = '<uuid>'` devuelve `1`.
    - Un paquete borrado lógicamente **no aparece** en el listado.
    - Un paquete borrado lógicamente **no aparece** en el detalle de la venta que lo tenía vinculado, porque el `select` anidado lleva su propio `where: { deleted_at: null }`.
25. En el mismo archivo, agregar el caso de la venta cancelada y sus artículos, que documenta la decisión de no propagar: crear una venta con dos artículos, cambiar su `status` a `cancelled`, y afirmar que los dos artículos **siguen apareciendo** en el detalle y que el total derivado **no cambia**. Dejar un comentario que enlace a D-004.
26. Crear `backend/src/tests/integration/package-relation.spec.ts` con los tres casos de `package.sale_id`:
    - Un paquete con `sale_id: null` funciona, y aparece en el listado de paquetes pero en ninguna venta.
    - Un paquete con un `sale_id` válido aparece en el detalle de esa venta.
    - Un paquete con un `sale_id` inexistente devuelve `400` con `"Sale not found"`, por el `P2003` traducido.
27. En el mismo archivo, agregar el caso de la desvinculación: un `PUT` con `sale_id: null` saca el paquete del detalle de la venta y **la venta sigue existiendo**. El `onDelete: SetNull` nunca llega a dispararse porque nada se borra físicamente, y esta prueba deja eso documentado.
28. En el mismo archivo, agregar el caso del reemplazo completo: un `PUT` con solo `name` devuelve `400` con la lista de campos faltantes, y **no** un `200` que vacíe `method` y `package_date`.

### Seed y configuración

29. En `backend/src/scripts/seed.ts`, agregar el caso límite que falta: un artículo con `deleted_at` informado, un paquete con `sale_id: null` y una venta `cancelled` con dos artículos vivos.
30. Dejar esos casos límite **comentados** en el seed, con una nota que diga que existen solo para las pruebas de integración y que se pueden quitar. Si se dejan activos, el dashboard de desarrollo muestra números que no corresponden con la operación real, y la primera vez que alguien ve que los ingresos no cuadran con la lista de ventas pierde la confianza en el panel.
31. En la suite de integración, agregar un `beforeEach` que trunque las cuatro tablas en orden inverso de dependencias: `additional_sale`, `package`, `sale`, `expense`. **El orden importa**: truncar `sale` antes que `additional_sale` viola la clave foránea.
32. Apuntar la suite de integración a la base de `.env.test` y **no** a la de desarrollo. Verificar que `vitest.config.ts` usa un archivo de entorno distinto para integración.
33. Ejecutar `pnpm --filter shpr db:verify` contra la base reconstruida y confirmar que las trece consultas reportan el estado esperado.
34. Ejecutar `pnpm --filter shpr test` y confirmar que pasan tanto las pruebas unitarias como las de integración.
35. Ejecutar la suite de integración **dos veces seguidas** y confirmar que pasa las dos. Una prueba que solo pasa la primera vez tiene estado compartido, y las tablas sin truncar entre casos son la causa número uno.

## Criterios de Done

- [x] `backend/scripts/verify-schema.sql` existe y `pnpm --filter shpr db:verify` sale con código `0` sobre la base correcta.
- [x] La verificación confirma cuatro tablas y **37 columnas** en total: 12 + 9 + 8 + 8.
- [x] La verificación confirma cuatro enums, y que `payment_method` tiene **exactamente dos** valores.
- [x] La verificación distingue las dos familias de fecha: tres `timestamp with time zone` y doce `timestamp without time zone`.
- [x] La verificación confirma que los tres importes son `numeric(10,2)` con escala `2`.
- [x] La verificación confirma que **ninguna** columna de nombre es `character varying`.
- [x] La verificación confirma ocho índices con los nombres que declara el esquema.
- [x] La verificación confirma las dos claves foráneas con `Cascade` y `SetNull` correctos, y que `additional_sale.sale_id` es `NOT NULL` mientras `package.sale_id` admite `NULL`.
- [x] La verificación de `CHECK` confirma **cinco** restricciones por nombre, y el documento de esquemas, el SQL de la migración y el catálogo coinciden en el número.
- [x] `backend/src/tests/helpers/factories.ts` existe con las cinco funciones de fábrica.
- [x] `grep -n "total: [0-9]\|cost: [0-9]" backend/src/tests/helpers/factories.ts` devuelve `0` resultados. Ninguna fábrica crea un importe numérico.
- [x] La prueba del artículo borrado lógicamente afirma `"1200.00"` y **falla** si se le suma el `"300.00"` del artículo anulado.
- [x] La prueba de la venta `cancelled` afirma que su importe **sí** aparece en `total_revenue`.
- [x] La prueba de la venta con `deleted_at` afirma que su importe **no** aparece y que `sales_count` no la cuenta.
- [x] El rango se prueba en los dos límites, y una venta a las `23:59:59.999` del `end_date` **sí** aparece.
- [x] Un paquete borrado lógicamente no aparece ni en su listado ni en el detalle de su venta.
- [x] Una venta `cancelled` conserva sus artículos visibles en el detalle, y el test lo documenta con un enlace a D-004.
- [x] Un `POST /api/v1/packages` con un `sale_id` inexistente devuelve `400` con `"Sale not found"`.
- [x] Un `PUT /api/v1/packages/:id` con `sale_id: null` desvincula el paquete y **la venta sigue existiendo**.
- [x] Un `PUT /api/v1/packages/:id` con campos parciales devuelve `400` y no borra datos.
- [x] `pnpm --filter shpr test` pasa el 100%, incluida la suite de integración.
- [x] La suite de integración pasa **dos ejecuciones consecutivas**.

### Evidencia de la verificación — AUD-04

`pnpm --filter shpr db:verify` sale con `0` y reporta
`4 tablas, 4 enums, 8 indices, 2 FK, 5 CHECK, 37 columnas`. No se le creyó: los
37 se comprobaron directo contra `information_schema`.

| Criterio | Cómo se comprobó | Resultado |
| --- | --- | --- |
| 4 tablas, 37 columnas | `information_schema.columns` agrupado | 12 + 9 + 8 + 8 = **37** |
| 4 enums, `payment_method` con 2 | `pg_enum` ordenado por `enumsortorder` | `cash,credit_card` |
| 3 `timestamptz`, 12 `timestamp` | `information_schema.data_type` | 3 y 12 |
| 3 importes `numeric(10,2)` | `numeric_precision, numeric_scale` | `sale.cost`, `expense.total`, `additional_sale.total` — los tres `10,2` |
| ningún `varchar` | `data_type = 'character varying'` | **0** |
| 8 índices con los nombres del esquema | `pg_indexes` contra `prisma migrate diff` | 8, nombres idénticos |
| 2 FK con `Cascade` y `SetNull` | `pg_constraint.confdeltype` | `additional_sale` → `c`, `package` → `n` |
| `additional_sale.sale_id` NOT NULL, `package.sale_id` nullable | `information_schema.is_nullable` | `true` y `true` |
| 5 CHECK que coinciden en los tres sitios | catálogo vs `ADD CONSTRAINT` vs cabecera | **5 y 5, mismos nombres** |

Sobre los CHECK conviene ser preciso, porque es donde más fácil es pasar un grep
por encima. **Solo uno** se llama `sale_payment_method_bank_check`; los otros
cuatro terminan en `_non_negative` y `_min`. Un `grep 'CONSTRAINT ".*_check'`
devuelve **1** y hace creer que faltan cuatro. Se extrajeron los cinco nombres
por su otra mitad y coinciden con el catálogo. La puerta de oro de este criterio
es comparar los **nombres**, no contarlos.

Sobre los importes hay un detalle igual de tramposo: `numeric_precision` no está
filtrado, así que también aparecen `_prisma_migrations.applied_steps_count` y
`additional_sale.quantity` (los dos `int`). Los tres importes son los que tienen
`numeric_scale = 2`.

#### CORR-04 — al criterio 133 le faltaba la mitad

El criterio exige que un paquete borrado lógicamente no aparezca **ni en el
listado ni en el detalle**. El detalle estaba cubierto en `soft-delete.spec.ts:47`;
**el listado no tenía prueba**. La implementación era correcta —`find` empieza con
`where: { deleted_at: null }`— así que era un test faltante, no un bug.

Se agregó `GET /api/v1/packages > un paquete borrado lógicamente no aparece en el
listado`, y se comprobó que **muerde**: rompiendo el filtro a propósito
(`deleted_at: undefined`) la prueba falla con `expected [ …(4) ] to not include
'6c8270d0-…'`, y restaurando el filtro vuelve a pasar. Un test que no puede fallar
no demuestra nada, así que no se aceptó solo porque pasaba.

El resto de las pruebas se leyó una por una: 129 afirma `"1200.00"` **y** que
`"1500.00"` es falso, que es justamente el importe que aparecería si el artículo
anulado de `300.00` se sumara; 132 prueba los tres bordes (fuera de `from`, `from`
exacto, `23:59:59.999` de `to` adentro) con `sales_count = 2`; 137 además de pedir
el `400` comprueba que `method`, `package_date` y `name` siguen intactos, que es lo
que significa "no borra datos".

**Suite completa: 123/123 en 17 archivos, dos ejecuciones consecutivas sin
limpiar la base.** Eran 122; el 123 es el test nuevo. `tsc --noEmit` en 0.

`db/04` queda **22/22**.
