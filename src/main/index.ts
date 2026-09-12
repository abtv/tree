import { app, BrowserWindow, ClipboardItem, clipboard, globalShortcut, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { readClipboard, writeClipboard } from '../infrastructure/main/clipboard'
import type { NativeClipboard } from '../infrastructure/main/clipboard'
import { createFileServices } from '../infrastructure/main/file-services'
import { ipcChannels } from '../shared/ipc'
import { isAllowedExternalUrl, surfaceWindow } from './window'

let mainWindow: BrowserWindow | null = null
let appQuitting = false

app.on('before-quit', () => {
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

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']

  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  const fileServices = createFileServices(join(app.getPath('userData'), 'data'))
  ipcMain.handle(ipcChannels.load, () => fileServices.load())
  ipcMain.handle(ipcChannels.save, (_event, state) => fileServices.save(state))
  ipcMain.handle(ipcChannels.readClipboard, () => readClipboard(nativeClipboard))
  ipcMain.handle(ipcChannels.writeClipboard, (_event, payload) => writeClipboard(nativeClipboard, payload))
  ipcMain.handle(ipcChannels.writeAttachment, (_event, id, png) => fileServices.writeAttachment(id, png))
  ipcMain.handle(ipcChannels.hasAttachment, (_event, id) => fileServices.hasAttachment(id))
  ipcMain.handle(ipcChannels.readAttachment, (_event, id) => fileServices.readAttachment(id))
  ipcMain.handle(ipcChannels.cleanupAttachments, (_event, referencedIds) =>
    fileServices.cleanupAttachments(referencedIds),
  )
  globalShortcut.register('CommandOrControl+0', () => surfaceWindow(mainWindow))
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Tree',
        submenu: [{ role: 'quit' }],
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
