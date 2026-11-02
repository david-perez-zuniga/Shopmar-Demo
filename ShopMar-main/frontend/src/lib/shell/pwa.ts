import { formatDateTime } from "../core/format"

export function shouldShowUpdateNotice(hasWaiting: boolean): boolean {
  return hasWaiting
}

export function shouldActivateUpdate(hasWaiting: boolean, accepted: boolean): boolean {
  return hasWaiting && accepted
}

export function formatStaleNotice(at: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) {
    return "Sin conexión. Estás viendo los últimos datos guardados."
  }
  return `Sin conexión. Estás viendo datos guardados del ${formatDateTime(at)}.`
}

type StaleDetail = { at: string | null }

async function registerServiceWorker(
  onWaiting: (worker: ServiceWorker) => void,
): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.register("/sw.js")
    if (registration.waiting !== null) {
      onWaiting(registration.waiting)
    }
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing
      if (installing === null) return
      installing.addEventListener("statechange", () => {
        if (installing.state !== "installed") return
        const waiting = registration.waiting
        if (waiting !== null) onWaiting(waiting)
      })
    })
  } catch (e) {}
}

export function initPwa(root: ParentNode = document): () => void {
  const doc = root.ownerDocument ?? document
  const win = doc.defaultView ?? window

  const updateNotice = root.querySelector<HTMLElement>("[data-update-notice]")
  const acceptButton = root.querySelector<HTMLButtonElement>("[data-update-accept]")
  const staleNotice = root.querySelector<HTMLElement>("[data-stale-notice]")
  const staleText = root.querySelector<HTMLElement>("[data-stale-text]")

  let waiting: ServiceWorker | null = null
  let accepted = false
  let reloading = false

  function renderUpdate(): void {
    if (updateNotice === null) return
    if (shouldShowUpdateNotice(waiting !== null)) updateNotice.removeAttribute("hidden")
    else updateNotice.setAttribute("hidden", "")
  }

  function renderStale(at: string | null): void {
    if (staleNotice === null) return
    if (at === null) {
      staleNotice.setAttribute("hidden", "")
      return
    }
    if (staleText !== null) staleText.textContent = formatStaleNotice(at)
    staleNotice.removeAttribute("hidden")
  }

  function acceptUpdate(): void {
    accepted = true
    if (waiting === null || !shouldActivateUpdate(waiting !== null, accepted)) return
    waiting.postMessage({ type: "SKIP_WAITING" })
  }

  const onStaleData = (event: Event): void => {
    const detail = (event as CustomEvent<StaleDetail | undefined>).detail
    renderStale(detail?.at ?? null)
  }

  const onOnline = (): void => renderStale(null)

  const onControllerChange = (): void => {
    if (!accepted || reloading) return
    reloading = true
    win.location.reload()
  }

  win.addEventListener("shopmar:stale-data", onStaleData)
  win.addEventListener("online", onOnline)
  if (acceptButton !== null) acceptButton.addEventListener("click", acceptUpdate)

  const hasServiceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator
  if (hasServiceWorker) {
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)
    void registerServiceWorker((worker) => {
      waiting = worker
      renderUpdate()
    })
  }

  renderUpdate()
  renderStale(null)

  return function dispose(): void {
    win.removeEventListener("shopmar:stale-data", onStaleData)
    win.removeEventListener("online", onOnline)
    if (acceptButton !== null) acceptButton.removeEventListener("click", acceptUpdate)
    if (hasServiceWorker) {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
    }
  }
}
