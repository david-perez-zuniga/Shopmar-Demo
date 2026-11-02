import { describe, expect, it } from "vitest"
import { PHONE_TAKEN_MESSAGE, EXISTING_CUSTOMER_REQUIRED_MESSAGE } from "./customer-pick"
import type { ISaleConditionState } from "./sale-form"
import {
  FIRST_STEP_ID,
  SALE_STEPS,
  STEP_STATE_LABEL,
  SUBMIT_STEP_IDS,
  canSubmit,
  confirmStep,
  firstStepWithErrors,
  firstUnconfirmedStep,
  initialStepProgress,
  nextStepId,
  revokeStep,
  stepOfField,
  stepState,
  stepViews,
  validateStep,
  type ISaleFormState,
  type ISaleStepProgress,
  type SaleStepId,
} from "./sale-form-steps"

const CUSTOMER_ID = "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16"
/** El formulario ya recorrido entero: los cuatro pasos desbloqueados y confirmados. */
const ALL_CONFIRMED: ISaleStepProgress = {
  unlocked: new Set(["sale", "terms", "payment", "summary"]),
  confirmed: new Set(["sale", "terms", "payment", "summary"]),
}
const TODAY = "2026-09-28"

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

/** «Siguiente» en los pasos 1, 2 y 3, en orden: el recorrido que pide el envío (S61). */
function confirmGate(start: ISaleStepProgress): ISaleStepProgress {
  return SUBMIT_STEP_IDS.reduce(confirmStep, start)
}

/** Progreso a mano, para las pruebas que necesitan un punto concreto del recorrido (S59). */
function progress(
  unlocked: SaleStepId[],
  confirmed: SaleStepId[] = [],
): ISaleStepProgress {
  return { unlocked: new Set(unlocked), confirmed: new Set(confirmed) }
}

function formState(overrides: Partial<ISaleFormState> = {}): ISaleFormState {
  return {
    condition: condition(),
    customerName: "María González",
    saleDate: "2026-09-28",
    // El formulario abre con un producto vacío y sólo se carga el primero (S44).
    products: [{ name: "Abrigo de lana gris", price: "1250.50" }],
    paymentBank: "",
    ...overrides,
  }
}

/** Estado de un formulario de crédito completo: cliente del padrón, fecha y teléfono apagado. */
function creditForm(overrides: Partial<ISaleFormState> = {}): ISaleFormState {
  return formState({
    condition: condition({
      terms: "credit",
      customerMode: "existing",
      customerId: CUSTOMER_ID,
      dueDate: "2026-10-28",
    }),
    customerName: "",
    ...overrides,
  })
}

describe("definiciones de los pasos", () => {
  it("son cuatro, en el orden en que se recorren", () => {
    expect(SALE_STEPS.map((step) => step.id)).toEqual(["sale", "terms", "payment", "summary"])
    expect(SALE_STEPS.map((step) => step.order)).toEqual([1, 2, 3, 4])
  })

  it("el primer paso es «La venta»: es el que arranca abierto", () => {
    expect(FIRST_STEP_ID).toBe("sale")
  })

  it("los títulos y las bajadas de la dueña van textuales", () => {
    const byId = new Map(SALE_STEPS.map((step) => [step.id, step]))
    expect(byId.get("sale")?.title).toBe("La venta")
    expect(byId.get("sale")?.hint).toBe("Quién compró, qué se llevó y a cuánto.")
    expect(byId.get("terms")?.title).toBe("Condición de pago")
    expect(byId.get("terms")?.hint).toBe("Cuándo te paga: en el momento o después.")
  })

  it("los cuatro pasos tienen título y bajada, para que ninguno quede mudo", () => {
    for (const step of SALE_STEPS) {
      expect(step.title.trim()).not.toBe("")
      expect(step.hint.trim()).not.toBe("")
    }
  })

  it("el último paso no tiene siguiente y los otros sí", () => {
    expect(nextStepId("sale")).toBe("terms")
    expect(nextStepId("terms")).toBe("payment")
    expect(nextStepId("payment")).toBe("summary")
    expect(nextStepId("summary")).toBeNull()
  })
})

describe("validateStep en «La venta»", () => {
  it("un paso completo no tiene errores", () => {
    expect(validateStep("sale", formState(), TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("sin nombre y de contado pide el nombre libre", () => {
    const result = validateStep("sale", formState({ customerName: "   " }), TODAY)
    expect(result.valid).toBe(false)
    expect(result.errors.customer_name).toBe("Escribí el nombre del cliente")
  })

  it("con un cliente del padrón elegido no pide el nombre escrito: la venta va por customer_id (S43)", () => {
    const form = formState({
      customerName: "",
      condition: condition({ customerMode: "existing", customerId: CUSTOMER_ID }),
    })
    expect(validateStep("sale", form, TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("con crédito y cliente elegido no pide el nombre escrito", () => {
    expect(validateStep("sale", creditForm({ customerName: "" }), TODAY)).toEqual({
      valid: true,
      errors: {},
    })
  })

  it("con crédito, escribir el nombre alcanza: la venta ya no exige cliente registrado (S30)", () => {
    const form = creditForm({
      customerName: "María González",
      condition: condition({ terms: "credit", customerId: null }),
    })
    expect(validateStep("sale", form, TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("con crédito sin cliente ni nombre escrito pide el nombre, no el id (S30)", () => {
    const form = creditForm({
      customerName: "   ",
      condition: condition({ terms: "credit", customerId: null }),
    })
    const result = validateStep("sale", form, TODAY)
    expect(result.valid).toBe(false)
    expect(result.errors.customer_name).toBe("Escribí el nombre del cliente")
    expect(result.errors).not.toHaveProperty("customer_id")
  })

  it("pide el nombre del primer producto", () => {
    const form = formState({ products: [{ name: "", price: "1250.50" }] })
    expect(validateStep("sale", form, TODAY).errors.product_name).toBe(
      "Escribí qué se llevó el cliente",
    )
  })

  it("pide la fecha de la venta", () => {
    expect(validateStep("sale", formState({ saleDate: "" }), TODAY).errors.sale_date).toBe(
      "Elegí la fecha de la venta",
    )
  })

  it("no pide categoría: el campo se retiró del formulario (S47)", () => {
    const result = validateStep("sale", formState(), TODAY)
    expect(result.valid).toBe(true)
    expect(result.errors).not.toHaveProperty("category")
  })

  it("pide el precio del primer producto", () => {
    const form = formState({ products: [{ name: "Abrigo", price: "  " }] })
    expect(validateStep("sale", form, TODAY).errors.cost).toBe(
      "Escribí el precio de la mercadería",
    )
  })

  it("un precio que no es importe usa el texto de dinero de la casa", () => {
    const form = formState({ products: [{ name: "Abrigo", price: "1250,50" }] })
    expect(validateStep("sale", form, TODAY).errors.cost).toBe(
      "Escribí un importe como 1250.50",
    )
  })

  it("sin ningún producto en el estado pide el primero: la lista nunca arranca vacía en pantalla", () => {
    const result = validateStep("sale", formState({ products: [] }), TODAY)
    expect(result.valid).toBe(false)
    expect(Object.keys(result.errors).sort()).toEqual(["cost", "product_name"])
  })

  it("un solo producto completo alcanza: no hay nada que pedirle a los renglones que no existen", () => {
    expect(validateStep("sale", formState(), TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("con varios productos completos el paso está relleno", () => {
    const form = formState({
      products: [
        { name: "Abrigo de lana gris", price: "1250.50" },
        { name: "Camisa de lino", price: "800.00" },
        { name: "Cinturón", price: "300" },
      ],
    })
    expect(validateStep("sale", form, TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("un producto extra vacío frena el paso con el error de su renglón", () => {
    const form = formState({
      products: [
        { name: "Abrigo de lana gris", price: "1250.50" },
        { name: "", price: "" },
      ],
    })
    const result = validateStep("sale", form, TODAY)
    expect(result.valid).toBe(false)
    // El renglón de pantalla se numera con el primero adentro: el extra es el 1.
    expect(Object.keys(result.errors).sort()).toEqual(["items.1.name", "items.1.total"])
    expect(result.errors["items.1.name"]).toBe("Escribí el nombre de este renglón")
    expect(result.errors["items.1.total"]).toBe("Escribí el importe de este renglón")
  })

  it("un producto extra con el precio mal escrito también frena el paso", () => {
    const form = formState({
      products: [
        { name: "Abrigo de lana gris", price: "1250.50" },
        { name: "Camisa de lino", price: "ochocientos" },
      ],
    })
    const result = validateStep("sale", form, TODAY)
    expect(result.errors["items.1.total"]).toBe("Escribí un importe como 1250.50")
    expect(result.errors).not.toHaveProperty("items.1.name")
  })

  it("quitar un producto extra que estaba vacío devuelve el paso a relleno", () => {
    const withExtra = formState({
      products: [
        { name: "Abrigo de lana gris", price: "1250.50" },
        { name: "", price: "" },
      ],
    })
    expect(validateStep("sale", withExtra, TODAY).valid).toBe(false)
    const removed = formState({ products: withExtra.products.slice(0, 1) })
    expect(validateStep("sale", removed, TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("el primer producto vacío y un extra vacío se reclaman por separado", () => {
    const form = formState({
      products: [
        { name: "", price: "" },
        { name: "", price: "" },
      ],
    })
    expect(Object.keys(validateStep("sale", form, TODAY).errors).sort()).toEqual([
      "cost",
      "items.1.name",
      "items.1.total",
      "product_name",
    ])
  })

  it("con el checkbox del teléfono encendido y el campo vacío pide el teléfono", () => {
    const form = formState({ condition: condition({ addPhone: true, phone: "  " }) })
    expect(validateStep("sale", form, TODAY).errors.customer_phone).toBe(
      "Escribí el número de teléfono",
    )
  })

  it("con el checkbox apagado el teléfono no se mira", () => {
    const form = formState({ condition: condition({ addPhone: false, phone: "" }) })
    expect(validateStep("sale", form, TODAY).valid).toBe(true)
  })

  it("un teléfono que ya es de otro cliente frena el paso (S28)", () => {
    const form = formState({
      condition: condition({ addPhone: true, phone: "8888 1234", phoneOwnerId: CUSTOMER_ID }),
    })
    expect(validateStep("sale", form, TODAY).errors.customer_phone).toBe(PHONE_TAKEN_MESSAGE)
  })

  it("usar los datos del dueño del número desbloquea el paso (S28)", () => {
    const form = formState({
      condition: condition({
        addPhone: true,
        phone: "8888 1234",
        phoneOwnerId: CUSTOMER_ID,
        customerId: CUSTOMER_ID,
      }),
    })
    expect(validateStep("sale", form, TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("no devuelve errores de otros pasos", () => {
    // Crédito sin fecha prometida: el error es de «Condición de pago», no de acá.
    const form = creditForm({
      condition: condition({
        terms: "credit",
        customerMode: "existing",
        customerId: CUSTOMER_ID,
        dueDate: "",
      }),
    })
    expect(validateStep("sale", form, TODAY)).toEqual({ valid: true, errors: {} })
  })
})

describe("validateStep con los dos modos de cliente (S43)", () => {
  it("«Cliente nuevo» pide el nombre escrito y no el cliente del padrón", () => {
    const form = formState({
      customerName: "   ",
      condition: condition({ customerMode: "new", customerId: null }),
    })
    const result = validateStep("sale", form, TODAY)
    expect(result.valid).toBe(false)
    expect(result.errors.customer_name).toBe("Escribí el nombre del cliente")
    expect(result.errors).not.toHaveProperty("customer_id")
  })

  it("«Cliente nuevo» no acepta un cliente elegido de antes como reemplazo del nombre", () => {
    const form = formState({
      customerName: "",
      condition: condition({ customerMode: "new", customerId: CUSTOMER_ID }),
    })
    const result = validateStep("sale", form, TODAY)
    expect(result.valid).toBe(false)
    expect(result.errors.customer_name).toBe("Escribí el nombre del cliente")
    expect(result.errors).not.toHaveProperty("customer_id")
  })

  it("«Cliente existente» pide el cliente del padrón y no el nombre", () => {
    const form = formState({
      customerName: "",
      condition: condition({ customerMode: "existing", customerId: null }),
    })
    const result = validateStep("sale", form, TODAY)
    expect(result.valid).toBe(false)
    expect(result.errors.customer_id).toBe(EXISTING_CUSTOMER_REQUIRED_MESSAGE)
    expect(result.errors).not.toHaveProperty("customer_name")
  })

  it("«Cliente existente» sin cliente no cae al nombre escrito de antes", () => {
    const form = formState({
      customerName: "María González",
      condition: condition({ customerMode: "existing", customerId: null }),
    })
    expect(validateStep("sale", form, TODAY).errors.customer_id).toBe(
      EXISTING_CUSTOMER_REQUIRED_MESSAGE,
    )
  })

  it("«Cliente existente» con cliente elegido no pide el nombre escrito", () => {
    const form = formState({
      customerName: "",
      condition: condition({ customerMode: "existing", customerId: CUSTOMER_ID }),
    })
    expect(validateStep("sale", form, TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("«Cliente existente» no valida el teléfono: el checkbox es del otro camino", () => {
    const form = formState({
      condition: condition({
        customerMode: "existing",
        customerId: CUSTOMER_ID,
        addPhone: true,
        phone: "",
      }),
    })
    expect(validateStep("sale", form, TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("el envío final respeta el modo existente", () => {
    const form = formState({
      customerName: "",
      condition: condition({ customerMode: "existing", customerId: null }),
    })
    expect(validateStep("summary", form, TODAY).errors.customer_id).toBe(
      EXISTING_CUSTOMER_REQUIRED_MESSAGE,
    )
  })
})

describe("validateStep en «Condición de pago»", () => {
  it("de contado no hay nada que llenar", () => {
    expect(validateStep("terms", formState(), TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("de contado no mira el monto aunque tenga basura", () => {
    const form = formState({
      condition: condition({ collectNow: true, amountPaid: "abc" }),
    })
    expect(validateStep("terms", form, TODAY).valid).toBe(true)
  })

  it("con crédito pide la fecha prometida", () => {
    const form = creditForm({
      condition: condition({ terms: "credit", customerId: CUSTOMER_ID, dueDate: "" }),
    })
    const result = validateStep("terms", form, TODAY)
    expect(result.valid).toBe(false)
    expect(Object.keys(result.errors)).toEqual(["due_date"])
  })

  it("el cliente no es de este paso: el campo vive en «La venta» (S30)", () => {
    const form = creditForm({
      customerName: "",
      condition: condition({ terms: "credit", customerId: null, dueDate: "2026-10-28" }),
    })
    // La fecha está bien, así que «Condición de pago» no tiene nada que pedir…
    expect(validateStep("terms", form, TODAY)).toEqual({ valid: true, errors: {} })
    // …y el nombre lo pide el paso donde está su campo.
    expect(validateStep("sale", form, TODAY).errors.customer_name).toBe(
      "Escribí el nombre del cliente",
    )
    expect(validateStep("summary", form, TODAY).errors.customer_name).toBe(
      "Escribí el nombre del cliente",
    )
  })

  it("rechaza una fecha prometida anterior a hoy", () => {
    const form = creditForm({
      condition: condition({
        terms: "credit",
        customerId: CUSTOMER_ID,
        dueDate: "2026-09-27",
      }),
    })
    expect(validateStep("terms", form, TODAY).errors.due_date).toBe(
      "La fecha prometida no puede ser anterior a hoy",
    )
  })

  it("con cliente y fecha futura queda completo", () => {
    expect(validateStep("terms", creditForm(), TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("no valida el teléfono: ese campo también es de «La venta»", () => {
    const form = creditForm({
      condition: condition({
        terms: "credit",
        customerId: CUSTOMER_ID,
        dueDate: "2026-10-28",
        addPhone: true,
        phone: "",
      }),
    })
    expect(validateStep("terms", form, TODAY).valid).toBe(true)
  })

  it("no valida el nombre libre ni el precio: esos son de «La venta»", () => {
    const form = creditForm({ customerName: "", products: [] })
    expect(validateStep("terms", form, TODAY).valid).toBe(true)
  })
})

describe("validateStep en «Cobro»", () => {
  it("de contado sin cobrar en el momento no hay nada que llenar", () => {
    expect(validateStep("payment", formState(), TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("con tarjeta pide el banco emisor", () => {
    const form = formState({ condition: condition({ paymentMethod: "credit_card" }) })
    expect(validateStep("payment", form, TODAY).errors.payment_bank).toBe(
      "Elegí el banco emisor de la tarjeta",
    )
  })

  it("con tarjeta y banco queda completo", () => {
    const form = formState({
      condition: condition({ paymentMethod: "credit_card" }),
      paymentBank: "BAC Credomatic",
    })
    expect(validateStep("payment", form, TODAY).valid).toBe(true)
  })

  it("sin método elegido pide el método", () => {
    const form = formState({
      condition: condition({ paymentMethod: "" as ISaleConditionState["paymentMethod"] }),
    })
    expect(validateStep("payment", form, TODAY).errors.payment_method).toBe(
      "Elegí cómo se pagó la venta",
    )
  })

  it("con «¿Cobraste ahora?» encendido pide el monto", () => {
    const form = formState({ condition: condition({ collectNow: true, amountPaid: "" }) })
    expect(validateStep("payment", form, TODAY).errors.amount_paid).toBe(
      "Escribí el monto que cobraste",
    )
  })

  it("un monto insuficiente usa el mismo texto del modal del listado", () => {
    const form = formState({ condition: condition({ collectNow: true, amountPaid: "100.00" }) })
    expect(validateStep("payment", form, TODAY).errors.amount_paid).toBe(
      "Monto insuficiente. Faltan C$ 1,150.50",
    )
  })

  it("un monto exacto o con vuelto en efectivo queda completo", () => {
    for (const amountPaid of ["1250.50", "1300"]) {
      const form = formState({ condition: condition({ collectNow: true, amountPaid }) })
      expect(validateStep("payment", form, TODAY)).toEqual({ valid: true, errors: {} })
    }
  })

  it("con crédito no valida el monto: no hubo cobro", () => {
    const form = creditForm({
      condition: condition({
        terms: "credit",
        customerId: CUSTOMER_ID,
        dueDate: "2026-10-28",
        amountPaid: "abc",
      }),
    })
    expect(validateStep("payment", form, TODAY).valid).toBe(true)
  })

  // S57: el paso no pide nada en crédito. Ni método ni banco: el de cada abono
  // se elige al registrarlo, así que el paso nace relleno con los controles
  // vacíos y su «Siguiente» no tiene nada que frenar.
  it("con crédito está completo sin nada que llenar, aunque el método esté vacío (S57)", () => {
    const form = creditForm({
      condition: condition({
        terms: "credit",
        customerId: CUSTOMER_ID,
        dueDate: "2026-10-28",
        paymentMethod: "" as ISaleConditionState["paymentMethod"],
      }),
      paymentBank: "",
    })

    expect(validateStep("payment", form, TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("no valida cliente, fecha ni la lista de productos", () => {
    const form = formState({
      customerName: "",
      products: [{ name: "", price: "" }],
      condition: condition({ terms: "credit", customerId: null, dueDate: "" }),
    })
    expect(validateStep("payment", form, TODAY).valid).toBe(true)
  })
})

describe("validateStep en «Resumen»", () => {
  it("no tiene campos propios: está completo cuando el resto lo está", () => {
    expect(validateStep("summary", formState(), TODAY)).toEqual({ valid: true, errors: {} })
  })

  it("arrastra el error del paso que falta, sin inventar uno propio", () => {
    const form = formState({ products: [{ name: "Abrigo", price: "" }] })
    const result = validateStep("summary", form, TODAY)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual({ cost: "Escribí el precio de la mercadería" })
  })

  it("el aviso de teléfono repetido también frena el envío final (S28)", () => {
    const form = formState({
      condition: condition({ addPhone: true, phone: "8888 1234", phoneOwnerId: CUSTOMER_ID }),
    })
    expect(validateStep("summary", form, TODAY).errors.customer_phone).toBe(PHONE_TAKEN_MESSAGE)
  })

  it("junta los errores de los tres pasos anteriores", () => {
    const form = formState({
      customerName: "",
      products: [{ name: "", price: "" }],
      saleDate: "",
      condition: condition({ terms: "credit", customerId: null, dueDate: "" }),
    })
    expect(Object.keys(validateStep("summary", form, TODAY).errors).sort()).toEqual([
      "cost",
      "customer_name",
      "due_date",
      "product_name",
      "sale_date",
    ])
  })
})

describe("stepState", () => {
  it("un paso que todavía no se desbloqueó está bloqueado", () => {
    expect(stepState("terms", "sale", formState(), TODAY, initialStepProgress())).toBe("locked")
  })

  it("el paso bloqueado sigue bloqueado aunque sea el que se quiso abrir", () => {
    expect(stepState("payment", "payment", formState(), TODAY, initialStepProgress())).toBe(
      "locked",
    )
  })

  it("el paso abierto es el que está en curso, aunque le falten campos", () => {
    const form = formState({ customerName: "" })
    expect(stepState("sale", "sale", form, TODAY, initialStepProgress())).toBe("current")
  })

  it("un paso cerrado confirmado y con todo lleno queda rellenado", () => {
    expect(stepState("terms", "sale", creditForm(), TODAY, ALL_CONFIRMED)).toBe("complete")
  })

  it("un paso cerrado al que le falta algo queda pendiente", () => {
    const form = creditForm({ condition: condition({ terms: "credit" }) })
    expect(stepState("terms", "sale", form, TODAY, ALL_CONFIRMED)).toBe("pending")
  })

  it("sin ningún paso abierto ninguno está en curso", () => {
    for (const step of SALE_STEPS) {
      expect(stepState(step.id, null, formState(), TODAY, ALL_CONFIRMED)).not.toBe("current")
    }
  })

  it("el rellenado se recalcula: borrar el precio devuelve «La venta» a pendiente", () => {
    const complete = formState()
    expect(stepState("sale", "terms", complete, TODAY, ALL_CONFIRMED)).toBe("complete")
    const withoutPrice = formState({ products: [{ name: "Abrigo de lana gris", price: "" }] })
    expect(stepState("sale", "terms", withoutPrice, TODAY, ALL_CONFIRMED)).toBe("pending")
  })

  it("el rellenado se recalcula: un producto extra vacío devuelve «La venta» a pendiente", () => {
    const complete = formState()
    expect(stepState("sale", "terms", complete, TODAY, ALL_CONFIRMED)).toBe("complete")
    const withEmptyExtra = formState({
      products: [
        { name: "Abrigo de lana gris", price: "1250.50" },
        { name: "", price: "" },
      ],
    })
    expect(stepState("sale", "terms", withEmptyExtra, TODAY, ALL_CONFIRMED)).toBe("pending")
  })

  it("el rellenado se recalcula: pasar a crédito sin fecha prometida deja «Condición de pago» pendiente", () => {
    const immediate = formState()
    expect(stepState("terms", "sale", immediate, TODAY, ALL_CONFIRMED)).toBe("complete")
    const credit = formState({
      condition: condition({ terms: "credit", customerId: CUSTOMER_ID }),
    })
    expect(stepState("terms", "sale", credit, TODAY, ALL_CONFIRMED)).toBe("pending")
  })

  it("el rellenado se recalcula: soltar el cliente de una venta a crédito invalida «La venta» (S30)", () => {
    expect(stepState("sale", "terms", creditForm(), TODAY, ALL_CONFIRMED)).toBe("complete")
    // Sin cliente elegido y sin nombre, el campo Cliente queda vacío.
    const released = creditForm({
      customerName: "",
      condition: condition({ terms: "credit", customerId: null, dueDate: "2026-10-28" }),
    })
    expect(stepState("sale", "terms", released, TODAY, ALL_CONFIRMED)).toBe("pending")
  })

  it("un paso desbloqueado y válido que nadie confirmó sigue pendiente (S59)", () => {
    // Con Contado, «Condición de pago» no tiene nada que llenar: por validez sola
    // nacería rellenada antes de que la dueña pulse «Siguiente».
    expect(stepState("terms", "sale", formState(), TODAY, progress(["sale", "terms"]))).toBe(
      "pending",
    )
    expect(stepState("terms", "sale", formState(), TODAY, ALL_CONFIRMED)).toBe("complete")
  })

  it("un paso confirmado pero inválido sigue pendiente", () => {
    const credit = formState({ condition: condition({ terms: "credit" }) })
    expect(
      stepState("terms", "sale", credit, TODAY, progress(["sale", "terms"], ["terms"])),
    ).toBe("pending")
  })

  it("el paso abierto no tiene etiqueta; los otros dicen su estado en palabras", () => {
    expect(STEP_STATE_LABEL).toEqual({
      locked: "Bloqueado",
      current: "",
      complete: "Rellenado",
      pending: "Pendiente",
    })
  })
})

describe("stepViews", () => {
  it("devuelve los cuatro pasos en orden, cada uno con su estado y su etiqueta", () => {
    const views = stepViews("sale", formState({ products: [{ name: "Abrigo", price: "" }] }), TODAY, ALL_CONFIRMED)
    expect(views.map((view) => view.id)).toEqual(["sale", "terms", "payment", "summary"])
    expect(views.map((view) => view.state)).toEqual(["current", "complete", "complete", "pending"])
    expect(views.map((view) => view.label)).toEqual([
      "",
      "Rellenado",
      "Rellenado",
      "Pendiente",
    ])
  })

  it("con el formulario completo el resumen también queda rellenado", () => {
    const views = stepViews("summary", formState(), TODAY, ALL_CONFIRMED)
    expect(views[3]?.state).toBe("current")
    expect(views.slice(0, 3).every((view) => view.state === "complete")).toBe(true)
  })

  it("los pasos que todavía no se desbloquearon salen bloqueados, con su insignia (S59)", () => {
    const views = stepViews("sale", formState(), TODAY, initialStepProgress())
    expect(views.map((view) => view.state)).toEqual(["current", "locked", "locked", "locked"])
    expect(views.map((view) => view.label)).toEqual(["", "Bloqueado", "Bloqueado", "Bloqueado"])
  })
})

describe("progreso de los pasos (S59)", () => {
  it("abre con sólo «La venta» desbloqueada y nada confirmado", () => {
    const start = initialStepProgress()
    expect([...start.unlocked]).toEqual(["sale"])
    expect([...start.confirmed]).toEqual([])
  })

  it("«Siguiente» en un paso válido lo confirma y desbloquea el siguiente", () => {
    const afterSale = confirmStep(initialStepProgress(), "sale")
    expect([...afterSale.confirmed]).toEqual(["sale"])
    expect([...afterSale.unlocked].sort()).toEqual(["sale", "terms"])
  })

  it("el desbloqueo no se revierte: editar un paso anterior deja abiertos los siguientes", () => {
    const afterPayment = confirmGate(initialStepProgress())
    const edited = revokeStep(afterPayment, "sale")
    expect([...edited.confirmed].sort()).toEqual(["payment", "terms"])
    expect([...edited.unlocked].sort()).toEqual(["payment", "sale", "summary", "terms"])
  })

  it("revocar un paso que no estaba confirmado no cambia nada", () => {
    const start = initialStepProgress()
    expect(revokeStep(start, "terms")).toBe(start)
  })

  it("confirmar el último paso no inventa uno nuevo", () => {
    const done = confirmStep(initialStepProgress(), "summary")
    expect([...done.unlocked].sort()).toEqual(["sale", "summary"])
  })
})

describe("firstUnconfirmedStep y canSubmit (S61)", () => {
  it("sin nada confirmado el primero que falta es «La venta»", () => {
    expect(firstUnconfirmedStep(initialStepProgress(), formState(), TODAY)).toBe("sale")
    expect(canSubmit(initialStepProgress(), formState(), TODAY)).toBe(false)
  })

  it("con «La venta» confirmada el que falta es «Condición de pago», aunque valga", () => {
    const afterSale = confirmStep(initialStepProgress(), "sale")
    expect(firstUnconfirmedStep(afterSale, formState(), TODAY)).toBe("terms")
  })

  it("con los tres pasos confirmados la venta se registra sin confirmar el resumen", () => {
    const done = confirmGate(initialStepProgress())
    expect(firstUnconfirmedStep(done, formState(), TODAY)).toBeNull()
    expect(canSubmit(done, formState(), TODAY)).toBe(true)
  })

  it("un paso confirmado que dejó de validar frena el envío y vuelve a ser el primero", () => {
    const done = confirmGate(initialStepProgress())
    const withoutPrice = formState({ products: [{ name: "Abrigo", price: "" }] })
    expect(firstUnconfirmedStep(done, withoutPrice, TODAY)).toBe("sale")
    expect(canSubmit(done, withoutPrice, TODAY)).toBe(false)
  })

  it("un paso editado —revocado— frena el envío aunque sus campos estén bien", () => {
    const done = confirmGate(initialStepProgress())
    expect(firstUnconfirmedStep(revokeStep(done, "payment"), formState(), TODAY)).toBe("payment")
  })
})

describe("stepOfField", () => {
  it("ubica cada campo en su paso", () => {
    const cases: [string, SaleStepId][] = [
      ["customer_name", "sale"],
      ["customer_phone", "sale"],
      ["product_name", "sale"],
      ["sale_date", "sale"],
      ["cost", "sale"],
      ["items.3.total", "sale"],
      ["customer_id", "sale"],
      ["due_date", "terms"],
      ["payment_method", "payment"],
      ["payment_bank", "payment"],
      ["amount_paid", "payment"],
    ]
    for (const [key, step] of cases) expect(stepOfField(key)).toBe(step)
  })

  it("un campo que no es del formulario no pertenece a ningún paso", () => {
    expect(stepOfField("inventado")).toBeNull()
  })
})

describe("firstStepWithErrors", () => {
  it("sin errores no hay paso que abrir", () => {
    expect(firstStepWithErrors({})).toBeNull()
  })

  it("devuelve el primero en el orden de los pasos, no el primero que llegó", () => {
    expect(
      firstStepWithErrors({
        amount_paid: "Escribí el monto que cobraste",
        cost: "Escribí el precio de la mercadería",
      }),
    ).toBe("sale")
    expect(
      firstStepWithErrors({
        amount_paid: "Escribí el monto que cobraste",
        due_date: "Elegí la fecha de pago prometida",
      }),
    ).toBe("terms")
  })

  it("un error del nombre escrito abre «La venta», que es donde está su campo (S30)", () => {
    expect(firstStepWithErrors({ customer_name: "Escribí el nombre del cliente" })).toBe("sale")
  })

  it("devuelve el único paso con error", () => {
    expect(firstStepWithErrors({ payment_bank: "Elegí el banco emisor de la tarjeta" })).toBe(
      "payment",
    )
  })
})
