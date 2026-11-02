# 10 — Modo claro explícito

## Estado Actual

El sistema ya cuenta con soporte para modo oscuro (tokens, toggle persistente y resolución por prefers-color-scheme). Sin embargo, el modo claro funciona como default implícito pero no existe una opción explícita "Forzar modo claro" cuando el sistema está en oscuro por preferencia. Además, el toggle debe mostrar correctamente luna en modo claro y sol en modo oscuro, y quedar homologado entre módulos.

## Objetivo

Asegurar que el modo claro sea explícitamente aplicable, mejorar la consistencia visual del toggle entre módulos y eliminar cualquier colisión entre reglas CSS del tema.

## Alcance

- Homologar estilos del botón `topbar-theme` (igual al estilo usado en ventas) en todos los módulos que importen el Nav.
- Asegurar que el toggle solo muestre un ícono a la vez (luna en light, sol en dark).
- Mantener la lógica: `localStorage.shopmar:theme` tiene prioridad, sino `prefers-color-scheme: dark`, sino `light`.
- Centralizar reglas de visibilidad de íconos en `global.css` y no duplicarlas en componentes.
- Verificar que el click en toggle cambia ambos: ícono y colores del diseño (tokens).
- Quitar cualquier borde innecesario del botón de tema.

## Fuera de alcance

- Cambiar lógica de negocio o rutas.
- Añadir más temas.
- Modificar `print.css`.

## Tareas

1. [x] **Homologar botón de tema**: Asegurar que todos los módulos usan el mismo estilo `.topbar-theme` definido en Nav/global (sin border, gap correcto, altura mínima touch).
2. [x] **Centralizar visibilidad de íconos**: En `frontend/src/styles/global.css`, añadir reglas `[data-theme="light"] .theme-icon--dark { display: none; }`, `[data-theme="dark"] .theme-icon--light { display: none; }`, `[data-theme="light"] .theme-icon--light { display: inline; }`, `[data-theme="dark"] .theme-icon--dark { display: inline; }`. Quitar estas reglas duplicadas de `Nav.astro` si existen.
3. [x] **Corregir toggle**: Simplificar script en `Nav.astro` para leer siempre el atributo `data-theme` actual y cambiar a `light/dark` correctamente. Actualizar `aria-pressed` en cada cambio.
4. [x] **Sincronizar con Layout**: Verificar que `Layout.astro` aplica tema antes del render (inline script) usando misma clave `shopmar:theme`.
5. [x] **Test visual**: En resumen, paquetes, gastos y ventas el toggle debe verse idéntico y funcionar correctamente.
6. [x] **Verificación**: `pnpm astro check`, `pnpm vitest run`, `pnpm build` deben pasar.

## Criterio de aceptación

- Solo un ícono visible a la vez (luna cuando está en modo claro, sol cuando está en modo oscuro).
- Al hacer click en el toggle, cambian ícono y colores (tokens aplicados).
- Estilo del botón idéntico entre módulos.
- Persistencia funciona entre recargas.
- 0 errores en astro check, tests verdes, build OK.
