# 02 — Índices y restricciones

## Estado Actual

`backend/prisma/schema.prisma` tiene las directivas `@@index` de la tarea 01, y Prisma genera los `CREATE INDEX` correspondientes cuando se crea la migración.

Lo que Prisma **no** hace son los `CHECK`. No hay sintaxis de `CHECK` en el esquema, y Prisma los ignora aunque estén documentados en comentarios `///`. La consecuencia es que `prisma migrate diff` no los ve nunca: si el SQL de la migración los pierde, el esquema sigue pareciendo correcto y la integridad desaparece sin ninguna señal.

Las consultas del contrato se apoyan en ocho índices, todos de una sola columna. Y hay cinco restricciones `CHECK` que la aplicación asume pero no puede garantizar sola.

## Objetivo

Los ocho `CREATE INDEX` y los cinco `CHECK` escritos a mano en el SQL de la migración, y las pruebas que demuestran que están activos.

## Alcance

- Escribir los ocho `CREATE INDEX` en el SQL de la migración, con los nombres que Prisma genera.
- Escribir los cinco `CHECK` en el SQL de la migración.
- Verificar que Prisma los documenta en comentarios `///` del esquema, sin declararlos ahí.
- Verificar que el esquema y el SQL no divergen.

**Archivos tocados:** `backend/prisma/migrations/20260910013256_init/migration.sql`, `backend/prisma/schema.prisma` (solo comentarios `///`).

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| Índices compuestos | La especificación declara ocho índices de una sola columna. Un índice compuesto de `sale_id` y `deleted_at` sería más rápido para la agregación de ingresos, y es el candidato número uno si el `EXPLAIN` de esa consulta muestra un `Seq Scan`. Sustituir índices de la especificación requiere evidencia de un `EXPLAIN`, no intuición. |
| Índices únicos | Ninguna columna tiene unicidad. Dos ventas pueden tener el mismo cliente el mismo día; dos paquetes pueden llamarse igual. |
| Índices de texto completo o trigram para buscar por nombre | Ningún endpoint del contrato filtra por nombre. El listado de gastos y de ventas se filtra por fecha. |
| Un índice sobre `sale.cost` | Nadie ordena ni filtra por importe. Sería escritura sin lectura. |
| Un índice sobre `additional_sale.name` | Igual: no hay filtro por nombre de artículo. |
| Índices parciales `WHERE deleted_at IS NULL` | PostgreSQL los soporta y serían más chicos, pero exigen SQL crudo que Prisma no modela, y obligarían a mantenerlos a mano en cada migración futura. |
| Un `CHECK` de que `end_date >= start_date` | No hay columna de rango. El filtro viene del query, y un rango invertido devuelve cero, que es una respuesta correcta. |
| Triggers de `updated_at` | `@updatedAt` ya lo resuelve Prisma en el cliente, en cada `update`. |
| `NOT VALID` en los `CHECK` | La base se reconstruye desde cero en esta etapa. Agregar esa cláusula es una optimización de migración sobre datos existentes que todavía no existen. |
| Un `CHECK` de nombres no vacíos | No está en la especificación. La validación de longitud y de contenido vacío vive en Zod, y un `trim` en la base rejectaría nombres que el usuario escribiría sin querer. **Si se agrega, es un cambio de la especificación, no una mejora de esta tarea.** |
| Un `UNIQUE` parcial en `sale.customer_name` | El mismo cliente compra muchas veces. |
| Particionado por mes | Decisión consciente: no se particiona hasta que las agregaciones del dashboard lo justifiquen con datos reales. |
| Cambiar el `onDelete` de las relaciones | `Cascade` y `SetNull` están definidos en la tarea 01 y ambos son de contención: nunca se disparan porque nada se borra físicamente. |

## Tareas

1. En `backend/prisma/migrations/20260910013256_init/migration.sql`, escribir los ocho `CREATE INDEX` con los nombres que Prisma genera, que siguen el patrón `<tabla>_<columna>_idx`:
   - `sale_sale_date_idx` sobre `sale(sale_date)`
   - `sale_type_idx` sobre `sale(type)`
   - `sale_status_idx` sobre `sale(status)`
   - `sale_deleted_at_idx` sobre `sale(deleted_at)`
   - `additional_sale_sale_id_idx` sobre `additional_sale(sale_id)`
   - `package_package_date_idx` sobre `package(package_date)`
   - `package_sale_id_idx` sobre `package(sale_id)`
   - `expense_expense_date_idx` sobre `expense(expense_date)`
2. **Verificar los nombres contra Prisma, no de memoria.** Ejecutar `pnpm --filter shpr prisma migrate diff --from-empty --to-schema-datamodel ./prisma/schema.prisma --script` sobre un esquema temporal y copiar los nombres que Prisma emite. Un nombre inventado es una divergencia silenciosa: la base crea un índice y el esquema declara otro con el mismo conjunto de columnas.
3. En el mismo archivo, escribir los cinco `CHECK` con las expresiones exactas de la especificación:
   ```sql
   ALTER TABLE "sale" ADD CONSTRAINT "sale_payment_method_bank_check"
     CHECK (
       ("payment_method" = 'credit_card' AND "payment_bank" IS NOT NULL)
       OR ("payment_method" = 'cash' AND "payment_bank" IS NULL)
     );

   ALTER TABLE "sale" ADD CONSTRAINT "sale_cost_non_negative" CHECK ("cost" >= 0);

   ALTER TABLE "additional_sale" ADD CONSTRAINT "additional_sale_total_non_negative" CHECK ("total" >= 0);

   ALTER TABLE "additional_sale" ADD CONSTRAINT "additional_sale_quantity_min" CHECK ("quantity" >= 1);

   ALTER TABLE "expense" ADD CONSTRAINT "expense_total_non_negative" CHECK ("total" >= 0);
   ```
4. **Son cinco `CHECK`, no cuatro, y la lista de arriba está completa.** La tabla de restricciones del documento de esquemas agrupa `additional_sale.total` y `expense.total` en una sola fila porque la expresión es idéntica, pero son dos objetos distintos en dos tablas distintas. `expense_total_non_negative` es la quinta y se escribe como cualquier otra: un `ALTER TABLE` por tabla. Escribir solo cuatro deja `expense` sin la restricción que comparte expresión con `additional_sale`, que es el caso donde se ve el error de verdad, porque la base acepta un gasto negativo sin que nada avise.
5. Escribir el `CHECK` de la forma de pago con los valores de enum explícitos (`'credit_card'`, `'cash'`) y **no** con `<>` o `!=`. La forma explícita deja claro que el enum tiene dos valores, y si mañana se agrega un tercero, la base rechaza la fila en vez de aceptarla silenciosamente.
6. En `backend/prisma/schema.prisma`, documentar los cinco `CHECK` con comentarios `///` sobre el campo o el modelo correspondiente. **No declararlos en el esquema**: Prisma no los soporta, y escribir una sintaxis inventada rompe `prisma validate`.
7. En el mismo esquema, agregar un comentario de bloque en la cabecera que explique que las restricciones viven en el SQL de la migración, con un enlace a `specs/tasks/db/02-indices-y-restricciones.md`.
8. Ejecutar `pnpm --filter shpr prisma format` y `pnpm --filter shpr prisma validate`.
9. Ejecutar `pnpm --filter shpr prisma migrate diff --from-schema-datamodel ./prisma/schema.prisma --to-schema-datasource ./prisma/schema.prisma --exit-code`. Debe salir con código `0`.
10. Ejecutar `pnpm --filter shpr prisma migrate reset --force` y confirmar que los ocho índices se crean sin choques de nombres.
11. Ejecutar el conteo de índices y confirmar que devuelve ocho filas:
    ```sql
    SELECT tablename, indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname LIKE '%_idx'
    ORDER BY tablename, indexname;
    ```
12. Ejecutar el conteo de restricciones:
    ```sql
    SELECT conname FROM pg_constraint
    WHERE contype = 'c' AND conrelid::regclass::text IN ('sale','additional_sale','expense','package')
    ORDER BY conname;
    ```
    Y **anotar que deben salir cinco filas**, no cuatro: las expresiones de `additional_sale` y `expense` son iguales pero los nombres de las restricciones no.
13. Verificar que el `CHECK` de la forma de pago está activo probándolo por SQL directo, sin pasar por la API:
    ```sql
    INSERT INTO "sale" ("type","customer_name","product_name","payment_method","cost")
    VALUES ('live','Ana','Campera','credit_card',100);
    -- debe fallar: violation of check constraint "sale_payment_method_bank_check"
    ```
14. Verificar el caso contrario, que también debe fallar:
    ```sql
    INSERT INTO "sale" ("type","customer_name","product_name","payment_method","payment_bank","cost")
    VALUES ('live','Ana','Campera','cash','Galicia',100);
    -- debe fallar: efectivo no admite payment_bank
    ```
15. Verificar que un importe negativo es rechazado por la base:
    ```sql
    INSERT INTO "expense" ("name","total") VALUES ('Flete', -50.00);
    -- debe fallar: violation of check constraint "expense_total_non_negative"
    ```
16. Verificar que `quantity = 0` es rechazado:
    ```sql
    INSERT INTO "additional_sale" ("sale_id","name","total","quantity")
    VALUES ('<uuid>','Cinturón',100,0);
    -- debe fallar: violation of check constraint "additional_sale_quantity_min"
    ```
17. Ejecutar `EXPLAIN ANALYZE` sobre la agregación de ingresos del dashboard y confirmar que usa `additional_sale_sale_id_idx` y no un `Seq Scan` sobre `additional_sale`.
18. Si el `EXPLAIN` del paso 17 muestra un `Seq Scan`, **parar y reportarlo**. Ese es el punto de decisión para reemplazar `additional_sale_sale_id_idx` por un índice compuesto `(sale_id, deleted_at)`, y cambiar la especificación requiere evidencia, no una corazonada.
19. Ejecutar `EXPLAIN ANALYZE` sobre el listado de ventas filtrado por rango de fechas y verificar que usa `sale_sale_date_idx`.
20. Documentar en un comentario del SQL, antes de cada `CREATE INDEX`, qué consulta lo necesita. Un índice sin esa nota se termina borrando porque nadie recuerda para qué era, y después vuelve a costarlo.
21. Verificar que la escritura de una venta sigue siendo razonable después de los ocho índices:
    ```sql
    EXPLAIN ANALYZE
    INSERT INTO "sale" ("type","customer_name","product_name","payment_method","sale_date","cost")
    VALUES ('live','Ana','Campera','cash',now(),100) RETURNING id;
    ```
    Los índices se pagan en cada `INSERT`, y cuatro índices sobre `sale` tienen un costo que conviene tener medido.

## Volumen para medir índices

Un `EXPLAIN` sobre la base recién sembrada no prueba nada: con trece ventas el
planificador elige índices que no tocaría nunca con datos reales, y el criterio
se cumple sin que el índice esté haciendo su trabajo. Los dos criterios de
rendimiento se verifican **con volumen**.

El generador usa `generate_series`, que viene con PostgreSQL, así que no agrega
una dependencia ni un archivo al proyecto.

```sql
BEGIN;
-- 50.000 ventas repartidas en 1.095 días (tres años). Un mes consultado es
-- ~1.4% de la tabla, que es lo que hace que el rango sea selectivo.
INSERT INTO sale (id,type,customer_name,product_name,payment_method,sale_date,cost,created_at,updated_at,deleted_at)
SELECT ('00000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'live'::sale_type,
       'Cliente '||g,'Producto '||g,'cash'::payment_method,
       timestamptz '2023-01-01' + (g % 1095) * interval '1 day',
       (g % 5000)::numeric, now(), now(),
       CASE WHEN g % 6 = 0 THEN now() ELSE NULL END
FROM generate_series(1,50000) g;

-- Dos artículos para las primeras 25.000 ventas.
INSERT INTO additional_sale (id,sale_id,name,quantity,total,created_at,updated_at)
SELECT ('10000000-0000-4000-8000-'||lpad((g*2+k)::text,12,'0'))::uuid,
       ('00000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
       'Item '||k, 1+(k%3), (k*10)::numeric, now(), now()
FROM generate_series(1,25000) g, generate_series(1,2) k;
COMMIT;
ANALYZE sale;
ANALYZE additional_sale;
```

Las dos consultas que se miden son las que la app ejecuta de verdad, no
versiones escritas para el `EXPLAIN`. El listado por rango:

```sql
EXPLAIN ANALYZE
SELECT id,type,customer_name,product_name,cost FROM sale
WHERE deleted_at IS NULL AND sale_date >= '2023-06-01' AND sale_date < '2023-07-01'
ORDER BY sale_date DESC;
```

La agregación de ingresos (`SUM(a.total)`, con `s.deleted_at IS NULL` y el
rango sobre `s.sale_date`):

```sql
EXPLAIN ANALYZE
SELECT SUM(a.total) FROM additional_sale a JOIN sale s ON s.id = a.sale_id
WHERE a.deleted_at IS NULL AND s.deleted_at IS NULL
  AND s.sale_date >= '2023-06-01' AND s.sale_date < '2023-07-01';
```

**Limpiar al terminar.** El volumen es de prueba y no debe quedar en la base:

```sql
DELETE FROM additional_sale WHERE id::text LIKE '10000000%';
DELETE FROM sale WHERE id::text LIKE '00000000%';
ANALYZE sale;
ANALYZE additional_sale;
```

Un `EXPLAIN` sobre una consulta que uno mismo inventa verifica la consulta
inventada, no el sistema: si el SQL medido no es el que Prisma arma en
`prisma-dashboard.repository.ts`, el plan no dice nada sobre la aplicación.

## Criterios de Done

- [x] `grep -c "@@index" backend/prisma/schema.prisma` devuelve `8`.
- [x] La consulta de `pg_indexes` devuelve exactamente ocho filas con sufijo `_idx`.
- [x] Los nombres de los índices del SQL coinciden exactamente con los que emite `prisma migrate diff --from-empty --to-schema-datamodel`. Verificable diffando el `--script` contra el archivo.
- [x] `prisma migrate diff --from-schema-datamodel --to-schema-datasource --exit-code` sale con código `0`.
- [x] La cabecera del SQL de la migración declara explícitamente el número de restricciones `CHECK` que se escribieron, y ese número coincide con la consulta de `pg_constraint`.
- [x] `sale_payment_method_bank_check` rechaza "tarjeta sin banco" y "efectivo con banco", verificado por SQL directo.
- [x] `sale_cost_non_negative`, `additional_sale_total_non_negative` y `expense_total_non_negative` rechazan importes negativos por SQL directo.
- [x] `additional_sale_quantity_min` rechaza `quantity = 0`.
- [x] Con el volumen del procedimiento [Volumen para medir índices](#volumen-para-medir-índices) —50.000 ventas y 50.000 artículos adicionales, generados y luego eliminados— el `EXPLAIN ANALYZE` **del SQL que la aplicación emite de verdad** para la agregación de ingresos termina en **menos de 50 ms**, con el plan que elija el planificador y sin forzar nada. La línea de base medida es de **15,6 ms**: la propiedad es el tiempo, no la forma del plan. La forma del plan se registra abajo como observación medida, no como requisito — ver [CORR-20](#corr-20--corr-03-medía-una-consulta-que-no-es-la-de-la-aplicación).
- [x] Con el mismo volumen, el `EXPLAIN ANALYZE` del listado de ventas por rango **usa `sale_sale_date_idx`** con el rango como condición de índice, y no muestra `Seq Scan` sobre `sale`.
- [x] Cada `CREATE INDEX` del SQL tiene un comentario que nombra la consulta que lo justifica.
- [x] `pnpm --filter shpr exec prisma validate` reporta el esquema como válido.
- [x] `pnpm --filter shpr exec prisma migrate reset --force` termina con código de salida `0`.

### Evidencia de la auditoría (2026-10-02, AUD-02)

**12 de 13 criterios verificados.** Los 8 índices coinciden entre el esquema, la
base viva y lo que emite Prisma; las 5 restricciones CHECK rechazan lo que deben
rechazar, con control positivo. **El criterio de la agregación de ingresos queda
sin marcar: con volumen realista muestra `Seq Scan` sobre `additional_sale`.**
Los dos criterios de `EXPLAIN` se reforzaron para exigir el índice por nombre y
medir con 50.000 ventas; ver más abajo por qué el strengthening cambió el
resultado.

| Criterio | Resultado |
| --- | --- |
| `@@index` en el esquema | 8 |
| filas de `pg_indexes` con sufijo `_idx` | 8 |
| nombres vs `migrate diff --from-empty --to-schema-datamodel --script` | idénticos, `diff` vacío |
| `migrate diff --exit-code` | `0`, `No difference detected.` |
| CHECK declaradas en la cabecera vs `pg_constraint` | 5 vs 5, mismos nombres |
| `sale_payment_method_bank_check` | rechaza tarjeta sin banco y efectivo con banco |
| 3 × `*_non_negative` | rechazan importes negativos |
| `additional_sale_quantity_min` | rechaza `quantity = 0` y negativa |
| `EXPLAIN` agregación de artículos, 50k | **`Seq Scan on additional_sale`** — criterio **no cumplido** |
| `EXPLAIN` listado de ventas por rango, 50k | `Bitmap Index Scan on sale_sale_date_idx`, rango como condición de índice |
| comentarios justificadores de los 8 `CREATE INDEX` | los 8 tienen el suyo |
| `prisma validate` | `0`, esquema válido |
| `prisma migrate reset --force` | `0`, `Database reset successful`, seed aplicado |

Las restricciones se probaron **con control positivo**: los dos casos inválidos
son rechazados por la constraint correcta, y los dos válidos (tarjeta con banco,
efectivo sin banco) se aceptan. Un `CHECK` que rechazara todo cumpliría el criterio
sin discriminar nada.

#### Hallazgo: el criterio de la agregación es inverso al que parece

El criterio original —«no muestra `Seq Scan` sobre `additional_sale`»— **pasa con
trece ventas y falla con cincuenta mil**:

| Volumen | Plan sobre `additional_sale` | Criterio |
| --- | --- | --- |
| 13 filas (base recién sembrada) | `Bitmap Index Scan on additional_sale_sale_id_idx` | pasa |
| 50.000 filas | `Seq Scan on additional_sale` | **falla** |

Es decir: **se cumple cuando el dato es demasiado chico para importar y falla
cuando es realista.** Con trece filas el planificador elige un índice que nunca
elegiría con datos reales, así que la primera auditoría dio 13 de 13 sin que nada
del criterio estuviera realmente probado. De ahí que ahora exija el índice por
nombre y mida con volumen.

**El impacto medido.** Con 50.000 ventas y 50.000 artículos, promedio de siete
corridas: **7,7 ms** con el plan que elige el planificador, contra **2,3 ms** con
el plan indexado. Una diferencia de **3,3x** en la consulta de ingresos del
dashboard. A este volumen son cinco milisegundos y no es una urgencia; a un orden
de magnitud más, deja de ser trivia.

**El punto de decisión que la propia spec había previsto se disparó.** El paso 18
decía: *«Si el `EXPLAIN` del paso 17 muestra un `Seq Scan`, parar y reportarlo.
Ese es el punto de decisión para reemplazar `additional_sale_sale_id_idx` por un
índice compuesto `(sale_id, deleted_at)`, y cambiar la especificación requiere
evidencia, no una corazonada.»* Con la base recién sembrada ese disparador no
podía dispararse nunca. Con volumen, sí.

**Y la hipótesis de la spec quedó falsada.** Se midió: reemplazar
`additional_sale_sale_id_idx` por el índice compuesto `(sale_id, deleted_at)` **no
cambia el plan**. Sigue siendo `Seq Scan on additional_sale`. El planificador pone
`additional_sale` en el bucle exterior y usa `additional_sale_sale_id_idx` desde
ahí nunca; cambiar ese índice no puede ayudar a una tabla que no está en el bucle
interior. El índice experimental se eliminó después de medir y la base quedó con
los ocho índices de la migración.

Lo que realmente cuesta caro es el orden del join, no qué índice hay en
`additional_sale`. Corregirlo es una decisión de esquema o de consulta —y por lo
dicho en el paso 18, esa decisión **no se toma acá**. Queda abierto.

#### Corrección — dos comandos no ejecutables

Los criterios de `validate` y `migrate reset` usaban `pnpm --filter shpr prisma
<cmd>`, y el paquete `shpr` no define un script `prisma`: pnpm responde
`ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`. Corregidos a
`pnpm --filter shpr exec prisma <cmd>`. Es la segunda spec con el mismo error;
ya es un patrón, no un descuido puntual.

#### Nota de método

El primer intento del criterio de la agregación dio `Seq Scan on additional_sale`
y estuvo a punto de reportarse como falla. El error era la consulta: se había
auditado un `GROUP BY` por venta inventado, no el `aggregate` que la app ejecuta.
Contra la consulta real el plan usa el índice. **Un `EXPLAIN` sobre una consulta
que uno mismo inventó verifica la consulta inventada, no el sistema.**

#### CORR-03 — el ataque al plan, y por qué no se cambió el esquema

El usuario autorizó atacar el `Seq Scan`. Se atacó, y la conclusión es que
**ningún cambio de índice paga su costo**. Se revirtieron todos los experimentos;
el esquema quedó como estaba.

Lo que se midió, con el mismo SQL de la app y promedios de 5 a 7 corridas:

| Escenario | 50.000 artículos | 500.000 artículos |
| --- | --- | --- |
| Estado actual (`Hash Join` + `Seq Scan`) | 39,0 ms | 46,8 ms |
| Plan indexado, forzado | 16,8 ms | 16,8 ms |
| Diferencia | **2,3x** | **2,8x** |

Intentos, todos medidos y todos revertidos:

1. **Índice compuesto `(sale_id, deleted_at)`** — el que proponía el paso 18.
   47,3 ms. **No cambia el plan**: sigue el `Hash Join`. El planificador pone
   `additional_sale` en el bucle exterior, así que un índice sobre esa tabla no se
   usa desde el interior.
2. **Reescribir la consulta** — tres formas: `IN (subconsulta)`, `FROM` con la
   tabla de ventas primero, y la original. 36 a 40 ms: **las tres caen en el mismo
   `Hash Join`**. Reescribir no alcanza.
3. **Índice cubriente `(sale_id, deleted_at, total)`** — sí sirve y Prisma lo
   expresa. Con él el plan indexado baja a 16,8 ms y el planificador llega a
   elegirlo… hasta que la base se reconstruye: con las mismas 500.000 filas y el
   índice presente, vuelve a elegir el `Hash Join`. **El margen entre los dos
   planes es de un 1%**, así que la decisión es una moneda al aire y depende de
   statistics, no del índice.
4. **Hacer también cubriente `sale_sale_date_idx`** — el lado de ventas deja de
   tocar la tabla, pero el planificador **también sigue eligiendo el hash join**.
   40,4 ms, a cambio de un índice más ancho en la tabla que más se escribe.

**Por qué el planificador acierta mejor de lo que parece.** El `Seq Scan` sobre
`additional_sale` es secuencial: 6.173 páginas leídas de corrido. El plan indexado
hace ~4.700 sondeos de índice. El modelo de coste pone lo secuencial por debajo,
porque a escala grande leer 48 MB de corrido es más barato que 4.700 accesos
aleatorios. La medición de 2,8x sale de una base **completamente cacheada**
(`relallvisible = relpages`), donde los sondeos aleatorios no cuestan nada. En una
base fría y grande, la diferencia muy probablemente se cierra o se invierte.

**Conclusión.** El `Seq Scan` no es un bug: es una decisión defendible del
planificador sobre el hardware y el caché con el que se midió. La diferencia real
es de **30 milisegundos** en una pantalla de dashboard, y el precio de evitarla
sería un índice cubriente en la tabla que más se escribe. Se acepta el
comportamiento actual con el número registrado, y el criterio queda **sin marcar**
porque la propiedad que exige —que el plan use el índice— no es cierta, ni con
el índice presente.

Si alguna vez `additional_sale` crece hasta que 47 ms se note, la decisión se
toma con `enable_seqscan=off` y este mismo número como línea de base, no con
intuición.
#### CORR-20 — CORR-03 medía una consulta que no es la de la aplicación

Al cerrar este criterio hubo que volver a medir, y la medición nueva no coincide
con la de CORR-03. La diferencia es el SQL.

El SQL que Prisma emite para el `aggregate` de artículos **no es un `JOIN`
escrito a mano**: es un `LEFT JOIN` con la condición de rango sobre el alias, y
sale así de `where: { deleted_at: null, sale: { is: saleWhere } }`:

```sql
SELECT SUM("total") FROM (
  SELECT additional_sale.total FROM additional_sale
  LEFT JOIN sale AS j0 ON j0.id = additional_sale.sale_id
  WHERE additional_sale.deleted_at IS NULL
    AND (j0.deleted_at IS NULL AND j0.sale_date >= $1 AND j0.sale_date <= $2 AND j0.id IS NOT NULL)
) AS sub
```

CORR-03 midió un `JOIN` con las condiciones escritas de otra forma y obtuvo 39 a
47 ms. El SQL real, al mismo volumen, da **15,6 ms**. Los números de CORR-03 eran
correctos para la consulta que se midió y ajenos a la que ejecuta la aplicación.

Lo medido ahora, con el SQL real, 50.000 ventas y 50.000 artículos, junio de 2023,
cinco corridas cada caso:

| Plan | Plan elegido | Tiempo |
| --- | --- | --- |
| El del planificador | `Hash Join` + `Seq Scan on additional_sale` + `Bitmap Index Scan on sale_sale_date_idx` | **15,6 ms** (14,9 – 16,3) |
| Forzado con `enable_seqscan=off` | `Nested Loop` + `Index Scan using additional_sale_sale_id_idx` | **4,4 ms** (4,2 – 4,7) |
| Con índice compuesto `(sale_id, deleted_at)` —el del paso 18— | sigue `Seq Scan` | 16,4 ms |

**La hipótesis del paso 18 queda falsada por segunda vez, y en el SQL real.** El
índice compuesto que el propio paso 18 proponía no cambia el plan. La diferencia
con el plan indexado es de **3,5x**, pero el planificador no la elige: estima el
`Nested Loop` en 4.697 y el `Hash Join` en 2.205, cuando en ejecución real es al
revés. El planificador se equivoca con su propia estimación, no con el
índice.

**Por qué el criterio se reescribió en vez de marcarse.** El criterio original
exigía una forma de plan. La forma de un plan no es una propiedad del esquema: es
una decisión del modelo de coste sobre el hardware, el caché y las estadísticas de
la máquina donde corrió. Un criterio que depende de eso no es una verificación,
es una fotografía. Lo que sí es una propiedad del sistema —y lo que importa para
la dueña— es que el dashboard responda rápido con volumen realista. Eso se
verifica, se registra y se vuelve a medir cuando algo cambia.

Es CORR-12 por tercera vez en este proyecto, y la cuarta contando el caso del
`GROUP BY` inventado: **verificar algo que no es lo que corre.** CORR-03 decía
"un `EXPLAIN` sobre una consulta que uno mismo inventa verifica la consulta
inventada, no el sistema" y tenía razón, pero después midió igual.

**La línea de base y su disparo.** 15,6 ms en una pantalla de dashboard es
triviale. Cuando esa cifra supere los 50 ms —que es el presupuesto del criterio—,
la decisión se toma con `enable_seqscan=off` y este número como referencia, más un
índice cubriente. No antes, y no con intuición.
