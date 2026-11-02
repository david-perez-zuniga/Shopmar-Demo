import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { axisText, layoutBarChart, renderBarChart, xLabelStep, type BarChartMode } from "./bar-chart"
import type { IDailySeriesPoint } from "../core/types"

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures")

// La misma serie con la que se generó la línea base: tiene que coincidir
// carácter por carácter con la de `fixtures/`.
const DIARIO: IDailySeriesPoint[] = [
  { date: "2026-10-08", label: "08/10", income: "1250.50", expense: "300.00" },
  { date: "2026-10-09", label: "09/10", income: "4837500.00", expense: "0.00" },
  { date: "2026-10-10", label: "10/10", income: "0.00", expense: "12500.00" },
  { date: "2026-10-11", label: "11/10", income: "800.00", expense: "80.00" },
  { date: "2026-10-12", label: "12/10", income: "95000.00", expense: "12300.00" },
  { date: "2026-10-13", label: "13/10", income: "0.00", expense: "0.00" },
  { date: "2026-10-14", label: "14/10", income: "2400.00", expense: "1500.00" },
]

const CASOS: { fixture: string; width: number; mode: BarChartMode }[] = [
  { fixture: "bar-chart-900-both.html", width: 900, mode: "both" },
  { fixture: "bar-chart-400-both.html", width: 400, mode: "both" },
  { fixture: "bar-chart-900-income.html", width: 900, mode: "income" },
]

function fixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8")
}

/**
 * Reporte legible del primer byte distinto. Devuelve `""` solo cuando los dos
 * textos son idénticos: por eso el `expect(...).toBe("")` es la aserción de
 * byte a byte. Un `toBe` sobre 6 KB de marcado sería ilegible al romperse.
 */
function describeMismatch(actual: string, expected: string): string {
  if (actual === expected) return ""
  const limit = Math.min(actual.length, expected.length)
  let at = 0
  while (at < limit && actual[at] === expected[at]) at += 1
  const from = Math.max(0, at - 60)
  const window = (value: string): string => JSON.stringify(value.slice(from, at + 60))
  return [
    `Primer byte distinto en el offset ${at} (fixture ${expected.length} bytes, render ${actual.length} bytes)`,
    `  esperado: ${window(expected)}`,
    `  recibido: ${window(actual)}`,
  ].join("\n")
}

// El mismo montaje que usó el arnés que generó la línea base: así el camino de
// serialización (`innerHTML`) es idéntico.
function mount(width: number): HTMLElement {
  const container = document.createElement("div")
  Object.defineProperty(container, "clientWidth", { value: width, configurable: true })
  document.body.append(container)
  return container
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("renderBarChart", () => {
  for (const caso of CASOS) {
    it(`reproduce ${caso.fixture} byte a byte`, () => {
      const container = mount(caso.width)
      renderBarChart(container, DIARIO, caso.mode)
      expect(describeMismatch(container.innerHTML, fixture(caso.fixture))).toBe("")
    })
  }

  it("no hace nada con un contenedor nulo", () => {
    expect(() => renderBarChart(null, DIARIO, "both")).not.toThrow()
  })
})

describe("layoutBarChart", () => {
  const layout = (over: { width?: number; mode?: BarChartMode } = {}) =>
    layoutBarChart(DIARIO, { width: 900, mode: "both", ...over })

  it("ramifica en narrow por debajo de 480 px", () => {
    expect(layout({ width: 900 }).narrow).toBe(false)
    expect(layout({ width: 400 }).narrow).toBe(true)
  })

  it("estrecha el eje y en la rama narrow", () => {
    expect(layout({ width: 900 }).yAxisWidth).toBe(84)
    expect(layout({ width: 400 }).yAxisWidth).toBe(56)
  })

  it("usa un ancho de barra fijo en la rama narrow", () => {
    expect(layout({ width: 400 }).barWidth).toBe(13)
  })

  it("marca vacía una serie sin puntos", () => {
    expect(layoutBarChart([], { width: 900, mode: "both" }).empty).toBe(true)
  })

  it("marca vacía una serie sin nada visible", () => {
    const ceros: IDailySeriesPoint[] = [
      { date: "2026-10-08", label: "08/10", income: "0.00", expense: "0.00" },
    ]
    expect(layoutBarChart(ceros, { width: 900, mode: "both" }).empty).toBe(true)
  })

  it("el modo filtra qué tipos aparecen", () => {
    const income = layoutBarChart(DIARIO, { width: 900, mode: "income" })
    expect(income.bars.length).toBeGreaterThan(0)
    expect(income.bars.every((bar) => bar.type === "income")).toBe(true)

    const expense = layoutBarChart(DIARIO, { width: 900, mode: "expense" })
    expect(expense.bars.length).toBeGreaterThan(0)
    expect(expense.bars.every((bar) => bar.type === "expense")).toBe(true)
  })
})

// Las 24 horas de un día tal como las manda la API (S1): etiquetas `HH:00` y
// tres horas con movimiento.
const HORAS: IDailySeriesPoint[] = Array.from({ length: 24 }, (_, hour) => {
  const label = `${String(hour).padStart(2, "0")}:00`
  const date = `2026-10-21T${String(hour).padStart(2, "0")}:00:00.000Z`
  const income = hour === 9 ? "1250.50" : hour === 17 ? "800.00" : "0.00"
  const expense = hour === 17 ? "80.00" : "0.00"
  return { date, label, income, expense }
})

describe("xLabelStep", () => {
  it("no adelgaza cuando la etiqueta entra en el paso", () => {
    expect(xLabelStep(["00:00", "01:00"], 100)).toBe(1)
  })

  it("adelgaza al múltiplo más chico que deja entrar la etiqueta más larga", () => {
    // 5 caracteres a 11px + separación: 37px. Con 32px de paso hace falta 2.
    expect(xLabelStep(["00:00"], 32)).toBe(2)
    expect(xLabelStep(["00:00"], 20)).toBe(2)
    expect(xLabelStep(["00:00"], 16)).toBe(3)
    expect(xLabelStep(["00:00"], 12)).toBe(4)
  })

  it("no pasa del último paso cuando ni el más ancho alcanza", () => {
    expect(xLabelStep(["00:00"], 4)).toBe(12)
  })

  it("sin etiquetas no adelgaza", () => {
    expect(xLabelStep([], 40)).toBe(1)
  })
})

describe("axisText", () => {
  it("una etiqueta de hora pasa a la hora de reloj con am/pm", () => {
    expect(axisText("00:00")).toBe("12 am")
    expect(axisText("01:00")).toBe("1 am")
    expect(axisText("09:00")).toBe("9 am")
    expect(axisText("11:00")).toBe("11 am")
    expect(axisText("12:00")).toBe("12 pm")
    expect(axisText("13:00")).toBe("1 pm")
    expect(axisText("19:00")).toBe("7 pm")
    expect(axisText("23:00")).toBe("11 pm")
  })

  it("una etiqueta de día se dibuja tal cual", () => {
    expect(axisText("Mié 21")).toBe("Mié 21")
    expect(axisText("08/10")).toBe("08/10")
  })
})

describe("layoutBarChart con las horas de un día", () => {
  const layout = layoutBarChart(HORAS, { width: 900, mode: "both" })

  it("reparte el ancho entre 24 horas: la barra deja de ser una sola barra ancha", () => {
    expect(layout.narrow).toBe(false)
    expect(layout.barWidth).toBeLessThanOrEqual(24)
    expect(layout.barWidth).toBeGreaterThanOrEqual(8)
  })

  it("rotula las 24 horas una por una, con am/pm y sin adelgazar", () => {
    expect(layout.xLabels.map((xLabel) => xLabel.text)).toEqual([
      "12 am", "1 am", "2 am", "3 am", "4 am", "5 am", "6 am", "7 am", "8 am",
      "9 am", "10 am", "11 am", "12 pm", "1 pm", "2 pm", "3 pm", "4 pm", "5 pm",
      "6 pm", "7 pm", "8 pm", "9 pm", "10 pm", "11 pm",
    ])
  })

  it("deja más aire entre barras que el ancho de la barra, para que la etiqueta entre", () => {
    const separacion = layout.gapOuter
    expect(separacion).toBeGreaterThan(layout.barWidth)
    expect(layout.barWidth + separacion).toBeGreaterThanOrEqual(37)
  })

  it("el rótulo completo de la hora sigue vivo en la barra", () => {
    expect(layout.xLabels[19]?.label).toBe("19:00")
    expect(layout.bars[0]?.label).toBe("09:00")
  })

  it("dibuja una barra por hora con movimiento", () => {
    expect(layout.bars).toHaveLength(3)
    expect(layout.bars.map((bar) => bar.label)).toEqual(["09:00", "17:00", "17:00"])
  })
})

describe("layoutBarChart con varios días", () => {
  it("no adelgaza las etiquetas de la serie diaria (S4)", () => {
    expect(layoutBarChart(DIARIO, { width: 900, mode: "both" }).xLabels).toHaveLength(7)
  })
})
