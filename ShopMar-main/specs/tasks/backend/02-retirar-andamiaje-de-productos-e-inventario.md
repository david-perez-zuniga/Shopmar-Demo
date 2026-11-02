# 02 — Retirar el andamiaje de productos e inventario

## Estado Actual

El andamiaje de `fwinit` trae un catálogo de productos, un catálogo de servicios y un control de movimientos de inventario. Los tres responden a un comercio con mercadería repetible: códigos de barras, precios de lista, stock y umbral de stock bajo.

Una tienda de ropa de segunda mano es lo contrario. Cada prenda es única, se compra usada a un precio distinto y se vende a un precio distinto, y en general no hay código de barras. La dueña ya sabe qué está vendiendo en el momento de la venta, y un catálogo obligaría a dar de alta cada prenda antes de venderla.

Archivos que existen hoy y hay que eliminar:

```
backend/src/modules/product/
├── domain/{product.entities.ts, product.repository.port.ts, product.errors.ts, product.schemas.ts, product.types.ts}
├── application/product.service.ts
├── infrastructure/prisma-product.repository.ts
├── presentation/{product.controller.ts, product.dto.ts, product.mappers.ts, product.routes.ts, product.schemas.ts}
└── _tests_/{product.service.test.ts, product.mappers.test.ts}

backend/src/modules/service/
├── domain/{service.entities.ts, service.repository.port.ts, service.errors.ts, service.types.ts}
├── application/service.service.ts
├── infrastructure/prisma-service.repository.ts
├── presentation/{service.controller.ts, service.dto.ts, service.mappers.ts, service.routes.ts}
└── _tests_/{service.service.test.ts, service.mappers.test.ts}

backend/src/modules/inventory/            (o movements/, según la estructura real)
├── domain/{movement.entities.ts, movement.repository.port.ts, movement.types.ts}
├── application/movement.service.ts
├── infrastructure/prisma-movement.repository.ts
└── presentation/movement.*

backend/prisma/schema.prisma      model product, model service, model inventory_movement, model ProductStatus, model ServiceType, model MovementType
backend/prisma/migrations/20260910013256_init/migration.sql   las tres tablas, sus índices y sus tipos
backend/src/tests/fakes.ts        makeProduct, makeService, makeMovement
backend/src/scripts/seed.ts       los registros de demostración de productos y servicios
```

## Objetivo

Dejar el backend con cero tablas de catálogo, cero control de stock y cero endpoints de producto, para que la mercadería se registre como texto libre en la venta.

## Alcance

- Eliminar el directorio `backend/src/modules/product/` completo.
- Eliminar el directorio `backend/src/modules/service/` completo.
- Eliminar el directorio del módulo de movimientos de inventario completo.
- Quitar el registro de las tres rutas en `backend/src/app.ts`.
- Quitar `makeProduct`, `makeService` y `makeMovement` de `backend/src/tests/fakes.ts`.
- Eliminar los registros de demostración de `backend/src/scripts/seed.ts`.
- Eliminar `model product`, `model service` y `model inventory_movement` del esquema, con sus tres enums.
- Eliminar las tres tablas, sus índices y sus tipos del SQL de la migración.

**Archivos tocados:** `backend/src/modules/product/**`, `backend/src/modules/service/**`, `backend/src/modules/inventory/**`, `backend/src/app.ts`, `backend/src/tests/fakes.ts`, `backend/src/scripts/seed.ts`, `backend/prisma/schema.prisma`, el SQL de la migración.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| Crear el campo `product_name` en `sale` | Eso es `tasks/db/01-migracion-al-modelo-de-dominio.md`. Esta tarea borra, la otra construye. |
| Crear `additional_sale.name` y `additional_sale.description` | Lo mismo: `tasks/db/01`. |
| Agregar una tabla de nombres usados para autocompletado | Es la alternativa más razonable a un catálogo si algún día el volumen lo justifica, y está descartada para la versión 1 en la decisión D-002. La reconsideración es un cambio de decisión, no una omisión. |
| Quitar `@fastify/cors` por "seguridad" | CORS no tiene relación con el catálogo. Es `tasks/backend/07-capas-vista-modales-y-filtros-globales.md`. |
| Eliminar la autenticación | Es `tasks/backend/01-retirar-andamiaje-de-autenticacion-y-usuarios.md`. |
| Reemplazar el `seed.ts` por datos de shpr | El script de semillas es una herramienta de desarrollo. Su contenido final es parte de `tasks/db/04-verificacion-de-integridad.md`. |

## Tareas

1. Eliminar `backend/src/modules/product/` completo, con su carpeta `_tests_`.
2. Eliminar `backend/src/modules/service/` completo, con su carpeta `_tests_`.
3. Eliminar el directorio del módulo de movimientos de inventario completo.
4. En `backend/src/app.ts`, quitar el `register` de `productRoutes`, `serviceRoutes` y el del módulo de movimientos, y quitar sus importaciones.
5. En `backend/src/tests/fakes.ts`, eliminar `makeProduct`, `makeService` y `makeMovement`. Revisar que ningún archivo de prueba restante los importe.
6. En `backend/src/scripts/seed.ts`, eliminar los bloques que crean productos, servicios y movimientos. Si el archivo queda vacío, eliminarlo; si queda con contenido de otro dominio, conservarlo.
7. En `backend/prisma/schema.prisma`, eliminar `model product`, `model service` y `model inventory_movement`, y los enums `ProductStatus`, `ServiceType` y `MovementType`.
8. En el SQL de la migración, eliminar los tres `CREATE TABLE`, sus `CREATE INDEX` y `UNIQUE INDEX`, y los tres `CREATE TYPE`. **Esta tarea va antes de `tasks/db/01`, que reescribe el archivo completo.**
9. Verificar que no queda ninguna referencia: `grep -ri "product\|service\|inventory\|stock\|movement" backend/src/` no debe devolver resultados fuera de los archivos de negocio del dominio nuevo.
10. Ejecutar `pnpm --filter shpr build` y confirmar que compila.
11. Ejecutar `pnpm --filter shpr test` y confirmar que las pruebas restantes pasan.

## Criterios de Done

- [x] `backend/src/modules/product/` no existe.
- [x] `backend/src/modules/service/` no existe.
- [x] El directorio del módulo de movimientos no existe.
- [x] `grep -c "productRoutes\|serviceRoutes" backend/src/app.ts` devuelve `0`.
- [x] `grep -c "model product\|model service\|model inventory_movement" backend/prisma/schema.prisma` devuelve `0`.
- [x] `grep -c "CREATE TABLE.*product\|CREATE TABLE.*service\|CREATE TABLE.*inventory" backend/prisma/migrations/20260910013256_init/migration.sql` devuelve `0`.
- [x] `grep -c "makeProduct\|makeService\|makeMovement" backend/src/tests/fakes.ts` devuelve `0`.
- [x] `pnpm --filter shpr build` termina con código de salida `0`.
- [x] `pnpm --filter shpr test` pasa el 100% de las pruebas que queden.
- [x] El esquema tiene exactamente cuatro modelos al terminar las tareas 01 y 02: `sale`, `additional_sale`, `package` y `expense`. Ese conteo se verifica en `tasks/db/04-verificacion-de-integridad.md`.

### Evidencia — AUD-06 (`backend/02`)

Spec sin hallazgos. Los diez criterios verificados:

| Criterio | Resultado |
| --- | --- |
| 82-84: no existen `product/`, `service/`, ni el módulo de movimientos | los cinco nombres posibles ausentes; los módulos reales son `dashboard`, `expenses`, `packages`, `sales` |
| 85: `productRoutes\|serviceRoutes` en `app.ts` | **0** |
| 86: `model product\|service\|inventory_movement` en el esquema | **0** — quedan exactamente 4: `sale`, `additional_sale`, `package_record`, `expense` |
| 87: `CREATE TABLE.*product\|service\|inventory` en la migración | **0** — solo se crean las cuatro del dominio |
| 88: `makeProduct\|makeService\|makeMovement` en `fakes.ts` | **0** |
| 89: `build` sale con 0 | ✓ |
| 90: `test` al 100% | 123/123 |
| 91: exactamente cuatro modelos | ✓, y confirmado contra el catálogo en AUD-04 |

#### Un `inventory_movement` que sí queda, y por qué se deja

Al buscar restos de inventario en todo el repo aparece **uno**:

```sql
-- Reemplaza el andamiaje (role, user, session, product, service,
-- inventory_movement) por las cuatro tablas del dominio.
```

Es la cabecera de la migración, y **está bien que siga ahí**: dice qué reemplaza
el archivo y por qué existe. Ninguno de los criterios lo alcanza —el 86 grepea
`schema.prisma` y el 87 grepea `CREATE TABLE`— así que la spec pasa igual.

Se deja una nota porque la tentación en la próxima pasada va a ser "limpiar ese
resto", y sería un error: es el único lugar del repositorio que registra que el
andamiaje se retiró y en favor de qué. Borrarlo dejaría la migración sin
explicar su propósito.

Contraste con el `set -x` de `db/03`, donde sí se reescribió el criterio: allá la
exigencia literal —"el archivo no contiene la cadena"— era incumplible sin
destruir documentación. Acá no hay conflicto: ningún criterio exige la ausencia en
comentarios, y el comentario vale más que la uniformidad.

`backend/02` queda **10/10**.
