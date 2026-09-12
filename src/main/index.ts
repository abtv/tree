import { app, BrowserWindow, ClipboardItem, clipboard, globalShortcut, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { NativeClipboard } from '../infrastructure/main/clipboard'
import { createFileServices } from '../infrastructure/main/file-services'
import { registerIpcHandlers } from './ipc-handlers'
import { isAllowedExternalUrl, isAllowedRendererUrl, surfaceWindow } from './window'
import { QuitHandshake } from './quit-handshake'

let mainWindow: BrowserWindow | null = null
let appQuitting = false
const quitHandshake = new QuitHandshake(
  (requestId) => mainWindow?.webContents.send('tree:quit-requested', requestId),
  () => mainWindow?.webContents.send('tree:quit-failed', 'The application could not finish saving before quit.'),
  () => app.quit(),
)

app.on('before-quit', (event) => {
  if (!appQuitting && mainWindow !== null && !mainWindow.isDestroyed()) {
    event.preventDefault()
    quitHandshake.request()
    return
  }
  appQuitting = true
  mainWindow = null
  globalShortcut.unregister('CommandOrControl+0')
})

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
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.on('close', () => {
    if (mainWindow === window) mainWindow = null
  })

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  const fileServices = createFileServices(join(app.getPath('userData'), 'data'))
  const rendererUrl =
    process.env['ELECTRON_RENDERER_URL'] ?? pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
  registerIpcHandlers({
    ipcMain,
    rendererUrl,
    fileServices,
    nativeClipboard,
    quitHandshake,
    onQuitConfirmed: () => {
      appQuitting = true
    },
  })
  globalShortcut.register('CommandOrControl+0', () => surfaceWindow(mainWindow))
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Tree',
        submenu: [
          {
            label: 'Quit Tree',
            accelerator: 'CommandOrControl+Q',
            click: () => quitHandshake.request(),
          },
        ],
      },
    ]),
  )
  createMainWindow()

  app.on('activate', () => {
    if (!appQuitting && BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
