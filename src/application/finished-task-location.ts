import {
  displayedNodes,
  normalizeVisibleLocation,
  requireNode,
  type Document,
  type Location,
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

/** A completed branch disappears as a unit. Find the next row at that branch's former position. */
export function unfinishedTreeLocation(document: Document, location: Location, expansion: ExpansionState): Location {
  const selected = requireNode(document, location.selectedNodeId)
  if (!selected.node.struckThrough) return location

  const path = [...selected.ancestors, selected.node]
  let parentIndex = path.findIndex((node) => node.id === location.currentParentId)
  while (path[parentIndex]?.struckThrough) parentIndex -= 1
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
