/**
 * La vista de alta de gasto de la SPA (S1, S2).
 *
 * Es el mismo `<script>` de `pages/expenses/new.astro` con tres cambios, los
 * mismos de las otras vistas migradas:
 * - El ciclo lo maneja el router: `mountExpenseNew(root)` devuelve la limpieza,
 *   que apaga el aviso pendiente para que un desmontaje a mitad de camino no
 *   mueva la URL de la pantalla que el router acaba de montar.
 * - Toda consulta al DOM se hace contra la raíz de la vista (`qs`, `root`), así
 *   que dos vistas no se pisan los `[name]` ni los `[data-error]`.
 * - Guardar es `navigateTo("/expenses")`: el listado se monta sin pedir el
 *   documento, y sus datos los pide él en su propio montaje, así que no hay
 *   cifras viejas que mostrar (S3).
 *
 * Lo que la pantalla no puede perder y por eso se conserva tal cual: la fecha
 * que abre en hoy, los contadores de caracteres, el recorte de los campos
 * opcionales (sin descripción o sin fecha no viajan), el aviso de éxito antes de
 * volver al listado y el 400 del servidor pintado en su campo —con el mensaje
 * general arriba— sin perder lo cargado.
 *
 * No hay esqueleto de arranque, y es deliberado: el formulario no espera datos.
 * Abre con los campos vacíos y la fecha de hoy, y todo lo que pinta se deriva de
 * sus propios controles, así que no hay una espera que dibujar (S2).
 */

import { on, qs as querySelector, setText } from "../core/dom"
import { ApiError, expensesApi } from "../core/api"
import { todayLocal } from "../core/date"
import { getErrorMessage, getFieldErrors } from "../core/errors"
import type { ICreateExpenseRequest } from "../core/types"
import { navigateTo } from "../app/start"

/** Lo que el aviso de éxito se queda en pantalla antes de volver al listado. */
const TOAST_HOLD_MS = 1200

export function mountExpenseNew(root: HTMLElement): () => void {
  /** El `qs` de la vista: resuelve contra la raíz, nunca contra el documento. */
  const qs = <T extends Element>(sel: string) => querySelector<T>(sel, root)

  const NAME_LIMIT = 200
  const DESC_LIMIT = 500

  const form = qs<HTMLFormElement>("[data-expense-form]")
  const submitBtn = qs<HTMLButtonElement>("[data-submit]")
  const submitLabel = qs<HTMLElement>("[data-submit-label]")
  const banner = qs<HTMLParagraphElement>("[data-form-banner]")
  // El aviso es hermano de la página y no hijo: `position: fixed` lo pone sobre
  // la pantalla, así que se busca en la raíz de la vista.
  const toast = qs<HTMLElement>("#success-toast")
  const nameInput = qs<HTMLInputElement>("#expense-name")
  const descInput = qs<HTMLTextAreaElement>("#expense-desc")
  const dateInput = qs<HTMLInputElement>("[data-expense-date]")

  /** El temporizador del aviso: uno solo, y apagado al desmontar la vista. */
  let redirectTimer: number | null = null

  function expensesUrl(): string {
    return "/expenses"
  }

  function goToList(): void {
    redirectTimer = null
    navigateTo(expensesUrl())
  }

  function paintFieldError(key: string, message: string): boolean {
    const input = qs<HTMLInputElement | HTMLTextAreaElement>(`[name="${key}"]`)
    const error = qs<HTMLElement>(`[data-error="${key}"]`)
    if (input === null || error === null) return false
    input.closest<HTMLElement>(".field")?.classList.add("field-error")
    input.setAttribute("aria-invalid", "true")
    setText(error, message)
    error.hidden = false
    return true
  }

  function clearFieldErrors(): void {
    if (banner !== null) banner.hidden = true
    for (const error of root.querySelectorAll<HTMLElement>("[data-error]")) {
      error.hidden = true
    }
    for (const wrapped of root.querySelectorAll<HTMLElement>(".field-error")) {
      wrapped.classList.remove("field-error")
    }
    for (const invalid of root.querySelectorAll<HTMLElement>("[aria-invalid]")) {
      invalid.removeAttribute("aria-invalid")
    }
  }

  /**
   * El contador del campo. El markup los llama `#name-counter` y
   * `#desc-counter`, no `#<id del input>-counter`, así que se busca dentro del
   * campo al que pertenece el control —donde vive desde siempre— y los `id`
   * siguen intactos: son contrato con QA. Eran letra muerta: el `#` armado con
   * el `id` del input no existía y los contadores no se movían nunca.
   */
  function syncCounter(input: HTMLInputElement | HTMLTextAreaElement, limit: number): void {
    const counter = input.closest(".field")?.querySelector<HTMLElement>(".field-note")
    if (counter === null || counter === undefined) return
    setText(counter, `${input.value.length} / ${limit}`)
  }

  if (nameInput !== null) {
    on(nameInput, "input", () => syncCounter(nameInput, NAME_LIMIT))
  }
  if (descInput !== null) {
    on(descInput, "input", () => syncCounter(descInput, DESC_LIMIT))
  }
  // Un valor que el navegador repuso al recargar (restauración de formulario)
  // ya está en el control cuando corre el montaje: el contador arranca con lo
  // que hay, no con el «0 / 200» del markup.
  if (nameInput !== null) syncCounter(nameInput, NAME_LIMIT)
  if (descInput !== null) syncCounter(descInput, DESC_LIMIT)

  for (const link of root.querySelectorAll<HTMLAnchorElement>("[data-cancel-link]")) {
    link.href = expensesUrl()
  }

  if (dateInput !== null) dateInput.value = todayLocal()

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault()
    if (form === null || submitBtn === null) return

    clearFieldErrors()

    const data = new FormData(form)
    const description = (data.get("description") ?? "").toString().trim()
    const expenseDate = (data.get("expense_date") ?? "").toString().trim()

    const payload: ICreateExpenseRequest = {
      name: (data.get("name") ?? "").toString().trim(),
      total: (data.get("total") ?? "").toString().trim(),
      ...(description === "" ? {} : { description }),
      ...(expenseDate === "" ? {} : { expense_date: expenseDate }),
    }

    submitBtn.disabled = true
    if (submitLabel !== null) setText(submitLabel, "Guardando…")

    try {
      await expensesApi.create(payload)
    } catch (err) {
      const fieldErrors = getFieldErrors(err instanceof ApiError ? err.message : "")
      let paintedAny = false
      for (const [key, detail] of Object.entries(fieldErrors)) {
        paintedAny = paintFieldError(key, detail) || paintedAny
      }
      if (banner !== null) {
        setText(banner, getErrorMessage(err))
        banner.hidden = false
      }
      if (!paintedAny) window.scrollTo({ top: 0, behavior: "smooth" })
      return
    } finally {
      submitBtn.disabled = false
      if (submitLabel !== null) setText(submitLabel, "Registrar gasto")
    }

    if (toast !== null) {
      toast.classList.add("is-visible")
      redirectTimer = window.setTimeout(goToList, TOAST_HOLD_MS)
    } else {
      navigateTo(expensesUrl())
    }
  }

  if (form !== null) on(form, "submit", handleSubmit)

  return () => {
    // El aviso que ya no está en pantalla no puede mover la URL: el router pudo
    // haber montado otra vista entre el guardado y el final de la espera.
    if (redirectTimer !== null) window.clearTimeout(redirectTimer)
    redirectTimer = null
  }
}
