import { QuitHandshake } from './quit-handshake'

export interface BeforeQuitEvent {
  preventDefault(): void
}

export interface ApplicationLifecycle {
  on(event: 'before-quit', listener: (event: BeforeQuitEvent) => void): void
  on(event: 'activate' | 'window-all-closed', listener: () => void): void
  whenReady(): Promise<void>
  quit(): void
  exit(code: number): void
}

export interface MainWindowReference {
  isDestroyed(): boolean
  on(event: 'close', listener: (event: BeforeQuitEvent) => void): void
  webContents: {
    send(channel: string, ...args: unknown[]): void
  }
}

export interface ApplicationBootstrapDependencies {
  app: ApplicationLifecycle
  hasSingleInstanceLock: boolean
  getMainWindow: () => MainWindowReference | null
  setMainWindow: (window: MainWindowReference | null) => void
  createMainWindow: () => void
  getWindowCount: () => number
  registerReadyServices: (quitHandshake: QuitHandshake, onQuitConfirmed: () => void) => void
  registerShortcut: (surfaceWindow: () => void) => boolean
  surfaceWindow: () => void
  setApplicationMenu: (requestQuit: () => void) => void
  unregisterShortcut: () => void
  onStartupError: (error: unknown) => void
}

export function bootstrapApplication({
  app,
  hasSingleInstanceLock,
  getMainWindow,
  setMainWindow,
  createMainWindow,
  getWindowCount,
  registerReadyServices,
  registerShortcut,
  surfaceWindow,
  setApplicationMenu,
  unregisterShortcut,
  onStartupError,
}: ApplicationBootstrapDependencies): void {
  let appQuitting = false
  const quitHandshake = new QuitHandshake(
    (requestId) => {
      getMainWindow()?.webContents.send('tree:quit-requested', requestId)
    },
    () => {
      getMainWindow()?.webContents.send('tree:quit-failed', 'The application could not finish saving before quit.')
    },
    () => app.quit(),
  )

  app.on('before-quit', (event) => {
    const mainWindow = getMainWindow()
    if (!appQuitting && mainWindow !== null && !mainWindow.isDestroyed()) {
      event.preventDefault()
      quitHandshake.request()
      return
    }
    appQuitting = true
    setMainWindow(null)
    unregisterShortcut()
  })

  const watchMainWindowClose = (): void => {
    const mainWindow = getMainWindow()
    if (mainWindow === null) return
    mainWindow.on('close', (event) => {
      if (appQuitting || mainWindow.isDestroyed()) return
      event.preventDefault()
      app.quit()
    })
  }

  void app
    .whenReady()
    .then(() => {
      if (!hasSingleInstanceLock) {
        app.exit(0)
        return
      }
      registerReadyServices(quitHandshake, () => {
        appQuitting = true
      })
      if (!registerShortcut(surfaceWindow)) {
        onStartupError(new Error('The accelerator is unavailable.'))
      }
      setApplicationMenu(() => app.quit())
      createMainWindow()
      watchMainWindowClose()
      app.on('activate', () => {
        if (!appQuitting && getWindowCount() === 0) {
          createMainWindow()
          watchMainWindowClose()
        }
      })
    })
    .catch(onStartupError)

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
