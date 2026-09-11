export type NodeId = string
export type AttachmentId = string

export interface AttachmentReference {
  id: AttachmentId
  mimeType: 'image/png'
}

export interface TreeNode {
  id: NodeId
  text: string
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
  version: 1
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
  const next = cloneDocument(document)
  requireNode(next, nodeId).node.text = text
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
  located.siblings.splice(located.index + 1, 0, { id: newNodeId, text, ...(attachment === undefined ? {} : { attachment }), children: [] })
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
  located.node.text = located.node.text.slice(0, position)
  located.siblings.splice(located.index + 1, 0, { id: newNodeId, text: suffix, children: [] })
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

export function pasteText(document: Document, nodeId: NodeId, cursor: number, text: string): Document {
  const next = cloneDocument(document)
  const node = requireNode(next, nodeId).node
  const position = snapToCodePoint(node.text, cursor)
  node.text = `${node.text.slice(0, position)}${text}${node.text.slice(position)}`
  return next
}

export function pasteMultilineText(
  document: Document,
  nodeId: NodeId,
  cursor: number,
  lines: string[],
  newNodeIds: NodeId[],
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

  located.node.text = `${prefix}${lines[0] ?? ''}`
  delete located.node.attachment

  const created: TreeNode[] = newNodeIds.map((id, index) => ({
    id,
    text: index === newNodeIds.length - 1 ? `${lines[index + 1] ?? ''}${suffix}` : (lines[index + 1] ?? ''),
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
  return { version: 1, document: cloneDocument(document), location: { ...location } }
}

export function parsePersistedState(value: unknown): PersistedEditorState {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.document) || !isRecord(value.location)) {
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
  return { version: 1, document, location }
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
  const stack: Array<{ input: unknown[]; index: number; output: TreeNode[] }> = [
    { input: value, index: 0, output },
  ]

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!
    if (frame.index >= frame.input.length) {
      stack.pop()
      continue
    }
    const candidate = frame.input[frame.index]
    frame.index += 1
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || candidate.id.length === 0 || typeof candidate.text !== 'string') {
      throw new Error('A saved node is invalid.')
    }
    if (nodeIds.has(candidate.id)) {
      throw new Error('Node IDs must be unique.')
    }
    nodeIds.add(candidate.id)
    const attachment = parseAttachment(candidate.attachment)
    const children = candidate.children
    if (!Array.isArray(children)) {
      throw new Error('Node children must be an array.')
    }
    const node: TreeNode = {
      id: candidate.id,
      text: candidate.text,
      ...(attachment === undefined ? {} : { attachment }),
      children: [],
    }
    frame.output.push(node)
    stack.push({ input: children, index: 0, output: node.children })
  }

  return output
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
