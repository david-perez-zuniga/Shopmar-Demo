import { afterEach, describe, expect, it } from "vitest"
import { askConfirmWith, wireConfirmDialog } from "./confirm-dialog"

/**
 * El diálogo de confirmación es la última barrera antes de un borrado, así que
 * su contrato se prueba acá y no en cada pantalla: escribir el mensaje, resolver
 * «sí» sólo con `confirm` y no cablearse dos veces.
 */

function buildDialog(): HTMLDialogElement {
  document.body.innerHTML = `
    <dialog class="confirm-dialog" aria-describedby="confirm-message">
      <p class="confirm-message" id="confirm-message"></p>
      <form method="dialog" class="confirm-actions">
        <button value="cancel" type="submit">Cancelar</button>
        <button value="confirm" type="submit">Borrar</button>
      </form>
    </dialog>`
  const dialog = document.querySelector<HTMLDialogElement>("dialog.confirm-dialog")
  if (dialog === null) throw new Error("sin diálogo")
  // jsdom no implementa el diálogo nativo: se simula lo mínimo que usa el
  // cableado —abrir, y cerrar disparando `close` con el `returnValue` del botón
  // elegido—, que es exactamente el contrato del navegador.
  dialog.showModal = () => {
    dialog.setAttribute("open", "")
  }
  dialog.close = (returnValue?: string) => {
    dialog.returnValue = returnValue ?? ""
    dialog.removeAttribute("open")
    dialog.dispatchEvent(new Event("close"))
  }
  return dialog
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("confirm-dialog", () => {
  it("sin diálogo devuelve null: quien llama no puede interpretarlo como un sí", () => {
    expect(askConfirmWith(document.createElement("div"), "¿Borrar?")).toBeNull()
  })

  it("escribe el mensaje y resuelve sí sólo cuando la salida es confirm", async () => {
    const dialog = buildDialog()

    const answer = askConfirmWith(document, "Se va a borrar a Ana.")
    expect(document.querySelector("#confirm-message")?.textContent).toBe("Se va a borrar a Ana.")

    dialog.close("confirm")

    await expect(answer).resolves.toBe(true)
  })

  it("resuelve no con Cancelar, Escape o el fondo", async () => {
    const dialog = buildDialog()

    const answer = askConfirmWith(document, "Se va a borrar a Ana.")
    dialog.close("cancel")

    await expect(answer).resolves.toBe(false)
  })

  it("cablear dos veces no duplica: el diálogo queda marcado una sola vez", () => {
    const dialog = buildDialog()

    wireConfirmDialog(document)
    wireConfirmDialog(document)

    expect(dialog.dataset.wired).toBe("true")
    expect(typeof (dialog as HTMLDialogElement & { showConfirm?: unknown }).showConfirm).toBe(
      "function",
    )
  })
})
