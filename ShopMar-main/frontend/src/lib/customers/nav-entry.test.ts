/**
 * Guarda el cambio de navegación de la pantalla de clientes.
 *
 * La prueba vive acá —y no junto a `nav-active`— porque `src/lib/customers/` es
 * la superficie autorizada de esta tarea. Lee el marcado de los dos componentes,
 * igual que `nav-wiring.test.ts`: los destinos son datos del `.astro`, no de un
 * módulo ejecutable.
 *
 * Lo que protege: que Clientes se sume **sin reordenar ni renombrar** los
 * destinos que ya existían, que la barra inferior siga recibiendo el mismo
 * arreglo con el botón de acción fuera de los destinos, y la regla de S17: la
 * barra inferior ofrece cuatro destinos —Clientes queda sólo en la lateral, la
 * superior y el cajón—, así que su rejilla vuelve a cinco columnas.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const nav = readFileSync(resolve("src/components/Nav.astro"), "utf8")
const bottom = readFileSync(resolve("src/components/BottomNav.astro"), "utf8")

interface ILinkEntry {
  id: string
  label: string
  href: string
}

function links(): ILinkEntry[] {
  return Array.from(
    nav.matchAll(/\{ id: "([a-z]+)", label: "([^"]+)", href: "([^"]+)", icon: \w+ \}/g),
    (match) => ({ id: match[1], label: match[2], href: match[3] }),
  )
}

describe("Clientes en el armazón", () => {
  it("inserta Clientes entre Ventas y Paquetes sin tocar los destinos existentes", () => {
    expect(links()).toEqual([
      { id: "summary", label: "Resumen", href: "/" },
      { id: "sales", label: "Ventas", href: "/sales" },
      { id: "customers", label: "Clientes", href: "/customers" },
      { id: "packages", label: "Paquetes", href: "/packages" },
      { id: "expenses", label: "Gastos", href: "/expenses" },
    ])
  })

  it("la barra inferior sigue recibiendo el mismo arreglo de enlaces", () => {
    expect(nav).toMatch(/<BottomNav\s+links=\{links\}\s+activeSection=\{activeSection\}\s*\/>/)
    expect(bottom).toMatch(/links\.map\(/)
    // El arreglo compartido no se toca: el filtro de S17 devuelve otra lista.
    expect(bottom).toMatch(/bottomNavLinks\(allLinks\)/)
    expect(nav).toMatch(/links\.map\(/)
  })

  it("la barra inferior deja a Clientes fuera y conserva los otros cuatro destinos", () => {
    // La regla vive en `bottomNavLinks` y se prueba en `nav-active.test.ts`;
    // acá se pina que la barra la use en vez de tener su propia lista.
    expect(bottom).not.toMatch(/label: "Clientes"/)
    expect(bottom).not.toMatch(/href: "\/customers"/)
    expect(nav).toMatch(/label: "Clientes"/)
  })

  it("el botón de acción no es un quinto destino de la barra inferior", () => {
    expect(bottom).toContain('href="/new"')
    expect(bottom).toMatch(/grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/)
    expect(bottom).not.toMatch(/className: "bottom-nav-action bottom-nav-link"/)
  })
})
