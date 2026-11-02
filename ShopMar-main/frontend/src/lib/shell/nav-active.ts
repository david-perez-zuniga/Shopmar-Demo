const NAV_SECTIONS = ["summary", "sales", "customers", "packages", "expenses"] as const

export type NavSection = (typeof NAV_SECTIONS)[number]

const SECTION_HREF: Record<NavSection, string> = {
  summary: "/",
  sales: "/sales",
  // Clientes es una sección propia: la pantalla de ventas no la contiene y el
  // enlace se marca solo cuando la ruta empieza por `/customers` (D-022).
  customers: "/customers",
  packages: "/packages",
  expenses: "/expenses",
}

const LINK_SETS = [
  { className: "sidebar-link", activeClass: "sidebar-link--active" },
  { className: "topbar-link", activeClass: "topbar-link--active" },
  { className: "nav-drawer-link", activeClass: "nav-drawer-link--active" },
  { className: "bottom-nav-link", activeClass: "bottom-nav-link--active" },
] as const

/** La sección del armazón a la que pertenece una ruta, por su primer segmento. */
export function activeSectionFor(pathname: string): NavSection | null {
  const first = pathname.split(/[?#]/)[0].split("/").filter(Boolean)[0]
  if (first === undefined) return "summary"
  return (NAV_SECTIONS as readonly string[]).includes(first) ? (first as NavSection) : null
}

/**
 * Los destinos de la barra inferior de móvil (S17): los cuatro de siempre,
 * sin Clientes. La dueña pidió que Clientes quede sólo en la navegación
 * lateral, así que la barra filtra el arreglo compartido en vez de mantener
 * una segunda lista que se desincronice de la lateral.
 */
const BOTTOM_NAV_HIDDEN: readonly string[] = ["customers"]

export interface INavLinkLike {
  id: string
}

/** Devuelve los enlaces que sí van en la barra inferior. No muta la entrada. */
export function bottomNavLinks<T extends INavLinkLike>(links: readonly T[]): T[] {
  return links.filter((link) => !BOTTOM_NAV_HIDDEN.includes(link.id))
}

/**
 * Marca el enlace activo en los cuatro juegos del armazón (barra lateral, barra
 * superior, cajón y barra inferior de móvil) y desmarca el resto. Desmarcar
 * quita `aria-current`, no lo deja vacío. Un solo juego de reglas para todo el
 * armazón: agregar la barra inferior no duplica la lógica de activo.
 */
export function markActiveNav(section: NavSection | null, root: ParentNode = document): void {
  const activeHref = section === null ? null : SECTION_HREF[section]
  for (const set of LINK_SETS) {
    for (const link of root.querySelectorAll<HTMLAnchorElement>(`.${set.className}`)) {
      const isActive = activeHref !== null && link.getAttribute("href") === activeHref
      link.classList.toggle(set.activeClass, isActive)
      if (isActive) link.setAttribute("aria-current", "page")
      else link.removeAttribute("aria-current")
    }
  }
}
