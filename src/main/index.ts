import { app, BrowserWindow, ClipboardItem, clipboard, globalShortcut, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readClipboard, writeClipboard } from '../infrastructure/main/clipboard'
import type { NativeClipboard } from '../infrastructure/main/clipboard'
import { createFileServices } from '../infrastructure/main/file-services'
import { ipcChannels } from '../shared/ipc'
import {
  validateAttachmentBytes,
  validateAttachmentId,
  validateAttachmentIds,
  validateClipboardWritePayload,
  validatePersistedEditorState,
  isTrustedRendererUrl,
} from './ipc-security'
import { isAllowedExternalUrl, isAllowedRendererUrl, surfaceWindow } from './window'

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
  const requireTrustedRenderer = (event: Electron.IpcMainInvokeEvent): void => {
    if (!isTrustedRendererUrl(event.senderFrame?.url, rendererUrl)) throw new Error('Untrusted renderer IPC call.')
  }
  ipcMain.handle(ipcChannels.quit, (event) => {
    requireTrustedRenderer(event)
    return app.quit()
  })
  ipcMain.handle(ipcChannels.load, (event) => {
    requireTrustedRenderer(event)
    return fileServices.load()
  })
  ipcMain.handle(ipcChannels.save, (event, state) => {
    requireTrustedRenderer(event)
    return fileServices.save(validatePersistedEditorState(state))
  })
  ipcMain.handle(ipcChannels.readClipboard, (event) => {
    requireTrustedRenderer(event)
    return readClipboard(nativeClipboard)
  })
  ipcMain.handle(ipcChannels.writeClipboard, (event, payload) => {
    requireTrustedRenderer(event)
    return writeClipboard(nativeClipboard, validateClipboardWritePayload(payload))
  })
  ipcMain.handle(ipcChannels.writeAttachment, (event, id, png) => {
    requireTrustedRenderer(event)
    return fileServices.writeAttachment(validateAttachmentId(id), validateAttachmentBytes(png))
  })
  ipcMain.handle(ipcChannels.hasAttachment, (event, id) => {
    requireTrustedRenderer(event)
    return fileServices.hasAttachment(validateAttachmentId(id))
  })
  ipcMain.handle(ipcChannels.readAttachment, (event, id) => {
    requireTrustedRenderer(event)
    return fileServices.readAttachment(validateAttachmentId(id))
  })
  ipcMain.handle(ipcChannels.cleanupAttachments, (event, referencedIds) => {
    requireTrustedRenderer(event)
    return fileServices.cleanupAttachments(validateAttachmentIds(referencedIds))
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
            click: () => app.quit(),
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
