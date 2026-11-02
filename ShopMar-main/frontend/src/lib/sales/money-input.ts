/**
 * Los campos de dinero del formulario de venta (S51).
 *
 * El formulario es `novalidate` y la validación de importes vive en el modelo,
 * así que el navegador deja escribir cualquier cosa: letras incluidas. Acá se
 * resuelve en dos capas, sin depender del navegador:
 *
 * - `sanitizeMoneyInput` filtra lo que no puede formar un importe mientras se
 *   escribe: sólo dígitos, un único punto y hasta dos decimales.
 * - `moneyInputError` decide si lo que quedó es un importe completo. Un valor a
 *   medio escribir («1250.») no es un error todavía; una letra tampoco llega acá
 *   porque el filtro ya la sacó.
 *
 * El formato es el mismo de `MONEY_PATTERN`: hasta ocho enteros y dos decimales.
 */

import { toCents } from "./payment"

/** Tope de enteros del patrón de dinero del proyecto. */
const MAX_INTEGER_DIGITS = 8

export function sanitizeMoneyInput(raw: string): string {
  const digitsAndDots = raw.replace(/[^\d.]/g, "")

  const firstDot = digitsAndDots.indexOf(".")
  const integers = (firstDot === -1 ? digitsAndDots : digitsAndDots.slice(0, firstDot)).slice(
    0,
    MAX_INTEGER_DIGITS,
  )
  if (firstDot === -1) return integers

  const decimals = digitsAndDots
    .slice(firstDot + 1)
    .replace(/\./g, "")
    .slice(0, 2)

  // «.5» no es un importe válido, pero es un paso natural al escribir: se
  // completa con el cero de adelante en vez de rechazarlo.
  return `${integers === "" ? "0" : integers}.${decimals}`
}

/**
 * El mensaje del campo, o `null` cuando no hay nada que reclamar. Vacío y un
 * punto final en curso no son errores: el usuario todavía está escribiendo.
 */
export function moneyInputError(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === "") return null
  if (/^\d{1,8}\.$/.test(trimmed)) return null
  // `toCents` aplica el mismo patrón que el envío: si lo entiende, es un importe.
  if (toCents(trimmed) !== null) return null
  return "Escribí un importe como 1250.50"
}
