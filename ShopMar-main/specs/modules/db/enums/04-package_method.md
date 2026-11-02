# `package_method` — Método de transporte

## Valores

| Valor | Significado | Etiqueta en el panel |
|-------|-------------|---------------------|
| `cargotrans` | El paquete se entrega a través del servicio de transporte Cargotrans. | "Cargotrans" |
| `delivery` | El paquete se entrega con el servicio de reparto propio de la tienda. | "Delivery" |
| `retiro` | El cliente retira el paquete en el local. | "Retiro" |

```prisma
enum package_method {
  cargotrans
  delivery
  retiro
}
```

## Dónde se usa

| Ubicación | Uso |
|-----------|-----|
| `model package` | Columna `method`, obligatoria. Sin índice declarado. |
| `POST /api/v1/packages` | Obligatorio en el cuerpo. Validado por `CreatePackageDtoSchema` con `z.enum(["cargotrans", "delivery", "retiro"])`. |
| `PUT /api/v1/packages/:id` | Obligatorio. `UpdatePackageDtoSchema` comparte el mismo enum, así que un paquete siempre tiene método. |
| `GET /api/v1/packages` | Filtro opcional `?method=cargotrans`, `?method=delivery` o `?method=retiro`, validado por `PackagesQuerySchema`. |
| Frontend | Campo de selección del formulario de paquete y columna "Método" del listado de paquetes. |

## `cargotrans` es el nombre del transportista

El valor `cargotrans` es el nombre comercial del servicio de transporte que usa la tienda, en minúsculas porque los valores del enum están en `snake_case`. No es una categoría genérica de "transportista": es el nombre de la empresa.

Esa decisión tiene una consecuencia que conviene tener presente: si la tienda empieza a trabajar con un segundo transportista, **el enum se queda corto**. Agregar `otro_transportista` es una migración de una sentencia y una opción más en el formulario, pero el campo deja de describir una categoría y pasa a ser un catálogo de proveedores. Ese es el momento en que el modelo correcto sería `package.carrier` como texto libre, igual que `package.name`, con el enum únicamente para el medio (`delivery`, `retiro`, `transportista`).

La versión 1 asume un solo transportista porque es la realidad actual del negocio. La migración futura es un `ALTER TYPE` y no una reconstrucción de tablas.

## Sin índice

`method` no tiene índice declarado. Sí es un filtro de `GET /api/v1/packages`, pero sobre una tabla cuyo volumen es el más bajo del modelo y cuyo rango de fechas ya está acotado por `package_date`. Si el volumen de paquetes crece, el índice se agrega en ese momento, no antes.

## Sin estado de entrega

Los tres valores describen **cómo** sale el paquete, no **si** ya salió. `package_method` no dice si el paquete está en la calle o ya fue entregado, y `package` no tiene columna de estado.

El indicador "paquetes pendientes" del dashboard no puede usar este enum para distinguir un paquete entregado de uno pendiente. Su definición en la versión 1 es "registrado y no borrado lógicamente", y la reserva está documentada en la decisión D-007, que también describe qué se agregaría (`package.status` con valores `pending` y `delivered`) y qué impacto tendría en la API: un campo más en el recurso y un filtro más en el listado.
