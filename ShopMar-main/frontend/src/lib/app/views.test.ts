import { beforeEach, describe, expect, it, vi } from "vitest"
import { createViewRegistry } from "./views"

describe("registro de vistas", () => {
  let registry: ReturnType<typeof createViewRegistry>
  let root: HTMLElement

  beforeEach(() => {
    registry = createViewRegistry()
    root = document.createElement("div")
  })

  it("monta la vista registrada con la raíz de la vista, no con el documento", () => {
    const mount = vi.fn()
    registry.register("sales", mount)

    registry.mount("sales", root)

    expect(mount).toHaveBeenCalledWith(root)
  })

  it("desmonta la vista anterior antes de montar la siguiente", () => {
    const order: string[] = []
    registry.register("sales", () => () => order.push("cleanup-ventas"))
    registry.register("expenses", () => {
      order.push("mount-gastos")
    })

    registry.mount("sales", root)
    registry.mount("expenses", root)

    expect(order).toEqual(["cleanup-ventas", "mount-gastos"])
  })

  it("un montaje que no devuelve limpieza no rompe el desmontaje", () => {
    registry.register("sales", () => undefined)
    registry.mount("sales", root)

    expect(() => registry.unmount()).not.toThrow()
  })

  it("una vista sin registrar no se monta y el enlace no se intercepta", () => {
    expect(registry.has("packages")).toBe(false)
    expect(() => registry.mount("packages", root)).not.toThrow()

    registry.register("packages", vi.fn())
    expect(registry.has("packages")).toBe(true)
  })

  it("desmontar dos veces no ejecuta la limpieza dos veces", () => {
    const cleanup = vi.fn()
    registry.register("sales", () => cleanup)
    registry.mount("sales", root)

    registry.unmount()
    registry.unmount()

    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
