import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels, type TreeApi } from '../shared/ipc'

const treeApi: TreeApi = {
  quit: () => ipcRenderer.invoke(ipcChannels.quit),
  onQuitRequested: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on('tree:quit-requested', handler)
    return () => ipcRenderer.removeListener('tree:quit-requested', handler)
  },
  load: () => ipcRenderer.invoke(ipcChannels.load),
  save: (state) => ipcRenderer.invoke(ipcChannels.save, state),
  readClipboard: () => ipcRenderer.invoke(ipcChannels.readClipboard),
  writeClipboard: (payload) => ipcRenderer.invoke(ipcChannels.writeClipboard, payload),
  writeAttachment: (id, png) => ipcRenderer.invoke(ipcChannels.writeAttachment, id, png),
  hasAttachment: (id) => ipcRenderer.invoke(ipcChannels.hasAttachment, id),
  readAttachment: (id) => ipcRenderer.invoke(ipcChannels.readAttachment, id),
  cleanupAttachments: (referencedIds) => ipcRenderer.invoke(ipcChannels.cleanupAttachments, referencedIds),
}

contextBridge.exposeInMainWorld('treeApi', treeApi)
