import type { WebPreferences } from 'electron'

export interface WindowSurface {
  isDestroyed(): boolean
  isFocused(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export function createWindowWebPreferences(preload: string): WebPreferences {
  return { preload, contextIsolation: true, nodeIntegration: false, sandbox: true }
}

export interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean
  on(event: 'second-instance', listener: () => void): void
}

export function configureSingleInstance(app: SingleInstanceApp, onSecondInstance: () => void): boolean {
  if (!app.requestSingleInstanceLock()) return false
  app.on('second-instance', onSecondInstance)
  return true
}

export function reportMainProcessError(context: string, error: unknown, report = console.error): void {
  const message = error instanceof Error ? error.message : 'Unknown error.'
  report(`[Tree] ${context}: ${message}`)
}

export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

export function isAllowedRendererUrl(value: string, expected: string): boolean {
  try {
    const actualUrl = new URL(value)
    const expectedUrl = new URL(expected)
    return (
      actualUrl.protocol === expectedUrl.protocol &&
      actualUrl.host === expectedUrl.host &&
      actualUrl.pathname === expectedUrl.pathname
    )
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
