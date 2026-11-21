import { locateNode, type Document, type NodeId } from '../domain/document'

interface ReturnPosition {
  /** The current parent of the list in which the row stood; `null` is the root level. */
  readonly level: NodeId | null
  /** The row's distance from the top of the window, as the renderer measured it. */
  readonly top: number
}

const UNCHECKED = Symbol('unchecked')

/**
 * Where the row of each entered node stood in the window when the user entered it, so that going
 * back can return the row there (`docs/PRODUCT.md` §7.1). Session memory only: nothing here is saved.
 *
 * An entry lives while its node is the current parent or one of its ancestors, so the map holds at
 * most one entry per level of the current path, bounded by the maximum depth (§2.3).
 */
export class ReturnPositions {
  private readonly entries = new Map<NodeId, ReturnPosition>()
  private checkedParentId: NodeId | null | typeof UNCHECKED = UNCHECKED

  public remember(nodeId: NodeId, level: NodeId | null, top: number): void {
    this.entries.set(nodeId, { level, top })
  }

  public forget(nodeId: NodeId): void {
    this.entries.delete(nodeId)
  }

  /**
   * The position to restore when going back to `level` selects `nodeId`. The entry is used once; one
   * recorded in another list, such as an inline-expanded row's original level, restores nothing.
   */
  public take(nodeId: NodeId, level: NodeId | null): number | undefined {
    const entry = this.entries.get(nodeId)
    this.entries.delete(nodeId)
    return entry?.level === level ? entry.top : undefined
  }

  /** Forgets every entry whose node is no longer the current parent or one of its ancestors. */
  public retainPath(document: Document, currentParentId: NodeId | null): void {
    if (this.entries.size === 0) {
      this.checkedParentId = UNCHECKED
      return
    }

    // Typing publishes a new document on every keystroke; the path changes only with the parent.
    if (currentParentId === this.checkedParentId) return
    this.checkedParentId = currentParentId

    const located = currentParentId === null ? undefined : locateNode(document, currentParentId)
    const path = new Set<NodeId>(located === undefined ? [] : [...located.ancestors, located.node].map(({ id }) => id))

    for (const nodeId of this.entries.keys()) if (!path.has(nodeId)) this.entries.delete(nodeId)
  }
}
