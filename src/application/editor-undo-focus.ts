import type { Document, LinkRange, Location, NodeId, TreeNode } from '../domain/document'

/** Where the caret belongs after undo or redo, and the location that displays it. */
export interface UndoFocusTarget {
  readonly location: Location
  readonly focus: { readonly nodeId: NodeId; readonly cursor: number }
}

/** The node a change starts in, with the parent whose child list holds it. */
export interface ChangeSite {
  readonly nodeId: NodeId
  readonly parentId: NodeId | null
  readonly cursor: number
}

/**
 * Locate the start of the change between two document snapshots, which is where Vim leaves the
 * caret after undo or redo. Returns undefined when the snapshots hold the same content.
 *
 * Every editing command path-copies only the nodes from a root to the affected sibling array and
 * shares every other subtree by reference (`docs/ARCHITECTURE.md` §11), so reference equality prunes
 * unchanged subtrees in constant time and the walk visits only the changed path. A reallocated node
 * whose content is identical is still compared by value, because a whole-node Visual case command
 * rebuilds every selected subtree whether or not its text changes.
 */
export function locateChangeSite(before: Document, after: Document): ChangeSite | undefined {
  if (before === after) return undefined
  return forestChangeSite(before.roots, after.roots, null)
}

/**
 * Resolve the change between two snapshots into the focus and location undo or redo should publish.
 * A change site that is the node the user is currently inside stays the current-parent heading;
 * any other site is displayed at its own parent's level, so the change is visible.
 */
export function changeSiteFocus(before: Document, after: Document, current: Location): UndoFocusTarget | undefined {
  const site = locateChangeSite(before, after)
  if (site === undefined) return undefined
  const location: Location =
    site.nodeId === current.currentParentId
      ? { currentParentId: site.nodeId, selectedNodeId: site.nodeId }
      : { currentParentId: site.parentId, selectedNodeId: site.nodeId }
  return { location, focus: { nodeId: site.nodeId, cursor: site.cursor } }
}

function forestChangeSite(
  before: readonly TreeNode[],
  after: readonly TreeNode[],
  parentId: NodeId | null,
): ChangeSite | undefined {
  if (before === after) return undefined
  const shared = Math.min(before.length, after.length)
  for (let index = 0; index < shared; index += 1) {
    const from = before[index]!
    const to = after[index]!
    if (from === to) continue
    if (from.id !== to.id) return positionalChangeSite(after, index, parentId)
    const inside = nodeChangeSite(from, to, parentId)
    if (inside !== undefined) return inside
  }
  if (before.length !== after.length) return positionalChangeSite(after, shared, parentId)
  return undefined
}

function nodeChangeSite(from: TreeNode, to: TreeNode, parentId: NodeId | null): ChangeSite | undefined {
  if (from.text !== to.text) {
    return { nodeId: to.id, parentId, cursor: commonPrefixLength(from.text, to.text) }
  }
  // An attachment is the node's terminal character, so an attachment-only change belongs at its end.
  if (from.attachment?.id !== to.attachment?.id) return { nodeId: to.id, parentId, cursor: to.text.length }
  const link = firstChangedLinkStart(from.links, to.links)
  if (link !== undefined) return { nodeId: to.id, parentId, cursor: link }
  return forestChangeSite(from.children, to.children, to.id)
}

/**
 * Resolve a change that added, removed, or reordered siblings: the site is whichever node the
 * resulting document now shows at the first position the two lists disagree on. That is the added
 * node for an insertion and the following survivor for a removal. A removal that leaves nothing
 * there falls back to the previous sibling and then to the parent heading.
 *
 * One rule resolves every removal, which matches `deleteSelectedTransition`'s own order but not
 * `deleteEmptySelectedTransition`'s, whose forward caret moves to the end of the previous sibling so
 * typing can continue there. That sibling does not change in the document, so it is not where the
 * change is; ADR 0015 records the consequence.
 */
function positionalChangeSite(
  after: readonly TreeNode[],
  index: number,
  parentId: NodeId | null,
): ChangeSite | undefined {
  const site = after[index] ?? after[index - 1]
  if (site !== undefined) return { nodeId: site.id, parentId, cursor: 0 }
  if (parentId === null) return undefined
  return { nodeId: parentId, parentId, cursor: 0 }
}

function commonPrefixLength(before: string, after: string): number {
  const shared = Math.min(before.length, after.length)
  let index = 0
  while (index < shared && before[index] === after[index]) index += 1
  return index
}

/** The earliest offset whose link coverage changed, for a change that left the text untouched. */
function firstChangedLinkStart(
  before: readonly LinkRange[] | undefined,
  after: readonly LinkRange[] | undefined,
): number | undefined {
  if (before === after) return undefined
  const from = before ?? []
  const to = after ?? []
  const shared = Math.min(from.length, to.length)
  for (let index = 0; index < shared; index += 1) {
    const a = from[index]!
    const b = to[index]!
    if (a.start !== b.start || a.end !== b.end || a.url !== b.url) return Math.min(a.start, b.start)
  }
  if (from.length > shared) return from[shared]!.start
  if (to.length > shared) return to[shared]!.start
  return undefined
}
