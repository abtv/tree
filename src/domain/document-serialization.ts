import {
  EMPTY_PERSISTED_VIEW,
  MAX_DOCUMENT_DEPTH,
  type AttachmentReference,
  type BuildNode,
  type Document,
  type LinkRange,
  type Location,
  type NodeId,
  type PersistedEditorState,
  type PersistedView,
  type TreeNode,
} from './document-types'
import { isValidLocation } from './document-operations'
import { normalizeLinks } from './document-links'
import { isValidAttachmentId } from './document-attachments'
import { MAX_DOCUMENT_DEPTH_ERROR } from './product-messages'

/** The view state to persist; `expandedIds` may hold ids of nodes the document no longer contains. */
export interface ViewState {
  readonly expandedIds: Iterable<NodeId>
  readonly scrollTop?: number
}

/**
 * Serializes the current schema. Expansion choices are remembered per node for the running session,
 * including for nodes an undo could restore, but only ids of nodes the saved document contains are
 * written, so the file never accumulates choices for deleted nodes.
 */
export function serializeState(
  document: Document,
  location: Location,
  view: ViewState = EMPTY_PERSISTED_VIEW,
): PersistedEditorState {
  const nodeIds = assertDocumentIds(document)
  if (!isValidLocation(document, location)) {
    throw new Error('The selected node is not valid for the persisted location.')
  }
  const expandedIds: NodeId[] = []
  for (const id of view.expandedIds) if (nodeIds.has(id)) expandedIds.push(id)
  return {
    version: 3,
    document,
    location: { ...location },
    view: view.scrollTop === undefined ? { expandedIds } : { expandedIds, scrollTop: view.scrollTop },
  }
}

function isSupportedVersion(version: unknown): version is 1 | 2 | 3 {
  return version === 1 || version === 2 || version === 3
}

/**
 * Checks the view shape of a version 3 state. An expanded id that names no node is tolerated, since
 * it cannot display anything; a malformed view is rejected like any other malformed field.
 */
function assertView(value: Record<string, unknown>): void {
  if (value.version !== 3) return
  const view = value.view
  if (
    !isRecord(view) ||
    !Array.isArray(view.expandedIds) ||
    !view.expandedIds.every((id) => typeof id === 'string' && id.length > 0) ||
    (view.scrollTop !== undefined &&
      (typeof view.scrollTop !== 'number' || !Number.isFinite(view.scrollTop) || view.scrollTop < 0))
  ) {
    throw new Error('The saved view state is invalid.')
  }
}

export function validatePersistedState(value: unknown): PersistedEditorState {
  if (
    !isRecord(value) ||
    !isSupportedVersion(value.version) ||
    !isRecord(value.document) ||
    !isRecord(value.location)
  ) {
    throw new Error('The saved document has an unsupported format.')
  }
  assertView(value)

  const roots = value.document.roots
  if (!Array.isArray(roots)) {
    throw new Error('Node children must be an array.')
  }
  const currentParentId = value.location.currentParentId
  const selectedNodeId = value.location.selectedNodeId
  const parentOf = new Map<NodeId, NodeId | null>()
  let selectedFound = false
  let currentParentFound = false
  walkNodes(roots, new Set(), false, (id, parentId) => {
    parentOf.set(id, parentId)
    if (id === selectedNodeId) selectedFound = true
    if (id === currentParentId) currentParentFound = true
  })
  if (roots.length === 0) {
    throw new Error('The saved document must contain at least one root node.')
  }
  if ((typeof currentParentId !== 'string' && currentParentId !== null) || typeof selectedNodeId !== 'string') {
    throw new Error('The saved document location is invalid.')
  }
  if (!isLocationReachable(selectedFound, currentParentFound, currentParentId, selectedNodeId, parentOf)) {
    throw new Error('The saved document location does not match its tree.')
  }
  return value as unknown as PersistedEditorState
}

/**
 * Mirrors `isValidLocation` (`document-operations.ts`) for the pre-parse structural check: the
 * selected node must be the current parent itself or any of its descendants, at any depth, since
 * inline expansion can display and select a descendant below a direct child.
 */
function isLocationReachable(
  selectedFound: boolean,
  currentParentFound: boolean,
  currentParentId: NodeId | null,
  selectedNodeId: NodeId,
  parentOf: ReadonlyMap<NodeId, NodeId | null>,
): boolean {
  if (!selectedFound) return false
  if (currentParentId === null) return true
  if (!currentParentFound) return false
  let cursor: NodeId | null | undefined = selectedNodeId
  while (cursor !== null && cursor !== undefined) {
    if (cursor === currentParentId) return true
    cursor = parentOf.get(cursor) ?? null
  }
  return false
}

/**
 * Parses and migrates a saved state to the current schema. A version 1 or 2 file predates persisted
 * view state and loads with every node collapsed; expanded ids that name no node are dropped.
 */
export function parsePersistedState(value: unknown): PersistedEditorState {
  if (
    !isRecord(value) ||
    !isSupportedVersion(value.version) ||
    !isRecord(value.document) ||
    !isRecord(value.location)
  ) {
    throw new Error('The saved document has an unsupported format.')
  }
  assertView(value)

  const nodeIds = new Set<NodeId>()
  const document: Document = { roots: parseNodes(value.document.roots, nodeIds) }
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
  return { version: 3, document, location, view: parseView(value, nodeIds) }
}

function parseView(value: Record<string, unknown>, nodeIds: ReadonlySet<NodeId>): PersistedView {
  if (value.version !== 3 || !isRecord(value.view)) return EMPTY_PERSISTED_VIEW
  const expandedIds = (value.view.expandedIds as string[]).filter((id) => nodeIds.has(id))
  const scrollTop = value.view.scrollTop
  return typeof scrollTop === 'number' ? { expandedIds, scrollTop } : { expandedIds }
}

export function assertDocument(document: Document): void {
  assertDocumentIds(document)
}

function assertDocumentIds(document: Document): Set<NodeId> {
  if (!Array.isArray(document.roots) || document.roots.length === 0) {
    throw new Error('A document must contain at least one root node.')
  }
  const nodeIds = new Set<NodeId>()
  walkNodes(document.roots, nodeIds, false)
  return nodeIds
}

function parseNodes(value: unknown, nodeIds: Set<NodeId>): TreeNode[] {
  return walkNodes(value, nodeIds, true)
}

type NodeObserver = (id: NodeId, parentId: NodeId | null) => void

function walkNodes(value: unknown, nodeIds: Set<NodeId>, build: false, observe?: NodeObserver): void
function walkNodes(value: unknown, nodeIds: Set<NodeId>, build: true, observe?: NodeObserver): TreeNode[]
function walkNodes(
  value: unknown,
  nodeIds: Set<NodeId>,
  build: boolean,
  observe?: NodeObserver,
): TreeNode[] | undefined {
  if (!Array.isArray(value)) {
    throw new Error('Node children must be an array.')
  }

  const output: BuildNode[] | undefined = build ? [] : undefined
  const stack: Array<{
    input: unknown[]
    index: number
    output: BuildNode[] | undefined
    depth: number
    parentId: NodeId | null
  }> = [{ input: value, index: 0, output, depth: 1, parentId: null }]

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
    observe?.(candidate.id, frame.parentId)
    const attachment = parseAttachment(candidate.attachment)
    const links = parseLinks(candidate.links, candidate.text)
    const children = candidate.children
    if (!Array.isArray(children)) {
      throw new Error('Node children must be an array.')
    }
    let childOutput: BuildNode[] | undefined
    if (frame.output !== undefined) {
      const node: BuildNode = {
        id: candidate.id,
        text: candidate.text,
        ...(links.length === 0 ? {} : { links }),
        ...(attachment === undefined ? {} : { attachment }),
        children: [],
      }
      frame.output.push(node)
      childOutput = node.children
    }
    stack.push({ input: children, index: 0, output: childOutput, depth: frame.depth + 1, parentId: candidate.id })
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
    true,
    true,
  )
}

function parseAttachment(value: unknown): AttachmentReference | undefined {
  if (value === undefined) {
    return undefined
  }
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isValidAttachmentId(value.id) ||
    value.mimeType !== 'image/png'
  ) {
    throw new Error('A saved attachment is invalid.')
  }
  return { id: value.id, mimeType: value.mimeType }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
