/**
 * Mostrar u ocultar la contraseña en el login.
 *
 * En el teléfono, con el teclado tapando media pantalla, un error de tipeo no se
 * ve: el botón de ojo deja leer lo escrito sin borrar nada. Es una comodidad de
 * la pantalla, no un cambio del contrato: el campo sigue siendo
 * `type="password"` hasta que alguien lo pide.
 *
 * El DOM entra por parámetro (el botón y el input) para poder probarlo sin
 * montar la página, igual que el resto de `lib/auth/`.
 */

export interface IPasswordVisibility {
  /** Alterna entre texto y oculto, y devuelve el estado nuevo. */
  toggle(): boolean
  /** Vuelve a ocultar. Se llama al enviar para no dejar la contraseña a la vista. */
  hide(): void
}

export function initPasswordVisibility(
  button: HTMLElement | null,
  input: HTMLInputElement | null,
): IPasswordVisibility {
  let visible = false

  function paint(): void {
    if (button === null || input === null) return
    input.type = visible ? "text" : "password"
    // El nombre accesible dice qué va a pasar si se toca, no lo que está pasando.
    button.setAttribute("aria-label", visible ? "Ocultar la contraseña" : "Mostrar la contraseña")
    button.setAttribute("aria-pressed", visible ? "true" : "false")
    button.setAttribute("data-visible", visible ? "true" : "false")
  }

  function onToggle(event: Event): void {
    event.preventDefault()
    visible = !visible
    paint()
    // El foco vuelve al campo: tocar el ojo no puede mandar el cursor a otro lado.
    input?.focus()
  }

  button?.addEventListener("click", onToggle)
  paint()

  return {
    toggle() {
      visible = !visible
      paint()
      return visible
    },
    hide() {
      if (!visible) return
      visible = false
      paint()
    },
  }
}
