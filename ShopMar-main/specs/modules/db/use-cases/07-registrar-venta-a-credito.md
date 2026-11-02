# Caso de uso: registrar una venta a crédito

## Actor

La dueña de la tienda, desde el formulario de venta (`/sales/new?type=live` o `?type=whatsapp`), o un
cliente de la API.

## Disparador

Registra una venta y elige **Crédito** como condición de pago: el cliente se lleva la mercadería y paga
después.

## Flujo principal

1. **El formulario pide dos datos más.** Con "Crédito" elegido, además de lo que ya pide una venta
   normal, exige **cliente** —el nombre escrito, que crea o reutiliza el cliente, o uno elegido de
   `GET /api/v1/customers`— y **fecha de pago prometida**. No pide monto recibido: no hubo cobro.
2. **El cuerpo viaja con `payment_terms: "credit"`**, `customer_name` (o `customer_id` si se eligió un
   cliente del padrón), `due_date` y sin `status` ni `amount_paid`. El canal lo sigue decidiendo la ruta
   (`/live` o `/whatsapp`), como siempre. Con crédito el id **no** es obligatorio: el nombre lo resuelve
   o lo crea el servicio, igual que en contado (S29). **Tampoco viaja `payment_method`**: no hubo cobro
   en el momento, así que no hay forma de pago que elegir; la de cada abono se registra con el pago
   (S57).
3. **El controlador valida.** `CreateLiveSaleDtoSchema` o `CreateWhatsappSaleDtoSchema` aplican el
   `superRefine` de la condición de pago:

   | Situación | Mensaje (`message`) |
   |-----------|---------------------|
   | `credit` sin `due_date` | `"due_date: A credit sale needs a due date"` |
   | `credit` sin `customer_id` y sin `customer_name` | `"customer_id: Send customer_id or customer_name"` |
   | `immediate` con `due_date` | `"due_date: Only a credit sale has a due date"` |
   | `credit` con `status` distinto de `pending` | `"status: A credit sale is created pending"` |
   | `credit` con `amount_paid` | `"amount_paid: A credit sale does not take amount_paid; register payments instead"` |
   | `credit` con `payment_method` | `"payment_method: A credit sale does not take payment_method; register the method with each payment"` |
   | `credit` con `payment_bank` | `"payment_bank: A credit sale does not take payment_bank; register the bank with each payment"` |
   | `customer_id` junto con `customer_name` | `"customer_name: Send customer_name or customer_id, not both"` |

4. **El servicio resuelve el cliente y su teléfono.** Si el cuerpo trae `customer_phone`, se recorta y se valida (`400` si queda vacío); después, el teléfono escrito se guarda en el cliente: el nuevo nace con él, el que existía sin número se completa y el que tenía otro lo reemplaza (S23). Si viene `customer_id`, lo busca entre los clientes vivos. Si no
   existe o está borrado lógicamente: `400` con `message: "customer_id: Customer not found"`. El
   **nombre se copia del cliente** a `sale.customer_name`: es la instantánea de la factura (D-022).

   La resolución por nombre sirve **a las dos condiciones**, contado y crédito (S29): el nombre se
   **recorta** y se busca un cliente **vivo** cuyo nombre coincida sin distinguir mayúsculas. Si existe,
   se reutiliza; si no, se **crea** con ese nombre (sin teléfono ni nota) y la venta queda enlazada a él.
   El nombre de la factura es el guardado, así que conserva la capitalización del primer registro (S18).
   En un crédito el `customer_id` resultante es el que exige el `CHECK` de la tabla: la columna nunca
   queda nula, aunque el cuerpo no haya traído el id.

   El mismo servicio calcula el total derivado y rechaza una venta a crédito de total cero: cualquier
   pago es mayor que cero y el saldo ya sería cero, así que esa venta no se podría cobrar nunca.
   Responde `400` con `message: "cost: A credit sale needs a total greater than zero"` y no escribe
   nada.
5. **El repositorio crea la venta en una transacción.** Escribe `payment_terms = 'credit'`,
   `customer_id`, `due_date`, `status = 'pending'`, `amount_paid = NULL`, `change_given = NULL`, y los
   artículos adicionales si es una venta de WhatsApp. **No escribe ningún pago.** El
   `payment_method` de la fila queda en **`cash`** y `payment_bank` en `NULL`: es el **valor de
   registro** que exige una columna `NOT NULL`, no el medio con el que el cliente va a pagar (S57).
6. **La respuesta es `201`** con el detalle completo: `payment_terms: "credit"`, `due_date`,
   `customer_id`, `paid_total: "0.00"`, `balance` igual al total, `is_overdue: false` y `payments: []`.

Después, la venta aparece en el listado como `Pendiente` con su saldo, y la dueña la cobra total o
parcialmente con el caso de uso 08.

## Datos involucrados

### `sale` — una fila insertada

| Columna | Valor |
|---------|-------|
| `payment_terms` | `credit` |
| `customer_id` | El cliente elegido, o el que resolvió el nombre escrito. Nunca nulo: la regla del alta es **uno de los dos** identificadores y el nombre se resuelve antes de insertar (S29). |
| `customer_name` | Copia del `customer.name` al momento del alta. |
| `due_date` | La fecha prometida. Obligatoria. |
| `status` | `pending`. |
| `amount_paid`, `change_given` | `NULL`. |
| `cost`, `category`, `product_name`, `sale_date`, `type` | Igual que en una venta de contado. |
| `payment_method`, `payment_bank` | `cash` y `NULL`. Es el valor de registro de una columna `NOT NULL` con un `CHECK` que exige banco nulo con `cash`; el método real de cada cobro vive en `sale_payment` (S57). |
| `created_at`, `updated_at` | Marcas de auditoría escritas por la aplicación. |

### `additional_sale` — cero o más filas

Sólo en el canal `whatsapp`, con las mismas reglas de siempre (`quantity`, `total`, `kind`).

### `sale_payment` — ninguna fila

Una venta a crédito nace sin pagos. El saldo es el total.

### `customer` — ninguna fila nueva, salvo que el cliente no exista

Con `customer_id` la venta no toca el padrón. Sin `customer_id` —sea una venta de **contado** o una de
**crédito** con el nombre escrito— el servicio reutiliza el cliente vivo que coincida o inserta una fila
con el nombre recortado y `phone`/`note` nulos (S18, S29).

### Invariantes

| Invariante | Dónde se garantiza |
|------------|--------------------|
| `credit` ⇒ `due_date` y `customer_id` no nulos | `CHECK sale_credito_exige_vencimiento` y `CHECK sale_credito_exige_cliente` (el `customer_id` lo resuelve el servicio desde el nombre escrito si el cuerpo no trae el id) |
| `credit` ⇒ `status = 'pending'` al nacer | Zod + servicio |
| `credit` ⇒ total derivado mayor que cero | Servicio, después de sumar `cost` y los artículos |
| Ninguna venta a crédito nace cobrada | No se acepta `status: "completed"` ni `amount_paid` |
| `credit` ⇒ sin `payment_method` ni `payment_bank` en el alta | Zod: `400` con los mensajes de la tabla del paso 3 |

## Alternativas y errores

| Situación | Detección | Respuesta |
|-----------|-----------|-----------|
| `credit` sin `due_date` | Zod | `400` con el mensaje de la tabla del paso 3 |
| `credit` con `due_date` anterior a `sale_date` | Zod | `400` con `message: "due_date: The due date cannot be before the sale date"` |
| `credit` sin `customer_id` y sin `customer_name` | Zod | `400` con `message: "customer_id: Send customer_id or customer_name"` |
| `customer_id` que no existe | Servicio, `findById` | `400` con `message: "customer_id: Customer not found"` |
| `customer_id` de un cliente borrado lógicamente | Servicio, filtro `deleted_at: null` | `400` con el mismo mensaje |
| Venta a crédito de total cero (`cost: "0.00"` y sin artículos) | Servicio, sobre el total derivado | `400` con `message: "cost: A credit sale needs a total greater than zero"` |
| `customer_name` vacío en una venta de contado | Zod | `400` con el mensaje de longitud de siempre |
| `customer_name` con sólo espacios en una venta de contado | Servicio, después del recorte | `400` con `message: "customer_name: Customer name is required"` |
| Venta `immediate` con `due_date` | Zod | `400` con `message: "due_date: Only a credit sale has a due date"` |
| Venta `credit` con `payment_method` | Zod | `400` con `message: "payment_method: A credit sale does not take payment_method; register the method with each payment"` |
| Venta `credit` con `payment_bank` | Zod | `400` con `message: "payment_bank: A credit sale does not take payment_bank; register the bank with each payment"` |
| Venta `immediate` sin `customer_id` | No es un error | Es el caso normal: la venta de contado guarda el nombre como texto. |

## Salida

| Elemento | Resultado |
|----------|-----------|
| Estado HTTP | `201 Created` |
| Cuerpo | Detalle completo de la venta, con `balance` igual al total y `payments: []` |
| Ubicación en el panel | El listado de ventas, como `Pendiente`, con `payment_terms: credit` y su saldo |
| Efecto en el dashboard | `total_revenue` suma el total en el rango de `sale_date` (devengado, D-008). `outstanding_receivables` suma el saldo. `collected_revenue` **no cambia**: todavía no entró plata. |
