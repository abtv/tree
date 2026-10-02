import {
  app,
  BrowserWindow,
  ClipboardItem,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  session,
  shell,
} from 'electron'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { NativeClipboard } from '../infrastructure/main/clipboard'
import { createFileServices } from '../infrastructure/main/file-services'
import {
  createDebouncedWindowBoundsSaver,
  createBooleanPreferenceStore,
  createWindowBoundsStore,
  type BooleanPreferenceStore,
  type WindowBounds,
} from '../infrastructure/main/window-state'
import { registerIpcHandlers } from './ipc-handlers'
import { showEditorContextMenu } from './editor-context-menu'
import { bootstrapApplication } from './bootstrap'
import { createPngDecoder } from './png-decoder'
import {
  configureSingleInstance,
  configureRendererSessionSecurity,
  configureWebContentsSecurity,
  createWindowWebPreferences,
  reportMainProcessError,
  resolveRendererUrl,
  surfaceWindow,
} from './window'

let mainWindow: BrowserWindow | null = null
let appQuitting = false
let alwaysOnTopStore: BooleanPreferenceStore | null = null
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
    webPreferences: createWindowWebPreferences(join(__dirname, '../preload/index.js')),
  })
  window.setAlwaysOnTop(windowAlwaysOnTopStore.load())
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
    const vimEnabledStore = createBooleanPreferenceStore(join(app.getPath('userData'), 'data', 'vim-enabled.json'))
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
      getAlwaysOnTop: () => mainWindow?.isAlwaysOnTop() ?? alwaysOnTopStore?.load() ?? false,
      setAlwaysOnTop: (value) => {
        mainWindow?.setAlwaysOnTop(value)
        alwaysOnTopStore?.save(value)
      },
      getVimEnabled: () => vimEnabledStore.load(),
      setVimEnabled: (value) => vimEnabledStore.save(value),
    })
  },
  registerShortcut: (surface) => globalShortcut.register('CommandOrControl+0', surface),
  surfaceWindow: () => surfaceWindow(mainWindow),
  setApplicationMenu: (requestQuit) =>
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'Tree',
          submenu: [{ label: 'Quit Tree', accelerator: 'CommandOrControl+Q', click: requestQuit }],
        },
      ]),
    ),
  unregisterShortcut: () => globalShortcut.unregister('CommandOrControl+0'),
  onStartupError: (error) => {
    reportMainProcessError('Could not start the application', error)
    appQuitting = true
    app.quit()
  },
})
