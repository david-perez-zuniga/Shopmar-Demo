import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * La vista de paquetes pagina y filtra sin recargar el documento (D-013, S2).
 *
 * Antes la garantía se tomaba sobre el `<script>` embebido en
 * `pages/packages/index.astro`; hoy el script es el módulo de la vista, así que
 * la aserción se toma sobre ese archivo. Lo que se exige es lo mismo: la
 * navegación interna mueve la URL con el primitivo del router y vuelve a pedir
 * sólo la lista. Un `window.location.assign` acá reconstruye la pantalla entera
 * —HTML, scripts y estilos— para cambiar diez filas, que es justo lo que la
 * decisión descarta.
 *
 * El `popstate` ya no vive en la vista: lo atiende el router, que remonta la
 * vista de la URL. Por eso acá se exige lo contrario que antes: que la vista no
 * registre su propio listener.
 */
const source = readFileSync(resolve("src/lib/views/packages-list.ts"), "utf8")

describe("packages-nav", () => {
  it("navega con el primitivo del router, no con location.assign", () => {
    // `pushQuery` mueve la URL sin remontar la vista; el repintado lo hace ella.
    expect(source).toMatch(/import \{ pushQuery \} from "\.\.\/app\/start"/)
    expect(source).toMatch(/pushQuery\(url\)/)
    expect(source).not.toMatch(/window\.location\.assign/)
    expect(source).not.toMatch(/window\.history\.pushState/)
  })

  it("registra la lista y sólo la lista al cambiar de página", () => {
    // El paginador mueve el número de página por la misma navegación interna.
    expect(source).toMatch(/navigateWithinView\(pageHref\(/)
    // El tamaño de página ya no se elige (S41): no hay `perPageHref` que navegue.
    expect(source).not.toMatch(/perPageHref/)
    expect(source).not.toMatch(/id="per-page"/)
  })

  it("el botón atrás/adelante no lo maneja la vista: lo remonta el router", () => {
    expect(source).not.toMatch(/addEventListener\("popstate"/)
    expect(source).not.toMatch(/removeEventListener\("popstate"/)
  })

  it("descarta la respuesta que llega tarde", () => {
    // Dos cargas solapadas son posibles ahora que no hay recarga de documento.
    expect(source).toMatch(/let loadToken = 0/)
    expect(source).toMatch(/token !== loadToken/)
  })
})
