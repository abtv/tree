import {
  cloneNode,
  cloneNodeWithNewIds,
  displayedNodes,
  ensureRoot,
  JOIN_ATTACHMENTS_ERROR,
  joinSiblingRange,
  locateNode,
  MAX_DOCUMENT_DEPTH_ERROR,
  nodePath,
  normalizeLinks,
  replaceSiblingRange,
  requireNode,
  shiftSiblingRange,
  wouldExceedMaximumDepth,
  type Document,
  type Location,
  type NodeId,
  type TreeNode,
} from '../domain/document'
import type { RejectedTransition, StructuralTransition } from './editor-command-transitions'

export type NodeVisualCommand = 'y' | 'd' | 'x' | 'c' | 's' | 'u' | 'U' | 'p' | 'P'

export interface NodeForest {
  nodes: readonly TreeNode[]
  sourceIds: readonly NodeId[]
}

export function isPasteIntoSourceDescendant(
  document: Document,
  targetId: NodeId,
  sourceIds: readonly NodeId[],
): boolean {
  const path = nodePath(document, targetId).map((node) => node.id)
  return sourceIds.some((sourceId) => path.slice(0, -1).includes(sourceId))
}

export function pasteNodeForestTransition(
  document: Document,
  location: Location,
  nodeId: NodeId,
  position: 'before' | 'after',
  source: NodeForest,
  createId: () => NodeId,
  repeat = 1,
  selectAfter = false,
): StructuralTransition | RejectedTransition {
  if (wouldExceedMaximumDepth(document, nodeId, source.nodes)) {
    return { kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR }
  }
  // `repeat` whole copies, each with fresh IDs, inserted by one document change (T1).
  const copies = Array.from({ length: repeat }, () =>
    source.nodes.map((node) => cloneNodeWithNewIds(node, createId)),
  ).flat()
  const located = requireNode(document, nodeId)
  const target = located.node
  const replacements = position === 'before' ? copies : [target, ...copies]
  const nextDocument = replaceSiblingRange(document, nodeId, position === 'before' ? 0 : 1, replacements)
  // `gp`/`gP` select the node that follows the inserted forest, or the last copy when none follows.
  const following = position === 'before' ? target : located.siblings[located.index + 1]
  const selectedId = selectAfter ? (following ?? copies[copies.length - 1]!).id : copies[0]!.id
  return {
    document: nextDocument,
    location: { ...location, selectedNodeId: selectedId },
    focus: { nodeId: selectedId, cursor: 0 },
  }
}

/**
 * The displayed parent after nodes moved in `document`. It stays while `selectedId` is still a
 * descendant of it; a move that takes the selection out of the displayed location makes the moved
 * node's new parent the location instead, so the selection stays a descendant of the current parent.
 * `<` and a drop onto another parent share this rule.
 */
export function currentParentAfterMove(
  document: Document,
  location: Location,
  selectedId: NodeId,
  movedId: NodeId,
): NodeId | null {
  const selected = requireNode(document, selectedId)
  const stillDisplayed =
    location.currentParentId === null || selected.ancestors.some((ancestor) => ancestor.id === location.currentParentId)
  return stillDisplayed ? location.currentParentId : (requireNode(document, movedId).parent?.id ?? null)
}

export type NodeVisualShiftTransition =
  | { kind: 'none' }
  | { kind: 'rejected'; message: string }
  | { kind: 'shifted'; transition: StructuralTransition; expandIds: readonly NodeId[] }

/**
 * `>` and `<` over the sibling range between `anchorId` and `focusId` (a single node for character
 * Visual mode): `count` successive one-level moves that either all happen or leave the document
 * alone (`docs/PRODUCT.md` §20.2.1). The selected node and caret offset stay as they are; only the
 * displayed location changes, and only when `out` takes the range above it.
 */
export function nodeVisualShiftTransition(
  document: Document,
  location: Location,
  direction: 'in' | 'out',
  anchorId: NodeId,
  focusId: NodeId,
  count: number,
  cursor: number,
): NodeVisualShiftTransition {
  if (anchorId === location.currentParentId || focusId === location.currentParentId) return { kind: 'none' }
  const anchorLocated = locateNode(document, anchorId)
  if (anchorLocated === undefined) return { kind: 'none' }
  const focusIndex = anchorLocated.siblings.findIndex((node) => node.id === focusId)
  if (focusIndex < 0) return { kind: 'none' }
  const start = Math.min(anchorLocated.index, focusIndex)
  const span = Math.abs(anchorLocated.index - focusIndex) + 1
  const firstId = anchorLocated.siblings[start]!.id
  let next = document
  const expandIds: NodeId[] = []
  for (let level = 0; level < count; level += 1) {
    if (direction === 'in') {
      const current = requireNode(next, firstId)
      const destination = current.siblings[current.index - 1]
      if (destination === undefined) return { kind: 'none' }
      expandIds.push(destination.id)
    }
    const result = shiftSiblingRange(next, firstId, span, direction)
    if (result.kind === 'impossible') return { kind: 'none' }
    if (result.kind === 'too-deep') return { kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR }
    next = result.document
  }
  // `<` can take the range out of the displayed location; the location then becomes the range's new
  // parent so the selection stays a descendant of the current parent.
  const currentParentId = currentParentAfterMove(next, location, location.selectedNodeId, firstId)
  return {
    kind: 'shifted',
    transition: {
      document: next,
      location: { ...location, currentParentId },
      focus: { nodeId: location.selectedNodeId, cursor },
    },
    expandIds,
  }
}

export type NodeJoinTransition =
  { kind: 'none' } | { kind: 'rejected'; message: string } | { kind: 'joined'; transition: StructuralTransition }

function joinTransition(
  document: Document,
  location: Location,
  firstId: NodeId,
  span: number,
  spaced: boolean,
): NodeJoinTransition {
  const result = joinSiblingRange(document, firstId, span, spaced)
  if (result.kind === 'impossible') return { kind: 'none' }
  if (result.kind === 'attachments') return { kind: 'rejected', message: JOIN_ATTACHMENTS_ERROR }
  return {
    kind: 'joined',
    transition: {
      document: result.document,
      location: { ...location, selectedNodeId: firstId },
      focus: { nodeId: firstId, cursor: result.cursor },
    },
  }
}

/**
 * Normal `J` and `gJ`: joins the selected node with the `count - 1` siblings after it, at least one,
 * clamped at the last sibling. A node with no following sibling and the current-parent heading
 * change nothing (`docs/PRODUCT.md` §20.2.1 T6).
 */
export function forwardJoinTransition(
  document: Document,
  location: Location,
  nodeId: NodeId,
  count: number,
  spaced: boolean,
): NodeJoinTransition {
  if (nodeId === location.currentParentId) return { kind: 'none' }
  const located = locateNode(document, nodeId)
  if (located === undefined) return { kind: 'none' }
  const span = Math.min(Math.max(2, count), located.siblings.length - located.index)
  return joinTransition(document, location, nodeId, span, spaced)
}

/** Whole-node Visual `J` and `gJ`: joins the sibling range between `anchorId` and `focusId`. */
export function nodeVisualJoinTransition(
  document: Document,
  location: Location,
  anchorId: NodeId,
  focusId: NodeId,
  spaced: boolean,
): NodeJoinTransition {
  if (anchorId === location.currentParentId || focusId === location.currentParentId) return { kind: 'none' }
  const anchorLocated = locateNode(document, anchorId)
  if (anchorLocated === undefined) return { kind: 'none' }
  const focusIndex = anchorLocated.siblings.findIndex((node) => node.id === focusId)
  if (focusIndex < 0) return { kind: 'none' }
  const start = Math.min(anchorLocated.index, focusIndex)
  return joinTransition(
    document,
    location,
    anchorLocated.siblings[start]!.id,
    Math.abs(anchorLocated.index - focusIndex) + 1,
    spaced,
  )
}

export type NodeVisualTransition =
  | { kind: 'none' }
  | { kind: 'rejected'; message: string }
  | { kind: 'yank'; register: NodeForest }
  | { kind: 'changed'; register: NodeForest; transition: StructuralTransition; cleanup: boolean }

export function nodeVisualTransition(
  document: Document,
  location: Location,
  command: NodeVisualCommand,
  anchorId: NodeId,
  focusId: NodeId,
  source: NodeForest | undefined,
  insertedText: string,
  canMutate: boolean,
  createId: () => NodeId,
  repeat = 1,
): NodeVisualTransition {
  // A whole-node Visual range only ever spans one real sibling array (`moveNodeVisual` only moves
  // within it), so the anchor's actual siblings resolve both endpoints, whatever depth they are
  // displayed at through inline expansion.
  const anchorLocated = locateNode(document, anchorId)
  if (anchorLocated === undefined) return { kind: 'none' }
  const siblings = anchorLocated.siblings
  const realParentId = anchorLocated.parent?.id ?? null
  const anchor = anchorLocated.index
  const focus = siblings.findIndex((node) => node.id === focusId)
  if (focus < 0) return { kind: 'none' }
  const start = Math.min(anchor, focus)
  const selected = siblings.slice(start, Math.max(anchor, focus) + 1)
  const first = selected[0]
  // Defensive: the anchor and focus indexes are both valid here, so the range is never empty.
  if (first === undefined) return { kind: 'none' }
  const register = { nodes: selected.map(cloneNode), sourceIds: selected.map((node) => node.id) }
  if (command === 'y') return { kind: 'yank', register }
  if (!canMutate) return { kind: 'none' }
  if ((command === 'p' || command === 'P') && (source === undefined || source.nodes.length === 0)) {
    return { kind: 'none' }
  }
  // `source` is always defined for a put here: the guard above already returned for an absent one,
  // so the optional chaining and the empty fallback only satisfy the type.
  if (
    (command === 'p' || command === 'P') &&
    isPasteIntoSourceDescendant(document, first.id, source?.sourceIds ?? [])
  ) {
    return { kind: 'rejected', message: 'Cannot paste a node into one of its descendants.' }
  }
  if ((command === 'p' || command === 'P') && wouldExceedMaximumDepth(document, first.id, source!.nodes)) {
    return { kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR }
  }
  let replacements: readonly TreeNode[] = []
  if (command === 'c' || command === 's') replacements = [{ id: createId(), text: insertedText, children: [] }]
  else if (command === 'p' || command === 'P')
    // `repeat` whole copies of the incoming forest, each with fresh IDs, replace the range at once.
    replacements = Array.from({ length: repeat }, () =>
      source!.nodes.map((node) => cloneNodeWithNewIds(node, createId)),
    ).flat()
  else if (command === 'u' || command === 'U') {
    const changeCase = (value: string): string => (command === 'u' ? value.toLowerCase() : value.toUpperCase())
    let changed = false
    const transform = (node: TreeNode): TreeNode => {
      const text = changeCase(node.text)
      if (text !== node.text) changed = true
      let originalOffset = 0
      let nextOffset = 0
      // A node without links maps no ranges; a bogus fallback entry would be dropped by `normalizeLinks`.
      const mappedLinks = (node.links ?? []).map((link) => {
        nextOffset += changeCase(node.text.slice(originalOffset, link.start)).length
        const start = nextOffset
        nextOffset += changeCase(node.text.slice(link.start, link.end)).length
        const end = nextOffset
        originalOffset = link.end
        return { start, end, url: text.slice(start, end) }
      })
      const links = normalizeLinks(mappedLinks, text)
      return {
        id: node.id,
        text,
        ...(links.length === 0 ? {} : { links }),
        ...(node.attachment === undefined ? {} : { attachment: node.attachment }),
        children: node.children.map(transform),
      }
    }
    replacements = selected.map(transform)
    if (!changed) return { kind: 'none' }
  }
  let nextDocument = replaceSiblingRange(document, first.id, selected.length, replacements)
  if (nextDocument.roots.length === 0) nextDocument = ensureRoot(nextDocument, createId())
  const nextSiblings = displayedNodes(nextDocument, realParentId)
  const target = replacements[0] ?? nextSiblings[start] ?? nextSiblings[start - 1]
  const selectedId = target?.id ?? realParentId ?? nextDocument.roots[0]!.id
  return {
    kind: 'changed',
    register,
    transition: {
      document: nextDocument,
      location: { ...location, selectedNodeId: selectedId },
      focus: { nodeId: selectedId, cursor: 0 },
    },
    cleanup:
      command === 'd' || command === 'x' || command === 'c' || command === 's' || command === 'p' || command === 'P',
  }
}
