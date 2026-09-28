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
