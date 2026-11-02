import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { paintPackagePager } from "./package-pager"

/**
 * Líneas base congeladas del paginador de paquetes. Ver
 * `fixtures/packages/README.md`: no se regeneran para que pase un test.
 */
const FIXTURES = resolve("src/lib/fixtures/packages")
const PAGE = resolve("src/components/views/PackagesView.astro")

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8")
}

/**
 * El nodo `[data-pager]` REAL de la vista, cortado e inyectado como hizo el
 * arnés que generó los fixtures (con su mismo ajuste `colspan={COLS}` →
 * `colspan="5"`). No se escribe el host a mano: si cambia el markup de la
 * vista, el test tiene que notarlo.
 */
function mountPager(): HTMLElement {
  const source = readFileSync(PAGE, "utf8")
  const start = source.indexOf("\n---\n") + 5
  if (start < 5) {
    throw new Error("no se pudo cortar la región HTML de components/views/PackagesView.astro")
  }
  document.body.innerHTML = source.slice(start).replace('colspan={COLS}', 'colspan="5"')
  const pager = document.querySelector<HTMLElement>("[data-pager]")
  if (pager === null) throw new Error("la vista no trae [data-pager]")
  return pager
}

/** En un `outerHTML` que no coincide, `toBe` imprime cientos de bytes idénticos. */
function describeDiff(actual: string, expected: string): string {
  const limit = Math.min(actual.length, expected.length)
  let offset = 0
  while (offset < limit && actual[offset] === expected[offset]) offset += 1
  const from = Math.max(0, offset - 40)
  return [
    `primera diferencia en el offset ${offset}`,
    `esperado: …${expected.slice(from, offset + 80)}…`,
    `actual:   …${actual.slice(from, offset + 80)}…`,
  ].join("\n")
}

const CASES: ReadonlyArray<{ file: string; current: number; pages: number }> = [
  { file: "pager-first-page.html", current: 1, pages: 12 },
  { file: "pager-middle-page-gaps.html", current: 6, pages: 12 },
  { file: "pager-last-page.html", current: 12, pages: 12 },
  { file: "pager-short-window.html", current: 3, pages: 5 },
]

describe("package-pager: equivalencia con los fixtures congelados", () => {
  for (const { file, current, pages } of CASES) {
    it(`reproduce ${file} byte a byte`, () => {
      const pager = mountPager()
      paintPackagePager(pager, current, pages, () => undefined)
      const actual = pager.outerHTML
      const expected = fixture(file)
      expect(actual, describeDiff(actual, expected)).toBe(expected)
    })
  }
})

describe("package-pager: navegación inyectada", () => {
  // El paginador local no cierra sobre `goToPage`: lo recibe por parámetro. Esto
  // prueba que el cableado sigue llegando a la página correcta.
  it("los botones llaman a goToPage con la página destino", () => {
    const pager = mountPager()
    const goToPage = vi.fn()
    paintPackagePager(pager, 6, 12, goToPage)

    const button = (label: string): HTMLButtonElement | undefined =>
      [...pager.querySelectorAll("button")].find((entry) => entry.textContent === label)

    button("Anterior")?.click()
    button("Siguiente")?.click()
    button("5")?.click()

    expect(goToPage.mock.calls.map(([page]) => page)).toEqual([5, 7, 5])
  })

  it("un host ausente no revienta", () => {
    expect(() => paintPackagePager(null, 1, 3, () => undefined)).not.toThrow()
  })
})
