# src/components

Los bloques que comparten las vistas, el armazón y el documento de la SPA. Ver
`specs/modules/frontend/03-componentes.md`.

La regla que decide dónde vive cada cosa es una sola: **si el bloque se
repite en más de una pantalla, es un componente; si ocurre una sola vez, vive
en su vista**.

| Componente | Props | Se usa en |
|------------|-------|-----------|
| `App` | `view` (`ViewId`) | Lo sirven las nueve rutas del panel: es el documento único de la SPA (D-023) |
| `Nav` | `activeSection?` | `Layout.astro` (armazón completo) |
| `StatCard` | `label`, `value`, `hint`, `icon`, `tone`, `id?` | `SummaryView` (cuatro veces) |
| `BarChart` | `data`, `maxValue?`, `id?` | Ninguna (sin uso) |
| `DonutChart` | `segments`, `totalLabel`, `totalValue`, `size?`, `strokeWidth?`, `id?` | Ninguna (sin uso) |
| `DateRangeFilter` | `action`, `initialStart?`, `initialEnd?` | `SummaryView`, `SalesView`, `PackagesView` y `ExpensesView` (el filtro de fechas) |
| `StatusBadge` | `status` | `InvoicePrint` (la factura del detalle de venta) |
| `ConfirmDialog` | `title?`, `message`, `actionLabel?` | `CustomersView` (borrar) y `SaleNewView` (cancelar) |
| `InvoicePrint` | `sale?`, `visible?` | `SaleDetailView` |
| `BottomNav` | `links`, `activeSection` | Solo desde `Nav.astro` (armazón móvil) |

**`views/` no es una carpeta de componentes compartidos.** Cada
`views/<Vista>View.astro` es el markup de **una** ruta, con su hoja al lado
(`sales.css`, `packages.css`, …), y lo monta el router dentro de
`[data-app-root]`. No se importa desde otra vista ni desde el armazón: si algo
se repite entre vistas, sale de ahí y pasa a esta tabla.

**Componentes sin uso.** `BarChart` y `DonutChart` no los importa nada: los
gráficos del resumen se pintan desde `src/lib/summary/` (`renderBarChart`,
`renderDonutChart`) sobre el contenedor de la vista. `TableState` también quedó
sin uso y se borró en T6: las cuatro listas pintan su estado con
`src/lib/lists/list-state.ts` —en modo fila desde S56— y el detalle de venta con
el mismo pintor en modo host.

**La barra inferior no duplica destinos.** `BottomNav` no declara su propio arreglo de enlaces: recibe por props el mismo `links` que pinta `Nav.astro` en la barra lateral, la barra superior y el cajón. Por eso agregar la barra inferior de móvil no creó una segunda lista de destinos ni una segunda regla de activo: la lista y la regla siguen siendo una sola, y la barra inferior solo agrega una superficie más para la misma navegación. Vive en el armazón, fuera de `[data-app-root]`, así que el router nunca la toca (D-023).

**El botón de acción tampoco es un destino.** Entre Ventas y Paquetes, `BottomNav` intercala un `<a href="/new">` circular con el icono `Plus`: es la quinta columna de la rejilla, pero no recibe `links` ni lleva la clase `bottom-nav-link`. Como no es un destino, no entra en `LINK_SETS` y `markActiveNav` nunca lo marca; solo abre la pantalla que reparte el registro entre venta y gasto.

## Convención de props

**`camelCase` en el `.astro`, `snake_case` en la respuesta de la API.** Un
componente recibe `emptyMessage` e `initialStart`; la API responde
`customer_name` y `payment_bank`. El mapeo entre los dos mundos vive en el
script de la pantalla, nunca en el componente.

## Los componentes son "tontos" a propósito

Cada componente sabe pintar; quien decide es la pantalla. Estos son los
contratos que los scripts de las pantallas usan:

- **`DateRangeFilter`** es un `form method="get"` puro, sin script propio. El
  script de la pantalla intercepta el submit, arma la URL con
  `URLSearchParams` **omitiendo los campos vacíos** (un `start_date=` vacío
  llega al backend como inválido y devuelve `400`) y navega. "Limpiar" solo se
  renderiza cuando el rango trae al menos un valor.
- **`ConfirmDialog`** expone `dialog.showConfirm(): Promise<boolean>`: resuelve
  `true` al confirmar y `false` al cancelar o cerrar con `Escape`. Un solo
  diálogo por pantalla.
- **`InvoicePrint`** se rellena por ganchos `data-invoice-*`: la pantalla pide
  `GET /api/v1/sales/:id`, escribe cada valor con `textContent` (el estado del
  badge además cambia su clase a `badge--<status>`), agrega los renglones de
  artículos adicionales al tbody, hace visible la capa con
  `invoice--visible`, llama a `window.print()` y la vuelve a ocultar. Desde la
  venta a crédito (D-022) imprime además la **condición de pago** en toda
  factura, y en una venta a crédito el bloque `data-invoice-credit` —vence,
  pagado, saldo y el marcador `data-invoice-overdue`— más el bloque
  `data-invoice-payments`, que lista cada pago (fecha, método e importe) o dice
  "Sin pagos registrados" (`data-invoice-payments-empty`). Los ganchos y su
  contrato completo están en `frontend/src/lib/sales/sale-detail.ts`.

## Lo que no existe como componente

| Lo que no existe | Por qué |
|------------------|---------|
| Un `<Button.astro>` genérico | Un componente que solo envuelve un `<button>` y una clase no aporta nada. Se escribe `<button class="btn btn-primary">`. |
| Una tabla genérica parametrizada por columnas | Cada listado tiene columnas y lógica de renderizado distintas. |
| Un modal genérico | Hay un solo diálogo, con un solo propósito. |
| Un componente de formulario | Los tres formularios comparten `.form-grid` y `.field`, que es CSS. |
| Un sistema de notificaciones o toasts | `ConfirmDialog` y el estado de error de la tabla cubren los dos casos que hay. |