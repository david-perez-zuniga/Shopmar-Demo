# 13 — PWA sin conexión: service worker, caché y aviso de versión

## Estado Actual

El panel ya se instala y se abre como aplicación (tarea 12), pero cada pantalla sigue dependiendo de la red para dos cosas distintas: el armazón, que es inmutable, y los datos, que los pide el navegador a la API con `fetch` desde `src/lib/api.ts:31`.

Hoy un corte de red se ve así:

- la navegación a una pantalla nueva falla si el archivo no está en la caché del navegador;
- las pantallas que ya se abrieron muestran su estado de error porque cada `fetch` devuelve `ApiError("NETWORK_ERROR", 0)` (`src/lib/api.ts:35`).

No hay service worker: `frontend/public/` no tiene `sw.js` y `dist/` no tiene ningún archivo de Workbox ni de caché.

Dos hechos del proyecto condicionan el diseño:

- Los nombres de los archivos del build llevan el hash del contenido (`dist/_astro/`), así que una copia guardada de un asset no puede quedar vieja. Eso permite usar caché primero sin riesgo y sin lista de precarga.
- El detalle de cada venta es una sola página estática (`/sales/detail?id=<uuid>`, D-017): la ruta existe siempre y el `id` viaja en la query que lee el cliente. La estrategia de navegación igual no guarda un 404, y busca en la caché con `ignoreSearch: true` para no guardar una copia del mismo shell por venta.

## Objetivo

Que un corte de red no se vea como una pantalla de error: la aplicación tiene que abrir, y las pantallas tienen que mostrar el último dato conocido con un aviso claro de que es viejo. Y que una versión nueva se avise, nunca se imponga.

## Alcance

- `frontend/public/sw.js` (nuevo)
- `frontend/src/pages/offline.astro` (nuevo)
- `frontend/src/lib/pwa.ts` (nuevo) y su prueba
- `frontend/src/layouts/Layout.astro` (el registro del service worker y el aviso de versión nueva)
- `frontend/src/lib/api.ts` (leer el encabezado que marca una respuesta servida desde la caché)
- `frontend/src/components/TableState.astro` o el aviso de estado que ya usan las pantallas (el aviso de datos viejos)
- `specs/modules/frontend/08-pwa.md` (la propuesta que gobierna esta tarea)

## Fuera de alcance

| Lo que no se hace | Por qué |
|---|---|
| Registrar ventas sin conexión y sincronizar después | Exige cola local, idempotencia en la API y una regla de conflictos escrita. Sin esa regla el mismo pedido puede duplicarse o perderse, y eso es peor que un error visible. Propuesta aparte. |
| Interceptar `POST`, `PUT`, `PATCH` o `DELETE` | Un alta no se puede reintentar sola. El service worker no toca ningún pedido que no sea `GET`. |
| Sincronización en segundo plano y notificaciones push | Dependen de la cola de escritura, que no existe. |
| Precargar todo el build | La lista de precarga agrega valor cuando hay cientos de assets. Acá el shell es chico y los nombres ya están hasheados: alcanza con estrategias en tiempo de ejecución. |
| Cambiar la compilación estática | La decisión D-005 sigue en pie. |
| Borrar la caché desde la interfaz | No hay un caso de uso real, y un botón que rompe la aplicación sin red es un riesgo innecesario. |

## Tareas

1. **Escribir `frontend/public/sw.js`** con estas piezas, en este orden:
   - una constante `VERSION` que se sube en cada despliegue; es lo que hace que el navegador detecte una versión nueva;
   - `install`: guardar en la caché la pantalla `/offline` y los estáticos del armazón que no llevan hash (`/favicon.svg`, `/manifest.webmanifest`, los íconos). No llamar a `skipWaiting` acá: la actualización espera a que la persona la acepte;
   - `activate`: borrar las cachés de versiones anteriores y quedarse con los clientes existentes;
   - `fetch`: el enrutado de la tabla de estrategias de la propuesta;
   - `message`: escuchar el pedido de activación inmediata que manda la pantalla cuando la persona acepta la versión nueva.

2. **Implementar las estrategias de caché** exactamente como están en la propuesta, sin ampliarlas:
   - navegación: red primero con un tope de 3 segundos, después la copia guardada de esa misma dirección, y si no hay nada, `/offline`;
   - `/_astro/*`: caché primero;
   - `favicon.svg`, `icons/*` y `manifest.webmanifest`: caché primero;
   - `GET` a la API: red primero con un tope de 2,5 segundos y, si falla, la última respuesta guardada;
   - cualquier otro método: se deja pasar sin tocarlo;
   - **ninguna respuesta con estado 400 o mayor se guarda nunca**, y la navegación nunca responde con un 404 guardado.

3. **Marcar las respuestas que salen de la caché.** Cuando la respuesta viene de la caché, el service worker reconstruye el objeto `Response` y le agrega un encabezado propio. `src/lib/api.ts` lo lee y expone en el resultado si el dato es viejo. Es la única forma de que la pantalla pueda decir la verdad sobre lo que muestra.

4. **Crear `frontend/src/pages/offline.astro`**, una pantalla mínima dentro del armazón: el título, una línea que explique que no hay conexión, y un botón para volver a intentar. Reutiliza los avisos de estado que ya existen en el panel en vez de inventar un estilo nuevo. Esta ruta es la única que se precarga en el paso 1, así que tiene que poder abrirse sin red y sin datos.

5. **Crear `frontend/src/lib/pwa.ts`** con la lógica separada de lo que toca el navegador:
   - registrar el service worker;
   - detectar que hay una versión nueva esperando y exponer el estado;
   - avisar a la pantalla cuando cambia el estado de la conexión;
   - activar la versión nueva solo cuando la persona lo pide, y recargar después.
   Las decisiones (¿corresponde avisar?, ¿corresponde activar?) van como funciones puras para poder probarlas; el registro y los eventos quedan en la parte que necesita el navegador.

6. **Mostrar el aviso de versión nueva** en `src/layouts/Layout.astro`, dentro del armazón del panel: un aviso con un botón que diga qué pasa y qué va a suceder al usarlo. Nunca recargar solo: una venta a medio cargar no se puede perder porque hubo un despliegue.

7. **Mostrar el aviso de datos viejos** en las pantallas que consumen la API: un texto discreto, siempre en el mismo lugar, cuando la respuesta vino de la caché. El aviso tiene que decir de cuándo son los datos, no solo que hay un problema.

8. **Probar la lógica pura** en `frontend/src/lib/pwa.test.ts`: que corresponde avisar cuando hay una versión esperando, que no corresponde si no la hay, que activar solo sucede tras el pedido, y la lectura del encabezado de la caché en `api.ts`.

9. **Verificar todo** con los comandos del último apartado.

## Criterios de Done

1. `cd frontend && pnpm build` termina y `dist/sw.js` y `dist/offline/index.html` existen.
2. `node --check frontend/public/sw.js` no reporta error de sintaxis.
3. El service worker registrado cubre el origen completo y no hay un segundo service worker de otra ruta: `grep -c 'serviceWorker.register' dist/_astro/*.js` da un solo archivo, y la ruta registrada es `/sw.js`.
4. Las estrategias son las de la propuesta: `grep -c 'skipWaiting' frontend/public/sw.js` da una sola aparición, dentro del manejador de mensajes, y `grep -cE 'POST|PUT|PATCH|DELETE' frontend/public/sw.js` no aparece en el enrutado de `fetch`.
5. Ninguna respuesta de error se guarda: `grep -n 'response.ok\|status >= 400' frontend/public/sw.js` muestra la comprobación antes de cada `cache.put`.
6. `pnpm test` sigue verde con las pruebas nuevas de `pwa` y de la lectura del encabezado.
7. **Prueba manual en el navegador**, que es la única que demuestra el objetivo: con el panel abierto, activar el modo avión; abrir una pantalla nueva y confirmar que aparece `/offline` en lugar del error del navegador; volver a una pantalla ya visitada y confirmar que muestra los últimos datos con el aviso de que son viejos; desactivar el modo avión y confirmar que el aviso desaparece y los datos se actualizan.
8. **Prueba manual de actualización**: publicar un build con la `VERSION` cambiada, recargar y confirmar que aparece el aviso de versión nueva, que nada se recarga solo, y que al aceptar se activa la versión nueva y la pantalla queda en la versión nueva.
9. En el teléfono del local, repetir el punto 7 con el wifi apagado y encendido.
