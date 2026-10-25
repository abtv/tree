import {
  app,
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
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { NativeClipboard } from '../../infrastructure/main/clipboard'
import { createFileServices } from '../../infrastructure/main/file-services'
import { createCommandHistoryStore } from '../../infrastructure/main/command-history'
import {
  createDebouncedWindowBoundsSaver,
  createAppearancePreferenceStore,
  createBooleanPreferenceStore,
  createWindowBoundsStore,
  type AppearancePreference,
  type AppearancePreferenceStore,
  type BooleanPreferenceStore,
  type WindowBounds,
} from '../../infrastructure/main/window-state'
import { ipcEvents, type NotesMenuState } from '../../shared/ipc'
import { applicationMenuTemplate } from './application-menu'
import { createMenuIcons, type MenuIcons } from './menu-icons'
import { registerIpcHandlers } from './ipc-handlers'
import { showEditorContextMenu } from './editor-context-menu'
import { bootstrapApplication } from './bootstrap'
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
let appQuitting = false
let alwaysOnTopStore: BooleanPreferenceStore | null = null
let vimEnabledStore: BooleanPreferenceStore | null = null
let appearanceStore: AppearancePreferenceStore | null = null
let requestQuitFromMenu: () => void = () => undefined
let notesArchive: NotesArchiveController | null = null
let notesMenuState: NotesMenuState = { canExport: false, canImport: false }
const packagedRendererDirectory = join(__dirname, '../renderer')
let renderer: ReturnType<typeof resolveRendererUrl> | null = null

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
  return appearanceStore?.load() ?? 'system'
}

function setAppearance(value: AppearancePreference): void {
  appearanceStore?.save(value)
  nativeTheme.themeSource = value
  mainWindow?.webContents.send(ipcEvents.appearanceChanged, value)
  rebuildApplicationMenu()
}

let menuIcons: MenuIcons | undefined

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
        },
        {
          requestQuit: requestQuitFromMenu,
          viewCommand: (command) => {
            if (mainWindow !== null && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoadingMainFrame()) {
              mainWindow.webContents.send(ipcEvents.viewMenuCommand, command)
            }
          },
          notesCommand: (command) => {
            if (command === 'export' ? notesMenuState.canExport : notesMenuState.canImport) {
              mainWindow?.webContents.send(ipcEvents.notesMenuCommand, command)
            }
          },
          setAppearance,
          setVimEnabled: (value) => {
            vimEnabledStore?.save(value)
            mainWindow?.webContents.send(ipcEvents.vimEnabledChanged, value)
          },
          setAlwaysOnTop: (value) => {
            mainWindow?.setAlwaysOnTop(value)
            alwaysOnTopStore?.save(value)
            mainWindow?.webContents.send(ipcEvents.alwaysOnTopChanged, value)
          },
        },
        menuIcons,
      ),
    ),
  )
}

function createMainWindow(quitWithoutSave: () => void): void {
  if (appQuitting) return
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
    backgroundColor: windowBackgroundColor(nativeTheme.shouldUseDarkColors),
    webPreferences: createWindowWebPreferences(join(__dirname, '../preload/index.js')),
  })
  window.setAlwaysOnTop(windowAlwaysOnTopStore.load())
  followWindowAppearance(window, nativeTheme)
  mainWindow = window
  const resetNotesMenu = (): void => {
    notesMenuState = { canExport: false, canImport: false }
    rebuildApplicationMenu()
    void notesArchive
      ?.cancel()
      .catch((error: unknown) => reportMainProcessError('Could not cancel notes operation', error))
  }
  window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) resetNotesMenu()
  })
  window.webContents.on('render-process-gone', resetNotesMenu)
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
    if (mainWindow === window) mainWindow = null
  })
  void window.loadURL(resolvedRenderer.url).catch((error: unknown) => {
    reportMainProcessError('Could not load the renderer', error)
    appQuitting = true
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
    alwaysOnTopStore = createBooleanPreferenceStore(join(app.getPath('userData'), 'data', 'window-always-on-top.json'))
    vimEnabledStore = createBooleanPreferenceStore(join(app.getPath('userData'), 'data', 'vim-enabled.json'))
    appearanceStore = createAppearancePreferenceStore(join(app.getPath('userData'), 'data', 'appearance.json'))
    // Leave the default untouched for Automatic so the system appearance applies as Electron starts it.
    const savedAppearance = appearanceStore.load()
    if (savedAppearance !== 'system') nativeTheme.themeSource = savedAppearance
    registerIpcHandlers({
      getAppearance: currentAppearance,
      setAppearance,
      getCommandHistory: commandHistory.load,
      getRecentNodes: () => fileServices.loadRecentNodes!(),
      setRecentNodes: (ids) => fileServices.saveRecentNodes!(ids),
      setCommandHistory: commandHistory.save,
      ipcMain,
      rendererUrl: resolvedRenderer.url,
      fileServices,
      nativeClipboard,
      quitHandshake,
      decodePng,
      onQuitConfirmed: () => {
        appQuitting = true
        onQuitConfirmed()
      },
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
    appQuitting = true
    app.quit()
  },
  settleBeforeQuit: () => notesArchive?.shutdown() ?? null,
})
