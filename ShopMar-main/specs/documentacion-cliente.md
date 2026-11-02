# Documentación para el cliente — Shpr

## Introducción

Shpr es un sistema de control para una tienda de ropa de segunda mano. Nace de una necesidad muy concreta: cuando se vende una prenda usada, no hay un precio de lista al que recurrible ni un código de barras que escanear. Cada prenda vale lo que alguien pagó por ella y lo que otra persona está dispuesta a pagar hoy, y las dos cifras cambian con cada venta.

El sistema reemplaza el cuaderno y la memoria con una sola herramienta que registra dos cosas que la dueña necesita saber todos los días: **cuánto entró y cuánto salió**. Cada venta queda guardada con su cliente, la prenda, el importe recibido y la forma de pago. Cada gasto de la tienda —el flete de un envío, el alquiler del mes, un café— queda guardado con su concepto y su valor. Con esos dos registros, el resumen del día responde la única pregunta que importa a fin de jornada: cuánto quedó.

Lo que el sistema **no** hace es también una decisión, y vale la pena explicarla. No hay catálogo de productos, porque una prenda usada no se repite: no tiene código, no tiene stock y no tiene un precio único. No hay inventario que controla, porque cada prenda se vende una sola vez. No hay sistema de usuarios, contraseñas ni perfiles, porque la tienda tiene una sola persona a cargo y un login solamente agrega una barrera entre ella y su trabajo. Tampoco hay integración con bancos, con la plataforma de mensajes ni con el sistema de facturación electrónica: el sistema registra lo que pasó en la tienda, y cada una de esas conexiones es una decisión aparte para el futuro.

**¿Qué resuelve?**

- **Sabe cuánto entró en caja** en el día, el mes o el rango que se elija, sin sumar columnas a mano. La cuenta suma las ventas pendientes y las completadas, y **no** suma las canceladas: si la venta se canceló es porque el dinero no entró, y dejarlo inflando el total haría que el mes cerrara mal.
- **Sabe cuánto se gastó**, con el concepto de cada gasto guardado junto al valor, para saber en qué se fue el dinero.
- **Distingue el ingreso de la prenda del ingreso de los artículos adicionales** de la misma venta, que es donde suelen aparecer las diferencias de caja.
- **Registra una venta de mostrador y una venta por WhatsApp en la misma pantalla**, con los artículos que se vendieron juntos.
- **Deja saber cuántos envíos están registrados y no se han cerrado**, que es el número que se pierde cuando todo está anotado en cuadernos distintos.
- **Genera una factura imprimible** de cualquier venta, sin volver a armarla a mano.
- **Permite cancelar una venta** sin borrarla, para que el historial siga estando y el número deje de contarla. Cancelar es definitivo: una venta cancelada no vuelve a cambiar de estado.
- **Evita el error más caro de este negocio**: que un artículo se registre con el canal equivocado y que no haya forma de corregirlo después.

## Visión General del Sistema

El sistema tiene cinco etapas en su ciclo de vida, todas dentro del mismo día de trabajo.

1. **Registrar la venta.** La dueña elige si la venta fue en mostrador o coordinada por WhatsApp, escribe el cliente, la prenda, el importe recibido y, si aplica, el banco con el que se cobró. En el caso de WhatsApp puede agregar los artículos que se vendieron juntos, y el sistema calcula el total.
2. **Registrar los envíos pendientes.** Cuando una venta incluye un paquete, se anota el envío con su método —Cargotrans, delivery o retiro en punto— y se lo vincula a la venta. Si el envío todavía no tiene una venta, se registra igual.
3. **Registrar los gastos del día.** Cada salida de dinero se anota con su concepto y su valor: fletes, alquiler, servicios, lo que haga falta.
4. **Consultar el resumen.** El tablero muestra cuatro cifras: ingresos totales, cantidad de ventas, gastos totales y envíos registrados. Se puede filtrar por rango de fechas.
5. **Revisar y corregir.** Cualquier venta se puede consultar en detalle, imprimir como factura y cambiar de estado —de pendiente a completada, o a cancelada si algo salió mal. Los envíos y los gastos se pueden eliminar del registro cuando ya no corresponden.

### Roles

| Rol | ¿Qué puede hacer? |
|-----|-------------------|
| **Dueña del negocio** | Todo. Es la única persona con acceso al sistema. Registra ventas, envíos y gastos, consulta el resumen, imprime facturas, cambia el estado de una venta y elimina envíos o gastos mal registrados. |

No hay otros roles. El sistema está diseñado para que lo use una sola persona, y esa decisión evita tanto el costo de construir un sistema de permisos como el riesgo de que quede mal configurado y alguien vea lo que no debería.

## Cómo está organizado el sistema

El sistema tiene dos partes separadas que se comunican por internet.

**El backend** es el que guarda y organiza la información. Está construido en capas, y la razón es práctica: cada capa hace una sola cosa.

- Una capa recibe la petición y **verifica que los datos que llegan sean válidos**. Si alguien escribe un importe con letras, esa capa lo rechaza antes de que llegue a la base de datos.
- Una capa contiene **las reglas del negocio**. Acá está el conocimiento de que una venta en tarjeta necesita banco, que una venta por WhatsApp admite artículos extra y una de mostrador no, o que una venta cancelada no cuenta en el resumen y no se puede volver atrás. Estas reglas están escritas una sola vez, no repetidas en cada pantalla.
- Una capa **habla con la base de datos**. Solo esta capa sabe que existen tablas y registros.
- Una capa **traduce la respuesta** al formato que espera la pantalla, incluyendo el cálculo del total de cada venta.

La ventaja de separarlas es que las reglas se pueden probar sin levantar la base de datos, y que la base de datos se puede cambiar sin reescribir las reglas. En la práctica, significa que un error en el formato de un importe se detecta en una prueba automática y no en una caja desbalanceada a fin de mes.

**El frontend** es la pantalla que usa la dueña. Tiene una página por función —ventas, paquetes, gastos y resumen— y tres reglas de organización:

- **El estado de cada pantalla vive en la dirección de la página.** Cuando se filtra por mes, la dirección de la pantalla cambia. Eso permite compartir el enlace, recargar sin perder el filtro y usar el botón de atrás del navegador.
- **No hay un almacén de datos global.** Cada pantalla tiene lo que necesita y nada más. Para un sistema de esta escala, un estado compartido sería una fuente de errores sin ningún beneficio.
- **Los datos se piden al backend cada vez que se abre una pantalla.** No hay caché: una venta que se registra en otra pestaña tiene que verse al instante al cambiar de pantalla.

## Tecnologías Utilizadas

### Backend

| Tecnología | ¿Para qué se usa? |
|------------|-------------------|
| Node.js | El entorno donde corre el servidor. |
| Fastify | El servidor web que recibe las peticiones de la pantalla. |
| TypeScript | Un lenguaje que obligue a describir los datos correctamente, para que los errores de forma aparezcan al escribir el código y no en producción. |
| Zod | La librería que valida lo que llega de la pantalla antes de que toque la base de datos. |
| Drizzle | La capa que traduce las tablas de la base de datos a código y mantiene las dos cosas sincronizadas. |
| PostgreSQL | La base de datos donde queda todo guardado. |
| Pino | El registro de eventos del servidor, que permite saber qué pasó cuando algo falla. |
| Vitest | El motor de pruebas automáticas del backend. |

### Frontend

| Tecnología | ¿Para qué se usa? |
|------------|-------------------|
| Astro | El generador de la pantalla. Produce páginas estáticas, que cargan rápido y no necesitan un servidor propio. |
| TypeScript | Igual que en el backend, para que los datos estén bien descritos. |
| Lucide | La biblioteca de íconos de la interfaz. |
| CSS nativo | Los colores, las medidas y los estilos se escriben directamente, sin ninguna librería externa. |
| Vitest y jsdom | Las pruebas automáticas del formateo de dinero, de fechas y de la conexión con el backend. |
| Playwright | El programa que, como un encargado paciente, recorre la pantalla completa —registrar una venta, cancelarla, imprimir la factura, ver el resumen— y deja capturas y grabaciones de lo que encontró. No funciona dentro de la pantalla: es un control de calidad aparte que la verifica por fuera. |

### Infraestructura

| Tecnología | ¿Para qué se usa? |
|------------|-------------------|
| pnpm | El gestor de paquetes de los dos proyectos. |
| pnpm workspaces | El proyecto único que contiene el backend y el frontend. |
| Git | El control de versiones del proyecto. |
| tsx | Para ejecutar los scripts de respaldo y verificación de la base de datos. |

La base de datos se ejecuta en la máquina donde se desarrolla. No hay contenedores, ni servidor de aplicación en la nube, ni automatismos de despliegue: el sistema se levanta en local, se publica el frontend como archivos estáticos y el backend corre como un proceso de Node.

## Base de Datos

La base de datos tiene cuatro tablas, agrupadas en dos temas.

| Grupo | Tablas que incluye |
|-------|-------------------|
| **Ventas** | `sale` (las ventas) y `additional_sale` (los artículos adicionales que se vendieron junto a una venta) |
| **Movimientos de dinero** | `expense` (los gastos de la tienda) y `package` (los envíos) |

### Algunas reglas importantes

- **Cada registro tiene un identificador único** con el formato de un código Universal, que no se repite nunca.
- **Cada tabla tiene tres marcas de tiempo**: cuándo se creó el registro, cuándo se modificó por última vez, y cuándo se eliminó. Son automáticas: el sistema las escribe solo.
- **Nada se borra de verdad.** Cuando se elimina un envío o un gasto, el registro queda marcado como eliminado y deja de aparecer. Esto es importante: permite saber que algo existió sin que desaparezca de la historia.
- **Las fechas de negocio llevan la hora y la zona.** La fecha de una venta es un instante real, en cualquier parte del mundo donde se lea va a ser el mismo momento.
- **Los importes se guardan con exactamente dos decimales** y nunca como número con decimales flotantes. Esta es una decisión técnica con impacto directo en el negocio: un importe guardado como número puede sumar veinte veces y dar un centavo de diferencia, y cuando eso pasa ya no se sabe de dónde salió.
- **El total de una venta no está guardado.** Se calcula cada vez sumando el importe de la prenda más los de sus artículos. Por esa razón, es imposible que el total guardado quede desactualizado.
- **El estado de una venta tiene tres valores**: pendiente, completada o cancelada. Cancelar no borra nada: el registro sigue existiendo y el total de esa venta no cambia. Lo que cambia es que la venta sale del resumen, y que su estado ya no se puede modificar.
- **El método de pago tiene solo dos valores**: efectivo o tarjeta. Si se cobra con tarjeta, es obligatorio anotar el banco. La base de datos lo impide, no la aplicación.
- **Un envío puede no tener venta asociada**, que es el caso normal de un paquete que sale sin haber vendido la prenda. Y un envío nunca queda con una venta inexistente: si la venta se elimina, el envío queda desvinculado, no roto.
- **No hay dos registros con la misma combinación de campos.** No hay restricciones de unicidad en ninguna tabla, porque la misma persona puede comprar el mismo día, y dos prendas pueden llamarse igual.

## Módulos Principales del Sistema

El sistema tiene cuatro módulos de negocio.

### Ventas

Es el módulo central. Registra una venta con su cliente, la prenda vendida, el importe recibido, la forma de pago, la fecha y su estado. Distingue entre venta de mostrador y venta coordinada por WhatsApp, y en el segundo caso admite los artículos que se vendieron juntos. Permite consultar la lista de ventas filtrando por fechas, tipo y estado, ver el detalle de una cualquiera, e imprimirla como factura. El cambio de estado es la única modificación: una venta cobrada no se edita, porque cambiar un importe que ya se cobró hace que el sistema deje de reflejar lo que el cliente pagó.

### Envíos

Registra las salidas de paquete con su método —Cargotrans, delivery o retiro en punto— y su fecha. Cada envío puede vincularse a una venta, y esa vinculación se puede cambiar o quitar. En la lista no hay un estado de "entregado", y esa es una decisión consciente: cuando un envío deja de importar, se elimina del registro y deja de contar, en lugar de acumularse durante meses como algo pendiente.

### Gastos

Registra las salidas de dinero de la tienda con su concepto, su descripción opcional, su importe y su fecha. No hay categorías cerradas ni tipos de gasto: la dueña escribe lo que quiera, porque el concepto de un gasto real no siempre cabe en una lista. Un gasto mal registrado se elimina y se vuelve a crear, en lugar de editarse, para que el resumen nunca muestre una cifra que cambió sin dejar rastro.

### Resumen

Agrega las cuatro cifras que resumen la operación: ingresos totales, cantidad de ventas, gastos totales y cantidad de envíos registrados. Todas se pueden filtrar por rango de fechas. Los ingresos tienen una decisión importante: **se calculan sumando el importe de cada venta más el de sus artículos adicionales**, y las ventas pendientes cuentan porque se pueden cobrar hoy, pero **las canceladas no cuentan**, ni en el importe ni en la cantidad de ventas. El número que se ve es el total real que entró a la caja, no el total de las ventas que quedaron bien.

## Pantallas Principales

El sistema tiene una sola zona de trabajo, el panel, con cuatro pantallas.

### Panel de trabajo

| Pantalla | ¿Para qué sirve? |
|----------|------------------|
| **Resumen** (`/`) | Las cuatro cifras del negocio, con filtro de fechas. Es la pantalla de inicio. |
| **Ventas** (`/sales`) | La lista de todas las ventas con sus filtros, y el cambio de estado de cada una directamente en la lista. Desde acá se accede al detalle. |
| **Detalle de venta** (`/sales/detail?id={id}`) | Toda la información de una venta: cliente, prenda, pago, artículos, envíos y total. Desde acá se imprime la factura. Los enlaces viejos a `/sales/{id}` muestran una pantalla que devuelve a Ventas. |
| **Nueva venta** (`/sales/new`) | El formulario de alta. La misma pantalla para las ventas de mostrador y las de WhatsApp, con la diferencia de que la segunda admite artículos adicionales. |
| **Paquetes** (`/packages`) | La lista de envíos con su filtro por fecha y método, con el alta, la edición y la eliminación. |
| **Nuevo o editar paquete** (`/packages/new`) | El formulario del envío, con la posibilidad de vincularlo a una venta existente o dejarlo sin venta. |
| **Gastos** (`/expenses`) | La lista de gastos con su filtro por fechas, con el alta y la eliminación. |
| **Nuevo gasto** (`/expenses/new`) | El formulario de alta de un gasto. |

No hay pantalla pública, ni pantalla de acceso, ni configuración, ni administración de usuarios.

## Autenticación y Seguridad

**El sistema no tiene inicio de sesión.** Quien abre la dirección del panel entra directamente a las pantallas. No hay usuarios, ni contraseñas, ni sesiones, ni recuperación de contraseña.

Esto es una decisión de diseño y conviene entender por qué. El sistema está pensado para que lo use una sola persona, la dueña, desde su propio equipo. Un login agregaría un paso diario sin impedir ningún acceso real: quien tiene la computadora ya tiene todo. Agregar usuarios sin un motivo concreto también traería el riesgo de configurar mal los permisos y dejar información sensible a la vista de alguien que no debería verla.

La seguridad, entonces, no está en quién entra, sino en **qué se guarda y cómo**:

- **Los datos de la tienda no salen de la base de datos.** No hay conexión con bancos, ni con plataformas de mensajes, ni con servicios de pago.
- **Los errores internos nunca se muestran completos en pantalla.** Cuando algo falla, la dueña ve un mensaje simple y el detalle técnico queda en el registro del servidor. Mostrar el error real ayuda a quien desarrolla y no ayuda a quien vende.
- **Los datos se borran marcándolos, no eliminándolos.** Un envío o un gasto eliminado no se puede recuperar desde la pantalla, pero el registro queda en la base de datos. Para una herramienta de este tamaño, esa diferencia importa si algún día hay que auditar.
- **La base de valida las reglas por su cuenta.** No es posible guardar una venta con tarjeta sin banco, ni un gasto con importe negativo, aunque se intente saltarse la pantalla. La validación está en la base, no solo en el formulario.
- **Se hace un respaldo de la base de datos antes de cualquier cambio**, y el respaldo se verifica antes de darla por bueno.
- **Una copia del respaldo se guarda en un equipo o servicio de internet que la dueña elija.** El sistema genera el respaldo, pero dónde se conserva es una decisión suya, y conviene tomarla antes de necesitarlo.

## Servicios Externos

**El sistema no se conecta con ningún servicio externo.** No hay pasarelas de pago, ni facturación electrónica, ni correo, ni redes sociales, ni servicios de envío con los que sincronizar. Registra Cargotrans, delivery y retiro como texto, no como integración.

Esto es deliberado. Cada conexión externa necesita una clave de API, un acuerdo con el proveedor, un manejo de errores adicional y un camino de Contingencia para cuando el proveedor falle. Ninguno de esos costos se justifica para una tienda que necesita registrar lo que ya le ocurrió.

Cargar la mercadería de una tienda virtual, emitir facturas electrónicas o avisar automáticamente a un cliente por WhatsApp son posibles mejoras futuras. Cada una es un proyecto aparte, y ninguna tiene sentido hasta que la otra esté funcionando y en uso diario.

## Flujos Principales del Sistema

### Flujo 1 — Registrar una venta en el mostrador

1. La dueña entra a la pantalla de ventas y aprieta "Nueva venta".
2. La pantalla abre en modo mostrador, que es el canal de una venta de local. La elección del canal viene de la dirección de la pantalla, no de un botón que se pueda apretar mal.
3. Escribe el nombre del cliente y qué se vendió.
4. Elige cómo cobró: efectivo o tarjeta. Si eligió tarjeta, aparece un campo para el banco, y es obligatorio. Si vuelve a efectivo, el campo desaparece y se limpia solo.
5. Revisa la fecha, que viene puesta con el día de hoy, y el estado, que viene como "pendiente" hasta que la venta se cobre.
6. Escribe el importe recibido.
7. Aprieta "Guardar" y el sistema abre el detalle de la venta recién creada, donde se ve el total y se puede imprimir la factura.

### Flujo 2 — Registrar una venta por WhatsApp con artículos

1. La dueña entra a "Nueva venta" desde el enlace de WhatsApp, y la pantalla abre en ese modo.
2. Escribe el cliente, la prenda, el importe, la forma de pago y la fecha, igual que en el mostrador.
3. Aprieta "Agregar artículo" las veces que necesite. Cada artículo tiene nombre, cantidad, importe y una descripción opcional.
4. El sistema le muestra un total estimado mientras escribe, que es solo una ayuda visual.
5. Aprieta "Guardar". La venta y sus artículos se registran **juntos o ninguno**: si algo falla, no queda una venta sin sus artículos ni artículos sin su venta.
6. El sistema abre el detalle, con el total real calculado y la factura lista para imprimir.

### Flujo 3 — Registrar un envío

1. La dueña entra a la pantalla de envíos y aprieta "Nuevo envío".
2. Escribe qué se envía y elige el método: Cargotrans, delivery o retiro en punto.
3. Elige la venta a la que corresponde, si ya existe. Si todavía no se registró la venta, deja la opción en blanco y el envío queda sin vincular.
4. Aprieta "Guardar" y vuelve a la lista de envíos.

### Flujo 4 — Registrar un gasto del día

1. La dueña entra a la pantalla de gastos y aprieta "Nuevo gasto".
2. Escribe el concepto con sus propias palabras, por ejemplo "Flete Bogotá a Medellín".
3. Agrega una descripción si hace falta.
4. Escribe el importe y revisa la fecha, que viene con el día de hoy.
5. Aprieta "Guardar" y vuelve a la lista, con el filtro de fechas que estaba usando.

### Flujo 5 — Cancelar una venta

1. Desde la lista de ventas, la dueña cambia el estado de una venta a "cancelada".
2. El sistema le pide confirmación, porque cancelar no es lo mismo que cambiar un dato menor.
3. La venta queda marcada como cancelada y **sale del resumen**: deja de sumar en el importe y en la cantidad de ventas, y sus artículos adicionales tampoco cuentan.
4. La venta **no desaparece**: el registro sigue en la lista, con su total intacto, para que quede registro de que existió.
5. La cancelación es definitiva. En la lista, esa fila ya no muestra el selector de estado y dice que el estado no se puede cambiar. Si la venta se cobró de verdad y se canceló por error, la forma de corregirlo es registrar una venta nueva.

## Casos de Uso por Tipo de Usuario

### Dueña del negocio

**Al empezar el día:**

- Consultar cuánto se facturó ayer y cuántos envíos están registrados.
- Filtrar el resumen por el mes para ver cómo viene el mes.

**Durante el día:**

- Registrar una venta de mostrador con el cliente, la prenda y el importe recibido.
- Registrar una venta de WhatsApp con varios artículos juntos.
- Anotar un envío y vincularlo a la venta a la que corresponde.
- Registrar un gasto con su concepto y su valor.
- Consultar el detalle de una venta cuando necesita confirmar un dato con una clienta.

**Al cerrar el día:**

- Revisar el resumen y comparar los ingresos con los gastos.
- Marcar como completadas las ventas que ya cobraron.
- Imprimir la factura de una venta.
- Eliminar un gasto o un envío que se registró por error.

**Cuando algo sale mal:**

- Cancelar una venta mal registrada, sin perder el historial.
- Ver qué índice de datos se registró mal y corregirlo desde la pantalla.
- Revisar los gastos de un mes concreto para entender en qué se fue el dinero.

## Resumen General del Sistema

| Aspecto | Detalle |
|---------|---------|
| **Módulos de negocio** | 4: ventas, envíos, gastos y resumen |
| **Módulos técnicos** | 2: backend y frontend |
| **Pantallas** | 8 rutas, que cubren 9 pantallas (una de ellas se usa en dos modos) |
| **Peticiones a la API** | 13 |
| **Tablas de base de datos** | 4 |
| **Índices de base de datos** | 8 |
| **Roles de usuario** | 1 |
| **Sistema de permisos** | No existe, y es intencional |
| **Inicio de sesión** | No existe, y es intencional |
| **Integraciones con servicios externos** | 0 |
| **Tecnología del backend** | Node.js, Fastify y TypeScript |
| **Tecnología de la base de datos** | PostgreSQL, con Drizzle como capa de acceso |
| **Tecnología del frontend** | Astro, con CSS nativo y sin frameworks de interfaz |
| **Importe de referencia** | No hay pagos dentro del sistema |
| **Forma de pago registrada** | Efectivo o tarjeta con banco, como dato de la venta |
| **Borrado de registros** | Lógico: el registro queda marcado y deja de aparecer |
| **Respaldo de la base de datos** | Manual, verificado y previo a cualquier cambio |
| **Pruebas automáticas** | Sí, en backend y frontend |
