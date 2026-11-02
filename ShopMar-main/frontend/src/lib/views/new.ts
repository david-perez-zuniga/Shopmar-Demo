/**
 * La vista `/new` de la SPA (T7).
 *
 * El selector de registro que abre el botón de la barra inferior. Es la pantalla
 * más simple de la migración y por eso la única sin cableado: **no tiene
 * `mount` con cuerpo porque no hay nada que cablear**. El acordeón de
 * «Registrar venta» es un `<details>`/`<summary>` nativo —se abre con el
 * teclado, toglea solo y no depende de JavaScript— y los tres destinos son
 * enlaces a vistas ya migradas que el router intercepta.
 *
 * La firma `mount(root)` es la del registro: una vista que no devuelve limpieza
 * no deja nada colgado al desmontarse. `root` no se consulta, y se conserva en
 * la firma para que el registro sea uniforme y para documentar la decisión de
 * no agregar listeners acá: un `toggle` a mano sobre un `<details>` abriría y
 * cerraría en el mismo gesto, así que «Registrar venta» parecería no responder.
 */
export function mountNew(_root: HTMLElement): void {
  // Deliberadamente vacío: la pantalla no espera datos ni escucha eventos.
}
