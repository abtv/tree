import type { TreeNode } from '../domain/document'

/**
 * Transient inline-expansion choices for the current visit to a location. This is runtime/UI state
 * (docs/ARCHITECTURE.md §9): it is never persisted, creates no undo entry, and a caller resets it to
 * `COLLAPSED_EXPANSION_STATE` on every location change.
 */
export interface ExpansionState {
  readonly expandedIds: ReadonlySet<string>
}

export const COLLAPSED_EXPANSION_STATE: ExpansionState = { expandedIds: new Set() }

export function isNodeExpanded(state: ExpansionState, nodeId: string): boolean {
  return state.expandedIds.has(nodeId)
}

export function expandNode(state: ExpansionState, nodeId: string): ExpansionState {
  if (state.expandedIds.has(nodeId)) return state
  return { expandedIds: new Set(state.expandedIds).add(nodeId) }
}

/**
 * Removes only `nodeId` from the expanded set. A descendant's own expansion choice is untouched, so
 * expanding `nodeId` again restores whatever nested choices were made during the same visit.
 */
export function collapseNode(state: ExpansionState, nodeId: string): ExpansionState {
  if (!state.expandedIds.has(nodeId)) return state
  const next = new Set(state.expandedIds)
  next.delete(nodeId)
  return { expandedIds: next }
}

export function toggleNodeExpansion(state: ExpansionState, nodeId: string): ExpansionState {
  return isNodeExpanded(state, nodeId) ? collapseNode(state, nodeId) : expandNode(state, nodeId)
}

/** The per-node fold transitions a Normal-mode Vim fold key can request (docs/PRODUCT.md §20.2). */
export type NodeFoldCommand = 'close' | 'open' | 'toggle' | 'close-recursive' | 'open-recursive'

function forEachNode(node: TreeNode, visit: (current: TreeNode) => void): void {
  visit(node)
  for (const child of node.children) forEachNode(child, visit)
}

/**
 * Applies one per-node fold command. A fold belongs to the node itself — its direct children are
 * what its disclosure triangle and the Vim fold keys show or hide — so a leaf has no fold to
 * operate on and every command is a no-op there. `close`/`open`/`toggle` act on that one level;
 * the recursive forms also clear or set every nested choice under the node.
 */
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

/** Opens `node` and every fold inside it, so a later collapse/expand round trip still shows all of it. */
export function expandSubtree(state: ExpansionState, node: TreeNode): ExpansionState {
  const next = new Set(state.expandedIds)
  forEachNode(node, (current) => {
    if (current.children.length > 0) next.add(current.id)
  })
  return next.size === state.expandedIds.size ? state : { expandedIds: next }
}

/**
 * Closes `node` and clears every nested expansion choice under it. Unlike `collapseNode`, which
 * preserves a descendant's own choice for a later re-expansion, this discards the whole subtree's
 * choices so the next `open` shows one level.
 */
export function collapseSubtree(state: ExpansionState, node: TreeNode): ExpansionState {
  const next = new Set(state.expandedIds)
  forEachNode(node, (current) => {
    next.delete(current.id)
  })
  return next.size === state.expandedIds.size ? state : { expandedIds: next }
}

/** Opens every fold under each of `nodes` recursively (`zR` over the current location's rows). */
export function expandForest(state: ExpansionState, nodes: readonly TreeNode[]): ExpansionState {
  const next = new Set(state.expandedIds)
  for (const node of nodes) {
    forEachNode(node, (current) => {
      if (current.children.length > 0) next.add(current.id)
    })
  }
  return next.size === state.expandedIds.size ? state : { expandedIds: next }
}
