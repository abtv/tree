import type { PersistedEditorState } from '../domain/document'
import { validatePersistedState } from '../domain/document'
import type { ClipboardWritePayload, EditorContextMenuRequest } from '../shared/ipc'

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const MAX_ATTACHMENT_DIMENSION = 32_767
export const MAX_ATTACHMENT_PIXELS = 64 * 1024 * 1024

const attachmentIdPattern = /^[A-Za-z0-9_-]+$/

export function isTrustedRendererUrl(value: string | undefined, expected: string): boolean {
  if (value === undefined) return false
  try {
    const actualUrl = new URL(value)
    const expectedUrl = new URL(expected)
    return (
      actualUrl.protocol === expectedUrl.protocol &&
      actualUrl.host === expectedUrl.host &&
      actualUrl.pathname === expectedUrl.pathname
    )
  } catch {
    return false
  }
}

export function validatePersistedEditorState(value: unknown): PersistedEditorState {
  return validatePersistedState(value)
}

export function validateClipboardWritePayload(value: unknown): ClipboardWritePayload {
  if (!isRecord(value) || typeof value.text !== 'string' || typeof value.html !== 'string') {
    throw new Error('Clipboard payload is invalid.')
  }
  return { text: value.text, html: value.html }
}

export function validateEditorContextMenuRequest(value: unknown): EditorContextMenuRequest {
  if (
    !isRecord(value) ||
    typeof value.x !== 'number' ||
    typeof value.y !== 'number' ||
    typeof value.selectionText !== 'string' ||
    typeof value.canCut !== 'boolean' ||
    typeof value.canCopy !== 'boolean' ||
    typeof value.canPaste !== 'boolean' ||
    typeof value.canSelectAll !== 'boolean'
  ) {
    throw new Error('Editor context menu request is invalid.')
  }
  return {
    x: value.x,
    y: value.y,
    selectionText: value.selectionText,
    canCut: value.canCut,
    canCopy: value.canCopy,
    canPaste: value.canPaste,
    canSelectAll: value.canSelectAll,
  }
}

export function validateAttachmentId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || !attachmentIdPattern.test(value)) {
    throw new Error('Attachment IDs may contain only letters, numbers, underscores, and hyphens.')
  }
  return value
}

export type PngDecoder = (bytes: Uint8Array) => boolean

export function validateAttachmentBytes(value: unknown, decode: PngDecoder): Uint8Array {
  const bytes = toUint8Array(value)
  if (bytes === undefined) throw new Error('Attachment data is invalid.')
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('Attachment is too large.')
  if (bytes.byteLength === 0) throw new Error('Attachment data is empty.')
  if (!isPng(bytes)) throw new Error('Attachment data is not a valid PNG image.')
  if (exceedsDecodeBudget(bytes)) throw new Error('Attachment image is too large.')
  if (!decode(bytes)) throw new Error('Attachment data is not a decodable PNG image.')
  return bytes
}

function exceedsDecodeBudget(bytes: Uint8Array): boolean {
  const width = readUint32(bytes, 16)
  const height = readUint32(bytes, 20)
  return width > MAX_ATTACHMENT_DIMENSION || height > MAX_ATTACHMENT_DIMENSION || width * height > MAX_ATTACHMENT_PIXELS
}

export function isPng(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < signature.length || !signature.every((byte, index) => bytes[index] === byte)) return false

  let offset = signature.length
  let sawHeader = false
  let sawData = false
  let sawEnd = false
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset)
    const typeStart = offset + 4
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const chunkEnd = dataEnd + 4
    if (dataEnd > bytes.length || chunkEnd > bytes.length) return false
    if (readUint32(bytes, dataEnd) !== crc32(bytes, typeStart, dataEnd)) return false
    const type = String.fromCharCode(
      bytes[typeStart]!,
      bytes[typeStart + 1]!,
      bytes[typeStart + 2]!,
      bytes[typeStart + 3]!,
    )
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13 || !isValidHeader(bytes, dataStart)) return false
      sawHeader = true
    } else if (sawEnd) {
      return false
    }
    if (type === 'IDAT') {
      if (length === 0) return false
      sawData = true
    }
    offset = chunkEnd
    if (type === 'IEND') {
      if (length !== 0) return false
      sawEnd = true
      break
    }
  }
  return sawHeader && sawData && sawEnd && offset === bytes.length
}

function isValidHeader(bytes: Uint8Array, dataStart: number): boolean {
  if (readUint32(bytes, dataStart) === 0 || readUint32(bytes, dataStart + 4) === 0) return false
  const bitDepth = bytes[dataStart + 8]
  const colorType = bytes[dataStart + 9]
  if (bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0) return false
  const interlace = bytes[dataStart + 12]
  if (interlace !== 0 && interlace !== 1) return false
  const allowedDepths: Record<number, number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  }
  return bitDepth !== undefined && allowedDepths[colorType!]?.includes(bitDepth) === true
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff
  for (let index = start; index < end; index += 1) crc = crcTable[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! * 2 ** 24 + bytes[offset + 1]! * 2 ** 16 + bytes[offset + 2]! * 2 ** 8 + bytes[offset + 3]!
}

export function validateAttachmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Attachment IDs are invalid.')
  return value.map(validateAttachmentId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toUint8Array(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (Array.isArray(value) && value.length <= MAX_ATTACHMENT_BYTES && value.every(isByte)) return Uint8Array.from(value)
  if (
    isRecord(value) &&
    value.type === 'Buffer' &&
    Array.isArray(value.data) &&
    value.data.length <= MAX_ATTACHMENT_BYTES &&
    value.data.every(isByte)
  ) {
    return Uint8Array.from(value.data)
  }
  return undefined
}

function isByte(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255
}
