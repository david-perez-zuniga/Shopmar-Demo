import { describe, expect, it } from "vitest"
import type { ICreateLiveSaleRequest } from "../core/types"
import { PHONE_TAKEN_MESSAGE } from "./customer-pick"
import { productPayload, type IProductRow } from "./sale-rows"
import {
  DEFAULT_ADD_PHONE,
  DEFAULT_COLLECT_NOW,
  DEFAULT_PAYMENT_TERMS,
  PHONE_REQUIRED_MESSAGE,
  buildSalePayload,
  dueDateToIso,
  previewSaleStatus,
  validateSaleCondition,
  type ISaleConditionState,
} from "./sale-form"

const CUSTOMER_ID = "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16"

function base(): ICreateLiveSaleRequest {
  return {
    customer_name: "María González",
    product_name: "Abrigo de lana gris",
    payment_method: "cash",
    cost: "1250.50",
    sale_date: "2026-09-28T00:00:00.000Z",
  }
}

function condition(overrides: Partial<ISaleConditionState> = {}): ISaleConditionState {
  return {
    terms: "immediate",
    collectNow: false,
    amountPaid: "",
    customerMode: "new",
    customerId: null,
    dueDate: "",
    total: "1250.50",
    paymentMethod: "cash",
    addPhone: false,
    phone: "",
    phoneOwnerId: null,
    ...overrides,
  }
}

describe("defaults", () => {
  it("la condición de pago arranca en contado", () => {
    expect(DEFAULT_PAYMENT_TERMS).toBe("immediate")
  })

  it("el cobro en el momento arranca apagado", () => {
    expect(DEFAULT_COLLECT_NOW).toBe(false)
  })

  it("el teléfono arranca sin pedirse: el checkbox está apagado", () => {
    expect(DEFAULT_ADD_PHONE).toBe(false)
  })
})

describe("dueDateToIso", () => {
  it("convierte la fecha del input a ISO UTC a medianoche", () => {
    expect(dueDateToIso("2026-10-28")).toBe("2026-10-28T00:00:00.000Z")
  })

  it("tolera espacios alrededor", () => {
    expect(dueDateToIso("  2026-10-28  ")).toBe("2026-10-28T00:00:00.000Z")
  })

  it("devuelve null con el campo vacío", () => {
    expect(dueDateToIso("")).toBeNull()
    expect(dueDateToIso("   ")).toBeNull()
  })

  it("devuelve null con algo que no es yyyy-mm-dd", () => {
    expect(dueDateToIso("28/10/2026")).toBeNull()
    expect(dueDateToIso("2026-10")).toBeNull()
    expect(dueDateToIso("2026-10-28T00:00:00.000Z")).toBeNull()
  })

  it("devuelve null con una fecha del calendario que no existe", () => {
    expect(dueDateToIso("2026-02-31")).toBeNull()
    expect(dueDateToIso("2026-13-01")).toBeNull()
  })
})

describe("validateSaleCondition en crédito", () => {
  it("el cliente no se valida acá: su campo vive en «La venta» (S30)", () => {
    // La regla depende del nombre escrito y de dónde está el campo, así que la
    // resuelve el paso (`customer-pick.ts` + `sale-form-steps.ts`); esta puerta
    // sólo mira lo que es de la condición de pago.
    const errors = validateSaleCondition(
      condition({ terms: "credit", dueDate: "2026-10-28" }),
      "2026-09-28",
    )
    expect(errors.customer_id).toBeUndefined()
    expect(errors.due_date).toBeUndefined()
  })

  it("sin fecha prometida pide la fecha", () => {
    const errors = validateSaleCondition(
      condition({ terms: "credit", customerId: CUSTOMER_ID }),
      "2026-09-28",
    )
    expect(errors.due_date).toBe("Elegí la fecha de pago prometida")
    expect(errors.customer_id).toBeUndefined()
  })

  it("sin fecha prometida devuelve sólo el error de la fecha", () => {
    const errors = validateSaleCondition(condition({ terms: "credit" }), "2026-09-28")
    expect(Object.keys(errors)).toEqual(["due_date"])
  })

  it("rechaza una fecha prometida anterior a hoy", () => {
    const errors = validateSaleCondition(
      condition({ terms: "credit", customerId: CUSTOMER_ID, dueDate: "2026-09-27" }),
      "2026-09-28",
    )
    expect(errors.due_date).toBe("La fecha prometida no puede ser anterior a hoy")
  })

  it("acepta hoy y cualquier fecha futura", () => {
    for (const dueDate of ["2026-09-28", "2026-09-29", "2027-01-15"]) {
      expect(
        validateSaleCondition(
          condition({ terms: "credit", customerId: CUSTOMER_ID, dueDate }),
          "2026-09-28",
        ),
      ).toEqual({})
    }
  })

  it("no valida monto recibido: en crédito no hubo cobro", () => {
    const errors = validateSaleCondition(
      condition({
        terms: "credit",
        collectNow: true,
        amountPaid: "abc",
        customerId: CUSTOMER_ID,
        dueDate: "2026-10-28",
      }),
      "2026-09-28",
    )
    expect(errors).toEqual({})
  })
})

describe("validateSaleCondition en contado con cobro apagado", () => {
  it("no valida nada, aunque el monto tenga basura", () => {
    expect(
      validateSaleCondition(condition({ amountPaid: "abc", customerId: null }), "2026-09-28"),
    ).toEqual({})
  })
})

describe("validateSaleCondition en contado con cobro encendido", () => {
  const collect = (overrides: Partial<ISaleConditionState> = {}) =>
    validateSaleCondition(
      condition({ collectNow: true, amountPaid: "1250.50", ...overrides }),
      "2026-09-28",
    )

  it("un monto vacío pide el monto", () => {
    expect(collect({ amountPaid: "" }).amount_paid).toBe("Escribí el monto que cobraste")
    expect(collect({ amountPaid: "   " }).amount_paid).toBe("Escribí el monto que cobraste")
  })

  it("un monto inválido usa el texto existente de describePayment", () => {
    expect(collect({ amountPaid: "abc" }).amount_paid).toBe("Escribí un importe como 1250.50")
  })

  it("efectivo de menos se rechaza diciendo cuánto falta", () => {
    expect(collect({ amountPaid: "100.00" }).amount_paid).toBe("Monto insuficiente. Faltan C$ 1,150.50")
  })

  it("efectivo exacto o con vuelto se acepta", () => {
    expect(collect({ amountPaid: "1250.50" })).toEqual({})
    expect(collect({ amountPaid: "1300" })).toEqual({})
  })

  it("tarjeta tiene que ser exacta: de más y de menos se rechazan", () => {
    expect(collect({ paymentMethod: "credit_card", amountPaid: "1250.50" })).toEqual({})
    expect(collect({ paymentMethod: "credit_card", amountPaid: "1300.00" }).amount_paid).toContain(
      "exacto",
    )
    expect(collect({ paymentMethod: "credit_card", amountPaid: "1200.00" }).amount_paid).toContain(
      "exacto",
    )
  })

  it("valida contra el total estimado del resumen, no contra cost", () => {
    expect(collect({ total: "1350.50", amountPaid: "1250.50" }).amount_paid).toContain("Faltan")
    expect(collect({ total: "1350.50", amountPaid: "1350.50" })).toEqual({})
  })
})

describe("buildSalePayload en contado", () => {
  it("no manda category: el campo se retiró del formulario y la API lo deja vacío (S47)", () => {
    const payload = buildSalePayload({ ...base(), category: ["chaquetas"] }, condition())

    expect(payload).not.toHaveProperty("category")
  })
  it("sin cobro no agrega nada: la venta nace pendiente como hoy", () => {
    expect(buildSalePayload(base(), condition())).toEqual(base())
  })

  it("sin cobro descarta lo que quedó cargado del modo crédito", () => {
    const payload = buildSalePayload(
      base(),
      condition({ dueDate: "2026-10-28", amountPaid: "1300" }),
    )
    expect(payload).toEqual(base())
    expect(payload).not.toHaveProperty("payment_terms")
    expect(payload).not.toHaveProperty("customer_id")
    expect(payload).not.toHaveProperty("due_date")
  })

  it("con un cliente del padrón elegido enlaza la venta por customer_id y suelta el nombre (S30, S43)", () => {
    const payload = buildSalePayload(
      base(),
      condition({
        customerMode: "existing",
        customerId: CUSTOMER_ID,
        dueDate: "2026-10-28",
        amountPaid: "1300",
      }),
    )
    expect(payload).toEqual({
      product_name: "Abrigo de lana gris",
      payment_method: "cash",
      cost: "1250.50",
      sale_date: "2026-09-28T00:00:00.000Z",
      customer_id: CUSTOMER_ID,
    })
    expect(payload).not.toHaveProperty("customer_name")
    expect(payload).not.toHaveProperty("due_date")
  })

  it("con cobro manda completed y el monto normalizado a dos decimales", () => {
    const payload = buildSalePayload(
      base(),
      condition({ collectNow: true, amountPaid: "1250.5" }),
    )
    expect(payload).toEqual({
      ...base(),
      status: "completed",
      amount_paid: "1250.50",
    })
  })

  it("con cobro en efectivo de más manda el monto recibido, no el total", () => {
    const payload = buildSalePayload(
      base(),
      condition({ collectNow: true, amountPaid: "1300" }),
    )
    expect(payload.amount_paid).toBe("1300.00")
    expect(payload.status).toBe("completed")
  })

  it("de contado con cobro manda el cliente elegido, nunca el nombre ni el vencimiento", () => {
    const payload = buildSalePayload(
      base(),
      condition({
        customerMode: "existing",
        collectNow: true,
        amountPaid: "1250.50",
        customerId: CUSTOMER_ID,
      }),
    )
    expect(payload.customer_id).toBe(CUSTOMER_ID)
    expect(payload).not.toHaveProperty("customer_name")
    expect(payload).not.toHaveProperty("due_date")
  })

  it("de contado sin cliente elegido manda el nombre escrito y nunca customer_id (S18, S30)", () => {
    const payload = buildSalePayload(base(), condition())
    expect(payload).toEqual(base())
    expect(payload.customer_name).toBe("María González")
    expect(payload).not.toHaveProperty("customer_id")
  })
})

describe("buildSalePayload en crédito", () => {
  const creditCondition = () =>
    condition({
      terms: "credit",
      customerMode: "existing",
      customerId: CUSTOMER_ID,
      dueDate: "2026-10-28",
      total: "1250.50",
    })

  it("manda customer_id y payment_terms credit, sin customer_name", () => {
    const payload = buildSalePayload(base(), creditCondition())
    expect(payload).toEqual({
      product_name: "Abrigo de lana gris",
      cost: "1250.50",
      sale_date: "2026-09-28T00:00:00.000Z",
      customer_id: CUSTOMER_ID,
      payment_terms: "credit",
      due_date: "2026-10-28T00:00:00.000Z",
    })
    expect(payload).not.toHaveProperty("customer_name")
  })

  // S57: en un crédito no hay cobro en el momento, así que no hay forma de pago
  // que mandar. Cada abono del libro registra la suya, y el servidor guarda
  // `cash` como valor de registro porque la columna es obligatoria.
  it("no manda payment_method ni payment_bank: cada abono guarda el suyo (S57)", () => {
    const payload = buildSalePayload(
      { ...base(), payment_method: "credit_card", payment_bank: "BAC Credomatic" },
      creditCondition(),
    )

    expect(payload).not.toHaveProperty("payment_method")
    expect(payload).not.toHaveProperty("payment_bank")
  })

  it("de contado conserva payment_method y payment_bank (PRESERVE, S57)", () => {
    const payload = buildSalePayload(
      { ...base(), payment_method: "credit_card", payment_bank: "BAC Credomatic" },
      condition({ paymentMethod: "credit_card" }),
    )

    expect(payload.payment_method).toBe("credit_card")
    expect(payload.payment_bank).toBe("BAC Credomatic")
  })

  it("nunca manda status ni amount_paid: se cobra registrando pagos", () => {
    const payload = buildSalePayload(
      base(),
      { ...creditCondition(), collectNow: true, amountPaid: "500.00" },
    )
    expect(payload).not.toHaveProperty("status")
    expect(payload).not.toHaveProperty("amount_paid")
  })

  it("convierte la fecha prometida a ISO UTC a medianoche", () => {
    const payload = buildSalePayload(base(), {
      ...creditCondition(),
      dueDate: "2027-01-15",
    })
    expect(payload.due_date).toBe("2027-01-15T00:00:00.000Z")
  })

  it("sin cliente elegido manda el nombre escrito y nunca customer_id (S30)", () => {
    // El backend acepta el nombre en las dos condiciones (S29): escribir el
    // nombre es el camino principal también para el fiado.
    const payload = buildSalePayload(
      base(),
      condition({ terms: "credit", dueDate: "2026-10-28" }),
    )
    expect(payload).toEqual({
      customer_name: "María González",
      product_name: "Abrigo de lana gris",
      cost: "1250.50",
      sale_date: "2026-09-28T00:00:00.000Z",
      payment_terms: "credit",
      due_date: "2026-10-28T00:00:00.000Z",
    })
    expect(payload.customer_name).toBe("María González")
    expect(payload).not.toHaveProperty("customer_id")
  })

  it("con cliente elegido el nombre escrito no viaja: nunca las dos claves (S30)", () => {
    const payload = buildSalePayload(base(), creditCondition())
    expect(payload.customer_id).toBe(CUSTOMER_ID)
    expect(payload).not.toHaveProperty("customer_name")
  })

  it("sin cliente ni nombre escrito no inventa ninguna de las dos claves", () => {
    const payload = buildSalePayload(
      { ...base(), customer_name: "" },
      condition({ terms: "credit", dueDate: "2026-10-28" }),
    )
    expect(payload).not.toHaveProperty("customer_id")
    expect(payload.customer_name).toBe("")
    expect(payload.payment_terms).toBe("credit")
  })
})

describe("teléfono del cliente (S23)", () => {
  it("el mensaje del campo vacío está en español", () => {
    expect(PHONE_REQUIRED_MESSAGE).toBe("Escribí el número de teléfono")
  })

  it("con el checkbox apagado no se valida nada, aunque el campo tenga basura", () => {
    expect(validateSaleCondition(condition({ phone: "   " }), "2026-09-28")).toEqual({})
  })

  it("con el checkbox encendido y el campo vacío pide el teléfono", () => {
    const errors = validateSaleCondition(
      condition({ addPhone: true, phone: "" }),
      "2026-09-28",
    )
    expect(errors.customer_phone).toBe(PHONE_REQUIRED_MESSAGE)
  })

  it("un teléfono de sólo espacios también falta", () => {
    const errors = validateSaleCondition(
      condition({ addPhone: true, phone: "   " }),
      "2026-09-28",
    )
    expect(errors.customer_phone).toBe(PHONE_REQUIRED_MESSAGE)
  })

  it("con el checkbox encendido y el campo lleno no hay error", () => {
    expect(
      validateSaleCondition(condition({ addPhone: true, phone: "8888 1234" }), "2026-09-28"),
    ).toEqual({})
  })

  it("en crédito el error del teléfono convive con el de la fecha", () => {
    const errors = validateSaleCondition(condition({ terms: "credit", addPhone: true }), "2026-09-28")
    expect(Object.keys(errors).sort()).toEqual(["customer_phone", "due_date"])
  })

  it("un número que ya es de otro cliente frena el envío (S28)", () => {
    const errors = validateSaleCondition(
      condition({ addPhone: true, phone: "8888 1234", phoneOwnerId: CUSTOMER_ID }),
      "2026-09-28",
    )
    expect(errors.customer_phone).toBe(PHONE_TAKEN_MESSAGE)
  })

  it("el aviso se resuelve eligiendo a ese cliente, que es el camino «Cliente existente» (S28, S43)", () => {
    // «Usar sus datos» cambia de modo: la venta viaja con `customer_id` y su
    // teléfono ya está en la ficha, así que no hay número que comparar.
    expect(
      validateSaleCondition(
        condition({
          customerMode: "existing",
          customerId: CUSTOMER_ID,
          addPhone: false,
          phone: "8888 1234",
          phoneOwnerId: CUSTOMER_ID,
        }),
        "2026-09-28",
      ),
    ).toEqual({})
  })

  it("escribir otro número desbloquea el envío (S28)", () => {
    expect(
      validateSaleCondition(condition({ addPhone: true, phone: "9999 0000" }), "2026-09-28"),
    ).toEqual({})
  })

  it("en «Cliente existente» el teléfono no se valida: el checkbox es de «Cliente nuevo» (S43)", () => {
    // Con un cliente del padrón el campo no existe, así que su número guardado
    // tampoco frena la venta ni viaja en el payload.
    expect(
      validateSaleCondition(
        condition({ customerMode: "existing", customerId: CUSTOMER_ID, addPhone: true, phone: "" }),
        "2026-09-28",
      ),
    ).toEqual({})
  })

  it("en crédito con nombre, fecha y teléfono el formulario queda limpio", () => {
    const errors = validateSaleCondition(
      condition({
        terms: "credit",
        customerMode: "new",
        dueDate: "2026-10-28",
        addPhone: true,
        phone: "8888 1234",
      }),
      "2026-09-28",
    )
    expect(errors).toEqual({})
  })

  it("con el checkbox apagado el payload no lleva customer_phone", () => {
    const payload = buildSalePayload(base(), condition({ phone: "8888 1234" }))

    expect(payload).toEqual(base())
    expect(payload).not.toHaveProperty("customer_phone")
  })

  it("con el checkbox apagado tampoco manda un teléfono que venía en el cuerpo base", () => {
    const payload = buildSalePayload({ ...base(), customer_phone: "8888 1234" }, condition())

    expect(payload).not.toHaveProperty("customer_phone")
  })

  it("con el checkbox encendido manda el teléfono recortado", () => {
    const payload = buildSalePayload(
      base(),
      condition({ addPhone: true, phone: "  8888 1234  " }),
    )

    expect(payload.customer_phone).toBe("8888 1234")
    // El resto del cuerpo no cambia: la condición de pago sigue intacta.
    expect(payload).toEqual({ ...base(), customer_phone: "8888 1234" })
  })

  it("con el checkbox encendido y el campo vacío no inventa la clave", () => {
    const payload = buildSalePayload(base(), condition({ addPhone: true, phone: "   " }))

    expect(payload).not.toHaveProperty("customer_phone")
  })

  it("en crédito el teléfono viaja junto al nombre escrito y la fecha prometida", () => {
    const payload = buildSalePayload(base(), {
      ...condition({
        terms: "credit",
        customerMode: "new",
        dueDate: "2026-10-28",
        addPhone: true,
        phone: "8888 1234",
      }),
    })

    expect(payload).toEqual({
      customer_name: "María González",
      product_name: "Abrigo de lana gris",
      cost: "1250.50",
      sale_date: "2026-09-28T00:00:00.000Z",
      payment_terms: "credit",
      due_date: "2026-10-28T00:00:00.000Z",
      customer_phone: "8888 1234",
    })
  })
})

describe("el modo del cliente decide el payload (S43)", () => {
  it("«Cliente nuevo» manda el nombre escrito y nunca customer_id", () => {
    const payload = buildSalePayload(
      base(),
      condition({ customerMode: "new", customerId: CUSTOMER_ID }),
    )
    expect(payload.customer_name).toBe("María González")
    expect(payload).not.toHaveProperty("customer_id")
  })

  it("«Cliente nuevo» con el checkbox encendido manda también el teléfono", () => {
    const payload = buildSalePayload(
      base(),
      condition({ customerMode: "new", addPhone: true, phone: " 8888 1234 " }),
    )
    expect(payload.customer_name).toBe("María González")
    expect(payload.customer_phone).toBe("8888 1234")
    expect(payload).not.toHaveProperty("customer_id")
  })

  it("«Cliente existente» manda el id y nunca el nombre ni el teléfono", () => {
    const payload = buildSalePayload(
      base(),
      condition({
        customerMode: "existing",
        customerId: CUSTOMER_ID,
        addPhone: true,
        phone: "8888 1234",
      }),
    )
    expect(payload.customer_id).toBe(CUSTOMER_ID)
    expect(payload).not.toHaveProperty("customer_name")
    expect(payload).not.toHaveProperty("customer_phone")
  })

  it("«Cliente existente» en crédito manda el id y la fecha prometida, sin teléfono", () => {
    const payload = buildSalePayload(
      base(),
      condition({
        terms: "credit",
        customerMode: "existing",
        customerId: CUSTOMER_ID,
        dueDate: "2026-10-28",
        addPhone: true,
        phone: "8888 1234",
      }),
    )
    expect(payload.customer_id).toBe(CUSTOMER_ID)
    expect(payload.payment_terms).toBe("credit")
    expect(payload.due_date).toBe("2026-10-28T00:00:00.000Z")
    expect(payload).not.toHaveProperty("customer_name")
    expect(payload).not.toHaveProperty("customer_phone")
  })

  it("«Cliente existente» sin cliente elegido no inventa ninguna clave", () => {
    const payload = buildSalePayload(
      base(),
      condition({ customerMode: "existing", customerId: null }),
    )
    expect(payload).not.toHaveProperty("customer_id")
    expect(payload).not.toHaveProperty("customer_name")
  })
})

/**
 * El cuerpo de una venta armado como lo arma la pantalla: los productos salen
 * de `productPayload` (S44) y la condición la agrega `buildSalePayload` (S45).
 */
function saleWithProducts(
  products: IProductRow[],
  overrides: Partial<ISaleConditionState> = {},
): ICreateLiveSaleRequest {
  return buildSalePayload(
    {
      customer_name: "María González",
      ...productPayload(products),
      payment_method: "cash",
      sale_date: "2026-09-28T00:00:00.000Z",
    },
    condition(overrides),
  )
}

describe("payload de la lista de productos (S44, S45)", () => {
  it("con un producto el cuerpo es el de siempre: product_name y cost, sin additional_items", () => {
    const payload = saleWithProducts([{ name: "Abrigo de lana gris", price: "1250.50" }])
    expect(payload).toEqual(base())
    expect(payload).not.toHaveProperty("additional_items")
  })

  it("con tres productos el primero es la mercadería principal y los otros dos viajan en additional_items", () => {
    const payload = saleWithProducts([
      { name: "Abrigo de lana gris", price: "1250.50" },
      { name: "Camisa de lino", price: "800.00" },
      { name: "Cinturón", price: "300" },
    ])
    expect(payload).toEqual({
      ...base(),
      additional_items: [
        { name: "Camisa de lino", total: "800.00", kind: "merchandise" },
        { name: "Cinturón", total: "300", kind: "merchandise" },
      ],
    })
  })

  it("los productos no cambian la condición de pago del cuerpo", () => {
    const payload = saleWithProducts(
      [
        { name: "Abrigo de lana gris", price: "1250.50" },
        { name: "Camisa de lino", price: "800.00" },
      ],
      { terms: "credit", customerMode: "existing", customerId: CUSTOMER_ID, dueDate: "2026-10-28" },
    )
    expect(payload.payment_terms).toBe("credit")
    expect(payload.customer_id).toBe(CUSTOMER_ID)
    expect(payload.due_date).toBe("2026-10-28T00:00:00.000Z")
    expect(payload.additional_items).toHaveLength(1)
  })
})

/**
 * El estado con el que va a nacer la venta (S62).
 *
 * La pantalla lo tiene que poder decir antes de registrar, así que la regla vive
 * acá y no en el cableado del DOM: contado con «Cobraste ahora» se registra
 * completada; sin cobrar —y siempre a crédito— nace pendiente.
 */
describe("estado de la venta antes de registrarla (S62)", () => {
  it("contado con «Cobraste ahora» se registra completada", () => {
    expect(previewSaleStatus({ terms: "immediate", collectNow: true })).toBe("completed")
  })

  it("contado sin cobrar nace pendiente", () => {
    expect(previewSaleStatus({ terms: "immediate", collectNow: false })).toBe("pending")
  })

  it("a crédito nace pendiente aunque el interruptor de cobro quede marcado", () => {
    expect(previewSaleStatus({ terms: "credit", collectNow: true })).toBe("pending")
  })

  it("coincide con el `status` que arma el payload: la pantalla no puede mentir", () => {
    for (const terms of ["immediate", "credit"] as const) {
      for (const collectNow of [true, false]) {
        const payload = buildSalePayload(
          base(),
          condition({ terms, collectNow, amountPaid: "1250.50" }),
        )
        expect(payload.status ?? "pending").toBe(previewSaleStatus({ terms, collectNow }))
      }
    }
  })
})
