export interface WindowSurface {
  isDestroyed(): boolean
  isFocused(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export function isQuitShortcut(key: string, modifiers: readonly string[]): boolean {
  return key.toLowerCase() === 'q' && (modifiers.includes('meta') || modifiers.includes('control'))
}

export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

export function surfaceWindow(window: WindowSurface | null): void {
  if (window === null || window.isDestroyed() || window.isFocused()) {
    return
  }
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}
