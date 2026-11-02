# Caso de uso: registrar una venta por WhatsApp con artículos adicionales

## Actor

La dueña de la tienda, desde el panel administrativo.

## Disparador

Abre `/sales/new?type=whatsapp`, completa los campos comunes de la venta y agrega uno o varios renglones de artículos adicionales.

## Flujo principal

1. **El panel lee el parámetro de la URL.** Con `type=whatsapp`, `frontend/src/pages/sales/new.astro` renderiza el bloque de artículos adicionales además de los campos comunes.
2. **La dueña agrega renglones.** El `<script type="module">` mantiene un estado local con un arreglo de artículos. El botón "Agregar artículo" clona una plantilla de `<template>` con un grupo de cuatro campos —`name`, `description`, `quantity`, `total`—, le asigna un índice y lo inserta en el contenedor. El botón "Quitar" de cada renglón lo elimina del DOM y del arreglo.
3. **La dueña completa cada renglón.** Los campos son de texto y número nativo. `quantity` arranca en `1` y `total` se escribe como importe del renglón completo, no como precio unitario.
4. **La dueña envía el formulario.** El `submit` arma el cuerpo: los campos comunes más `additional_items`, un arreglo de objetos `{ name, description, quantity, total }` donde `quantity` se convierte a número entero y `total` se envía como **cadena**. Si no agregó ningún renglón, la clave se omite del cuerpo.
5. **El panel hace la petición.** `api.ts` ejecuta `fetch` contra `POST /api/v1/sales/whatsapp`.
6. **El controlador valida el cuerpo.** `CreateWhatsappSaleDtoSchema.parse(request.body)`: los mismos campos comunes que en la venta de mostrador, más `additional_items: z.array(AdditionalItemDtoSchema).min(1).optional()`. Cada renglón valida `name` (1 a 200), `description` (opcional, hasta 500), `quantity` (`z.coerce.number().int().min(1)`) y `total` con `MONEY_PATTERN`. El arreglo tiene un máximo de 50 elementos. Se ejecuta el mismo `superRefine` del banco.
7. **El servicio delega.** `createSaleService(...).createWhatsapp(data)` pasa `type: "whatsapp"` y la lista de artículos al repositorio. Si la lista viene ausente, el servicio la normaliza a `[]`.
8. **El repositorio abre una transacción.** `createSaleRepository(db).createWithAdditional(data)` ejecuta `db.transaction` con un callback:

   ```ts
   const [row] = await tx.insert(sale).values({ ...data, id: randomUUID(), updatedAt: now }).returning()
   if (data.additional_items?.length) {
     const items = await tx.insert(additionalSale)
       .values(data.additional_items.map((item) => ({ ...item, saleId: row.id, id: randomUUID(), updatedAt: now })))
       .returning()
     return toSaleEntity(row, items)
   }
   return toSaleEntity(row, [])
   ```

   Las dos sentencias ocurren dentro de la misma transacción. Los renglones insertados se devuelven con `.returning()`, así que no hace falta una relectura.
9. **PostgreSQL garantiza la atomicidad.** Si el `INSERT` de cualquier renglón falla, la transacción completa se revierte: **no queda ninguna venta huérfana**. Este es el mecanismo que garantiza que el total derivado nunca se base en artículos que no existen.
10. **El mapper calcula el total.** `mapSaleToDetailResponse` suma con `sumMoney([cost, ...adicionales.map(a => a.total)])`, que usa `new Decimal(a).plus(b)` de `decimal.js`. El resultado pasa por `toFixed(2)` y viaja como cadena.
11. **El panel confirma y vuelve al listado.** Con `201`, redirige a `/sales` con la nueva fila visible.

## Datos involucrados

### `sale` — una fila insertada

Idéntica a la venta de mostrador, con dos diferencias: `type` es `"whatsapp"` y `additional_items` no aplica.

### `additional_sale` — de cero a 50 filas insertadas

Una fila por renglón del formulario. Todas comparten el mismo `sale_id`, el de la venta recién creada.

| Columna | Valor | Origen |
|---------|-------|--------|
| `id` | UUID generado | Generado en el código (`randomUUID()`) |
| `sale_id` | UUID de la venta nueva | Lo asigna el repositorio, no el formulario |
| `name` | Texto del campo | `name="name"`, cota 1–200 |
| `description` | Texto o `null` | `name="description"`, opcional, cota 500 |
| `quantity` | `>= 1` | `z.coerce.number().int().min(1)`, por defecto 1 |
| `total` | Cadena decimal | `name="total"`, `MONEY_PATTERN`. **Importe del renglón completo.** |
| `created_at` | `now()` | `DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `now()` | Lo escribe el repositorio |
| `deleted_at` | `NULL` | Registro vivo |

### `package` — sin efecto

Esta venta todavía no tiene paquetes. El enlace se puede hacer después con `PUT /api/v1/packages/:id`.

### Salida: el detalle con el total derivado

```json
{
  "id": "b82d4e19-5a03-42c7-9f11-7e6d0a3b9c25",
  "type": "whatsapp",
  "customer_name": "Laura Ramírez",
  "product_name": "Vestido de algodón",
  "payment_method": "cash",
  "payment_bank": null,
  "sale_date": "2026-09-28T17:05:00.000Z",
  "status": "pending",
  "cost": "1250.50",
  "additional_items": [
    {
      "id": "0c5f1e88-1a47-4b92-8d3e-77b0c5a1e640",
      "name": "Pantalón de mezclilla",
      "description": "Talla 30, azul",
      "quantity": 1,
      "total": "850.00"
    },
    {
      "id": "9a2e7b31-64d0-4f18-95c7-3e8b1d604a2f",
      "name": "Cinturón de cuero",
      "description": null,
      "quantity": 1,
      "total": "100.00"
    }
  ],
  "additional_count": 2,
  "total": "2200.50",
  "packages": [],
  "created_at": "2026-09-28T17:05:01.442Z",
  "updated_at": "2026-09-28T17:05:01.442Z"
}
```

El cálculo del paso 10: `1250.50 + 850.00 + 100.00 = "2200.50"`. Exactamente, con aritmética de `Decimal` y sin un solo número de punto flotante en el camino.

## Alternativas y errores

| Situación | Detección | Respuesta |
|-----------|-----------|-----------|
| `additional_items` viene como `[]` | `.min(1)` del esquema | `400` con el prefijo `additional_items` |
| `additional_items` tiene más de 50 renglones | `.max(50)` del esquema | `400` con el prefijo `additional_items` |
| Un renglón tiene `quantity: 0` | `z.coerce.number().int().min(1)` | `400` con el prefijo `additional_items.0.quantity` |
| Un renglón tiene `quantity: 1.5` | `.int()` | `400` con el prefijo `additional_items.0.quantity` |
| Un `total` de renglón con tres decimales | `MONEY_PATTERN` | `400` con el prefijo `additional_items.0.total` |
| Un `total` de renglón negativo | `MONEY_PATTERN` rechaza el signo menos | `400` con el prefijo `additional_items.0.total` |
| `payment_method` es `credit_card` sin `payment_bank` | `superRefine` | `400` con `message: "payment_bank: Payment bank is required for credit card payments"` |
| Una clave desconocida en un renglón | `.strict()` del esquema del renglón | `400` con la ruta `additional_items.0.<clave>` |
| Falla la inserción de un renglón | La transacción revierte | `500 INTERNAL_ERROR`, y **no queda ninguna venta creada** |

**No hay `409 CONFLICT` en este flujo.** Igual que en la venta de mostrador, no existe ninguna restricción de unicidad en `sale` ni en `additional_sale`.

**Un caso de borde de la interfaz, no de la API.** Si la dueña agrega cinco renglones y solo completa tres, los otros dos viajan con `name: ""` y el DTO los rechaza con `400`. El formulario no filtra renglones vacíos antes de enviar; la validación del servidor es la que decide. Es intencional: el cliente no debe tener una lógica de limpieza que pueda divergir de la del servidor.

## Salida

| Elemento | Resultado |
|----------|-----------|
| Estado HTTP | `201 Created` |
| Cuerpo | El detalle completo de la venta con `additional_items` poblado, `additional_count` y `total` como cadena decimal |
| Ubicación en el panel | La pantalla de ventas, con la nueva fila en el listado |
| Efecto en el dashboard | `sales_count` aumenta en uno; `total_revenue` aumenta en el total derivado, no solo en `cost` |
| Efecto en el esquema | Una fila en `sale` y de cero a 50 filas en `additional_sale`, insertadas en una sola transacción |
| Atomicidad | O se crea la venta con todos sus renglones, o no se crea nada |
