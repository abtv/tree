import { describe, expect, it, vi } from 'vitest'
import {
  bootstrapApplication,
  type ApplicationLifecycle,
  type BeforeQuitEvent,
  type MainWindowReference,
} from './bootstrap'
import type { QuitHandshake } from './quit-handshake'

function createHarness(locked = true) {
  const listeners: {
    beforeQuit?: (event: BeforeQuitEvent) => void
    activate?: () => void
  } = {}
  const app: ApplicationLifecycle = {
    on: (event, listener) => {
      if (event === 'before-quit') listeners.beforeQuit = listener
      else if (event === 'activate') listeners.activate = listener as () => void
    },
    whenReady: () => Promise.resolve(),
    quit: vi.fn(),
    exit: vi.fn(),
  }
  const window: MainWindowReference = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  }
  const registerReadyServices = vi.fn<(handshake: QuitHandshake, onQuitConfirmed: () => void) => void>()
  const dependencies = {
    app,
    hasSingleInstanceLock: locked,
    getMainWindow: vi.fn(() => window),
    setMainWindow: vi.fn(),
    createMainWindow: vi.fn(),
    getWindowCount: vi.fn(() => 1),
    registerReadyServices,
    registerShortcut: vi.fn(() => true),
    surfaceWindow: vi.fn(),
    setApplicationMenu: vi.fn(),
    unregisterShortcut: vi.fn(),
    onStartupError: vi.fn(),
  }
  bootstrapApplication(dependencies)
  return { app, window, listeners, dependencies, registerReadyServices }
}

describe('bootstrapApplication', () => {
  it('exits without registering application services when the instance lock is unavailable', async () => {
    const { app, dependencies } = createHarness(false)

    await Promise.resolve()

    expect(app.exit).toHaveBeenCalledWith(0)
    expect(dependencies.registerReadyServices).not.toHaveBeenCalled()
    expect(dependencies.createMainWindow).not.toHaveBeenCalled()
  })

  it('registers services, shortcut, menu, and the initial window after readiness', async () => {
    const { dependencies } = createHarness()

    await Promise.resolve()

    expect(dependencies.registerReadyServices).toHaveBeenCalledOnce()
    expect(dependencies.registerShortcut).toHaveBeenCalledWith(dependencies.surfaceWindow)
    expect(dependencies.setApplicationMenu).toHaveBeenCalledOnce()
    expect(dependencies.createMainWindow).toHaveBeenCalledOnce()
  })

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

  it('reports shortcut registration failure without preventing startup', async () => {
    const { dependencies } = createHarness()
    dependencies.registerShortcut.mockReturnValue(false)

    await Promise.resolve()

    expect(dependencies.onStartupError).toHaveBeenCalledWith(expect.any(Error))
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
        'The application could not finish saving before quit.',
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('cleans up after a destroyed window and does not recreate windows after quitting', async () => {
    const { listeners, dependencies } = createHarness()
    const window = dependencies.getMainWindow()
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
