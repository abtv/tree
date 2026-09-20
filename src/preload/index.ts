import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels, type TreeApi } from '../shared/ipc'

export const treeApi: TreeApi = {
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
  writeAttachment: (id, png) => ipcRenderer.invoke(ipcChannels.writeAttachment, id, png),
  readAttachment: (id) => ipcRenderer.invoke(ipcChannels.readAttachment, id),
  cleanupAttachments: (referencedIds) => ipcRenderer.invoke(ipcChannels.cleanupAttachments, referencedIds),
  showEditorContextMenu: (request) => ipcRenderer.invoke(ipcChannels.showEditorContextMenu, request),
}

contextBridge.exposeInMainWorld('treeApi', treeApi)
