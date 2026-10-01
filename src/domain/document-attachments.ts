import type { AttachmentId, AttachmentSummary, Document, TreeNode } from './document-types'

const attachmentIdPattern = /^[A-Za-z0-9_-]+$/

export function isValidAttachmentId(value: string): boolean {
  // The regex's + also rejects empty IDs; removing only the length guard is equivalent.
  // Keep the mutators enabled because rejecting nonempty IDs is meaningful.
  return value.length > 0 && attachmentIdPattern.test(value)
}

const attachmentCountCache = new WeakMap<Document, ReadonlyMap<AttachmentId, number>>()

export function collectAttachmentIds(document: Document): Set<AttachmentId> {
  return new Set(attachmentCountsFor(document).keys())
}

export function attachmentSummary(document: Document): AttachmentSummary {
  return attachmentCountsFor(document)
}

export function seedEmptyAttachmentSummary(document: Document): void {
  attachmentCountCache.set(document, new Map())
}

export function setAttachmentSummary(document: Document, counts: ReadonlyMap<AttachmentId, number>): void {
  attachmentCountCache.set(document, counts)
}

function attachmentCountsFor(document: Document): ReadonlyMap<AttachmentId, number> {
  const cached = attachmentCountCache.get(document)
  if (cached !== undefined) return cached
  const counts = countAttachmentIdsByTraversal(document.roots)
  attachmentCountCache.set(document, counts)
  return counts
}

export function inheritAttachmentIds(from: Document, to: Document): void {
  attachmentCountCache.set(to, attachmentCountsFor(from))
}

export function addAttachmentId(from: Document, to: Document, id: AttachmentId): void {
  const counts = new Map(attachmentCountsFor(from))
  counts.set(id, (counts.get(id) ?? 0) + 1)
  attachmentCountCache.set(to, counts)
}

export function addAttachmentIds(from: Document, to: Document, added: ReadonlyMap<AttachmentId, number>): void {
  if (added.size === 0) {
    inheritAttachmentIds(from, to)
    return
  }
  const counts = new Map(attachmentCountsFor(from))
  for (const [id, count] of added) counts.set(id, (counts.get(id) ?? 0) + count)
  attachmentCountCache.set(to, counts)
}

export function removeAttachmentIds(from: Document, to: Document, removed: ReadonlyMap<AttachmentId, number>): void {
  if (removed.size === 0) {
    inheritAttachmentIds(from, to)
    return
  }
  const counts = new Map(attachmentCountsFor(from))
  for (const [id, count] of removed) {
    const remaining = (counts.get(id) ?? 0) - count
    if (remaining > 0) counts.set(id, remaining)
    else counts.delete(id)
  }
  attachmentCountCache.set(to, counts)
}

export function countAttachmentIdsByTraversal(nodes: readonly TreeNode[]): Map<AttachmentId, number> {
  const counts = new Map<AttachmentId, number>()
  const stack = [...nodes]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.attachment !== undefined) {
      counts.set(node.attachment.id, (counts.get(node.attachment.id) ?? 0) + 1)
    }
    for (const child of node.children) {
      stack.push(child)
    }
  }
  return counts
}
