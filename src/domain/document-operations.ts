import {
  MAX_DOCUMENT_DEPTH,
  type AttachmentReference,
  type BuildNode,
  type Document,
  type LinkRange,
  type LocatedNode,
  type Location,
  type NodeId,
  type TreeNode,
} from './document-types'
import {
  addAttachmentId,
  addAttachmentIds,
  attachmentSummary,
  countAttachmentIdsByTraversal,
  inheritAttachmentIds,
  removeAttachmentIds,
  seedEmptyAttachmentSummary,
  setAttachmentSummary,
} from './document-attachments'
import { locateNode, requireNode, shareIndex } from './document-index'
import { insertLinks, isHttpUrl, linksForLine, normalizeLinks, splitLinks } from './document-links'
import { MAX_DOCUMENT_DEPTH_ERROR } from './product-messages'

export function createInitialDocument(id: NodeId): Document {
  const document: Document = { roots: [{ id, text: '', children: [] }] }
  seedEmptyAttachmentSummary(document)
  return document
}

export function ensureRoot(document: Document, id: NodeId): Document {
  if (document.roots.length > 0) return document
  return createInitialDocument(id)
}

export function cloneDocument(document: Document): Document {
  return { roots: document.roots.map(cloneNode) }
}

export function cloneNode(node: TreeNode): TreeNode {
  const root = cloneNodeShallow(node)
  const stack: Array<{ source: TreeNode; target: BuildNode }> = [{ source: node, target: root }]
  while (stack.length > 0) {
    const { source, target } = stack.pop()!
    for (const child of source.children) {
      const copy = cloneNodeShallow(child)
      target.children.push(copy)
      stack.push({ source: child, target: copy })
    }
  }
  return root
}

function cloneNodeShallow(node: TreeNode): BuildNode {
  return {
    id: node.id,
    text: node.text,
    ...(node.links === undefined ? {} : { links: node.links.map((link) => ({ ...link })) }),
    ...(node.attachment === undefined ? {} : { attachment: { ...node.attachment } }),
    children: [],
  }
}

function copyToRoot(document: Document, located: LocatedNode, nextSiblings: TreeNode[]): Document {
  if (located.parent === null) {
    return { roots: nextSiblings }
  }

  let replacement: TreeNode = { ...located.parent, children: nextSiblings }
  for (let index = located.ancestors.length - 2; index >= 0; index -= 1) {
    const ancestor = located.ancestors[index]!
    const childIndex = ancestor.children.indexOf(located.ancestors[index + 1]!)
    if (childIndex < 0) throw new Error(`Node ${located.node.id} does not exist.`)
    const children = ancestor.children.slice()
    children[childIndex] = replacement
    replacement = { ...ancestor, children }
  }

  const rootIndex = document.roots.indexOf(located.ancestors[0]!)
  if (rootIndex < 0) throw new Error(`Node ${located.node.id} does not exist.`)
  const roots = document.roots.slice()
  roots[rootIndex] = replacement
  return { roots }
}

function replaceNode(document: Document, located: LocatedNode, replacement: TreeNode): Document {
  const siblings = located.siblings.slice()
  siblings[located.index] = replacement
  return copyToRoot(document, located, siblings)
}

function contentReplacement(
  node: TreeNode,
  text: string,
  links: readonly LinkRange[],
  attachment: AttachmentReference | undefined,
): TreeNode {
  return {
    id: node.id,
    text,
    ...(links.length === 0 ? {} : { links }),
    ...(attachment === undefined ? {} : { attachment }),
    children: node.children,
  }
}

export function displayedNodes(document: Document, currentParentId: NodeId | null): readonly TreeNode[] {
  return currentParentId === null ? document.roots : requireNode(document, currentParentId).node.children
}

export function nodePath(document: Document, nodeId: NodeId): readonly TreeNode[] {
  const located = requireNode(document, nodeId)
  return [...located.ancestors, located.node]
}

export function isValidLocation(document: Document, location: Location): boolean {
  const selected = locateNode(document, location.selectedNodeId)
  if (selected === undefined) {
    return false
  }

  if (location.currentParentId === null) {
    return selected.parent === null
  }

  const parent = locateNode(document, location.currentParentId)
  return parent !== undefined && (selected.node.id === parent.node.id || selected.parent?.id === parent.node.id)
}

export function editNodeText(document: Document, nodeId: NodeId, text: string): Document {
  return editNodeContent(document, nodeId, text, [])
}

export function editNodeContent(
  document: Document,
  nodeId: NodeId,
  text: string,
  links: readonly LinkRange[],
): Document {
  const normalized = normalizeLinks(links, text)
  const located = requireNode(document, nodeId)
  const next = replaceNode(
    document,
    located,
    contentReplacement(located.node, text, normalized, located.node.attachment),
  )
  shareIndex(document, next)
  inheritAttachmentIds(document, next)
  return next
}

export function deleteLink(document: Document, nodeId: NodeId, cursor: number): Document | undefined {
  const located = requireNode(document, nodeId)
  const link = located.node.links?.find((candidate) => candidate.end === cursor)
  if (link === undefined) return undefined
  const text = `${located.node.text.slice(0, link.start)}${located.node.text.slice(link.end)}`
  const links = normalizeLinks(
    (located.node.links ?? [])
      .filter((candidate) => candidate !== link)
      .map((candidate) => ({
        ...candidate,
        start: candidate.start >= link.end ? candidate.start - (link.end - link.start) : candidate.start,
        end: candidate.end >= link.end ? candidate.end - (link.end - link.start) : candidate.end,
      })),
    text,
  )
  const next = replaceNode(document, located, contentReplacement(located.node, text, links, located.node.attachment))
  shareIndex(document, next)
  inheritAttachmentIds(document, next)
  return next
}

export function removeTextRange(document: Document, nodeId: NodeId, start: number, end: number): Document {
  const located = requireNode(document, nodeId)
  const from = snapToCodePoint(located.node.text, Math.min(start, end))
  const to = snapToCodePoint(located.node.text, Math.max(start, end))
  let replacement: TreeNode = { ...located.node }
  if (from !== to) {
    const text = `${located.node.text.slice(0, from)}${located.node.text.slice(to)}`
    replacement = contentReplacement(
      located.node,
      text,
      normalizeLinks(
        (located.node.links ?? [])
          .filter((link) => link.end <= from || link.start >= to)
          .map((link) => ({
            ...link,
            start: link.start >= to ? link.start - (to - from) : link.start,
            end: link.end >= to ? link.end - (to - from) : link.end,
          })),
        text,
      ),
      located.node.attachment,
    )
  }
  const next = replaceNode(document, located, replacement)
  shareIndex(document, next)
  inheritAttachmentIds(document, next)
  return next
}

export function insertSiblingAfter(
  document: Document,
  nodeId: NodeId,
  newNodeId: NodeId,
  text = '',
  attachment?: AttachmentReference,
): Document {
  const located = requireNode(document, nodeId)
  const siblings = located.siblings.slice()
  siblings.splice(located.index + 1, 0, {
    id: newNodeId,
    text,
    ...(text.length > 0 && isHttpUrl(text) ? { links: [{ start: 0, end: text.length, url: text }] } : {}),
    ...(attachment === undefined ? {} : { attachment }),
    children: [],
  })
  const next = copyToRoot(document, located, siblings)
  if (attachment === undefined) inheritAttachmentIds(document, next)
  else addAttachmentId(document, next, attachment.id)
  return next
}

export function insertSiblingBefore(document: Document, nodeId: NodeId, newNodeId: NodeId): Document {
  const located = requireNode(document, nodeId)
  const siblings = located.siblings.slice()
  siblings.splice(located.index, 0, { id: newNodeId, text: '', children: [] })
  const next = copyToRoot(document, located, siblings)
  inheritAttachmentIds(document, next)
  return next
}

export function insertSubtreeSibling(
  document: Document,
  nodeId: NodeId,
  position: 'before' | 'after',
  source: TreeNode,
  createId: () => NodeId,
): Document {
  const located = requireNode(document, nodeId)
  const copy = cloneNodeWithFreshIds(source, createId)
  const siblings = located.siblings.slice()
  siblings.splice(located.index + (position === 'after' ? 1 : 0), 0, copy)
  const next = copyToRoot(document, located, siblings)
  addAttachmentIds(document, next, countAttachmentIdsByTraversal([source]))
  return next
}

export function replaceSiblingRange(
  document: Document,
  nodeId: NodeId,
  count: number,
  replacements: readonly TreeNode[],
): Document {
  const located = requireNode(document, nodeId)
  const boundedCount = Math.max(0, Math.min(count, located.siblings.length - located.index))
  const removed = located.siblings.slice(located.index, located.index + boundedCount)
  const siblings = located.siblings.slice()
  siblings.splice(located.index, boundedCount, ...replacements)
  const next = copyToRoot(document, located, siblings)
  const counts = new Map(attachmentSummary(document))
  for (const [id, amount] of countAttachmentIdsByTraversal(removed)) {
    const remaining = (counts.get(id) ?? 0) - amount
    if (remaining > 0) counts.set(id, remaining)
    else counts.delete(id)
  }
  for (const [id, amount] of countAttachmentIdsByTraversal(replacements)) {
    counts.set(id, (counts.get(id) ?? 0) + amount)
  }
  setAttachmentSummary(next, counts)
  return next
}

export function cloneNodeWithNewIds(source: TreeNode, createId: () => NodeId): TreeNode {
  return cloneNodeWithFreshIds(source, createId)
}

function cloneNodeWithFreshIds(source: TreeNode, createId: () => NodeId): TreeNode {
  const root: BuildNode = {
    id: createId(),
    text: source.text,
    ...(source.links === undefined ? {} : { links: source.links.map((link) => ({ ...link })) }),
    ...(source.attachment === undefined ? {} : { attachment: { ...source.attachment } }),
    children: [],
  }
  const stack: Array<{ source: TreeNode; target: BuildNode }> = [{ source, target: root }]
  while (stack.length > 0) {
    const { source: sourceNode, target } = stack.pop()!
    for (const child of sourceNode.children) {
      const copy: BuildNode = {
        id: createId(),
        text: child.text,
        ...(child.links === undefined ? {} : { links: child.links.map((link) => ({ ...link })) }),
        ...(child.attachment === undefined ? {} : { attachment: { ...child.attachment } }),
        children: [],
      }
      target.children.push(copy)
      stack.push({ source: child, target: copy })
    }
  }
  return root
}

export function createFirstChild(document: Document, parentId: NodeId, childId: NodeId): Document {
  const located = requireNode(document, parentId)
  const parentDepth = located.ancestors.length + 1
  if (parentDepth >= MAX_DOCUMENT_DEPTH) {
    throw new Error(MAX_DOCUMENT_DEPTH_ERROR)
  }
  const replacement: TreeNode = {
    ...located.node,
    children: [{ id: childId, text: '', children: [] }, ...located.node.children],
  }
  const next = replaceNode(document, located, replacement)
  inheritAttachmentIds(document, next)
  return next
}

export function splitNode(document: Document, nodeId: NodeId, cursor: number, newNodeId: NodeId): Document {
  const located = requireNode(document, nodeId)
  const position = snapToCodePoint(located.node.text, cursor)
  const suffix = located.node.text.slice(position)
  const links = splitLinks(located.node.links ?? [], position)
  const original = contentReplacement(
    located.node,
    located.node.text.slice(0, position),
    links.before,
    located.node.attachment,
  )
  const siblings = located.siblings.slice()
  siblings[located.index] = original
  siblings.splice(located.index + 1, 0, {
    id: newNodeId,
    text: suffix,
    ...(links.after.length === 0 ? {} : { links: links.after }),
    children: [],
  })
  const next = copyToRoot(document, located, siblings)
  inheritAttachmentIds(document, next)
  return next
}

export function deleteNode(document: Document, nodeId: NodeId): Document {
  const located = requireNode(document, nodeId)
  const removed = countAttachmentIdsByTraversal([located.node])
  const siblings = located.siblings.slice()
  siblings.splice(located.index, 1)
  const next = copyToRoot(document, located, siblings)
  removeAttachmentIds(document, next, removed)
  return next
}

export function moveSibling(document: Document, nodeId: NodeId, destinationIndex: number): Document {
  const located = requireNode(document, nodeId)
  const siblings = located.siblings.slice()
  const [node] = siblings.splice(located.index, 1)
  if (node === undefined) {
    throw new Error(`Node ${nodeId} could not be moved.`)
  }
  siblings.splice(clamp(destinationIndex, 0, siblings.length), 0, node)
  const next = copyToRoot(document, located, siblings)
  inheritAttachmentIds(document, next)
  return next
}

export function pasteText(
  document: Document,
  nodeId: NodeId,
  cursor: number,
  text: string,
  richLinks?: readonly LinkRange[],
): Document {
  const located = requireNode(document, nodeId)
  const position = snapToCodePoint(located.node.text, cursor)
  const replacement = contentReplacement(
    located.node,
    `${located.node.text.slice(0, position)}${text}${located.node.text.slice(position)}`,
    insertLinks(located.node.links ?? [], position, text, richLinks),
    located.node.attachment,
  )
  const next = replaceNode(document, located, replacement)
  shareIndex(document, next)
  inheritAttachmentIds(document, next)
  return next
}

export function pasteMultilineText(
  document: Document,
  nodeId: NodeId,
  cursor: number,
  lines: string[],
  newNodeIds: NodeId[],
  richLinks?: readonly LinkRange[],
): Document {
  if (lines.length < 2 || newNodeIds.length !== lines.length - 1) {
    throw new Error('Multiline paste requires one new node ID for every line after the first.')
  }

  const located = requireNode(document, nodeId)
  const position = snapToCodePoint(located.node.text, cursor)
  const prefix = located.node.text.slice(0, position)
  const suffix = located.node.text.slice(position)
  const attachment = located.node.attachment
  const links = splitLinks(located.node.links ?? [], position)

  const original = contentReplacement(
    located.node,
    `${prefix}${lines[0] ?? ''}`,
    insertLinks(
      links.before,
      position,
      lines[0] ?? '',
      richLinks === undefined ? undefined : linksForLine(richLinks, lines, 0),
    ),
    undefined,
  )

  const created: TreeNode[] = newNodeIds.map((id, index) => {
    const isFinal = index === newNodeIds.length - 1
    const line = lines[index + 1] ?? ''
    const lineLinks = linksForLine(richLinks, lines, index + 1)
    if (richLinks === undefined && isHttpUrl(line)) lineLinks.push({ start: 0, end: line.length, url: line })
    const finalLinks = isFinal
      ? [
          ...lineLinks,
          ...links.after.map((link) => ({ ...link, start: link.start + line.length, end: link.end + line.length })),
        ]
      : lineLinks
    return {
      id,
      text: isFinal ? `${line}${suffix}` : line,
      ...(finalLinks.length === 0 ? {} : { links: finalLinks }),
      ...(isFinal && attachment !== undefined ? { attachment } : {}),
      children: [],
    }
  })
  const siblings = located.siblings.slice()
  siblings[located.index] = original
  siblings.splice(located.index + 1, 0, ...created)
  const next = copyToRoot(document, located, siblings)
  inheritAttachmentIds(document, next)
  return next
}

export function attachImage(document: Document, nodeId: NodeId, attachment: AttachmentReference): Document {
  const located = requireNode(document, nodeId)
  const replacement: TreeNode = { ...located.node, attachment: { ...attachment } }
  const next = replaceNode(document, located, replacement)
  shareIndex(document, next)
  if (located.node.attachment === undefined) {
    addAttachmentId(document, next, attachment.id)
  } else if (located.node.attachment.id === attachment.id) {
    inheritAttachmentIds(document, next)
  }
  return next
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function snapToCodePoint(text: string, cursor: number): number {
  const position = clamp(cursor, 0, text.length)
  if (position > 0 && position < text.length) {
    const before = text.charCodeAt(position - 1)
    const after = text.charCodeAt(position)
    if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) {
      return position - 1
    }
  }
  return position
}
