export type NodeId = string
export type AttachmentId = string

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

export function createInitialDocument(id: NodeId): Document {
  return { roots: [{ id, text: '', children: [] }] }
}

export function ensureRoot(document: Document, id: NodeId): Document {
  if (document.roots.length > 0) {
    return cloneDocument(document)
  }
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

export function locateNode(document: Document, id: NodeId): LocatedNode | undefined {
  const parents = new Map<TreeNode, TreeNode | null>()
  const stack: TreeNode[] = []
  for (let index = document.roots.length - 1; index >= 0; index -= 1) {
    const node = document.roots[index]!
    parents.set(node, null)
    stack.push(node)
  }

  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.id === id) {
      const parent = parents.get(node) ?? null
      const siblings = parent === null ? document.roots : parent.children
      const ancestors: TreeNode[] = []
      let current = parent
      while (current !== null) {
        ancestors.push(current)
        current = parents.get(current) ?? null
      }
      ancestors.reverse()
      return { node, parent, siblings, index: siblings.indexOf(node), ancestors }
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index]!
      parents.set(child, node)
      stack.push(child)
    }
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
  let replacement: TreeNode = {
    ...located.node,
    text,
    ...(normalized.length === 0 ? { links: undefined } : { links: normalized }),
  }

  for (let index = located.ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = located.ancestors[index]!
    const childId = index === located.ancestors.length - 1 ? nodeId : located.ancestors[index + 1]!.id
    const childIndex = ancestor.children.findIndex((child) => child.id === childId)
    if (childIndex < 0) throw new Error(`Node ${nodeId} does not exist.`)
    const children = ancestor.children.slice()
    children[childIndex] = replacement
    replacement = { ...ancestor, children }
  }

  const rootIndex = document.roots.findIndex((root) => root.id === (located.ancestors[0]?.id ?? nodeId))
  if (rootIndex < 0) throw new Error(`Node ${nodeId} does not exist.`)
  const roots = document.roots.slice()
  roots[rootIndex] = replacement
  return { roots }
}

export function deleteLink(document: Document, nodeId: NodeId, cursor: number): Document | undefined {
  const next = cloneDocument(document)
  const node = requireNode(next, nodeId).node
  const link = node.links?.find((candidate) => candidate.end === cursor)
  if (link === undefined) return undefined
  node.text = `${node.text.slice(0, link.start)}${node.text.slice(link.end)}`
  setLinks(
    node,
    normalizeLinks(
      (node.links ?? [])
        .filter((candidate) => candidate !== link)
        .map((candidate) => ({
          ...candidate,
          start: candidate.start >= link.end ? candidate.start - (link.end - link.start) : candidate.start,
          end: candidate.end >= link.end ? candidate.end - (link.end - link.start) : candidate.end,
        })),
      node.text,
    ),
  )
  return next
}

export function removeTextRange(document: Document, nodeId: NodeId, start: number, end: number): Document {
  const next = cloneDocument(document)
  const node = requireNode(next, nodeId).node
  const from = snapToCodePoint(node.text, Math.min(start, end))
  const to = snapToCodePoint(node.text, Math.max(start, end))
  if (from === to) return next
  node.text = `${node.text.slice(0, from)}${node.text.slice(to)}`
  setLinks(
    node,
    normalizeLinks(
      (node.links ?? [])
        .filter((link) => link.end <= from || link.start >= to)
        .map((link) => ({
          ...link,
          start: link.start >= to ? link.start - (to - from) : link.start,
          end: link.end >= to ? link.end - (to - from) : link.end,
        })),
      node.text,
    ),
  )
  return next
}

export function insertSiblingAfter(
  document: Document,
  nodeId: NodeId,
  newNodeId: NodeId,
  text = '',
  attachment?: AttachmentReference,
): Document {
  const next = cloneDocument(document)
  const located = requireNode(next, nodeId)
  located.siblings.splice(located.index + 1, 0, {
    id: newNodeId,
    text,
    ...(text.length > 0 && isHttpUrl(text) ? { links: [{ start: 0, end: text.length, url: text }] } : {}),
    ...(attachment === undefined ? {} : { attachment }),
    children: [],
  })
  return next
}

export function insertSiblingBefore(document: Document, nodeId: NodeId, newNodeId: NodeId): Document {
  const next = cloneDocument(document)
  const located = requireNode(next, nodeId)
  located.siblings.splice(located.index, 0, { id: newNodeId, text: '', children: [] })
  return next
}

export function createFirstChild(document: Document, parentId: NodeId, childId: NodeId): Document {
  const next = cloneDocument(document)
  requireNode(next, parentId).node.children.unshift({ id: childId, text: '', children: [] })
  return next
}

export function splitNode(document: Document, nodeId: NodeId, cursor: number, newNodeId: NodeId): Document {
  const next = cloneDocument(document)
  const located = requireNode(next, nodeId)
  const position = snapToCodePoint(located.node.text, cursor)
  const suffix = located.node.text.slice(position)
  const links = splitLinks(located.node.links ?? [], position)
  located.node.text = located.node.text.slice(0, position)
  setLinks(located.node, links.before)
  located.siblings.splice(located.index + 1, 0, {
    id: newNodeId,
    text: suffix,
    ...(links.after.length === 0 ? {} : { links: links.after }),
    children: [],
  })
  return next
}

export function deleteNode(document: Document, nodeId: NodeId): Document {
  const next = cloneDocument(document)
  const located = requireNode(next, nodeId)
  located.siblings.splice(located.index, 1)
  return next
}

export function moveSibling(document: Document, nodeId: NodeId, destinationIndex: number): Document {
  const next = cloneDocument(document)
  const located = requireNode(next, nodeId)
  const [node] = located.siblings.splice(located.index, 1)
  if (node === undefined) {
    throw new Error(`Node ${nodeId} could not be moved.`)
  }
  located.siblings.splice(clamp(destinationIndex, 0, located.siblings.length), 0, node)
  return next
}

export function pasteText(
  document: Document,
  nodeId: NodeId,
  cursor: number,
  text: string,
  richLinks?: LinkRange[],
): Document {
  const next = cloneDocument(document)
  const node = requireNode(next, nodeId).node
  const position = snapToCodePoint(node.text, cursor)
  node.text = `${node.text.slice(0, position)}${text}${node.text.slice(position)}`
  setLinks(node, insertLinks(node.links ?? [], position, text, richLinks))
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

  const next = cloneDocument(document)
  const located = requireNode(next, nodeId)
  const position = snapToCodePoint(located.node.text, cursor)
  const prefix = located.node.text.slice(0, position)
  const suffix = located.node.text.slice(position)
  const attachment = located.node.attachment
  const links = splitLinks(located.node.links ?? [], position)

  located.node.text = `${prefix}${lines[0] ?? ''}`
  setLinks(
    located.node,
    insertLinks(
      links.before,
      position,
      lines[0] ?? '',
      richLinks === undefined ? undefined : linksForLine(richLinks, lines, 0),
    ),
  )
  delete located.node.attachment

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
  located.siblings.splice(located.index + 1, 0, ...created)
  return next
}

export function attachImage(document: Document, nodeId: NodeId, attachment: AttachmentReference): Document {
  const next = cloneDocument(document)
  requireNode(next, nodeId).node.attachment = { ...attachment }
  return next
}

export function collectAttachmentIds(document: Document): Set<AttachmentId> {
  const ids = new Set<AttachmentId>()
  const stack = [...document.roots]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.attachment !== undefined) {
      ids.add(node.attachment.id)
    }
    for (const child of node.children) {
      stack.push(child)
    }
  }
  return ids
}

export function serializeState(document: Document, location: Location): PersistedEditorState {
  assertDocument(document)
  if (!isValidLocation(document, location)) {
    throw new Error('The selected node is not valid for the persisted location.')
  }
  return { version: 2, document: cloneDocument(document), location: { ...location } }
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
  parseNodes(document.roots, new Set())
}

function parseNodes(value: unknown, nodeIds: Set<NodeId>): TreeNode[] {
  if (!Array.isArray(value)) {
    throw new Error('Node children must be an array.')
  }

  const output: TreeNode[] = []
  const stack: Array<{ input: unknown[]; index: number; output: TreeNode[] }> = [{ input: value, index: 0, output }]

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!
    if (frame.index >= frame.input.length) {
      stack.pop()
      continue
    }
    const candidate = frame.input[frame.index]
    frame.index += 1
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
    const node: TreeNode = {
      id: candidate.id,
      text: candidate.text,
      ...(links.length === 0 ? {} : { links }),
      ...(attachment === undefined ? {} : { attachment }),
      children: [],
    }
    frame.output.push(node)
    stack.push({ input: children, index: 0, output: node.children })
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
