import { afterEach, describe, expect, it } from "vitest"
import {
  SALE_DRAFT_VERSION,
  clearSaleDraft,
  parseSaleDraft,
  readSaleDraft,
  saleDateToRestore,
  saleDraftKey,
  serializeSaleDraft,
  writeSaleDraft,
  type ISaleDraft,
} from "./sale-draft"

/**
 * Un borrador completo: el que deja el formulario lleno por el camino de
 * «Cliente existente», con dos productos y crédito (S49). Es el caso que tiene
 * que volver igual, campo por campo.
 */
const FULL_DRAFT: ISaleDraft = {
  customerMode: "existing",
  customerName: "",
  customer: { id: "c-20250314-001", name: "María González", phone: "8888 1234" },
  addPhone: true,
  phone: "8888 1234",
  products: [
    { name: "Jean clásico talla 32", price: "1250.50" },
    { name: "Camisa de lino", price: "800.00" },
  ],
  paymentTerms: "credit",
  dueDate: "2026-03-14",
  paymentMethod: "credit_card",
  paymentBank: "BAC Credomatic",
  collectNow: false,
  amountPaid: "",
  saleDate: "2026-03-01",
}

/** El mismo borrador por el camino de «Cliente nuevo» y de contado. */
const NEW_CUSTOMER_DRAFT: ISaleDraft = {
  customerMode: "new",
  customerName: "Juan Pérez",
  customer: null,
  addPhone: true,
  phone: "7777 5555",
  products: [{ name: "Chaqueta", price: "2100.00" }],
  paymentTerms: "immediate",
  dueDate: "",
  paymentMethod: "cash",
  paymentBank: "",
  collectNow: true,
  amountPaid: "2500.00",
  saleDate: "2026-02-20",
}

/** Un `Storage` que falla en cada acceso, como el de un modo privado. */
function brokenStorage(): Storage {
  const fail = (): never => {
    throw new Error("localStorage no disponible")
  }
  return {
    getItem: fail,
    setItem: fail,
    removeItem: fail,
    clear: fail,
    key: fail,
    get length(): number {
      return fail()
    },
  } as unknown as Storage
}

function draftJson(overrides: Record<string, unknown>): string {
  return JSON.stringify({ ...JSON.parse(serializeSaleDraft(FULL_DRAFT)), ...overrides })
}

describe("saleDraftKey (S49, S50)", () => {
  it("hay una clave por canal: lo de live no se lee como si fuera de whatsapp", () => {
    expect(saleDraftKey("live")).not.toBe(saleDraftKey("whatsapp"))
  })

  it("la clave lleva la versión de formato, para que un borrador viejo no se lea como nuevo", () => {
    expect(saleDraftKey("live")).toContain(`v${SALE_DRAFT_VERSION}`)
    expect(saleDraftKey("whatsapp")).toContain(`v${SALE_DRAFT_VERSION}`)
  })

  it("es estable para el mismo canal: dos escrituras caen en la misma entrada", () => {
    expect(saleDraftKey("live")).toBe(saleDraftKey("live"))
  })
})

describe("serializeSaleDraft / parseSaleDraft", () => {
  it("el ida y vuelta conserva el borrador completo, campo por campo", () => {
    expect(parseSaleDraft(serializeSaleDraft(FULL_DRAFT))).toEqual(FULL_DRAFT)
  })

  it("el ida y vuelta conserva también el camino de «Cliente nuevo», sin cliente elegido", () => {
    expect(parseSaleDraft(serializeSaleDraft(NEW_CUSTOMER_DRAFT))).toEqual(NEW_CUSTOMER_DRAFT)
  })

  it("guarda la versión de formato que después se exige", () => {
    expect(JSON.parse(serializeSaleDraft(FULL_DRAFT)).version).toBe(SALE_DRAFT_VERSION)
  })

  it("ignora un borrador de otra versión de formato en vez de interpretarlo", () => {
    expect(parseSaleDraft(draftJson({ version: SALE_DRAFT_VERSION + 1 }))).toBeNull()
    expect(parseSaleDraft(draftJson({ version: 0 }))).toBeNull()
    expect(parseSaleDraft(draftJson({ version: "1" }))).toBeNull()
  })

  it("no restaura el modo «sin cliente»: no es una decisión que se guarde", () => {
    // El interruptor «Agregar cliente» (S63) no es un camino del borrador: es la
    // ausencia de cliente mientras está apagado. `DraftCustomerMode` lo deja
    // afuera del tipo y el parseo lo rechaza, así que un `"none"` escrito a mano
    // no puede tirar el borrador entero por una clave que nadie lee.
    expect(parseSaleDraft(draftJson({ customerMode: "none" }))).toBeNull()
  })

  it("ignora un borrador sin versión", () => {
    const parsed = JSON.parse(serializeSaleDraft(FULL_DRAFT)) as Record<string, unknown>
    delete parsed.version
    expect(parseSaleDraft(JSON.stringify(parsed))).toBeNull()
  })

  it("ignora basura: nada guardado, JSON inválido, otro tipo de valor", () => {
    for (const raw of [
      null,
      "",
      "   ",
      "{",
      "no-json",
      "null",
      "42",
      '"texto"',
      "[]",
      "true",
    ]) {
      expect(parseSaleDraft(raw)).toBeNull()
    }
  })

  it("ignora un borrador parcial: falta un campo o llega con otro tipo", () => {
    const missingDate = JSON.parse(serializeSaleDraft(FULL_DRAFT)) as Record<string, unknown>
    delete missingDate.saleDate
    const missingProducts = JSON.parse(serializeSaleDraft(FULL_DRAFT)) as Record<string, unknown>
    delete missingProducts.products

    expect(parseSaleDraft(JSON.stringify(missingDate))).toBeNull()
    expect(parseSaleDraft(JSON.stringify(missingProducts))).toBeNull()
    expect(parseSaleDraft(draftJson({ saleDate: "" }))).toBeNull()
    expect(parseSaleDraft(draftJson({ customerName: 42 }))).toBeNull()
    expect(parseSaleDraft(draftJson({ addPhone: "sí" }))).toBeNull()
    expect(parseSaleDraft(draftJson({ collectNow: null }))).toBeNull()
    expect(parseSaleDraft(draftJson({ paymentTerms: "fiado" }))).toBeNull()
    expect(parseSaleDraft(draftJson({ paymentMethod: "cheque" }))).toBeNull()
    expect(parseSaleDraft(draftJson({ customerMode: "otro" }))).toBeNull()
    expect(parseSaleDraft(draftJson({ customer: { id: "c-1", name: "Ana" } }))).toBeNull()
    expect(parseSaleDraft(draftJson({ customer: "c-1" }))).toBeNull()
  })

  it("ignora un borrador de «Cliente existente» sin cliente elegido: no hay chip que repintar", () => {
    expect(parseSaleDraft(draftJson({ customerMode: "existing", customer: null }))).toBeNull()
  })

  it("descarta un cliente elegido que sobrevive a «Cliente nuevo», que no lo manda", () => {
    const parsed = parseSaleDraft(
      draftJson({ customerMode: "new", customerName: "Ana", customer: FULL_DRAFT.customer }),
    )
    expect(parsed?.customer).toBeNull()
    expect(parsed?.customerName).toBe("Ana")
  })

  it("sanea los renglones: sólo nombre y precio, sin claves de más", () => {
    const parsed = parseSaleDraft(
      draftJson({
        products: [
          { name: "Jean", price: "1250.50", kind: "merchandise", id: 7, quantity: 3 },
          { name: "Camisa", price: "800.00" },
        ],
      }),
    )
    expect(parsed?.products).toEqual([
      { name: "Jean", price: "1250.50" },
      { name: "Camisa", price: "800.00" },
    ])
    expect(Object.keys(parsed?.products[0] ?? {})).toEqual(["name", "price"])
  })

  it("conserva el orden de los renglones y su cantidad", () => {
    const parsed = parseSaleDraft(serializeSaleDraft(FULL_DRAFT))
    expect(parsed?.products.map((row) => row.name)).toEqual([
      "Jean clásico talla 32",
      "Camisa de lino",
    ])
  })

  it("ignora un borrador cuyos renglones no son objetos de dos strings", () => {
    expect(parseSaleDraft(draftJson({ products: [] }))).toBeNull()
    expect(parseSaleDraft(draftJson({ products: "Jean" }))).toBeNull()
    expect(parseSaleDraft(draftJson({ products: [{ name: "Jean" }] }))).toBeNull()
    expect(parseSaleDraft(draftJson({ products: [{ name: "Jean", price: 1250.5 }] }))).toBeNull()
    expect(parseSaleDraft(draftJson({ products: [null] }))).toBeNull()
  })

  it("sanea el cliente elegido: sólo id, nombre y teléfono", () => {
    const parsed = parseSaleDraft(
      draftJson({ customer: { id: "c-1", name: "Ana", phone: null, note: "extra", balance: "9" } }),
    )
    expect(parsed?.customer).toEqual({ id: "c-1", name: "Ana", phone: null })
  })

  it("sanea el borrador al escribirlo: lo que no es del borrador no se guarda", () => {
    const dirty = { ...NEW_CUSTOMER_DRAFT, status: "completed", total: "999.00" }
    const parsed = JSON.parse(serializeSaleDraft(dirty as ISaleDraft)) as Record<string, unknown>
    expect(parsed).not.toHaveProperty("status")
    expect(parsed).not.toHaveProperty("total")
    expect(parseSaleDraft(serializeSaleDraft(dirty as ISaleDraft))).toEqual(NEW_CUSTOMER_DRAFT)
  })
})

describe("la fecha del borrador restaurado (S1)", () => {
  it("un borrador guardado otro día no fecha la venta en el pasado: se usa hoy", () => {
    // El caso medido: el borrador se guardó el 1 y se retoma el 14, así que la
    // venta tiene que quedar fechada hoy y no dos días atrás.
    expect(saleDateToRestore("2026-03-01", "2026-03-14")).toBe("2026-03-14")
  })

  it("la fecha de hoy se respeta tal cual", () => {
    expect(saleDateToRestore("2026-03-14", "2026-03-14")).toBe("2026-03-14")
  })

  it("una fecha futura elegida a propósito se respeta: la venta se puede fechar adelante", () => {
    expect(saleDateToRestore("2026-03-20", "2026-03-14")).toBe("2026-03-20")
  })

  it("compara por string en fecha local, así que cruza el cambio de mes y de año", () => {
    expect(saleDateToRestore("2025-12-31", "2026-01-01")).toBe("2026-01-01")
    expect(saleDateToRestore("2026-01-01", "2025-12-31")).toBe("2026-01-01")
    expect(saleDateToRestore("2026-02-28", "2026-03-01")).toBe("2026-03-01")
  })

  it("lo que no es una fecha `YYYY-MM-DD` no se restaura: se usa hoy", () => {
    // Comparar por string sólo vale con el formato de `todayLocal`; un valor
    // suelto dejaría el campo de fecha vacío y el envío sin `sale_date`.
    for (const raw of ["mañana", "2026-3-1", "01/03/2026", "2026-03-14T00:00:00.000Z"]) {
      expect(saleDateToRestore(raw, "2026-03-14")).toBe("2026-03-14")
    }
  })
})

describe("lectura y escritura del borrador (S49, S50)", () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it("lo escrito se vuelve a leer igual", () => {
    expect(writeSaleDraft(window.localStorage, "live", FULL_DRAFT)).toBe(true)
    expect(readSaleDraft(window.localStorage, "live")).toEqual(FULL_DRAFT)
  })

  it("cada canal tiene su borrador: el de live no aparece en whatsapp", () => {
    writeSaleDraft(window.localStorage, "live", FULL_DRAFT)
    expect(readSaleDraft(window.localStorage, "whatsapp")).toBeNull()
    expect(readSaleDraft(window.localStorage, "live")).toEqual(FULL_DRAFT)
  })

  it("un borrador de otra versión guardado en la clave se ignora", () => {
    window.localStorage.setItem(saleDraftKey("live"), draftJson({ version: 99 }))
    expect(readSaleDraft(window.localStorage, "live")).toBeNull()
  })

  it("sin nada guardado devuelve null: el formulario arranca vacío", () => {
    expect(readSaleDraft(window.localStorage, "live")).toBeNull()
  })

  it("borrar el borrador de un canal no toca el del otro", () => {
    writeSaleDraft(window.localStorage, "live", FULL_DRAFT)
    writeSaleDraft(window.localStorage, "whatsapp", NEW_CUSTOMER_DRAFT)

    expect(clearSaleDraft(window.localStorage, "live")).toBe(true)
    expect(readSaleDraft(window.localStorage, "live")).toBeNull()
    expect(readSaleDraft(window.localStorage, "whatsapp")).toEqual(NEW_CUSTOMER_DRAFT)
  })

  it("deja de haber borrador después de borrarlo", () => {
    writeSaleDraft(window.localStorage, "whatsapp", NEW_CUSTOMER_DRAFT)
    clearSaleDraft(window.localStorage, "whatsapp")

    expect(window.localStorage.getItem(saleDraftKey("whatsapp"))).toBeNull()
  })

  it("sin almacenamiento —modo privado, cuota llena— no persiste y no rompe la pantalla", () => {
    const storage = brokenStorage()

    expect(() => writeSaleDraft(storage, "live", FULL_DRAFT)).not.toThrow()
    expect(writeSaleDraft(storage, "live", FULL_DRAFT)).toBe(false)
    expect(readSaleDraft(storage, "live")).toBeNull()
    expect(clearSaleDraft(storage, "live")).toBe(false)
  })

  it("sin almacenamiento disponible se degrada a «sin persistencia»", () => {
    expect(readSaleDraft(null, "live")).toBeNull()
    expect(writeSaleDraft(null, "live", FULL_DRAFT)).toBe(false)
    expect(clearSaleDraft(null, "live")).toBe(false)
  })
})
