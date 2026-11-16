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
  type PersistedAgendaFolds,
  type PersistedView,
  type TreeNode,
} from './document-types'
import { isValidLocation } from './document-operations'
import { normalizeLinks } from './document-links'
import { isValidAttachmentId } from './document-attachments'
import { MAX_DOCUMENT_DEPTH_ERROR } from './product-messages'
import { deriveCompletion } from './node-completion'
import { buildNodeIndex } from './document-index'
import { dayNumberOf, weekdayOf } from './calendar-date'

// Documents are immutable. Remember validation, without retaining an ID set for every history snapshot.
const validatedDocuments = new WeakSet<Document>()

/** The view state to persist; `expandedIds` may hold ids of nodes the document no longer contains. */
export interface ViewState {
  readonly expandedIds: Iterable<NodeId>
  readonly selectedRowTop?: number
  readonly agendaFolds?: PersistedAgendaFolds
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
  if (!validatedDocuments.has(document)) {
    assertDocumentIds(document)
    validatedDocuments.add(document)
  }
  if (!isValidLocation(document, location)) {
    throw new Error('The selected node is not valid for the persisted location.')
  }
  const expandedIds: NodeId[] = []
  for (const id of view.expandedIds) if (buildNodeIndex(document).has(id)) expandedIds.push(id)
  const agendaFolds = normalizeAgendaFolds(view.agendaFolds)
  return {
    version: 5,
    document,
    location: { ...location },
    view: {
      expandedIds,
      ...(view.selectedRowTop === undefined ? {} : { selectedRowTop: view.selectedRowTop }),
      ...(agendaFolds === undefined ? {} : { agendaFolds }),
    },
  }
}

function isSupportedVersion(version: unknown): version is 1 | 2 | 3 | 4 | 5 {
  return version === 1 || version === 2 || version === 3 || version === 4 || version === 5
}

/** Version 3 added the view block; subsequent content schema versions retain it. */
function hasView(version: unknown): boolean {
  return version === 3 || version === 4 || version === 5
}

/**
 * Checks the view shape of a version 3–5 state. An expanded id that names no node is tolerated,
 * since it cannot display anything; a malformed view is rejected like any other malformed field.
 */
function assertView(value: Record<string, unknown>): void {
  if (!hasView(value.version)) return
  const view = value.view
  // Number.isFinite already rejects non-numbers; removing only typeof is equivalent.
  if (
    !isRecord(view) ||
    !Array.isArray(view.expandedIds) ||
    !view.expandedIds.every((id) => typeof id === 'string' && id.length > 0) ||
    (view.selectedRowTop !== undefined &&
      (typeof view.selectedRowTop !== 'number' || !Number.isFinite(view.selectedRowTop) || view.selectedRowTop < 0)) ||
    (view.agendaFolds !== undefined && !isAgendaFolds(view.agendaFolds))
  ) {
    throw new Error('The saved view state is invalid.')
  }
}

const firstDay = dayNumberOf({ year: 0, month: 1, day: 1 })
const lastDay = dayNumberOf({ year: 9999, month: 12, day: 31 })
const firstWeek = firstDay - weekdayOf(firstDay)
const lastWeek = lastDay - weekdayOf(lastDay)

function isAgendaFolds(value: unknown): value is PersistedAgendaFolds {
  return (
    isRecord(value) &&
    Array.isArray(value.days) &&
    value.days.every((day) => Number.isInteger(day) && day >= firstDay && day <= lastDay) &&
    Array.isArray(value.overdueWeeks) &&
    value.overdueWeeks.every(
      (week) => Number.isInteger(week) && week >= firstWeek && week <= lastWeek && weekdayOf(week) === 0,
    )
  )
}

function normalizeAgendaFolds(value: PersistedAgendaFolds | undefined): PersistedAgendaFolds | undefined {
  if (value === undefined || (value.days.length === 0 && value.overdueWeeks.length === 0)) return undefined
  return { days: [...new Set(value.days)], overdueWeeks: [...new Set(value.overdueWeeks)] }
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
  // walkNodes repeats this array check with the same error before reading any root.
  if (!Array.isArray(roots)) {
    throw new Error('Node children must be an array.')
  }
  const currentParentId = value.location.currentParentId
  const selectedNodeId = value.location.selectedNodeId
  const parentOf = new Map<NodeId, NodeId | null>()
  let selectedFound = false
  // Parent membership is a fast rejection. Even if this flag/check is bypassed,
  // the selected node's validated parent chain cannot reach a missing/unrelated ID.
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
  // The first cursor is a validated string; subsequent cursors use ?? null, never undefined.
  while (cursor !== null && cursor !== undefined) {
    if (cursor === currentParentId) return true
    cursor = parentOf.get(cursor) ?? null
  }
  return false
}

/**
 * Parses and migrates a saved state to the current schema. A version 1 or 2 file predates persisted
 * view state and loads with every node collapsed; expanded ids that name no node are dropped. A
 * version 1 to 3 file predates strikethrough, so none of its nodes is struck through.
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
  validatedDocuments.add(document)
  return { version: 5, document, location, view: parseView(value, nodeIds) }
}

function parseView(value: Record<string, unknown>, nodeIds: ReadonlySet<NodeId>): PersistedView {
  if (!hasView(value.version) || !isRecord(value.view)) return EMPTY_PERSISTED_VIEW
  const expandedIds = (value.view.expandedIds as string[]).filter((id) => nodeIds.has(id))
  const selectedRowTop = value.view.selectedRowTop
  const agendaFolds = normalizeAgendaFolds(value.view.agendaFolds as PersistedAgendaFolds | undefined)
  return {
    expandedIds,
    ...(typeof selectedRowTop === 'number' ? { selectedRowTop } : {}),
    ...(agendaFolds === undefined ? {} : { agendaFolds }),
  }
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
      if (frame.output !== undefined) {
        for (let index = 0; index < frame.output.length; index += 1) {
          frame.output[index] = deriveCompletion(frame.output[index]!) as BuildNode
        }
      }
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
      typeof candidate.text !== 'string' ||
      (candidate.struckThrough !== undefined && candidate.struckThrough !== true) ||
      (candidate.starred !== undefined && candidate.starred !== true)
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
        ...(candidate.struckThrough === true ? { struckThrough: true as const } : {}),
        ...(candidate.starred === true ? { starred: true as const } : {}),
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
    value.mimeType !== 'image/png' ||
    (value.searchText !== undefined && (typeof value.searchText !== 'string' || value.searchText.length > 1_048_576))
  ) {
    throw new Error('A saved attachment is invalid.')
  }
  return {
    id: value.id,
    mimeType: value.mimeType,
    ...(value.searchText === undefined ? {} : { searchText: value.searchText as string }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
