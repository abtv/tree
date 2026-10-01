import {
  attachImage,
  insertSiblingAfter,
  pasteMultilineText,
  pasteText,
  requireNode,
  type AttachmentReference,
  type Document,
  type Location,
  type NodeId,
} from '../domain/document'
import type { ClipboardPayload, ClipboardWritePayload } from '../shared/ipc'
import type { StructuralTransition } from './editor-command-transitions'

export interface ClipboardSelectionTransition {
  from: number
  to: number
  payload: ClipboardWritePayload
}

export function clipboardSelectionTransition(
  document: Document,
  nodeId: NodeId,
  start: number,
  end: number,
): ClipboardSelectionTransition | undefined {
  const node = requireNode(document, nodeId).node
  const from = Math.max(0, Math.min(start, end))
  const to = Math.min(node.text.length, Math.max(start, end))
  if (from === to) return undefined
  const text = node.text.slice(from, to)
  // A bogus fallback entry has no numeric range, so the range filter drops it like an absent array.
  const links = (node.links ?? [])
    .filter((link) => link.start >= from && link.end <= to)
    .map((link) => ({ ...link, start: link.start - from, end: link.end - from }))
  return { from, to, payload: { text, html: clipboardHtml(text, links) } }
}

export function textPasteTransition(
  document: Document,
  location: Location,
  nodeId: NodeId,
  cursor: number,
  clipboard: Extract<ClipboardPayload, { kind: 'text' }>,
  createIds: (count: number) => NodeId[],
): StructuralTransition {
  if (!clipboard.text.includes('\n') && !clipboard.text.includes('\r')) {
    return {
      document: pasteText(document, nodeId, cursor, clipboard.text, clipboard.links),
      location,
      focus: { nodeId, cursor: cursor + clipboard.text.length },
    }
  }
  const lines = clipboard.text.replace(/\r\n?/g, '\n').split('\n')
  const ids = createIds(lines.length - 1)
  const finalNodeId = ids.at(-1) ?? nodeId
  return {
    document: pasteMultilineText(document, nodeId, cursor, lines, ids, clipboard.links),
    location: locationForSiblingOf(document, nodeId, finalNodeId, location),
    // `split` always returns at least one line, so the empty fallback only satisfies the type.
    focus: { nodeId: finalNodeId, cursor: (lines.at(-1) ?? '').length },
  }
}

export function imagePasteTransition(
  document: Document,
  location: Location,
  nodeId: NodeId,
  attachment: AttachmentReference,
  createId: () => NodeId,
): StructuralTransition {
  const target = requireNode(document, nodeId).node
  if (target.attachment === undefined) {
    return {
      document: attachImage(document, nodeId, attachment),
      location,
      focus: { nodeId, cursor: target.text.length },
    }
  }
  const newId = createId()
  return {
    document: insertSiblingAfter(document, nodeId, newId, '', attachment),
    location: locationForSiblingOf(document, nodeId, newId, location),
    focus: { nodeId: newId, cursor: 0 },
  }
}

function locationForSiblingOf(
  document: Document,
  nodeId: NodeId,
  selectedNodeId: NodeId,
  location: Location,
): Location {
  if (location.currentParentId !== nodeId) return { ...location, selectedNodeId }
  return { currentParentId: requireNode(document, nodeId).parent?.id ?? null, selectedNodeId }
}

function clipboardHtml(text: string, links: Array<{ start: number; end: number; url: string }>): string {
  const parts: string[] = []
  let position = 0
  for (const link of links) {
    parts.push(escapeClipboardHtml(text.slice(position, link.start)))
    const label = escapeClipboardHtml(text.slice(link.start, link.end))
    parts.push(`<a href="${escapeClipboardHtml(link.url)}">${label}</a>`)
    position = link.end
  }
  parts.push(escapeClipboardHtml(text.slice(position)))
  return parts.join('').replaceAll('\n', '<br>')
}

function escapeClipboardHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
