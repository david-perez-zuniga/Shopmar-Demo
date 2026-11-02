// Caché de datos en memoria de la pestaña. Política pura arriba, almacén abajo.
// No hay `setTimeout` ni estado fuera de este módulo: el almacén es por pestaña
// y muere al recargar.

export type CachePolicy = "swr" | "fresh"

export type CacheEntry<T = unknown> = {
  data: T
  // El `X-ShopMar-Cached-At` (o `Last-Modified`) con el que se sirvió el dato,
  // o `null` si la respuesta llegó fresca. Es lo que se publica en
  // `shopmar:stale-data` cuando el dato sale de esta caché.
  at: string | null
  // Marca local del momento en que se guardó, para medir la edad contra el
  // umbral de revalidación. `at` es del servidor y no sirve para calcular edad.
  storedAt: number
}

// A partir de este umbral, una entrada de `swr` se sirve igual pero se revalida
// en segundo plano. Cubre de sobra la vuelta listado → detalle → listado, que es
// lo que esta caché existe para ahorrar, y no deja un listado viejo demasiado
// tiempo mientras la pestaña siga abierta (el aviso de datos viejos lo cubre).
export const REVALIDATE_AFTER_MS = 30_000

const entries = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()
// Cada invalidación (escritura exitosa o `clearCache` de prueba) avanza la
// generación. Un pedido que salió a la red con una generación vieja no puede
// repoblar la caché cuando resuelve.
let generation = 0

export function currentGeneration(): number {
  return generation
}

export function isCacheable(method: string): boolean {
  return method.toUpperCase() === "GET"
}

export function cacheKeyFor(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`
}

// Frontera inclusiva: a los `thresholdMs` exactos ya hay que revalidar.
export function shouldRevalidate(ageMs: number, thresholdMs: number): boolean {
  return ageMs >= thresholdMs
}

export function readEntry<T>(key: string): CacheEntry<T> | undefined {
  return entries.get(key) as CacheEntry<T> | undefined
}

export function writeEntry<T>(key: string, entry: CacheEntry<T>): void {
  entries.set(key, entry as CacheEntry)
}

export function inflightRequest<T>(key: string): Promise<T> | undefined {
  return inflight.get(key) as Promise<T> | undefined
}

export function trackInflight<T>(key: string, promise: Promise<T>): void {
  inflight.set(key, promise)
}

export function clearInflight(key: string): void {
  inflight.delete(key)
}

export function clearCache(): void {
  generation += 1
  entries.clear()
  inflight.clear()
}
