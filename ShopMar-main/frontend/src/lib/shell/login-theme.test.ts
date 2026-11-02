import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Cambiar el tema en `/login`.
 *
 * El login es un documento propio: no hereda la barra lateral, así que el botón
 * de tema tiene que estar escrito ahí y el módulo del armazón
 * (`lib/shell/theme-toggle.ts`) inicializado en su script. `ThemeBoot` ya evita
 * el parpadeo con el tema guardado; lo que faltaba era poder cambiarlo antes de
 * entrar. Se fija leyendo el documento, como la instalación.
 */
const LOGIN = resolve("src/pages/login.astro")

function source(): string {
  return readFileSync(LOGIN, "utf8")
}

describe("el login deja cambiar el tema", () => {
  it("trae el botón del tema con los ganchos que busca el módulo", () => {
    const markup = source()

    expect(markup).toMatch(/data-theme-toggle/)
    expect(markup).toMatch(/aria-label="Cambiar tema"/)
    expect(markup).toMatch(/aria-pressed="false"/)
    // Los dos rótulos y los dos íconos: la hoja muestra el que corresponde al
    // modo activo, igual que en la barra lateral.
    expect(markup).toMatch(/login-theme-label--light">Modo claro/)
    expect(markup).toMatch(/login-theme-label--dark">Modo oscuro/)
    expect(markup).toMatch(/login-theme-icon--light/)
    expect(markup).toMatch(/login-theme-icon--dark/)
  })

  it("lo inicializa con el mismo módulo del armazón", () => {
    const markup = source()

    expect(markup).toMatch(/from "\.\.\/lib\/shell\/theme-toggle"/)
    expect(markup).toMatch(/initThemeToggle\(\)/)
  })
})
