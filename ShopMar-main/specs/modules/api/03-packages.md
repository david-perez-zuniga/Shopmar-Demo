# Paquetes — cuatro endpoints

Alta, listado, reemplazo completo y borrado lógico de envíos.

## Índice

| Método | Ruta | Qué hace |
|--------|------|----------|
| `POST` | `/api/v1/packages` | Registra un paquete. |
| `GET` | `/api/v1/packages` | Lista los paquetes. |
| `PUT` | `/api/v1/packages/:id` | Reemplaza el contenido del paquete. |
| `DELETE` | `/api/v1/packages/:id` | Borra lógicamente el paquete. |

Un paquete es un registro **independiente**: puede existir sin ninguna venta, y el enlace a su venta de origen es opcional. Esa independencia es la razón por la que tiene su propio recurso y no es un endpoint de ventas.

---

## `POST /api/v1/packages`

### Cuerpo

```json
{
  "name": "Cargotrans Juan Pérez",
  "package_date": "2026-09-28T18:10:00.000Z",
  "method": "cargotrans",
  "sale_id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25"
}
```

| Campo | Tipo | Requerido | Regla |
|-------|------|-----------|-------|
| `name` | Cadena | **Sí** | De 1 a 200 caracteres. Texto libre, sin normalización. |
| `package_date` | Fecha ISO 8601 | No | Por defecto el instante actual. Es la fecha de salida del paquete. |
| `method` | Enum | **Sí** | `"cargotrans"`, `"delivery"` o `"retiro"` |
| `sale_id` | Cadena o `null` | No | UUID de la venta de origen. `null` o ausente para un paquete sin venta. |

Cualquier otra clave produce `400`. El esquema es estricto.

### Respuesta `201`

```json
{
  "id": "5c8e1a37-9b42-4d60-8e75-2a0c6f3b91d4",
  "name": "Cargotrans Juan Pérez",
  "package_date": "2026-09-28T18:10:00.000Z",
  "method": "cargotrans",
  "sale_id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
  "created_at": "2026-09-28T18:10:01.007Z",
  "updated_at": "2026-09-28T18:10:01.007Z"
}
```

La respuesta incluye `sale_id` con el valor enviado, incluido el `null`. Un cliente que necesita saber si el enlace quedó puesto lo obtiene de la respuesta, sin una segunda lectura.

### Sin venta asociada

```json
{
  "name": "Regalo para la vecina",
  "package_date": "2026-09-28T18:10:00.000Z",
  "method": "retiro",
  "sale_id": null
}
```

Un paquete sin venta es un caso válido, no un dato faltante. La prenda se regaló, o se entregó sin venta registrada, y en ambos casos el envío existe y hay que contarlo.

### Errores

| Situación | `message` |
|-----------|-----------|
| `name` vacío o de más de 200 caracteres | `"name: <mensaje de Zod sobre la longitud>"` |
| `method` fuera del enum | `"method: <mensaje de Zod>"` |
| `sale_id` no es un UUID | `"sale_id: <mensaje de Zod>"` |
| `package_date` no parsea | `"package_date: <mensaje de Zod>"` |
| `sale_id` apunta a una venta inexistente | `"Sale not found"` |
| Clave desconocida | `"value: Unrecognized key(s) in object: '<clave>'"` |

El `sale_id` inexistente produce `400` y no `404`: es un error de validación del cuerpo, no una falla al leer un recurso. El mensaje usa el nombre del recurso, no el de la tabla.

Un `sale_id` que apunta a una venta **cancelada** es válido. La venta existe como fila; que esté `cancelled` es un estado de negocio, no una ausencia.

No hay `409`: `package` no tiene restricciones de unicidad.

---

## `GET /api/v1/packages`

Lista los paquetes. Devuelve el conjunto completo, sin paginación.

### Parámetros de query

Todos opcionales e independientes.

| Parámetro | Tipo | Efecto |
|-----------|------|--------|
| `start_date` | Fecha ISO 8601 | Límite inferior inclusivo sobre `package_date`, a las `00:00:00.000` UTC |
| `end_date` | Fecha ISO 8601 | Límite superior inclusivo sobre `package_date`, hasta las `23:59:59.999` UTC |
| `method` | Enum | `"cargotrans"`, `"delivery"` o `"retiro"` |

El orden es `package_date` descendente, con `id` descendente como segundo criterio.

Los paquetes borrados lógicamente **no aparecen nunca**.

### Respuesta `200`

```json
{
  "packages": [
    {
      "id": "5c8e1a37-9b42-4d60-8e75-2a0c6f3b91d4",
      "name": "Cargotrans Juan Pérez",
      "package_date": "2026-09-28T18:10:00.000Z",
      "method": "cargotrans",
      "sale_id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
      "created_at": "2026-09-28T18:10:01.007Z",
      "updated_at": "2026-09-28T18:10:01.007Z"
    },
    {
      "id": "7a1b4c09-3d68-4e52-8f14-6b90c2e5d371",
      "name": "Delivery turno tarde",
      "package_date": "2026-09-27T16:20:00.000Z",
      "method": "delivery",
      "sale_id": null,
      "created_at": "2026-09-27T16:20:04.551Z",
      "updated_at": "2026-09-27T16:20:04.551Z"
    }
  ]
}
```

### Qué devuelve y qué no

| Campo | ¿Viene? | Razón |
|-------|---------|-------|
| `id` · `name` · `package_date` · `method` · `sale_id` | Sí | Son las columnas de la tabla del panel |
| `created_at` · `updated_at` | Sí | El panel no los muestra, pero viajan para que un cliente pueda auditar |
| `sale_name` o `customer_name` de la venta | **No** | Incorporarlo exigiría una carga anidada de la relación. El panel muestra el `sale_id` corto como enlace. |
| `deleted_at` | **No** | Nunca se expone. |
| Un estado de entrega | **No** | **El modelo no tiene estado de paquete.** No hay columna y no hay forma de saber si un paquete fue entregado o sigue en la calle. Ver la decisión D-007. |

La segunda fila de la respuesta tiene `sale_id: null`. Un cliente que asuma que `sale_id` siempre viene debe manejar el `null` explícitamente.

### Errores

| Situación | `message` |
|-----------|-----------|
| `start_date` no parsea | `"start_date: <mensaje de Zod>"` |
| `end_date` no parsea | `"end_date: <mensaje de Zod>"` |
| `method` fuera del enum | `"method: <mensaje de Zod>"` |
| Parámetro desconocido | `"value: Unrecognized key(s) in object: '<clave>'"` |

Un rango sin resultados devuelve `200` con `{"packages": []}`.

---

## `PUT /api/v1/packages/:id`

Reemplaza el contenido completo del paquete.

### Parámetro de ruta

| Parámetro | Tipo | Regla |
|-----------|------|-------|
| `id` | Cadena | UUID. Un valor que no sea UUID produce `400`, no `404`. |

### Cuerpo

```json
{
  "name": "Cargotrans Juan Pérez",
  "package_date": "2026-09-28T18:10:00.000Z",
  "method": "cargotrans",
  "sale_id": null
}
```

| Campo | Tipo | Requerido | Regla |
|-------|------|-----------|-------|
| `name` | Cadena | **Sí** | De 1 a 200 caracteres. |
| `package_date` | Fecha ISO 8601 | No | Por defecto el instante actual si se omite. |
| `method` | Enum | **Sí** | `"cargotrans"`, `"delivery"` o `"retiro"` |
| `sale_id` | Cadena o `null` | No | UUID de la venta. `null` desvincula. |

**Todos los campos son obligatorios salvo `sale_id`.** El método es un reemplazo completo, no un parche: un `PUT` con un solo campo produce `400` con la lista de campos faltantes.

La razón de `PUT` y no `PATCH` es que el caso real de corrección —un paquete vinculado a la venta equivocada— se resuelve enviando `sale_id: null` o el identificador correcto dentro de un cuerpo completo. Un `PATCH` tendría que distinguir "no enviado" de "enviado como `null`", que es exactamente la ambigüedad que `sale_id: nullish()` ya resuelve en el esquema.

### Respuesta `200`

```json
{
  "id": "5c8e1a37-9b42-4d60-8e75-2a0c6f3b91d4",
  "name": "Cargotrans Juan Pérez",
  "package_date": "2026-09-28T18:10:00.000Z",
  "method": "cargotrans",
  "sale_id": null,
  "created_at": "2026-09-28T18:10:01.007Z",
  "updated_at": "2026-09-29T10:22:41.663Z"
}
```

`created_at` es **inmutable**: sigue siendo el de la alta. `updated_at` cambia. Un cliente que compare los dos sabe que el registro fue editado sin consultar el historial, que el sistema no tiene.

### Desvincular es una operación válida

Enviar `sale_id: null` **desvincula** el paquete de su venta, y es intencional. El enlace de un paquete a una venta se equivoca seguido, y corregirlo no debería exigir intervención técnica.

```json
{
  "name": "Cargotrans Juan Pérez",
  "package_date": "2026-09-28T18:10:00.000Z",
  "method": "cargotrans",
  "sale_id": null
}
```

Después de esta llamada, el paquete sigue en `GET /api/v1/packages` con `sale_id: null`, y **deja de aparecer** en el campo `packages` de `GET /api/v1/sales/:id` de la venta a la que estaba vinculado. Es el efecto observable de la desvinculación.

### Errores

| Situación | Código | `message` |
|-----------|--------|-----------|
| `id` no es un UUID | `BAD_REQUEST` | `"id: Package id must be a valid UUID"` |
| Faltan campos obligatorios | `BAD_REQUEST` | `"<campo>: <mensaje de Zod sobre la ausencia>"` |
| `method` fuera del enum | `BAD_REQUEST` | `"method: <mensaje de Zod>"` |
| `sale_id` no es un UUID | `BAD_REQUEST` | `"sale_id: <mensaje de Zod>"` |
| `sale_id` apunta a una venta inexistente | `BAD_REQUEST` | `"Sale not found"` |
| Clave desconocida | `BAD_REQUEST` | `"value: Unrecognized key(s) in object: '<clave>'"` |
| El paquete no existe | `NOT_FOUND` | `"Package not found"` |
| El paquete está borrado lógicamente | `NOT_FOUND` | `"Package not found"` |

Un `PUT` sobre un paquete borrado lógicamente responde `404`, no `200`. Editar un registro que la dueña ya borró es editar algo que para el sistema no existe.

---

## `DELETE /api/v1/packages/:id`

Borra lógicamente el paquete: escribe la fecha actual en `deleted_at` y nada más. **Nunca borra físicamente** (decisión D-004).

### Parámetro de ruta

| Parámetro | Tipo | Regla |
|-----------|------|-------|
| `id` | Cadena | UUID. Un valor que no sea UUID produce `400`. |

### Respuesta `200`

```json
{
  "message": "Package deleted successfully"
}
```

Un `204` sin cuerpo también sería válido. Se elige `200` con mensaje para que el frontend pueda confirmar sin inventar el texto.

### Qué se borra y qué no

| Efecto | Detalle |
|--------|---------|
| `package.deleted_at` | Se escribe la fecha actual. Es el **único** cambio. |
| La fila en la base | Sigue existiendo, con todos sus datos. |
| `GET /api/v1/packages` | El paquete desaparece de la lista de inmediato. |
| `pending_packages_count` | Deja de contar, en el rango de la fecha del paquete. |
| `GET /api/v1/sales/:id` | Si estaba vinculado a una venta, deja de aparecer en su campo `packages`. |
| La venta vinculada | **No se toca.** Ni su estado, ni sus artículos, ni sus totales. |
| `package.name` y los demás campos | **No se tocan.** Quedan legibles con una consulta directa a la base. |

Reintentar el borrado sobre el mismo identificador responde `404`, no `200`. El borrado es idempotente desde el punto de vista del cliente: la segunda llamada dice que ya no está.

### Un paquete sobrevive a su venta

La relación `package.sale_id` declara `onDelete: SetNull`, y como el sistema no borra nada físicamente y **no expone un `DELETE` de ventas**, esa cláusula no llega a activarse. Un paquete registrado sigue visible en `GET /api/v1/packages` **y sigue apareciendo en el arreglo `packages` de `GET /api/v1/sales/:id`** aunque su venta pase a `cancelled`. Cancelar una venta no cambia la visibilidad de nada: ni la venta ni el paquete se borran lógicamente, y las relaciones anidadas filtran únicamente por `deleted_at`. Lo que sí cambia es el filtro de los agregados del dashboard, que es un efecto sobre números y no sobre la existencia del dato.

### Errores

| Situación | Código | `message` |
|-----------|--------|-----------|
| `id` no es un UUID | `BAD_REQUEST` | `"id: Package id must be a valid UUID"` |
| El paquete no existe | `NOT_FOUND` | `"Package not found"` |
| El paquete está borrado lógicamente | `NOT_FOUND` | `"Package not found"` |

## Qué no existe en paquetes

| Ausente | Razón |
|---------|-------|
| `GET /api/v1/packages/:id` | El listado trae todos los campos de un paquete. Un endpoint de lectura individual no aporta nada que la lista no dé, y el frontend precarga el formulario de edición con los datos de la fila que ya tiene en memoria. |
| `PATCH /api/v1/packages/:id` | `PUT` es el reemplazo completo. Un parche parcial obligaría a distinguir "no enviado" de "enviado como `null`". |
| Un filtro `?sale_id=` en el listado | Se puede filtrar por fecha y por método. Filtrar por venta es una consulta específica que la pantalla de paquetes no necesita; quien la necesita, va al detalle de la venta y ve sus paquetes ahí. |
| Un campo de estado de entrega | **El modelo no lo tiene.** El indicador de paquetes pendientes del dashboard se define como "registrados y no eliminados" (decisión D-007). |
| `DELETE` de varios paquetes a la vez | No hay operaciones masivas en ningún recurso del sistema. |
