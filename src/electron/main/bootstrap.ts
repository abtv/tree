import { QUIT_SAVE_ERROR } from '../../domain/product-messages'
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

/** The single owner of the main-process quit phase, shared with the window and update wiring. */
export interface QuitControl {
  isQuitting(): boolean
  /** Quits directly: used when no loaded renderer holds a document that could confirm a save. */
  quitWithoutSave(): void
  /** Called only after the update renderer flush; returns a rollback for installation failure. */
  prepareUpdateQuit(): () => void
  closeForUpdate(whenClosed: () => void): void
  restoreMainWindow(): void
  /**
   * The window's renderer process ended, so its unsaved changes are gone and no save can be
   * confirmed: a waiting quit completes, and later quits skip the save request.
   */
  rendererGone(window: MainWindowReference): void
  /** The window started loading a new document, which cannot confirm the previous document's quit. */
  rendererReplaced(window: MainWindowReference): void
  /** The window committed a new document, so a live renderer can confirm saves again. */
  rendererLoaded(window: MainWindowReference): void
}

export interface ApplicationBootstrapDependencies {
  app: ApplicationLifecycle
  hasSingleInstanceLock: boolean
  getMainWindow: () => MainWindowReference | null
  setMainWindow: (window: MainWindowReference | null) => void
  // A window whose renderer never loaded has no document to save, so its failure quits directly.
  createMainWindow: (quitWithoutSave: () => void) => void
  closeSavedMainWindow: () => void
  getWindowCount: () => number
  registerReadyServices: (quitHandshake: QuitHandshake, onQuitConfirmed: () => void) => void
  registerShortcut: (surfaceWindow: () => void) => boolean
  surfaceWindow: () => void
  setApplicationMenu: (requestQuit: () => void) => void
  unregisterShortcut: () => void
  onStartupError: (error: unknown) => void
  /**
   * Ends background work before the process exits: returns a promise while work must finish or be
   * cleaned up first (PRODUCT §25), or null when nothing is running.
   */
  settleBeforeQuit: () => Promise<void> | null
  registerQuitControl: (control: QuitControl) => void
}

// `updating` lets the installer close the window without another save; its rollback returns to `running`.
type QuitPhase = 'running' | 'updating' | 'quitting'

export function bootstrapApplication({
  app,
  hasSingleInstanceLock,
  getMainWindow,
  setMainWindow,
  createMainWindow,
  closeSavedMainWindow,
  getWindowCount,
  registerReadyServices,
  registerShortcut,
  surfaceWindow,
  setApplicationMenu,
  unregisterShortcut,
  onStartupError,
  settleBeforeQuit,
  registerQuitControl,
}: ApplicationBootstrapDependencies): void {
  let phase: QuitPhase = 'running'
  // The window whose renderer process ended; a committed main-frame load or a new window makes it stale.
  let goneRenderer: MainWindowReference | null = null
  const quitHandshake = new QuitHandshake(
    (requestId) => {
      getMainWindow()?.webContents.send('tree:quit-requested', requestId)
    },
    (requestId) => {
      getMainWindow()?.webContents.send('tree:quit-failed', requestId, QUIT_SAVE_ERROR)
    },
    () => app.quit(),
  )

  const quitWithoutSave = (): void => {
    phase = 'quitting'
    app.quit()
  }
  const openMainWindow = (): void => {
    if (phase !== 'running' || getWindowCount() !== 0) return
    createMainWindow(quitWithoutSave)
    watchMainWindowClose()
  }
  registerQuitControl({
    isQuitting: () => phase !== 'running',
    quitWithoutSave,
    prepareUpdateQuit: () => {
      phase = 'updating'
      return () => {
        if (phase === 'updating') phase = 'running'
      }
    },
    closeForUpdate: (whenClosed) => {
      // Electron registers an additional quit observer if the native installer sees any windows.
      closeSavedMainWindow()
      setImmediate(() => {
        if (phase === 'updating' && getWindowCount() === 0) whenClosed()
      })
    },
    restoreMainWindow: openMainWindow,
    // The handshake addresses only the current main window, so only its renderer can end a waiting request.
    rendererGone: (window) => {
      goneRenderer = window
      if (window === getMainWindow() && quitHandshake.rendererLost()) app.quit()
    },
    rendererReplaced: (window) => {
      if (window === getMainWindow()) quitHandshake.rendererLost()
    },
    // Cleared only at commit: a process that ends while the navigation is pending marks the window again.
    rendererLoaded: (window) => {
      if (goneRenderer === window) goneRenderer = null
    },
  })

  app.on('before-quit', (event) => {
    const mainWindow = getMainWindow()
    // A renderer whose process ended holds no document and cannot confirm a save, like one that never loaded.
    if (phase === 'running' && mainWindow !== null && !mainWindow.isDestroyed() && mainWindow !== goneRenderer) {
      event.preventDefault()
      quitHandshake.request()
      return
    }
    phase = 'quitting'
    const pending = settleBeforeQuit()
    if (pending !== null) {
      // Quit again once the work has ended; the next call returns null.
      event.preventDefault()
      void pending.catch(() => undefined).then(() => app.quit())
      return
    }
    setMainWindow(null)
    unregisterShortcut()
  })

  const watchMainWindowClose = (): void => {
    const mainWindow = getMainWindow()
    if (mainWindow === null) return
    mainWindow.on('close', (event) => {
      if (phase !== 'running' || mainWindow.isDestroyed()) return
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
        phase = 'quitting'
      })
      if (!registerShortcut(surfaceWindow)) {
        onStartupError(new Error('The accelerator is unavailable.'))
      }
      setApplicationMenu(() => app.quit())
      createMainWindow(quitWithoutSave)
      watchMainWindowClose()
      app.on('activate', openMainWindow)
    })
    .catch(onStartupError)

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
