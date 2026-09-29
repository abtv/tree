import type { App, Session, WebContents, WebPreferences } from 'electron'

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

export function configureWebContentsSecurity(
  app: Pick<App, 'on'>,
  rendererUrl: string,
  openExternal: (url: string) => void,
): void {
  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isAllowedRendererUrl(url, rendererUrl)) event.preventDefault()
    })
    contents.on('will-frame-navigate', (event) => {
      if (!isAllowedRendererUrl(event.url, rendererUrl)) event.preventDefault()
    })
    contents.on('will-redirect', (event) => {
      if (!isAllowedRendererUrl(event.url, rendererUrl)) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) openExternal(url)
      return { action: 'deny' }
    })
  })
}

export interface ResolvedRendererUrl {
  url: string
  isDevelopment: boolean
}

export function resolveRendererUrl(
  isPackaged: boolean,
  environmentUrl: string | undefined,
  packagedDocumentUrl: string,
): ResolvedRendererUrl {
  const isDevelopment = !isPackaged && environmentUrl !== undefined && environmentUrl.length > 0
  return {
    url: isDevelopment ? environmentUrl : packagedDocumentUrl,
    isDevelopment,
  }
}

export function configureRendererSessionSecurity(
  session: Pick<
    Session,
    'setPermissionRequestHandler' | 'setPermissionCheckHandler' | 'setDevicePermissionHandler' | 'webRequest'
  >,
  renderer: ResolvedRendererUrl,
): void {
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
  session.setDevicePermissionHandler(() => false)
  session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, ({ url }, callback) => {
    callback({ cancel: !isAllowedRendererRequest(url, renderer) })
  })
}

function isAllowedRendererRequest(value: string, renderer: ResolvedRendererUrl): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (['file:', 'devtools:', 'blob:', 'data:'].includes(url.protocol)) return true
  if (!renderer.isDevelopment) return false

  try {
    return url.origin === new URL(renderer.url).origin
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
