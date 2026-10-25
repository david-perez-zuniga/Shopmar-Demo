# 02-ejecucion-local.md

## Requisitos previos

- Node.js >= 22.12.0
- pnpm >= 10.0.0

## Instalación

```bash
# 1. Clonar el repositorio
git clone <url-del-repositorio>
cd Shopmar-Demo

# 2. Instalar dependencias del frontend
cd frontend
pnpm install

# 3. Verificar que Astro esté disponible
npx astro --version
```

## Ejecución

```bash
# Iniciar modo desarrollo
pnpm dev

# El servidor estará disponible en http://localhost:4321
```

## Pruebas

```bash
# Ejecutar tests Vitest
pnpm test

# Ejecutar typecheck
pnpm run astro check

# Ejecutar linter
pnpm lint
```

## Build/producción

```bash
# Crear build de producción
pnpm build

# Preview del build
pnpm preview