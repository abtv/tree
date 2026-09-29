import type { TreeNode } from '../domain/document'

/**
 * Expansion choices remembered per node across locations (`docs/PRODUCT.md` §2.4). They are view
 * state: persisted with the document but never part of undo history.
 */
export interface ExpansionState {
  readonly expandedIds: ReadonlySet<string>
}

export const COLLAPSED_EXPANSION_STATE: ExpansionState = { expandedIds: new Set() }

export function expansionFromIds(ids: Iterable<string>): ExpansionState {
  const expandedIds = new Set(ids)
  return expandedIds.size === 0 ? COLLAPSED_EXPANSION_STATE : { expandedIds }
}

export function isNodeExpanded(state: ExpansionState, nodeId: string): boolean {
  return state.expandedIds.has(nodeId)
}

export function expandNode(state: ExpansionState, nodeId: string): ExpansionState {
  if (state.expandedIds.has(nodeId)) return state
  return { expandedIds: new Set(state.expandedIds).add(nodeId) }
}

export function collapseNode(state: ExpansionState, nodeId: string): ExpansionState {
  if (!state.expandedIds.has(nodeId)) return state
  const next = new Set(state.expandedIds)
  next.delete(nodeId)
  return { expandedIds: next }
}

export function toggleNodeExpansion(state: ExpansionState, nodeId: string): ExpansionState {
  return isNodeExpanded(state, nodeId) ? collapseNode(state, nodeId) : expandNode(state, nodeId)
}

export type NodeFoldCommand = 'close' | 'open' | 'toggle' | 'close-recursive' | 'open-recursive'

function forEachNode(node: TreeNode, visit: (current: TreeNode) => void): void {
  visit(node)
  for (const child of node.children) forEachNode(child, visit)
}

export function applyNodeFold(state: ExpansionState, command: NodeFoldCommand, node: TreeNode): ExpansionState {
  if (node.children.length === 0) return state
  switch (command) {
    case 'close':
      return collapseNode(state, node.id)
    case 'open':
      return expandNode(state, node.id)
    case 'toggle':
      return toggleNodeExpansion(state, node.id)
    case 'close-recursive':
      return collapseSubtree(state, node)
    case 'open-recursive':
      return expandSubtree(state, node)
  }
}

export function expandSubtree(state: ExpansionState, node: TreeNode): ExpansionState {
  const next = new Set(state.expandedIds)
  forEachNode(node, (current) => {
    if (current.children.length > 0) next.add(current.id)
  })
  return next.size === state.expandedIds.size ? state : { expandedIds: next }
}

export function collapseSubtree(state: ExpansionState, node: TreeNode): ExpansionState {
  const next = new Set(state.expandedIds)
  forEachNode(node, (current) => {
    next.delete(current.id)
  })
  return next.size === state.expandedIds.size ? state : { expandedIds: next }
}

export function collapseForest(state: ExpansionState, nodes: readonly TreeNode[]): ExpansionState {
  if (state.expandedIds.size === 0) return state
  const next = new Set(state.expandedIds)
  for (const node of nodes)
    forEachNode(node, (current) => {
      next.delete(current.id)
    })
  return next.size === state.expandedIds.size ? state : { expandedIds: next }
}

export function expandForest(state: ExpansionState, nodes: readonly TreeNode[]): ExpansionState {
  const next = new Set(state.expandedIds)
  for (const node of nodes)
    forEachNode(node, (current) => {
      if (current.children.length > 0) next.add(current.id)
    })
  return next.size === state.expandedIds.size ? state : { expandedIds: next }
}
