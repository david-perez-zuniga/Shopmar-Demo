# 02-design.md

## Design tokens — variables CSS (idénticas al original ShopMar)

### Colores — Light

| Variable | Valor | Rol semántico |
|---|---|---|
| `--background` | `#FAFAFC` | Background light mode |
| `--foreground` | `#111827` | Texto principal |
| `--muted-foreground` | `#6B7280` | Texto secundario |
| `--card` | `#FFFFFF` | Fondo de cards |
| `--border` | `#D1D5DB` | Bordes inputs/tables |
| `--primary` | `#3B82F6` | Azul principal |
| `--primary-foreground` | `#FFFFFF` | Texto sobre primary |
| `--secondary` | `#6366F1` | Índigo secundario |
| `--destructive` | `#EF4444` | Rojo error/danger |
| `--success` | `#10B981` | Verde éxito |
| `--warning` | `#F59E0` | Ámbar warning |
| `--info` | `#3B82F6` | Info/primary alternate |
| `--sidebar-bg` | `#F8FAFC` | Sidebar dark/light |
| `--chart-whatsapp` | `#3B82F6` | WhatsApp (Tienda visual) |
| `--chart-live` | `#EF4444` | Live |

### Colores — Dark

| Variable | Valor | Rol semántico |
|---|---|---|
| `--background` | `#0B0E17` | Dark mode bg (casi negro cálido) |
| `--foreground` | `#F8FAFC` | Texto principal dark |
| `--muted-foreground` | `#D1D5DB` | Texto secundario dark |
| `--card` | `#14161D` | Fondo cards dark |
| `--border` | `#374151` | Bordes dark |
| `--primary` | `#6366F1` | Azul light en dark |
| `--primary-foreground` | `#FFFFFF` | |
| `--destructive` | `#F87171` | Rojo dark |
| `--success` | `#34D399` | Verde dark |
| `--warning` | `#FBBF24` | Ámbar dark |
| `--info` | `#6366F1` | |

### Tipografía

- `font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`
- Tamaños: `--text-xs`, `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`, `--text-2xl`, `--text-3xl`
- Pesos: `normal`, `medium`, `semibold`, `bold`
- `line-height: calc(1 + var(--tw-leading))`
- `tracking-wider` en headers

### Espaciado y border-radius

- `spacing scale: 2, 4, 6, 8, 12, 16, 20, 24, 32`
- `border-radius: 0, 0.25rem, 0.5rem, 1rem`
- `shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.05)`
- `shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)`

### Breakpoints responsive

| Breakpoint | min-width | Qué cambia |
|---|---|---|
| `sm` | `640px` | Mobile-first base |
| `md` | `768px` | Tablet: sidebar colapsa a íconos, bottom nav full-width |
| `lg` | `1024px` | Desktop: sidebar visible, grid 12 cols |
| `xl` | `1280px` | Large desktops |
| `2xl` | `1536px` | Extra large |

### Transiciones y animaciones

- `transition-property: color, background-color, border-color, text-color, fill, stroke, opacity, box-shadow, transform`
- `transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)`
- `transition-duration: 200ms` (default), `300ms`, `500ms`
- `animate-spin`, `fade-in`, `slide-up` helpers

### Z-index

- `z-0`, `z-10`, `z-20`, `z-30`, `z-40`, `z-50`
- `dropdown`: `z-50`, `modal`: `z-100`, `toast`: `z-50`

### Helpers CSS

```css
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.focus-visible:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.invisible { visibility: hidden; }
.hidden { display: none; }
```