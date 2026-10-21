import type { EditorServices } from '../../application/editor-store'
import { createAttachmentImageCache, decodeAttachmentImage } from './attachment-image-cache'
import { dayNumberOf } from '../../domain/calendar-date'

export const ATTACHMENT_IMAGE_CACHE_LIMIT = 512 * 1024 * 1024

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

export const attachmentImageCache = createAttachmentImageCache(
  readAttachment,
  decodeAttachmentImage,
  ATTACHMENT_IMAGE_CACHE_LIMIT,
)
