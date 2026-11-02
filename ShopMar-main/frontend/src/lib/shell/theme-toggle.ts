const STORAGE_KEY = "shopmar:theme"

type Theme = "dark" | "light"

const THEME_COLOR: Record<Theme, string> = {
  light: "#f8f9ff",
  dark: "#0b121a",
}

function readTheme(html: HTMLElement): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "dark" || stored === "light") return stored
  } catch (e) {}
  const attr = html.getAttribute("data-theme")
  if (attr === "dark" || attr === "light") return attr
  try {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark"
  } catch (e) {}
  return "light"
}

export function initThemeToggle(root: ParentNode = document): (() => void) | null {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]"))
  if (buttons.length === 0) return null

  const doc = root.ownerDocument ?? document
  const html = doc.documentElement

  function apply(theme: Theme): void {
    html.setAttribute("data-theme", theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch (e) {}
    const meta = doc.querySelector('meta[name="theme-color"]')
    if (meta !== null) meta.setAttribute("content", THEME_COLOR[theme])
    const pressed = theme === "dark" ? "true" : "false"
    for (const button of buttons) button.setAttribute("aria-pressed", pressed)
  }

  const onClick = () => apply(readTheme(html) === "dark" ? "light" : "dark")

  for (const button of buttons) button.addEventListener("click", onClick)

  apply(readTheme(html))

  return function dispose(): void {
    for (const button of buttons) button.removeEventListener("click", onClick)
  }
}
