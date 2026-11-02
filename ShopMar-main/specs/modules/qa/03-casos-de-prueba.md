# QA — Taxonomía de casos de prueba

Cada funcionalidad descubierta se somete a las siete familias de casos. Los ejemplos de esta página son **reales** de `shpr`: pantallas, campos, endpoints y mensajes que existen hoy.

## 1. Happy Path

Validar el comportamiento esperado de cada flujo completo.

| Caso | Flujo | Resultado esperado |
|------|-------|--------------------|
| Venta de mostrador en efectivo | `/sales/new?type=live`: cliente, prenda, categoría, efectivo, importe, Guardar | `201`, vuelve a `/sales`, factura imprimible |
| Venta por WhatsApp con artículos | `/sales/new?type=whatsapp`: 2 artículos adicionales, Guardar | `201` con venta y sus renglones, total = cost + suma |
| Venta con tarjeta | `payment_method=credit_card` + banco | `201`; el banco queda guardado |
| Completar una venta | `PATCH /api/v1/sales/:id/status` a `completed` en `/sales` | `200`, la fila cambia de estado |
| Registrar paquete vinculado | `/packages/new` con `sale_id` | `201`, aparece en el listado |
| Registrar gasto con fecha de hoy | `/expenses/new` | `201`, aparece en el listado |
| Resumen con datos | Abrir el dashboard con el rango de fechas por defecto | Cuatro tarjetas con valores coherentes con el listado |

## 2. Casos negativos

| Caso | Entrada | Resultado esperado |
|------|---------|--------------------|
| Importe vacío | `cost=""` | `400` `BAD_REQUEST` con el prefijo del campo |
| Importe con letras | `cost="abc"` | `400`, el error se ubica en el campo `cost` en el formulario |
| Importe con coma decimal | `cost="1,50"` | `400` (el patrón MONEY_PATTERN exige punto) |
| Importe negativo | `cost="-100"` | `400` |
| Artículos en venta live | `additional_items` en `/sales/live` | `400` `value: Unrecognized key(s) in object: 'additional_items'` |
| Tarjeta sin banco | `credit_card` sin `payment_bank` | `400` "Payment bank is required for credit card payments" |
| Banqueado con efectivo | `payment_bank` con `cash` | `400` "Payment bank is only allowed for credit card payments" |
| UUID inválido | `GET /api/v1/sales/123` | `400`, no `404` |
| Venta inexistente (detalle) | UUID válido que no existe | `404` `NOT_FOUND` |
| Borrada lógicamente | `GET /api/v1/packages/:id` de un paquete eliminado | `404` |

## 3. Casos límite

| Caso | Límite | Resultado esperado |
|------|--------|--------------------|
| Importe máximo | `cost="99999999.99"` | `201` (8 enteros, 2 decimales) |
| Importe que excede | `cost="100000000"` | `400` |
| Cero importe | `cost="0"` | Aceptado por el patrón (regla de negocio, no de formato) |
| Artículos adicionales | 1 elemento y 50 elementos | `201` en ambos extremos |
| Artículos de más | 51 elementos | `400` (rango 1-50) |
| Rango de fechas del dashboard | Desde el día de la primera venta hasta hoy | Cuatro tarjetas, sin error |
| Fecha de venta | hoy en hora local, a las 23:30 | La venta queda fechada hoy, no mañana (regla de `sale_date` de `/sales/new`) |

## 4. Casos extremos

| Caso | Entrada | Resultado esperado |
|------|---------|--------------------|
| Notación exponencial | `cost="1e5"` | `400` (el patrón la rechaza) |
| Cadena gigante | `customer_name` con 10.000 caracteres | `400` o `201` según el límite del DTO; nunca `500` |
| Un solo artículo de cantidad 0 | `quantity=0` en un artículo adicional | `400` (la cantidad mínima es 1) |
| Fecha fuera de rango | `sale_date` del año 2100 | `400` según el DTO (verificar límite real) |

## 5. Casos absurdos

| Caso | Entrada | Resultado esperado |
|------|---------|--------------------|
| HTML en texto libre | `customer_name="<script>alert(1)</script>"` | Se guarda o rechaza como texto; el navegador **no** lo ejecuta (`setText` usa `textContent`, nunca `innerHTML`) |
| Emoji y Unicode | `product_name="👗 ąęż"` | Se guarda o rechaza sin romperse; nunca `500` |
| JSON excesivamente anidado | Cuerpo con 20 niveles | `400` por Zod o límite del parser; nunca `500` |
| Bytes nulos | `customer_name` con `\0` | Rechazo controlado, sin error de protocolo |

## 6. Casos de seguridad

| Caso | Cómo | Resultado esperado |
|------|------|--------------------|
| XSS por texto libre | `customer_name` con `<script>` y con atributos `onerror` | El panel muestra texto, no ejecuta scripts (el `setText` de `dom.ts` está probado en `frontend/06-testing.md`) |
| SQL injection | `customer_name="'; DROP TABLE sale; --"` | Drizzle parametriza: se guarda como texto literal o falla validación; la tabla sigue intacta |
| NoSQL / manipulación de requests | Payload con claves extra (`status`, `total`, `deleted_at`) | `400` por `.strict()` de Zod; el cliente no puede fijar campos que el servidor no recibe |
| Bypass de cliente | `POST /api/v1/sales/live` directo con `additional_items` sin pasar por la UI | `400` (la regla vive en el DTO, no en el formulario) |
| CORS | Petición desde origen distinto a `CORS_ORIGIN` | Rechazada por el navegador (ver `backend/04-security.md`) |
| Rate limit | Más de 1000 peticiones en un minuto | `429 TOO_MANY_REQUESTS` |
| Fuga de información en 500 | Provocar un fallo interno | El cuerpo responde `INTERNAL_ERROR` genérico; el detalle solo en el log del servidor |

## 7. Casos de usuario real

| Caso | Comportamiento | Resultado esperado |
|------|----------------|--------------------|
| Doble clic en Guardar | Clic rápido dos veces sobre el botón de envío | **Una sola** venta creada (el botón se deshabilita con `disabled`) |
| Submit repetido | Enter repetido en el formulario de venta | Una sola venta |
| Refresh inesperado | Recargar `/sales/new` después de escribir | El formulario pierde los datos (no hay borradores) y no se envía nada duplicado |
| Retroceso del navegador | Volver desde el detalle de venta | La lista sigue con su filtro (el estado vive en la URL) |
| Múltiples pestañas | Registrar una venta en una pestaña y abrir `/` en otra | El resumen muestra la venta nueva (no hay caché, D-005) |
| Pegado masivo | Pegar un párrafo en `product_name` | Se guarda como texto o se rechaza por longitud; nunca rompe la pantalla |
| Imprimir factura | `Ctrl+P` desde el detalle de venta | Solo se imprime la factura (reglas `@media print`), en blanco y negro sobre blanco |
| Modo whatsapp con artículos | Agregar y quitar artículos en `/sales/new?type=whatsapp` | Las filas aparecen y desaparecen sin recargar la página (`setRemoveDisabled` permite llegar a cero filas) |

## Cobertura mínima por pantalla

El inventario de rutas de `01-arquitectura.md` (siete rutas más la octava de formulario) es el punto de partida; el Paso 1 de descubrimiento confirma la lista real contra el código y la aplicación. La ruta de detalle (`/sales/detail?id=<uuid>` para la factura y el detalle de venta) es una sola página estática desde D-017: el `id` viaja en la query.

| Pantalla | Visualización | Ingreso | Edición | Eliminación | Validación | Persistencia | Navegación | Errores |
|----------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/` (dashboard) | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ |
| `/sales` | ✓ | — | ✓ (estado) | — | — | ✓ | ✓ | ✓ |
| `/sales/new` | ✓ | ✓ | ✓ | ✓ (quitar artículo) | ✓ | ✓ | ✓ | ✓ |
| `/sales/detail` | ✓ | — | — | — | — | ✓ | ✓ | ✓ |
| `/packages` | ✓ | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `/packages/new` | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| `/expenses` | ✓ | — | — | ✓ | — | ✓ | ✓ | ✓ |
| `/expenses/new` | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ |

La edición no aplica a ventas ni gastos porque el contrato lo prohíbe (no hay `PUT /sales/:id` ni `PUT /expenses/:id`): "la ausencia de un endpoint es parte del contrato" (`modules/api/README.md`).