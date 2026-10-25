# 01-nav-component

## Estado Actual
Proyecto nuevo, no hay código. El componente Nav.astro aún no ha sido creado en src/components/.

## Objetivo
Componente Nav.astro con layout fijo, 3 CTA (tienda, live, packages/expenses/customers), toggle de modo oscuro y logo ShoppingCart.

## Alcance
- [x] Componente Nav.astro con sidebar superior, CTA y toggle dark mode
- [ ] Logo ShoppingCart integrado
- [ ] CTA "Venta en tienda" → /sales/new?type=whatsapp
- [ ] CTA "Venta por Live" → /sales/new?type=live
- [ ] Enlaces a /packages, /expenses, /customers
- [ ] Toggle sol/luna con data-theme en <html>

## Tareas
- [x] 1. Crear src/components/Nav.astro con estructura HTML básica
    - Detalle: Usar layout fijo con top bar, bottom nav (mobile) y top bar (desktop). Incluir logo ShoppingCart, 3 CTA y toggle tema. Hecho.
- [x] 2. Agregar CTA "Venta en tienda" con enlace /sales/new?type=whatsapp
- [x] 3. Agregar CTA "Venta por Live" con enlace /sales/new?type=live
- [x] 4. Agregar enlaces a /packages, /expenses, /customers
- [x] 5. Implementar toggle dark mode (sol/luna) con data-theme en <html>
- [x] 6. Añadir estilos responsive (mobile tablet desktop)

## Criterios de Done
- [x] Nav.astro renderiza sin errores en `pnpm dev`
- [x] Los 3 CTA navegan a las rutas correctas
- [x] Toggle tema cambia data-theme en <html> y persiste en localStorage
- [x] responsive: mobile muestra bottom nav, desktop sidebar visible
- [x] Accesos aria-label en todos los elementos interactivos