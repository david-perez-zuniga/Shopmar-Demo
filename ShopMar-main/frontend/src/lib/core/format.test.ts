import { describe, expect, it } from "vitest"
import { formatCords, formatDate, formatDateTime, formatMoney } from "./format"

describe("formatMoney", () => {
  it("agrupa los miles con punto y el decimal con coma", () => {
    expect(formatMoney("1250.50")).toBe("C$ 1,250.50")
    expect(formatMoney("4837500.00")).toBe("C$ 4,837,500.00")
  })

  it("agrega los dos decimales cuando el valor no los trae", () => {
    expect(formatMoney("80")).toBe("C$ 80.00")
    expect(formatMoney("0")).toBe("C$ 0.00")
    expect(formatMoney("1250.5")).toBe("C$ 1,250.50")
  })

  it("conserva los nueve dígitos sin perder el último", () => {
    expect(formatMoney("99999999.99")).toBe("C$ 99,999,999.99")
  })

  // Un importe suelto está topeado por Decimal(10,2), pero esta función también
  // formatea agregados (KPIs y totales del dashboard), que no tienen tope.
  it("formatea agregados que pasan los ocho dígitos de un importe suelto", () => {
    expect(formatMoney("100000000.00")).toBe("C$ 100,000,000.00")
    expect(formatMoney("215287440.00")).toBe("C$ 215,287,440.00")
    expect(formatMoney("122981570.00")).toBe("C$ 122,981,570.00")
    expect(formatMoney("1234567890123.45")).toBe("C$ 1,234,567,890,123.45")
  })

  it("no usa punto flotante: el resultado es exacto", () => {
    expect(formatMoney("0.3")).toBe("C$ 0.30")
    expect(formatMoney("0.30")).toBe("C$ 0.30")
  })

  it("redondea el tercer decimal mitad hacia arriba, por aritmética de cadena", () => {
    expect(formatMoney("1.005")).toBe("C$ 1.01")
    expect(formatMoney("1.004")).toBe("C$ 1.00")
    expect(formatMoney("1.0059")).toBe("C$ 1.01")
  })

  it("arrastra el acarreo al entero cuando los centavos pasan de 99", () => {
    expect(formatMoney("99.995")).toBe("C$ 100.00")
    expect(formatMoney("99999999.995")).toBe("C$ 100,000,000.00")
  })

  it("devuelve el valor tal cual si no cumple el patrón", () => {
    expect(formatMoney("")).toBe("")
    expect(formatMoney("no es un número")).toBe("no es un número")
  })
})

describe("formatDate", () => {
  it("formatea una fecha ISO en es-CO, en UTC", () => {
    expect(formatDate("2026-09-28T15:30:00.000Z")).toBe("28/09/2026")
    expect(formatDate("2026-09-28T00:00:00.000Z")).toBe("28/09/2026")
  })

  it("devuelve — cuando la entrada no es una fecha, sin lanzar", () => {
    expect(formatDate("no-es-una-fecha")).toBe("—")
  })
})

describe("formatDateTime", () => {
  it("muestra un instante en la hora local del navegador, no en UTC", () => {
    const value = "2026-09-28T15:30:00.000Z"
    // El mismo formateo que hace el módulo, sin forzar huso: es la definición de
    // «hora local», así que el test no depende del huso de la máquina.
    const expected = new Date(value).toLocaleString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    expect(formatDateTime(value)).toBe(expected)
  })

  it("una venta de la noche no salta al día siguiente", () => {
    // 00:24 UTC del 20 es la noche del 19 en cualquier huso de América.
    const value = "2026-10-20T00:24:00.000Z"
    const local = new Date(value)
    expect(formatDateTime(value)).toContain(
      String(local.getDate()).padStart(2, "0"),
    )
  })

  it("devuelve — cuando la entrada no es una fecha", () => {
    expect(formatDateTime("no-es-una-fecha")).toBe("—")
  })
})

describe("formatCords", () => {
  it("pone C$ adelante y agrupa igual que formatMoney", () => {
    expect(formatCords("1250.50")).toBe("C$ 1,250.50")
    expect(formatCords("4837500.00")).toBe("C$ 4,837,500.00")
    expect(formatCords("0")).toBe("C$ 0.00")
  })

  it("redondea la parte decimal igual que formatMoney", () => {
    expect(formatCords("0.3")).toBe("C$ 0.30")
    expect(formatCords("1.005")).toBe("C$ 1.01")
    expect(formatCords("1.004")).toBe("C$ 1.00")
  })

  it("solo cambia el prefijo: los dígitos son los de formatMoney", () => {
    for (const raw of ["0", "1250.50", "4837500.00", "0.3", "1.005", "99.99", "215287440.00"]) {
      expect(formatCords(raw)).toBe(formatMoney(raw))
    }
  })

  it("devuelve el valor crudo si no es un importe, sin lanzar", () => {
    expect(formatCords("no-es-un-monto")).toBe("no-es-un-monto")
  })
})