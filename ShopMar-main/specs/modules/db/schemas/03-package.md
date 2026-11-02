# `package` — Paquete retirado

## Propósito

Registra un envío preparado para un cliente. Es un registro **independiente** del negocio: puede existir sin ninguna relación con una venta, y el enlace a su venta de origen es opcional.

La tabla existe porque la dueña necesita llevar control de lo que salió del local y por qué medio, con frecuencia independiente de la venta. Un paquete puede registrarse mucho después de que la venta se borrara lógicamente, o puede no tener venta porque la prenda se regaló o se entregó sin venta registrada.

## Tabla

| Columna | Tipo Prisma | Tipo SQL | Nulo | Por defecto | Notas |
|---------|-------------|----------|------|-------------|-------|
| `id` | `String @id @default(uuid()) @db.Uuid` | `UUID` | No | `uuid()` | Clave primaria. |
| `name` | `String` | `TEXT` | No | — | Nombre del paquete o del transportista. Texto libre. Cota de 200 caracteres en Zod. |
| `package_date` | `DateTime @db.Timestamptz(3)` | `TIMESTAMP(3) WITH TIME ZONE` | No | — | Fecha de salida. Por defecto el instante actual si no se envía. |
| `method` | `package_method` | `package_method` | No | — | Enum. `cargotrans`, `delivery` o `retiro`. |
| `sale_id` | `String? @db.Uuid` | `UUID` | **Sí** | `NULL` | Venta que originó el paquete. Enlace **opcional**. |
| `created_at` | `DateTime @default(now())` | `TIMESTAMP(3)` | No | `CURRENT_TIMESTAMP` | Auditoría. |
| `updated_at` | `DateTime @updatedAt` | `TIMESTAMP(3)` | No | — | Auditoría. |
| `deleted_at` | `DateTime?` | `TIMESTAMP(3)` | **Sí** | `NULL` | Borrado lógico (decisión D-004). |

**No hay columna `status`.** El modelo no distingue entre paquete pendiente y paquete entregado. El indicador del dashboard lo define como "registrado y no borrado lógicamente". Ver la decisión D-007, que además explica qué se agregaría en la versión 2.

## Relaciones

### Puede pertenecer a una venta

```prisma
sale sale? @relation(fields: [sale_id], references: [id], onDelete: SetNull)
```

Relación muchos a uno **opcional**. `sale_id` es `NULL` cuando el paquete no tiene venta de origen.

`onDelete: SetNull` es la elección correcta para un enlace opcional, y su efecto es preciso: si la fila de `sale` desapareciera, el paquete **no** se borraría y su `sale_id` quedaría en `NULL`. El envío es un hecho físico; la venta es un registro contable. Perder el segundo no puede eliminar el primero.

Como el sistema solo borra lógicamente (decisión D-004), esta cláusula **no se activa en la operación normal**: no hay eliminación física de ventas. El efecto observable de la decisión D-004 es que un paquete enlazado a una venta cancelada sigue enlazado a ella, y que `GET /api/v1/sales/:id` deja de devolverlo porque la relación anidada filtra `deleted_at: null`.

### No tiene relaciones propias

`package` no tiene `additional_items` ni `sale_items`. Un paquete se asocia a la venta completa, nunca a un renglón concreto.

## Índices

| Índice | Columnas | Por qué |
|--------|----------|---------|
| `package_package_date_idx` | `package_date` | Filtro y orden por defecto de `GET /api/v1/packages` y de la agregación `pending_packages_count` del dashboard. |
| `package_sale_id_idx` | `sale_id` | **Obligatorio.** `sale_id` es opcional y la mayoría de los paquetes lo tienen en `NULL`. Un índice sobre una columna que en la mayoría de las filas vale `NULL` sigue siendo útil: permite encontrar rápido los paquetes que **sí** tienen venta, que es exactamente la carga anidada de `GET /api/v1/sales/:id`. |
| `package_deleted_at_idx` | *(no declarado)* | A diferencia de `sale`, esta tabla **no declara índice sobre `deleted_at`**. Se filtra en toda consulta, pero el volumen de la tabla es el más bajo de las cuatro y la decisión de no declararlo se deja abierta: agregarlo es una línea en el esquema y una migración trivial. Si el listado de paquetes empieza a mostrar lentitud, ese es el primer candidato. |

Declaración en Prisma:

```prisma
@@index([package_date])
@@index([sale_id])
```

## Notas

### El listado no trae el nombre de la venta

`GET /api/v1/packages` devuelve el `sale_id` y nada más del vínculo. Incorporar el `customer_name` de la venta exigiría un `include` anidado que no aporta a la tabla del panel, que muestra el identificador corto de la venta como enlace. `GET /api/v1/sales/:id` sí devuelve los datos completos de los paquetes vinculados (`id`, `name`, `package_date`, `method`).

### Desvincular es una operación válida

`PUT /api/v1/packages/:id` acepta `sale_id: null`. El envío del paquete a la venta es un error de tipeo frecuente, y corregirlo no debería exigir intervención técnica. El método `update` del repositorio escribe el `null` tal cual; la clave foránea lo permite porque la columna es opcional.

### La fecha es un dato del envío, no un filtro de estado

`package_date` registra cuándo salió el paquete. No indica si sigue en la calle ni cuándo se entregó. Esa información no existe en el modelo, y el indicador del dashboard lo compensa con una aproximación que está documentada de forma explícita en D-007 y en el texto de apoyo de la tarjeta del panel.

### El nombre no está normalizado

`name` es texto libre y no tiene índice. Dos paquetes escritos como "Cargotrans Juan" y "cargotrans juan" son dos registros distintos. Es coherente con la decisión D-002: el sistema no mantiene un catálogo de transportistas ni de prendas.
