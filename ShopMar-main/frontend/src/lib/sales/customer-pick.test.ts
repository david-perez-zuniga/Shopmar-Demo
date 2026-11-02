import { describe, expect, it } from "vitest"
import type { ICustomerResponse } from "../core/types"
import {
  CUSTOMER_MODE_LABELS,
  CUSTOMER_NAME_REQUIRED_MESSAGE,
  DEFAULT_CUSTOMER_MODE,
  EXISTING_CUSTOMER_LABEL,
  EXISTING_CUSTOMER_REQUIRED_MESSAGE,
  MIN_CUSTOMER_QUERY_LENGTH,
  NEW_CUSTOMER_LABEL,
  PHONE_TAKEN_MESSAGE,
  PHONE_TAKEN_OTHER_NUMBER,
  PHONE_TAKEN_TITLE,
  PHONE_TAKEN_USE_DATA,
  customerQueryReady,
  customerSelection,
  digitsOnly,
  phoneMatch,
  phoneOwnerBlocks,
  validateCustomerChoice,
} from "./customer-pick"

const CUSTOMER_ID = "8f14a2c6-0d97-4b53-9e21-5c7a3b0f2d16"
const OTHER_ID = "1c6d3b90-5a44-4e0f-9b1d-7f2e8a4c6d31"

function customer(overrides: Partial<ICustomerResponse> = {}): ICustomerResponse {
  return {
    id: CUSTOMER_ID,
    name: "María González",
    phone: "8888 1234",
    note: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("la copia de S28 va textual", () => {
  it("el aviso, sus dos salidas y el error del campo son los de la dueña", () => {
    expect(PHONE_TAKEN_TITLE).toBe("Número asociado a cliente existente")
    expect(PHONE_TAKEN_USE_DATA).toBe("Usar sus datos")
    expect(PHONE_TAKEN_OTHER_NUMBER).toBe("Escribir otro número")
    expect(PHONE_TAKEN_MESSAGE).toBe(
      "Ese número es de otro cliente: usá sus datos o escribí otro número",
    )
  })

  it("el error del nombre escrito es el que ya tenía la pantalla", () => {
    expect(CUSTOMER_NAME_REQUIRED_MESSAGE).toBe("Escribí el nombre del cliente")
  })
})

describe("la copia de S43 va textual", () => {
  it("los dos botones se llaman como pidió la dueña", () => {
    expect(NEW_CUSTOMER_LABEL).toBe("Cliente nuevo")
    expect(EXISTING_CUSTOMER_LABEL).toBe("Cliente existente")
  })

  it("«Cliente nuevo» es el modo por defecto", () => {
    expect(DEFAULT_CUSTOMER_MODE).toBe("new")
  })

  it("cada modo tiene su rótulo, en un solo lugar", () => {
    expect(CUSTOMER_MODE_LABELS).toEqual({
      new: NEW_CUSTOMER_LABEL,
      existing: EXISTING_CUSTOMER_LABEL,
    })
  })

  it("el error del modo existente nombra su control, en español", () => {
    expect(EXISTING_CUSTOMER_REQUIRED_MESSAGE).toBe("Elegí un cliente existente")
  })
})

describe("digitsOnly", () => {
  it("el mismo número escrito de tres maneras deja los mismos dígitos", () => {
    for (const phone of ["8888 1234", "88881234", "8888-1234", "(8888) 1234", " 8888.1234 "]) {
      expect(digitsOnly(phone)).toBe("88881234")
    }
  })

  it("el código de país es parte del número: no se recorta", () => {
    expect(digitsOnly("+505 8888 1234")).toBe("50588881234")
  })

  it("sin dígitos devuelve la cadena vacía", () => {
    expect(digitsOnly("")).toBe("")
    expect(digitsOnly("   ")).toBe("")
    expect(digitsOnly("sin número")).toBe("")
  })
})

describe("phoneMatch", () => {
  it("encuentra al cliente aunque el número esté guardado con otro formato", () => {
    const found = phoneMatch([customer({ phone: "(8888) 12-34" })], "88881234")
    expect(found?.id).toBe(CUSTOMER_ID)
  })

  it("sin coincidencia no devuelve nada", () => {
    expect(phoneMatch([customer()], "9999 0000")).toBeNull()
  })

  it("un teléfono vacío no coincide con nadie", () => {
    // Sin esta guarda, cualquier cliente sin teléfono "coincidiría" con el campo vacío.
    expect(phoneMatch([customer({ phone: null })], "")).toBeNull()
    expect(phoneMatch([customer({ phone: null })], "   ")).toBeNull()
  })

  it("los clientes sin teléfono nunca coinciden", () => {
    expect(phoneMatch([customer({ phone: null })], "88881234")).toBeNull()
  })

  it("devuelve el primero que devuelve la API cuando dos comparten número", () => {
    // Una familia comparte teléfono: el orden alfabético de la API decide cuál se ofrece.
    const found = phoneMatch(
      [
        customer({ id: CUSTOMER_ID, name: "Ana González" }),
        customer({ id: OTHER_ID, name: "Beto González" }),
      ],
      "88881234",
    )
    expect(found?.id).toBe(CUSTOMER_ID)
  })

  it("el cliente ya elegido no se avisa a sí mismo", () => {
    const found = phoneMatch([customer()], "8888 1234", CUSTOMER_ID)
    expect(found).toBeNull()
  })

  it("con el cliente elegido, el número de otro sí se avisa", () => {
    const found = phoneMatch(
      [customer({ id: OTHER_ID, name: "Beto González", phone: "9999 0000" }), customer()],
      "8888 1234",
      OTHER_ID,
    )
    expect(found?.id).toBe(CUSTOMER_ID)
  })

  it("una lista vacía no rompe", () => {
    expect(phoneMatch([], "88881234")).toBeNull()
  })
})

describe("phoneOwnerBlocks", () => {
  it("sin dueño del número no bloquea", () => {
    expect(phoneOwnerBlocks(null, null)).toBe(false)
    expect(phoneOwnerBlocks("", CUSTOMER_ID)).toBe(false)
    expect(phoneOwnerBlocks("   ", null)).toBe(false)
  })

  it("con dueño y sin cliente elegido bloquea", () => {
    expect(phoneOwnerBlocks(CUSTOMER_ID, null)).toBe(true)
  })

  it("con dueño y otro cliente elegido bloquea", () => {
    expect(phoneOwnerBlocks(CUSTOMER_ID, OTHER_ID)).toBe(true)
  })

  it("usar los datos del dueño resuelve el aviso", () => {
    expect(phoneOwnerBlocks(CUSTOMER_ID, CUSTOMER_ID)).toBe(false)
  })
})

describe("customerSelection con «Cliente nuevo» (S43)", () => {
  it("manda el nombre escrito", () => {
    expect(customerSelection({ mode: "new", customerId: null, typedName: "María González" })).toEqual(
      { customer_name: "María González" },
    )
  })

  it("nunca manda customer_id, aunque el estado tenga un cliente elegido de antes", () => {
    // El modo decide qué clave viaja: un id que quedó del camino anterior es un
    // resto, y la API rechaza las dos claves juntas.
    const keys = customerSelection({
      mode: "new",
      customerId: CUSTOMER_ID,
      typedName: "María González",
    })
    expect(keys).toEqual({ customer_name: "María González" })
    expect(keys).not.toHaveProperty("customer_id")
  })

  it("sin nombre escrito no inventa la clave", () => {
    expect(customerSelection({ mode: "new", customerId: null, typedName: undefined })).toEqual({})
  })

  it("con el nombre vacío lo sigue mandando: el error lo pinta la pantalla", () => {
    expect(customerSelection({ mode: "new", customerId: null, typedName: "" })).toEqual({
      customer_name: "",
    })
  })

  it("el nombre escrito manda igual en las dos condiciones (S30)", () => {
    // La condición de pago no decide qué clave viaja: escribir el nombre
    // alcanza en contado y en crédito.
    const typed = customerSelection({ mode: "new", customerId: null, typedName: "María González" })
    expect(typed).toEqual({ customer_name: "María González" })
    expect(typed).not.toHaveProperty("customer_id")
  })
})

describe("customerSelection con «Cliente existente» (S43)", () => {
  it("manda el id del cliente elegido", () => {
    expect(
      customerSelection({ mode: "existing", customerId: CUSTOMER_ID, typedName: undefined }),
    ).toEqual({ customer_id: CUSTOMER_ID })
  })

  it("nunca manda customer_name, aunque haya un nombre escrito de antes", () => {
    const keys = customerSelection({
      mode: "existing",
      customerId: CUSTOMER_ID,
      typedName: "María González",
    })
    expect(keys).toEqual({ customer_id: CUSTOMER_ID })
    expect(keys).not.toHaveProperty("customer_name")
  })

  it("sin cliente elegido no manda ninguna clave: no cae al nombre escrito", () => {
    expect(
      customerSelection({ mode: "existing", customerId: null, typedName: "María González" }),
    ).toEqual({})
    expect(customerSelection({ mode: "existing", customerId: "   ", typedName: "María" })).toEqual(
      {},
    )
  })
})

describe("validateCustomerChoice con «Cliente nuevo» (S43)", () => {
  it("sin nombre escrito pide el nombre", () => {
    expect(validateCustomerChoice({ mode: "new", customerId: null, typedName: "   " })).toEqual({
      customer_name: CUSTOMER_NAME_REQUIRED_MESSAGE,
    })
  })

  it("con el nombre escrito queda limpio: la venta a crédito no exige cliente registrado (S30)", () => {
    expect(validateCustomerChoice({ mode: "new", customerId: null, typedName: "María" })).toEqual(
      {},
    )
  })

  it("un cliente elegido de antes no reemplaza al nombre escrito", () => {
    const errors = validateCustomerChoice({
      mode: "new",
      customerId: CUSTOMER_ID,
      typedName: "   ",
    })
    expect(errors).toEqual({ customer_name: CUSTOMER_NAME_REQUIRED_MESSAGE })
    expect(errors).not.toHaveProperty("customer_id")
  })
})

describe("validateCustomerChoice con «Cliente existente» (S43)", () => {
  it("sin cliente elegido pide el cliente y no el nombre", () => {
    const errors = validateCustomerChoice({ mode: "existing", customerId: null, typedName: "" })
    expect(errors).toEqual({ customer_id: EXISTING_CUSTOMER_REQUIRED_MESSAGE })
    expect(errors).not.toHaveProperty("customer_name")
  })

  it("un nombre escrito de antes no alcanza: el modo existente no cae al nombre", () => {
    const errors = validateCustomerChoice({
      mode: "existing",
      customerId: "   ",
      typedName: "María González",
    })
    expect(errors).toEqual({ customer_id: EXISTING_CUSTOMER_REQUIRED_MESSAGE })
    expect(errors).not.toHaveProperty("customer_name")
  })

  it("con cliente elegido queda limpio aunque no haya nombre escrito", () => {
    expect(
      validateCustomerChoice({ mode: "existing", customerId: CUSTOMER_ID, typedName: "" }),
    ).toEqual({})
  })
})

// S63: el cliente es opcional en una venta de contado. El modo «sin cliente» es
// el que reporta la vista cuando el checkbox «Agregar cliente» está apagado: no
// manda ninguna de las dos claves —el servidor guarda «Consumidor Final» sin
// crear una fila en el padrón— y no pide nada al validar.
describe("el modo «sin cliente» de una venta de contado (S63)", () => {
  it("no manda ninguna de las dos claves, aunque queden restos del otro camino", () => {
    expect(
      customerSelection({ mode: "none", customerId: CUSTOMER_ID, typedName: "María González" }),
    ).toEqual({})
  })

  it("no pide nada al validar el paso del cliente", () => {
    expect(validateCustomerChoice({ mode: "none", customerId: null, typedName: "" })).toEqual({})
  })
})

describe("customerQueryReady", () => {
  it("una sola letra no dispara la búsqueda", () => {
    expect(customerQueryReady("")).toBe(false)
    expect(customerQueryReady("   ")).toBe(false)
    expect(customerQueryReady(" M ")).toBe(false)
    expect(MIN_CUSTOMER_QUERY_LENGTH).toBe(2)
  })

  it("dos caracteres alcanzan, sean nombre o teléfono", () => {
    expect(customerQueryReady("Ma")).toBe(true)
    expect(customerQueryReady(" 88 ")).toBe(true)
  })
})
