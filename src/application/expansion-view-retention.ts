import { buildNodeIndex, locateNode, type Document, type NodeId, type TreeNode } from '../domain/document'
import type { ExpansionState } from './expansion-state'

/** The fewest views of absent nodes that start a scan of undo history. */
export const MIN_RETAINED_VIEW_SCAN = 32

/**
 * Bounds the views of nodes the document no longer contains (`docs/PRODUCT.md` §§2.4, 22.1). Such a
 * view stays while undo or redo history holds its node, so Undo restores the node with its view; once
 * history no longer holds the node, the view is dropped. A view of a node the document contains stays
 * for the session, so starring the node again restores it.
 *
 * Scanning history costs time proportional to the nodes it holds apart from the document, so a scan
 * starts only when the number of views of absent nodes reaches a threshold, which doubles with the
 * views a scan keeps. The retained views therefore stay bounded by history, and scan cost is amortized
 * over the views that become unreachable.
 */
export class ExpansionViewRetention {
  private scanAt = MIN_RETAINED_VIEW_SCAN

  /**
   * Drops the views that `document` and the snapshots `history` returns cannot restore. Call it after
   * history released snapshots; `history` is read only when a scan starts. Returns `expansion` itself
   * when it drops nothing.
   */
  public release(expansion: ExpansionState, document: Document, history: () => Iterable<Document>): ExpansionState {
    const index = buildNodeIndex(document)
    const absent = new Set<NodeId>()
    for (const ownerId of expansion.otherViews.keys()) {
      if (ownerId !== null && !index.has(ownerId)) absent.add(ownerId)
    }
    if (absent.size < this.scanAt) return expansion

    const reachable = idsInHistory(absent, document, history())
    this.scanAt = Math.max(MIN_RETAINED_VIEW_SCAN, 2 * reachable.size)
    if (reachable.size === absent.size) return expansion
    const otherViews = new Map(expansion.otherViews)
    for (const ownerId of absent) if (!reachable.has(ownerId)) otherViews.delete(ownerId)
    return { ...expansion, otherViews }
  }
}

/**
 * The ids among `wanted` that a history snapshot contains. `wanted` holds only ids that `document`
 * lacks, so a subtree `document` shares by reference cannot contain one, and neither can a subtree
 * already visited in another snapshot. Snapshots share every unchanged subtree, so the walk visits
 * each node history holds apart from the document at most once.
 */
function idsInHistory(wanted: ReadonlySet<NodeId>, document: Document, history: Iterable<Document>): Set<NodeId> {
  const found = new Set<NodeId>()
  const visited = new Set<TreeNode>()
  const stack: TreeNode[] = []
  for (const snapshot of history) {
    for (const root of snapshot.roots) stack.push(root)
    while (stack.length > 0) {
      const node = stack.pop()!
      if (visited.has(node)) continue
      visited.add(node)
      if (wanted.has(node.id)) {
        found.add(node.id)
        if (found.size === wanted.size) return found
      } else if (locateNode(document, node.id)?.node === node) continue
      for (const child of node.children) stack.push(child)
    }
  }
  return found
}
