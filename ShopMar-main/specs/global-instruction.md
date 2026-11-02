# Instrucciones globales de navegación

Este archivo es el índice de `specs/`. Describe qué contiene el árbol, en qué orden leerlo y qué archivo conviene abrir primero según la tarea.

## Punto de entrada

| Archivo | Para qué sirve |
|---------|----------------|
| `descripcion-proyecto.md` | Un párrafo con la definición completa del proyecto: qué es, para quién, qué decisiones lo definen. |
| `global-instruction.md` | Este índice. Índice de módulos, orden de lectura y reglas transversales. |
| `documentacion-cliente.md` | Documento de negocio para el dueño de la tienda, sin jerga técnica. Qué puede hacer con el sistema y qué reglas tiene. |

## Módulos

| Módulo | Archivos | Propósito |
|--------|----------|-----------|
| `docs/` | `01` a `07` | Contexto transversal: descripción, ejecución local, convenciones, requisitos no funcionales, glosario, decisiones. |
| `modules/backend/` | `README.md`, `01` a `06` | API REST: stack, arquitectura por capas, endpoints, seguridad, pruebas, configuración. |
| `modules/db/` | `README.md`, `setup.md`, `schemas/`, `enums/`, `use-cases/` | PostgreSQL y Drizzle: motor, esquema por tabla, enums, flujos de datos. |
| `modules/frontend/` | `README.md`, `01` a `09` | Panel administrativo Astro: arquitectura, sistema de diseño, componentes, pantallas, estilos, pruebas y autenticación. |
| `modules/api/` | `README.md`, `01` a `07` | Contrato REST público que consume el frontend. Documento de acuerdo, no de implementación. |
| `modules/qa/` | `README.md`, `01` a `05` | Verificación autónoma con Playwright: descubrimiento, casos, flujo, configuración y artefactos. Proceso externo al paquete frontend (decisión D-010). |
| `tasks/` | `README.md`, `backend/` (7), `db/` (4), `frontend/` (13), `qa/` (4) | Veintiocho áreas de funcionalidad con checklist numerada. Es la única fuente de trabajo pendiente. |

## Orden de lectura recomendado

1. `docs/01-descripcion-proyecto.md` — qué se construye y qué queda fuera.
2. `docs/07-decisiones.md` — las decisiones que no se negocian, con sus alternativas descartadas.
3. `modules/db/schemas/index.md` — el modelo de datos completo de un vistazo.
4. `modules/api/README.md` — el contrato que hay que implementar y que hay que consumir.
5. `modules/frontend/04-screens.md` — las ocho pantallas y sus datos.
6. `tasks/README.md` — el trabajo pendiente, en orden de ejecución.
7. `modules/qa/README.md` — cómo se verifica lo construido: el proceso de QA con Playwright que corre por fuera del paquete frontend.

## Reglas transversales

Estas reglas se aplican a todo el árbol y a todo el código del proyecto:

1. **Autenticación con dos roles.** Todo `/api/v1` exige una sesión por cookie (`shpr_session`, `HttpOnly`, token opaco, **sin vencimiento**): solo el login y el logout son públicos, y `POST /users` exige rol `admin`. Hay dos roles, `seller` y `admin`, no hay registro público y el primer administrador se crea con `pnpm create-admin`. Ver decisión D-024 y el contrato en `modules/api/07-auth.md`.
2. **Dinero exacto.** Todo importe es `DECIMAL(10,2)` en PostgreSQL y viaja en JSON como cadena decimal (`"1250.50"`). Prohibida la aritmética de punto flotante en el frontend. Ver decisión D-003.
3. **Borrado lógico.** Nada se elimina físicamente. Todo `DELETE` escribe `deleted_at` y todo listado filtra `deleted_at: null`. Ver decisión D-004.
4. **Total derivado.** `sale` no tiene columna `total`. El total se calcula como `sale.cost + SUM(additional_sale.total)` en la capa de aplicación. Ver decisión D-003.
5. **Sin catálogo de productos.** La mercadería es texto libre. No existe tabla de productos, precios de catálogo ni control de stock. Ver decisión D-002.
6. **Prefijo y errores.** Todo endpoint de negocio vive bajo `/api/v1` y responde con el sobre `{ "code", "message", "details"? }` en error.
7. **Capas.** Cada módulo del backend sigue `domain/`, `application/`, `infrastructure/`, `presentation/`, `_tests_/`. El dominio no importa el ORM.
8. **Design.** El frontend usa exclusivamente los tokens de `modules/frontend/02-design.md`, derivados del estilo minimal light. Cero frameworks de interfaz, cero frameworks de CSS.
9. **QA externo.** La verificación de flujos completos corre con Playwright desde un workspace `qa/` propio, fuera del paquete frontend. El QA descubre, genera casos, ejecuta, evidencia y clasifica defectos; **nunca corrige**. Ver decisión D-010 y `modules/qa/`.

## Estado actual del código

El repositorio contiene el panel en producción: el backend Fastify con los cuatro módulos de negocio —más `auth` y `users` desde D-024— y el frontend Astro compilado como SPA. Del andamiaje de `fwinit` ya no queda nada en uso: los módulos de productos, servicios e inventario se retiraron (D-002) y el de autenticación volvió con un diseño propio —cookie opaca, `scrypt`, sesión sin vencimiento y dos roles— que es el de D-024 y el de `modules/api/07-auth.md`.
