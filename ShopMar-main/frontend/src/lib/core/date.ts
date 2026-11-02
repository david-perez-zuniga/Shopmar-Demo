export function todayLocal(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}
/**
 * Minutos al este de UTC del navegador, en el signo que espera la API
 * (Nicaragua = `-360`). `Date#getTimezoneOffset()` devuelve lo contrario —los
 * minutos que hay que sumarle a la hora local para llegar a UTC—, así que la
 * traducción vive en un solo lugar.
 */
export function utcOffsetMinutes(timezoneOffset: number = new Date().getTimezoneOffset()): number {
  // `-0` no es `0` para `Object.is`, y viajaría a la query como "-0".
  return timezoneOffset === 0 ? 0 : -timezoneOffset
}
