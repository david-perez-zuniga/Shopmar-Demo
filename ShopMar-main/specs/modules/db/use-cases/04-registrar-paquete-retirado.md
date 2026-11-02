# Caso de uso: registrar un paquete retirado

## Actor

La dueña de la tienda, desde el panel administrativo.

## Disparador

Abre `/packages/new` y completa el formulario de paquete.

## Flujo principal

1. **El panel abre el formulario.** `frontend/src/pages/packages/new.astro` renderiza los campos de nombre, fecha, método y venta asociada. La pantalla vive bajo la ruta `/packages/new` aunque la pantalla de paquetes sea `/packages`, porque la lista y el formulario son dos archivos y el formulario necesita su propia URL para poder recargarse.
2. **La dueña elige la venta, si corresponde.** Un `<select name="sale_id">` se arma con las ventas obtenidas de `GET /api/v1/sales`. La primera opción es "Sin venta asociada" con `value=""`, que el `FormData` entrega como cadena vacía y el DTO normaliza a `null`.
3. **La dueña elige el método.** Un `<select name="method">` con las tres opciones: Cargotrans, Delivery y Retiro. Los `value` son los valores exactos del enum (`cargotrans`, `delivery`, `retiro`); las etiquetas visibles son las traducidas.
4. **La dueña envía el formulario.** El `submit` arma el cuerpo con `new FormData(form)`: la fecha `YYYY-MM-DD` pasa a ISO 8601, `sale_id` vacío se convierte en `null`, y los demás campos viajan como texto.
5. **El panel hace la petición.** `api.ts` ejecuta `fetch` contra `POST /api/v1/packages`.
6. **El controlador valida el cuerpo.** `CreatePackageDtoSchema.parse(request.body)`: `name` entre 1 y 200 caracteres, `package_date` opcional con `z.coerce.date()`, `method` dentro del enum y `sale_id` como `z.string().uuid().nullish()`. El esquema es `.strict()`.
7. **El servicio normaliza.** `createPackageService(...).create(data)` convierte `sale_id` vacío o `undefined` en `null` y fija `package_date` en el instante actual cuando no viene.
8. **El repositorio inserta la fila.** `PackageRepository.create(data)` ejecuta:

   ```sql
   INSERT INTO "package" ("name", "package_date", "method", "sale_id", "created_at")
   VALUES ($1, $2, $3, $4, now())
   ```

   `sale_id` puede ser `NULL`. No hay transacción porque hay una sola escritura.
9. **PostgreSQL valida el enlace, si viene.** Si `sale_id` apunta a una venta inexistente, la clave foránea viola su restricción (código `23503`) y el manejador responde `400 BAD_REQUEST` con `"Sale not found"`. La tabla **no tiene** una restricción `NOT VALID` sobre ventas borradas lógicamente: el enlace apunta a la fila física, y una venta cancelada sigue siendo una fila válida, así que se puede vincular un paquete a una venta `cancelled`. Es el comportamiento correcto: la venta existe, solo que está cancelada.
10. **El repositorio relee la fila.** `prisma.package.findUniqueOrThrow` con el `packageSelect` completo, para devolver `created_at` y `updated_at` que los valores de inserción no incluyen.
11. **El panel confirma y vuelve al listado.** Con `201`, redirige a `/packages` con la nueva fila.

## Datos involucrados

### `package` — una fila insertada

| Columna | Valor | Origen |
|---------|-------|--------|
| `id` | UUID generado | `@default(uuid())` |
| `name` | Texto del campo | `name="name"`, cota 1–200. Texto libre, sin normalización. |
| `package_date` | Fecha elegida o el instante actual | `<input type="date" name="package_date">` |
| `method` | `"cargotrans"`, `"delivery"` o `"retiro"` | `<select name="method">` |
| `sale_id` | UUID de la venta elegida, o `NULL` | `<select name="sale_id">`, `"Sin venta asociada"` → `null` |
| `created_at` | `now()` | `DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `now()` | `@updatedAt` |
| `deleted_at` | `NULL` | Registro vivo |

### Salida: el paquete creado

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

## Alternativas y errores

| Situación | Detección | Respuesta |
|-----------|-----------|-----------|
| El cuerpo trae `additional_items` u otra clave desconocida | `.strict()` | `400` con la lista de claves no reconocidas |
| `name` está vacío o supera 200 caracteres | `z.string().min(1).max(200)` | `400` con el prefijo `name` |
| `method` no está en el enum | `z.enum([...])` | `400` con el prefijo `method` |
| `sale_id` no es un UUID | `z.string().uuid()` | `400` con el prefijo `sale_id` |
| `sale_id` apunta a una venta inexistente | `P2003` de la clave foránea | `400` con el mensaje de negocio, no `500` |
| La fecha no parsea | `z.coerce.date()` | `400` con el prefijo `package_date` |

**No hay `409 CONFLICT`.** La tabla `package` no tiene ninguna restricción de unicidad: dos paquetes con el mismo nombre, la misma fecha y el mismo método son dos envíos distintos y legítimos. Un paquete se identifica por su `id`, nunca por su contenido.

## Salida

| Elemento | Resultado |
|----------|-----------|
| Estado HTTP | `201 Created` |
| Cuerpo | El paquete creado, con los campos de auditoría |
| Ubicación en el panel | La pantalla de paquetes, con la nueva fila |
| Efecto en el dashboard | `pending_packages_count` aumenta en uno, si la `package_date` cae dentro del rango consultado (definición de D-007) |
| Efecto en el esquema | Una fila en `package` |
