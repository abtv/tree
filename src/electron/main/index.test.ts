import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationBootstrapDependencies } from './bootstrap'
import type { registerIpcHandlers } from './ipc-handlers'
import type { ApplicationMenuActions, ApplicationMenuState } from './application-menu'
import { ipcEvents } from '../../shared/ipc'
import type { AppUpdates } from './app-updates'
import type { NotesArchiveControllerDependencies } from './notes-archive-controller'
import type { WindowBounds } from '../../infrastructure/main/window-state'

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  ipc: vi.fn(),
  menu: vi.fn(),
  fileServices: { loadRecentNodes: vi.fn(), saveRecentNodes: vi.fn() },
  archive: {
    cancel: vi.fn(async () => undefined),
    shutdown: vi.fn((): Promise<void> | null => null),
    isIdle: vi.fn(() => true),
  },
  createArchive: vi.fn(),
  createFiles: vi.fn(),
  booleanStore: { load: vi.fn(() => false), save: vi.fn() },
  appearanceStore: { load: vi.fn(() => 'system'), save: vi.fn() },
  boundsStore: { load: vi.fn<() => WindowBounds | null>(() => null), save: vi.fn() },
  boundsSaver: { save: vi.fn(), flush: vi.fn() },
  history: { load: vi.fn(() => []), save: vi.fn() },
  security: vi.fn(),
  sessionSecurity: vi.fn(),
  scheme: vi.fn(),
  protocol: vi.fn(),
  preferencePath: vi.fn(),
  contextMenu: vi.fn(async () => 'copy'),
  archiveWorker: vi.fn(function () {}),
  singleInstance: vi.fn(() => true),
  surface: vi.fn(),
  appearance: vi.fn(),
  report: vi.fn(),
  resolveRenderer: vi.fn(() => ({ url: 'app://tree/index.html' })),
  readFile: vi.fn(),
  themeSourceSet: vi.fn(),
  loadURL: vi.fn(async () => undefined),
}))

vi.mock('./bootstrap', () => ({ bootstrapApplication: mocks.bootstrap }))
vi.mock('./ipc-handlers', () => ({ registerIpcHandlers: mocks.ipc }))
vi.mock('./application-menu', () => ({ applicationMenuTemplate: mocks.menu }))
vi.mock('./notes-archive-controller', () => ({ createNotesArchiveController: mocks.createArchive }))
vi.mock('./editor-context-menu', () => ({ showEditorContextMenu: mocks.contextMenu }))
vi.mock('node:worker_threads', () => ({ Worker: mocks.archiveWorker }))
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }))
vi.mock('../../infrastructure/main/file-services', () => ({ createFileServices: mocks.createFiles }))
vi.mock('../../infrastructure/main/command-history', () => ({
  createCommandHistoryStore: (path: string) => {
    mocks.preferencePath('commands', path)
    return mocks.history
  },
}))
vi.mock('../../infrastructure/main/emoji-history', () => ({
  createEmojiHistoryStore: (path: string) => {
    mocks.preferencePath('emoji', path)
    return mocks.history
  },
}))
vi.mock('../../infrastructure/main/window-state', () => ({
  createBooleanPreferenceStore: (path: string) => {
    mocks.preferencePath('boolean', path)
    return mocks.booleanStore
  },
  createAppearancePreferenceStore: (path: string) => {
    mocks.preferencePath('appearance', path)
    return mocks.appearanceStore
  },
  createWindowBoundsStore: (path: string) => {
    mocks.preferencePath('bounds', path)
    return mocks.boundsStore
  },
  createDebouncedWindowBoundsSaver: () => mocks.boundsSaver,
}))
vi.mock('./renderer-protocol', () => ({
  registerRendererScheme: mocks.scheme,
  handleRendererProtocol: mocks.protocol,
  packagedRendererUrl: 'app://tree/index.html',
}))
vi.mock('./window', () => ({
  configureSingleInstance: mocks.singleInstance,
  configureRendererSessionSecurity: mocks.sessionSecurity,
  configureWebContentsSecurity: mocks.security,
  createWindowWebPreferences: (preload: string) => ({ preload, sandbox: true }),
  followWindowAppearance: mocks.appearance,
  reportMainProcessError: mocks.report,
  resolveRendererUrl: mocks.resolveRenderer,
  surfaceWindow: mocks.surface,
  windowBackgroundColor: () => '#fff',
}))
vi.mock('electron-updater', async () => {
  const { EventEmitter } = await import('node:events')
  return { autoUpdater: Object.assign(new EventEmitter(), { checkForUpdates: vi.fn(async () => null) }) }
})
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  let themeSource = 'system'
  class Window extends EventEmitter {
    static fromWebContents = vi.fn((): Window | null => null)
    static windows: Window[] = []
    static getAllWindows() {
      return this.windows
    }
    webContents = Object.assign(new EventEmitter(), { send: vi.fn(), isLoadingMainFrame: vi.fn(() => false) })
    isDestroyed = vi.fn(() => false)
    isAlwaysOnTop = vi.fn(() => false)
    setAlwaysOnTop = vi.fn()
    getBounds = vi.fn(() => ({ x: 10, y: 20, width: 800, height: 600 }))
    loadURL = mocks.loadURL
    constructor(readonly options: unknown) {
      super()
      Window.windows.push(this)
    }
  }
  return {
    app: Object.assign(new EventEmitter(), {
      setName: vi.fn(),
      getPath: vi.fn((name: string) => `/profile/${name}`),
      isPackaged: false,
      getVersion: vi.fn(() => '1.2.3'),
      quit: vi.fn(),
    }),
    autoUpdater: Object.assign(new EventEmitter(), { checkForUpdates: vi.fn(), quitAndInstall: vi.fn() }),
    BrowserWindow: Window,
    ClipboardItem: class {
      constructor(readonly values: unknown) {}
    },
    clipboard: { read: vi.fn(async () => []), readText: vi.fn(), write: vi.fn() },
    dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn(), showMessageBox: vi.fn(async () => ({ response: 0 })) },
    globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() },
    ipcMain: {},
    Menu: { getApplicationMenu: vi.fn(() => null), buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createMenuSymbol: vi.fn(() => ({})), createFromBuffer: vi.fn() },
    nativeTheme: {
      get themeSource() {
        return themeSource
      },
      set themeSource(value: string) {
        mocks.themeSourceSet(value)
        themeSource = value
      },
      shouldUseDarkColors: false,
    },
    protocol: {},
    session: { defaultSession: {} },
    shell: { openExternal: vi.fn(async () => undefined), showItemInFolder: vi.fn() },
  }
})

async function setup(packaged = false) {
  const electron = await import('electron')
  Object.assign(electron.app, { isPackaged: packaged })
  await import('./index')
  const lifecycle = mocks.bootstrap.mock.lastCall![0] as ApplicationBootstrapDependencies
  const confirmed = vi.fn()
  lifecycle.registerReadyServices({} as Parameters<typeof lifecycle.registerReadyServices>[0], confirmed)
  const quit = vi.fn()
  lifecycle.setApplicationMenu(quit)
  const quitWithoutSave = vi.fn()
  lifecycle.createMainWindow(quitWithoutSave)
  const ipc = mocks.ipc.mock.lastCall![0] as Parameters<typeof registerIpcHandlers>[0]
  const window = electron.BrowserWindow.getAllWindows().at(-1)!
  const actions = () => mocks.menu.mock.lastCall![1] as ApplicationMenuActions
  const state = () => mocks.menu.mock.lastCall![0] as ApplicationMenuState
  return { lifecycle, ipc, window, actions, state, quit, confirmed, electron, quitWithoutSave }
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  const electron = await import('electron')
  const { autoUpdater } = await import('electron-updater')
  electron.app.removeAllListeners()
  electron.autoUpdater.removeAllListeners()
  autoUpdater.removeAllListeners()
  vi.mocked(autoUpdater.checkForUpdates).mockReset().mockResolvedValue(null)
  vi.mocked(electron.autoUpdater.quitAndInstall).mockReset()
  vi.mocked(electron.Menu.getApplicationMenu).mockReturnValue(null)
  vi.mocked(electron.BrowserWindow.fromWebContents).mockReturnValue(null)
  mocks.createFiles.mockReturnValue(mocks.fileServices)
  mocks.createArchive.mockReturnValue(mocks.archive)
  mocks.menu.mockReturnValue([])
  mocks.loadURL.mockReset().mockResolvedValue(undefined)
  mocks.booleanStore.load.mockReturnValue(false)
  mocks.appearanceStore.load.mockReturnValue('system')
  electron.nativeTheme.themeSource = 'system'
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function packagedSetup() {
  vi.useFakeTimers()
  vi.stubGlobal('process', { ...process, platform: 'darwin' })
  const f = await setup(true)
  const { autoUpdater } = await import('electron-updater')
  await vi.advanceTimersByTimeAsync(0)
  f.ipc.setNotesMenuState!({ canExport: true, canImport: true })
  const release = vi.fn()
  const prepare = vi.fn(() => release)
  f.lifecycle.registerUpdateQuit!(prepare)
  const updates = f.ipc.appUpdates as AppUpdates
  const downloaded = (version = '1.2.4') =>
    autoUpdater.emit('update-downloaded', {
      version,
      files: [],
      releaseDate: '2026-11-05',
      downloadedFile: '/update.zip',
      path: '/update.zip',
      sha512: 'test-digest',
    })
  return { ...f, updater: autoUpdater, updates, downloaded, prepare, release }
}

it('does not install an older late-staged package after a newer package is downloaded', async () => {
  const f = await packagedSetup()
  f.downloaded()
  f.updates.request()
  f.updates.confirm(requestedUpdateId(f.window), true)
  await vi.advanceTimersByTimeAsync(60_000)

  f.updater.emit('update-available', {
    version: '1.2.5',
    files: [],
    path: '/update.zip',
    sha512: 'test-digest',
    releaseDate: '2026-11-05',
  })
  f.downloaded('1.2.5')
  vi.mocked(f.window.webContents.send).mockClear()
  f.updates.request()
  f.updates.confirm(requestedUpdateId(f.window), true)
  expect(f.electron.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

  f.electron.autoUpdater.emit('update-downloaded')
  expect(f.electron.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  expect(f.electron.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
  f.electron.autoUpdater.emit('update-downloaded')
  expect(f.electron.autoUpdater.quitAndInstall).toHaveBeenCalledOnce()
  f.updates.fail(null)
})

function requestedUpdateId(window: Awaited<ReturnType<typeof setup>>['window']): string {
  const call = vi
    .mocked(window.webContents.send)
    .mock.calls.find(([channel]) => channel === ipcEvents.appUpdateRequested)
  expect(call).toBeDefined()
  return call![1] as string
}

describe('packaged desktop update wiring', () => {
  it('cancels an update save safely after its window has closed', async () => {
    const f = await packagedSetup()
    f.downloaded()
    f.updates.request()
    f.lifecycle.setMainWindow(null)
    vi.mocked(f.window.webContents.send).mockClear()

    f.electron.app.emit('before-quit')

    expect(f.updates.isApplying()).toBe(false)
    expect(f.window.webContents.send).not.toHaveBeenCalled()
    expect(f.prepare).not.toHaveBeenCalled()
  })

  it('keeps packaged update checks disabled outside macOS', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const f = await setup(true)
    const { autoUpdater } = await import('electron-updater')

    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(f.ipc.appUpdates).toBeUndefined()
    expect(f.state().updatesSupported).toBe(false)
  })

  it('publishes download progress and replaces the previous installable package', async () => {
    const f = await packagedSetup()
    f.downloaded()
    expect(f.ipc.getUpdateCommands!()).toEqual({
      'check-for-updates': false,
      'update-app': false,
      status: 'ready',
      version: '1.2.4',
    })

    f.updater.emit('update-available', {
      version: '1.2.5',
      files: [],
      path: '/update.zip',
      sha512: 'test-digest',
      releaseDate: '2026-11-05',
    })
    const progress = (percent: number) =>
      f.updater.emit('download-progress', { percent, total: 100, transferred: percent, bytesPerSecond: 10, delta: 1 })
    vi.mocked(f.window.webContents.send).mockClear()
    const rebuilds = mocks.menu.mock.calls.length
    progress(42.9)

    expect(f.updates.isReady()).toBe(false)
    expect(f.ipc.getUpdateCommands!()).toEqual({
      'check-for-updates': false,
      'update-app': false,
      status: 42,
    })
    expect(f.window.webContents.send).toHaveBeenCalledExactlyOnceWith(
      ipcEvents.updateCommandsChanged,
      f.ipc.getUpdateCommands!(),
    )
    expect(mocks.menu).toHaveBeenCalledTimes(rebuilds)

    vi.mocked(f.window.isDestroyed).mockReturnValue(true)
    vi.mocked(f.window.webContents.send).mockClear()
    progress(43)
    f.lifecycle.setMainWindow(null)
    progress(44)
    expect(f.window.webContents.send).not.toHaveBeenCalled()
  })

  it('waits for the provider download promise before reporting a manual result', async () => {
    const f = await packagedSetup()
    let finish!: (paths: string[]) => void
    const downloadPromise = new Promise<string[]>((resolve) => {
      finish = resolve
    })
    const updateInfo = {
      version: '1.2.4',
      files: [{ url: '/update.zip', sha512: 'test-digest', size: 1 }],
      path: '/update.zip',
      sha512: 'test-digest',
      releaseDate: '2026-11-05',
    }
    vi.mocked(f.updater.checkForUpdates).mockResolvedValueOnce({
      isUpdateAvailable: true,
      updateInfo,
      versionInfo: updateInfo,
      downloadPromise,
    })

    const pending = f.updates.checkManually()
    await vi.advanceTimersByTimeAsync(0)
    expect(f.updates.isChecking()).toBe(true)
    expect(f.electron.dialog.showMessageBox).not.toHaveBeenCalled()
    finish(['/update.zip'])
    await pending

    expect(f.electron.dialog.showMessageBox).toHaveBeenCalledOnce()
  })

  it('allows retry after native staging fails and restores window creation after rollback', async () => {
    const f = await packagedSetup()
    f.downloaded()
    vi.mocked(f.electron.autoUpdater.checkForUpdates).mockImplementationOnce(() => {
      throw new Error('staging unavailable')
    })
    f.updates.request()
    f.updates.confirm(requestedUpdateId(f.window), true)
    expect(f.release).toHaveBeenCalledOnce()
    vi.mocked(f.window.webContents.send).mockClear()

    f.updates.request()
    f.updates.confirm(requestedUpdateId(f.window), true)
    const count = f.lifecycle.getWindowCount()
    f.lifecycle.createMainWindow(vi.fn())
    expect(f.lifecycle.getWindowCount()).toBe(count)
    f.electron.autoUpdater.emit('error', new Error('native staging failed'))
    f.updates.fail(null)
    f.lifecycle.createMainWindow(vi.fn())
    expect(f.lifecycle.getWindowCount()).toBe(count + 1)
    vi.mocked(f.window.webContents.send).mockClear()
    f.updates.request()
    const current = f.lifecycle.getMainWindow()!
    f.updates.confirm(requestedUpdateId(current as typeof f.window), true)

    expect(f.electron.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(3)
    f.updates.fail(null)
  })

  it('does not install after an unsolicited native staging event without a saved update request', async () => {
    const f = await packagedSetup()

    f.electron.autoUpdater.emit('update-downloaded')

    expect(f.electron.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(f.prepare).not.toHaveBeenCalled()
    expect(f.updates.getStatus()).toBeNull()
    f.downloaded()
    f.actions().updateApp!()
    f.ipc.appUpdates!.confirm(requestedUpdateId(f.window), true)
    expect(f.prepare).toHaveBeenCalledOnce()
    expect(f.electron.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(f.electron.autoUpdater.checkForUpdates).toHaveBeenCalledOnce()
    f.updates.fail(null)
  })

  it.each(['missing', 'destroyed', 'quitting'] as const)(
    'does not open a delayed update result dialog when the window is %s',
    async (state) => {
      const f = await packagedSetup()
      let finish!: () => void
      vi.mocked(f.updater.checkForUpdates).mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          finish = resolve
        })
        return null
      })
      const check = f.updates.checkManually()
      await vi.advanceTimersByTimeAsync(0)
      if (state === 'missing') f.lifecycle.setMainWindow(null)
      if (state === 'destroyed') vi.mocked(f.window.isDestroyed).mockReturnValue(true)
      if (state === 'quitting') f.ipc.onQuitConfirmed!()

      finish()
      await check

      expect(f.electron.dialog.showMessageBox).not.toHaveBeenCalled()
      expect(f.updates.isChecking()).toBe(false)
      expect(f.updates.isNotifying()).toBe(false)
    },
  )

  it('marks the native menu modal only while the update result dialog is open', async () => {
    const f = await packagedSetup()
    let dismiss!: () => void
    vi.mocked(f.electron.dialog.showMessageBox).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        dismiss = resolve
      })
      return { response: 0, checkboxChecked: false }
    })
    const check = f.updates.checkManually()
    await vi.advanceTimersByTimeAsync(0)

    expect(f.state().modalOpen).toBe(true)
    expect(f.state().updateChecking).toBe(true)
    dismiss()
    await check

    expect(f.state().modalOpen).toBe(false)
    expect(f.state().updateChecking).toBe(false)
  })

  it.each(['before-quit', 'render-process-gone', 'error'] as const)(
    'cancels a pending update save after %s',
    async (event) => {
      const f = await packagedSetup()
      f.downloaded()
      f.actions().updateApp!()
      expect(f.updates.isApplying()).toBe(true)

      if (event === 'before-quit') f.electron.app.emit('before-quit', {} as never)
      else if (event === 'error') f.updater.emit('error', new Error('download failed'))
      else f.window.webContents.emit('render-process-gone')

      expect(f.updates.isApplying()).toBe(false)
      expect(f.window.webContents.send).toHaveBeenCalledWith(
        ipcEvents.appUpdateFinished,
        event === 'error' ? 'Update failed. Try Restart and Install again.' : null,
      )
      expect(f.prepare).not.toHaveBeenCalled()
      expect(f.electron.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    },
  )

  it.each(['about', 'data'] as const)('blocks the manual update action while %s is active', async (reason) => {
    const f = await packagedSetup()
    if (reason === 'about') f.ipc.setAboutOpen!(true)
    else f.ipc.setAppUpdateBlocked!(true)

    f.actions().checkForUpdates!()
    await vi.advanceTimersByTimeAsync(0)

    expect(f.updater.checkForUpdates).toHaveBeenCalledOnce()
    expect(f.state().updatesSupported).toBe(true)
    expect(f.electron.dialog.showMessageBox).not.toHaveBeenCalled()
  })

  it('reports a failed status dialog and restores the menu after a manual check', async () => {
    const f = await packagedSetup()
    const error = new Error('dialog failed')
    vi.mocked(f.electron.dialog.showMessageBox).mockRejectedValueOnce(error)

    f.actions().checkForUpdates!()
    await vi.advanceTimersByTimeAsync(0)

    expect(mocks.report).toHaveBeenCalledWith('Could not show update status', error)
    expect(f.state()).toMatchObject({ modalOpen: false, updateChecking: false, updateApplying: false })
  })

  it('downloads without installing, saves before native staging, and installs only after staging completes', async () => {
    const f = await packagedSetup()

    expect(f.updater.checkForUpdates).toHaveBeenCalledOnce()
    expect(f.updater).toMatchObject({
      autoInstallOnAppQuit: false,
      autoDownload: true,
      allowPrerelease: false,
      allowDowngrade: false,
      disableDifferentialDownload: true,
    })
    f.downloaded()
    expect(f.state().updateReady).toBe(true)
    expect(f.electron.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    f.actions().updateApp!()
    expect(f.prepare).not.toHaveBeenCalled()
    expect(f.state()).toMatchObject({ modalOpen: true, updateApplying: true })

    f.ipc.appUpdates!.confirm(requestedUpdateId(f.window), true)

    expect(f.prepare).toHaveBeenCalledOnce()
    expect(f.electron.autoUpdater.checkForUpdates).toHaveBeenCalledOnce()
    expect(f.electron.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    f.electron.autoUpdater.emit('update-downloaded')
    expect(f.electron.autoUpdater.quitAndInstall).toHaveBeenCalledOnce()
    f.updates.fail(null)
  })

  it.each(['about', 'data', 'archive', 'export', 'import', 'loading', 'destroyed', 'missing'] as const)(
    'does not start update saving while blocked by %s',
    async (reason) => {
      const f = await packagedSetup()
      f.downloaded()
      if (reason === 'about') f.ipc.setAboutOpen!(true)
      if (reason === 'data') f.ipc.setAppUpdateBlocked!(true)
      if (reason === 'archive') mocks.archive.isIdle.mockReturnValueOnce(false)
      if (reason === 'export') f.ipc.setNotesMenuState!({ canExport: false, canImport: true })
      if (reason === 'import') f.ipc.setNotesMenuState!({ canExport: true, canImport: false })
      if (reason === 'loading') vi.mocked(f.window.webContents.isLoadingMainFrame).mockReturnValue(true)
      if (reason === 'destroyed') vi.mocked(f.window.isDestroyed).mockReturnValue(true)
      if (reason === 'missing') f.lifecycle.setMainWindow(null)
      vi.mocked(f.window.webContents.send).mockClear()

      f.actions().updateApp!()

      expect(f.window.webContents.send).not.toHaveBeenCalledWith(ipcEvents.appUpdateRequested, expect.anything())
      expect(f.prepare).not.toHaveBeenCalled()
      expect(f.electron.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    },
  )

  it('releases quit preparation after native installation fails and retries the already staged update', async () => {
    const f = await packagedSetup()
    f.downloaded()
    f.actions().updateApp!()
    f.ipc.appUpdates!.confirm(requestedUpdateId(f.window), true)
    vi.mocked(f.electron.autoUpdater.quitAndInstall).mockImplementationOnce(() => {
      throw new Error('native failure')
    })

    f.electron.autoUpdater.emit('update-downloaded')

    expect(f.release).toHaveBeenCalledOnce()
    expect(f.window.webContents.send).toHaveBeenCalledWith(
      ipcEvents.appUpdateFinished,
      'Update failed. Try Restart and Install again.',
    )
    expect(f.updates.isApplying()).toBe(false)
    vi.mocked(f.window.webContents.send).mockClear()
    f.actions().updateApp!()
    f.ipc.appUpdates!.confirm(requestedUpdateId(f.window), true)
    expect(f.electron.autoUpdater.checkForUpdates).toHaveBeenCalledOnce()
    expect(f.electron.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(2)
    f.updates.fail(null)
  })

  it.each(['ready', 'current', 'failed'] as const)('shows the %s result of a manual update check', async (result) => {
    const f = await packagedSetup()
    if (result === 'ready') f.downloaded()
    if (result === 'failed') vi.mocked(f.updater.checkForUpdates).mockRejectedValueOnce(new Error('offline'))

    await f.updates.checkManually()

    expect(f.electron.dialog.showMessageBox).toHaveBeenCalledExactlyOnceWith(f.window, {
      type: result === 'failed' ? 'warning' : 'info',
      message:
        result === 'ready'
          ? 'An update is ready to install.'
          : result === 'failed'
            ? 'Could not check for updates.'
            : 'Tree is up to date.',
      detail:
        result === 'ready'
          ? 'Choose Tree > Restart and Install 1.2.4 to save your work and restart with the new version.'
          : result === 'failed'
            ? 'Check your Internet connection and try again.'
            : 'You are using Tree 1.2.3.',
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
    })
  })
})

describe('desktop entry wiring', () => {
  it('leaves the native theme source untouched when restoring Automatic appearance', async () => {
    mocks.themeSourceSet.mockClear()

    await setup()

    expect(mocks.themeSourceSet).not.toHaveBeenCalled()
  })

  it('permits shutdown before ready services have been registered', async () => {
    await import('./index')
    const lifecycle = mocks.bootstrap.mock.lastCall![0] as ApplicationBootstrapDependencies

    expect(lifecycle.getMainWindow()).toBeNull()
    expect(lifecycle.settleBeforeQuit()).toBeNull()
    expect(mocks.archive.shutdown).not.toHaveBeenCalled()
  })

  it('restores saved window geometry and keeps native symbols available across menu rebuilds', async () => {
    const bounds = { x: 12, y: 34, width: 850, height: 650 }
    mocks.boundsStore.load.mockReturnValueOnce(bounds)
    const f = await setup()

    expect((f.window as unknown as { options: unknown }).options).toMatchObject(bounds)
    expect(f.state().notes).toEqual({ canExport: false, canImport: false })
    f.ipc.setVimEnabled!(true)

    expect(vi.mocked(f.electron.nativeImage.createMenuSymbol).mock.calls).toEqual([
      ['point.3.connected.trianglepath.dotted'],
      ['calendar'],
      ['square.and.arrow.up'],
      ['square.and.arrow.down'],
    ])
    expect(mocks.menu.mock.lastCall![2]).toEqual({ tree: {}, agenda: {}, export: {}, import: {} })
  })

  it('forwards packaged renderer resolution and protocol reads without changing bytes or errors', async () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
    const f = await setup()
    expect(mocks.resolveRenderer).toHaveBeenCalledExactlyOnceWith(
      false,
      process.env['ELECTRON_RENDERER_URL'],
      'app://tree/index.html',
    )
    const [protocol, directory, read] = mocks.protocol.mock.lastCall as unknown as [
      unknown,
      string,
      (path: string) => Promise<Uint8Array>,
    ]
    expect(protocol).toBe(f.electron.protocol)
    expect(directory).toMatch(/\/renderer$/)
    const bytes = new Uint8Array([1, 2, 3])
    mocks.readFile.mockResolvedValueOnce(bytes)

    await expect(read('/renderer/index.html')).resolves.toBe(bytes)
    expect(mocks.readFile).toHaveBeenCalledExactlyOnceWith('/renderer/index.html')
    const failure = new Error('renderer unreadable')
    mocks.readFile.mockRejectedValueOnce(failure)
    await expect(read('/renderer/index.html')).rejects.toBe(failure)
  })

  it('loads and saves line-number preferences through the profile store', async () => {
    const f = await setup()
    mocks.booleanStore.load.mockReturnValueOnce(true)

    expect(f.ipc.getLineNumbers!()).toBe(true)
    f.ipc.setLineNumbers!(true)

    expect(mocks.booleanStore.save).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('avoids rebuilding native commands for unchanged notes availability', async () => {
    const f = await setup()
    mocks.menu.mockClear()

    f.ipc.setNotesMenuState!({ canExport: true, canImport: true })
    f.ipc.setNotesMenuState!({ canExport: true, canImport: true })

    expect(mocks.menu).toHaveBeenCalledOnce()
  })

  it('keeps each persisted preference in its established file under the profile data directory', async () => {
    await setup()

    expect(mocks.preferencePath.mock.calls).toEqual([
      ['commands', '/profile/userData/data/command-history.json'],
      ['emoji', '/profile/userData/data/emoji-history.json'],
      ['boolean', '/profile/userData/data/window-always-on-top.json'],
      ['boolean', '/profile/userData/data/vim-enabled.json'],
      ['boolean', '/profile/userData/data/line-numbers.json'],
      ['appearance', '/profile/userData/data/appearance.json'],
      ['bounds', '/profile/userData/data/window-bounds.json'],
    ])
  })

  it('forwards native clipboard reads and preserves native failures', async () => {
    const { ipc, electron } = await setup()
    const items = [{ types: ['text/plain'], getType: vi.fn(async () => 'text') }]
    vi.mocked(electron.clipboard.read).mockResolvedValueOnce(items as never)
    vi.mocked(electron.clipboard.readText).mockResolvedValueOnce('plain text')

    expect(await ipc.nativeClipboard.read()).toBe(items)
    expect(await ipc.nativeClipboard.readText()).toBe('plain text')

    const failure = new Error('Clipboard unavailable')
    vi.mocked(electron.clipboard.read).mockRejectedValueOnce(failure)
    await expect(ipc.nativeClipboard.read()).rejects.toBe(failure)
  })

  it('keeps the archive shutdown promise so bootstrap can await cleanup', async () => {
    const f = await setup()
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    mocks.archive.shutdown.mockReturnValueOnce(pending)

    const settled = f.lifecycle.settleBeforeQuit()

    expect(settled).toBe(pending)
    finish()
    await settled
  })

  it.each(['check-for-updates', 'update-app'] as const)(
    'publishes the current availability of %s to the command panel',
    async (command) => {
      const f = await setup()
      const getMenuItemById = vi.fn((id: string) => (id === command ? { enabled: true } : undefined))
      vi.mocked(f.electron.Menu.getApplicationMenu).mockReturnValue({ getMenuItemById } as never)
      vi.mocked(f.window.webContents.send).mockClear()

      f.ipc.setVimEnabled!(true)

      const expected = {
        'check-for-updates': command === 'check-for-updates',
        'update-app': command === 'update-app',
        status: null,
      }
      expect(f.ipc.getUpdateCommands!()).toEqual(expected)
      expect(f.window.webContents.send).toHaveBeenCalledExactlyOnceWith(ipcEvents.updateCommandsChanged, expected)
    },
  )

  it('starts the desktop archive worker with the selected task as worker data', async () => {
    await setup()
    const archive = mocks.createArchive.mock.lastCall![0] as NotesArchiveControllerDependencies
    const task = { type: 'import' as const, archivePath: '/chosen.zip', stagingDirectory: '/staging' }

    const worker = archive.startWorker(task)

    expect(mocks.archiveWorker).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/\/notes-archive-worker\.js$/), {
      workerData: task,
    })
    expect(worker).toBe(mocks.archiveWorker.mock.instances[0])
  })

  it('routes a context menu through the sender window and preserves its result and error callback', async () => {
    const f = await setup()
    const request = {
      x: 10,
      y: 20,
      selectionText: 'search',
      canCut: false,
      canCopy: true,
      canPaste: false,
      canSelectAll: true,
    }

    await expect(f.ipc.showEditorContextMenu!(f.window.webContents, request)).resolves.toBeNull()
    expect(mocks.contextMenu).not.toHaveBeenCalled()

    vi.mocked(f.electron.BrowserWindow.fromWebContents).mockReturnValue(f.window)

    await expect(f.ipc.showEditorContextMenu!(f.window.webContents, request)).resolves.toBe('copy')
    const args = mocks.contextMenu.mock.lastCall as unknown as [
      unknown,
      unknown,
      unknown,
      (url: string) => Promise<void>,
      (error: Error) => void,
      unknown,
    ]
    expect(args.slice(0, 3)).toEqual([f.electron.Menu, f.window, f.window.webContents])
    expect(args[5]).toBe(request)
    await args[3]('https://www.google.com/search?q=search')
    expect(f.electron.shell.openExternal).toHaveBeenCalledExactlyOnceWith('https://www.google.com/search?q=search')
    const failure = new Error('browser unavailable')
    args[4](failure)
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith('Could not open Google search', failure)
  })

  it('reports archive cancellation failure when the renderer goes away', async () => {
    const f = await setup()
    const failure = new Error('worker would not stop')
    mocks.archive.cancel.mockRejectedValueOnce(failure)

    f.window.webContents.emit('render-process-gone')
    await vi.waitFor(() =>
      expect(mocks.report).toHaveBeenCalledExactlyOnceWith('Could not cancel notes operation', failure),
    )

    expect(f.state().notes).toEqual({ canExport: false, canImport: false })
  })

  it('rebuilds the native menu after preference changes without sending to a destroyed window', async () => {
    const f = await setup()
    vi.mocked(f.window.isDestroyed).mockReturnValue(true)
    vi.mocked(f.window.webContents.send).mockClear()
    mocks.menu.mockClear()

    f.ipc.setVimEnabled!(true)
    f.ipc.setAlwaysOnTop!(true)

    expect(mocks.menu).toHaveBeenCalledTimes(2)
    expect(f.window.webContents.send).not.toHaveBeenCalled()
    expect(f.window.setAlwaysOnTop).toHaveBeenLastCalledWith(true)
  })

  it('keeps menu commands safe when no main window exists and restores appearance through IPC', async () => {
    const f = await setup()
    const actions = f.actions()
    f.ipc.setNotesMenuState!({ canExport: true, canImport: true })
    f.lifecycle.setMainWindow(null)
    vi.mocked(f.window.webContents.send).mockClear()
    mocks.menu.mockClear()

    actions.findCommand('find')
    actions.viewCommand('tree')
    actions.showAbout()
    actions.notesCommand('export')
    actions.notesCommand('import')
    actions.setVimEnabled(true)
    actions.setAlwaysOnTop(true)
    f.ipc.setAlwaysOnTop!(false)
    f.ipc.setAppearance('light')

    expect(f.window.webContents.send).not.toHaveBeenCalled()
    expect(mocks.appearanceStore.save).toHaveBeenCalledExactlyOnceWith('light')
    expect(f.electron.nativeTheme.themeSource).toBe('light')
    expect(mocks.menu).toHaveBeenCalledTimes(2)
  })

  it('starts an unpackaged window with secure dimensions and updates unavailable', async () => {
    const f = await setup()
    const options = (f.window as unknown as { options: unknown }).options

    expect(options).toEqual({
      width: 1000,
      height: 700,
      minWidth: 640,
      minHeight: 480,
      title: 'Tree',
      titleBarStyle: 'hidden',
      backgroundColor: '#fff',
      webPreferences: { preload: expect.stringMatching(/preload\/index\.js$/), sandbox: true },
    })
    expect(f.state()).toMatchObject({
      vimEnabled: false,
      alwaysOnTop: false,
      appearance: 'system',
      updatesSupported: false,
      updateChecking: false,
      updateReady: false,
      updateBlocked: false,
      updateApplying: false,
      modalOpen: false,
    })
    expect(f.ipc.appUpdates).toBeUndefined()
  })

  it('restores saved appearance and editing preferences before exposing the window', async () => {
    mocks.booleanStore.load.mockReturnValue(true)
    mocks.appearanceStore.load.mockReturnValue('dark')
    const f = await setup()

    expect(f.electron.nativeTheme.themeSource).toBe('dark')
    expect(f.window.setAlwaysOnTop).toHaveBeenCalledExactlyOnceWith(true)
    expect(f.ipc.getVimEnabled!()).toBe(true)
    expect(f.ipc.getAppearance!()).toBe('dark')
    expect(f.state()).toMatchObject({ vimEnabled: true, alwaysOnTop: true, appearance: 'dark' })
  })

  it('reports a renderer load failure, quits without a save and prevents window recreation', async () => {
    const failure = new Error('renderer missing')
    mocks.loadURL.mockRejectedValueOnce(failure)
    const f = await setup()
    await Promise.resolve()
    const count = f.lifecycle.getWindowCount()

    f.lifecycle.createMainWindow(vi.fn())

    expect(mocks.report).toHaveBeenCalledExactlyOnceWith('Could not load the renderer', failure)
    expect(f.quitWithoutSave).toHaveBeenCalledOnce()
    expect(f.lifecycle.getWindowCount()).toBe(count)
  })

  it('reports failures opening an external link from the web-contents guard', async () => {
    const f = await setup()
    const failure = new Error('shell unavailable')
    vi.mocked(f.electron.shell.openExternal).mockRejectedValueOnce(failure)
    const open = mocks.security.mock.lastCall![2] as (url: string) => void

    open('https://example.com')
    await Promise.resolve()

    expect(f.electron.shell.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com')
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith('Could not open external link', failure)
  })

  it('attaches archive dialogs to the current window and forwards progress and reveal requests', async () => {
    const f = await setup()
    const ports = mocks.createArchive.mock.lastCall![0] as NotesArchiveControllerDependencies
    const save = { defaultPath: 'notes.zip', filters: [] }
    const open = { properties: ['openFile'] as Array<'openFile'>, filters: [] }

    await ports.dialogs.showSaveDialog(save)
    await ports.dialogs.showOpenDialog(open)
    ports.sendProgress({ imagesDone: 2, imageCount: 3 })
    ports.showItemInFolder('/profile/replaced')

    expect(f.electron.dialog.showSaveDialog).toHaveBeenCalledWith(f.window, save)
    expect(f.electron.dialog.showOpenDialog).toHaveBeenCalledWith(f.window, open)
    expect(f.window.webContents.send).toHaveBeenCalledWith(ipcEvents.notesProgress, { imagesDone: 2, imageCount: 3 })
    expect(f.electron.shell.showItemInFolder).toHaveBeenCalledExactlyOnceWith('/profile/replaced')
    expect(ports.homeDirectory).toBe('/profile/home')
    expect(ports.attachmentsDirectory).toBe('/profile/userData/data/attachments')
    f.lifecycle.setMainWindow(null)
    vi.mocked(f.window.webContents.send).mockClear()
    ports.sendProgress({ imagesDone: 3, imageCount: 3 })
    expect(f.window.webContents.send).not.toHaveBeenCalled()
    await ports.dialogs.showSaveDialog(save)
    await ports.dialogs.showOpenDialog(open)
    expect(f.electron.dialog.showSaveDialog).toHaveBeenLastCalledWith(save)
    expect(f.electron.dialog.showOpenDialog).toHaveBeenLastCalledWith(open)
  })

  it.each([false, true])('dispatches only enabled update menu commands (enabled=%s)', async (enabled) => {
    const f = await setup()
    const item = { enabled, click: vi.fn() }
    const getMenuItemById = vi.fn((id: string) => (id === 'update-app' ? item : undefined))
    vi.mocked(f.electron.Menu.getApplicationMenu).mockReturnValue({ getMenuItemById } as never)

    expect(f.ipc.getUpdateCommands!()).toEqual({ 'check-for-updates': false, 'update-app': enabled, status: null })
    f.ipc.runUpdateCommand!('update-app')
    f.ipc.runUpdateCommand!('check-for-updates')

    if (enabled) expect(item.click).toHaveBeenCalledExactlyOnceWith(item, f.window, { triggeredByAccelerator: false })
    else expect(item.click).not.toHaveBeenCalled()
  })

  it.each(['export', 'import'] as const)('checks the independent availability of %s', async (command) => {
    const f = await setup()
    f.ipc.setNotesMenuState!({ canExport: command === 'export', canImport: command === 'import' })
    vi.mocked(f.window.webContents.send).mockClear()

    f.actions().notesCommand('export')
    f.actions().notesCommand('import')

    expect(f.window.webContents.send).toHaveBeenCalledExactlyOnceWith(ipcEvents.notesMenuCommand, command)
  })

  it('preserves a replacement window when the previous window finishes closing', async () => {
    const f = await setup()
    f.lifecycle.createMainWindow(vi.fn())
    const replacement = f.lifecycle.getMainWindow()

    f.window.emit('closed')

    expect(replacement).not.toBe(f.window)
    expect(f.lifecycle.getMainWindow()).toBe(replacement)
  })

  it('surfaces the current window when a second instance is launched', async () => {
    const f = await setup()
    const [, surfaceCurrent] = mocks.singleInstance.mock.lastCall as unknown as [unknown, () => void]
    f.lifecycle.createMainWindow(vi.fn())
    const current = f.lifecycle.getMainWindow()

    surfaceCurrent()

    expect(current).not.toBe(f.window)
    expect(mocks.surface).toHaveBeenCalledExactlyOnceWith(current)
  })

  it('reads rich clipboard flavors and preserves text, HTML and PNG on writes', async () => {
    const { ipc, electron } = await setup()
    const clipboard = ipc.nativeClipboard
    const read = vi.mocked(electron.clipboard.read)
    const item = (value: unknown) => ({ types: ['text/html'], getType: vi.fn(async () => value) })
    read.mockResolvedValueOnce([])
    expect(await clipboard.readHTML!()).toBe('')
    const htmlItem = item('<b>text</b>')
    read.mockResolvedValueOnce([htmlItem] as never)
    expect(await clipboard.readHTML!()).toBe('<b>text</b>')
    expect(htmlItem.getType).toHaveBeenCalledExactlyOnceWith('text/html')
    read.mockResolvedValueOnce([item(new Blob(['<i>blob</i>']))] as never)
    expect(await clipboard.readHTML!()).toBe('<i>blob</i>')
    read.mockResolvedValueOnce([item(42)] as never)
    expect(await clipboard.readHTML!()).toBe('')

    clipboard.writeRichText!('plain', '<b>plain</b>')
    clipboard.writePlainText!('plain')
    clipboard.writeImage!(new Uint8Array([1, 2, 3]))

    const calls = vi.mocked(electron.clipboard.write).mock.calls as unknown as Array<
      [{ values: Record<string, unknown> }[]]
    >
    expect(calls[0]![0][0]!.values).toEqual({ 'text/plain': 'plain', 'text/html': '<b>plain</b>' })
    expect(calls[1]![0][0]!.values).toEqual({ 'text/plain': 'plain' })
    const image = calls[2]![0][0]!.values['image/png'] as Blob
    expect(image.type).toBe('image/png')
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it.each(['destroyed', 'loading'] as const)('suppresses commands when the renderer is %s', async (reason) => {
    const { window, actions } = await setup()
    if (reason === 'destroyed') vi.mocked(window.isDestroyed).mockReturnValue(true)
    else vi.mocked(window.webContents.isLoadingMainFrame).mockReturnValue(true)
    vi.mocked(window.webContents.send).mockClear()

    actions().findCommand('all')
    actions().viewCommand('agenda')
    actions().showAbout()
    actions().notesCommand('export')
    actions().notesCommand('import')

    expect(window.webContents.send).not.toHaveBeenCalled()
  })

  it('reports startup failure and prevents any later window creation', async () => {
    const { lifecycle, electron } = await setup()
    const error = new Error('startup failed')
    const count = lifecycle.getWindowCount()

    lifecycle.onStartupError(error)
    lifecycle.createMainWindow(vi.fn())

    expect(mocks.report).toHaveBeenCalledExactlyOnceWith('Could not start the application', error)
    expect(electron.app.quit).toHaveBeenCalledOnce()
    expect(lifecycle.getWindowCount()).toBe(count)
  })

  it('registers the isolated renderer, data services and application shortcut', async () => {
    const { lifecycle, electron, window } = await setup()
    expect(electron.app.setName).toHaveBeenCalledExactlyOnceWith('Tree')
    expect(mocks.scheme).toHaveBeenCalledExactlyOnceWith(electron.protocol)
    expect(mocks.createFiles).toHaveBeenCalledExactlyOnceWith('/profile/userData/data', undefined, {
      userDataDirectory: '/profile/userData',
    })
    expect(mocks.sessionSecurity).toHaveBeenCalledWith(electron.session.defaultSession, {
      url: 'app://tree/index.html',
    })
    expect(window.loadURL).toHaveBeenCalledExactlyOnceWith('app://tree/index.html')
    expect(mocks.appearance).toHaveBeenCalledWith(window, electron.nativeTheme)
    const surface = vi.fn()

    expect(lifecycle.registerShortcut(surface)).toBe(true)
    lifecycle.unregisterShortcut()
    lifecycle.surfaceWindow()

    expect(electron.globalShortcut.register).toHaveBeenCalledWith('CommandOrControl+0', surface)
    expect(electron.globalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+0')
    expect(mocks.surface).toHaveBeenCalledWith(window)
  })

  it('dispatches view, find, notes and About to the ready renderer', async () => {
    const { ipc, window, actions } = await setup()
    ipc.setNotesMenuState!({ canExport: true, canImport: true })

    actions().findCommand('next')
    actions().viewCommand('agenda')
    actions().notesCommand('export')
    actions().notesCommand('import')
    actions().showAbout()

    expect(window.webContents.send).toHaveBeenCalledWith(ipcEvents.findMenuCommand, 'next')
    expect(window.webContents.send).toHaveBeenCalledWith(ipcEvents.viewMenuCommand, 'agenda')
    expect(window.webContents.send).toHaveBeenCalledWith(ipcEvents.notesMenuCommand, 'export')
    expect(window.webContents.send).toHaveBeenCalledWith(ipcEvents.notesMenuCommand, 'import')
    expect(window.webContents.send).toHaveBeenCalledWith(ipcEvents.aboutRequested)
  })

  it('blocks main-window actions while About is modal and still permits appearance and quit', async () => {
    const { ipc, window, actions, quit, electron } = await setup()
    ipc.setNotesMenuState!({ canExport: true, canImport: true })
    ipc.setAboutOpen!(true)
    expect((mocks.menu.mock.lastCall![0] as ApplicationMenuState).modalOpen).toBe(true)
    vi.mocked(window.webContents.send).mockClear()
    const rebuilds = mocks.menu.mock.calls.length

    actions().findCommand('find')
    actions().viewCommand('tree')
    actions().notesCommand('export')
    actions().setVimEnabled(true)
    actions().setAlwaysOnTop(true)

    expect(mocks.menu).toHaveBeenCalledTimes(rebuilds + 2)
    expect(mocks.booleanStore.save).not.toHaveBeenCalled()
    expect(
      vi.mocked(window.webContents.send).mock.calls.every(([channel]) => channel === ipcEvents.updateCommandsChanged),
    ).toBe(true)
    actions().setAppearance('dark')
    actions().requestQuit()
    expect(mocks.appearanceStore.save).toHaveBeenCalledWith('dark')
    expect(electron.nativeTheme.themeSource).toBe('dark')
    expect(window.webContents.send).toHaveBeenCalledWith(ipcEvents.appearanceChanged, 'dark')
    expect(quit).toHaveBeenCalledOnce()
  })

  it('persists preferences and forwards history through IPC services', async () => {
    const { ipc, actions, window } = await setup()
    actions().setVimEnabled(true)
    actions().setAlwaysOnTop(true)
    ipc.setVimEnabled!(false)
    ipc.setAlwaysOnTop!(false)
    ipc.setRecentNodes!(['node'])
    ipc.getRecentNodes!()

    expect(mocks.booleanStore.save.mock.calls).toEqual([[true], [true], [false], [false]])
    expect(window.setAlwaysOnTop).toHaveBeenLastCalledWith(false)
    expect(window.webContents.send).toHaveBeenCalledWith(ipcEvents.vimEnabledChanged, true)
    expect(window.webContents.send).toHaveBeenCalledWith(ipcEvents.alwaysOnTopChanged, true)
    expect(mocks.fileServices.saveRecentNodes).toHaveBeenCalledWith(['node'])
    expect(mocks.fileServices.loadRecentNodes).toHaveBeenCalledOnce()
  })

  it('resets operation availability only for main-frame navigation and renderer loss', async () => {
    const { ipc, window, state } = await setup()
    ipc.setNotesMenuState!({ canExport: true, canImport: true })
    window.webContents.emit('did-start-navigation', {}, 'url', true, true)
    window.webContents.emit('did-start-navigation', {}, 'url', false, false)
    expect(state().notes).toEqual({ canExport: true, canImport: true })
    expect(mocks.archive.cancel).not.toHaveBeenCalled()

    window.webContents.emit('did-start-navigation', {}, 'url', false, true)

    expect(state().notes).toEqual({ canExport: false, canImport: false })
    expect(mocks.archive.cancel).toHaveBeenCalledOnce()
    window.webContents.emit('render-process-gone')
    expect(mocks.archive.cancel).toHaveBeenCalledTimes(2)
  })

  it.each(['navigation', 'crash'] as const)(
    'clears stale modal and update blocking state after a renderer %s',
    async (event) => {
      const f = await setup()
      f.ipc.setAboutOpen!(true)
      f.ipc.setAppUpdateBlocked!(true)
      expect(f.state()).toMatchObject({ modalOpen: true, updateBlocked: true })

      if (event === 'navigation') f.window.webContents.emit('did-start-navigation', {}, 'url', false, true)
      else f.window.webContents.emit('render-process-gone')

      expect(f.state()).toMatchObject({ modalOpen: false, updateBlocked: false })
      vi.mocked(f.window.webContents.send).mockClear()
      f.actions().findCommand('find')
      expect(f.window.webContents.send).toHaveBeenCalledExactlyOnceWith(ipcEvents.findMenuCommand, 'find')
    },
  )

  it('saves bounds on move, resize and close and releases the closed window', async () => {
    const { lifecycle, window, ipc, state } = await setup()
    ipc.setAboutOpen!(true)
    window.emit('move')
    window.emit('resize')
    window.emit('close')

    expect(mocks.boundsSaver.save.mock.calls).toEqual(
      Array.from({ length: 3 }, () => [{ x: 10, y: 20, width: 800, height: 600 }]),
    )
    expect(mocks.boundsSaver.flush).toHaveBeenCalledOnce()
    expect(lifecycle.getMainWindow()).toBe(window)
    window.emit('closed')
    expect(lifecycle.getMainWindow()).toBeNull()
    ipc.setVimEnabled!(false)
    expect(state().modalOpen).toBe(false)
  })

  it('waits for archive shutdown and prevents window creation after confirmed quit', async () => {
    const { ipc, lifecycle, confirmed, electron } = await setup()
    expect(lifecycle.settleBeforeQuit()).toBeNull()
    expect(mocks.archive.shutdown).toHaveBeenCalledOnce()
    ipc.onQuitConfirmed!()
    const count = lifecycle.getWindowCount()

    lifecycle.createMainWindow(vi.fn())

    expect(confirmed).toHaveBeenCalledOnce()
    expect(electron.BrowserWindow.getAllWindows()).toHaveLength(count)
  })
})
