import type { EditorServices } from '../../application/editor-store'
import { createAttachmentImageCache, decodeAttachmentImage } from './attachment-image-cache'
import { dayNumberOf } from '../../domain/calendar-date'
import { NOTES_REPLACED_MESSAGE } from '../../shared/ipc'

export const ATTACHMENT_IMAGE_CACHE_LIMIT = 512 * 1024 * 1024

// Set while an import replaces the notes (PRODUCT §25.3): the old session must not write over them.
let notesWritesSuspended = false

/**
 * Stops document saves, image writes and attachment cleanup from reaching the main process; they
 * resolve without effect. The import dialog blocks editing meanwhile, and pending edits were saved
 * before the suspension began.
 */
export function suspendNotesWrites(): void {
  notesWritesSuspended = true
}

/** Lets writes reach the main process again, after a replacement that did not begin. */
export function resumeNotesWrites(): void {
  notesWritesSuspended = false
}

/**
 * Runs a write unless writes are suspended. A rejection because the notes were already replaced
 * also suspends writes, since the window is about to reload the imported notes.
 */
async function notesWrite(write: () => Promise<void>): Promise<void> {
  if (notesWritesSuspended) return
  try {
    await write()
  } catch (error) {
    if (error instanceof Error && error.message.includes(NOTES_REPLACED_MESSAGE)) {
      notesWritesSuspended = true
      return
    }
    throw error
  }
}

export function createElectronEditorServices(): EditorServices {
  return {
    today: () => {
      const date = new Date()
      return dayNumberOf({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
    },
    load: () => window.treeApi.load(),
    save: (state) => notesWrite(() => window.treeApi.save(state)),
    readClipboard: () => window.treeApi.readClipboard(),
    writeClipboard: (payload) => window.treeApi.writeClipboard?.(payload) ?? Promise.resolve(),
    writeClipboardContent: (payload) => window.treeApi.writeClipboardContent?.(payload) ?? Promise.resolve(),
    writeAttachment: (id, png) => notesWrite(() => window.treeApi.writeAttachment(id, png)),
    cleanupAttachments: (referencedIds) => notesWrite(() => window.treeApi.cleanupAttachments(referencedIds)),
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
