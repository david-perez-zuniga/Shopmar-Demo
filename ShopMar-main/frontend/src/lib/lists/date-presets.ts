/**
 * Los tres presets del filtro de fechas (S34) y su lectura de la URL.
 *
 * Es lógica pura: no sabe de query strings, de la API ni del DOM. Las cuatro
 * pantallas (resumen, ventas, paquetes y gastos) solo usan esto para escribir
 * `start_date`/`end_date`, y el control vive en `DateRangeFilter.astro`, así que
 * las etiquetas y los rangos no pueden divergir entre pantallas.
 *
 * La ventana de «Últimos 7 días» sale de `lastDaysRange` a propósito: el resumen
 * ya mide su período por defecto con esa función, y dos cuentas de días distintas
 * darían dos «últimos 7 días» que no coinciden.
 */

import { lastDaysRange } from "../summary/summary"

/** Rango de fechas tal como viaja en la URL, en `YYYY-MM-DD` local. */
export type DateRange = { start_date: string; end_date: string }

export type DatePreset = "today" | "last7" | "lastMonth" | "custom"

export type DatePresetOption = { id: DatePreset; label: string }

/** Días que cubre «Últimos 7 días», hoy incluido. */
export const LAST_DAYS = 7

/** Días que cubre «Último mes», hoy incluido: la misma cuenta de días que el resto. */
export const LAST_MONTH_DAYS = 30

/**
 * Las cuatro opciones en el orden en que se pintan. Los rótulos son los que pidió
 * la dueña, con sus tildes: son copy, no identificadores (S34, S53).
 */
export const DATE_PRESETS: readonly DatePresetOption[] = [
  { id: "today", label: "Hoy" },
  { id: "last7", label: "Últimos 7 días" },
  { id: "lastMonth", label: "Último mes" },
  { id: "custom", label: "Personalizado" },
]

/**
 * El rango que escribe cada preset.
 *
 * «Hoy» es un solo día, «Últimos 7 días» es hoy más los seis anteriores y
 * «Último mes» es hoy más los veintinueve anteriores: ventanas de días, no meses
 * de calendario, calculadas en fecha local porque `sale_date` y `expense_date`
 * son días y no instantes. Treinta días es lo que la dueña espera de «último
 * mes»; un mes calendario daría 28, 29, 30 o 31 según el día, que es peor.
 */
export function presetRange(preset: DatePreset, today: Date = new Date()): DateRange {
  // «Personalizado» no calcula nada: las fechas las escribe la persona. El rango
  // vacío es el estado «sin rango» de S35, no un error.
  if (preset === "custom") return { start_date: "", end_date: "" }
  const days = preset === "today" ? 1 : preset === "last7" ? LAST_DAYS : LAST_MONTH_DAYS
  return lastDaysRange(days, today)
}

/**
 * Qué opción representa el rango de la URL.
 *
 * Todo lo que no sea exactamente «hoy» o exactamente la ventana de siete días es
 * «Personalizado», incluido el rango vacío: sin fechas la pantalla lista todo, y
 * ese estado se lee como Personalizado con los campos vacíos (S35).
 */
/**
 * El rango que la pantalla debe usar. Sin fechas en la URL el valor por defecto
 * es **hoy** (S36): el control y la consulta tienen que decir lo mismo, así que
 * la resolución vive acá y la usan los cuatro lectores de filtros.
 */
export function resolveDateRange(
  start: string,
  end: string,
  today: Date = new Date(),
): DateRange {
  if (start === "" && end === "") return presetRange("today", today)
  return { start_date: start, end_date: end }
}

export function presetFor(start: string, end: string, today: Date = new Date()): DatePreset {
  const range = resolveDateRange(start, end, today)
  start = range.start_date
  end = range.end_date
  const hoy = presetRange("today", today)
  if (start === hoy.start_date && end === hoy.end_date) return "today"

  const semana = presetRange("last7", today)
  if (start === semana.start_date && end === semana.end_date) return "last7"

  const mes = presetRange("lastMonth", today)
  if (start === mes.start_date && end === mes.end_date) return "lastMonth"

  return "custom"
}
