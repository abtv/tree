import {
  collectAttachmentIds,
  parsePersistedState,
  validatePersistedState,
  type AttachmentId,
  type Document,
  type PersistedEditorState,
} from '../../domain/document'
import { ARCHIVE_LIMITS, NotesArchiveError, type ArchiveLimits } from './archive-policy'
import type { NotesArchiveProgress } from './export-notes'
import {
  NO_DOCUMENT_MESSAGE,
  readArchiveDirectory,
  readArchiveEntry,
  type ArchiveFile,
  type CreateInflater,
} from './zip-reader'

/** The image store of the notes that an import replaces. */
export interface ImportImageStore {
  /** Returns the stored bytes, or `undefined` when no image is stored under `id`. */
  readImage(id: AttachmentId): Promise<unknown>
  writeImage(id: AttachmentId, bytes: Uint8Array): Promise<void>
  removeImages(ids: readonly AttachmentId[]): Promise<void>
}

export interface NotesImportPorts {
  readonly createInflater: CreateInflater
  /** Rejects bytes that are not a usable PNG attachment, with a reason. */
  validateImage(bytes: Uint8Array): Promise<void>
  readonly images: ImportImageStore
  onProgress?(progress: NotesArchiveProgress): void
}

export interface NotesCounts {
  readonly nodeCount: number
  /** Referenced images that are available. */
  readonly imageCount: number
}

export interface PreparedNotesImport extends NotesCounts {
  /** The archive's `document.json`, validated; it becomes the stored head unchanged. */
  readonly head: PersistedEditorState
  /** Referenced images that the archive does not contain (PRODUCT §24.4). */
  readonly missingImageCount: number
  /** Images this import wrote; they are removed when it does not finish. */
  readonly stagedIds: readonly AttachmentId[]
}

export const invalidDocumentMessage = (reason: string) => `document.json does not contain valid Tree notes. ${reason}`
export const invalidImageMessage = (name: string, reason: string) => `“${name}” is not a usable image. ${reason}`
export const conflictingImageMessage = (name: string) =>
  `“${name}” differs from an image that is already stored with the same ID.`

export function countNodes(document: Document): number {
  let count = 0
  const stack = [...document.roots]
  while (stack.length > 0) {
    count += 1
    for (const child of stack.pop()!.children) stack.push(child)
  }
  return count
}

/** Counts the notes stored in this browser, or reports that there are none or that they are invalid. */
export function summarizeStoredNotes(head: unknown): NotesCounts | 'none' | 'invalid' {
  if (head === undefined) return 'none'
  try {
    const { document } = parsePersistedState(validatePersistedState(head))
    return { nodeCount: countNodes(document), imageCount: collectAttachmentIds(document).size }
  } catch {
    return 'invalid'
  }
}

function parseDocument(bytes: Uint8Array): { head: PersistedEditorState; document: Document } {
  let text: string
  try {
    // A byte-order mark is not part of a saved document, so it is decoded and rejected by JSON.parse.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new NotesArchiveError(invalidDocumentMessage('The text is not valid UTF-8.'))
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new NotesArchiveError(invalidDocumentMessage('The text is not valid JSON.'))
  }
  try {
    // Loading validates the stored head and then parses it; both must succeed now.
    const head = validatePersistedState(value)
    return { head, document: parsePersistedState(head).document }
  } catch (error) {
    throw new NotesArchiveError(invalidDocumentMessage(error instanceof Error ? error.message : String(error)))
  }
}

const sameBytes = (stored: unknown, bytes: Uint8Array) =>
  stored instanceof Uint8Array &&
  stored.byteLength === bytes.byteLength &&
  stored.every((byte, index) => byte === bytes[index])

/**
 * Validates a notes archive and stores the images its document references, without changing the
 * stored document (PRODUCT §24.4). Images are read, validated and written one at a time; an image
 * that is already stored with equal bytes is kept, and different bytes reject the archive. On any
 * failure the images written so far are removed, so the current notes stay as they were.
 */
export async function prepareNotesImport(
  file: ArchiveFile,
  ports: NotesImportPorts,
  limits: ArchiveLimits = ARCHIVE_LIMITS,
): Promise<PreparedNotesImport> {
  const entries = await readArchiveDirectory(file, limits)
  const documentEntry = entries.find((entry) => entry.attachmentId === undefined)
  if (documentEntry === undefined) throw new NotesArchiveError(NO_DOCUMENT_MESSAGE)
  const { head, document } = parseDocument(await readArchiveEntry(file, documentEntry, ports.createInflater))
  const imageEntries = new Map(entries.flatMap((entry) => (entry.attachmentId ? [[entry.attachmentId, entry]] : [])))
  const ids = [...collectAttachmentIds(document)].sort()

  const stagedIds: AttachmentId[] = []
  let imageCount = 0
  try {
    ports.onProgress?.({ imagesDone: 0, imageCount: ids.length })
    for (const [index, id] of ids.entries()) {
      const entry = imageEntries.get(id)
      if (entry !== undefined) {
        const bytes = await readArchiveEntry(file, entry, ports.createInflater)
        try {
          await ports.validateImage(bytes)
        } catch (error) {
          throw new NotesArchiveError(
            invalidImageMessage(entry.name, error instanceof Error ? error.message : String(error)),
          )
        }
        const stored = await ports.images.readImage(id)
        if (stored === undefined) {
          // Recorded first: a write that fails may still have stored the image.
          stagedIds.push(id)
          await ports.images.writeImage(id, bytes)
        } else if (!sameBytes(stored, bytes)) {
          throw new NotesArchiveError(conflictingImageMessage(entry.name))
        }
        imageCount += 1
      }
      ports.onProgress?.({ imagesDone: index + 1, imageCount: ids.length })
    }
  } catch (error) {
    // A failed removal leaves only images that no document references.
    if (stagedIds.length > 0) await ports.images.removeImages(stagedIds).catch(() => {})
    throw error
  }
  return { head, nodeCount: countNodes(document), imageCount, missingImageCount: ids.length - imageCount, stagedIds }
}
