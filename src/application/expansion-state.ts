import { buildNodeIndex, requireNode, type Document, type NodeId, type TreeNode } from '../domain/document'

/**
 * Expansion choices (`docs/PRODUCT.md` §2.4), remembered per view: one root view and one view for each
 * starred node. A location shows the view of the nearest starred node among its current parent and that
 * parent's ancestors, or the root view when there is none. They are view state: persisted with the
 * document but never part of undo history.
 */
export interface ExpansionState {
  /** Expanded ids of the active view, which governs the displayed location. */
  readonly expandedIds: ReadonlySet<string>
  /** The starred node that owns the active view, or `null` for the root view. */
  readonly viewOwnerId: NodeId | null
  /**
   * Every inactive view, keyed by its owner, with the root view under `null`. Views of unstarred nodes
   * stay for the session, and views of deleted nodes stay while undo or redo can restore the node: the
   * snapshot that `EditorHistory` records as a node leaves stores its owner, and `releaseViews` drops
   * the view when history releases that snapshot and the document lacks the node. Only starred nodes'
   * views are saved.
   */
  readonly otherViews: ReadonlyMap<NodeId | null, ReadonlySet<string>>
}

const NO_IDS: ReadonlySet<string> = new Set()

export const COLLAPSED_EXPANSION_STATE: ExpansionState = {
  expandedIds: NO_IDS,
  viewOwnerId: null,
  otherViews: new Map(),
}

export function expansionFromIds(ids: Iterable<string>): ExpansionState {
  return expansionFromViews(ids, [])
}

/** Restores saved views with the root view active; activation selects the view of the loaded location. */
export function expansionFromViews(
  rootIds: Iterable<string>,
  starredViews: Iterable<readonly [NodeId, Iterable<string>]>,
): ExpansionState {
  const expandedIds = new Set(rootIds)
  const otherViews = new Map<NodeId | null, ReadonlySet<string>>()
  for (const [ownerId, ids] of starredViews) otherViews.set(ownerId, new Set(ids))
  return expandedIds.size === 0 && otherViews.size === 0
    ? COLLAPSED_EXPANSION_STATE
    : { expandedIds, viewOwnerId: null, otherViews }
}

/** The root view and every starred view to save. Serialization drops views of nodes without a star. */
export function savedExpansionViews(state: ExpansionState): {
  readonly expandedIds: ReadonlySet<string>
  readonly starredExpandedIds: ReadonlyMap<NodeId, ReadonlySet<string>>
} {
  const starredExpandedIds = new Map<NodeId, ReadonlySet<string>>()
  for (const [ownerId, ids] of state.otherViews) if (ownerId !== null) starredExpandedIds.set(ownerId, ids)
  if (state.viewOwnerId !== null) starredExpandedIds.set(state.viewOwnerId, state.expandedIds)
  return {
    expandedIds: state.viewOwnerId === null ? state.expandedIds : (state.otherViews.get(null) ?? NO_IDS),
    starredExpandedIds,
  }
}

/** The starred node whose view governs a location, or `null` for the root view. */
export function governingViewOwner(document: Document, currentParentId: NodeId | null): NodeId | null {
  if (currentParentId === null) return null
  const located = requireNode(document, currentParentId)
  if (located.node.starred === true) return located.node.id
  return nearestStarredAncestor(located.ancestors)
}

function nearestStarredAncestor(ancestors: readonly TreeNode[]): NodeId | null {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]!
    if (ancestor.starred === true) return ancestor.id
  }
  return null
}

/**
 * Makes the view that governs `currentParentId` active. A starred node without a view receives a copy of
 * the view it would otherwise show, limited to its descendants, so the switch changes no visible row.
 * Returns `state` itself when the active view already governs the location.
 */
export function activateExpansionView(
  state: ExpansionState,
  document: Document,
  currentParentId: NodeId | null,
): ExpansionState {
  const ownerId = governingViewOwner(document, currentParentId)
  if (ownerId === state.viewOwnerId) return state
  const otherViews = new Map(state.otherViews)
  otherViews.set(state.viewOwnerId, state.expandedIds)
  const stored = otherViews.get(ownerId)
  otherViews.delete(ownerId)
  return {
    // The root view is always stored, so only a starred owner can lack one.
    expandedIds: stored ?? inheritedView(otherViews, document, ownerId!),
    viewOwnerId: ownerId,
    otherViews,
  }
}

function inheritedView(
  views: ReadonlyMap<NodeId | null, ReadonlySet<string>>,
  document: Document,
  ownerId: NodeId,
): ReadonlySet<string> {
  const owner = requireNode(document, ownerId)
  let source: ReadonlySet<string> | undefined
  for (let index = owner.ancestors.length - 1; index >= 0 && source === undefined; index -= 1) {
    const ancestor = owner.ancestors[index]!
    if (ancestor.starred === true) source = views.get(ancestor.id)
  }
  source ??= views.get(null) ?? NO_IDS
  // Walking up from each remembered id costs at most the maximum depth per id, independent of the
  // size of the owner's subtree.
  const parents = buildNodeIndex(document)
  const ids = new Set<string>()
  for (const id of source) {
    let cursor = parents.get(id)
    while (cursor !== undefined && cursor !== null && cursor !== ownerId) cursor = parents.get(cursor)
    if (cursor === ownerId) ids.add(id)
  }
  return ids
}

export function isNodeExpanded(state: ExpansionState, nodeId: string): boolean {
  return state.expandedIds.has(nodeId)
}

function withIds(state: ExpansionState, expandedIds: ReadonlySet<string>): ExpansionState {
  return { ...state, expandedIds }
}

export function expandNode(state: ExpansionState, nodeId: string): ExpansionState {
  if (state.expandedIds.has(nodeId)) return state
  return withIds(state, new Set(state.expandedIds).add(nodeId))
}

export function collapseNode(state: ExpansionState, nodeId: string): ExpansionState {
  if (!state.expandedIds.has(nodeId)) return state
  const next = new Set(state.expandedIds)
  next.delete(nodeId)
  return withIds(state, next)
}

/** Closes every fold of the active view; other views keep their choices. */
export function collapseActiveView(state: ExpansionState): ExpansionState {
  return state.expandedIds.size === 0 ? state : withIds(state, NO_IDS)
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
  return next.size === state.expandedIds.size ? state : withIds(state, next)
}

export function collapseSubtree(state: ExpansionState, node: TreeNode): ExpansionState {
  const next = new Set(state.expandedIds)
  forEachNode(node, (current) => {
    next.delete(current.id)
  })
  return next.size === state.expandedIds.size ? state : withIds(state, next)
}

export function collapseForest(state: ExpansionState, nodes: readonly TreeNode[]): ExpansionState {
  if (state.expandedIds.size === 0) return state
  const next = new Set(state.expandedIds)
  for (const node of nodes)
    forEachNode(node, (current) => {
      next.delete(current.id)
    })
  return next.size === state.expandedIds.size ? state : withIds(state, next)
}

export function expandForest(state: ExpansionState, nodes: readonly TreeNode[]): ExpansionState {
  const next = new Set(state.expandedIds)
  for (const node of nodes)
    forEachNode(node, (current) => {
      if (current.children.length > 0) next.add(current.id)
    })
  return next.size === state.expandedIds.size ? state : withIds(state, next)
}
