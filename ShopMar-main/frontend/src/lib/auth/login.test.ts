import { describe, expect, it } from "vitest"
import {
  loginErrorMessage,
  loginHref,
  readNext,
  safeNext,
  validateLoginForm,
} from "./login"

/**
 * La parte pura de `/login` (T6): qué se acepta como `next`, qué se valida en
 * el cliente antes de gastar un intento del límite de 10 por minuto, y qué
 * mensaje se pinta para cada respuesta del contrato (`07-auth.md`).
 */

describe("el next de /login (T6)", () => {
  it("acepta una ruta del panel y le conserva la query", () => {
    expect(safeNext("/sales")).toBe("/sales")
    expect(safeNext("/sales?page=2")).toBe("/sales?page=2")
    expect(safeNext("/sales/detail?id=s1")).toBe("/sales/detail?id=s1")
    expect(safeNext("/")).toBe("/")
  })

  it("sin next cae en la raíz", () => {
    expect(safeNext(null)).toBe("/")
    expect(safeNext(undefined)).toBe("/")
    expect(safeNext("")).toBe("/")
    expect(safeNext("   ")).toBe("/")
  })

  it("nunca redirige a un origen externo", () => {
    expect(safeNext("https://evil.example/promo")).toBe("/")
    expect(safeNext("//evil.example/promo")).toBe("/")
    expect(safeNext("/\\evil.example/promo")).toBe("/")
    expect(safeNext("javascript:alert(1)")).toBe("/")
    expect(safeNext("%2F%2Fevil.example")).toBe("/")
  })

  it("una ruta que no es del panel cae en la raíz: /login no se encadena", () => {
    expect(safeNext("/login")).toBe("/")
    expect(safeNext("/login?next=%2Fsales")).toBe("/")
    expect(safeNext("/no-existe")).toBe("/")
    expect(safeNext("/offline")).toBe("/")
  })

  it("lee el next del search de la URL y lo sanea", () => {
    expect(readNext("?next=%2Fsales")).toBe("/sales")
    expect(readNext("?otra=cosa&next=%2Fcustomers")).toBe("/customers")
    expect(readNext("")).toBe("/")
    expect(readNext("?next=https%3A%2F%2Fevil.example")).toBe("/")
  })

  it("arma la URL de login con el next codificado, para que no rompa la query", () => {
    expect(loginHref("/sales")).toBe("/login?next=%2Fsales")
    expect(loginHref("/sales?page=2")).toBe("/login?next=%2Fsales%3Fpage%3D2")
  })
})

describe("la validación del formulario (T6)", () => {
  it("con usuario y contraseña no hay nada que reclamar", () => {
    expect(validateLoginForm("ana", "una-contraseña-larga")).toBeNull()
    expect(validateLoginForm("ana@tienda.com", "x")).toBeNull()
  })

  it("sin identifier no se envía: el límite es de 10 por minuto", () => {
    expect(validateLoginForm("", "x")).toBe("Escribí tu usuario o correo.")
    expect(validateLoginForm("   ", "x")).toBe("Escribí tu usuario o correo.")
  })

  it("sin contraseña no se envía", () => {
    expect(validateLoginForm("ana", "")).toBe("Escribí tu contraseña.")
  })
})

describe("los mensajes de error del login (T6)", () => {
  it("un 401 pinta el mensaje del contrato, sin distinguir la causa", () => {
    expect(loginErrorMessage({ code: "UNAUTHORIZED", status: 401 })).toBe("Usuario o contraseña incorrectos.")
  })

  it("un 429 avisa del límite de intentos", () => {
    expect(loginErrorMessage({ code: "RATE_LIMITED", status: 429 })).toBe(
      "Demasiados intentos. Esperá un minuto.",
    )
  })

  it("un error de red dice que no se pudo conectar", () => {
    expect(loginErrorMessage({ code: "NETWORK_ERROR", status: 0 })).toBe("No se pudo conectar")
  })

  it("cualquier otra respuesta usa un mensaje genérico, nunca el código crudo", () => {
    expect(loginErrorMessage({ code: "INTERNAL_ERROR", status: 500 })).toBe(
      "No se pudo iniciar sesión. Probá de nuevo.",
    )
  })
})
