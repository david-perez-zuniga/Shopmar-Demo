export type InstallUiState = "installed" | "ios-hint" | "install" | "hidden"

export interface InstallSignals {
  standalone: boolean
  isIOS: boolean
  hasInstallPrompt: boolean
}

export function resolveInstallUi(signals: InstallSignals): InstallUiState {
  if (signals.standalone) return "installed"
  if (signals.isIOS) return "ios-hint"
  if (signals.hasInstallPrompt) return "install"
  return "hidden"
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function detectStandalone(): boolean {
  try {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      if (window.matchMedia("(display-mode: standalone)").matches) return true
    }
  } catch (e) {}
  if (typeof navigator === "undefined") return false
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false
  const agent = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(agent)) return true
  return /Macintosh/.test(agent) && typeof document !== "undefined" && "ontouchend" in document
}

export function initInstallPrompt(root: ParentNode = document): (() => void) | null {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-install-block]"))
  if (blocks.length === 0) return null

  const doc = root.ownerDocument ?? document
  const win = doc.defaultView ?? window

  let deferred: BeforeInstallPromptEvent | null = null
  let standalone = detectStandalone()
  const isIOS = detectIOS()

  function render(): void {
    const state = resolveInstallUi({ standalone, isIOS, hasInstallPrompt: deferred !== null })
    const visible = state === "install" || state === "ios-hint"

    for (const block of blocks) {
      if (visible) block.removeAttribute("hidden")
      else block.setAttribute("hidden", "")

      for (const button of block.querySelectorAll<HTMLElement>("[data-install-button]")) {
        if (state === "install") button.removeAttribute("hidden")
        else button.setAttribute("hidden", "")
      }

      for (const hint of block.querySelectorAll<HTMLElement>("[data-install-hint]")) {
        if (state === "ios-hint") hint.removeAttribute("hidden")
        else hint.setAttribute("hidden", "")
      }
    }
  }

  const onBeforeInstall = (event: Event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    render()
  }

  const onAppInstalled = () => {
    deferred = null
    standalone = true
    render()
  }

  const onClick = async (event: Event) => {
    const prompt = deferred
    if (prompt === null) return
    const target = event.currentTarget as HTMLElement | null
    if (target !== null) target.setAttribute("hidden", "")
    try {
      await prompt.prompt()
      await prompt.userChoice
    } catch (e) {}
    deferred = null
    render()
  }

  win.addEventListener("beforeinstallprompt", onBeforeInstall)
  win.addEventListener("appinstalled", onAppInstalled)

  for (const block of blocks) {
    for (const button of block.querySelectorAll<HTMLButtonElement>("[data-install-button]")) {
      button.addEventListener("click", onClick)
    }
  }

  render()

  return function dispose(): void {
    win.removeEventListener("beforeinstallprompt", onBeforeInstall)
    win.removeEventListener("appinstalled", onAppInstalled)
    for (const block of blocks) {
      for (const button of block.querySelectorAll<HTMLButtonElement>("[data-install-button]")) {
        button.removeEventListener("click", onClick)
      }
    }
  }
}
