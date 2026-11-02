import { describe, expect, it } from "vitest"
import { DEFAULT_API_BASE, resolveApiBase } from "./api-base"

/**
 * La regla de la base de la API (S1).
 *
 * El caso que importa es el último: con `PUBLIC_API_URL` absoluta y el panel
 * servido por HTTPS, la cookie `SameSite=None` de la sesión viaja como cookie de
 * terceros y Safari —y Chrome con el bloqueo activo— la descarta. El síntoma es
 * «me loguea y me saca»: el login responde 200 y el primer `GET /auth/me` 401.
 * La base se reescribe al camino relativo, que el `rewrite` de `vercel.json`
 * manda a la API como mismo origen.
 */

const PROD_PANEL = { origin: "https://panel.example.com", protocol: "https:" }
const DEV_PANEL = { origin: "http://localhost:4321", protocol: "http:" }

describe("resolveApiBase", () => {
  it("una base relativa se respeta tal cual", () => {
    expect(resolveApiBase("/api/v1", PROD_PANEL)).toBe(DEFAULT_API_BASE)
  })

  it("una base relativa con barra final se normaliza sin la barra", () => {
    expect(resolveApiBase("/api/v1/", PROD_PANEL)).toBe("/api/v1")
  })

  it("una base ausente cae en el camino relativo, no en `undefined/api/v1`", () => {
    expect(resolveApiBase(undefined, PROD_PANEL)).toBe(DEFAULT_API_BASE)
    expect(resolveApiBase(null, PROD_PANEL)).toBe(DEFAULT_API_BASE)
    expect(resolveApiBase("   ", PROD_PANEL)).toBe(DEFAULT_API_BASE)
  })

  it("una base relativa sin barra inicial se ancla al origen", () => {
    expect(resolveApiBase("api/v1", PROD_PANEL)).toBe("/api/v1")
  })

  it("una base absoluta del mismo origen se respeta: no hay cookie de terceros", () => {
    expect(resolveApiBase("https://panel.example.com/api/v1", PROD_PANEL)).toBe(
      "https://panel.example.com/api/v1",
    )
  })

  it("en desarrollo la API vive en otro origen por HTTP y se respeta", () => {
    // El panel de desarrollo no tiene proxy: `http://localhost:3000` es la única
    // dirección válida, y sin HTTPS no aplica el problema de la cookie.
    expect(resolveApiBase("http://localhost:3000/api/v1", DEV_PANEL)).toBe(
      "http://localhost:3000/api/v1",
    )
  })

  it("en producción una base absoluta de otro origen se reescribe al camino relativo", () => {
    expect(resolveApiBase("https://shpr-production.up.railway.app/api/v1", PROD_PANEL)).toBe(
      "/api/v1",
    )
  })

  it("la reescritura conserva el camino configurado, no lo adivina", () => {
    expect(resolveApiBase("https://api.example.com/api/v2", PROD_PANEL)).toBe("/api/v2")
  })

  it("una base protocolo-relativa de otro origen también se reescribe", () => {
    expect(resolveApiBase("//api.example.com/api/v1", PROD_PANEL)).toBe("/api/v1")
  })

  it("sin navegador (SSR o build) la base configurada se respeta", () => {
    expect(resolveApiBase("https://api.example.com/api/v1", null)).toBe(
      "https://api.example.com/api/v1",
    )
  })

  it("una base que no es una URL no rompe el arranque", () => {
    expect(resolveApiBase("no-es-una-url", PROD_PANEL)).toBe("/no-es-una-url")
  })
})
