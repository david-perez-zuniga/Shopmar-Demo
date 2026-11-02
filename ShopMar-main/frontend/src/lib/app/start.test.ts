import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ISessionGate } from "../auth/guard"
import { APP_NAVIGATED } from "./events"
import { startApp } from "./start"
import { createViewRegistry } from "./views"
import type { ViewId } from "./router"
import { viewStateKey } from "./view-state"
import { STORAGE_GENERATION, STORAGE_GENERATION_KEY } from "../core/storage-reset"

/**
 * El contrato de navegación del router (S1, S3).
 *
 * La regresión que fija: **la URL se mueve antes de montar la vista**. Cuando
 * se pintaba primero, una vista que lee `window.location` en su montaje veía la
 * pantalla anterior, así que el detalle abierto desde una fila decía «no
 * encontramos esa venta». Por eso el registro se inyecta: se prueba el orden de
 * la navegación con vistas falsas, sin levantar las vistas reales ni pedir red.
 */

function buildDoc(): Document {
  const doc = document.implementation.createHTMLDocument("spa")
  doc.body.innerHTML = `
    <main class="shell-main">
      <div data-app-root></div>
    </main>
    <template data-view="sales"><p data-marker="sales"></p></template>
    <template data-view="expenses"><p data-marker="expenses"></p></template>
    <a id="link-gastos" href="/expenses?page=2">Gastos</a>
    <a id="link-alta" href="/sales/new">Alta</a>
  `
  return doc
}

function click(doc: Document, id: string, init: MouseEventInit = {}): void {
  const link = doc.getElementById(id)
  if (link === null) throw new Error(`sin enlace ${id}`)
  link.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }),
  )
}

describe("navegación del router", () => {
  let seen: Array<{ view: ViewId; url: string }>

  beforeEach(() => {
    seen = []
    window.history.replaceState(null, "", "/")
  })

  afterEach(() => {
    window.history.replaceState(null, "", "/")
    document.body.innerHTML = ""
  })

  function start(doc: Document): void {
    const registry = createViewRegistry()
    for (const view of ["sales", "expenses"] as const) {
      registry.register(view, () => {
        // Lo primero que hace una vista real: leer la URL para saber qué pedir.
        seen.push({ view, url: `${window.location.pathname}${window.location.search}` })
      })
    }
    // Estas pruebas son del router, no de la sesión: el guard se apaga para no
    // pedir red. El guard tiene sus propias pruebas en `lib/auth/guard.test.ts`
    // y en el bloque «el guard en el arranque» de este archivo.
    startApp(doc, { registry, window, gate: null })
  }

  it("monta la vista de la URL actual con su plantilla clonada", () => {
    window.history.replaceState(null, "", "/sales")
    const doc = buildDoc()

    start(doc)

    expect(seen).toEqual([{ view: "sales", url: "/sales" }])
    expect(doc.querySelector('.app-view[data-view="sales"] [data-marker="sales"]')).not.toBeNull()
  })

  it("mueve la URL antes de montar: la vista ve la pantalla nueva, no la anterior", () => {
    window.history.replaceState(null, "", "/sales")
    const doc = buildDoc()
    start(doc)

    click(doc, "link-gastos")

    expect(window.location.pathname).toBe("/expenses")
    expect(window.location.search).toBe("?page=2")
    // La aserción que habría atrapado el defecto: en el montaje ya se lee la URL nueva.
    expect(seen.at(-1)).toEqual({ view: "expenses", url: "/expenses?page=2" })
    expect(doc.querySelector('.app-view[data-view="expenses"]')).not.toBeNull()
    expect(doc.title).toBe("Gastos · ShopMar")
  })

  it("avisa al armazón en cada montaje: así el cajón se cierra al navegar", () => {
    window.history.replaceState(null, "", "/sales")
    const doc = buildDoc()
    const avisos: string[] = []
    doc.addEventListener(APP_NAVIGATED, () => avisos.push(window.location.pathname))

    start(doc)
    click(doc, "link-gastos")

    expect(avisos).toEqual(["/sales", "/expenses"])
  })

  it("una ruta sin vista registrada no se intercepta", () => {
    window.history.replaceState(null, "", "/sales")
    const doc = buildDoc()
    start(doc)
    const before = window.location.pathname

    click(doc, "link-alta")

    expect(seen).toHaveLength(1)
    expect(window.location.pathname).toBe(before)
  })

  it("un clic con modificador no navega: abre en otra pestaña", () => {
    window.history.replaceState(null, "", "/sales")
    const doc = buildDoc()
    start(doc)

    click(doc, "link-gastos", { ctrlKey: true })

    expect(seen).toHaveLength(1)
    expect(window.location.pathname).toBe("/sales")
  })
})

/**
 * El guard corre **antes** de montar la primera vista (T6, D7): la vista se
 * monta con la sesión ya decidida, y un error de red no manda a `/login`.
 */
describe("el guard en el arranque", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/")
    document.body.innerHTML = ""
  })

  const mounted: ViewId[] = []
  beforeEach(() => {
    mounted.length = 0
    window.history.replaceState(null, "", "/sales")
  })

  function boot(gate: ISessionGate, navigate = vi.fn()): { doc: Document; navigate: typeof navigate } {
    const doc = buildDoc()
    const registry = createViewRegistry()
    registry.register("sales", () => {
      mounted.push("sales")
    })
    startApp(doc, { registry, window, gate, navigate })
    return { doc, navigate }
  }

  const flush = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it("un 401 del guard manda a /login sin montar la vista", async () => {
    const { doc, navigate } = boot({
      check: () => Promise.resolve({ action: "redirect", href: "/login?next=%2Fsales" }),
    })

    await flush()

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith("/login?next=%2Fsales")
    expect(mounted).toEqual([])
    expect(doc.querySelector(".app-view")).toBeNull()
  })

  it("sin decisión (red caída) muestra el aviso de sin conexión con reintento, no /login", async () => {
    let attempt = 0
    const { doc, navigate } = boot({
      check: () => {
        attempt += 1
        return Promise.resolve(
          attempt === 1 ? { action: "undecided" } : { action: "mount" },
        )
      },
    })

    await flush()

    expect(navigate).not.toHaveBeenCalled()
    expect(mounted).toEqual([])
    const offline = doc.querySelector("[data-session-offline]")
    expect(offline).not.toBeNull()
    expect(offline?.textContent).toContain("Sin conexión")

    // El reintento vuelve a preguntar: cuando la red vuelve, monta lo pedido.
    doc.querySelector<HTMLButtonElement>("[data-session-retry]")?.click()
    await flush()

    expect(navigate).not.toHaveBeenCalled()
    expect(mounted).toEqual(["sales"])
    expect(doc.querySelector("[data-session-offline]")).toBeNull()
  })

  it("con la vista ya decidida se monta con su plantilla clonada", async () => {
    const { doc } = boot({ check: () => Promise.resolve({ action: "mount" }) })

    await flush()

    expect(mounted).toEqual(["sales"])
    expect(doc.querySelector('.app-view[data-view="sales"] [data-marker="sales"]')).not.toBeNull()
  })

  it("un guard que falla no expulsa a nadie: queda el aviso y el reintento", async () => {
    const { doc, navigate } = boot({ check: () => Promise.reject(new Error("boom")) })

    await flush()

    expect(navigate).not.toHaveBeenCalled()
    expect(doc.querySelector("[data-session-offline]")).not.toBeNull()
  })
})

/**
 * La consulta de una lista sobrevive a la vuelta (S58).
 *
 * La regresión que fija: con «Últimos 7 días» elegido, abrir una venta y volver
 * al listado mostraba «Hoy» otra vez, porque el enlace de regreso es la ruta
 * pelada. Ahora la última consulta de cada pantalla se recuerda durante la
 * sesión y el router la recupera al entrar sin query.
 */
describe("el estado de la lista se recuerda", () => {
  const RANGO = "?start_date=2026-03-01&end_date=2026-03-07"

  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    window.sessionStorage.clear()
    window.history.replaceState(null, "", "/")
    document.body.innerHTML = ""
  })

  function buildListDoc(): Document {
    const doc = document.implementation.createHTMLDocument("lista")
    doc.body.innerHTML = `
      <main class="shell-main">
        <div data-app-root></div>
      </main>
      <a id="link-detalle" href="/sales/detail?id=s-1">Ver detalle</a>
      <a id="link-volver" href="/sales">Volver</a>
      <a id="link-limpiar" href="/sales" data-filter-clear hidden>Limpiar</a>
      <template data-view="sales"><p data-marker="sales"></p></template>
      <template data-view="sale-detail"><p data-marker="detalle"></p></template>
    `
    return doc
  }

  /** Monta la app con vistas falsas que solo anotan la URL que ven al montar. */
  function startList(doc: Document, seen: Array<{ view: ViewId; url: string }>): void {
    const registry = createViewRegistry()
    for (const view of ["sales", "sale-detail"] as const) {
      registry.register(view, () => {
        seen.push({ view, url: `${window.location.pathname}${window.location.search}` })
      })
    }
    startApp(doc, { registry, window, gate: null })
  }

  it("volver del detalle al listado conserva el rango", () => {
    window.history.replaceState(null, "", `/sales${RANGO}`)
    const seen: Array<{ view: ViewId; url: string }> = []
    const doc = buildListDoc()
    startList(doc, seen)

    click(doc, "link-detalle")
    expect(window.location.pathname).toBe("/sales/detail")

    click(doc, "link-volver")

    expect(window.location.pathname).toBe("/sales")
    expect(window.location.search).toBe(RANGO)
    expect(seen.at(-1)).toEqual({ view: "sales", url: `/sales${RANGO}` })
  })

  it("«Limpiar» olvida la consulta: la vuelta siguiente ya no la recupera", () => {
    window.history.replaceState(null, "", `/sales${RANGO}`)
    const seen: Array<{ view: ViewId; url: string }> = []
    const doc = buildListDoc()
    startList(doc, seen)

    click(doc, "link-limpiar")
    expect(window.location.search).toBe("")

    click(doc, "link-detalle")
    click(doc, "link-volver")

    expect(window.location.search).toBe("")
    expect(seen.at(-1)).toEqual({ view: "sales", url: "/sales" })
  })

  it("atrás y adelante mandan sobre el recuerdo: la entrada manda", () => {
    window.history.replaceState(null, "", `/sales${RANGO}`)
    const seen: Array<{ view: ViewId; url: string }> = []
    const doc = buildListDoc()
    startList(doc, seen)

    // La entrada vieja del historial no tenía filtros: volver a ella no puede
    // reescribirla, o el botón atrás dejaría de cambiar lo que se ve.
    window.history.replaceState(null, "", "/sales")
    window.dispatchEvent(new Event("popstate"))

    expect(window.location.search).toBe("")
    expect(seen.at(-1)).toEqual({ view: "sales", url: "/sales" })
  })

  it("la primera entrada recupera la consulta y la escribe en la URL", () => {
    // Lo que dejó una visita anterior de esta misma pestaña.
    window.sessionStorage.setItem(viewStateKey("/sales"), "?page=2")
    window.history.replaceState(null, "", "/sales")
    const seen: Array<{ view: ViewId; url: string }> = []
    const doc = buildListDoc()

    startList(doc, seen)

    expect(window.location.search).toBe("?page=2")
    expect(seen).toEqual([{ view: "sales", url: "/sales?page=2" }])
  })
})

/**
 * La invalidación de la caché local en el arranque (S1).
 *
 * La copia del `me` es lo único del navegador que sostiene una sesión que el
 * servidor ya no confirma. Subir `STORAGE_GENERATION` la borra una vez, antes de
 * que el guard la lea, y deja intacto lo que no depende de la sesión.
 */
describe("la invalidación de la caché local en el arranque", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState(null, "", "/sales")
  })

  afterEach(() => {
    window.localStorage.clear()
    window.history.replaceState(null, "", "/")
  })

  function boot(): void {
    const doc = buildDoc()
    const registry = createViewRegistry()
    registry.register("sales", () => undefined)
    startApp(doc, {
      registry,
      window,
      gate: { check: () => Promise.resolve({ action: "mount" }) },
      navigate: vi.fn(),
    })
  }

  it("borra la copia del me de una generación anterior y anota la vigente", () => {
    window.localStorage.setItem("shopmar:me:v1", "{}")
    window.localStorage.setItem("shopmar:sale-draft:live:v1", "{}")

    boot()

    expect(window.localStorage.getItem("shopmar:me:v1")).toBeNull()
    expect(window.localStorage.getItem(STORAGE_GENERATION_KEY)).toBe(
      String(STORAGE_GENERATION),
    )
    // Un borrador de venta a medio cargar no es caché: sobrevive.
    expect(window.localStorage.getItem("shopmar:sale-draft:live:v1")).toBe("{}")
  })

  it("un dispositivo que ya pasó la generación conserva su copia del me", () => {
    window.localStorage.setItem(STORAGE_GENERATION_KEY, String(STORAGE_GENERATION))
    window.localStorage.setItem("shopmar:me:v1", "{}")

    boot()

    expect(window.localStorage.getItem("shopmar:me:v1")).toBe("{}")
  })
})
