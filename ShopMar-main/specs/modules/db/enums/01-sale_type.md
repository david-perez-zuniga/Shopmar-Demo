# `sale_type` — Canal de la venta

## Valores

| Valor | Significado | Efecto en el sistema |
|-------|-------------|----------------------|
| `live` | Venta en mostrador, registrada directamente en el local. | **No admite artículos adicionales.** Un payload con `additional_items` produce `400 BAD_REQUEST` con el mensaje `value: Unrecognized key(s) in object: 'additional_items'`. |
| `whatsapp` | Venta coordinada por WhatsApp, muchas veces a distancia y con varios artículos. | **Puede admitir artículos adicionales**, que se crean en la misma transacción que la venta. |

```ts
export const saleType = pgEnum("sale_type", ["live", "whatsapp"])
```

## Dónde se usa

| Ubicación | Uso |
|-----------|-----|
| `sale` (tabla del esquema) | Columna `type`, obligatoria. Indexada con `index("sale_type_idx").on(table.type)`. |
| `POST /api/v1/sales/live` | El controlador fija `type: "live"` explícitamente. El valor **no viaja en el cuerpo**. |
| `POST /api/v1/sales/whatsapp` | El controlador fija `type: "whatsapp"` explícitamente. El valor **no viaja en el cuerpo**. |
| `GET /api/v1/sales` | Filtro opcional `?type=live` o `?type=whatsapp`, validado por `SalesQuerySchema` con `z.enum(["live", "whatsapp"])`. |
| `GET /api/v1/sales/:id` | Devuelto en la respuesta como `"type"`. |
| `GET /api/v1/sales` (cada fila) | Devuelto en cada fila del listado. |
| Frontend | Etiqueta de la columna "Canal" del listado de ventas: `live` se muestra como "Mostrador" y `whatsapp` como "WhatsApp". La traducción vive en `frontend/src/lib/format.ts`. |

## Por qué el valor no viaja en el cuerpo de la creación

Hay dos endpoints de creación en lugar de uno con un campo `type` en el cuerpo. Las razones son tres:

1. **La regla de artículos adicionales se vuelve estructural.** Un `CreateLiveSaleDtoSchema` que no declara `additional_items` y es `.strict()` rechaza el campo por completo, sin escribir una sola línea de validación condicional. Un endpoint único necesitaría una comprobación explícita del tipo contra la presencia de la lista.
2. **El canal no se puede equivocar.** Con un campo en el cuerpo, la dueña podría enviar `type: "live"` a la ruta de WhatsApp o viceversa, y el sistema tendría que decidir cuál gana. Con dos rutas, el canal lo determina la URL.
3. **La URL queda legible.** `POST /api/v1/sales/whatsapp` dice en el log de acceso, en la pestaña del navegador y en la traza de error que se está registrando una venta de WhatsApp. Es información de negocio en la URL, no un dato técnico.

## Agregar un valor

Agregar un canal futuro, por ejemplo `online` (venta con el cliente en línea), sería una migración de una sola sentencia `ALTER TYPE "sale_type" ADD VALUE 'online'`, más el esquema de Zod, más un endpoint de creación. No requiere cambio en ninguna tabla. Agregar valores a un enum de PostgreSQL en una migración ya aplicada usa `ALTER TYPE` y no la reescribe, por lo que no rompe el historial.
