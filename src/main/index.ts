import { app, BrowserWindow, clipboard, globalShortcut, ipcMain } from 'electron'
import { join } from 'node:path'
import { readClipboard } from '../infrastructure/main/clipboard'
import { createFileServices } from '../infrastructure/main/file-services'
import { ipcChannels } from '../shared/ipc'
import { surfaceWindow } from './window'

let mainWindow: BrowserWindow | null = null

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: 'Tree',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  const fileServices = createFileServices(join(app.getPath('userData'), 'data'))
  ipcMain.handle(ipcChannels.load, () => fileServices.load())
  ipcMain.handle(ipcChannels.save, (_event, state) => fileServices.save(state))
  ipcMain.handle(ipcChannels.readClipboard, () => readClipboard(clipboard))
  ipcMain.handle(ipcChannels.writeAttachment, (_event, id, png) => fileServices.writeAttachment(id, png))
  ipcMain.handle(ipcChannels.hasAttachment, (_event, id) => fileServices.hasAttachment(id))
  ipcMain.handle(ipcChannels.readAttachment, (_event, id) => fileServices.readAttachment(id))
  ipcMain.handle(ipcChannels.cleanupAttachments, (_event, referencedIds) =>
    fileServices.cleanupAttachments(referencedIds),
  )
  globalShortcut.register('CommandOrControl+0', () => surfaceWindow(mainWindow))
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregister('CommandOrControl+0')
})
