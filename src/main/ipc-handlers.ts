import type { QuitHandshake } from './quit-handshake'
import {
  validateAttachmentBytes,
  validateAttachmentId,
  validateAttachmentIds,
  validateClipboardWritePayload,
  validateClipboardContent,
  validateEditorContextMenuRequest,
  validatePersistedEditorState,
  isTrustedRendererUrl,
  type PngDecoder,
} from './ipc-security'
import { ipcChannels } from '../shared/ipc'
import type { FileServices } from '../infrastructure/main/file-services'
import { readClipboard, writeClipboard, type NativeClipboard } from '../infrastructure/main/clipboard'
import type { EditorContextMenuCommand, EditorContextMenuRequest } from '../shared/ipc'
import type { WebContents } from 'electron'

export interface IpcInvokeEvent {
  senderFrame?: { url?: string } | null
  sender?: WebContents
}

export interface IpcMain {
  handle(channel: string, listener: (event: IpcInvokeEvent, ...args: unknown[]) => unknown): void
}

export interface IpcHandlerDependencies {
  ipcMain: IpcMain
  rendererUrl: string
  fileServices: FileServices
  nativeClipboard: NativeClipboard
  quitHandshake: Pick<QuitHandshake, 'request' | 'confirm' | 'force'>
  decodePng: PngDecoder
  onQuitConfirmed: () => void
  showEditorContextMenu?: (sender: WebContents, request: EditorContextMenuRequest) => Promise<EditorContextMenuCommand>
  getAlwaysOnTop: () => boolean
  setAlwaysOnTop: (alwaysOnTop: boolean) => void
  getVimEnabled: () => boolean
  setVimEnabled: (vimEnabled: boolean) => void
}

export function registerIpcHandlers({
  ipcMain,
  rendererUrl,
  fileServices,
  nativeClipboard,
  quitHandshake,
  decodePng,
  onQuitConfirmed,
  showEditorContextMenu,
  getAlwaysOnTop,
  setAlwaysOnTop,
  getVimEnabled,
  setVimEnabled,
}: IpcHandlerDependencies): void {
  const requireTrustedRenderer = (event: IpcInvokeEvent): void => {
    if (!isTrustedRendererUrl(event.senderFrame?.url, rendererUrl)) throw new Error('Untrusted renderer IPC call.')
  }

  // Keep asynchronous image reads and native writes in command order, including rich Copy.
  let pendingClipboardWrite = Promise.resolve()
  const queueClipboardWrite = (write: () => Promise<void>): Promise<void> => {
    const operation = pendingClipboardWrite.then(write)
    pendingClipboardWrite = operation.catch(() => undefined)
    return operation
  }

  ipcMain.handle(ipcChannels.quit, (event, requestId?: unknown) => {
    requireTrustedRenderer(event)
    if (typeof requestId === 'string' && quitHandshake.confirm(requestId)) {
      onQuitConfirmed()
      return
    }
    if (requestId !== undefined) throw new Error('Invalid quit request.')
    quitHandshake.request()
  })
  ipcMain.handle(ipcChannels.quitWithoutSaving, (event) => {
    requireTrustedRenderer(event)
    quitHandshake.force()
    onQuitConfirmed()
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
    const content = validateClipboardWritePayload(payload)
    return queueClipboardWrite(() => writeClipboard(nativeClipboard, content))
  })
  ipcMain.handle(ipcChannels.writeClipboardContent, (event, payload) => {
    requireTrustedRenderer(event)
    const content = validateClipboardContent(payload)
    return queueClipboardWrite(async () => {
      if (content.kind === 'text') {
        if (nativeClipboard.writePlainText === undefined) throw new Error('Clipboard text copying is unavailable.')
        await nativeClipboard.writePlainText(content.text)
      } else {
        if (nativeClipboard.writeImage === undefined) throw new Error('Clipboard image copying is unavailable.')
        const png = await fileServices.readAttachment(content.attachmentId)
        if (png === null) throw new Error('The image could not be copied because its attachment is missing.')
        await nativeClipboard.writeImage(validateAttachmentBytes(png, decodePng))
      }
    })
  })
  ipcMain.handle(ipcChannels.writeAttachment, (event, id, png) => {
    requireTrustedRenderer(event)
    return fileServices.writeAttachment(validateAttachmentId(id), validateAttachmentBytes(png, decodePng))
  })
  ipcMain.handle(ipcChannels.readAttachment, (event, id) => {
    requireTrustedRenderer(event)
    return fileServices.readAttachment(validateAttachmentId(id))
  })
  ipcMain.handle(ipcChannels.cleanupAttachments, (event, referencedIds) => {
    requireTrustedRenderer(event)
    return fileServices.cleanupAttachments(validateAttachmentIds(referencedIds))
  })
  ipcMain.handle(ipcChannels.showEditorContextMenu, (event, request) => {
    requireTrustedRenderer(event)
    if (event.sender === undefined || showEditorContextMenu === undefined) return null
    return showEditorContextMenu(event.sender, validateEditorContextMenuRequest(request))
  })
  ipcMain.handle(ipcChannels.getAlwaysOnTop, (event) => {
    requireTrustedRenderer(event)
    return getAlwaysOnTop()
  })
  ipcMain.handle(ipcChannels.setAlwaysOnTop, (event, value) => {
    requireTrustedRenderer(event)
    if (typeof value !== 'boolean') throw new Error('Invalid always-on-top setting.')
    setAlwaysOnTop(value)
  })
  ipcMain.handle(ipcChannels.getVimEnabled, (event) => {
    requireTrustedRenderer(event)
    return getVimEnabled()
  })
  ipcMain.handle(ipcChannels.setVimEnabled, (event, value) => {
    requireTrustedRenderer(event)
    if (typeof value !== 'boolean') throw new Error('Invalid Vim editing setting.')
    setVimEnabled(value)
  })
}
