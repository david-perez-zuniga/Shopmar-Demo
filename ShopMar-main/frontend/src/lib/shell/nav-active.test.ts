import { afterEach, describe, expect, it } from "vitest"
import { activeSectionFor, bottomNavLinks, markActiveNav } from "./nav-active"

const LINK_SETS = ["sidebar", "topbar", "nav-drawer", "bottom-nav"] as const

function shell(): void {
  document.body.innerHTML = `
    <aside class="shell-sidebar">
      <a class="sidebar-link" href="/">Resumen</a>
      <a class="sidebar-link sidebar-link--active" href="/sales" aria-current="page">Ventas</a>
      <a class="sidebar-link" href="/packages">Paquetes</a>
      <a class="sidebar-link" href="/expenses">Gastos</a>
    </aside>
    <header class="topbar">
      <a class="topbar-link" href="/">Resumen</a>
      <a class="topbar-link topbar-link--active" href="/sales" aria-current="page">Ventas</a>
      <a class="topbar-link" href="/packages">Paquetes</a>
      <a class="topbar-link" href="/expenses">Gastos</a>
    </header>
    <nav class="nav-drawer">
      <a class="nav-drawer-link" href="/">Resumen</a>
      <a class="nav-drawer-link nav-drawer-link--active" href="/sales" aria-current="page">Ventas</a>
      <a class="nav-drawer-link" href="/packages">Paquetes</a>
      <a class="nav-drawer-link" href="/expenses">Gastos</a>
    </nav>
    <nav class="bottom-nav">
      <a class="bottom-nav-link" href="/">Resumen</a>
      <a class="bottom-nav-link bottom-nav-link--active" href="/sales" aria-current="page">Ventas</a>
      <a class="bottom-nav-link" href="/packages">Paquetes</a>
      <a class="bottom-nav-link" href="/expenses">Gastos</a>
    </nav>
  `
}

function activeLinks(set: (typeof LINK_SETS)[number]): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>(`.${set}-link--active`))
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("activeSectionFor", () => {
  it.each([
    ["/", "summary"],
    ["/summary", "summary"],
    ["/sales", "sales"],
    ["/sales/new", "sales"],
    ["/sales/detail", "sales"],
    ["/sales/3f9c2b1a-0000-0000-0000-000000000000", "sales"],
    ["/customers", "customers"],
    ["/customers/new", "customers"],
    ["/packages", "packages"],
    ["/packages/new", "packages"],
    ["/expenses", "expenses"],
    ["/expenses/new", "expenses"],
  ] as const)("mapea %s a la sección %s", (pathname, expected) => {
    expect(activeSectionFor(pathname)).toBe(expected)
  })

  it("devuelve null para una ruta que no es del armazón", () => {
    expect(activeSectionFor("/404")).toBeNull()
  })
})

describe("bottomNavLinks", () => {
  // El mismo arreglo `links` de `Nav.astro` alimenta las cuatro superficies: la
  // barra inferior lo filtra (S17) en vez de tener una lista propia que se
  // desincronice de la lateral.
  const links = [
    { id: "summary", label: "Resumen", href: "/" },
    { id: "sales", label: "Ventas", href: "/sales" },
    { id: "customers", label: "Clientes", href: "/customers" },
    { id: "packages", label: "Paquetes", href: "/packages" },
    { id: "expenses", label: "Gastos", href: "/expenses" },
  ] as const

  it("deja en la barra inferior los cuatro destinos, sin Clientes", () => {
    expect(bottomNavLinks(links).map((link) => link.id)).toEqual([
      "summary",
      "sales",
      "packages",
      "expenses",
    ])
  })

  it("no toca el arreglo que siguen usando la barra lateral, la superior y el cajón", () => {
    const filtered = bottomNavLinks(links)

    expect(filtered).toHaveLength(4)
    expect(links).toHaveLength(5)
    expect(links.map((link) => link.id)).toContain("customers")
  })

  it("conserva el orden y los campos de cada enlace que sobrevive", () => {
    expect(bottomNavLinks(links)[1]).toEqual(links[1])
    expect(bottomNavLinks(links).map((link) => link.href)).toEqual(["/", "/sales", "/packages", "/expenses"])
  })
})

describe("markActiveNav", () => {
  it("mueve el activo de los cuatro juegos de enlaces y limpia el anterior", () => {
    shell()
    markActiveNav("packages")

    for (const set of LINK_SETS) {
      const active = activeLinks(set)
      expect(active.map((link) => link.getAttribute("href"))).toEqual(["/packages"])
      expect(active[0]?.getAttribute("aria-current")).toBe("page")

      const previous = document.querySelector<HTMLAnchorElement>(`.${set}-link[href="/sales"]`)
      expect(previous?.classList.contains(`${set}-link--active`)).toBe(false)
      expect(previous?.hasAttribute("aria-current")).toBe(false)
    }
  })

  it("sin sección desmarca los cuatro juegos y quita aria-current", () => {
    shell()
    markActiveNav(null)

    for (const set of LINK_SETS) {
      expect(activeLinks(set)).toHaveLength(0)
      for (const link of document.querySelectorAll<HTMLAnchorElement>(`.${set}-link[href="/sales"]`)) {
        expect(link.hasAttribute("aria-current")).toBe(false)
      }
    }
  })
})
