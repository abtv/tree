import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bootstrapApplication,
  type ApplicationLifecycle,
  type BeforeQuitEvent,
  type MainWindowReference,
  type QuitControl,
} from './bootstrap'
import type { QuitHandshake } from './quit-handshake'

function createHarness(locked = true) {
  const listeners: {
    beforeQuit?: (event: BeforeQuitEvent) => void
    activate?: () => void
    windowAllClosed?: () => void
  } = {}
  const windowListeners: { close?: (event: BeforeQuitEvent) => void } = {}
  const app: ApplicationLifecycle = {
    on: (event, listener) => {
      if (event === 'before-quit') listeners.beforeQuit = listener
      else if (event === 'activate') listeners.activate = listener as () => void
      else if (event === 'window-all-closed') listeners.windowAllClosed = listener as () => void
    },
    whenReady: () => Promise.resolve(),
    quit: vi.fn(),
    exit: vi.fn(),
  }
  const window: MainWindowReference = {
    isDestroyed: () => false,
    on: (event, listener) => {
      if (event === 'close') windowListeners.close = listener
    },
    webContents: { send: vi.fn() },
  }
  const registerReadyServices = vi.fn<(handshake: QuitHandshake, onQuitConfirmed: () => void) => void>()
  const dependencies = {
    app,
    hasSingleInstanceLock: locked,
    getMainWindow: vi.fn<() => MainWindowReference | null>(() => window),
    setMainWindow: vi.fn(),
    createMainWindow: vi.fn(),
    getWindowCount: vi.fn(() => 1),
    registerReadyServices,
    registerShortcut: vi.fn(() => true),
    surfaceWindow: vi.fn(),
    setApplicationMenu: vi.fn(),
    unregisterShortcut: vi.fn(),
    onStartupError: vi.fn(),
    settleBeforeQuit: vi.fn<() => Promise<void> | null>(() => null),
    registerQuitControl: vi.fn<(control: QuitControl) => void>(),
  }
  bootstrapApplication(dependencies)
  const quitControl = dependencies.registerQuitControl.mock.calls[0]![0]
  return { app, window, windowListeners, listeners, dependencies, registerReadyServices, quitControl }
}

afterEach(() => vi.unstubAllGlobals())

describe('bootstrapApplication', () => {
  it.each(['darwin', 'win32', 'linux'])('handles the last window closing on %s', async (platform) => {
    vi.stubGlobal('process', { ...process, platform })
    const f = createHarness()
    await Promise.resolve()

    f.listeners.windowAllClosed!()

    expect(f.app.quit).toHaveBeenCalledTimes(platform === 'darwin' ? 0 : 1)
  })

  it('cleans up when no main window exists and does not attach a close handler', async () => {
    const f = createHarness()
    f.dependencies.getMainWindow.mockReturnValue(null)
    await Promise.resolve()
    await Promise.resolve()
    const event = { preventDefault: vi.fn() }

    f.listeners.beforeQuit!(event)

    expect(f.windowListeners.close).toBeUndefined()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(f.window.webContents.send).not.toHaveBeenCalled()
    expect(f.dependencies.setMainWindow).toHaveBeenCalledExactlyOnceWith(null)
    expect(f.dependencies.unregisterShortcut).toHaveBeenCalledOnce()
    expect(f.dependencies.onStartupError).not.toHaveBeenCalled()
  })

  it('tolerates the main window disappearing while waiting for a quit acknowledgement', async () => {
    vi.useFakeTimers()
    try {
      const f = createHarness()
      await Promise.resolve()
      f.listeners.beforeQuit!({ preventDefault: vi.fn() })
      f.dependencies.getMainWindow.mockReturnValue(null)

      expect(() => vi.advanceTimersByTime(5_000)).not.toThrow()

      expect(f.app.quit).not.toHaveBeenCalled()
      expect(f.window.webContents.send).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('attaches close handling to a replacement window created on activation', async () => {
    const f = createHarness()
    await Promise.resolve()
    f.dependencies.getWindowCount.mockReturnValue(0)
    delete f.windowListeners.close

    f.listeners.activate!()
    const event = { preventDefault: vi.fn() }
    f.windowListeners.close!(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(f.app.quit).toHaveBeenCalledOnce()
  })

  it('completes the registered renderer save handshake before the final quit cleanup', async () => {
    const f = createHarness()
    await Promise.resolve()
    const [handshake, confirmed] = f.registerReadyServices.mock.calls[0]!
    const first = { preventDefault: vi.fn() }
    f.listeners.beforeQuit!(first)
    const requestId = vi.mocked(f.window.webContents.send).mock.calls[0]![1] as string

    expect(handshake.confirm(requestId)).toBe(true)
    confirmed()
    await Promise.resolve()

    expect(f.app.quit).toHaveBeenCalledOnce()
    const final = { preventDefault: vi.fn() }
    f.listeners.beforeQuit!(final)
    expect(final.preventDefault).not.toHaveBeenCalled()
    expect(f.dependencies.unregisterShortcut).toHaveBeenCalledOnce()
    expect(f.window.webContents.send).toHaveBeenCalledOnce()
  })

  it('does not create a second window when activation finds an existing window', async () => {
    const f = createHarness()
    await Promise.resolve()

    f.listeners.activate!()

    expect(f.dependencies.createMainWindow).toHaveBeenCalledOnce()
  })
  it('allows an update to close without another save, then restores normal close handling after rollback', async () => {
    const f = createHarness()
    await Promise.resolve()
    const rollback = f.quitControl.prepareUpdateQuit()
    const updating = { preventDefault: vi.fn() }

    f.windowListeners.close!(updating)

    expect(updating.preventDefault).not.toHaveBeenCalled()
    expect(f.app.quit).not.toHaveBeenCalled()
    expect(f.window.webContents.send).not.toHaveBeenCalled()
    rollback()
    const ordinary = { preventDefault: vi.fn() }
    f.windowListeners.close!(ordinary)

    expect(ordinary.preventDefault).toHaveBeenCalledOnce()
    expect(f.app.quit).toHaveBeenCalledOnce()
  })

  it('does not create another window on activation while an update is preparing to quit', async () => {
    const f = createHarness()
    await Promise.resolve()
    f.dependencies.getWindowCount.mockReturnValue(0)
    const rollback = f.quitControl.prepareUpdateQuit()

    f.listeners.activate!()
    expect(f.dependencies.createMainWindow).toHaveBeenCalledOnce()
    rollback()
    f.listeners.activate!()

    expect(f.dependencies.createMainWindow).toHaveBeenCalledTimes(2)
  })

  it('keeps a confirmed quit when a failed update installation rolls back', async () => {
    const f = createHarness()
    await Promise.resolve()
    const rollback = f.quitControl.prepareUpdateQuit()
    const confirmed = f.registerReadyServices.mock.calls[0]![1]

    confirmed()
    rollback()
    const event = { preventDefault: vi.fn() }
    f.windowListeners.close!(event)

    expect(f.quitControl.isQuitting()).toBe(true)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('shares one quit phase with the window and update wiring', async () => {
    const f = createHarness()
    await Promise.resolve()
    expect(f.quitControl.isQuitting()).toBe(false)

    f.quitControl.quitWithoutSave()

    expect(f.quitControl.isQuitting()).toBe(true)
    expect(f.app.quit).toHaveBeenCalledOnce()
    const event = { preventDefault: vi.fn() }
    f.listeners.beforeQuit!(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(f.window.webContents.send).not.toHaveBeenCalled()
  })

  // @requirement PRODUCT.md §21
  it('quits without a renderer save when the renderer process is gone', async () => {
    const f = createHarness()
    await Promise.resolve()
    f.quitControl.rendererGone(f.window)
    expect(f.app.quit).not.toHaveBeenCalled()
    const close = { preventDefault: vi.fn() }

    f.windowListeners.close!(close)
    const quit = { preventDefault: vi.fn() }
    f.listeners.beforeQuit!(quit)

    expect(close.preventDefault).toHaveBeenCalledOnce()
    expect(f.app.quit).toHaveBeenCalledOnce()
    expect(quit.preventDefault).not.toHaveBeenCalled()
    expect(f.window.webContents.send).not.toHaveBeenCalled()
    expect(f.dependencies.unregisterShortcut).toHaveBeenCalledOnce()
    expect(f.quitControl.isQuitting()).toBe(true)
  })

  // @requirement PRODUCT.md §21
  it('completes a quit that was waiting for a save when the renderer process is gone', async () => {
    vi.useFakeTimers()
    try {
      const f = createHarness()
      await Promise.resolve()
      f.listeners.beforeQuit!({ preventDefault: vi.fn() })

      f.quitControl.rendererGone(f.window)
      vi.advanceTimersByTime(5_000)
      const final = { preventDefault: vi.fn() }
      f.listeners.beforeQuit!(final)

      expect(f.app.quit).toHaveBeenCalledOnce()
      expect(final.preventDefault).not.toHaveBeenCalled()
      expect(f.window.webContents.send).toHaveBeenCalledExactlyOnceWith('tree:quit-requested', expect.any(String))
      expect(f.dependencies.unregisterShortcut).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  // @requirement PRODUCT.md §21
  it('abandons a waiting quit when the renderer reloads, then asks the reloaded renderer again', async () => {
    vi.useFakeTimers()
    try {
      const f = createHarness()
      await Promise.resolve()
      f.listeners.beforeQuit!({ preventDefault: vi.fn() })

      f.quitControl.rendererReplaced(f.window)
      vi.advanceTimersByTime(5_000)
      const retry = { preventDefault: vi.fn() }
      f.listeners.beforeQuit!(retry)

      expect(f.app.quit).not.toHaveBeenCalled()
      expect(retry.preventDefault).toHaveBeenCalledOnce()
      const channels = vi.mocked(f.window.webContents.send).mock.calls.map(([channel]) => channel)
      expect(channels).toEqual(['tree:quit-requested', 'tree:quit-requested'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('saves through a reloaded renderer once its document commits after the earlier renderer was gone', async () => {
    const f = createHarness()
    await Promise.resolve()
    f.quitControl.rendererGone(f.window)
    f.quitControl.rendererReplaced(f.window)
    f.quitControl.rendererLoaded(f.window)
    const reloaded = { preventDefault: vi.fn() }

    f.listeners.beforeQuit!(reloaded)

    expect(reloaded.preventDefault).toHaveBeenCalledOnce()
    expect(f.window.webContents.send).toHaveBeenCalledExactlyOnceWith('tree:quit-requested', expect.any(String))
  })

  it('keeps the gone mark when the renderer process ends while a reload is still pending', async () => {
    const f = createHarness()
    await Promise.resolve()
    f.quitControl.rendererReplaced(f.window)
    f.quitControl.rendererGone(f.window)
    const beforeCommit = { preventDefault: vi.fn() }

    f.listeners.beforeQuit!(beforeCommit)

    expect(beforeCommit.preventDefault).not.toHaveBeenCalled()
    expect(f.window.webContents.send).not.toHaveBeenCalled()
  })

  it('protects a document that commits after the previous process ended mid-reload', async () => {
    const f = createHarness()
    await Promise.resolve()
    f.quitControl.rendererReplaced(f.window)
    f.quitControl.rendererGone(f.window)
    f.quitControl.rendererLoaded(f.window)
    const committed = { preventDefault: vi.fn() }

    f.listeners.beforeQuit!(committed)

    expect(committed.preventDefault).toHaveBeenCalledOnce()
    expect(f.window.webContents.send).toHaveBeenCalledExactlyOnceWith('tree:quit-requested', expect.any(String))
  })

  it('ignores a load from an earlier window after the current renderer has gone', async () => {
    const f = createHarness()
    await Promise.resolve()
    const replacement: MainWindowReference = { ...f.window, webContents: { send: vi.fn() } }
    f.dependencies.getMainWindow.mockReturnValue(replacement)
    f.quitControl.rendererGone(replacement)

    f.quitControl.rendererLoaded(f.window)
    const quit = { preventDefault: vi.fn() }
    f.listeners.beforeQuit!(quit)

    expect(quit.preventDefault).not.toHaveBeenCalled()
    expect(replacement.webContents.send).not.toHaveBeenCalled()
  })

  it('asks a new main window to save, and an earlier window cannot end its waiting quit', async () => {
    const f = createHarness()
    await Promise.resolve()
    const earlier = f.window
    f.quitControl.rendererGone(earlier)
    const replacement: MainWindowReference = { ...earlier, webContents: { send: vi.fn() } }
    f.dependencies.getMainWindow.mockReturnValue(replacement)
    const fresh = { preventDefault: vi.fn() }

    f.listeners.beforeQuit!(fresh)
    f.quitControl.rendererGone(earlier)
    f.quitControl.rendererReplaced(earlier)
    f.quitControl.rendererLoaded(earlier)

    expect(fresh.preventDefault).toHaveBeenCalledOnce()
    expect(f.app.quit).not.toHaveBeenCalled()
    const requestId = vi.mocked(replacement.webContents.send).mock.calls[0]![1] as string
    const [handshake] = f.registerReadyServices.mock.calls[0]!
    expect(handshake.confirm(requestId)).toBe(true)
  })

  it('does not intercept a destroyed window close', async () => {
    const f = createHarness()
    await Promise.resolve()
    vi.spyOn(f.window, 'isDestroyed').mockReturnValue(true)
    const event = { preventDefault: vi.fn() }

    f.windowListeners.close!(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(f.app.quit).not.toHaveBeenCalled()
  })

  it('exits without registering application services when the instance lock is unavailable', async () => {
    const { app, dependencies } = createHarness(false)

    await Promise.resolve()

    expect(app.exit).toHaveBeenCalledWith(0)
    expect(dependencies.registerReadyServices).not.toHaveBeenCalled()
    expect(dependencies.createMainWindow).not.toHaveBeenCalled()
  })

  // @requirement PRODUCT.md §9
  it('registers services, shortcut, menu, and the initial window after readiness', async () => {
    const { dependencies } = createHarness()

    await Promise.resolve()

    expect(dependencies.registerReadyServices).toHaveBeenCalledOnce()
    expect(dependencies.registerShortcut).toHaveBeenCalledWith(dependencies.surfaceWindow)
    expect(dependencies.setApplicationMenu).toHaveBeenCalledOnce()
    expect(dependencies.createMainWindow).toHaveBeenCalledOnce()
  })

  // @requirement PRODUCT.md §9.1
  it('routes application-menu quit through the application lifecycle', async () => {
    const { app, dependencies } = createHarness()

    await Promise.resolve()
    const requestQuit = dependencies.setApplicationMenu.mock.calls[0]![0]

    requestQuit()

    expect(app.quit).toHaveBeenCalledOnce()
  })

  it('surfaces a new window on activation when no windows remain', async () => {
    const { listeners, dependencies } = createHarness()
    dependencies.getWindowCount.mockReturnValue(0)

    await Promise.resolve()

    listeners.activate?.()

    expect(dependencies.createMainWindow).toHaveBeenCalledTimes(2)
  })

  it('requests a renderer save before allowing quit', async () => {
    const { listeners, window, registerReadyServices } = createHarness()
    const event: BeforeQuitEvent = { preventDefault: vi.fn() }

    await Promise.resolve()

    listeners.beforeQuit?.(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(window.webContents.send).toHaveBeenCalledWith('tree:quit-requested', expect.any(String))
    expect(registerReadyServices).toHaveBeenCalledOnce()
  })

  // @requirement PRODUCT.md §9.2
  it('quits and prevents the close when the main window is closed', async () => {
    const { app, windowListeners } = createHarness()

    await Promise.resolve()
    const event: BeforeQuitEvent = { preventDefault: vi.fn() }

    windowListeners.close?.(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(app.quit).toHaveBeenCalledOnce()
  })

  it('quits without a renderer save when the main window fails to load', async () => {
    const { app, listeners, window, dependencies } = createHarness()
    dependencies.createMainWindow.mockImplementation((quitWithoutSave: () => void) => quitWithoutSave())

    await Promise.resolve()
    const event: BeforeQuitEvent = { preventDefault: vi.fn() }

    listeners.beforeQuit?.(event)

    expect(app.quit).toHaveBeenCalledOnce()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(window.webContents.send).not.toHaveBeenCalled()
    expect(dependencies.unregisterShortcut).toHaveBeenCalledOnce()
  })

  it('defers the confirmed quit until background notes work has ended, then quits again', async () => {
    const { app, listeners, dependencies, registerReadyServices } = createHarness()
    let finish: () => void = () => undefined
    dependencies.settleBeforeQuit.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )

    await Promise.resolve()

    registerReadyServices.mock.calls[0]![1]()
    const deferred: BeforeQuitEvent = { preventDefault: vi.fn() }

    listeners.beforeQuit?.(deferred)

    expect(deferred.preventDefault).toHaveBeenCalledOnce()
    expect(dependencies.unregisterShortcut).not.toHaveBeenCalled()
    expect(app.quit).not.toHaveBeenCalled()

    finish()
    await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce())

    const final: BeforeQuitEvent = { preventDefault: vi.fn() }

    listeners.beforeQuit?.(final)

    expect(final.preventDefault).not.toHaveBeenCalled()
    expect(dependencies.unregisterShortcut).toHaveBeenCalledOnce()

    // A window must not be recreated while the work finishes.
    dependencies.getWindowCount.mockReturnValue(0)

    listeners.activate?.()

    expect(dependencies.createMainWindow).toHaveBeenCalledOnce()
  })

  it('still quits when background notes work fails to settle', async () => {
    const { app, listeners, dependencies, registerReadyServices } = createHarness()
    dependencies.settleBeforeQuit.mockReturnValueOnce(Promise.reject(new Error('cleanup failed')))

    await Promise.resolve()
    registerReadyServices.mock.calls[0]![1]()
    listeners.beforeQuit?.({ preventDefault: vi.fn() })

    await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce())
  })

  it('allows the window to close once quitting has been confirmed', async () => {
    const { app, windowListeners, registerReadyServices } = createHarness()

    await Promise.resolve()

    registerReadyServices.mock.calls[0]![1]()
    const event: BeforeQuitEvent = { preventDefault: vi.fn() }

    windowListeners.close?.(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(app.quit).not.toHaveBeenCalled()
  })

  it('reports shortcut registration failure without preventing startup', async () => {
    const { dependencies } = createHarness()
    dependencies.registerShortcut.mockReturnValue(false)

    await Promise.resolve()

    expect(dependencies.onStartupError).toHaveBeenCalledWith(new Error('The accelerator is unavailable.'))
    expect(dependencies.createMainWindow).toHaveBeenCalledOnce()
  })

  it('reports readiness failures through the startup error handler', async () => {
    const error = new Error('ready failed')
    const app: ApplicationLifecycle = {
      on: () => undefined,
      whenReady: () => Promise.reject(error),
      quit: vi.fn(),
      exit: vi.fn(),
    }
    const onStartupError = vi.fn()

    bootstrapApplication({
      app,
      hasSingleInstanceLock: true,
      getMainWindow: () => null,
      setMainWindow: vi.fn(),
      createMainWindow: vi.fn(),
      getWindowCount: () => 0,
      registerReadyServices: vi.fn(),
      registerShortcut: vi.fn(() => true),
      surfaceWindow: vi.fn(),
      setApplicationMenu: vi.fn(),
      unregisterShortcut: vi.fn(),
      onStartupError,
      settleBeforeQuit: () => null,
      registerQuitControl: vi.fn(),
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(onStartupError).toHaveBeenCalledWith(error)
  })

  it('keeps the application open and reports a quit timeout when the renderer does not confirm', async () => {
    vi.useFakeTimers()
    try {
      const { app, listeners, window } = createHarness()
      const event: BeforeQuitEvent = { preventDefault: vi.fn() }

      await Promise.resolve()

      listeners.beforeQuit?.(event)
      vi.advanceTimersByTime(5_000)

      expect(app.quit).not.toHaveBeenCalled()
      expect(window.webContents.send).toHaveBeenLastCalledWith(
        'tree:quit-failed',
        vi.mocked(window.webContents.send).mock.calls[0]![1],
        'The application could not finish saving before quit.',
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('cleans up after a destroyed window and does not recreate windows after quitting', async () => {
    const { listeners, dependencies } = createHarness()
    const window = dependencies.getMainWindow()!
    vi.spyOn(window, 'isDestroyed').mockReturnValue(true)
    const event: BeforeQuitEvent = { preventDefault: vi.fn() }

    await Promise.resolve()

    listeners.beforeQuit?.(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(dependencies.setMainWindow).toHaveBeenCalledWith(null)
    expect(dependencies.unregisterShortcut).toHaveBeenCalledOnce()

    dependencies.getWindowCount.mockReturnValue(0)

    listeners.activate?.()

    expect(dependencies.createMainWindow).toHaveBeenCalledOnce()
  })
})
