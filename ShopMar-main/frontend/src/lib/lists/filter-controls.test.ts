import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearFilterHref,
  filterHref,
  filtersToggleKey,
  hydrateDatePresets,
  hydrateFilterControls,
  readFilterQuery,
  rehydrateOnPageshow,
  setControlValue,
  wireDatePresets,
  wireFilterSubmit,
  wireAutoFilter,
  wireFiltersToggle,
} from "./filter-controls"

/** 11/10/2026 al mediodía, hora local: la fecha de referencia de los presets. */
const HOY = new Date(2026, 9, 11, 12, 0)

function buildForm(html: string): HTMLFormElement {
  const form = document.createElement("form")
  form.innerHTML = html
  document.body.append(form)
  return form
}

describe("hydrateFilterControls", () => {
  it("escribe el valor de cada control por name", () => {
    const form = buildForm(`
      <input name="start_date" type="date" />
      <input name="end_date" type="date" />
      <select name="type">
        <option value="">Todos los canales</option>
        <option value="live">Live</option>
        <option value="whatsapp">Tienda</option>
      </select>
    `)

    hydrateFilterControls(form, {
      start_date: "2026-10-12",
      end_date: "2026-10-12",
      type: "live",
    })

    expect(form.elements.namedItem("start_date")).toHaveProperty("value", "2026-10-12")
    expect(form.elements.namedItem("end_date")).toHaveProperty("value", "2026-10-12")
    expect(form.elements.namedItem("type")).toHaveProperty("value", "live")
  })

  it("vacía el control cuando el filtro no está activo", () => {
    const form = buildForm(`<input name="start_date" type="date" value="2026-01-01" />`)

    hydrateFilterControls(form, { start_date: "" })

    expect(form.elements.namedItem("start_date")).toHaveProperty("value", "")
  })

  it("ignora los nombres que no existen en el form", () => {
    const form = buildForm(`<input name="type" value="live" />`)

    hydrateFilterControls(form, { type: "whatsapp", per_page: "20" })

    expect(form.elements.namedItem("type")).toHaveProperty("value", "whatsapp")
    expect(form.elements.namedItem("per_page")).toBeNull()
  })

  it("no toca los controles que no son input ni select", () => {
    const form = buildForm(`
      <input name="start_date" type="date" />
      <button type="submit" name="accion"></button>
    `)

    expect(() =>
      hydrateFilterControls(form, { start_date: "2026-10-12", accion: "filtrar" }),
    ).not.toThrow()
    expect(form.elements.namedItem("start_date")).toHaveProperty("value", "2026-10-12")
  })

  it("tolera un form ausente", () => {
    expect(() => hydrateFilterControls(null, { start_date: "2026-10-12" })).not.toThrow()
  })
})

describe("setControlValue", () => {
  it("escribe un select que vive fuera del form de filtros", () => {
    const select = document.createElement("select")
    select.innerHTML = `<option value="10">10</option><option value="20">20</option>`
    document.body.append(select)

    setControlValue(select, "20")

    expect(select.value).toBe("20")
  })

  it("tolera un control ausente", () => {
    expect(() => setControlValue(null, "20")).not.toThrow()
  })
})

describe("readFilterQuery", () => {
  it("omite los campos vacíos", () => {
    const form = buildForm(`
      <input name="start_date" type="date" value="" />
      <input name="end_date" type="date" value="2026-10-12" />
      <select name="status">
        <option value="">Todos</option>
        <option value="completed" selected>Completada</option>
      </select>
    `)

    expect(readFilterQuery(form)).toBe("end_date=2026-10-12&status=completed")
  })

  it("devuelve una cadena vacía cuando no hay ningún filtro", () => {
    const form = buildForm(`<input name="start_date" type="date" value="" />`)

    expect(readFilterQuery(form)).toBe("")
  })

  it("agrega los extras que no viven en el form", () => {
    const form = buildForm(`<input name="type" value="live" />`)

    expect(readFilterQuery(form, { per_page: "20" })).toBe("type=live&per_page=20")
  })

  it("omite los extras vacíos", () => {
    const form = buildForm(`<input name="type" value="live" />`)

    expect(readFilterQuery(form, { per_page: "" })).toBe("type=live")
  })

  it("deja que el extra gane si colisiona con un campo del form", () => {
    const form = buildForm(`<input name="per_page" value="10" />`)

    expect(readFilterQuery(form, { per_page: "20" })).toBe("per_page=20")
  })

  it("no incluye botones ni campos sin name", () => {
    const form = buildForm(`
      <input value="sin-name" />
      <button type="submit" name="accion" value="filtrar"></button>
      <input name="type" value="live" />
    `)

    expect(readFilterQuery(form)).toBe("type=live")
  })

  it("omite los controles marcados para quedarse fuera de la query", () => {
    const form = buildForm(`
      <input type="radio" name="preset" value="today" data-query-ignore checked />
      <input name="start_date" type="date" value="2026-10-11" />
    `)

    expect(readFilterQuery(form)).toBe("start_date=2026-10-11")
  })
})

describe("filterHref", () => {
  it("devuelve el path pelado cuando la query queda vacía", () => {
    expect(filterHref("/sales", "")).toBe("/sales")
  })

  it("devuelve el path con la query cuando hay filtros", () => {
    expect(filterHref("/sales", "type=live")).toBe("/sales?type=live")
  })
})

describe("clearFilterHref", () => {
  it("limpia la ruta y no conserva nada: no hay tamaño de página que guardar (S41)", () => {
    expect(clearFilterHref("/sales")).toBe("/sales")
    expect(clearFilterHref("/packages")).toBe("/packages")
  })
})

describe("rehydrateOnPageshow", () => {
  it("hidrata una vez de entrada", () => {
    const hydrate = vi.fn()

    rehydrateOnPageshow(hydrate)

    expect(hydrate).toHaveBeenCalledTimes(1)
  })

  it("vuelve a hidratar después de pageshow", () => {
    const hydrate = vi.fn()
    rehydrateOnPageshow(hydrate)

    window.dispatchEvent(new Event("pageshow"))

    expect(hydrate).toHaveBeenCalledTimes(2)
  })

  it("hidrata una sola vez por pageshow", () => {
    const hydrate = vi.fn()
    rehydrateOnPageshow(hydrate)

    window.dispatchEvent(new Event("pageshow"))
    window.dispatchEvent(new Event("pageshow"))

    expect(hydrate).toHaveBeenCalledTimes(3)
  })
})

/**
 * El marcado mínimo del control de fechas: las tres opciones, los dos campos y
 * un filtro vecino (`type`) que sirve de testigo de que el envío los conserva.
 * `fields` reproduce el control incrustado dentro del `filter-row` de una tabla.
 */
function buildDateControl(variant: "form" | "fields"): {
  form: HTMLFormElement
  root: HTMLElement
} {
  const form = buildForm(`
    <div data-date-filter>
      <select name="preset" data-preset data-query-ignore>
        <option value="today">Hoy</option>
        <option value="last7">Últimos 7 días</option>
        <option value="custom">Personalizado</option>
      </select>
      <div data-date-fields>
        <input name="start_date" type="date" />
        <input name="end_date" type="date" />
      </div>
    </div>
    <select name="type">
      <option value="">Todos los canales</option>
      <option value="live" selected>Live</option>
    </select>
  `)

  const root = form.querySelector<HTMLElement>("[data-date-filter]")
  if (root === null) throw new Error("el fixture no tiene el control de fechas")

  return { form, root: variant === "form" ? form : root }
}

/** Marca una opción como lo hace el navegador y dispara su `change`. */
function choosePreset(root: HTMLElement, value: string): void {
  const select = root.querySelector<HTMLSelectElement>("select[data-preset]")
  if (select === null) throw new Error("el fixture no tiene el select de período")
  select.value = value
  select.dispatchEvent(new Event("change"))
}

function checkedPreset(root: HTMLElement): string {
  return root.querySelector<HTMLSelectElement>("select[data-preset]")?.value ?? ""
}

function fieldsHidden(root: HTMLElement): boolean {
  const fields = root.querySelector<HTMLElement>("[data-date-fields]")
  // `HTMLElement.hidden` tipa `boolean | "until-found"` en el DOM moderno; acá
  // el control usa el booleano, así que se compara explícito.
  return fields !== null && fields.hidden === true
}

function dateValue(form: HTMLFormElement, name: string): string {
  const input = form.elements.namedItem(name)
  return input instanceof HTMLInputElement ? input.value : ""
}

describe("hydrateDatePresets", () => {
  it("marca «Hoy» y esconde las fechas cuando el rango es el de hoy", () => {
    const { root } = buildDateControl("fields")

    hydrateDatePresets(root, { start_date: "2026-10-11", end_date: "2026-10-11" }, HOY)

    expect(checkedPreset(root)).toBe("today")
    expect(fieldsHidden(root)).toBe(true)
  })

  it("marca «Últimos 7 días» cuando la URL trae esa ventana", () => {
    const { root } = buildDateControl("fields")

    hydrateDatePresets(root, { start_date: "2026-10-05", end_date: "2026-10-11" }, HOY)

    expect(checkedPreset(root)).toBe("last7")
    expect(fieldsHidden(root)).toBe(true)
  })

  it("sin rango queda en «Hoy» con las fechas de hoy cargadas (S36)", () => {
    const { form, root } = buildDateControl("form")

    hydrateDatePresets(root, { start_date: "", end_date: "" }, HOY)

    expect(checkedPreset(root)).toBe("today")
    expect(fieldsHidden(root)).toBe(true)
    // «Personalizado» las muestra ya completas, así el envío nunca queda sin fechas.
    expect(dateValue(form, "start_date")).toBe("2026-10-11")
    expect(dateValue(form, "end_date")).toBe("2026-10-11")
  })

  it("un rango propio mantiene los campos visibles para poder corregirlos", () => {
    const { root } = buildDateControl("form")

    hydrateDatePresets(root, { start_date: "2026-10-01", end_date: "2026-10-09" }, HOY)

    expect(checkedPreset(root)).toBe("custom")
    expect(fieldsHidden(root)).toBe(false)
  })

  it("tolera una raíz ausente", () => {
    expect(() =>
      hydrateDatePresets(null, { start_date: "2026-10-11", end_date: "2026-10-11" }, HOY),
    ).not.toThrow()
  })
})

describe("wireDatePresets", () => {
  function wire(root: HTMLElement): { form: HTMLFormElement; submits: () => number } {
    const form = (root instanceof HTMLFormElement ? root : root.closest("form"))
    if (form === null) throw new Error("el fixture no está dentro de un form")
    let count = 0
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      count += 1
    })
    wireDatePresets(root, HOY)
    return { form, submits: () => count }
  }

  it("«Hoy» escribe las dos fechas y envía el form", () => {
    const { root } = buildDateControl("form")
    const { form, submits } = wire(root)

    choosePreset(root, "today")

    expect(dateValue(form, "start_date")).toBe("2026-10-11")
    expect(dateValue(form, "end_date")).toBe("2026-10-11")
    expect(fieldsHidden(root)).toBe(true)
    expect(submits()).toBe(1)
  })

  it("conserva los demás filtros de la fila al enviar", () => {
    const { root } = buildDateControl("fields")
    const { form, submits } = wire(root)

    choosePreset(root, "today")

    expect(submits()).toBe(1)
    expect(readFilterQuery(form)).toBe("start_date=2026-10-11&end_date=2026-10-11&type=live")
  })

  it("«Últimos 7 días» escribe la ventana completa y envía", () => {
    const { root } = buildDateControl("fields")
    const { form, submits } = wire(root)

    choosePreset(root, "last7")

    expect(dateValue(form, "start_date")).toBe("2026-10-05")
    expect(dateValue(form, "end_date")).toBe("2026-10-11")
    expect(fieldsHidden(root)).toBe(true)
    expect(submits()).toBe(1)
  })

  it("«Personalizado» destapa las fechas, enfoca «Desde» y no envía", () => {
    const { root } = buildDateControl("fields")
    const { form, submits } = wire(root)

    choosePreset(root, "custom")

    const start = form.elements.namedItem("start_date")
    expect(fieldsHidden(root)).toBe(false)
    expect(document.activeElement).toBe(start)
    expect(submits()).toBe(0)
  })

  it("envía el form que contiene al control incrustado en la fila", () => {
    const { root } = buildDateControl("fields")
    const { submits } = wire(root)

    choosePreset(root, "last7")

    expect(submits()).toBe(1)
  })

  it("tolera una raíz ausente", () => {
    expect(() => wireDatePresets(null, HOY)).not.toThrow()
  })
})

describe("wireAutoFilter", () => {
  function wireAuto(form: HTMLFormElement): () => number {
    let count = 0
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      count += 1
    })
    wireAutoFilter(form)
    return () => count
  }

  it("filtra al cambiar un control, sin botón de envío", () => {
    const { form } = buildDateControl("fields")
    const submits = wireAuto(form)

    const select = form.querySelector<HTMLSelectElement>("select[name='type']")
    if (select === null) throw new Error("el fixture no tiene el select de canal")
    select.value = "live"
    select.dispatchEvent(new Event("change", { bubbles: true }))

    expect(submits()).toBe(1)
  })

  it("el preset queda afuera: lo maneja wireDatePresets", () => {
    const { form, root } = buildDateControl("fields")
    const submits = wireAuto(form)

    choosePreset(root, "today")

    expect(submits()).toBe(0)
  })

  it("«Personalizado» tampoco envía mientras no se escriban las fechas", () => {
    const { form, root } = buildDateControl("fields")
    const submits = wireAuto(form)

    choosePreset(root, "custom")

    expect(submits()).toBe(0)
  })

  it("tolera un formulario ausente", () => {
    expect(() => wireAutoFilter(null)).not.toThrow()
  })
})

describe("wireFilterSubmit", () => {
  it("navega con los filtros del form, sin per_page (S41)", () => {
    const form = buildForm(`
      <input name="start_date" type="date" value="2026-10-01" />
      <input name="type" value="live" />
    `)
    const seen: string[] = []

    wireFilterSubmit({ form, path: "/sales", navigate: (url) => seen.push(url) })
    form.dispatchEvent(new Event("submit", { cancelable: true }))

    expect(seen).toEqual(["/sales?start_date=2026-10-01&type=live"])
  })

  it("frena el submit nativo para no recargar el documento", () => {
    const form = buildForm(`<input name="type" value="live" />`)
    const event = new Event("submit", { cancelable: true })

    wireFilterSubmit({ form, path: "/expenses", navigate: () => undefined })
    form.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it("sin filtros navega a la ruta pelada", () => {
    const form = buildForm(`<input name="start_date" type="date" value="" />`)
    const seen: string[] = []

    wireFilterSubmit({ form, path: "/expenses", navigate: (url) => seen.push(url) })
    form.dispatchEvent(new Event("submit", { cancelable: true }))

    expect(seen).toEqual(["/expenses"])
  })

  it("tolera un form ausente", () => {
    expect(() =>
      wireFilterSubmit({ form: null, path: "/sales", navigate: () => undefined }),
    ).not.toThrow()
  })

  it("navega con el rango que escribió el preset y sin el preset en la URL", () => {
    const { form, root } = buildDateControl("form")
    const seen: string[] = []

    wireDatePresets(root, HOY)
    wireFilterSubmit({ form, path: "/sales", navigate: (url) => seen.push(url) })

    choosePreset(root, "today")

    expect(seen).toEqual(["/sales?start_date=2026-10-11&end_date=2026-10-11&type=live"])
  })
})

/**
 * El marcado mínimo de la barra colapsable (S40): la barra con el control de
 * fechas y el botón «Filtros», y debajo el panel con un filtro y «Limpiar».
 * Reproduce los ganchos que llevan las tres pantallas.
 */
function buildCollapsibleControls(): {
  form: HTMLFormElement
  toggle: HTMLButtonElement
  panel: HTMLElement
  count: HTMLElement
  countValue: HTMLElement
  clear: HTMLAnchorElement
} {
  const form = buildForm(`
    <div class="filter-toolbar">
      <div data-date-filter>
        <select name="preset" data-preset data-query-ignore>
          <option value="today">Hoy</option>
          <option value="last7">Últimos 7 días</option>
          <option value="custom">Personalizado</option>
        </select>
        <div data-date-fields hidden>
          <input name="start_date" type="date" />
          <input name="end_date" type="date" />
        </div>
      </div>
      <button type="button" data-filters-toggle aria-expanded="false" aria-controls="filters-panel">
        <span>Filtros</span>
        <span data-filters-count hidden><span data-filters-count-value>0</span></span>
      </button>
    </div>
    <div id="filters-panel" data-filters-panel hidden>
      <div class="filter-fields">
        <select name="type">
          <option value="">Todos los canales</option>
          <option value="live">Live</option>
          <option value="whatsapp">Tienda</option>
        </select>
        <input name="overdue" type="hidden" value="" />
      </div>
      <a href="/sales" data-filter-clear hidden>Limpiar</a>
    </div>
  `)

  const toggle = form.querySelector<HTMLButtonElement>("[data-filters-toggle]")
  const panel = form.querySelector<HTMLElement>("[data-filters-panel]")
  const count = form.querySelector<HTMLElement>("[data-filters-count]")
  const countValue = form.querySelector<HTMLElement>("[data-filters-count-value]")
  const clear = form.querySelector<HTMLAnchorElement>("[data-filter-clear]")
  if (toggle === null || panel === null || count === null || countValue === null || clear === null) {
    throw new Error("el fixture no tiene la barra colapsable completa")
  }
  return { form, toggle, panel, count, countValue, clear }
}

/** Escribe el rango que el control de fechas deja en los dos campos. */
function setRange(form: HTMLFormElement, start: string, end: string): void {
  setControlValue(form.elements.namedItem("start_date"), start)
  setControlValue(form.elements.namedItem("end_date"), end)
}

function chooseChannel(form: HTMLFormElement, value: string): void {
  const select = form.querySelector<HTMLSelectElement>("select[name='type']")
  if (select === null) throw new Error("el fixture no tiene el select de canal")
  select.value = value
}

/** Un `sessionStorage` que falla en cada acceso, como el de un modo privado. */
function brokenStorage(): Storage {
  const fail = (): never => {
    throw new Error("sessionStorage no disponible")
  }
  return {
    getItem: fail,
    setItem: fail,
    removeItem: fail,
    clear: fail,
    key: fail,
    get length(): number {
      return fail()
    },
  } as unknown as Storage
}

describe("filtersToggleKey", () => {
  it("nombra la entrada por ruta: cada pantalla recuerda la suya", () => {
    expect(filtersToggleKey("/sales")).not.toBe(filtersToggleKey("/expenses"))
    expect(filtersToggleKey("/packages")).not.toBe(filtersToggleKey("/sales"))
  })

  it("es estable para la misma ruta", () => {
    expect(filtersToggleKey("/sales")).toBe(filtersToggleKey("/sales"))
  })
})

describe("wireFiltersToggle", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    window.sessionStorage.clear()
  })

  it("arranca colapsado en una visita nueva y no escribe nada", () => {
    const { form, toggle, panel } = buildCollapsibleControls()

    wireFiltersToggle(form, { path: "/sales", today: HOY })

    expect(panel.hidden).toBe(true)
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(window.sessionStorage.getItem(filtersToggleKey("/sales"))).toBeNull()
  })

  it("apunta aria-controls al panel que gobierna", () => {
    const { form, toggle, panel } = buildCollapsibleControls()

    wireFiltersToggle(form, { path: "/sales", today: HOY })

    expect(toggle.getAttribute("aria-controls")).toBe(panel.id)
    expect(panel.id).not.toBe("")
  })

  it("abre el panel al tocar «Filtros» y lo deja recordado", () => {
    const { form, toggle, panel } = buildCollapsibleControls()
    wireFiltersToggle(form, { path: "/sales", today: HOY })

    toggle.click()

    expect(panel.hidden).toBe(false)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(window.sessionStorage.getItem(filtersToggleKey("/sales"))).toBe("1")
  })

  it("vuelve a cerrarlo y recuerda que está cerrado", () => {
    const { form, toggle, panel } = buildCollapsibleControls()
    wireFiltersToggle(form, { path: "/sales", today: HOY })

    toggle.click()
    toggle.click()

    expect(panel.hidden).toBe(true)
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(window.sessionStorage.getItem(filtersToggleKey("/sales"))).toBe("0")
  })

  it("restaura el panel abierto de la visita anterior", () => {
    window.sessionStorage.setItem(filtersToggleKey("/sales"), "1")
    const { form, toggle, panel } = buildCollapsibleControls()

    wireFiltersToggle(form, { path: "/sales", today: HOY })

    expect(panel.hidden).toBe(false)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
  })

  it("recuerda el estado por ruta: el de ventas no abre gastos", () => {
    window.sessionStorage.setItem(filtersToggleKey("/expenses"), "1")
    const { form, panel } = buildCollapsibleControls()

    wireFiltersToggle(form, { path: "/sales", today: HOY })

    expect(panel.hidden).toBe(true)
  })

  it("degrada a colapsado cuando el valor guardado no es un estado válido", () => {
    window.sessionStorage.setItem(filtersToggleKey("/sales"), "abierto")
    const { form, panel } = buildCollapsibleControls()

    wireFiltersToggle(form, { path: "/sales", today: HOY })

    expect(panel.hidden).toBe(true)
  })

  it("degrada a colapsado cuando el sessionStorage falla al leer", () => {
    const { form, panel } = buildCollapsibleControls()

    expect(() =>
      wireFiltersToggle(form, { path: "/sales", storage: brokenStorage(), today: HOY }),
    ).not.toThrow()
    expect(panel.hidden).toBe(true)
  })

  it("sigue abriendo y cerrando aunque no se pueda recordar el estado", () => {
    const { form, toggle, panel } = buildCollapsibleControls()
    wireFiltersToggle(form, { path: "/sales", storage: brokenStorage(), today: HOY })

    toggle.click()

    expect(panel.hidden).toBe(false)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
  })

  it("deja el foco en el botón después de abrir y de cerrar", () => {
    const { form, toggle } = buildCollapsibleControls()
    wireFiltersToggle(form, { path: "/sales", today: HOY })

    toggle.click()
    expect(document.activeElement).toBe(toggle)

    toggle.click()
    expect(document.activeElement).toBe(toggle)
  })

  it("esconde el contador cuando no hay ningún filtro activo", () => {
    const { form, count, countValue } = buildCollapsibleControls()
    setRange(form, "2026-10-11", "2026-10-11")

    wireFiltersToggle(form, { path: "/sales", today: HOY })

    expect(count.hidden).toBe(true)
    expect(countValue.textContent).toBe("0")
  })

  it("muestra el número de filtros activos", () => {
    const { form, count, countValue } = buildCollapsibleControls()
    setRange(form, "2026-10-11", "2026-10-11")
    chooseChannel(form, "live")

    wireFiltersToggle(form, { path: "/sales", today: HOY })

    expect(count.hidden).toBe(false)
    expect(countValue.textContent).toBe("1")
  })

  it("cuenta el rango cuando no es el de hoy", () => {
    const { form, countValue } = buildCollapsibleControls()
    setRange(form, "2026-10-01", "2026-10-11")

    wireFiltersToggle(form, { path: "/sales", today: HOY })

    expect(countValue.textContent).toBe("1")
  })

  it("recalcula el número en cada sincronización, como el resto de los controles", () => {
    const { form, count, countValue } = buildCollapsibleControls()
    setRange(form, "2026-10-11", "2026-10-11")
    const { sync } = wireFiltersToggle(form, { path: "/sales", today: HOY })

    chooseChannel(form, "whatsapp")
    sync()

    expect(count.hidden).toBe(false)
    expect(countValue.textContent).toBe("1")

    chooseChannel(form, "")
    sync()

    expect(count.hidden).toBe(true)
    expect(countValue.textContent).toBe("0")
  })

  it("el select de período no suma al contador", () => {
    const { form, countValue } = buildCollapsibleControls()
    setRange(form, "2026-10-11", "2026-10-11")
    const { sync } = wireFiltersToggle(form, { path: "/sales", today: HOY })

    setControlValue(form.elements.namedItem("preset"), "custom")
    sync()

    expect(countValue.textContent).toBe("0")
  })

  it("muestra «Limpiar» sólo cuando hay un filtro activo", () => {
    const { form, clear } = buildCollapsibleControls()
    setRange(form, "2026-10-11", "2026-10-11")
    const { sync } = wireFiltersToggle(form, { path: "/sales", today: HOY })

    expect(clear.hidden).toBe(true)

    chooseChannel(form, "live")
    sync()

    expect(clear.hidden).toBe(false)
  })

  it("el enlace «Limpiar» vive dentro del panel y se sigue gobernando", () => {
    const { form, panel, clear } = buildCollapsibleControls()
    chooseChannel(form, "live")

    wireFiltersToggle(form, { path: "/sales", today: HOY })

    expect(panel.hidden).toBe(true)
    expect(panel.contains(clear)).toBe(true)
    expect(clear.hidden).toBe(false)
  })

  it("el botón no envía el formulario: abrir y cerrar no filtra", () => {
    const { form, toggle } = buildCollapsibleControls()
    let submits = 0
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      submits += 1
    })
    wireAutoFilter(form)
    wireFiltersToggle(form, { path: "/sales", today: HOY })

    toggle.click()
    toggle.click()

    expect(submits).toBe(0)
  })

  it("cambiar un filtro del panel sigue enviando el form (S38)", () => {
    const { form } = buildCollapsibleControls()
    let submits = 0
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      submits += 1
    })
    wireAutoFilter(form)
    wireFiltersToggle(form, { path: "/sales", today: HOY })

    const select = form.querySelector<HTMLSelectElement>("select[name='type']")
    if (select === null) throw new Error("el fixture no tiene el select de canal")
    select.value = "live"
    select.dispatchEvent(new Event("change", { bubbles: true }))

    expect(submits).toBe(1)
  })

  it("tolera un formulario sin panel o sin botón", () => {
    const form = buildForm(`<input name="type" value="live" />`)

    expect(() => {
      const { sync } = wireFiltersToggle(form, { path: "/sales", today: HOY })
      sync()
    }).not.toThrow()
  })

  it("tolera un formulario ausente", () => {
    expect(() => {
      const { sync } = wireFiltersToggle(null, { path: "/sales", today: HOY })
      sync()
    }).not.toThrow()
  })
})
