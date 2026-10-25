# 04-screens.md

## Pantallas principales — agrupadas por zona

### Zona Pública

1. **Home / Dashboard** (`src/pages/index.astro`)
   - **Propósito**: Visión general de KPIs, filtros, gráficos de ventas
   - **Datos que muestra**: 4 KPIs (total, pending, completed, cancelled), donut chart por canal, bar chart series horarias
   - **Acciones del usuario**: Aplicar filtros (fecha, canal, estado), cambiar estado en tabla, ver detalle, imprimir
   - **Navegación desde**: Acceso directo, CTA desde Nav
   - **Estados**: loading → empty → ready

2. **Listado de ventas** (`src/pages/sales/index.astro`)
   - **Propósito**: Ver todas las ventas con filtros y paginación
   - **Datos que muestra**: Tabla con 10 filas por página, columnas: Fecha, Cliente, Mercadería, Canal, Estado, Artículos, Total, Acciones
   - **Acciones del usuario**: Filtrar por fecha/canal/estado, cambiar estado, ver detalle, imprimir
   - **Navegación desde**: `/sales`, CTA Nav
   - **Estados**: loading → ready

3. **Formulario nueva venta** (`src/pages/sales/new.astro`)
   - **Propósito**: Crear una nueva venta (Live o WhatsApp)
   - **Datos que muestra**: Campos cliente, producto, fecha, costo, método pago, tarjeta→banco, categorías, adicionales (tabla donut)
   - **Acciones del usuario**: Seleccionar tipo (Live/WhatsApp), llenar campos, agregar ítems adicionales, registrar venta
   - **Navegación desde**: `/sales` (CTAs "Venta en tienda" y "Venta por Live")
   - **Estados**: loading → success → navigateTo('/sales')

4. **Detalle / Factura** (`src/pages/sales/[id].astro`)
   - **Propósito**: Ver detalles de una venta específica e imprimir factura
   - **Datos que muestra**: Resumen de factura, renglones, total, botón pagar, botón imprimir, botón cambiar estado
   - **Acciones del usuario**: Pagar, cambiar estado, imprimir, cerrar
   - **Navegación desde**: `/sales` (ver detalle desde tabla), `/sales/new` (después de registrar)
   - **Estados**: loading → ready

5. **Listado de paquetes** (`src/pages/packages/index.astro`)
   - **Propósito**: Ver listado de paquetes (estructura similar a ventas)
   - **Datos que muestra**: Tabla con datos de paquetes, filtros, paginación
   - **Acciones del usuario**: Filtrar, ver detalle
   - **Navegación desde**: Nav → Packages

6. **Listado de gastos** (`src/pages/expenses/index.astro`)
   - **Propósito**: Ver listado de gastos registrados
   - **Datos que muestra**: Tabla con gastos, categorías, montos, fechas
   - **Acciones del usuario**: Filtrar, nuevo gasto
   - **Navegación desde**: Nav → Expenses

7. **Listado de clientes** (`src/pages/customers/index.astro`)
   - **Propósito**: Ver listado de clientes
   - **Datos que muestra**: Tabla con nombres, contacto, ventas asociadas
   - **Acciones del usuario**: Filtrar, nuevo cliente
   - **Navegación desde**: Nav → Customers

8. **Login** (`src/pages/login.astro`)
   - **Propósito**: Acceso al sistema
   - **Campos**: email, password, botón Ingresar
   - **Persistencia**: Sesión en `localStorage`
   - **Navegación desde**: Acceso directo

9. **Página offline** (`src/pages/offline.astro`)
   - **Propósito**: Mostrada cuando SW detecta sin conexión
   - **Activación**: Service Worker cuando navega sin internet

10. **404** (`src/pages/404.astro`)
    - **Propósito**: Ruta no encontrada
    - **Activación**: Cualquier URL que no coincida con las rutas definidas
```

## Estados de pantalla

- **loading**: Datos aún cargando, mostrar skeletons o mensaje
- **empty**: No hay datos en el rango/filtro seleccionado, acción "Registrar primera venta" → `/sales/new?type=live`
- **ready**: Datos disponibles, UI completa
- **error**: Fallo en API o carga, mostrar mensaje con posibilidad de reintentar