import {
  app,
  autoUpdater as nativeUpdater,
  BrowserWindow,
  ClipboardItem,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  protocol,
  session,
  shell,
} from 'electron'
import { autoUpdater } from 'electron-updater'
import { AppUpdates } from './app-updates'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { NativeClipboard } from '../../infrastructure/main/clipboard'
import { createFileServices } from '../../infrastructure/main/file-services'
import { createCommandHistoryStore } from '../../infrastructure/main/command-history'
import { createEmojiHistoryStore } from '../../infrastructure/main/emoji-history'
import {
  createDebouncedWindowBoundsSaver,
  createAppearancePreferenceStore,
  createBooleanPreferenceStore,
  createWindowBoundsStore,
  type AppearancePreferenceStore,
  type BooleanPreferenceStore,
  type WindowBounds,
} from '../../infrastructure/main/window-state'
import { ipcEvents, type NotesMenuState } from '../../shared/ipc'
import { appearanceThemeSource, type AppearancePreference } from '../../shared/appearance'
import { applicationMenuTemplate } from './application-menu'
import { createMenuIcons, type MenuIcons } from './menu-icons'
import { registerIpcHandlers } from './ipc-handlers'
import { createImageToText } from './image-to-text'
import { showEditorContextMenu } from './editor-context-menu'
import { bootstrapApplication, type QuitControl } from './bootstrap'
import { createNotesArchiveController, type NotesArchiveController } from './notes-archive-controller'
import { createPngDecoder } from './png-decoder'
import { handleRendererProtocol, packagedRendererUrl, registerRendererScheme } from './renderer-protocol'
import {
  configureSingleInstance,
  configureRendererSessionSecurity,
  configureWebContentsSecurity,
  createWindowWebPreferences,
  followWindowAppearance,
  reportMainProcessError,
  resolveRendererUrl,
  surfaceWindow,
  windowBackgroundColor,
} from './window'

app.setName('Tree')
// Privileged schemes must be registered before the app is ready.
registerRendererScheme(protocol)

let mainWindow: BrowserWindow | null = null
// Assigned synchronously by bootstrapApplication below, before any window or service exists.
let quitControl!: QuitControl
let alwaysOnTopStore: BooleanPreferenceStore | null = null
let vimEnabledStore: BooleanPreferenceStore | null = null
let lineNumbersStore: BooleanPreferenceStore | null = null
let appearanceStore: AppearancePreferenceStore | null = null
let selectedAppearance: AppearancePreference = 'system'
let requestQuitFromMenu: () => void = () => undefined
let notesArchive: NotesArchiveController | null = null
let notesMenuState: NotesMenuState = { canExport: false, canImport: false }
const packagedRendererDirectory = join(__dirname, '../renderer')
let renderer: ReturnType<typeof resolveRendererUrl> | null = null
let rendererModalOpen = false
let appUpdates: AppUpdates | undefined
let appUpdateBlocked = false

const nativeClipboard: NativeClipboard = {
  read: () => clipboard.read(),
  readText: () => clipboard.readText(),
  readHTML: async () => {
    const items = await clipboard.read()
    const item = items.find((entry) => entry.types.includes('text/html'))
    if (item === undefined) return ''
    const value = await item.getType('text/html')
    if (typeof value === 'string') return value
    if (value instanceof Blob) return value.text()
    return ''
  },
  writeRichText: (text, html) => clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html })]),
  writePlainText: (text) => clipboard.write([new ClipboardItem({ 'text/plain': text })]),
  writeImage: (png) =>
    clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]),
}

function isAlwaysOnTop(): boolean {
  return mainWindow?.isAlwaysOnTop() ?? alwaysOnTopStore?.load() ?? false
}

function isVimEnabled(): boolean {
  return vimEnabledStore?.load() ?? false
}

function currentAppearance(): AppearancePreference {
  return selectedAppearance
}

function setAppearance(value: AppearancePreference): void {
  appearanceStore?.save(value)
  selectedAppearance = value
  nativeTheme.themeSource = appearanceThemeSource(value)
  mainWindow?.setBackgroundColor(windowBackgroundColor(nativeTheme.shouldUseDarkColors, value))
  mainWindow?.webContents.send(ipcEvents.appearanceChanged, value)
  rebuildApplicationMenu()
}

let menuIcons: MenuIcons | undefined

function getUpdateCommands() {
  const menu = Menu.getApplicationMenu()
  const version = appUpdates?.getVersion()
  return {
    'check-for-updates': menu?.getMenuItemById('check-for-updates')?.enabled === true,
    'update-app': menu?.getMenuItemById('update-app')?.enabled === true,
    status: appUpdates?.getStatus() ?? null,
    ...(version ? { version } : {}),
  }
}

function rebuildApplicationMenu(): void {
  menuIcons ??= createMenuIcons((name) => nativeImage.createMenuSymbol(name))
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      applicationMenuTemplate(
        {
          vimEnabled: isVimEnabled(),
          alwaysOnTop: isAlwaysOnTop(),
          appearance: currentAppearance(),
          notes: notesMenuState,
          modalOpen: rendererModalOpen || (appUpdates?.isApplying() ?? false) || (appUpdates?.isNotifying() ?? false),
          updatesSupported: appUpdates !== undefined,
          updateChecking: appUpdates?.isChecking() ?? false,
          updateReady: appUpdates?.canRequest() ?? false,
          updateVersion: appUpdates?.getVersion(),
          updateBlocked: appUpdateBlocked,
          updateApplying: appUpdates?.isApplying() ?? false,
        },
        {
          requestQuit: () => {
            appUpdates?.cancelBeforeNativeQuit()
            requestQuitFromMenu()
          },
          updateApp: () => appUpdates?.request(),
          checkForUpdates: () => {
            if (rendererModalOpen || appUpdateBlocked) return
            void appUpdates
              ?.checkManually()
              .catch((error: unknown) => reportMainProcessError('Could not show update status', error))
          },
          findCommand: (command) => {
            if (rendererModalOpen) return
            if (mainWindow !== null && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoadingMainFrame()) {
              mainWindow.webContents.send(ipcEvents.findMenuCommand, command)
            }
          },
          viewCommand: (command) => {
            if (rendererModalOpen) return
            if (mainWindow !== null && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoadingMainFrame()) {
              mainWindow.webContents.send(ipcEvents.viewMenuCommand, command)
            }
          },
          notesCommand: (command) => {
            if (rendererModalOpen) return
            if (command === 'export' ? notesMenuState.canExport : notesMenuState.canImport) {
              mainWindow?.webContents.send(ipcEvents.notesMenuCommand, command)
            }
          },
          setAppearance,
          showAbout: () => {
            if (mainWindow !== null && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoadingMainFrame()) {
              mainWindow.webContents.send(ipcEvents.aboutRequested)
            }
          },
          setVimEnabled: (value) => {
            if (rendererModalOpen) {
              rebuildApplicationMenu()
              return
            }
            vimEnabledStore?.save(value)
            mainWindow?.webContents.send(ipcEvents.vimEnabledChanged, value)
          },
          setAlwaysOnTop: (value) => {
            if (rendererModalOpen) {
              rebuildApplicationMenu()
              return
            }
            mainWindow?.setAlwaysOnTop(value)
            alwaysOnTopStore?.save(value)
            mainWindow?.webContents.send(ipcEvents.alwaysOnTopChanged, value)
          },
        },
        menuIcons,
      ),
    ),
  )
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(ipcEvents.updateCommandsChanged, getUpdateCommands())
  }
}

function createMainWindow(quitWithoutSave: () => void): void {
  if (quitControl.isQuitting()) return
  const resolvedRenderer = renderer
  if (resolvedRenderer === null) throw new Error('Renderer URL was not resolved before creating the window.')
  const windowBoundsStore = createWindowBoundsStore(join(app.getPath('userData'), 'data', 'window-bounds.json'))
  const windowAlwaysOnTopStore =
    alwaysOnTopStore ?? createBooleanPreferenceStore(join(app.getPath('userData'), 'data', 'window-always-on-top.json'))
  const savedBounds = windowBoundsStore.load()
  const windowBounds = createDebouncedWindowBoundsSaver(windowBoundsStore)
  const window = new BrowserWindow({
    ...(savedBounds ?? { width: 1000, height: 700 }),
    minWidth: 640,
    minHeight: 480,
    title: 'Tree',
    titleBarStyle: 'hidden',
    disableAutoHideCursor: true,
    backgroundColor: windowBackgroundColor(nativeTheme.shouldUseDarkColors, currentAppearance()),
    webPreferences: createWindowWebPreferences(join(__dirname, '../preload/index.js')),
  })
  window.setAlwaysOnTop(windowAlwaysOnTopStore.load())
  followWindowAppearance(window, nativeTheme, currentAppearance)
  mainWindow = window
  const refreshUpdateMenu = (): void => {
    if (window === mainWindow && appUpdates?.isReady()) rebuildApplicationMenu()
  }
  const resetNotesMenu = (): void => {
    rendererModalOpen = false
    appUpdateBlocked = false
    appUpdates?.cancelBeforeNativeQuit()
    notesMenuState = { canExport: false, canImport: false }
    rebuildApplicationMenu()
    void notesArchive
      ?.cancel()
      .then(refreshUpdateMenu)
      .catch((error: unknown) => reportMainProcessError('Could not cancel notes operation', error))
  }
  window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (!isMainFrame || isInPlace) return
    resetNotesMenu()
    quitControl.rendererReplaced(window)
  })
  window.webContents.on('did-navigate', () => quitControl.rendererLoaded(window))
  window.webContents.on('render-process-gone', () => {
    // Reset first: completing a waiting quit must not race the update and notes cancellation.
    resetNotesMenu()
    quitControl.rendererGone(window)
  })
  window.webContents.on('did-stop-loading', refreshUpdateMenu)
  const saveWindowBounds = (): void => {
    const { x, y, width, height } = window.getBounds()
    const bounds: WindowBounds = { x, y, width, height }
    windowBounds.save(bounds)
  }
  window.on('move', saveWindowBounds)
  window.on('resize', saveWindowBounds)
  window.on('close', () => {
    saveWindowBounds()
    windowBounds.flush()
  })
  window.on('closed', () => {
    rendererModalOpen = false
    if (mainWindow === window) {
      mainWindow = null
      if (appUpdates?.isReady()) rebuildApplicationMenu()
    }
  })
  void window.loadURL(resolvedRenderer.url).catch((error: unknown) => {
    reportMainProcessError('Could not load the renderer', error)
    quitWithoutSave()
  })
}

const hasSingleInstanceLock = configureSingleInstance(app, () => surfaceWindow(mainWindow))

bootstrapApplication({
  app,
  hasSingleInstanceLock,
  getMainWindow: () => mainWindow,
  setMainWindow: (window) => {
    mainWindow = window as BrowserWindow | null
  },
  createMainWindow,
  getWindowCount: () => BrowserWindow.getAllWindows().length,
  registerReadyServices: (quitHandshake, onQuitConfirmed) => {
    if (app.isPackaged && process.platform === 'darwin') {
      let nativePackage:
        | { phase: 'idle' }
        | { phase: 'staging' | 'installing'; version: string; retryWaiting: boolean }
        | { phase: 'staged'; version: string } = { phase: 'idle' }
      const install = () => {
        const version = appUpdates?.getVersion()
        if (!version) throw new Error('No downloaded update version.')
        // Native callbacks carry no request ID. Keep at most one outstanding operation across timeouts.
        if (nativePackage.phase === 'staging' || nativePackage.phase === 'installing') {
          nativePackage.retryWaiting = true
          return
        }
        const staged = nativePackage.phase === 'staged' && nativePackage.version === version
        nativePackage = { phase: staged ? 'installing' : 'staging', version, retryWaiting: false }
        try {
          if (staged) appUpdates!.handOffToInstaller(() => nativeUpdater.quitAndInstall())
          else nativeUpdater.checkForUpdates()
        } catch (error) {
          nativePackage = staged ? { phase: 'staged', version } : { phase: 'idle' }
          throw error
        }
      }
      autoUpdater.autoInstallOnAppQuit = false
      autoUpdater.autoDownload = true
      autoUpdater.allowPrerelease = false
      autoUpdater.allowDowngrade = false
      autoUpdater.disableDifferentialDownload = true
      appUpdates = new AppUpdates({
        check: async () => {
          const result = await autoUpdater.checkForUpdates()
          await result?.downloadPromise
        },
        install,
        canInstall: () =>
          !!mainWindow &&
          !mainWindow.isDestroyed() &&
          !mainWindow.webContents.isLoadingMainFrame() &&
          !rendererModalOpen &&
          !appUpdateBlocked &&
          notesArchive?.isIdle?.() === true &&
          notesMenuState.canImport,
        prepareQuit: () => quitControl.prepareUpdateQuit(),
        requestSave: (id) => mainWindow?.webContents.send(ipcEvents.appUpdateRequested, id),
        finished: (message) => mainWindow?.webContents.send(ipcEvents.appUpdateFinished, message),
        changed: rebuildApplicationMenu,
        progressChanged: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(ipcEvents.updateCommandsChanged, getUpdateCommands())
          }
        },
        notifyCheck: async (result) => {
          if (!mainWindow || mainWindow.isDestroyed() || quitControl.isQuitting()) return
          await dialog.showMessageBox(mainWindow, {
            type: result === 'failed' ? 'warning' : 'info',
            message:
              result === 'ready'
                ? 'An update is ready to install.'
                : result === 'failed'
                  ? 'Could not check for updates.'
                  : 'Tree is up to date.',
            detail:
              result === 'ready'
                ? `Choose Tree > Restart and Install ${appUpdates?.getVersion()} to save your work and restart with the new version.`
                : result === 'failed'
                  ? 'Check your Internet connection and try again.'
                  : `You are using Tree ${app.getVersion()}.`,
            buttons: ['OK'],
            defaultId: 0,
            cancelId: 0,
          })
        },
      })
      // Start native staging only after explicit consent and a successful save. Keep one
      // listener rather than MacUpdater.quitAndInstall's accumulating deferred callbacks.
      autoUpdater.on('update-downloaded', (info) => appUpdates?.downloaded(info.version))
      autoUpdater.on('update-available', () => appUpdates?.available())
      autoUpdater.on('download-progress', (progress) => appUpdates?.downloading(progress.percent))
      const finishNativeOperation = (downloaded: boolean) => {
        if (nativePackage.phase !== 'staging' && nativePackage.phase !== 'installing') return
        const { phase, version, retryWaiting } = nativePackage
        nativePackage = downloaded || phase === 'installing' ? { phase: 'staged', version } : { phase: 'idle' }
        if (appUpdates?.isInstalling()) {
          if (!downloaded && !retryWaiting) {
            appUpdates.fail('Update failed. Try Restart and Install again.')
            return
          }
          try {
            install()
          } catch {
            appUpdates.fail('Update failed. Try Restart and Install again.')
          }
        }
      }
      nativeUpdater.on('update-downloaded', () => {
        if (nativePackage.phase === 'staging') finishNativeOperation(true)
      })
      nativeUpdater.on('update-not-available', () => {
        if (nativePackage.phase === 'staging') finishNativeOperation(false)
      })
      // MacUpdater forwards this same Error to the provider emitter synchronously.
      const nativeErrors = new WeakSet<Error>()
      nativeUpdater.prependListener('error', (error: Error) => {
        nativeErrors.add(error)
        finishNativeOperation(false)
      })
      autoUpdater.on('error', (error) => {
        if (!nativeErrors.delete(error)) appUpdates?.fail('Update failed. Try Restart and Install again.')
      })
      app.on('before-quit', () => appUpdates?.cancelBeforeNativeQuit())
      void appUpdates.check()
    }
    const resolvedRenderer = resolveRendererUrl(
      app.isPackaged,
      process.env['ELECTRON_RENDERER_URL'],
      packagedRendererUrl,
    )
    renderer = resolvedRenderer
    handleRendererProtocol(protocol, packagedRendererDirectory, (path) => readFile(path))
    configureRendererSessionSecurity(session.defaultSession, resolvedRenderer)
    configureWebContentsSecurity(app, resolvedRenderer.url, (url) => {
      void shell
        .openExternal(url)
        .catch((error: unknown) => reportMainProcessError('Could not open external link', error))
    })
    const dataDirectory = join(app.getPath('userData'), 'data')
    const fileServices = createFileServices(dataDirectory, undefined, {
      userDataDirectory: app.getPath('userData'),
    })
    const decodePng = createPngDecoder(nativeImage)
    const imageToText =
      process.platform === 'darwin' && process.arch === 'arm64'
        ? createImageToText(
            app.isPackaged
              ? join(process.resourcesPath, '../Helpers/tree-image-to-text')
              : join(__dirname, '../native/tree-image-to-text'),
          )
        : undefined
    app.on('will-quit', () => imageToText?.cancel())
    notesArchive = createNotesArchiveController({
      fileServices,
      attachmentsDirectory: join(dataDirectory, 'attachments'),
      // Attached to the window, the panels open as sheets.
      dialogs: {
        showSaveDialog: (options) =>
          mainWindow === null ? dialog.showSaveDialog(options) : dialog.showSaveDialog(mainWindow, options),
        showOpenDialog: (options) =>
          mainWindow === null ? dialog.showOpenDialog(options) : dialog.showOpenDialog(mainWindow, options),
      },
      startWorker: (task) => new Worker(join(__dirname, 'notes-archive-worker.js'), { workerData: task }),
      decodePng,
      sendProgress: (progress) => mainWindow?.webContents.send(ipcEvents.notesProgress, progress),
      showItemInFolder: (path) => shell.showItemInFolder(path),
      homeDirectory: app.getPath('home'),
    })
    const commandHistory = createCommandHistoryStore(join(app.getPath('userData'), 'data', 'command-history.json'))
    const emojiHistory = createEmojiHistoryStore(join(app.getPath('userData'), 'data', 'emoji-history.json'))
    alwaysOnTopStore = createBooleanPreferenceStore(join(app.getPath('userData'), 'data', 'window-always-on-top.json'))
    vimEnabledStore = createBooleanPreferenceStore(join(app.getPath('userData'), 'data', 'vim-enabled.json'))
    lineNumbersStore = createBooleanPreferenceStore(join(app.getPath('userData'), 'data', 'line-numbers.json'))
    appearanceStore = createAppearancePreferenceStore(join(app.getPath('userData'), 'data', 'appearance.json'))
    // Leave the default untouched for Automatic so the system appearance applies as Electron starts it.
    const savedAppearance = appearanceStore.load()
    selectedAppearance = savedAppearance
    if (savedAppearance !== 'system') {
      nativeTheme.themeSource = appearanceThemeSource(savedAppearance)
    }
    registerIpcHandlers({
      ...(imageToText === undefined ? {} : { imageToText }),
      getUpdateCommands,
      runUpdateCommand: (command) => {
        const item = Menu.getApplicationMenu()?.getMenuItemById(command)
        if (item?.enabled) item.click(item, mainWindow ?? undefined, { triggeredByAccelerator: false })
      },
      setRendererModalOpen: (open) => {
        rendererModalOpen = open
        rebuildApplicationMenu()
      },
      setAppUpdateBlocked: (blocked) => {
        appUpdateBlocked = blocked
        rebuildApplicationMenu()
      },
      ...(appUpdates ? { appUpdates } : {}),
      getAppearance: currentAppearance,
      setAppearance,
      getCommandHistory: commandHistory.load,
      getEmojiHistory: emojiHistory.load,
      setEmojiHistory: emojiHistory.save,
      setCommandHistory: commandHistory.save,
      ipcMain,
      rendererUrl: resolvedRenderer.url,
      fileServices,
      nativeClipboard,
      quitHandshake,
      decodePng,
      onQuitConfirmed,
      showEditorContextMenu: (sender, request) => {
        const window = BrowserWindow.fromWebContents(sender)
        if (window === null) return Promise.resolve(null)
        return showEditorContextMenu(
          Menu,
          window,
          sender,
          (url) => shell.openExternal(url),
          (error) => reportMainProcessError('Could not open Google search', error),
          request,
        )
      },
      getAlwaysOnTop: isAlwaysOnTop,
      setAlwaysOnTop: (value) => {
        mainWindow?.setAlwaysOnTop(value)
        alwaysOnTopStore?.save(value)
        rebuildApplicationMenu()
      },
      getVimEnabled: isVimEnabled,
      getLineNumbers: () => lineNumbersStore?.load() ?? false,
      setLineNumbers: (value) => lineNumbersStore?.save(value),
      setVimEnabled: (value) => {
        vimEnabledStore?.save(value)
        rebuildApplicationMenu()
      },
      notesArchive,
      setNotesMenuState: (value) => {
        if (notesMenuState.canExport === value.canExport && notesMenuState.canImport === value.canImport) return
        notesMenuState = value
        rebuildApplicationMenu()
      },
    })
  },
  registerShortcut: (surface) => globalShortcut.register('CommandOrControl+0', surface),
  surfaceWindow: () => surfaceWindow(mainWindow),
  setApplicationMenu: (requestQuit) => {
    requestQuitFromMenu = requestQuit
    rebuildApplicationMenu()
  },
  unregisterShortcut: () => globalShortcut.unregister('CommandOrControl+0'),
  onStartupError: (error) => {
    reportMainProcessError('Could not start the application', error)
    // Startup fails before the renderer loads a document, so no save can be confirmed.
    quitControl.quitWithoutSave()
  },
  settleBeforeQuit: () => notesArchive?.shutdown() ?? null,
  registerQuitControl: (control) => {
    quitControl = control
  },
})
