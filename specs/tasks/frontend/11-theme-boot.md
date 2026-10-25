# 11-theme-boot

## Estado Actual
Proyecto nuevo, no hay código. El componente ThemeBoot.astro aún no ha sido creado.

## Objetivo
Componente ThemeBoot.astro con persistencia tema claro/oscuro en localStorage y data-theme en <html>.

## Alcance
- [x] Al cargar: document.documentElement.classList.contains('dark') ? setDark() : setLight()
- [x] localStorage persistence bajo key shopmar-theme
- [ ] prefers-color-scheme media query fallback

## Tareas
- [x] 1. Crear src/components/ThemeBoot.astro con detección y persistencia tema
    - Detalle: En <html> agregar data-theme="dark" o data-theme="light" basado en localStorage y prefers-color-scheme. Hecho.
- [x] 2. Implementar lógica: si localStorage.tema === 'dark' → setDark(), si 'light' → setLight(), si undefined → verificar prefers-color-scheme
- [x] 3. Añadir toggle sol/luna en Nav.astro que cambie el tema y actualice localStorage

## Criterios de Done
- [x] ThemeBoot.astro aplica tema correcto al cargar
- [x] localStorage.tema persiste entre recargas
- [x] Toggle en Nav.astro cambia tema y actualiza localStorage
- [x] prefers-color-scheme respeta configuración del sistema operativo