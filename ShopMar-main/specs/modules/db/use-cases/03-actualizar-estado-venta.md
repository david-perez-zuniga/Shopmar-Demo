# Caso de uso: actualizar el estado de una venta

## Actor

La dueña de la tienda, desde el listado de ventas.

## Disparador

Selecciona un estado nuevo para una venta en la columna "Estado" del listado y confirma la acción.

## Flujo principal

1. **El panel ofrece los tres estados, salvo en las ventas ya canceladas.** En `frontend/src/pages/sales/index.astro`, cada fila tiene un `<select>` con `pending`, `completed` y `cancelled`, con las etiquetas "Pendiente", "Completada" y "Cancelada". En una fila `cancelled` el `<select>` no se dibuja: la celda muestra la insignia "Cancelada" y una nota que explica que el estado no se puede cambiar. Cancelar desde una venta viva deshabilita el selector en el acto, sin recargar la página.
2. **La dueña elige un estado y confirma.** Un `<script type="module">` escucha el `change`, abre un `confirm()` con el texto "Cambiar el estado de esta venta a <etiqueta>?" y solo si la dueña acepta construye el cuerpo `{ status: "<valor>" }`.
3. **Si la dueña cancela, no pasa nada.** El script restaura el valor anterior del `<select>` y no hay petición.
4. **El panel hace la petición.** `api.ts` ejecuta `fetch` con método `PATCH` contra `/api/v1/sales/<id>/status` y `Content-Type: application/json`.
5. **El controlador valida.** Primero `SaleIdParamSchema.parse(request.params)`, que exige un UUID. Después `UpdateSaleStatusDtoSchema.parse(request.body)`, un `z.object({ status: z.enum(["pending", "completed", "cancelled"]) }).strict()`.
6. **El servicio comprueba que la venta existe y que no está cancelada.** `createSaleService(...).updateStatus(id, status)` llama primero a `repository.findById(id)`. Si devuelve `null` —porque no existe o porque está borrada lógicamente— lanza `new NotFoundError("Sale not found")`. Si la venta está `cancelled`, lanza `new ConflictError(...)` con un mensaje en español que nombra a la venta, dice que `cancelled` es definitiva y sugiere registrar una venta nueva. **La comprobación va antes de resolver el cobro**, así que un rechazo no deja efectos secundarios.
7. **El servicio aplica el cambio.** `repository.updateStatus(id, status)` ejecuta un `update` que escribe `status`, `amount_paid` y `change_given`, y el repositorio escribe `updated_at` con `new Date()` en la misma sentencia.
8. **El repositorio relee con relaciones.** `findById` interno hace un `leftJoin` de `additional_sale` con `deleted_at IS NULL` en la condición del JOIN.
9. **El mapper recalcula el total.** El total es derivado, así que se recalcula en cada respuesta. Cambiar el estado **no cambia el total**: los importes son los mismos. Lo que cambia es la etiqueta de la insignia de estado.
10. **El panel actualiza la fila.** Con `200`, el script reemplaza la celda de estado con la insignia del color correspondiente y toma el `total` de la respuesta para actualizar la celda, aunque el valor no haya cambiado.

## Datos involucrados

### `sale` — una fila actualizada

| Columna | Cambio |
|---------|--------|
| `status` | **El único campo que cambia.** De su valor actual al nuevo valor del enum. |
| `updated_at` | Actualizado por el repositorio con `new Date()` en la misma sentencia. |
| `id`, `type`, `customer_name`, `product_name`, `payment_method`, `payment_bank`, `sale_date`, `cost`, `created_at`, `deleted_at` | Sin cambios. |

La operación se limita a `status` de forma deliberada. El `update` del repositorio recibe un objeto con una sola clave:

```ts
async updateStatus(id, status, amountPaid, changeGiven) {
  await db.update(sale)
    .set({ status, amountPaid, changeGiven, updatedAt: new Date() })
    .where(eq(sale.id, id))
  return findById(id)
}
```

### `additional_sale` — sin cambios

Los artículos adicionales no se tocan. Cancelar una venta **no** borra lógicamente los artículos: la venta queda visible con su desglose completo, y es el borrado lógico explícito de la venta el que marcaría sus artículos. Ver la sección de errores de este caso.

Lo que sí ocurre es que la venta cancelada, y por lo tanto sus artículos, dejan de sumar en los agregados del dashboard. Es un filtro de lectura, no una modificación del dato.

### `package` — sin cambios

Los paquetes vinculados a la venta tampoco se tocan. Un paquete enviado no se deshace porque se cancele la venta.

## Alternativas y errores

| Situación | Detección | Respuesta |
|-----------|-----------|-----------|
| El `:id` no es un UUID | `SaleIdParamSchema` | `400` con `message: "id: Sale id must be a valid UUID"` |
| El cuerpo trae campos además de `status` | `.strict()` | `400` con la lista de claves no reconocidas |
| El `status` no está en el enum | `z.enum([...])` | `400` con `message: "status: ..."` |
| El cuerpo viene vacío | El esquema exige `status` | `400` |
| La venta no existe | `findById` devuelve `null` | `404 NOT_FOUND` con `message: "Sale not found"` |
| La venta está borrada lógicamente | `findById` filtra `deleted_at: null` | `404 NOT_FOUND`, no `200` |
| La venta ya está en ese estado y no es `cancelled` | No hay comprobación | `200` con el detalle. Sin efecto real más allá de refrescar `updated_at`. |
| La venta está `cancelled` y se pide cualquier estado | El servicio compara `existing.status` | `409 CONFLICT` con un mensaje en español que nombra a la venta. La venta queda `cancelled` y el cobro sigue en `null`. |

### Transiciones permitidas

Todas las que no partan de `cancelled`:

| De | A | Permitida |
|----|---|-----------|
| `pending` | `completed` | Sí |
| `pending` | `cancelled` | Sí |
| `completed` | `cancelled` | Sí |
| `completed` | `pending` | Sí |
| `cancelled` | cualquiera | **No**, `409 CONFLICT` |

`completed` → `cancelled` sigue permitida a propósito: sin ese camino, corregir una venta recién cobrada solo era posible interveniendo la base de datos.

`cancelled` → `cancelled` también se rechaza. No es un no-op inofensivo: es una transición desde `cancelled`, y la regla no admite ninguna.

### Cancelar no borra: qué pasa con el registro

Si la dueña cancela una venta **con artículos adicionales**, el cambio de estado a `cancelled` **no borra lógicamente** la venta ni sus artículos. Eso es deliberado: conservar el registro da trazabilidad de que existió una operación y se canceló, con su fecha, su cliente y su importe.

La diferencia con el borrado lógico es que el borrado es una ausencia y `cancelled` es una afirmación. Por eso el filtro de los agregados no necesita de un borrado para excluir la venta: mira su estado.

Y como `cancelled` no admite transiciones de salida, la consecuencia práctica es que una venta cancelada **no aparece nunca más en los agregados del dashboard**, sin importar lo que se haga después. No hace falta un endpoint de borrado lógico de ventas, que sigue sin existir.

## Salida

| Elemento | Resultado |
|----------|-----------|
| Estado HTTP | `200 OK` |
| Cuerpo | El detalle completo de la venta con el `status` nuevo y el `total` recalculado como cadena decimal |
| Ubicación en el panel | La insignia de estado de la fila, con el color correspondiente. Si el estado nuevo es `cancelled`, la celda además deja el selector inerte con su nota. |
| Efecto en el esquema | Una fila de `sale` actualizada en `status` y `updated_at` |
| Efecto en el dashboard | Directo si la venta pasa a `cancelled`: sale de `total_revenue` y de `sales_count`, junto con sus artículos adicionales (decisión D-008, revertida el 2026-10-04). Ninguno en cualquier otro caso. |
