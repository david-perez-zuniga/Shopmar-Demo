/**
 * Dónde vive la API, decidido **en el navegador** (S1), no sólo en el build.
 *
 * `PUBLIC_API_URL` se hornea en el bundle durante `astro build` (`api.ts` la lee
 * de `import.meta.env`), así que cambiar la variable en el panel de Vercel no
 * cambia nada hasta el siguiente deploy. Cuando esa variable queda con la URL
 * absoluta del backend y el panel se sirve por HTTPS, la cookie `HttpOnly`
 * `SameSite=None` de la sesión viaja como cookie de **terceros**: Safari la
 * bloquea siempre y Chrome cuando tiene el bloqueo activo. El síntoma es «me
 * loguea y me saca» — el login responde 200 y el primer `GET /auth/me` vuelve
 * 401, así que `expireSession` devuelve a `/login`.
 *
 * La defensa es no confiar en el valor horneado: si es una URL absoluta de
 * **otro origen** y la página se sirve por HTTPS, se reescribe a su propio
 * camino relativo (`/api/v1`), que el `rewrite` de `vercel.json` manda a la API
 * como mismo origen. La cookie pasa a ser de primera parte y el problema
 * desaparece sin depender de una variable de entorno.
 *
 * Lo que **no** se toca: el desarrollo (`http://localhost:4321` →
 * `http://localhost:3000`), donde la URL absoluta es la única válida y no hay
 * HTTPS; ni una base que ya es relativa; ni una absoluta del mismo origen, que
 * ya es de primera parte.
 */

/** El camino que usa el panel cuando no hay una base configurada utilizable. */
export const DEFAULT_API_BASE = "/api/v1"

/** Lo mínimo que hace falta del `location` de la página. Se inyecta en pruebas. */
export interface IPageOrigin {
  origin: string
  protocol: string
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
// Un origen de mentira para parsear una URL protocolo-relativa (`//host/path`),
// que el navegador resolvería contra el esquema de la página.
const PLACEHOLDER_ORIGIN = "https://panel.invalid"

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.replace(/\/+$/, "") : value
}

function isAbsolute(value: string): boolean {
  return HAS_SCHEME.test(value) || value.startsWith("//")
}

function parseAbsolute(value: string): URL | null {
  try {
    // `URL` resuelve solo una URL protocolo-relativa si se le da una base.
    return new URL(value, PLACEHOLDER_ORIGIN)
  } catch {
    return null
  }
}

/**
 * La base de la API que va a usar el panel.
 *
 * `configured` es lo que trajo `PUBLIC_API_URL` (puede faltar); `page` es el
 * origen de la página, o `null` cuando no hay navegador —SSR, build, pruebas de
 * módulo— y ahí no hay cookie de terceros que evitar.
 */
export function resolveApiBase(
  configured: string | undefined | null,
  page: IPageOrigin | null,
): string {
  const raw = (configured ?? "").trim()
  // Sin valor, el camino relativo es mejor que `${undefined}/auth/me`.
  if (raw === "") return DEFAULT_API_BASE

  // Relativa: el panel llama a su propio origen. Es la forma correcta en
  // producción y no hay nada que corregir.
  if (!isAbsolute(raw)) {
    return stripTrailingSlash(raw.startsWith("/") ? raw : `/${raw}`)
  }

  const url = parseAbsolute(raw)
  // Sin navegador, o sin una URL parseable, se respeta lo configurado: acá no se
  // adivina, y romper el arranque sería peor que una base imperfecta.
  if (url === null || page === null) return stripTrailingSlash(raw)

  const sameOrigin = url.origin === page.origin
  // Fuera de HTTPS el navegador no bloquea la cookie de terceros y la URL
  // absoluta es legítima (el panel de desarrollo no tiene proxy).
  if (sameOrigin || page.protocol !== "https:") return stripTrailingSlash(raw)

  // Página HTTPS con la API en otro origen: la cookie de sesión sería de
  // terceros. Se conserva el camino configurado y se ancla a este origen.
  return stripTrailingSlash(url.pathname)
}
