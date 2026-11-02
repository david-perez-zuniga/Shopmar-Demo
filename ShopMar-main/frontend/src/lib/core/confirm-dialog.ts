/**
 * El diálogo nativo de confirmación, en un solo lugar.
 *
 * Antes esta lógica vivía en el `<script>` de `ConfirmDialog.astro`, que corre
 * una vez al cargar el documento. Con la SPA el diálogo viaja dentro de una
 * plantilla, así que ese script no lo encuentra cuando corre: la vista lo
 * cablea después de montar. Tener el cableado acá evita la copia que había
 * quedado en la vista —y el fallback— sobre una acción que borra datos.
 *
 * `wireConfirmDialog` es idempotente (`data-wired`): llamarlo dos veces no
 * duplica listeners ni promesas.
 */

export interface IConfirmDialogElement extends HTMLDialogElement {
  showConfirm: () => Promise<boolean>
}

/** Prepara el diálogo que haya debajo de `root` y le cuelga `showConfirm`. */
export function wireConfirmDialog(root: ParentNode = document): IConfirmDialogElement | null {
  const dialog = root.querySelector<HTMLDialogElement>("dialog.confirm-dialog")
  if (dialog === null) return null

  const wired = dialog as IConfirmDialogElement
  if (dialog.dataset.wired === "true") return wired
  dialog.dataset.wired = "true"

  let pending: ((confirmed: boolean) => void) | null = null

  dialog.addEventListener("close", () => {
    // El `returnValue` es lo que decide el `<form method="dialog">`: sólo
    // `confirm` borra. Cualquier otra salida (Cancelar, Escape, backdrop) no.
    const confirmed = dialog.returnValue === "confirm"
    dialog.returnValue = ""
    pending?.(confirmed)
    pending = null
  })

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close("cancel")
  })

  dialog
    .querySelector<HTMLButtonElement>('button[value="cancel"]')
    ?.addEventListener("click", () => dialog.close("cancel"))

  wired.showConfirm = () =>
    new Promise<boolean>((resolve) => {
      pending = resolve
      dialog.showModal()
    })

  return wired
}

/**
 * Pregunta con el diálogo de la vista. Devuelve `null` cuando no hay diálogo:
 * quien llama decide, pero **nunca** debe interpretar `null` como un sí.
 */
export function askConfirmWith(
  root: ParentNode,
  message: string,
): Promise<boolean> | null {
  const dialog = wireConfirmDialog(root)
  if (dialog === null) return null
  const text = dialog.querySelector<HTMLElement>("#confirm-message")
  if (text !== null) text.textContent = message
  return dialog.showConfirm()
}
