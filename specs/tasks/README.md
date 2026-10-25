# specs/tasks/ — How to use and update the checklists

Each module has its own task folder with per-feature checklists. Progress is recorded by ticking checkboxes in place.

## Structure

- `specs/tasks/frontend/` — Tareas para el módulo frontend
- `specs/tasks/backend/` — Tareas para el módulo backend (skip si no hay)
- `specs/tasks/db/` — Tareas para la base de datos (skip si no hay)

## Frontend task files

Cada archivo `specs/tasks/frontend/NN-funcionalidad.md` sigue este formato:

- **Estado Actual**: qué existe hoy; si greenfield: "Proyecto nuevo, no hay código"
- **Objetivo**: una frase describiendo el comportamiento terminado
- **Alcance**: bullets de qué está dentro/afuera
- **Tareas**: checkboxes numerados (el número es el orden de ejecución), cada uno con detalle de implementación
- **Criterios de Done**: comportamiento verificable, tests, sin regresiones

## Actualizar checklists

Al completar una tarea, tacha la casilla: `[x]` → `[x]` (la x permanece, solo agrega el corchete cerrado). No borres ni renames los archivos después de crecidos.

## Cross-check

Cada feature tree en `specs/modules/frontend/04-screens.md` y `02-design.md` debe tener al menos un task file que lo cubra. Si falta, créalo.