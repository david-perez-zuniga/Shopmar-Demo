import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * El botón «Instalar aplicación» en `/login`.
 *
 * El login es un documento propio, no una vista de la SPA, así que no hereda
 * nada del armazón: el manifiesto, las metas de iOS y el bloque de instalación
 * tienen que estar escritos ahí. Sin `manifest` el navegador no considera la
 * pantalla instalable y `beforeinstallprompt` no llega nunca; sin el registro del
 * service worker tampoco hay instalación que ofrecer. Es una regla de marcado y
 * se fija leyendo el documento, como las que atan la navegación del armazón a sus
 * scripts.
 */
const LOGIN = resolve("src/pages/login.astro")

function source(): string {
  return readFileSync(LOGIN, "utf8")
}

describe("el login ofrece instalar la aplicación", () => {
  it("declara el manifiesto y las metas de iOS que hacen instalable la pantalla", () => {
    expect(source()).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest" \/>/)
    expect(source()).toMatch(/<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png" \/>/)
    expect(source()).toMatch(/name="apple-mobile-web-app-capable"/)
    expect(source()).toMatch(/name="apple-mobile-web-app-title" content="ShopMar"/)
  })

  it("trae el bloque de instalación del armazón y lo inicializa", () => {
    const markup = source()

    expect(markup).toMatch(/data-install-block hidden/)
    expect(markup).toMatch(/data-install-button hidden/)
    expect(markup).toMatch(/data-install-hint hidden/)
    expect(markup).toMatch(/Instalar aplicación/)
    expect(markup).toMatch(/from "\.\.\/lib\/shell\/install-prompt"/)
    expect(markup).toMatch(/initInstallPrompt\(\)/)
    // El service worker es la otra mitad: sin él no hay instalación que ofrecer.
    expect(markup).toMatch(/from "\.\.\/lib\/shell\/pwa"/)
    expect(markup).toMatch(/initPwa\(\)/)
  })
})
