import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { VIEWS } from "../app/router"
import { createViewRegistry } from "../app/views"
import { registerViews } from "./index"

/**
 * El cableado de las vistas migradas (S2).
 *
 * Una vista que no está registrada no se intercepta: su enlace navega al
 * documento viejo. Por eso el registro y la plantilla del documento único van
 * juntos: sin `<template data-view>` el router no tiene qué clonar, y sin
 * registro no intercepta el enlace.
 */
const APP = resolve("src/components/App.astro")

describe("vistas migradas a la SPA", () => {
  // T6 cerró la migración de las pantallas con datos y T7 sumó `/new`, así que
  // ahora todas las rutas del panel tienen su `mount` y su plantilla y ningún
  // enlace de la app pide el documento. Lo único que queda fuera del router es
  // la redirección vieja `/summary`.
  it("registra las nueve vistas del panel, incluida /new", () => {
    const registry = createViewRegistry()

    registerViews(registry)

    expect(VIEWS).toHaveLength(9)
    for (const view of VIEWS) expect(registry.has(view)).toBe(true)
  })

  it("el documento único declara la plantilla de cada vista registrada", () => {
    const app = readFileSync(APP, "utf8")

    for (const view of VIEWS) {
      expect(app).toContain(`<template data-view="${view}">`)
    }
  })
})
