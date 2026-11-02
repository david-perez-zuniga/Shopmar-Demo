import { describe, expect, it } from "vitest"
import {
  initialProductRows,
  productFieldTarget,
  productPayload,
  productRowsTotalCents,
  toAdditionalItem,
} from "./sale-rows"

describe("toAdditionalItem", () => {
  it("una fila de mercadería viaja sin cantidad, y el backend la toma como 1", () => {
    const item = toAdditionalItem({ name: "Segunda prenda", total: "1500.00" }, "merchandise")
    expect(item).not.toHaveProperty("quantity")
    expect(item).toEqual({ name: "Segunda prenda", total: "1500.00", kind: "merchandise" })
  })

  it("una fila de artículo adicional viaja con su cantidad", () => {
    const item = toAdditionalItem(
      { name: "Cinturón", total: "300.00", quantity: "2", description: "Cuero" },
      "additional",
    )
    expect(item).toEqual({
      name: "Cinturón",
      total: "300.00",
      quantity: 2,
      description: "Cuero",
      kind: "additional",
    })
  })

  it("omite la descripción en blanco en vez de mandarla vacía", () => {
    const item = toAdditionalItem({ name: "Cinturón", total: "300.00", quantity: "1", description: "" }, "additional")
    expect(item).not.toHaveProperty("description")
  })

  it("omite la cantidad en blanco en vez de mandarla como 0", () => {
    const item = toAdditionalItem({ name: "Cinturón", total: "300.00", quantity: "" }, "additional")
    expect(item).not.toHaveProperty("quantity")
  })

  it("conserva la clase de la fila en el renglón", () => {
    expect(toAdditionalItem({ name: "A", total: "1.00" }, "merchandise").kind).toBe("merchandise")
    expect(toAdditionalItem({ name: "A", total: "1.00" }, "additional").kind).toBe("additional")
  })

  it("nunca produce una cantidad 0, que es lo que el DTO rechaza", () => {
    for (const quantity of [undefined, "", "1", "5"]) {
      const item = toAdditionalItem({ name: "A", total: "1.00", quantity }, "merchandise")
      if ("quantity" in item) expect(item.quantity).toBeGreaterThanOrEqual(1)
    }
  })
})

describe("initialProductRows (S44)", () => {
  it("el formulario abre con un solo producto, vacío: el primero siempre existe", () => {
    expect(initialProductRows()).toEqual([{ name: "", price: "" }])
  })

  it("cada llamada devuelve una lista propia: el estado de una venta no se comparte con la siguiente", () => {
    const first = initialProductRows()
    const second = initialProductRows()
    first[0]!.name = "Abrigo de lana gris"
    expect(second[0]?.name).toBe("")
  })
})

describe("productRowsTotalCents", () => {
  it("con un producto el total es su precio", () => {
    expect(productRowsTotalCents([{ name: "Abrigo", price: "1250.50" }])).toBe(125050)
  })

  it("con tres productos el total es la suma de los tres", () => {
    expect(
      productRowsTotalCents([
        { name: "Jean clásico", price: "1250.50" },
        { name: "Camisa de lino", price: "800" },
        { name: "Cinturón", price: "99.99" },
      ]),
    ).toBe(215049)
  })

  it("un precio que todavía no se puede leer no rompe la estimación: se omite", () => {
    expect(
      productRowsTotalCents([
        { name: "Abrigo", price: "1250.50" },
        { name: "", price: "" },
      ]),
    ).toBe(125050)
  })

  it("sin ningún precio legible no hay estimación, ni siquiera un cero", () => {
    expect(productRowsTotalCents([{ name: "Abrigo", price: "" }])).toBeNull()
    expect(productRowsTotalCents([{ name: "Abrigo", price: "12,50" }])).toBeNull()
    expect(productRowsTotalCents([])).toBeNull()
  })

  it("tolera espacios y precios enteros, como el resto de los importes de la casa", () => {
    expect(productRowsTotalCents([{ name: "A", price: " 800 " }])).toBe(80000)
  })
})

describe("productFieldTarget", () => {
  it("el primer producto responde a los dos nombres del contrato", () => {
    expect(productFieldTarget("product_name")).toEqual({ index: 0, field: "name" })
    expect(productFieldTarget("cost")).toEqual({ index: 0, field: "total" })
  })

  it("los renglones de la pantalla se cuentan con el primero adentro", () => {
    expect(productFieldTarget("items.2.name")).toEqual({ index: 2, field: "name" })
    expect(productFieldTarget("items.1.total")).toEqual({ index: 1, field: "total" })
  })

  it("los adicionales del payload arrancan en el segundo renglón, porque el primero es la mercadería principal", () => {
    expect(productFieldTarget("additional_items.0.total")).toEqual({ index: 1, field: "total" })
    expect(productFieldTarget("additional_items.2.name")).toEqual({ index: 3, field: "name" })
  })

  it("un campo que no es de la lista no señala ningún renglón", () => {
    for (const key of [
      "due_date",
      "customer_name",
      "items.0.quantity",
      "additional_items.0.description",
      "inventado",
    ]) {
      expect(productFieldTarget(key)).toBeNull()
    }
  })
})

describe("productPayload (S44, S45)", () => {
  it("con un producto es la mercadería principal y no hay adicionales en el cuerpo", () => {
    const payload = productPayload([{ name: "Jean clásico", price: "1250.50" }])
    expect(payload.product_name).toBe("Jean clásico")
    expect(payload.cost).toBe("1250.50")
    // La clave no aparece vacía: el cuerpo de una venta de un producto no la lleva.
    expect(payload).not.toHaveProperty("additional_items")
  })

  it("con tres productos el primero es la mercadería principal y los otros dos renglones de mercadería", () => {
    const payload = productPayload([
      { name: "Jean clásico", price: "1250.50" },
      { name: "Camisa de lino", price: "800.00" },
      { name: "Cinturón", price: "300" },
    ])
    expect(payload.product_name).toBe("Jean clásico")
    expect(payload.cost).toBe("1250.50")
    expect(payload.additional_items).toEqual([
      { name: "Camisa de lino", total: "800.00", kind: "merchandise" },
      { name: "Cinturón", total: "300", kind: "merchandise" },
    ])
  })

  it("los adicionales salen con la forma de siempre: sin cantidad ni detalle", () => {
    const [item] = productPayload([
      { name: "A", price: "1" },
      { name: "B", price: "2" },
    ]).additional_items ?? []
    expect(item).toEqual({ name: "B", total: "2", kind: "merchandise" })
    expect(item).not.toHaveProperty("quantity")
    expect(item).not.toHaveProperty("description")
  })

  it("recorta los espacios que se cuelan al escribir", () => {
    const payload = productPayload([{ name: "  Abrigo  ", price: " 1250.50 " }])
    expect(payload.product_name).toBe("Abrigo")
    expect(payload.cost).toBe("1250.50")
  })

  it("sin productos no inventa un nombre: la pantalla siempre tiene el primero", () => {
    expect(productPayload([])).toEqual({ product_name: "", cost: "" })
  })
})