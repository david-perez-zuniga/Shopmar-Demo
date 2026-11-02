/**
 * El `localStorage` y el `sessionStorage` del navegador, o `null` si no se puede
 * tocar.
 *
 * En modo privado, o con el almacenamiento bloqueado por el navegador, el
 * acceso lanza al **leer** la propiedad, no sólo al usarla. Cada consumidor que
 * guarda algo local —el borrador de venta (S49), la copia del `me` de la sesión
 * (T6), el estado del panel de filtros y la consulta recordada de cada lista
 * (S58)— tiene que quedarse sin persistencia en vez de romperse, así que el
 * acceso se pide por acá.
 */

export function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * El `sessionStorage` de una ventana, o `null` si el navegador lo bloquea.
 *
 * `source` es inyectable porque el router puede estar montado sobre otra ventana
 * (sus pruebas); sin argumento se usa la del documento.
 */
export function safeSessionStorage(source: Window | null = null): Storage | null {
  const target = source ?? (typeof window === "undefined" ? null : window)
  if (target === null) return null
  try {
    return target.sessionStorage
  } catch {
    return null
  }
}
