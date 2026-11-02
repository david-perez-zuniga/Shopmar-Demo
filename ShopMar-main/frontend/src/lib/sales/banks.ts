/**
 * Bancos emisores que ofrece el formulario de venta (S4).
 *
 * Es una **decisión de interfaz**, no del servidor: la API sigue aceptando texto
 * en `payment_bank` (máximo 100, obligatorio con tarjeta y prohibido con
 * efectivo), así que los valores ya guardados se siguen imprimiendo y agregar un
 * banco nuevo solo pide tocar esta lista, sin migración (S5). La lista vive acá
 * —y no en el marcado del formulario— para que la pantalla y sus pruebas lean la
 * misma fuente en el mismo orden.
 */
export const PAYMENT_BANKS = [
  "BAC Credomatic",
  "LAFISE",
  "BANPRO",
  "Ficohsa",
  "AVANZ",
  "ProCredit",
  "BANEX",
] as const

export type PaymentBank = (typeof PAYMENT_BANKS)[number]

/**
 * Opción vacía del `<select>`. Es el estado «sin banco elegido»: el `required`
 * que pone `syncBankField` con tarjeta se apoya en su `value=""`, y al volver a
 * efectivo el campo se limpia seleccionándola.
 */
export const PAYMENT_BANK_PLACEHOLDER = "Seleccioná un banco"
