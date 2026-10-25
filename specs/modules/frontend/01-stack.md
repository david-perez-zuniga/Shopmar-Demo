# 01-stack.md

## Framework

**Astro 7.x** (o superior) — modelo de páginas con islas de interactividad. `astro dev` para desarrollo, `astro build` para producción.

## Language

**TypeScript 5.x** con `tsconfig.json` en `src/`. Tipos estáticos en todo el código.

## Versiones clave

- `astro`: `^7.2.1`
- `typescript`: `^6.0.3`
- `lucide-astro`: `^0.556.0`
- `chart.js`: `^4.4.0` (para DonutChart y BarChart islands)
- `date-fns`: `^4.0.0` (formato de fechas)
- `decimal.js`: `^10.0.0` (cálculos monetarios)

## Por qué esta elección

- **HTML mínimo por defecto**: Mejor SEO y Lighthouse score comparado con React full-hydration
- **Islands bajo demanda**: `client:load`, `client:visible` — solo se carga JS donde es necesario
- **File-system routing**: No necesidad de configurar React Router para rutas principales
- **Build optimizado**: `astro build` genera 11 páginas estáticas optimizadas
- **TipoScript**: Seguridad tipática en toda la aplicación

## Comandos de desarrollo

```bash
pnpm dev      # Modo desarrollo con hot-reload
pnpm build    # Build producción a ./dist
pnpm preview  # Preview del build generado
pnpm test     # Tests Vitest sobre componentes y mocks
pnpm astro check  # Type checking de Astro
pnpm lint     # ESLint
```