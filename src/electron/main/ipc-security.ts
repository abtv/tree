import type { PersistedEditorState } from '../../domain/document'
import { isValidAttachmentId, validatePersistedState } from '../../domain/document'
import type { ClipboardContent, ClipboardWritePayload, EditorContextMenuRequest } from '../../shared/ipc'

export { MAX_ATTACHMENT_BYTES } from '../../shared/attachment-limits'
export {
  isPng,
  MAX_ATTACHMENT_DIMENSION,
  MAX_ATTACHMENT_PIXELS,
  validateAttachmentBytes,
  type PngDecoder,
} from '../../shared/png-validation'

export const MAX_CONTEXT_MENU_SELECTION_CODE_POINTS = 256

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

export function validateClipboardContent(value: unknown): ClipboardContent {
  if (isRecord(value)) {
    if (value.kind === 'text' && typeof value.text === 'string') return { kind: 'text', text: value.text }
    if (value.kind === 'image') return { kind: 'image', attachmentId: validateAttachmentId(value.attachmentId) }
  }
  throw new Error('Clipboard content is invalid.')
}

export function validateEditorContextMenuRequest(value: unknown): EditorContextMenuRequest {
  if (
    !isRecord(value) ||
    typeof value.x !== 'number' ||
    !Number.isFinite(value.x) ||
    typeof value.y !== 'number' ||
    !Number.isFinite(value.y) ||
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
    selectionText: truncateContextMenuSelection(value.selectionText),
    canCut: value.canCut,
    canCopy: value.canCopy,
    canPaste: value.canPaste,
    canSelectAll: value.canSelectAll,
  }
}

/** Notes export and import requests carry no arguments: paths come only from native panels. */
export function requireNoArguments(args: readonly unknown[]): void {
  if (args.length > 0) throw new Error('This request takes no arguments.')
}

function truncateContextMenuSelection(value: string): string {
  let index = 0
  let codePoints = 0
  const prefixLimit = MAX_CONTEXT_MENU_SELECTION_CODE_POINTS - 1
  while (index < value.length && codePoints < prefixLimit) {
    const codePoint = value.codePointAt(index)!
    index += codePoint > 0xffff ? 2 : 1
    codePoints += 1
  }
  return index < value.length ? value.slice(0, index) + '…' : value
}

export function validateAttachmentId(value: unknown): string {
  if (typeof value !== 'string' || !isValidAttachmentId(value)) {
    throw new Error('Attachment IDs may contain only letters, numbers, underscores, and hyphens.')
  }
  return value
}

export function validateAttachmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Attachment IDs are invalid.')
  return value.map(validateAttachmentId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
