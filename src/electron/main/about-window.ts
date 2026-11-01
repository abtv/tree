import { BrowserWindow, nativeTheme } from 'electron'
import { followWindowAppearance, reportMainProcessError, windowBackgroundColor } from './window'

export interface AboutWindowController {
  show(): void
  isOpen(): boolean
}

export function createAboutWindowController(
  getParent: () => BrowserWindow | null,
  rendererUrl: string,
  onChange: () => void = () => undefined,
): AboutWindowController {
  let about: BrowserWindow | null = null

  const show = (): void => {
    const parent = getParent()
    if (parent === null || parent.isDestroyed()) return
    if (about !== null && !about.isDestroyed()) {
      about.focus()
      return
    }

    const window = new BrowserWindow({
      parent,
      modal: true,
      show: false,
      width: 340,
      height: 340,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'About Tree',
      titleBarStyle: 'hidden',
      backgroundColor: windowBackgroundColor(nativeTheme.shouldUseDarkColors),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    about = window
    followWindowAppearance(window, nativeTheme)
    window.once('ready-to-show', () => window.show())
    window.once('closed', () => {
      about = null
      onChange()
      if (!parent.isDestroyed()) parent.focus()
    })
    onChange()
    void window.loadURL(new URL('about.html', rendererUrl).href).catch((error: unknown) => {
      reportMainProcessError('Could not open About Tree', error)
      if (!window.isDestroyed()) window.close()
    })
  }

  return { show, isOpen: () => about !== null && !about.isDestroyed() }
}
