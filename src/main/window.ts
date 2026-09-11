export interface WindowSurface {
  isFocused(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export function surfaceWindow(window: WindowSurface | null): void {
  if (window === null || window.isFocused()) {
    return
  }
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}
