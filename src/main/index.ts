import {
  app,
  BrowserWindow,
  ClipboardItem,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  session,
  shell,
} from 'electron'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { NativeClipboard } from '../infrastructure/main/clipboard'
import { createFileServices } from '../infrastructure/main/file-services'
import {
  createDebouncedWindowBoundsSaver,
  createAppearancePreferenceStore,
  createBooleanPreferenceStore,
  createWindowBoundsStore,
  type AppearancePreference,
  type AppearancePreferenceStore,
  type BooleanPreferenceStore,
  type WindowBounds,
} from '../infrastructure/main/window-state'
import { ipcEvents } from '../shared/ipc'
import { applicationMenuTemplate } from './application-menu'
import { registerIpcHandlers } from './ipc-handlers'
import { showEditorContextMenu } from './editor-context-menu'
import { bootstrapApplication } from './bootstrap'
import { createPngDecoder } from './png-decoder'
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

let mainWindow: BrowserWindow | null = null
let appQuitting = false
let alwaysOnTopStore: BooleanPreferenceStore | null = null
let vimEnabledStore: BooleanPreferenceStore | null = null
let appearanceStore: AppearancePreferenceStore | null = null
let requestQuitFromMenu: () => void = () => undefined
const packagedRendererPath = join(__dirname, '../renderer/index.html')
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

function rebuildApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      applicationMenuTemplate(
        { vimEnabled: isVimEnabled(), alwaysOnTop: isAlwaysOnTop(), appearance: currentAppearance() },
        {
          requestQuit: requestQuitFromMenu,
          setAppearance: (value) => {
            appearanceStore?.save(value)
            // The renderer's prefers-color-scheme and the native window background follow themeSource.
            nativeTheme.themeSource = value
            rebuildApplicationMenu()
          },
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
      ),
    ),
  )
}

function createMainWindow(): void {
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
  const load = resolvedRenderer.isDevelopment
    ? window.loadURL(resolvedRenderer.url)
    : window.loadFile(fileURLToPath(resolvedRenderer.url))
  void load.catch((error: unknown) => {
    reportMainProcessError('Could not load the renderer', error)
    appQuitting = true
    app.quit()
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
      pathToFileURL(packagedRendererPath).toString(),
    )
    renderer = resolvedRenderer
    configureRendererSessionSecurity(session.defaultSession, resolvedRenderer)
    configureWebContentsSecurity(app, resolvedRenderer.url, (url) => {
      void shell
        .openExternal(url)
        .catch((error: unknown) => reportMainProcessError('Could not open external link', error))
    })
    const fileServices = createFileServices(join(app.getPath('userData'), 'data'))
    alwaysOnTopStore = createBooleanPreferenceStore(join(app.getPath('userData'), 'data', 'window-always-on-top.json'))
    vimEnabledStore = createBooleanPreferenceStore(join(app.getPath('userData'), 'data', 'vim-enabled.json'))
    appearanceStore = createAppearancePreferenceStore(join(app.getPath('userData'), 'data', 'appearance.json'))
    // Leave the default untouched for Automatic so the system appearance applies as Electron starts it.
    const savedAppearance = appearanceStore.load()
    if (savedAppearance !== 'system') nativeTheme.themeSource = savedAppearance
    registerIpcHandlers({
      ipcMain,
      rendererUrl: resolvedRenderer.url,
      fileServices,
      nativeClipboard,
      quitHandshake,
      decodePng: createPngDecoder(nativeImage),
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
})
