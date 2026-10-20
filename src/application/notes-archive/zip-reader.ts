import { isValidAttachmentId, type AttachmentId } from '../../domain/document'
import {
  ARCHIVE_LIMITS,
  DOCUMENT_ENTRY_NAME,
  MAX_ARCHIVE_ATTACHMENT_ID_LENGTH,
  NotesArchiveError,
  type ArchiveLimits,
} from './archive-policy'
import { crc32 } from './crc32'

/** Random access to the bytes of the archive file the user chose. */
export interface ArchiveFile {
  readonly size: number
  /** Resolves with exactly `length` bytes starting at `offset`. */
  read(offset: number, length: number): Promise<Uint8Array>
}

export interface Inflater {
  push(chunk: Uint8Array, final: boolean): void
}

/** Creates a raw Deflate decoder that passes each produced chunk, which it never reuses, to `onData`. */
export type CreateInflater = (onData: (chunk: Uint8Array) => void) => Inflater

export interface ArchiveEntry {
  readonly name: string
  /** The image ID of an `attachments/<id>.png` entry; undefined for `document.json`. */
  readonly attachmentId: AttachmentId | undefined
  readonly method: number
  readonly flags: number
  readonly crc32: number
  readonly compressedSize: number
  readonly size: number
  readonly localHeaderOffset: number
  readonly nameBytes: Uint8Array
}

export const NOT_AN_ARCHIVE_MESSAGE = 'The file is not a Tree notes archive, or it is damaged.'
export const ARCHIVE_FILE_TOO_LARGE_MESSAGE = 'The file is larger than a Tree notes archive can be.'
export const TOO_MANY_ENTRIES_MESSAGE = 'The archive has more entries than a Tree notes archive can hold.'
export const CONTENT_TOO_LARGE_MESSAGE = 'The archive contents are larger than Tree allows.'
export const UNSUPPORTED_ARCHIVE_MESSAGE =
  'The archive uses ZIP features that Tree notes archives never use, such as ZIP64 records, comments or extra fields.'
export const ENCRYPTED_ARCHIVE_MESSAGE = 'The archive is encrypted.'
export const INVALID_NAME_MESSAGE = 'The archive contains an entry name that is not valid UTF-8.'
export const NO_DOCUMENT_MESSAGE = 'The archive does not contain document.json.'

export const unexpectedEntryMessage = (name: string) =>
  `The archive contains “${displayName(name)}”, which a Tree notes archive cannot contain. Import the original file that Tree exported.`
export const duplicateEntryMessage = (name: string) => `The archive contains “${displayName(name)}” more than once.`
export const entryTooLargeMessage = (name: string) => `“${displayName(name)}” is larger than Tree allows.`
export const unsupportedMethodMessage = (name: string) =>
  `“${displayName(name)}” uses a compression method that Tree does not support.`
export const damagedEntryMessage = (name: string) => `“${displayName(name)}” is damaged.`

const END_SIGNATURE = 0x06054b50
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const END_BYTES = 22
const ZIP64_LOCATOR_BYTES = 20
const CENTRAL_BYTES = 46
const LOCAL_BYTES = 30
// A comment of up to 65,535 bytes may follow the end record.
const END_SEARCH_BYTES = END_BYTES + 0xffff
const STORED = 0
const DEFLATED = 8
// Traditional encryption, strong encryption and an encrypted central directory.
const ENCRYPTION_FLAGS = 0x0001 | 0x0040 | 0x2000
const DATA_DESCRIPTOR_FLAG = 0x0008
// ZIP64 needs version 4.5; Deflate needs 2.0.
const MAX_VERSION_NEEDED = 20
// Marks a ZIP64 size or offset; real values stay below ARCHIVE_LIMITS.archiveBytes.
const ZIP64_MARKER = 0xffffffff
const ATTACHMENT_PREFIX = 'attachments/'
const ATTACHMENT_SUFFIX = '.png'
const MAX_NAME_BYTES = ATTACHMENT_PREFIX.length + MAX_ARCHIVE_ATTACHMENT_ID_LENGTH + ATTACHMENT_SUFFIX.length
const DISPLAYED_NAME_LENGTH = 80
const READ_SLICE_BYTES = 1024 * 1024
// One Deflate input slice expands to at most about 1,032 times its size before the size check runs.
const INFLATE_SLICE_BYTES = 16 * 1024

const fail = (message: string): never => {
  throw new NotesArchiveError(message)
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

/** Shows an entry name in a message without control or formatting characters, and shortened. */
function displayName(name: string): string {
  const visible = name.replace(/[\p{Cc}\p{Cf}]/gu, '�')
  return visible.length > DISPLAYED_NAME_LENGTH ? `${visible.slice(0, DISPLAYED_NAME_LENGTH - 1)}…` : visible
}

/** Returns the image ID a valid entry name refers to, null for `document.json`, or undefined for any other name. */
export function classifyEntryName(name: string): AttachmentId | null | undefined {
  if (name === DOCUMENT_ENTRY_NAME) return null
  if (!name.startsWith(ATTACHMENT_PREFIX) || !name.endsWith(ATTACHMENT_SUFFIX)) return undefined
  const id = name.slice(ATTACHMENT_PREFIX.length, -ATTACHMENT_SUFFIX.length)
  return id.length <= MAX_ARCHIVE_ATTACHMENT_ID_LENGTH && isValidAttachmentId(id) ? id : undefined
}

async function readEndRecord(file: ArchiveFile): Promise<DataView> {
  const end = view(await file.read(file.size - END_BYTES, END_BYTES))
  if (end.getUint32(0, true) === END_SIGNATURE) return end
  // An archive comment moves the end record away from the end of the file.
  const searched = Math.min(file.size, END_SEARCH_BYTES)
  const tail = await file.read(file.size - searched, searched)
  const tailView = view(tail)
  for (let offset = searched - END_BYTES; offset >= 0; offset -= 1) {
    if (tailView.getUint32(offset, true) === END_SIGNATURE) fail(UNSUPPORTED_ARCHIVE_MESSAGE)
  }
  return fail(NOT_AN_ARCHIVE_MESSAGE)
}

/**
 * Reads and validates the central directory of a notes archive (PRODUCT §24.4) before any entry
 * payload is read. It accepts only what export writes: one end record at the end of the file, no
 * ZIP64, encryption, comments or extra fields, Stored or Deflate entries named `document.json` or
 * `attachments/<id>.png`, sizes within the archive limits, and entries that lie inside the file
 * without overlapping each other or the central directory.
 */
export async function readArchiveDirectory(
  file: ArchiveFile,
  limits: ArchiveLimits = ARCHIVE_LIMITS,
): Promise<ArchiveEntry[]> {
  if (file.size > limits.archiveBytes) fail(ARCHIVE_FILE_TOO_LARGE_MESSAGE)
  if (file.size < END_BYTES) fail(NOT_AN_ARCHIVE_MESSAGE)
  const end = await readEndRecord(file)
  const endOffset = file.size - END_BYTES
  const entryCount = end.getUint16(10, true)
  const directoryBytes = end.getUint32(12, true)
  const directoryOffset = end.getUint32(16, true)
  if (end.getUint16(20, true) !== 0) fail(NOT_AN_ARCHIVE_MESSAGE)
  if (
    end.getUint16(4, true) !== 0 ||
    end.getUint16(6, true) !== 0 ||
    end.getUint16(8, true) !== entryCount ||
    directoryBytes === ZIP64_MARKER ||
    directoryOffset === ZIP64_MARKER ||
    (endOffset >= ZIP64_LOCATOR_BYTES &&
      view(await file.read(endOffset - ZIP64_LOCATOR_BYTES, 4)).getUint32(0, true) === ZIP64_LOCATOR_SIGNATURE)
  ) {
    fail(UNSUPPORTED_ARCHIVE_MESSAGE)
  }
  if (entryCount > limits.entries) fail(TOO_MANY_ENTRIES_MESSAGE)
  if (entryCount === 0) fail(NO_DOCUMENT_MESSAGE)
  if (
    directoryOffset + directoryBytes !== endOffset ||
    directoryBytes > entryCount * (CENTRAL_BYTES + MAX_NAME_BYTES)
  ) {
    fail(NOT_AN_ARCHIVE_MESSAGE)
  }

  const directory = await file.read(directoryOffset, directoryBytes)
  const data = view(directory)
  // Keeps a byte-order mark in the name, so only the exact names are accepted.
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  const entries: ArchiveEntry[] = []
  const seen = new Set<string>()
  let offset = 0
  let declaredBytes = 0
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + CENTRAL_BYTES > directoryBytes || data.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      fail(NOT_AN_ARCHIVE_MESSAGE)
    }
    const nameLength = data.getUint16(offset + 28, true)
    const extraLength = data.getUint16(offset + 30, true)
    const commentLength = data.getUint16(offset + 32, true)
    const recordEnd = offset + CENTRAL_BYTES + nameLength + extraLength + commentLength
    if (recordEnd > directoryBytes) fail(NOT_AN_ARCHIVE_MESSAGE)
    const nameBytes = directory.slice(offset + CENTRAL_BYTES, offset + CENTRAL_BYTES + nameLength)
    let name = ''
    try {
      name = decoder.decode(nameBytes)
    } catch {
      fail(INVALID_NAME_MESSAGE)
    }
    // Names come first, so a re-packed archive is reported by its foreign entry (PRODUCT §24.4).
    const attachmentId = classifyEntryName(name)
    if (attachmentId === undefined) fail(unexpectedEntryMessage(name))
    // Valid names are ASCII, so lower case identifies names that collide on a case-insensitive disk.
    if (seen.has(name.toLowerCase())) fail(duplicateEntryMessage(name))
    seen.add(name.toLowerCase())

    const flags = data.getUint16(offset + 8, true)
    const method = data.getUint16(offset + 10, true)
    const compressedSize = data.getUint32(offset + 20, true)
    const size = data.getUint32(offset + 24, true)
    const localHeaderOffset = data.getUint32(offset + 42, true)
    if ((flags & ENCRYPTION_FLAGS) !== 0) fail(ENCRYPTED_ARCHIVE_MESSAGE)
    if (
      data.getUint16(offset + 6, true) > MAX_VERSION_NEEDED ||
      extraLength !== 0 ||
      commentLength !== 0 ||
      data.getUint16(offset + 34, true) !== 0 ||
      compressedSize === ZIP64_MARKER ||
      size === ZIP64_MARKER ||
      localHeaderOffset === ZIP64_MARKER
    ) {
      fail(UNSUPPORTED_ARCHIVE_MESSAGE)
    }
    if (method !== STORED && method !== DEFLATED) fail(unsupportedMethodMessage(name))
    if (size > (attachmentId === null ? limits.documentBytes : limits.imageBytes)) fail(entryTooLargeMessage(name))
    if (method === STORED && compressedSize !== size) fail(damagedEntryMessage(name))
    declaredBytes += size
    if (declaredBytes > limits.archiveBytes) fail(CONTENT_TOO_LARGE_MESSAGE)
    entries.push({
      name,
      attachmentId: attachmentId ?? undefined,
      method,
      flags,
      crc32: data.getUint32(offset + 16, true),
      compressedSize,
      size,
      localHeaderOffset,
      nameBytes,
    })
    offset = recordEnd
  }
  if (offset !== directoryBytes) fail(NOT_AN_ARCHIVE_MESSAGE)

  // Each local header and its data must end before the next entry or the central directory starts.
  const byOffset = [...entries].sort((left, right) => left.localHeaderOffset - right.localHeaderOffset)
  for (const [index, entry] of byOffset.entries()) {
    const limit = byOffset[index + 1]?.localHeaderOffset ?? directoryOffset
    if (entry.localHeaderOffset + LOCAL_BYTES + entry.nameBytes.byteLength + entry.compressedSize > limit) {
      fail(NOT_AN_ARCHIVE_MESSAGE)
    }
  }
  return entries
}

/**
 * Reads one entry after checking that its local header repeats the central record. Inflation
 * stops as soon as the output exceeds the declared size, and the produced bytes must match the
 * declared size and CRC-32.
 */
export async function readArchiveEntry(
  file: ArchiveFile,
  entry: ArchiveEntry,
  createInflater: CreateInflater,
): Promise<Uint8Array> {
  const damaged = () => fail(damagedEntryMessage(entry.name))
  const nameLength = entry.nameBytes.byteLength
  const header = await file.read(entry.localHeaderOffset, LOCAL_BYTES + nameLength)
  const local = view(header)
  if (
    local.getUint32(0, true) !== LOCAL_SIGNATURE ||
    local.getUint16(6, true) !== entry.flags ||
    local.getUint16(8, true) !== entry.method ||
    local.getUint16(26, true) !== nameLength ||
    local.getUint16(28, true) !== 0 ||
    header.subarray(LOCAL_BYTES).some((byte, index) => byte !== entry.nameBytes[index])
  ) {
    damaged()
  }
  if (
    (entry.flags & DATA_DESCRIPTOR_FLAG) === 0 &&
    (local.getUint32(14, true) !== entry.crc32 ||
      local.getUint32(18, true) !== entry.compressedSize ||
      local.getUint32(22, true) !== entry.size)
  ) {
    damaged()
  }

  const dataOffset = entry.localHeaderOffset + LOCAL_BYTES + nameLength
  const output = new Uint8Array(entry.size)
  let produced = 0
  const accept = (chunk: Uint8Array) => {
    if (produced + chunk.byteLength > entry.size) damaged()
    output.set(chunk, produced)
    produced += chunk.byteLength
  }
  if (entry.method === STORED) {
    accept(await file.read(dataOffset, entry.compressedSize))
  } else {
    const inflater = createInflater(accept)
    try {
      if (entry.compressedSize === 0) inflater.push(new Uint8Array(0), true)
      for (let offset = 0; offset < entry.compressedSize; offset += READ_SLICE_BYTES) {
        const slice = await file.read(dataOffset + offset, Math.min(READ_SLICE_BYTES, entry.compressedSize - offset))
        const lastSlice = offset + slice.byteLength >= entry.compressedSize
        for (let start = 0; start < slice.byteLength; start += INFLATE_SLICE_BYTES) {
          const end = start + INFLATE_SLICE_BYTES
          inflater.push(slice.subarray(start, end), lastSlice && end >= slice.byteLength)
        }
      }
    } catch (error) {
      if (error instanceof NotesArchiveError) throw error
      damaged()
    }
  }
  if (produced !== entry.size || crc32(output) !== entry.crc32) damaged()
  return output
}
