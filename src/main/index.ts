import { app, BrowserWindow, ClipboardItem, clipboard, globalShortcut, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { NativeClipboard } from '../infrastructure/main/clipboard'
import { createFileServices } from '../infrastructure/main/file-services'
import { registerIpcHandlers } from './ipc-handlers'
import { bootstrapApplication } from './bootstrap'
import {
  configureSingleInstance,
  isAllowedExternalUrl,
  isAllowedRendererUrl,
  reportMainProcessError,
  surfaceWindow,
} from './window'

let mainWindow: BrowserWindow | null = null
let appQuitting = false

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
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 640,
    minHeight: 480,
    title: 'Tree',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = window
  const rendererUrl =
    process.env['ELECTRON_RENDERER_URL'] ?? pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(url, rendererUrl)) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell
        .openExternal(url)
        .catch((error: unknown) => reportMainProcessError('Could not open external link', error))
    }
    return { action: 'deny' }
  })
  window.on('close', () => {
    if (mainWindow === window) mainWindow = null
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })
  const load = process.env['ELECTRON_RENDERER_URL']
    ? window.loadURL(rendererUrl)
    : window.loadFile(join(__dirname, '../renderer/index.html'))
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
    const rendererUrl =
      process.env['ELECTRON_RENDERER_URL'] ?? pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
    const fileServices = createFileServices(join(app.getPath('userData'), 'data'))
    registerIpcHandlers({
      ipcMain,
      rendererUrl,
      fileServices,
      nativeClipboard,
      quitHandshake,
      onQuitConfirmed: () => {
        appQuitting = true
        onQuitConfirmed()
      },
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
