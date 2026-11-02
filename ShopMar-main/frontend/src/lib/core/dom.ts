export const qs = <T extends Element>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T

export const on = (el: Element, ev: string, fn: (e: Event) => void) =>
  el.addEventListener(ev, fn)

export const setText = (el: Element, text: string) => {
  el.textContent = text
}

export const clear = (el: Element) => {
  el.replaceChildren()
}