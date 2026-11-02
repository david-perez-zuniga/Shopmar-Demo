# 12 — PWA instalable: manifiesto, íconos y metadatos

## Estado Actual

El panel se compila de forma estática y se sirve como archivos. Hoy no tiene ninguna marca de aplicación instalable:

- `frontend/public/` contiene un solo archivo, `favicon.svg`, que es un SVG de 24 unidades con la camiseta. No hay manifiesto, ni íconos rasterizados, ni service worker.
- La cabecera de `src/layouts/Layout.astro` tiene un único `meta` de viewport (`Layout.astro:21`), sin `viewport-fit=cover`. No hay `theme-color`, ni `apple-touch-icon`, ni `apple-mobile-web-app-*`.
- Ninguna hoja de estilos usa `env(safe-area-inset-*)`. El armazón de `src/components/Nav.astro` es fijo en los cuatro bordes: la barra lateral de 232px (`--shell-sidebar`), la barra superior y el cajón. En un teléfono con muesca o con esquinas redondeadas, esos elementos quedan recortados.
- El tema lo elige el usuario y se guarda en `localStorage` (`src/lib/theme-toggle.ts`), así que puede no coincidir con la preferencia del sistema.

Los dos colores del panel están declarados en `src/styles/global.css`: `#f8f9ff` en claro y `#0b121a` en oscuro.

**Prerrequisito que no es código:** el panel tiene que servirse por HTTPS para que la aplicación se pueda instalar. Servido por IP en la red del local sobre HTTP, el navegador no habilita el registro del service worker ni la instalación. El origen previsto está documentado en `specs/modules/backend/04-security.md:150` como `https://panel.tienda.local`, y la API tiene que hablar el mismo esquema o el panel tendrá contenido mixto bloqueado.

## Objetivo

Que el panel se instale en el teléfono del local y se abra desde su propio ícono, en pantalla completa, con su nombre y sus colores, sin elementos del armazón recortados por la pantalla.

## Alcance

- `frontend/public/manifest.webmanifest` (nuevo)
- `frontend/public/icons/` (nuevo: cuatro PNG)
- `frontend/src/layouts/Layout.astro` (los `meta` nuevos)
- `frontend/src/lib/install-prompt.ts` (nuevo) y su prueba
- `frontend/src/components/Nav.astro` (el botón de instalar y el aviso del gesto de iOS)
- `frontend/src/lib/theme-toggle.ts` (mantener `theme-color` al cambiar de tema)
- `frontend/src/styles/global.css` (áreas seguras)
- `specs/modules/frontend/08-pwa.md` (la propuesta que gobierna esta tarea)

## Fuera de alcance

| Lo que no se hace | Por qué |
|---|---|
| El service worker y la caché | Es la tarea 13. Esta primera fase se verifica sin service worker. |
| Servir el panel por HTTPS | Es infraestructura del host, no del repositorio. Acá solo se verifica y se documenta. |
| Registrar ventas sin conexión | Necesita cola local, idempotencia en la API y reglas de conflicto. Es una propuesta aparte. |
| Notificaciones push y sincronización en segundo plano | Dependen de la cola de escritura, que no existe. |
| Cambiar de compilación estática a render en servidor | La decisión D-005 sigue en pie. Esta tarea no la toca. |
| Un envoltorio nativo tipo Capacitor | El objetivo es una aplicación web instalable, no un segundo proyecto. |

## Tareas

1. **Verificar el origen seguro antes de escribir nada.** Confirmar con `curl -sI https://panel.tienda.local | head -1` que el panel se sirve por HTTPS, y que la URL de la API que llega en `PUBLIC_API_URL` usa el mismo esquema. Si la API sigue en `http://`, resolverlo primero: con el panel en HTTPS, el navegador bloquea esos pedidos por contenido mixto y ninguna parte de esta tarea sirve.

2. **Escribir el manifiesto** en `frontend/public/manifest.webmanifest` con estos valores: `name` "ShopMar — Panel de comercio", `short_name` "ShopMar", `id` y `start_url` `/` y `scope` `/`, `display` `standalone`, `background_color` `#f8f9ff`, `theme_color` `#f8f9ff`, `lang` `es`, `dir` `ltr`, y la lista de íconos del paso 3.
   - `start_url` es `/` y no `/summary`: la pantalla de resumen es la que el build emite como `index.html` (título "Resumen"), mientras que `/summary` es un stub que redirige a `/`.

3. **Generar los cuatro íconos** del logo actual, sin agregar dependencias de npm. El camino preferido es el navegador que ya está instalado en la máquina, porque rasteriza SVG con fidelidad; el segundo es ImageMagick, que está en `/usr/bin/magick`.

   Con Chromium, que ya se usa para inspeccionar el panel: abrir `public/favicon.svg` en una ventana de 192, 512 y 180 píxeles según corresponda y capturar la imagen sin fondo.

   Con ImageMagick:
   ```
   magick -background white -density 2048 public/favicon.svg -resize 192x192 public/icons/icon-192.png
   magick -background white -density 2048 public/favicon.svg -resize 512x512 public/icons/icon-512.png
   magick -background white -density 2048 public/favicon.svg -resize 300x300 -gravity center -extent 512x512 public/icons/icon-maskable-512.png
   magick -background white -density 2048 public/favicon.svg -resize 180x180 -alpha remove -alpha off public/icons/apple-touch-icon.png
   ```
   - La variante **enmascarable** lleva el dibujo al 58% dentro de un cuadrado de 512: Android recorta el ícono a una forma variable y el dibujo tiene que quedar dentro del círculo seguro o se corta la camiseta.
   - El de Apple va **sin transparencia**, porque iOS compone el ícono sobre negro cuando el PNG tiene alfa.
   - ImageMagick sin `librsvg` usa su propio intérprete de SVG, que puede dibujar mal el `transform` y el rectángulo redondeado del archivo. Por eso el paso 4 es obligatorio y no opcional.

4. **Mirar los cuatro PNG generados** antes de seguir. Abrirlos y confirmar que se ve la camiseta blanca con líneas negras dentro del cuadrado, sin recortes y sin fondo transparente en el de Apple. Un ícono roto no se detecta con ningún comando: hay que verlo.

5. **Agregar los `meta` de aplicación** en la cabecera de `src/layouts/Layout.astro`: el `<link rel="manifest">`, `theme-color` con el valor del tema claro como punto de partida, `apple-touch-icon` apuntando al PNG de 180, `apple-mobile-web-app-capable` con `yes`, `apple-mobile-web-app-title` con "ShopMar" y `apple-mobile-web-app-status-bar-style` con `black-translucent`. Al `meta` de viewport existente agregarle `viewport-fit=cover`.
   - `viewport-fit=cover` es lo que habilita `env(safe-area-inset-*)`; sin él las áreas seguras valen cero y el paso 6 no hace nada.

6. **Respetar las áreas seguras en el armazón**, en `src/styles/global.css` y en las reglas del armazón de `src/components/Nav.astro`:
   - la barra lateral arranca con `padding-block-start: env(safe-area-inset-top)` y la barra superior con `padding-inline: env(safe-area-inset-left)` y `env(safe-area-inset-right)`;
   - el relleno inferior del pie y del cajón suma `env(safe-area-inset-bottom)`;
   - el desplazamiento del contenido (`.shell-body`) usa el ancho de la barra lateral más el área segura de la izquierda cuando corresponde.
   La regla general: donde hoy hay un relleno fijo que toca un borde de la pantalla, el valor pasa a ser `max(<el valor actual>, env(safe-area-inset-*))`.

7. **Mantener `theme-color` sincronizado con el tema elegido.** El tema del panel lo elige el usuario y puede no coincidir con el del sistema, así que no alcanzan dos `meta` con `media="(prefers-color-scheme: …)"`. La actualización va en los dos lugares que ya escriben `data-theme`: el guion previo al pintado de `Layout.astro` y el módulo `src/lib/theme-toggle.ts`. Los valores son los dos colores del panel: `#f8f9ff` en claro y `#0b121a` en oscuro.

8. **Crear `src/lib/install-prompt.ts`** con la lógica de instalación, separando lo puro de lo que toca el navegador para que se pueda probar:
   - detectar si la aplicación ya se está ejecutando instalada (`display-mode: standalone`, o `navigator.standalone` en iOS);
   - detectar iOS para mostrar el gesto en vez de un botón;
   - guardar el evento de instalación de Android cuando el navegador lo dispare y ofrecer el botón;
   - no mostrar nada si ya está instalada ni si el navegador no ofrece ninguna de las dos vías.

9. **Mostrar la instalación en la barra lateral**, en `src/components/Nav.astro`: un botón que dispara la instalación en Android y escritorio, y un texto breve con el gesto para iOS. Se oculta cuando la aplicación ya está instalada. Es una pieza de la barra lateral, no un cartel flotante: no se agrega ningún elemento que tape contenido.

10. **Probar la lógica pura** de `src/lib/install-prompt.ts` en `src/lib/install-prompt.test.ts`, con los mismos criterios que el resto de las pruebas del frontend: modo instalado, iOS, navegador sin evento de instalación, y el caso de que ya esté instalada.

11. **Verificar todo** con los comandos del último apartado.

## Criterios de Done

1. `cd frontend && pnpm build` termina y `dist/manifest.webmanifest` y los cuatro PNG de `dist/icons/` existen.
2. `magick identify -format "%f %wx%h\n" dist/icons/*.png` devuelve exactamente `icon-192.png 192x192`, `icon-512.png 512x512`, `icon-maskable-512.png 512x512` y `apple-touch-icon.png 180x180`.
3. El manifiesto es JSON válido y tiene las claves obligatorias: `node -e "const m=JSON.parse(require('fs').readFileSync('dist/manifest.webmanifest','utf8')); const faltan=['name','short_name','start_url','display','icons','theme_color','background_color'].filter(k=>!(k in m)); if(faltan.length) throw new Error('faltan: '+faltan); console.log('manifiesto ok', m.icons.length, 'iconos')"`.
4. El HTML construido de las rutas principales referencia el manifiesto y el ícono de Apple, y el viewport incluye `viewport-fit=cover`: `grep -l 'rel="manifest"' dist/index.html dist/sales/index.html` y `grep -c 'apple-touch-icon' dist/index.html` y `grep -c 'viewport-fit=cover' dist/index.html`.
5. Los cuatro PNG se revisaron a ojo y se ve la camiseta, sin recortes, y el de Apple sin transparencia.
6. `pnpm test` sigue verde con las pruebas nuevas de `install-prompt`.
7. En el navegador, la pestaña **Aplicación** de las herramientas de desarrollo muestra el manifiesto sin errores, y el botón de instalación aparece donde corresponde.
8. En el teléfono del local: el panel se instala desde el navegador, el ícono queda con la camiseta, se abre sin la barra del navegador, y ni la barra superior ni la barra lateral quedan tapadas por la muesca o por las esquinas.
