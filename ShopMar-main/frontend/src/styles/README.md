# src/styles

El sistema de diseño del panel vive acá, **nunca** dentro de un componente:

- `global.css` — reset mínimo + los tokens y primitivas de CSS como custom
  properties. Los tokens se definen en `tasks/frontend/02-sistema-de-diseno-minimal-light.md`
  según `specs/modules/frontend/02-design.md`.
- Un componente no define colores, tipografías ni sombras propias: los lee de
  las variables de `global.css`.