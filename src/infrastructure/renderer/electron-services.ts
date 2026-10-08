import type { EditorServices } from '../../application/editor-store'
import { createAttachmentBytesCache } from './attachment-bytes-cache'
import { dayNumberOf } from '../../domain/calendar-date'

export const ATTACHMENT_BYTES_CACHE_LIMIT = 64 * 1024 * 1024

export function createElectronEditorServices(): EditorServices {
  return {
    today: () => {
      const date = new Date()
      return dayNumberOf({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
    },
    load: () => window.treeApi.load(),
    save: (state) => window.treeApi.save(state),
    readClipboard: () => window.treeApi.readClipboard(),
    writeClipboard: (payload) => window.treeApi.writeClipboard?.(payload) ?? Promise.resolve(),
    writeClipboardContent: (payload) => window.treeApi.writeClipboardContent?.(payload) ?? Promise.resolve(),
    writeAttachment: (id, png) => window.treeApi.writeAttachment(id, png),
    cleanupAttachments: (referencedIds) => window.treeApi.cleanupAttachments(referencedIds),
  }
}

export function readAttachment(id: string): Promise<Uint8Array | null> {
  return window.treeApi.readAttachment(id)
}

export const attachmentByteCache = createAttachmentBytesCache(readAttachment, ATTACHMENT_BYTES_CACHE_LIMIT)
