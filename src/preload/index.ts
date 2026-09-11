import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels, type TreeApi } from '../shared/ipc'

const treeApi: TreeApi = {
  load: () => ipcRenderer.invoke(ipcChannels.load),
  save: (state) => ipcRenderer.invoke(ipcChannels.save, state),
  readClipboard: () => ipcRenderer.invoke(ipcChannels.readClipboard),
  writeAttachment: (id, png) => ipcRenderer.invoke(ipcChannels.writeAttachment, id, png),
  readAttachment: (id) => ipcRenderer.invoke(ipcChannels.readAttachment, id),
  cleanupAttachments: (referencedIds) => ipcRenderer.invoke(ipcChannels.cleanupAttachments, referencedIds),
}

contextBridge.exposeInMainWorld('treeApi', treeApi)
