import {
  cloneNode,
  cloneNodeWithNewIds,
  displayedNodes,
  ensureRoot,
  locateNode,
  MAX_DOCUMENT_DEPTH_ERROR,
  nodePath,
  normalizeLinks,
  replaceSiblingRange,
  requireNode,
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
): StructuralTransition | RejectedTransition {
  if (wouldExceedMaximumDepth(document, nodeId, source.nodes)) {
    return { kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR }
  }
  const copies = source.nodes.map((node) => cloneNodeWithNewIds(node, createId))
  const target = requireNode(document, nodeId).node
  const replacements = position === 'before' ? copies : [target, ...copies]
  const nextDocument = replaceSiblingRange(document, nodeId, position === 'before' ? 0 : 1, replacements)
  const selectedId = copies[0]!.id
  return {
    document: nextDocument,
    location: { ...location, selectedNodeId: selectedId },
    focus: { nodeId: selectedId, cursor: 0 },
  }
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
    replacements = source!.nodes.map((node) => cloneNodeWithNewIds(node, createId))
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
