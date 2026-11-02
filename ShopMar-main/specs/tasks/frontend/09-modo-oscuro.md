# 09 — Modo oscuro

## Estado Actual

El sistema define solo el tema claro (tokens en `frontend/src/styles/global.css` con prefijo `--m3-*` y esquema minimal light). No existe soporte para modo oscuro: no hay tokens oscuros, no hay toggle, no hay preferencia guardada.

## Objetivo

Agregar soporte para modo oscuro manteniendo el mismo diseño minimal dashboard (colores funcionales semánticos, bordes finos, sin decoraciones), respetando `prefers-color-scheme` y permitiendo un toggle manual persistente.

## Alcance

- Agregar tokens oscuros completos bajo `[data-theme="dark"]` y `@media (prefers-color-scheme: dark)`.
- Mantener tokens claros como default (light-first).
- Añadir un pequeño toggle de tema en el header (Nav/Layout) que persista en `localStorage` (`shopmar:theme`).
- Sin cambiar lógica de negocio, solo estilos y un pequeño script para el toggle.
- Actualizar print.css si es necesario (impresión sigue en blanco/negro según specs).
- Tests y build deben seguir pasando.

## Fuera de alcance

- Cambiar moneda, rutas o lógica de API.
- Modo oscuro con animaciones llamativas, gradientes o blobs.
- Tema personalizado (solo light/dark).

## Tareas

1. **Tokens oscuros**: En `frontend/src/styles/global.css`, definir variables M3 equivalentes para dark: backgrounds/surfaces, borders, text, primary/secondary/tertiary, error y semánticos. Usar misma estructura, solo valores.
2. **Theme resolution**: Implementar resolución: si `localStorage.shopmar:theme` es `dark`/`light` usarlo, sino caer en `prefers-color-scheme: dark`, sino `light`.
3. **Toggle**: Añadir botón de tema en `Nav.astro` (sol/luna) con accesibilidad (aria-label, aria-pressed).
4. **Persistencia**: Script en Layout o Nav para aplicar tema al cargar y guardar elección.
5. **Sin romper contraste**: Mantener AA para texto sobre superficies.
6. **Verificación**: `pnpm astro check`, `pnpm vitest run`, `pnpm build` pasan.
7. **Commits**: Uno por bloque (tokens, toggle, layout/script) o uno cohesivo, siguiendo convención.

## Criterio de aceptación

- Al cambiar tema, todos los componentes usan tokens correctos (sin colores hardcodeados nuevos).
- `prefers-color-scheme: dark` funciona sin tocar toggle.
- Toggle persiste entre recargas.
- Impresión no se ve afectada (print.css intacto en lo esencial).
- 0 errores en astro check, tests verdes, build OK.
