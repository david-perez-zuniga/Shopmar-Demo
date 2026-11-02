/**
 * La purga local por generación (S1): la forma de invalidar la caché del
 * navegador **de una vez** y sin perder lo que no depende de la sesión.
 *
 * El problema que resuelve: la copia del `me` que guarda el guard (`S3`: el panel
 * abre sin esperar la red) sobrevive a todo, así que un despliegue que cambia la
 * regla de sesión no se nota hasta que la persona cierra sesión a mano. Subir
 * `STORAGE_GENERATION` borra esa copia en la próxima carga y el guard vuelve a
 * preguntar `GET /auth/me`, donde el servidor decide: si la cookie ya no vale,
 * `expireSession` devuelve a `/login`.
 *
 * Lo que **no** borra, a propósito:
 * - el tema (`shopmar:theme`) y los borradores de venta (`shopmar:sale-draft:*`):
 *   invalidar una caché no puede costarle a alguien una venta que estaba cargando
 *   ni devolverle el panel en blanco;
 * - el `sessionStorage`, que sólo guarda el recuerdo de la consulta de cada
 *   pantalla (S58): muere con la pestaña y no tiene nada que ver con la sesión.
 *
 * La generación se anota **después** de limpiar y en `localStorage` a propósito:
 * así la limpieza ocurre una sola vez por dispositivo y el arranque vuelve a ser
 * instantáneo desde la copia nueva. Si `localStorage` no se puede tocar no hay
 * marcador, y sin marcador no se limpia a ciegas en cada carga.
 */

/** La clave que recuerda qué generación ya se limpió en este dispositivo. */
export const STORAGE_GENERATION_KEY = "shopmar:storage:gen"

/**
 * La generación vigente. **Subirla es el botón de invalidar**: cada incremento
 * purga una vez la copia del `me` en todos los navegadores que abran el panel
 * después del despliegue.
 *
 * Un dispositivo sin marcador está por debajo de cualquier valor y se limpia en
 * la primera carga con esta versión.
 */
export const STORAGE_GENERATION = 2

/**
 * Los prefijos que dependen de la sesión. Van con el separador incluido para no
 * llevarse vecinos por delante: `shopmar:me:` no matchea `shopmar:meh`.
 */
const PURGED_PREFIXES: readonly string[] = ["shopmar:me:"]

function purge(storage: Storage, prefixes: readonly string[]): void {
  // Se juntan primero: `removeItem` corre los índices y un bucle que borra
  // mientras recorre saltearía claves.
  const doomed: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key === null) continue
    if (prefixes.some((prefix) => key.startsWith(prefix))) doomed.push(key)
  }
  for (const key of doomed) storage.removeItem(key)
}

/**
 * Limpia lo que depende de la sesión si este dispositivo todavía no pasó por la
 * generación vigente. Devuelve si limpió.
 *
 * Es idempotente: la segunda llamada con la misma generación no toca nada. Se
 * llama en cada arranque, antes de que el guard lea la copia del `me`.
 */
export function resetLocalStateIfStale(
  storage: Storage | null,
  generation: number = STORAGE_GENERATION,
): boolean {
  if (storage === null) return false

  try {
    if (storage.getItem(STORAGE_GENERATION_KEY) === String(generation)) return false
    purge(storage, PURGED_PREFIXES)
    storage.setItem(STORAGE_GENERATION_KEY, String(generation))
    return true
  } catch {
    // Almacenamiento bloqueado (modo privado, cuota llena): el panel funciona
    // igual sin persistencia, así que un fallo acá no puede romper el arranque.
    return false
  }
}
