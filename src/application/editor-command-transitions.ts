import {
  createFirstChild,
  deleteNode,
  displayedNodes,
  ensureRoot,
  insertSiblingAfter,
  insertSiblingBefore,
  insertSubtreeSibling,
  locateNode,
  moveSibling,
  nodePath,
  requireNode,
  splitNode,
  wouldExceedMaximumDepth,
  type Document,
  type Location,
  type NodeId,
  type TreeNode,
} from '../domain/document'
import { MAX_DOCUMENT_DEPTH, MAX_DOCUMENT_DEPTH_ERROR } from '../domain/document'
import type { VisibleRow } from './visible-rows'

export interface FocusTarget {
  nodeId: NodeId
  cursor: number
}

export interface LocationTransition {
  location: Location
  focus: FocusTarget
}

export interface StructuralTransition extends LocationTransition {
  document: Document
  kind?: never
}

export interface RejectedTransition {
  kind: 'rejected'
  message: string
}

export type SiblingInsertionPosition = 'before' | 'after'

export function pasteSubtreeTransition(
  document: Document,
  location: Location,
  position: SiblingInsertionPosition,
  source: TreeNode,
  createId: () => NodeId,
): StructuralTransition | RejectedTransition {
  if (wouldExceedMaximumDepth(document, location.selectedNodeId, [source])) {
    return { kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR }
  }
  let insertedId: NodeId | undefined
  const nextDocument = insertSubtreeSibling(document, location.selectedNodeId, position, source, () => {
    const id = createId()
    if (insertedId === undefined) insertedId = id
    return id
  })
  if (insertedId === undefined) throw new Error('Subtree paste did not create a sibling.')
  return {
    document: nextDocument,
    location: { ...location, selectedNodeId: insertedId },
    focus: { nodeId: insertedId, cursor: 0 },
  }
}

export function createSiblingTransition(
  document: Document,
  location: Location,
  position: SiblingInsertionPosition,
  createId: () => NodeId,
): StructuralTransition {
  const id = createId()
  const nextDocument =
    position === 'before'
      ? insertSiblingBefore(document, location.selectedNodeId, id)
      : insertSiblingAfter(document, location.selectedNodeId, id)
  return {
    document: nextDocument,
    location: { ...location, selectedNodeId: id },
    focus: { nodeId: id, cursor: 0 },
  }
}

export function createFirstChildTransition(
  document: Document,
  location: Location,
  createId: () => NodeId,
): StructuralTransition | RejectedTransition {
  const parent = requireNode(document, location.selectedNodeId)
  if (parent.ancestors.length + 1 >= MAX_DOCUMENT_DEPTH) return { kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR }
  const id = createId()
  return {
    document: createFirstChild(document, location.selectedNodeId, id),
    location: { currentParentId: location.selectedNodeId, selectedNodeId: id },
    focus: { nodeId: id, cursor: 0 },
  }
}

export function createSiblingOrFirstChildTransition(
  document: Document,
  location: Location,
  cursor: number,
  createId: () => NodeId,
): StructuralTransition | RejectedTransition {
  if (location.currentParentId === location.selectedNodeId) {
    const parent = requireNode(document, location.selectedNodeId)
    if (parent.ancestors.length + 1 >= MAX_DOCUMENT_DEPTH) {
      return { kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR }
    }
    const id = createId()
    return {
      document: createFirstChild(document, location.selectedNodeId, id),
      location: { ...location, selectedNodeId: id },
      focus: { nodeId: id, cursor: 0 },
    }
  }

  const id = createId()
  const selected = requireNode(document, location.selectedNodeId).node
  const nextDocument =
    cursor === 0 && selected.text !== ''
      ? insertSiblingBefore(document, location.selectedNodeId, id)
      : splitNode(document, location.selectedNodeId, cursor, id)
  return {
    document: nextDocument,
    location: { ...location, selectedNodeId: id },
    focus: { nodeId: id, cursor: 0 },
  }
}

export function moveNodeTransition(
  document: Document,
  location: Location,
  nodeId: NodeId,
  insertionIndex: number,
  cursor = 0,
): StructuralTransition | undefined {
  // Drag reordering is scoped to the dragged node's own actual siblings, whatever depth it is
  // displayed at through inline expansion, so `insertionIndex` is always resolved against them.
  const located = locateNode(document, nodeId)
  if (located === undefined) return undefined
  const sourceIndex = located.index
  const rawDestination = insertionIndex > sourceIndex ? insertionIndex - 1 : insertionIndex
  // Clamped to the same bounds `moveSibling` applies, so an insertion index past either end of the
  // sibling list is only treated as a real move when it actually lands somewhere new.
  const destination = Math.max(0, Math.min(rawDestination, located.siblings.length - 1))
  if (destination === sourceIndex) return undefined
  return {
    document: moveSibling(document, nodeId, destination),
    location: { ...location, selectedNodeId: nodeId },
    focus: { nodeId, cursor },
  }
}

export function moveSelectionTransition(
  document: Document,
  location: Location,
  visibleRows: readonly VisibleRow[],
  direction: 'up' | 'down',
  cursor: number,
): FocusTarget | undefined {
  if (location.currentParentId === location.selectedNodeId) {
    const parent = requireNode(document, location.currentParentId).node
    if (direction === 'up') return cursor === 0 ? undefined : { nodeId: parent.id, cursor: 0 }
    const child = visibleRows[0]?.node
    return child === undefined
      ? cursor === parent.text.length
        ? undefined
        : { nodeId: parent.id, cursor: parent.text.length }
      : { nodeId: child.id, cursor: Math.min(cursor, child.text.length) }
  }

  const index = visibleRows.findIndex((row) => row.node.id === location.selectedNodeId)
  if (index < 0) return undefined
  if (direction === 'up' && index === 0) {
    if (location.currentParentId === null)
      return cursor === 0 ? undefined : { nodeId: visibleRows[0]!.node.id, cursor: 0 }
    const parent = requireNode(document, location.currentParentId).node
    return { nodeId: parent.id, cursor: Math.min(cursor, parent.text.length) }
  }
  if (direction === 'down' && index === visibleRows.length - 1) {
    const node = visibleRows[index]!.node
    return cursor === node.text.length ? undefined : { nodeId: node.id, cursor: node.text.length }
  }
  const target = visibleRows[index + (direction === 'up' ? -1 : 1)]?.node
  return target === undefined ? undefined : { nodeId: target.id, cursor: Math.min(cursor, target.text.length) }
}

export function moveSelectionBoundaryTransition(
  document: Document,
  location: Location,
  visibleRows: readonly VisibleRow[],
  boundary: 'first' | 'last' | 'parent',
  cursor: number,
  count?: number,
): FocusTarget | undefined {
  if (boundary === 'parent' && location.currentParentId !== null) {
    const parent = requireNode(document, location.currentParentId).node
    return { nodeId: parent.id, cursor: Math.min(cursor, parent.text.length) }
  }
  // `gg` always targets the current-parent heading (handled above) or the first top-level root
  // (below); it is intentionally not generalized to the focused node's own real parent.
  if (boundary === 'last') {
    if (visibleRows.length === 0) return undefined
    const target = visibleRows[Math.min(visibleRows.length - 1, Math.max(0, (count ?? visibleRows.length) - 1))]!.node
    const targetCursor = target.attachment !== undefined ? target.text.length : cursor
    return { nodeId: target.id, cursor: Math.min(targetCursor, target.text.length) }
  }
  const nodes = displayedNodes(document, location.currentParentId)
  const target = nodes[0]
  if (target === undefined) return undefined
  return { nodeId: target.id, cursor: Math.min(cursor, target.text.length) }
}

export function moveHorizontalTransition(
  document: Document,
  location: Location,
  visibleRows: readonly VisibleRow[],
  direction: 'left' | 'right',
  cursor: number,
): FocusTarget | undefined {
  if (location.currentParentId === location.selectedNodeId) {
    const parent = requireNode(document, location.currentParentId).node
    const child = parent.children[0]
    return direction === 'right' && cursor === parent.text.length && child !== undefined
      ? { nodeId: child.id, cursor: 0 }
      : undefined
  }

  const selected = requireNode(document, location.selectedNodeId)
  const atBoundary = direction === 'left' ? cursor === 0 : cursor === selected.node.text.length
  if (!atBoundary) return undefined
  const index = visibleRows.findIndex((row) => row.node.id === location.selectedNodeId)
  if (index < 0) return undefined
  const target = visibleRows[index + (direction === 'left' ? -1 : 1)]?.node
  if (target !== undefined) return { nodeId: target.id, cursor: direction === 'left' ? target.text.length : 0 }
  if (direction === 'left' && selected.parent !== null) {
    return { nodeId: selected.parent.id, cursor: selected.parent.text.length }
  }
  return undefined
}

export function enterTransition(document: Document, location: Location): LocationTransition | undefined {
  if (location.currentParentId === location.selectedNodeId) return undefined
  const entered = requireNode(document, location.selectedNodeId).node
  const selected = entered.children[0] ?? entered
  return {
    location: { currentParentId: entered.id, selectedNodeId: selected.id },
    focus: { nodeId: selected.id, cursor: 0 },
  }
}

export function leaveTransition(document: Document, location: Location): LocationTransition | undefined {
  if (location.currentParentId === null) return undefined
  const parent = requireNode(document, location.currentParentId)
  return {
    location: { currentParentId: parent.parent?.id ?? null, selectedNodeId: parent.node.id },
    focus: { nodeId: parent.node.id, cursor: 0 },
  }
}

export function ancestorNavigationTransition(
  document: Document,
  location: Location,
  parentId: NodeId | null,
): LocationTransition | undefined {
  if (parentId === location.currentParentId || location.currentParentId === null) return undefined
  const path = nodePath(document, location.currentParentId)
  const parentIndex = parentId === null ? -1 : path.findIndex((node) => node.id === parentId)
  const selected = path[parentIndex + 1]
  if ((parentIndex === -1 && parentId !== null) || selected === undefined) return undefined
  return {
    location: { currentParentId: parentId, selectedNodeId: selected.id },
    focus: { nodeId: selected.id, cursor: 0 },
  }
}

export function deleteSelectedTransition(
  document: Document,
  location: Location,
  createId: () => string,
): StructuralTransition | undefined {
  const selected = requireNode(document, location.selectedNodeId)
  const parentIsSelected = location.currentParentId === selected.node.id
  if (parentIsSelected) return undefined
  const nextSibling = selected.siblings[selected.index + 1]
  const previousSibling = selected.siblings[selected.index - 1]
  let nextDocument = deleteNode(document, selected.node.id)
  let nextLocation: Location

  if (nextSibling !== undefined || previousSibling !== undefined) {
    const destination = nextSibling ?? previousSibling
    if (destination === undefined) throw new Error('A sibling destination was not found.')
    nextLocation = { ...location, selectedNodeId: destination.id }
  } else if (selected.parent !== null) {
    // The real parent is the current parent or a visible ancestor shown by inline expansion (§2.4);
    // either way the location stays where it is.
    nextLocation = { ...location, selectedNodeId: selected.parent.id }
  } else {
    nextDocument = ensureRoot(nextDocument, createId())
    nextLocation = { currentParentId: null, selectedNodeId: nextDocument.roots[0]!.id }
  }

  return { document: nextDocument, location: nextLocation, focus: { nodeId: nextLocation.selectedNodeId, cursor: 0 } }
}

export function deleteEmptySelectedTransition(
  document: Document,
  location: Location,
): StructuralTransition | undefined {
  const selected = requireNode(document, location.selectedNodeId)
  if (selected.node.id === location.currentParentId || selected.node.text !== '') return undefined
  const previous = selected.siblings[selected.index - 1]
  const next = selected.siblings[selected.index + 1]
  const nextDocument = deleteNode(document, selected.node.id)
  if (previous !== undefined) {
    return {
      document: nextDocument,
      location: { ...location, selectedNodeId: previous.id },
      focus: { nodeId: previous.id, cursor: previous.text.length },
    }
  }
  if (selected.parent !== null) {
    // Only the current parent is entered as a location; a visible ancestor keeps the location unchanged.
    return {
      document: nextDocument,
      location: { ...location, selectedNodeId: selected.parent.id },
      focus: { nodeId: selected.parent.id, cursor: selected.parent.text.length },
    }
  }
  if (next !== undefined) {
    return {
      document: nextDocument,
      location: { ...location, selectedNodeId: next.id },
      focus: { nodeId: next.id, cursor: 0 },
    }
  }
  return undefined
}
