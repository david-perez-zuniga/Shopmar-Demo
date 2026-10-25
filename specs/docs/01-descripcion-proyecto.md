# 01-descripcion-proyecto.md

## Qué es

ShopMar Demo — Frontend (Astro) es una réplica idéntica del frontend en **Astro + TypeScript** (sin backend, datos simulados). Este proyecto documenta todo lo necesario para recrear la interfaz, lógicas y pantallas idénticas al proyecto original ShopMar (Astro + TS). A diferencia de la versión React, aquí usamos el modelo de páginas de Astro, isla hydration y utilidades nativas.

## Para quién

- Desarrolladores que quieren entender el modelo de islands de Astro
- Equipos que necesitan una demo funcional sin backend
- Diseñadores que quieren validar el sistema de diseño en un entorno real

## Problema que resuelve

Permite validar el flujo completo de ventas, filtros, gráficos y navegación idéntico al ShopMar original, aprovechando las ventajas de Astro: HTML mínimo por defecto (mejor SEO y Lighthouse score), islands de interactividad bajo demanda y build optimizado. Los datos son simulados y persisten solo en memoria del navegador.

## Funcionalidades principales

1. **Arquitectura Astro**: File-system routing, islas `client:load`/`client:visible`, navegación `@astrojs/navigation`
2. **Tema claro/oscuro**: Persistencia en `localStorage` bajo key `shopmar-theme`, reflejo en `data-theme` de `<html>`
3. **Formulario venta nueva**: Validaciones idénticas (categorías, tarjeta→banco, adicionales), mock API
4. **Tabla ledger**: Paginación 10 por página, filtros fecha/canal/estado, KPIs abajo
5. **Donut chart**: Resumen por canal (WhatsApp→Tienda, Live) usando `<DonutChart client:load />`
6. **Bar chart**: Series horarias con uso de `tz_offset` usando `<BarChart client:load />`
7. **Modales confirm**: Change state y confirm delete/print
8. **Toast notifications**: Para create/update/error (componente isla o HTML injection)
9. **PWA**: `manifest.json` y service worker básicos (`public/manifest.json`, `src/lib/shell/pwa.ts`)
10. **Responsive**: Mobile (bottom nav), tablet (sidebar colapsado), desktop (sidebar visible)

## Fuera de alcance

- Sin backend real ni base de datos
- Datos que persisten entre recargas (se pierden al recargar el navegador)
- Autenticación real ni sistema de usuarios
- Reportes reales sobre datos históricos
- Compilación y comiteo en el repo original