# Instrucciones globales

## Visión general

Este árbol de especificaciones describe `shpr`, una plataforma web de gestión para una tienda de ropa de segunda mano. El sistema tiene tres capas técnicas (API REST, panel web estático, base de datos PostgreSQL) y cuatro áreas funcionales (ventas, paquetes, gastos, indicadores). Las especificaciones están escritas sobre el estado **objetivo** del proyecto, no sobre el andamiaje que hoy ocupa el repositorio: el código de autenticación, usuarios, roles, productos, servicios e inventario que dejó el generador de proyectos se elimina y se reemplaza.

El proyecto es de un solo usuario y sin autenticación. Esa decisión no es un descuido: está argumentada en `07-decisiones.md` y es la razón por la que la seguridad se apoya en la perimeterización del host y no en un mecanismo de sesión.

## Índice de módulos

| Módulo | Archivos | Propósito |
|--------|----------|-----------|
| `docs/` | `01-descripcion-proyecto.md` | Qué es el sistema, para quién, qué resuelve y qué queda fuera. |
| `docs/` | `02-global-instruction.md` | Este archivo: visión general, índice, referencia del stack y navegación. |
| `docs/` | `03-ejecucion-local.md` | Comandos reales para instalar, ejecutar, probar y compilar. |
| `docs/` | `04-buenas-practicas.md` | Convenciones de código, estructura de carpetas, errores, logging, commits y revisión. |
| `docs/` | `05-requisitos-no-funcionales.md` | Rendimiento, seguridad, escalabilidad, disponibilidad y mantenibilidad con metas medibles. |
| `docs/` | `06-glosario.md` | Términos de negocio y técnicos usados en el resto del árbol. |
| `docs/` | `07-decisiones.md` | Registro de decisiones fuertes con contexto, alternativas y consecuencias. |
| `modules/backend/` | `README.md`, `01-stack.md` a `06-configuracion.md` | Implementación del servidor: stack, capas, endpoints, seguridad, pruebas y variables de entorno. No existe `07-integraciones.md` porque el proyecto no tiene integraciones externas. |
| `modules/db/` | `README.md`, `setup.md` | Motor, conexión, flujo de migraciones y seeds. |
| `modules/db/` | `schemas/` (`README.md`, `01` a `04`, `index.md`) | Una tabla por entidad: `sale`, `additional_sale`, `package`, `expense`. |
| `modules/db/` | `enums/` (`README.md`, `01` a `04`) | `sale_type`, `sale_status`, `payment_method`, `package_method`. |
| `modules/db/` | `use-cases/` (`README.md`, `01` a `06`) | Seis flujos de negocio de punta a punta tocando el esquema. |
| `modules/frontend/` | `README.md`, `01-arquitectura.md` a `06-testing.md` | Panel administrativo Astro: stack y arquitectura, sistema de diseño, componentes, pantallas, estilado y pruebas. No hay documento de estado global porque no hay estado global de cliente. |
| `modules/api/` | `README.md`, `01` a `04` | Contrato REST público: `dashboard`, `sales`, `packages`, `expenses`. |
| `modules/qa/` | `README.md`, `01-objetivo.md` a `05-artefactos.md` | Verificación funcional autónoma con Playwright: objetivo y filosofía, flujo de once pasos, taxonomía de casos, configuración del workspace `qa/` y artefactos de diagnóstico. |
| `tasks/` | `README.md`, `backend/` (7 archivos), `db/` (4 archivos), `frontend/` (13 archivos), `qa/` (4 archivos) | 28 áreas de funcionalidad con checklist numerada. |

## Referencia rápida del stack

| Capa | Tecnología | Versión declarada |
|------|-----------|--------------------|
| Gestor de paquetes | pnpm | — |
| Runtime | Node.js | `>= 22.12.0` (declarado en `frontend/package.json`) |
| Lenguaje | TypeScript con módulos ESM | `^5.5.0` en backend, `^6.0.3` en frontend |
| Servidor | Fastify con `@fastify/helmet`, `@fastify/cors`, `@fastify/compress`, `@fastify/rate-limit` | `^5.0.0`, `^12.0.0`, `^10.0.0`, `^8.0.0`, `^10.0.0` |
| Validación | Zod | `^3.23.0` |
| Logs | Pino con `pino-pretty` en desarrollo | `^9.0.0`, `^11.0.0` |
| ORM | Drizzle (`drizzle-orm` + `drizzle-kit`) | `1.0.0-rc.4` |
| Base de datos | PostgreSQL | 16 o superior |
| Pruebas | Vitest | `^3.0.0` |
| Empaquetado | tsup (solo ESM, target es2022) | `^8.0.0` |
| Desarrollo | tsx con recarga | `^4.0.0` |
| Frontend | Astro con salida estática | `^7.2.1` |
| Iconos | `lucide-astro` | `^0.556.0` |
| QA | Playwright (`@playwright/test` en el workspace `qa/`) | última estable |

Cero frameworks de interfaz, cero frameworks de CSS, cero biblioteca de estado en el frontend. Cero autenticación en el backend.

## Cómo navegar este árbol

**Si va a implementar la base de datos**, empiece por `modules/db/schemas/index.md` y siga con los cuatro archivos de tabla y los de enums.

**Si va a implementar un endpoint**, abra primero `modules/api/01-dashboard.md` (o el recurso que corresponda) para conocer el contrato, luego `modules/backend/03-api.md` para las notas de implementación, y después busque el checklist en `tasks/backend/`.

**Si va a implementar una pantalla**, abra `modules/frontend/04-screens.md` para saber qué datos consume, `modules/frontend/02-design.md` para los tokens y después el checklist en `tasks/frontend/`.

**Si va a tomar una decisión técnica**, consulte `docs/07-decisiones.md` antes de inventar un patrón. Casi todo lo que suele discutirse en este proyecto ya está decidido y registrado.

**Si va a verificar que lo construido funciona de punta a punta**, abra `modules/qa/README.md` y siga el pipeline en `modules/qa/02-flujo-de-trabajo.md`. El proceso corre por fuera del paquete frontend (decisión D-010) y sus tareas están en `tasks/qa/`.

**Si va a entender por qué algo es como es**, el orden es `docs/07-decisiones.md` → `docs/05-requisitos-no-funcionales.md` → `docs/04-buenas-practicas.md`.

## La diferencia entre `modules/backend/` y `modules/api/`

`modules/api/` es un **contrato**: qué rutas existen, qué aceptan, qué devuelven y con qué forma de error fallan. Lo consume el frontend y cualquier cliente futuro; no describe clases ni funciones. `modules/backend/03-api.md` es la **nota de implementación** de ese mismo contrato: qué módulo Fastify lo sirve, qué DTO de Zod valida el cuerpo, qué método de servicio lo atiende. Si cambian los dos, es porque cambió el contrato; si cambia solo `modules/backend/`, es un detalle interno.
