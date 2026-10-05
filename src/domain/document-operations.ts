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
    ...(node.struckThrough === true ? { struckThrough: true as const } : {}),
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
    // requireNode derives this path from the same immutable tree; these missing-slot
    // errors defend inconsistent internal paths, not reachable document commands.
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
    ...(node.struckThrough === true ? { struckThrough: true as const } : {}),
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

/**
 * A location is valid when `selectedNodeId` is `currentParentId` itself (the editable heading) or
 * any descendant of it, at any depth — not only a direct child. Inline expansion can display and
 * select a descendant several levels below the current parent (`docs/PRODUCT.md` §2.4) while the
 * current parent stays what it was; only entering a node changes it.
 */
export function isValidLocation(document: Document, location: Location): boolean {
  const selected = locateNode(document, location.selectedNodeId)
  if (selected === undefined) {
    return false
  }

  if (location.currentParentId === null) {
    return true
  }

  const parent = locateNode(document, location.currentParentId)
  if (parent === undefined) return false
  return selected.node.id === parent.node.id || selected.ancestors.some((ancestor) => ancestor.id === parent.node.id)
}

/**
 * Where the caret belongs when the selected node may be hidden by a collapsed ancestor (application
 * startup and the fold commands, `docs/PRODUCT.md` §2.4). A `selectedNodeId` may be a descendant
 * several levels below `currentParentId`; it is displayed only while every ancestor between the
 * current parent and it is expanded. Otherwise this selects the outermost collapsed ancestor on that
 * path, which is the nearest displayed row, so the caret always lands on a rendered row. A displayed
 * selection, including the heading itself, is returned unchanged.
 */
export function normalizeVisibleLocation(
  document: Document,
  location: Location,
  isExpanded: (nodeId: NodeId) => boolean,
): Location {
  const selected = requireNode(document, location.selectedNodeId)
  // Omitting the heading fast path still returns it through the parentDepth === -1 guard.
  if (selected.node.id === location.currentParentId) return location
  const parentDepth =
    // Looking for a null ancestor ID also gives -1, so omitting only this null branch agrees.
    location.currentParentId === null
      ? -1
      : selected.ancestors.findIndex((ancestor) => ancestor.id === location.currentParentId)
  // A non-ancestor parent is an invalid location, rejected before normal product callers enter here.
  if (location.currentParentId !== null && parentDepth === -1) return location
  for (let index = parentDepth + 1; index < selected.ancestors.length; index += 1) {
    const ancestor = selected.ancestors[index]!
    if (!isExpanded(ancestor.id)) return { ...location, selectedNodeId: ancestor.id }
  }
  return location
}

export function editNodeText(document: Document, nodeId: NodeId, text: string): Document {
  // A non-range element added to this empty array is discarded by normalizeLinks.
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
    // Without the filter, the removed range becomes empty and normalization drops it.
    // The fallback array is unreachable once a link was found. For normalized disjoint
    // ranges, no other link ends at the deleted link's end, so >= versus > also agrees.
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
  // For a zero-width range, the normal content path returns the same normalized content;
  // only allocation differs. Empty fallback junk is filtered out before normalization.
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
            // A retained nonempty link ending at to can only precede a zero-width edit.
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
    // isHttpUrl rejects empty text independently; removing just the length check is equivalent.
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

/**
 * Height of a subtree: 1 for a leaf, plus one for each nested level below it. The depth invariant
 * uses this together with `wouldExceedMaximumDepth` to keep every insertion within
 * `MAX_DOCUMENT_DEPTH`.
 */
export function subtreeHeight(node: TreeNode): number {
  let maximum = 0
  const stack: Array<{ node: TreeNode; depth: number }> = [{ node, depth: 1 }]
  while (stack.length > 0) {
    const entry = stack.pop()!
    maximum = Math.max(maximum, entry.depth)
    for (const child of entry.node.children) stack.push({ node: child, depth: entry.depth + 1 })
  }
  return maximum
}

/**
 * Whether inserting `roots` as siblings of `nodeId` would place any node below `MAX_DOCUMENT_DEPTH`.
 * The roots land at the target's own depth, so each root's subtree may extend only to the limit.
 */
export function wouldExceedMaximumDepth(document: Document, nodeId: NodeId, roots: readonly TreeNode[]): boolean {
  const targetDepth = requireNode(document, nodeId).ancestors.length + 1
  return roots.some((root) => targetDepth + subtreeHeight(root) - 1 > MAX_DOCUMENT_DEPTH)
}

export function insertSubtreeSibling(
  document: Document,
  nodeId: NodeId,
  position: 'before' | 'after',
  source: TreeNode,
  createId: () => NodeId,
): Document {
  const located = requireNode(document, nodeId)
  if (wouldExceedMaximumDepth(document, nodeId, [source])) {
    throw new Error(MAX_DOCUMENT_DEPTH_ERROR)
  }
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
  if (wouldExceedMaximumDepth(document, nodeId, replacements)) {
    throw new Error(MAX_DOCUMENT_DEPTH_ERROR)
  }
  // Stryker disable next-line ArithmeticOperator: Increasing the bound cannot change the result; slice and splice both clamp at the end of the same sibling array.
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
    ...(source.struckThrough === true ? { struckThrough: true as const } : {}),
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
        ...(child.struckThrough === true ? { struckThrough: true as const } : {}),
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
  // Empty fallback junk lacks offsets and is discarded by both splitLinks filters.
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
  // requireNode proves that this slot exists in the same immutable siblings array.
  if (node === undefined) {
    throw new Error(`Node ${nodeId} could not be moved.`)
  }
  siblings.splice(clamp(destinationIndex, 0, siblings.length), 0, node)
  const next = copyToRoot(document, located, siblings)
  inheritAttachmentIds(document, next)
  return next
}

export type SubtreeMove = { kind: 'moved'; document: Document } | { kind: 'impossible' } | { kind: 'too-deep' }

/**
 * Moves a node with its subtree under `parentId` (`null` for the document root), so that it ends at
 * `index` among that parent's children as counted after the node is removed from its old place, like
 * `moveSibling`; an out-of-range index is clamped. IDs, order, and descendants are kept, and
 * attachments are only moved, so the attachment summary carries over. `impossible` means an unknown
 * node or parent, or a parent that is the node itself or one of its descendants; `too-deep` means the
 * moved subtree would fall below `MAX_DOCUMENT_DEPTH`. Only the two affected root-to-array paths are
 * copied, so every other subtree stays shared by reference.
 */
export function moveSubtree(document: Document, nodeId: NodeId, parentId: NodeId | null, index: number): SubtreeMove {
  const source = locateNode(document, nodeId)
  if (source === undefined) return { kind: 'impossible' }
  const destination = parentId === null ? null : locateNode(document, parentId)
  if (destination === undefined) return { kind: 'impossible' }
  if (
    destination !== null &&
    (destination.node.id === nodeId || destination.ancestors.some((ancestor) => ancestor.id === nodeId))
  ) {
    return { kind: 'impossible' }
  }
  const landingDepth = destination === null ? 1 : destination.ancestors.length + 2
  if (landingDepth + subtreeHeight(source.node) - 1 > MAX_DOCUMENT_DEPTH) return { kind: 'too-deep' }

  const sourceParentId = source.parent?.id ?? null
  // Every node on the way to the source parent or the destination parent has to be copied.
  const pathIds = new Set<NodeId>(source.ancestors.map((ancestor) => ancestor.id))
  if (destination !== null) {
    for (const ancestor of destination.ancestors) pathIds.add(ancestor.id)
    pathIds.add(destination.node.id)
  }

  const rewrite = (ownerId: NodeId | null, children: readonly TreeNode[]): readonly TreeNode[] => {
    const next = children.slice()
    for (const [position, child] of children.entries()) {
      if (pathIds.has(child.id)) next[position] = { ...child, children: rewrite(child.id, child.children) }
    }
    if (ownerId === sourceParentId) next.splice(source.index, 1)
    if (ownerId === parentId) next.splice(clamp(index, 0, next.length), 0, source.node)
    return next
  }

  const next: Document = { roots: rewrite(null, document.roots) as TreeNode[] }
  inheritAttachmentIds(document, next)
  return { kind: 'moved', document: next }
}

export type SiblingRangeShift = { kind: 'moved'; document: Document } | { kind: 'impossible' } | { kind: 'too-deep' }

/**
 * Moves `count` consecutive siblings starting at `firstId` one level. `in` appends them to the
 * children of the sibling before the range; `out` places them directly after their parent. Order,
 * IDs, and descendants are kept, and attachments are only moved, so the attachment summary carries
 * over. `impossible` means the range has no preceding sibling (`in`), no parent (`out`), or does not
 * fit in the sibling array; `too-deep` means a moved subtree would fall below `MAX_DOCUMENT_DEPTH`.
 */
export function shiftSiblingRange(
  document: Document,
  firstId: NodeId,
  count: number,
  direction: 'in' | 'out',
): SiblingRangeShift {
  const located = requireNode(document, firstId)
  if (count < 1 || located.index + count > located.siblings.length) return { kind: 'impossible' }
  const range = located.siblings.slice(located.index, located.index + count)
  if (direction === 'in') {
    const target = located.siblings[located.index - 1]
    if (target === undefined) return { kind: 'impossible' }
    // The range lands one level deeper than where it stands now.
    const depth = located.ancestors.length + 2
    if (range.some((node) => depth + subtreeHeight(node) - 1 > MAX_DOCUMENT_DEPTH)) return { kind: 'too-deep' }
    const siblings = located.siblings.slice(0, located.index - 1)
    siblings.push({ ...target, children: [...target.children, ...range] })
    siblings.push(...located.siblings.slice(located.index + count))
    const next = copyToRoot(document, located, siblings)
    inheritAttachmentIds(document, next)
    return { kind: 'moved', document: next }
  }
  const parent = located.parent
  if (parent === null) return { kind: 'impossible' }
  const parentLocated = requireNode(document, parent.id)
  const remaining = [...parent.children.slice(0, located.index), ...parent.children.slice(located.index + count)]
  const siblings = parentLocated.siblings.slice()
  siblings.splice(parentLocated.index, 1, { ...parent, children: remaining }, ...range)
  const next = copyToRoot(document, parentLocated, siblings)
  inheritAttachmentIds(document, next)
  return { kind: 'moved', document: next }
}

export type SiblingRangeJoin =
  { kind: 'joined'; document: Document; cursor: number } | { kind: 'impossible' } | { kind: 'attachments' }

/**
 * Joins `count` consecutive siblings starting at `firstId` into the first one (`docs/PRODUCT.md`
 * §20.2.1 T6). The first node keeps its ID, attachment, and links; the texts are concatenated, with
 * hyperlink ranges moving with their text, and the children of every joined node follow in sibling
 * order with their IDs and subtrees intact. With `spaced`, each join first removes the earlier text's
 * trailing and the later text's leading whitespace and then inserts one space when both remain
 * non-empty. `cursor` is the offset of the first join point after trimming. `impossible` means fewer
 * than two nodes are available; `attachments` means two or more of the joined nodes carry one.
 * Children keep their depth, so a join cannot exceed `MAX_DOCUMENT_DEPTH`, and the attachment
 * multiset is unchanged because the only removed attachment is carried by the retained node.
 */
export function joinSiblingRange(
  document: Document,
  firstId: NodeId,
  count: number,
  spaced: boolean,
): SiblingRangeJoin {
  const located = requireNode(document, firstId)
  if (count < 2 || located.index + count > located.siblings.length) return { kind: 'impossible' }
  const range = located.siblings.slice(located.index, located.index + count)
  const attached = range.filter((node) => node.attachment !== undefined)
  if (attached.length > 1) return { kind: 'attachments' }
  const first = range[0]!
  // The pieces are joined once at the end and each step only touches the tail, so the cost stays
  // linear in the total text length however many nodes are joined.
  const parts: string[] = [first.text]
  let length = first.text.length
  let links: LinkRange[] = [...(first.links ?? [])]
  let cursor = 0
  const children: TreeNode[] = []
  for (const [index, node] of range.entries()) {
    for (const child of node.children) children.push(child)
    if (index === 0) continue
    let right = node.text
    let leading = 0
    if (spaced) {
      const before = length
      while (parts.length > 0) {
        const last = parts.pop()!
        length -= last.length
        const trimmed = last.replace(/\s+$/u, '')
        if (trimmed !== '') {
          parts.push(trimmed)
          length += trimmed.length
          break
        }
      }
      if (length < before) links = links.filter((link) => link.end <= length)
      const trimmedRight = right.replace(/^\s+/u, '')
      leading = right.length - trimmedRight.length
      right = trimmedRight
    }
    const separator = spaced && length > 0 && right !== '' ? ' ' : ''
    if (index === 1) cursor = length
    const shift = length + separator.length - leading
    for (const link of node.links ?? [])
      if (link.start >= leading) links.push({ ...link, start: link.start + shift, end: link.end + shift })
    parts.push(separator, right)
    length += separator.length + right.length
  }
  const text = parts.join('')
  const merged = contentReplacement({ ...first, children }, text, normalizeLinks(links, text), attached[0]?.attachment)
  const siblings = located.siblings.slice()
  siblings.splice(located.index, count, merged)
  const next = copyToRoot(document, located, siblings)
  inheritAttachmentIds(document, next)
  return { kind: 'joined', document: next, cursor }
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

  // Validated line/ID counts and dense split lines make the missing-line fallbacks
  // unreachable. Empty fallback link junk is discarded by splitLinks' range filters.
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

/**
 * Toggles the strikethrough of the sibling range between `anchorId` and `focusId`, inclusive, in
 * either order (`docs/PRODUCT.md` §2.5). A range whose every node is struck through returns to
 * normal; any other range becomes struck through. Only the range's own nodes change: their text,
 * links, attachment, and children are kept, and every child subtree stays shared by reference.
 * Returns `undefined` when the two nodes are not siblings.
 */
export function toggleStrikethrough(document: Document, anchorId: NodeId, focusId: NodeId): Document | undefined {
  const located = requireNode(document, anchorId)
  const focus = located.siblings.findIndex((node) => node.id === focusId)
  if (focus < 0) return undefined
  const start = Math.min(located.index, focus)
  const end = Math.max(located.index, focus)
  const range = located.siblings.slice(start, end + 1)
  const strike = !range.every((node) => node.struckThrough === true)
  const siblings = located.siblings.slice()
  for (const [offset, node] of range.entries()) {
    siblings[start + offset] = {
      id: node.id,
      text: node.text,
      ...(node.links === undefined ? {} : { links: node.links }),
      ...(node.attachment === undefined ? {} : { attachment: node.attachment }),
      ...(strike ? { struckThrough: true as const } : {}),
      children: node.children,
    }
  }
  const next = copyToRoot(document, located, siblings)
  shareIndex(document, next)
  inheritAttachmentIds(document, next)
  return next
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function snapToCodePoint(text: string, cursor: number): number {
  const position = clamp(cursor, 0, text.length)
  // Always-true and inclusive endpoint guards are equivalent; keep their mutators enabled because other replacements remove valid surrogate snapping.
  // Stryker disable next-line LogicalOperator: Replacing && with || only adds endpoints, where charCodeAt returns NaN for the missing neighbor and cannot snap.
  if (position > 0 && position < text.length) {
    const before = text.charCodeAt(position - 1)
    const after = text.charCodeAt(position)
    if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) {
      return position - 1
    }
  }
  return position
}
