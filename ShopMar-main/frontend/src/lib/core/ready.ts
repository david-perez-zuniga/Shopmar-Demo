/**
 * Un único punto de arranque para el armazón (S1).
 *
 * El armazón se cablea una sola vez, cuando el documento está listo: cajón,
 * tema, aviso de versión. En la SPA el documento **no se reemplaza nunca** —las
 * vistas se montan y desmontan dentro—, así que no hay un evento por navegación
 * del que colgar el cableado: hay uno por carga, y es este.
 */
export function onReady(run: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true })
    return
  }
  run()
}
