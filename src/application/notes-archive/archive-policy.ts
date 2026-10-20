import { isValidAttachmentId, type AttachmentId } from '../../domain/document'
import { MAX_ATTACHMENT_BYTES } from '../../shared/attachment-limits'

/**
 * The notes archive mirrors the Electron data directory: `document.json` first, then one
 * `attachments/<id>.png` entry per referenced image (PRODUCT §24.2). This module owns every
 * archive limit; the values are recorded in PRODUCT §24.2 and nowhere else.
 */
export const DOCUMENT_ENTRY_NAME = 'document.json'

export interface ArchiveLimits {
  /** Entries, including `document.json`. */
  readonly entries: number
  readonly documentBytes: number
  readonly imageBytes: number
  /** The finished archive, including headers and the central directory. */
  readonly archiveBytes: number
}

export const ARCHIVE_LIMITS: ArchiveLimits = {
  // A ZIP without ZIP64 records stores the entry count in 16 bits.
  entries: 0xffff,
  documentBytes: 256 * 1024 * 1024,
  imageBytes: MAX_ATTACHMENT_BYTES,
  // Keeps every ZIP32 offset and size below the signed 32-bit range that some readers assume.
  archiveBytes: 2 ** 31 - 1,
}

/**
 * The longest image ID an archive may name: `<id>.png` must fit the 255-byte file-name limit of the
 * desktop data directory, so a longer ID could never come from a valid data directory.
 */
export const MAX_ARCHIVE_ATTACHMENT_ID_LENGTH = 251

const LOCAL_HEADER_BYTES = 30
const DATA_DESCRIPTOR_BYTES = 16
const CENTRAL_HEADER_BYTES = 46
const END_OF_CENTRAL_DIRECTORY_BYTES = 22

export function attachmentEntryName(id: AttachmentId): string {
  if (!isValidAttachmentId(id)) {
    throw new Error('Attachment IDs may contain only letters, numbers, underscores, and hyphens.')
  }
  return `attachments/${id}.png`
}

export class NotesArchiveError extends Error {
  override readonly name = 'NotesArchiveError'
}

/**
 * Tracks the size an archive will have once its central directory is written, so export can
 * refuse an entry that would make the finished archive exceed its limits before the entry is
 * written. Entry names are ASCII, so their UTF-8 length equals their string length.
 */
export class ArchiveBudget {
  private centralDirectoryBytes = 0
  private entries = 0

  constructor(private readonly limits: ArchiveLimits = ARCHIVE_LIMITS) {}

  /** Whether an entry named `name` with `payloadBytes` written bytes still fits after `bytesWritten`. */
  fits(bytesWritten: number, name: string, payloadBytes: number): boolean {
    const finishedBytes =
      bytesWritten +
      LOCAL_HEADER_BYTES +
      name.length +
      payloadBytes +
      DATA_DESCRIPTOR_BYTES +
      this.centralDirectoryBytes +
      CENTRAL_HEADER_BYTES +
      name.length +
      END_OF_CENTRAL_DIRECTORY_BYTES
    return this.entries < this.limits.entries && finishedBytes <= this.limits.archiveBytes
  }

  /** Records an entry once it is written. */
  add(name: string): void {
    this.entries += 1
    this.centralDirectoryBytes += CENTRAL_HEADER_BYTES + name.length
  }
}
