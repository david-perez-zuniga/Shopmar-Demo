# Esquemas de la base de datos

Un archivo por tabla del modelo de dominio, más `index.md` con el modelo completo y el resumen de relaciones.

## Archivos

| Archivo | Tabla | Contenido |
|---------|-------|-----------|
| `01-sale.md` | `sale` | La venta: campos, índices, tres relaciones, la regla del banco, la condición de pago y la invariante del total derivado. |
| `02-additional_sale.md` | `additional_sale` | Artículo adicional de una venta por WhatsApp: cinco campos, un índice, la pertenencia exclusiva a ventas `whatsapp`. |
| `03-package.md` | `package` | Paquete retirado: cinco campos, dos índices, el enlace opcional a su venta y el `SetNull`. |
| `04-expense.md` | `expense` | Gasto diario: cinco campos, un índice, sin relaciones. |
| `05-customer.md` | `customer` | Cliente registrado: seis campos, sin índice propio, la referencia opcional desde `sale` y el `Restrict`. |
| `06-sale_payment.md` | `sale_payment` | Libro de pagos: un renglón por pago, monto aplicado, la regla del banco y el saldo derivado. |
| `07-auth.md` | `user` y `session` | Acceso al panel: la cuenta con su rol, el hash `scrypt`, y la sesión que no vence porque no tiene columna de vencimiento (D-024). |
| `index.md` | — | El modelo completo en un archivo, el diagrama de relaciones y las convenciones. |

## Orden de lectura

1. `index.md` — para tener el panorama completo.
2. `01-sale.md` — la tabla central; las otras la necesitan para entenderse.
3. `02-additional_sale.md` — Entender cómo se construye el total de una venta.
4. `03-package.md` — Entender el enlace opcional y el comportamiento de `SetNull`.
5. `06-sale_payment.md` — cómo se cobra una venta a crédito sin guardar el saldo.
6. `05-customer.md` — el sujeto de una cuenta por cobrar.
7. `04-expense.md` — la tabla más simple del modelo.
8. `07-auth.md` — las dos únicas tablas que no son del negocio.

## Reglas que se aplican a las siete tablas

| Regla | Detalle |
|-------|---------|
| Clave primaria | `id UUID`, generado por la aplicación (no hay default en la base). |
| Marcas de tiempo | `created_at` (default `CURRENT_TIMESTAMP`), `updated_at` (se escribe en cada consulta, sin default), `deleted_at` (opcional). |
| Fechas de negocio | `timestamp(..., { withTimezone: true, precision: 3 })`: milisegundos y zona horaria explícita. |
| Importe | `numeric(..., { precision: 10, scale: 2 })`. |
| Borrado lógico | `deleted_at` y filtro `deleted_at: null` en toda lectura. Nada se borra físicamente. |
| Nombre | Minúsculas y en singular. |
| Índices | Comunes, declarados explícitamente. Únicos solo donde una restricción de integridad lo exige (`user.username`, `user.email`, `session.token_hash`). |

## Restricciones que solo existen en el SQL de la migración

`drizzle-kit generate` no deduce las restricciones `CHECK` por sí solo, así que se declaran con `check()` dentro de la definición de la tabla en `src/db/schema/`:

| Restricción | Tabla |
|-------------|-------|
| `payment_bank` obligatorio con `credit_card` y nulo con `cash` | `sale` |
| Importes no negativos | `sale`, `additional_sale`, `expense` |
| `quantity >= 1` | `additional_sale` |
