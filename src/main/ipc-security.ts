import type { PersistedEditorState } from '../domain/document'
import { validatePersistedState } from '../domain/document'
import type { ClipboardWritePayload } from '../shared/ipc'

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

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

export function validateAttachmentId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || !attachmentIdPattern.test(value)) {
    throw new Error('Attachment IDs may contain only letters, numbers, underscores, and hyphens.')
  }
  return value
}

export function validateAttachmentBytes(value: unknown): Uint8Array {
  const bytes = toUint8Array(value)
  if (bytes === undefined) throw new Error('Attachment data is invalid.')
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('Attachment is too large.')
  if (bytes.byteLength === 0) throw new Error('Attachment data is empty.')
  if (!isPng(bytes)) throw new Error('Attachment data is not a valid PNG image.')
  return bytes
}

export function isPng(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < signature.length || !signature.every((byte, index) => bytes[index] === byte)) return false

  let offset = signature.length
  let sawHeader = false
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset)
    const typeStart = offset + 4
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const chunkEnd = dataEnd + 4
    if (dataEnd > bytes.length || chunkEnd > bytes.length) return false
    const type = String.fromCharCode(...bytes.slice(typeStart, dataStart))
    if (!sawHeader) {
      if (
        type !== 'IHDR' ||
        length !== 13 ||
        readUint32(bytes, dataStart) === 0 ||
        readUint32(bytes, dataStart + 4) === 0
      ) {
        return false
      }
      sawHeader = true
    }
    offset = chunkEnd
    if (type === 'IEND') return sawHeader && length === 0 && offset === bytes.length
  }
  return false
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
