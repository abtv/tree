import { contextBridge, ipcRenderer } from 'electron'
import {
  ipcChannels,
  ipcEvents,
  type NotesArchiveProgress,
  type NotesMenuCommand,
  type TreeApi,
  type ViewMenuCommand,
} from '../../shared/ipc'

export const treeApi: TreeApi = {
  summarization: {
    available: () => ipcRenderer.invoke(ipcChannels.summaryAvailable),
    begin: (id) => ipcRenderer.invoke(ipcChannels.summaryBegin, id),
    reduce: (id, text, final) => ipcRenderer.invoke(ipcChannels.summaryReduce, id, text, final),
    finish: (id, text) => ipcRenderer.invoke(ipcChannels.summaryFinish, id, text),
    cancel: (id) => ipcRenderer.invoke(ipcChannels.summaryCancel, id),
  },
  ...(process.platform === 'darwin' && process.arch === 'arm64'
    ? { imageToText: (id: string) => ipcRenderer.invoke(ipcChannels.imageToText, id) }
    : {}),
  getUpdateCommands: () => ipcRenderer.invoke(ipcChannels.getUpdateCommands),
  runUpdateCommand: (command) => ipcRenderer.invoke(ipcChannels.runUpdateCommand, command),
  onUpdateCommandsChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown): void => {
      if (
        state &&
        typeof state === 'object' &&
        'check-for-updates' in state &&
        'update-app' in state &&
        typeof state['check-for-updates'] === 'boolean' &&
        typeof state['update-app'] === 'boolean'
      ) {
        const status = 'status' in state ? state.status : undefined
        if (
          status !== undefined &&
          status !== null &&
          status !== 'ready' &&
          status !== 'failed' &&
          status !== 'installing' &&
          !(typeof status === 'number' && Number.isInteger(status) && status >= 0 && status <= 100)
        )
          return
        const version = 'version' in state ? state.version : undefined
        if (
          version !== undefined &&
          !(typeof version === 'string' && version.length <= 128 && /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version))
        )
          return
        listener({
          'check-for-updates': state['check-for-updates'],
          'update-app': state['update-app'],
          ...(status !== undefined ? { status } : {}),
          ...(version !== undefined ? { version } : {}),
        })
      }
    }
    ipcRenderer.on(ipcEvents.updateCommandsChanged, handler)
    return () => ipcRenderer.removeListener(ipcEvents.updateCommandsChanged, handler)
  },
  setAppUpdateBlocked: (blocked) => ipcRenderer.invoke(ipcChannels.setAppUpdateBlocked, blocked),
  checkAppUpdate: () => ipcRenderer.invoke(ipcChannels.checkAppUpdate),
  confirmAppUpdate: (id, saved) => ipcRenderer.invoke(ipcChannels.confirmAppUpdate, id, saved),
  onAppUpdateRequested: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, id: unknown): void => {
      if (typeof id === 'string') listener(id)
    }
    ipcRenderer.on(ipcEvents.appUpdateRequested, handler)
    return () => ipcRenderer.removeListener(ipcEvents.appUpdateRequested, handler)
  },
  onAppUpdateFinished: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, message: unknown): void => {
      if (message === null || typeof message === 'string') listener(message)
    }
    ipcRenderer.on(ipcEvents.appUpdateFinished, handler)
    return () => ipcRenderer.removeListener(ipcEvents.appUpdateFinished, handler)
  },
  onFindMenuCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: unknown): void => {
      if (command === 'find' || command === 'next' || command === 'previous' || command === 'all') listener(command)
    }
    ipcRenderer.on(ipcEvents.findMenuCommand, handler)
    return () => ipcRenderer.removeListener(ipcEvents.findMenuCommand, handler)
  },
  onViewMenuCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: ViewMenuCommand): void => {
      if (command === 'tree' || command === 'agenda') listener(command)
    }
    ipcRenderer.on(ipcEvents.viewMenuCommand, handler)
    return () => ipcRenderer.removeListener(ipcEvents.viewMenuCommand, handler)
  },
  getAppearance: () => ipcRenderer.invoke(ipcChannels.getAppearance),
  setAppearance: (value) => ipcRenderer.invoke(ipcChannels.setAppearance, value),
  getCommandHistory: () => ipcRenderer.invoke(ipcChannels.getCommandHistory),
  getEmojiHistory: () => ipcRenderer.invoke(ipcChannels.getEmojiHistory),
  setEmojiHistory: (value) => ipcRenderer.invoke(ipcChannels.setEmojiHistory, value),
  getRecentNodes: () => ipcRenderer.invoke(ipcChannels.getRecentNodes),
  setRecentNodes: (value) => ipcRenderer.invoke(ipcChannels.setRecentNodes, value),
  setCommandHistory: (value) => ipcRenderer.invoke(ipcChannels.setCommandHistory, value),
  onAppearanceChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: 'system' | 'light' | 'dark'): void => listener(value)
    ipcRenderer.on(ipcEvents.appearanceChanged, handler)
    return () => ipcRenderer.removeListener(ipcEvents.appearanceChanged, handler)
  },
  setAboutOpen: (open) => ipcRenderer.invoke(ipcChannels.setAboutOpen, open),
  onAboutRequested: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      if (args.length === 0) listener()
    }
    ipcRenderer.on(ipcEvents.aboutRequested, handler)
    return () => ipcRenderer.removeListener(ipcEvents.aboutRequested, handler)
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
  getLineNumbers: () => ipcRenderer.invoke(ipcChannels.getLineNumbers),
  setLineNumbers: (value) => ipcRenderer.invoke(ipcChannels.setLineNumbers, value),
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
  chooseNotesExportDestination: () => ipcRenderer.invoke(ipcChannels.chooseNotesExportDestination),
  startNotesExport: () => ipcRenderer.invoke(ipcChannels.startNotesExport),
  chooseNotesImportArchive: () => ipcRenderer.invoke(ipcChannels.chooseNotesImportArchive),
  prepareNotesImport: () => ipcRenderer.invoke(ipcChannels.prepareNotesImport),
  commitNotesImport: () => ipcRenderer.invoke(ipcChannels.commitNotesImport),
  cancelNotesOperation: () => ipcRenderer.invoke(ipcChannels.cancelNotesOperation),
  takeNotesImportNotice: () => ipcRenderer.invoke(ipcChannels.takeNotesImportNotice),
  showReplacedNotesFolder: () => ipcRenderer.invoke(ipcChannels.showReplacedNotesFolder),
  setNotesMenuState: (state) => ipcRenderer.invoke(ipcChannels.setNotesMenuState, state),
  onNotesMenuCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: NotesMenuCommand): void => listener(command)
    ipcRenderer.on(ipcEvents.notesMenuCommand, handler)
    return () => ipcRenderer.removeListener(ipcEvents.notesMenuCommand, handler)
  },
  onNotesProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: NotesArchiveProgress): void => listener(progress)
    ipcRenderer.on(ipcEvents.notesProgress, handler)
    return () => ipcRenderer.removeListener(ipcEvents.notesProgress, handler)
  },
}

contextBridge.exposeInMainWorld('treeApi', treeApi)
