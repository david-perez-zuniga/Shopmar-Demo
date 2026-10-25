# 05-quality.md

## Lint

- **ESLint** configurado para archivos `.astro` y `.ts`
- `pnpm lint` — ejecuta ESLint sobre todo el proyecto
- Reglas personalizadas: `no-unused-vars`, `no-console`, indent 2 espacios

## Formateo

- **Prettier** para consistencia de código
- `pnpm lint` incluye formateo Prettier

## Tests

- **Vitest** + **Testing Library** para componentes Astro islands
- `pnpm test` — ejecuta la suite de tests
- **Tests clave (mínimo 50 tests mirror al proyecto original)**:
  - Formulario venta nueva validaciones
  - Filtros de fecha/canal/estado
  - Donut chart data processing
  - Bar chart serieshorarias
  - Mock API endpoints
  - Toast notifications
  - Theme toggle persistence
  - Accessibility checks (aria-labels, contrast)
  - Pagination and pager functionality

## Accesibilidad

- `aria-label` en todos los componentes interactivos
- Contraste WCAG AA (variables CSS: `--foreground`, `--muted-foreground`, `--card`, `--border`)
- Focus ring personalizado (`focus-visible`, `outline-none` + `ring-2 ring-primary`)
- `reduced-motion: reduce` respetado en animaciones
- `skip-links` para navegación teclado (`.link-back`, `.form-back`)

## Rendimiento objetivo

- **Lighthouse score**: >90 en desarrollo, >85 en producción
- **HTML sin JS por defecto**: Astro genera HTML mínimo, islands bajo demanda
- **Time to interactive**: <2s en modo desarrollo, optimizado en build
- **Core Web Vitals**: good rating en todos los informes

## Comandos

```bash
pnpm test       # Vitest suite
pnpm test --coverage  # Con cobertura
pnpm lint       # ESLint + Prettier
pnpm astro check  # Type checking
pnpm build      # Build producción
```