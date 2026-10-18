import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels, ipcEvents, type TreeApi } from '../../shared/ipc'

export const treeApi: TreeApi = {
  getAppearance: () => ipcRenderer.invoke(ipcChannels.getAppearance),
  setAppearance: (value) => ipcRenderer.invoke(ipcChannels.setAppearance, value),
  getCommandHistory: () => ipcRenderer.invoke(ipcChannels.getCommandHistory),
  setCommandHistory: (value) => ipcRenderer.invoke(ipcChannels.setCommandHistory, value),
  onAppearanceChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: 'system' | 'light' | 'dark'): void => listener(value)
    ipcRenderer.on(ipcEvents.appearanceChanged, handler)
    return () => ipcRenderer.removeListener(ipcEvents.appearanceChanged, handler)
  },
  quit: (requestId) => ipcRenderer.invoke(ipcChannels.quit, requestId),
  quitWithoutSaving: () => ipcRenderer.invoke(ipcChannels.quitWithoutSaving),
  onQuitRequested: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, requestId: string): void => listener(requestId)
    ipcRenderer.on('tree:quit-requested', handler)
    return () => ipcRenderer.removeListener('tree:quit-requested', handler)
  },
  onQuitFailed: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string): void => listener(message)
    ipcRenderer.on('tree:quit-failed', handler)
    return () => ipcRenderer.removeListener('tree:quit-failed', handler)
  },
  load: () => ipcRenderer.invoke(ipcChannels.load),
  save: (state) => ipcRenderer.invoke(ipcChannels.save, state),
  readClipboard: () => ipcRenderer.invoke(ipcChannels.readClipboard),
  writeClipboard: (payload) => ipcRenderer.invoke(ipcChannels.writeClipboard, payload),
  writeClipboardContent: (payload) => ipcRenderer.invoke(ipcChannels.writeClipboardContent, payload),
  writeAttachment: (id, png) => ipcRenderer.invoke(ipcChannels.writeAttachment, id, png),
  readAttachment: (id) => ipcRenderer.invoke(ipcChannels.readAttachment, id),
  cleanupAttachments: (referencedIds) => ipcRenderer.invoke(ipcChannels.cleanupAttachments, referencedIds),
  showEditorContextMenu: (request) => ipcRenderer.invoke(ipcChannels.showEditorContextMenu, request),
  getAlwaysOnTop: () => ipcRenderer.invoke(ipcChannels.getAlwaysOnTop),
  setAlwaysOnTop: (alwaysOnTop) => ipcRenderer.invoke(ipcChannels.setAlwaysOnTop, alwaysOnTop),
  getVimEnabled: () => ipcRenderer.invoke(ipcChannels.getVimEnabled),
  setVimEnabled: (vimEnabled) => ipcRenderer.invoke(ipcChannels.setVimEnabled, vimEnabled),
  onAlwaysOnTopChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: boolean): void => listener(value)
    ipcRenderer.on(ipcEvents.alwaysOnTopChanged, handler)
    return () => ipcRenderer.removeListener(ipcEvents.alwaysOnTopChanged, handler)
  },
  onVimEnabledChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: boolean): void => listener(value)
    ipcRenderer.on(ipcEvents.vimEnabledChanged, handler)
    return () => ipcRenderer.removeListener(ipcEvents.vimEnabledChanged, handler)
  },
}

contextBridge.exposeInMainWorld('treeApi', treeApi)
