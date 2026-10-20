import { collectAttachmentIds, validatePersistedState, type AttachmentId } from '../../domain/document'
import {
  ARCHIVE_LIMITS,
  ArchiveBudget,
  DOCUMENT_ENTRY_NAME,
  NotesArchiveError,
  attachmentEntryName,
  type ArchiveLimits,
} from './archive-policy'

/** Reads the saved notes. Each call reads one value, so a caller holds at most one image. */
export interface NotesArchiveSource {
  readHead(): Promise<unknown>
  /** Returns the stored bytes, or `undefined` when the image is missing. */
  readImage(id: AttachmentId): Promise<unknown>
}

/** Appends archive entries in order; implementations stream the produced bytes elsewhere. */
export interface NotesArchiveWriter {
  /** Archive bytes produced so far. */
  readonly bytesWritten: number
  addDeflated(name: string, bytes: Uint8Array): void
  addStored(name: string, bytes: Uint8Array): void
  finish(): void
}

export interface NotesArchiveProgress {
  readonly imagesDone: number
  readonly imageCount: number
}

export interface NotesArchiveSummary {
  /** Images written to the archive. */
  readonly imageCount: number
  /** Referenced images that were missing or unusable in storage and were skipped (PRODUCT §24.3). */
  readonly missingImageCount: number
  readonly archiveBytes: number
}

export const NO_NOTES_MESSAGE = 'There are no saved notes to export.'
export const INVALID_NOTES_MESSAGE = 'The saved notes are invalid, so they cannot be exported.'
export const TOO_MANY_IMAGES_MESSAGE = 'Your notes have too many images to export as one archive.'
export const DOCUMENT_TOO_LARGE_MESSAGE = 'Your notes are too large to export as one archive.'
export const ARCHIVE_TOO_LARGE_MESSAGE = 'Your notes and images are too large to export as one archive.'

/**
 * Writes the saved head and every referenced, available image as a notes archive. The head is
 * validated before anything is written, and every limit is checked before the entry that would
 * exceed it, so a refused export never finishes an archive.
 */
export async function exportNotesArchive(
  source: NotesArchiveSource,
  writer: NotesArchiveWriter,
  onProgress: (progress: NotesArchiveProgress) => void = () => {},
  limits: ArchiveLimits = ARCHIVE_LIMITS,
): Promise<NotesArchiveSummary> {
  const head = await source.readHead()
  if (head === undefined) throw new NotesArchiveError(NO_NOTES_MESSAGE)
  let ids: AttachmentId[]
  try {
    ids = [...collectAttachmentIds(validatePersistedState(head).document)].sort()
  } catch {
    throw new NotesArchiveError(INVALID_NOTES_MESSAGE)
  }
  if (ids.length >= limits.entries) throw new NotesArchiveError(TOO_MANY_IMAGES_MESSAGE)
  const documentBytes = new TextEncoder().encode(JSON.stringify(head))
  if (documentBytes.byteLength > limits.documentBytes) throw new NotesArchiveError(DOCUMENT_TOO_LARGE_MESSAGE)

  const budget = new ArchiveBudget(limits)
  writer.addDeflated(DOCUMENT_ENTRY_NAME, documentBytes)
  budget.add(DOCUMENT_ENTRY_NAME)
  onProgress({ imagesDone: 0, imageCount: ids.length })
  let imageCount = 0
  let missingImageCount = 0
  for (const [index, id] of ids.entries()) {
    const bytes = await source.readImage(id)
    // Stored bytes were validated when written; this rejects only values an archive reader refuses.
    if (bytes instanceof Uint8Array && bytes.byteLength > 0 && bytes.byteLength <= limits.imageBytes) {
      const name = attachmentEntryName(id)
      if (!budget.fits(writer.bytesWritten, name, bytes.byteLength)) {
        throw new NotesArchiveError(ARCHIVE_TOO_LARGE_MESSAGE)
      }
      writer.addStored(name, bytes)
      budget.add(name)
      imageCount += 1
    } else {
      missingImageCount += 1
    }
    onProgress({ imagesDone: index + 1, imageCount: ids.length })
  }
  writer.finish()
  return { imageCount, missingImageCount, archiveBytes: writer.bytesWritten }
}
