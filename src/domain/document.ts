import { MAX_DOCUMENT_DEPTH_ERROR } from './product-messages'

export type NodeId = string
export type AttachmentId = string
export type AttachmentSummary = ReadonlyMap<AttachmentId, number>

export const MAX_DOCUMENT_DEPTH = 20
export { MAX_DOCUMENT_DEPTH_ERROR }

export interface AttachmentReference {
  id: AttachmentId
  mimeType: 'image/png'
}

export interface LinkRange {
  start: number
  end: number
  url: string
}

export interface TreeNode {
  id: NodeId
  text: string
  links?: LinkRange[]
  attachment?: AttachmentReference
  children: TreeNode[]
}

export interface Document {
  roots: TreeNode[]
}

export interface Location {
  currentParentId: NodeId | null
  selectedNodeId: NodeId
}

export interface PersistedEditorState {
  version: 1 | 2
  document: Document
  location: Location
}

export interface LocatedNode {
  node: TreeNode
  parent: TreeNode | null
  siblings: TreeNode[]
  index: number
  ancestors: TreeNode[]
}

export type NodeIndex = ReadonlyMap<NodeId, NodeId | null>

interface IndexInfo {
  parent: NodeIndex
  siblingIndex: ReadonlyMap<NodeId, number>
}

let cachedIndexDocument: Document | undefined
let cachedIndexInfo: IndexInfo | undefined

const attachmentCountCache = new WeakMap<Document, ReadonlyMap<AttachmentId, number>>()

function buildIndexInfo(document: Document): IndexInfo {
  const parent = new Map<NodeId, NodeId | null>()
  const siblingIndex = new Map<NodeId, number>()
  const stack: TreeNode[] = []
  for (let index = document.roots.length - 1; index >= 0; index -= 1) {
    const root = document.roots[index]!
    parent.set(root.id, null)
    siblingIndex.set(root.id, index)
    stack.push(root)
  }
  while (stack.length > 0) {
    const node = stack.pop()!
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index]!
      parent.set(child.id, node.id)
      siblingIndex.set(child.id, index)
      stack.push(child)
    }
  }
  return { parent, siblingIndex }
}

export function buildNodeIndex(document: Document): NodeIndex {
  return indexInfoFor(document).parent
}

function indexInfoFor(document: Document): IndexInfo {
  if (cachedIndexDocument === document && cachedIndexInfo !== undefined) {
    return cachedIndexInfo
  }
  cachedIndexInfo = buildIndexInfo(document)
  cachedIndexDocument = document
  return cachedIndexInfo
}

function shareIndex(from: Document, to: Document): void {
  if (cachedIndexDocument === from && cachedIndexInfo !== undefined) {
    cachedIndexDocument = to
  }
}

export function createInitialDocument(id: NodeId): Document {
  const document: Document = { roots: [{ id, text: '', children: [] }] }
  attachmentCountCache.set(document, new Map())
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
  const stack: Array<{ source: TreeNode; target: TreeNode }> = [{ source: node, target: root }]
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

function cloneNodeShallow(node: TreeNode): TreeNode {
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

export function locateNode(document: Document, id: NodeId): LocatedNode | undefined {
  const index = indexInfoFor(document)
  if (!index.parent.has(id)) return undefined

  const pathIds: NodeId[] = []
  let cursor: NodeId | null | undefined = id
  while (cursor !== null && cursor !== undefined) {
    pathIds.push(cursor)
    cursor = index.parent.get(cursor) ?? null
  }
  pathIds.reverse()

  const ancestors: TreeNode[] = []
  let parent: TreeNode | null = null
  for (let position = 0; position < pathIds.length; position += 1) {
    const pathId = pathIds[position]!
    const siblings: TreeNode[] = parent === null ? document.roots : parent.children
    const siblingIndex = index.siblingIndex.get(pathId)
    const node = siblingIndex === undefined ? undefined : siblings[siblingIndex]
    if (node === undefined || node.id !== pathId) return undefined
    if (position === pathIds.length - 1) {
      return { node, parent, siblings, index: siblingIndex!, ancestors }
    }
    ancestors.push(node)
    parent = node
  }

  return undefined
}

export function requireNode(document: Document, id: NodeId): LocatedNode {
  const located = locateNode(document, id)
  if (located === undefined) {
    throw new Error(`Node ${id} does not exist.`)
  }
  return located
}

export function displayedNodes(document: Document, currentParentId: NodeId | null): TreeNode[] {
  return currentParentId === null ? document.roots : requireNode(document, currentParentId).node.children
}

export function nodePath(document: Document, nodeId: NodeId): TreeNode[] {
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

export function editNodeContent(document: Document, nodeId: NodeId, text: string, links: LinkRange[]): Document {
  const normalized = normalizeLinks(links, text)
  const located = requireNode(document, nodeId)
  const replacement: TreeNode = { ...located.node, text }
  if (normalized.length === 0) delete replacement.links
  else replacement.links = normalized
  const next = replaceNode(document, located, replacement)
  shareIndex(document, next)
  inheritAttachmentIds(document, next)
  return next
}

export function deleteLink(document: Document, nodeId: NodeId, cursor: number): Document | undefined {
  const located = requireNode(document, nodeId)
  const link = located.node.links?.find((candidate) => candidate.end === cursor)
  if (link === undefined) return undefined
  const text = `${located.node.text.slice(0, link.start)}${located.node.text.slice(link.end)}`
  const replacement: TreeNode = { ...located.node, text }
  setLinks(
    replacement,
    normalizeLinks(
      (located.node.links ?? [])
        .filter((candidate) => candidate !== link)
        .map((candidate) => ({
          ...candidate,
          start: candidate.start >= link.end ? candidate.start - (link.end - link.start) : candidate.start,
          end: candidate.end >= link.end ? candidate.end - (link.end - link.start) : candidate.end,
        })),
      text,
    ),
  )
  const next = replaceNode(document, located, replacement)
  shareIndex(document, next)
  inheritAttachmentIds(document, next)
  return next
}

export function removeTextRange(document: Document, nodeId: NodeId, start: number, end: number): Document {
  const located = requireNode(document, nodeId)
  const from = snapToCodePoint(located.node.text, Math.min(start, end))
  const to = snapToCodePoint(located.node.text, Math.max(start, end))
  const replacement: TreeNode = { ...located.node }
  if (from !== to) {
    replacement.text = `${located.node.text.slice(0, from)}${located.node.text.slice(to)}`
    setLinks(
      replacement,
      normalizeLinks(
        (located.node.links ?? [])
          .filter((link) => link.end <= from || link.start >= to)
          .map((link) => ({
            ...link,
            start: link.start >= to ? link.start - (to - from) : link.start,
            end: link.end >= to ? link.end - (to - from) : link.end,
          })),
        replacement.text,
      ),
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
  const original: TreeNode = { ...located.node, text: located.node.text.slice(0, position) }
  setLinks(original, links.before)
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
  richLinks?: LinkRange[],
): Document {
  const located = requireNode(document, nodeId)
  const position = snapToCodePoint(located.node.text, cursor)
  const replacement: TreeNode = {
    ...located.node,
    text: `${located.node.text.slice(0, position)}${text}${located.node.text.slice(position)}`,
  }
  setLinks(replacement, insertLinks(located.node.links ?? [], position, text, richLinks))
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
  richLinks?: LinkRange[],
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

  const original: TreeNode = { ...located.node, text: `${prefix}${lines[0] ?? ''}` }
  setLinks(
    original,
    insertLinks(
      links.before,
      position,
      lines[0] ?? '',
      richLinks === undefined ? undefined : linksForLine(richLinks, lines, 0),
    ),
  )
  delete original.attachment

  const created: TreeNode[] = newNodeIds.map((id, index) => ({
    id,
    text: index === newNodeIds.length - 1 ? `${lines[index + 1] ?? ''}${suffix}` : (lines[index + 1] ?? ''),
    ...(() => {
      const line = lines[index + 1] ?? ''
      const lineLinks = linksForLine(richLinks, lines, index + 1)
      if (richLinks === undefined && isHttpUrl(line)) lineLinks.push({ start: 0, end: line.length, url: line })
      const finalLinks =
        index === newNodeIds.length - 1
          ? [
              ...lineLinks,
              ...links.after.map((link) => ({ ...link, start: link.start + line.length, end: link.end + line.length })),
            ]
          : lineLinks
      return finalLinks.length === 0 ? {} : { links: finalLinks }
    })(),
    children: [],
  }))
  const finalNode = created.at(-1)
  if (finalNode !== undefined && attachment !== undefined) {
    finalNode.attachment = attachment
  }
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

export function collectAttachmentIds(document: Document): Set<AttachmentId> {
  return new Set(attachmentCountsFor(document).keys())
}

export function attachmentSummary(document: Document): AttachmentSummary {
  return attachmentCountsFor(document)
}

function attachmentCountsFor(document: Document): ReadonlyMap<AttachmentId, number> {
  const cached = attachmentCountCache.get(document)
  if (cached !== undefined) return cached
  const counts = countAttachmentIdsByTraversal(document.roots)
  attachmentCountCache.set(document, counts)
  return counts
}

function inheritAttachmentIds(from: Document, to: Document): void {
  attachmentCountCache.set(to, attachmentCountsFor(from))
}

function addAttachmentId(from: Document, to: Document, id: AttachmentId): void {
  const counts = new Map(attachmentCountsFor(from))
  counts.set(id, (counts.get(id) ?? 0) + 1)
  attachmentCountCache.set(to, counts)
}

function removeAttachmentIds(from: Document, to: Document, removed: ReadonlyMap<AttachmentId, number>): void {
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

function countAttachmentIdsByTraversal(nodes: readonly TreeNode[]): Map<AttachmentId, number> {
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

export function serializeState(document: Document, location: Location): PersistedEditorState {
  assertDocument(document)
  if (!isValidLocation(document, location)) {
    throw new Error('The selected node is not valid for the persisted location.')
  }
  return { version: 2, document, location: { ...location } }
}

export function validatePersistedState(value: unknown): PersistedEditorState {
  if (
    !isRecord(value) ||
    (value.version !== 1 && value.version !== 2) ||
    !isRecord(value.document) ||
    !isRecord(value.location)
  ) {
    throw new Error('The saved document has an unsupported format.')
  }

  const roots = value.document.roots
  if (!Array.isArray(roots)) {
    throw new Error('Node children must be an array.')
  }
  walkNodes(roots, new Set(), false)
  if (roots.length === 0) {
    throw new Error('The saved document must contain at least one root node.')
  }
  const currentParentId = value.location.currentParentId
  const selectedNodeId = value.location.selectedNodeId
  if ((typeof currentParentId !== 'string' && currentParentId !== null) || typeof selectedNodeId !== 'string') {
    throw new Error('The saved document location is invalid.')
  }
  if (!isValidLocation(value.document as unknown as Document, { currentParentId, selectedNodeId })) {
    throw new Error('The saved document location does not match its tree.')
  }
  return value as unknown as PersistedEditorState
}

export function parsePersistedState(value: unknown): PersistedEditorState {
  if (
    !isRecord(value) ||
    (value.version !== 1 && value.version !== 2) ||
    !isRecord(value.document) ||
    !isRecord(value.location)
  ) {
    throw new Error('The saved document has an unsupported format.')
  }

  const document: Document = { roots: parseNodes(value.document.roots, new Set()) }
  if (document.roots.length === 0) {
    throw new Error('The saved document must contain at least one root node.')
  }
  const currentParentId = value.location.currentParentId
  const selectedNodeId = value.location.selectedNodeId
  if ((typeof currentParentId !== 'string' && currentParentId !== null) || typeof selectedNodeId !== 'string') {
    throw new Error('The saved document location is invalid.')
  }
  const location = { currentParentId, selectedNodeId }
  if (!isValidLocation(document, location)) {
    throw new Error('The saved document location does not match its tree.')
  }
  return { version: 2, document, location }
}

export function assertDocument(document: Document): void {
  if (!Array.isArray(document.roots) || document.roots.length === 0) {
    throw new Error('A document must contain at least one root node.')
  }
  walkNodes(document.roots, new Set(), false)
}

function parseNodes(value: unknown, nodeIds: Set<NodeId>): TreeNode[] {
  return walkNodes(value, nodeIds, true)
}

function walkNodes(value: unknown, nodeIds: Set<NodeId>, build: false): void
function walkNodes(value: unknown, nodeIds: Set<NodeId>, build: true): TreeNode[]
function walkNodes(value: unknown, nodeIds: Set<NodeId>, build: boolean): TreeNode[] | undefined {
  if (!Array.isArray(value)) {
    throw new Error('Node children must be an array.')
  }

  const output: TreeNode[] | undefined = build ? [] : undefined
  const stack: Array<{ input: unknown[]; index: number; output: TreeNode[] | undefined; depth: number }> = [
    { input: value, index: 0, output, depth: 1 },
  ]

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!
    if (frame.index >= frame.input.length) {
      stack.pop()
      continue
    }
    const candidate = frame.input[frame.index]
    frame.index += 1
    if (frame.depth > MAX_DOCUMENT_DEPTH) {
      throw new Error(MAX_DOCUMENT_DEPTH_ERROR)
    }
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== 'string' ||
      candidate.id.length === 0 ||
      typeof candidate.text !== 'string'
    ) {
      throw new Error('A saved node is invalid.')
    }
    if (nodeIds.has(candidate.id)) {
      throw new Error('Node IDs must be unique.')
    }
    nodeIds.add(candidate.id)
    const attachment = parseAttachment(candidate.attachment)
    const links = parseLinks(candidate.links, candidate.text)
    const children = candidate.children
    if (!Array.isArray(children)) {
      throw new Error('Node children must be an array.')
    }
    let childOutput: TreeNode[] | undefined
    if (frame.output !== undefined) {
      const node: TreeNode = {
        id: candidate.id,
        text: candidate.text,
        ...(links.length === 0 ? {} : { links }),
        ...(attachment === undefined ? {} : { attachment }),
        children: [],
      }
      frame.output.push(node)
      childOutput = node.children
    }
    stack.push({ input: children, index: 0, output: childOutput, depth: frame.depth + 1 })
  }

  return output
}

function parseLinks(value: unknown, text: string): LinkRange[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('Saved links are invalid.')
  return normalizeLinks(
    value.map((candidate) => {
      if (
        !isRecord(candidate) ||
        !Number.isInteger(candidate.start) ||
        !Number.isInteger(candidate.end) ||
        typeof candidate.url !== 'string'
      ) {
        throw new Error('Saved links are invalid.')
      }
      return { start: candidate.start as number, end: candidate.end as number, url: candidate.url }
    }),
    text,
  )
}

function parseAttachment(value: unknown): AttachmentReference | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0 || value.mimeType !== 'image/png') {
    throw new Error('A saved attachment is invalid.')
  }
  return { id: value.id, mimeType: value.mimeType }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

export function normalizeLinks(links: LinkRange[], text: string, requireMatchingText = true): LinkRange[] {
  const sorted = links
    .filter(
      (link) =>
        link.start >= 0 &&
        link.end > link.start &&
        link.end <= text.length &&
        (!requireMatchingText || text.slice(link.start, link.end) === link.url) &&
        isHttpUrl(link.url),
    )
    .sort((a, b) => a.start - b.start)
  const result: LinkRange[] = []
  for (const link of sorted) {
    if ((result.at(-1)?.end ?? 0) > link.start) continue
    result.push({ ...link })
  }
  return result
}

function insertLinks(
  links: LinkRange[],
  position: number,
  insertedText: string,
  insertedLinks?: LinkRange[],
): LinkRange[] {
  const delta = insertedText.length
  const inserted =
    insertedLinks === undefined
      ? isHttpUrl(insertedText)
        ? [{ start: position, end: position + delta, url: insertedText }]
        : []
      : insertedLinks
          .filter((link) => insertedText.slice(link.start, link.end) === link.url)
          .map((link) => ({ ...link, start: link.start + position, end: link.end + position }))
  return normalizeLinks(
    [
      ...links.map((link) => ({
        ...link,
        start: link.start >= position ? link.start + delta : link.start,
        end: link.end > position ? link.end + delta : link.end,
      })),
      ...inserted,
    ],
    ' '.repeat(Math.max(position + delta, ...links.map((link) => link.end + delta), 0)),
    false,
  )
}

function linksForLine(links: LinkRange[] | undefined, lines: string[], lineIndex: number): LinkRange[] {
  if (links === undefined) return []
  let lineStart = 0
  for (let index = 0; index < lineIndex; index += 1) lineStart += (lines[index] ?? '').length + 1
  const lineEnd = lineStart + (lines[lineIndex] ?? '').length
  return links
    .filter((link) => link.start >= lineStart && link.end <= lineEnd)
    .map((link) => ({ ...link, start: link.start - lineStart, end: link.end - lineStart }))
}

function splitLinks(links: LinkRange[], position: number): { before: LinkRange[]; after: LinkRange[] } {
  return {
    before: links.filter((link) => link.end <= position).map((link) => ({ ...link })),
    after: links
      .filter((link) => link.start >= position)
      .map((link) => ({ ...link, start: link.start - position, end: link.end - position })),
  }
}

function setLinks(node: TreeNode, links: LinkRange[]): void {
  if (links.length === 0) delete node.links
  else node.links = links
}
