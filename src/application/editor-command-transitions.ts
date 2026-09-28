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
  const destination = insertionIndex > sourceIndex ? insertionIndex - 1 : insertionIndex
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
  direction: 'up' | 'down',
  cursor: number,
): FocusTarget | undefined {
  if (location.currentParentId === location.selectedNodeId) {
    const parent = requireNode(document, location.currentParentId).node
    if (direction === 'up') return { nodeId: parent.id, cursor: 0 }
    const child = parent.children[0]
    return child === undefined
      ? { nodeId: parent.id, cursor: parent.text.length }
      : { nodeId: child.id, cursor: Math.min(cursor, child.text.length) }
  }

  // `↑`/`↓` act on the selected node's own actual sibling level, so a visible descendant's real
  // parent may be another visible descendant row rather than the current-parent heading.
  const selected = requireNode(document, location.selectedNodeId)
  const siblings = selected.siblings
  const index = selected.index
  if (direction === 'up' && index === 0) {
    if (selected.parent === null) return { nodeId: siblings[0]!.id, cursor: 0 }
    return { nodeId: selected.parent.id, cursor: Math.min(cursor, selected.parent.text.length) }
  }
  if (direction === 'down' && index === siblings.length - 1) {
    const node = siblings[index]!
    return { nodeId: node.id, cursor: node.text.length }
  }
  const target = siblings[index + (direction === 'up' ? -1 : 1)]
  return target === undefined ? undefined : { nodeId: target.id, cursor: Math.min(cursor, target.text.length) }
}

export function moveSelectionBoundaryTransition(
  document: Document,
  location: Location,
  boundary: 'first' | 'last' | 'parent',
  cursor: number,
  count?: number,
): FocusTarget | undefined {
  if (boundary === 'parent' && location.currentParentId !== null) {
    const parent = requireNode(document, location.currentParentId).node
    return { nodeId: parent.id, cursor: Math.min(cursor, parent.text.length) }
  }
  // `gg` always targets the current-parent heading (handled above) or the first top-level root
  // (below); it is intentionally not generalized to the focused node's own real parent. `G` targets
  // the focused node's own actual siblings, except when the heading itself is selected.
  const nodes =
    boundary === 'last' && location.selectedNodeId !== location.currentParentId
      ? requireNode(document, location.selectedNodeId).siblings
      : displayedNodes(document, location.currentParentId)
  if (nodes.length === 0) return undefined
  const target =
    boundary === 'last' ? nodes[Math.min(nodes.length - 1, Math.max(0, (count ?? nodes.length) - 1))] : nodes[0]
  if (target === undefined) return undefined
  const targetCursor = boundary === 'last' && target.attachment !== undefined ? target.text.length : cursor
  return { nodeId: target.id, cursor: Math.min(targetCursor, target.text.length) }
}

export function moveHorizontalTransition(
  document: Document,
  location: Location,
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
  const sibling = selected.siblings[selected.index + (direction === 'left' ? -1 : 1)]
  if (sibling !== undefined) return { nodeId: sibling.id, cursor: direction === 'left' ? sibling.text.length : 0 }
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
  } else if (location.currentParentId !== null) {
    nextLocation = { ...location, selectedNodeId: location.currentParentId }
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
    return {
      document: nextDocument,
      location: { currentParentId: selected.parent.id, selectedNodeId: selected.parent.id },
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
