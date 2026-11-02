import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { tooltipPosition } from "./chart-tooltip"

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures")

type Caso = {
  input: {
    clientX: number
    clientY: number
    rect: { left: number; top: number; width: number; height: number }
    tooltipWidth: number
    tooltipHeight: number
  }
  output: { left: number; top: number }
}

const CASOS: Caso[] = JSON.parse(
  readFileSync(join(FIXTURES_DIR, "chart-tooltip.json"), "utf8"),
) as Caso[]

describe("tooltipPosition", () => {
  for (const [i, caso] of CASOS.entries()) {
    it(`reproduce el caso ${i + 1} de chart-tooltip.json sin redondear`, () => {
      const { clientX, clientY, rect, tooltipWidth, tooltipHeight } = caso.input
      const resultado = tooltipPosition(clientX, clientY, rect, tooltipWidth, tooltipHeight)
      expect(Object.is(resultado.left, caso.output.left)).toBe(true)
      expect(Object.is(resultado.top, caso.output.top)).toBe(true)
    })
  }

  // Rect igual al de los fixtures, pero con tamaño de tooltip que el JSON no
  // cubre (los grabados usan 120/200 × 40/60).
  const RECT = { left: 40, top: 100, width: 800, height: 320 }

  it("recorta al mínimo en ambos ejes con un tooltip de 90 × 30", () => {
    const resultado = tooltipPosition(-1000, -1000, RECT, 90, 30)
    expect(Object.is(resultado.left, 90 / 2 + 4)).toBe(true)
    expect(Object.is(resultado.top, 6)).toBe(true)
  })

  it("recorta al máximo en ambos ejes con un tooltip de 90 × 30", () => {
    const resultado = tooltipPosition(1000, 1000, RECT, 90, 30)
    expect(Object.is(resultado.left, 800 - 90 / 2 - 4)).toBe(true)
    expect(Object.is(resultado.top, 320 - 30 - 6)).toBe(true)
  })

  it("recorta al mínimo y al máximo con un tooltip de 50 × 20", () => {
    const min = tooltipPosition(-1000, -1000, RECT, 50, 20)
    expect(Object.is(min.left, 50 / 2 + 4)).toBe(true)
    expect(Object.is(min.top, 6)).toBe(true)

    const max = tooltipPosition(1000, 1000, RECT, 50, 20)
    expect(Object.is(max.left, 800 - 50 / 2 - 4)).toBe(true)
    expect(Object.is(max.top, 320 - 20 - 6)).toBe(true)
  })
})
