# Tareas

El trabajo pendiente, en orden de ejecución. Cada archivo es un área de funcionalidad con su alcance, su lista de tareas y sus criterios de terminado. **Veintinueve áreas: siete de backend, cuatro de base de datos, catorce de frontend y cuatro de QA.**

## Cómo se leen

| Sección | Qué contiene |
|---------|--------------|
| `## Estado Actual` | Lo que hay hoy en el código, con nombres de archivo reales. |
| `## Objetivo` | Lo que cambia cuando la tarea está terminada, en una frase. |
| `## Alcance` | Lo que esta tarea hace, con los archivos que toca. |
| `## Fuera de alcance` | Lo que parece que podría hacerse aquí y no se hace en esta tarea, con el motivo. |
| `## Tareas` | La lista numerada de pasos verificables. |
| `## Criterios de Done` | Las condiciones observables que deben cumplirse para darla por terminada. |

## Orden de ejecución

Las dependencias son reales: hacer una tarea antes de su dependencia produce código que después hay que mover. El orden recomendado es el siguiente, y las flechas marcan dependencia directa.

### Fase 1 — Base de datos

```
db/01-migracion-al-modelo-de-dominio
   ↓
db/02-indices-y-restricciones
   ↓
db/03-foreigner-basico
   ↓
db/04-verificacion-de-integridad
```

### Fase 2 — Backend

```
backend/01-retirar-andamiaje-de-autenticacion-y-usuarios
backend/02-retirar-andamiaje-de-productos-e-inventario
backend/03-contrato-de-errores-y-utilidad-de-dinero
   ↓
backend/04-modulo-de-ventas
   ↓
backend/05-modulo-de-paquetes-y-gastos
   ↓
backend/06-modulo-de-dashboard
   ↓
backend/07-capas-vista-modales-y-filtros-globales
```

`backend/01` y `backend/02` no dependen del esquema: son borrados de código muerto, y se pueden hacer en cualquier momento. `backend/03` sí depende de `db/01`, porque el contrato de errores incluye la traducción de errores de Prisma.

### Fase 3 — Frontend

```
frontend/01-fundamentos-del-panel
   ↓
frontend/02-sistema-de-diseno-minimal-light
   ↓
frontend/03-componentes-compartidos
   ↓
frontend/04-pantalla-de-ventas
   ↓
frontend/05-formulario-de-venta
   ↓
frontend/06-pantalla-de-paquetes
   ↓
frontend/07-pantalla-de-gastos
   ↓
frontend/08-estado-de-red-y-capa-api
```

`frontend/08` es la última por un detalle práctico: define el `api.ts` y los tipos que las demás pantallas consumen. Si se hace antes, cada pantalla escribe su propio `fetch` y después hay que unificar siete copias. Es la única tarea del frontend que conviene hacer **al final**, aunque su contenido sea la base técnica de todas.

A estas tres fases se añade el QA (verificación con Playwright). No es una fase más de construcción: es el proceso que **verifica** lo construido, corre por fuera del paquete frontend (decisión D-010) y arranca cuando el panel y la API están desplegados en local.

### Fase 4 — QA

```
qa/01-infraestructura-y-configuracion
   ↓
qa/02-descubrimiento-y-generacion-de-casos
   ↓
qa/03-scripts-ejecucion-y-evidencias
   ↓
qa/04-clasificacion-y-reportes
```

## Las veintinueve áreas

### Backend — siete

| # | Archivo | Qué resuelve |
|---|---------|--------------|
| 1 | [`01-retirar-andamiaje-de-autenticacion-y-usuarios.md`](backend/01-retirar-andamiaje-de-autenticacion-y-usuarios.md) | Elimina login, usuarios, roles, sesiones y las tres dependencias de auth. |
| 2 | [`02-retirar-andamiaje-de-productos-e-inventario.md`](backend/02-retirar-andamiaje-de-productos-e-inventario.md) | Elimina productos, servicios, movimientos de inventario y el módulo de demostración. |
| 3 | [`03-contrato-de-errores-y-utilidad-de-dinero.md`](backend/03-contrato-de-errores-y-utilidad-de-dinero.md) | Normaliza el sobre de error, traduce errores de Prisma y crea la aritmética de `Decimal`. |
| 4 | [`04-modulo-de-ventas.md`](backend/04-modulo-de-ventas.md) | Los cinco endpoints de ventas: alta en mostrador, alta de WhatsApp, listado, detalle y cambio de estado. |
| 5 | [`05-modulo-de-paquetes-y-gastos.md`](backend/05-modulo-de-paquetes-y-gastos.md) | Los siete endpoints de paquetes y gastos, con sus repositorios y sus pruebas. |
| 6 | [`06-modulo-de-dashboard.md`](backend/06-modulo-de-dashboard.md) | Las cuatro agregaciones del resumen, con el filtro dual de artículos adicionales. |
| 7 | [`07-capas-vista-modales-y-filtros-globales.md`](backend/07-capas-vista-modales-y-filtros-globales.md) | CORS por origen, cabeceras de seguridad y el `notFoundHandler` que cierra la superficie HTTP. |

### Base de datos — cuatro

| # | Archivo | Qué resuelve |
|---|---------|--------------|
| 1 | [`01-migracion-al-modelo-de-dominio.md`](db/01-migracion-al-modelo-de-dominio.md) | Reemplaza las cinco tablas del andamiaje por las cuatro del dominio, con los cuatro enums. |
| 2 | [`02-indices-y-restricciones.md`](db/02-indices-y-restricciones.md) | Los ocho índices y las cinco restricciones `CHECK` que Prisma no declara. |
| 3 | [`03-foreigner-basico.md`](db/03-foreigner-basico.md) | El script de respaldo, la transformación de `DATABASE_URL` y la verificación de la conexión. |
| 4 | [`04-verificacion-de-integridad.md`](db/04-verificacion-de-integridad.md) | Las consultas que comparan el catálogo real contra el documento, y las pruebas de integración de las tres invariantes. |

### Frontend — ocho

| # | Archivo | Qué resuelve |
|---|---------|--------------|
| 1 | [`01-fundamentos-del-panel.md`](frontend/01-fundamentos-del-panel.md) | Borra la landing, crea el `Layout`, la navegación y las cuatro piezas de `lib/`. |
| 2 | [`02-sistema-de-diseno-minimal-light.md`](frontend/02-sistema-de-diseno-minimal-light.md) | Los tokens, las primitivas de CSS, el movimiento y las reglas de impresión. |
| 3 | [`03-componentes-compartidos.md`](frontend/03-componentes-compartidos.md) | Los seis componentes `.astro` y su comportamiento en los tres estados. |
| 4 | [`04-pantalla-de-ventas.md`](frontend/04-pantalla-de-ventas.md) | `/sales`: listado, filtros, cambio de estado en línea y factura imprimible. |
| 5 | [`05-formulario-de-venta.md`](frontend/05-formulario-de-venta.md) | `/sales/new`: los dos canales, los artículos dinámicos y el campo de banco condicional. |
| 6 | [`06-pantalla-de-paquetes.md`](frontend/06-pantalla-de-paquetes.md) | `/packages` y `/packages/new`: listado, alta, edición y borrado. |
| 7 | [`07-pantalla-de-gastos.md`](frontend/07-pantalla-de-gastos.md) | `/expenses` y `/expenses/new`: listado, alta y borrado. |
| 8 | [`08-estado-de-red-y-capa-api.md`](frontend/08-estado-de-red-y-capa-api.md) | El `api.ts` final, los tipos, los tres estados y el formato de dinero y fechas. |

Tres áreas posteriores a este plan están en el directorio y todavía no figuran arriba: [`09-modo-oscuro.md`](frontend/09-modo-oscuro.md), [`10-modo-claro.md`](frontend/10-modo-claro.md) y [`11-refactor-resumen-con-graficos.md`](frontend/11-refactor-resumen-con-graficos.md).

### QA — cuatro

| # | Archivo | Qué resuelve |
|---|---------|--------------|
| 1 | [`01-infraestructura-y-configuracion.md`](qa/01-infraestructura-y-configuracion.md) | El workspace `qa/` con Playwright instalado y configurado, y la estructura de salida `qa-results/`. |
| 2 | [`02-descubrimiento-y-generacion-de-casos.md`](qa/02-descubrimiento-y-generacion-de-casos.md) | El catálogo `TC-XXX` de las siete familias sobre las ocho pantallas y los trece endpoints. |
| 3 | [`03-scripts-ejecucion-y-evidencias.md`](qa/03-scripts-ejecucion-y-evidencias.md) | Los `.spec.ts` que convierten los casos en pruebas ejecutables, y la captura de evidencias en fallo. |
| 4 | [`04-clasificacion-y-reportes.md`](qa/04-clasificacion-y-reportes.md) | Los `BUG-XXX`, el `report-summary.md` y los JSON de análisis que permiten corregir sin repetir la ejecución. |

## PWA

No forma parte de las diecinueve áreas: es trabajo posterior, y por eso va aparte. Depende de un prerrequisito que no es código, el panel servido por HTTPS, porque sin contexto seguro no hay aplicación instalable. La segunda fase necesita la primera: sin manifiesto no hay dónde registrar el service worker.

| # | Archivo | Qué resuelve |
|---|---------|--------------|
| 12 | [`12-pwa-instalable.md`](frontend/12-pwa-instalable.md) | El manifiesto, los íconos, los metadatos de aplicación, las áreas seguras y la instalación. Sin caché de datos. |
| 13 | [`13-pwa-offline.md`](frontend/13-pwa-offline.md) | El service worker, las estrategias de caché, la pantalla sin conexión y el aviso de versión nueva. |

## Aplicación cliente

No forma parte de las diecinueve áreas del plan: es trabajo posterior y transversal al frontend, y por eso va aparte. Depende de PWA: la estrategia de navegación del service worker es una de las piezas que ajusta.

| # | Archivo | Qué resuelve |
|---|---------|--------------|
| 14 | [`14-aplicacion-cliente-navegacion-y-detalle.md`](frontend/14-aplicacion-cliente-navegacion-y-detalle.md) | El prefetch del armazón, `transition:persist`, la caché de datos en memoria y el detalle de venta resuelto en el cliente en vez de una página por venta en build. |

## Dependencias con otras áreas

Tres tareas tocan más de un módulo, y eso está declarado dentro de cada una.

| Tarea | Toca además de su módulo |
|-------|---------------------------|
| `backend/01-retirar-andamiaje-de-autenticacion-y-usuarios` | `db/01-migracion-al-modelo-de-dominio`: la autenticación tiene cuatro tablas que desaparecen en la migración. |
| `backend/04-modulo-de-ventas` | `db/01` y `db/02`: el módulo consume el esquema y sus índices. |
| `frontend/08-estado-de-red-y-capa-api` | `backend/03-contrato-de-errores-y-utilidad-de-dinero`: el `api.ts` interpreta el sobre de error que ese backend produce. |

## Reglas de las tareas

| Regla | Detalle |
|-------|---------|
| `## Estado Actual` nombra archivos reales | Nunca "el sistema de autenticación" a secas: siempre `src/modules/auth/presentation/auth.routes.ts`. |
| Cada tarea es verificable | "El comando X produce Y", no "se implementa la lógica". |
| Los criterios de Done se pueden comprobar | Un comando, una consulta a la base, o un archivo que existe con un contenido concreto. |
| `## Fuera de alcance` es obligatorio | Una tarea sin límites declarado se expande hasta convertirse en otra tarea. |
| No se agregan dependencias nuevas | Las únicas dependencias del backend son las que ya están en `package.json`; las del frontend son `astro` y `lucide-astro`, más `vitest` y `jsdom` como dependencias de desarrollo para las pruebas. |
| No se escriben archivos fuera de `specs/` | Estas tareas describen; no implementan. La implementación es el trabajo que sigue. |

Sobre la regla *"No se agregan dependencias nuevas"*: aplica a `backend/` y `frontend/`. El QA es la única excepción declarada por la decisión D-010: el workspace `qa/` sí instala `@playwright/test` como dependencia de desarrollo, y esa dependencia **nunca** entra en `backend/package.json` ni en `frontend/package.json`.
