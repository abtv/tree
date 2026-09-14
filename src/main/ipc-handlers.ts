import type { QuitHandshake } from './quit-handshake'
import {
  validateAttachmentBytes,
  validateAttachmentId,
  validateAttachmentIds,
  validateClipboardWritePayload,
  validatePersistedEditorState,
  isTrustedRendererUrl,
  type PngDecoder,
} from './ipc-security'
import { ipcChannels } from '../shared/ipc'
import type { FileServices } from '../infrastructure/main/file-services'
import { readClipboard, writeClipboard, type NativeClipboard } from '../infrastructure/main/clipboard'

export interface IpcInvokeEvent {
  senderFrame?: { url?: string } | null
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
}

export function registerIpcHandlers({
  ipcMain,
  rendererUrl,
  fileServices,
  nativeClipboard,
  quitHandshake,
  decodePng,
  onQuitConfirmed,
}: IpcHandlerDependencies): void {
  const requireTrustedRenderer = (event: IpcInvokeEvent): void => {
    if (!isTrustedRendererUrl(event.senderFrame?.url, rendererUrl)) throw new Error('Untrusted renderer IPC call.')
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
    return writeClipboard(nativeClipboard, validateClipboardWritePayload(payload))
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
}
