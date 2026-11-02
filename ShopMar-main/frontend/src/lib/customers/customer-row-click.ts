/**
 * Decisión de si un clic dentro de la tabla de clientes abre el diálogo de
 * edición de esa fila.
 *
 * La fila no es un control —no lo dice su rol ni su foco, y no debe decirlo:
 * cambiarle el rol rompería la semántica de la tabla—, así que abrir la edición
 * es una comodidad para el puntero. El teclado y el lector de pantalla siguen
 * teniendo el botón «Editar», que es el camino explícito.
 *
 * Es el mismo criterio que `salesRowClickTarget` para el listado de ventas: el
 * clic de un control que vive adentro de la fila se queda con su control, y un
 * clic que cierra una selección de texto no se lleva nada puesto.
 */

/** Los elementos que se quedan con su propio clic. */
const OWN_CLICK = "a, button, select, input, textarea, label, option, optgroup, summary"

function isPlainPrimaryClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  )
}

/** Seleccionar el nombre de un cliente y soltar el botón no abre la edición. */
function endsTextSelection(): boolean {
  const selection = window.getSelection()
  return selection !== null && selection.isCollapsed === false
}

export function rowClickOpensEdit(event: MouseEvent): boolean {
  if (event.defaultPrevented) return false
  if (!isPlainPrimaryClick(event)) return false

  const target = event.target
  if (!(target instanceof Element)) return false
  if (target.closest(OWN_CLICK) !== null) return false
  if (endsTextSelection()) return false

  return true
}
