/**
 * Iconos SVG compartidos por más de una pantalla.
 *
 * `CARET` estaba duplicado, byte a byte, en el `<script>` de
 * `pages/packages/index.astro` y en `lib/sales/sale-status.ts`. Se movió aquí
 * sin reformatear el marcado: los fixtures de ventas y de paquetes comparan el
 * SVG serializado, así que cualquier byte de más es una regresión.
 */

/** Caret del `<select>` (ventas y paquetes). */
export const CARET =
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`
