import {
  displayedNodes,
  normalizeVisibleLocation,
  requireNode,
  type Document,
  type Location,
  type NodeId,
  type TreeNode,
} from '../domain/document'
import { isNodeExpanded, type ExpansionState } from './expansion-state'

function* taskRows(nodes: readonly TreeNode[], isExpanded: (id: string) => boolean): Generator<TreeNode> {
  for (const node of nodes) {
    yield node
    if (!node.struckThrough && node.children.length > 0 && isExpanded(node.id))
      yield* taskRows(node.children, isExpanded)
  }
}

/** The selected node's path and the index in it of the nearest unfinished current parent, -1 for the root level. */
function unfinishedParentIndex(document: Document, location: Location): { path: TreeNode[]; parentIndex: number } {
  const selected = requireNode(document, location.selectedNodeId)
  const path = [...selected.ancestors, selected.node]
  let parentIndex = path.findIndex((node) => node.id === location.currentParentId)
  while (path[parentIndex]?.struckThrough) parentIndex -= 1
  return { path, parentIndex }
}

/**
 * The current parent `unfinishedTreeLocation` displays. It depends only on completion, not on folds, so
 * a caller can activate the destination's view before choosing the row.
 */
export function unfinishedParentId(document: Document, location: Location): NodeId | null {
  if (!requireNode(document, location.selectedNodeId).node.struckThrough) return location.currentParentId
  const { path, parentIndex } = unfinishedParentIndex(document, location)
  return path[parentIndex]?.id ?? null
}

/** A completed branch disappears as a unit. Find the next row at that branch's former position. */
export function unfinishedTreeLocation(document: Document, location: Location, expansion: ExpansionState): Location {
  if (!requireNode(document, location.selectedNodeId).node.struckThrough) return location

  const { path, parentIndex } = unfinishedParentIndex(document, location)
  const currentParentId = path[parentIndex]?.id ?? null
  const isExpanded = (id: string) => isNodeExpanded(expansion, id)
  const normalized = normalizeVisibleLocation(document, { ...location, currentParentId }, isExpanded)
  if (!requireNode(document, normalized.selectedNodeId).node.struckThrough) return normalized
  const hidden = path.find((node, index) => index > parentIndex && node.struckThrough)!
  let candidate: TreeNode | undefined
  let passedHidden = false
  for (const row of taskRows(displayedNodes(document, currentParentId), isExpanded)) {
    if (row === hidden) passedHidden = true
    if (row.struckThrough) continue
    candidate = row
    if (passedHidden) break
  }
  // The document still requires a real location at an empty root. It serves only as a save anchor.
  const selectedNodeId = candidate?.id ?? currentParentId ?? document.roots[0]!.id
  return selectedNodeId === location.selectedNodeId && currentParentId === location.currentParentId
    ? location
    : { currentParentId, selectedNodeId }
}
