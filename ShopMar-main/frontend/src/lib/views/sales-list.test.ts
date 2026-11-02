import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * La vista de ventas de la SPA: filtrar no recarga el documento (S58, D-013).
 *
 * La regresión que fija: cambiar el período en `/sales` hacía
 * `window.location.assign`, así que el navegador reconstruía la pantalla entera
 * —HTML, scripts y estilos— para cambiar diez filas, mientras paquetes y gastos
 * ya movían la URL con el router y sólo volvían a pedir la lista. Acá se mira el
 * módulo, porque la conducta observable —un solo `load` del documento al
 * cambiar el período— la fija el caso E2E `qa/tests/filtros-recordados.spec.ts`
 * (TC-NAV-009): montar esta vista en jsdom no sirve, porque su marcado es un
 * componente de Astro con expresiones que no se pueden clonar como HTML.
 */
const MODULE = resolve("src/lib/views/sales-list.ts")

describe("vista de ventas: filtrar sin recargar el documento", () => {
  it("el módulo filtra con el primitivo del router y no recarga el documento", () => {
    const source = readFileSync(MODULE, "utf8")

    expect(source).toMatch(/import \{ pushQuery \} from "\.\.\/app\/start"/)
    expect(source).toMatch(/pushQuery\(url\)/)
    // Con el paréntesis: el comentario del módulo nombra la recarga que se quitó.
    expect(source).not.toMatch(/window\.location\.assign\(/)
    expect(source).not.toMatch(/location\.reload\(/)
    expect(source).not.toMatch(/addEventListener\("popstate"/)
    expect(source).not.toMatch(/removeEventListener\("popstate"/)
  })

  it("después de mover la URL re-lee su estado y vuelve a pedir la lista", () => {
    const source = readFileSync(MODULE, "utf8")

    // El orden es la regla: con la URL ya movida, la hidratación de los controles
    // y el pedido leen el filtro nuevo. Al revés, la tabla pediría el rango viejo.
    expect(source).toMatch(/pushQuery\(url\)\s*\n\s*hydrateFromUrl\(\)\s*\n\s*void load\(\)/)
  })
})
