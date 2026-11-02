# Caso de uso: registrar una venta en mostrador

## Actor

La dueña de la tienda, desde el panel administrativo.

## Disparador

Abre `/sales/new?type=live` y completa el formulario de venta en mostrador.

## Flujo principal

1. **El panel lee el parámetro de la URL.** `frontend/src/pages/sales/new.astro` lee `Astro.url.searchParams.get("type")` en el frontmatter. Con `type=live` construye el formulario de mostrador; con `type=whatsapp`, el de WhatsApp. Un valor ausente o distinto de esos dos devuelve a `/sales` con `location.replace()`.
2. **El panel arma el formulario.** Los campos visibles son: nombre del cliente, mercadería (texto libre), forma de pago, banco (condicional), fecha, estado e importe. Cada campo tiene un `name` que coincide con el nombre de la columna.
3. **La dueña elige la forma de pago.** Un `<script type="module">` escucha el `change` del `<select name="payment_method">` y alterna el atributo `hidden` del contenedor del campo banco. Con "Efectivo" el banco se oculta; con "Tarjeta de crédito" aparece.
4. **La dueña envía el formulario.** El `submit` dispara `preventDefault()`, arma el cuerpo con `new FormData(form)` y convierte los campos a los tipos del contrato: la fecha `YYYY-MM-DD` pasa a ISO 8601, el importe se envía como **cadena**, y `status` se envía solo si se eligió un estado distinto de `pending`.
5. **El panel hace la petición.** `api.ts` ejecuta `fetch` contra `POST /api/v1/sales/live` con `Content-Type: application/json`.
6. **El controlador valida el cuerpo.** `CreateLiveSaleDtoSchema.parse(request.body)`. La validación comprueba: nombres con longitud entre 1 y 200, importe con `MONEY_PATTERN`, fecha parseable, `payment_method` y `status` dentro de sus enums, la regla condicional del banco y, por el `.strict()`, que **no exista la clave `additional_items`**.
7. **El servicio fija el canal.** `createSaleService(...).createLive(data)` construye el `CreateLiveSaleData` con `type: "live"` y `additional_items: undefined`. Si por cualquier vía llegara una lista de artículos, lanza `new BadRequestError("Live sales cannot include additional items")`.
8. **El repositorio inserta la fila.** `createSaleRepository(db).createWithNoAdditional(data)` ejecuta:

   ```sql
   INSERT INTO "sale" ("id", "type", "customer_name", "product_name", "payment_method",
                       "payment_bank", "sale_date", "status", "cost", "updated_at", "created_at")
   VALUES ($1, 'live', $2, $3, $4, $5, $6, $7, $8, $9, now())
   ```

   con `id` y `updated_at` generados en el código (ninguna de las dos columnas tiene default en la base). `deleted_at` queda en `NULL`. No hay transacción porque hay una sola escritura.
9. **El repositorio devuelve la fila insertada.** El `db.insert(sale).values(...).returning()` devuelve la fila completa; no hay relectura, porque una venta `live` no tiene renglones que cargar.
10. **El mapper arma la respuesta.** `mapSaleToDetailResponse` convierte `cost` con `toMoneyString` y calcula el total. Como la venta es `live`, no hay artículos, así que `additional_count` es `0` y `total` es exactamente `cost`.
11. **El panel confirma y vuelve al listado.** Con `201`, la pantalla muestra la venta registrada y redirige a `/sales`. Con `400`, muestra `message` junto al formulario sin perder lo escrito.

## Datos involucrados

### `sale` — una fila insertada

| Columna | Valor | Origen |
|---------|-------|--------|
| `id` | UUID generado | Generado en el código (`randomUUID()`) |
| `type` | `"live"` | Lo fija el servicio, no el cuerpo |
| `customer_name` | Texto del campo, o `"Consumidor Final"` | `name="customer_name"`, cota 1–200. Opcional desde S63: sin cliente, el servicio escribe el genérico y `customer_id` queda `NULL` sin crear fila en `customer` |
| `product_name` | Texto del campo | `name="product_name"`, cota 1–200, **texto libre** |
| `payment_method` | `"cash"` o `"credit_card"` | `<select name="payment_method">` |
| `payment_bank` | `null` o el texto del banco | `null` con efectivo; obligatorio con tarjeta |
| `sale_date` | Fecha elegida o el instante actual | `<input type="date" name="sale_date">` |
| `status` | `"pending"` por defecto | `<select name="status">` |
| `cost` | Cadena decimal | `name="cost"`, validada con `MONEY_PATTERN` |
| `created_at` | `now()` | `DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `now()` | Lo escribe el repositorio (`new Date()`) |
| `deleted_at` | `NULL` | Registro vivo |

### `additional_sale` — ninguna fila

La tabla no se toca. La garantía es doble: el DTO es `.strict()` y no declara la clave, y el servicio lanza `BadRequestError` si recibe la lista.

### Salida: el detalle de la venta

```json
{
  "id": "3f1c9a52-7b48-4d1e-9a06-5c2b8e4f1d70",
  "type": "live",
  "customer_name": "María González",
  "product_name": "Abrigo de lana gris",
  "payment_method": "credit_card",
  "payment_bank": "Banco de Bogotá",
  "sale_date": "2026-09-28T15:30:00.000Z",
  "status": "completed",
  "cost": "1250.50",
  "additional_items": [],
  "additional_count": 0,
  "total": "1250.50",
  "packages": [],
  "created_at": "2026-09-28T15:30:02.184Z",
  "updated_at": "2026-09-28T15:30:02.184Z"
}
```

## Alternativas y errores

| Situación | Detección | Respuesta |
|-----------|-----------|-----------|
| El payload trae `additional_items` | `.strict()` de `CreateLiveSaleDtoSchema` | `400` con `message: "value: Unrecognized key(s) in object: 'additional_items'"` |
| `payment_method` es `credit_card` y falta `payment_bank` | `superRefine` | `400` con `message: "payment_bank: Payment bank is required for credit card payments"` |
| `payment_method` es `cash` y viene `payment_bank` | `superRefine` | `400` con `message: "payment_bank: Payment bank is only allowed for credit card payments"` |
| El importe tiene tres decimales (`"1250.567"`) | `MONEY_PATTERN` | `400` con el prefijo `cost: ` |
| El importe viene como número JSON (`1250.50`) | `MONEY_PATTERN` espera cadena | `400` con el prefijo `cost: ` |
| El importe excede `99999999.99` | `MONEY_PATTERN` limita a ocho enteros | `400` con el prefijo `cost: ` |
| Un nombre supera los 200 caracteres | `z.string().max(200)` | `400` con el prefijo del campo |
| La fecha no parsea | `z.coerce.date()` | `400` con el prefijo `sale_date` |
| El estado no está en el enum | `z.enum([...])` | `400` con el prefijo `status` |
| Una clave desconocida cualquiera | `.strict()` | `400` con la lista de claves no reconocidas |
| La base de datos rechaza la fila | `CHECK` de PostgreSQL, solo si se saltó la API | `500 INTERNAL_ERROR`, y el detalle queda solo en el log |

**No hay `409 CONFLICT` en este flujo.** No hay ninguna restricción de unicidad en `sale`: dos ventas con el mismo cliente, la misma mercadería y el mismo importe son dos ventas legítimas y distintas. La mercadería es texto libre (decisión D-002), así que no existe la posibilidad de duplicado por código.

## Salida

| Elemento | Resultado |
|----------|-----------|
| Estado HTTP | `201 Created` |
| Cuerpo | El detalle completo de la venta, con `additional_items` vacío, `additional_count: 0` y `total` igual a `cost` como cadena decimal |
| Ubicación en el panel | La pantalla de ventas, con la nueva fila en el listado |
| Efecto en el dashboard | `sales_count` aumenta en uno; `total_revenue` aumenta en `cost` |
| Efecto en el esquema | Una fila en `sale` |
