import { buildNodeIndex, type Document, type NodeId } from '../domain/document'
import { activateExpansionView, type ExpansionState } from './expansion-state'

/*
 * Bounds the views of nodes the document no longer contains (`docs/PRODUCT.md` §§2.4, 22.1). Such a
 * view stays while undo or redo can restore its node, so Undo and Redo restore the node with its view;
 * then the view is dropped. A view of a node the document contains stays for the session, so starring
 * the node again restores it.
 *
 * A node leaves the document only through a change, undo or redo, and each records the snapshot it
 * replaces in `EditorHistory` with `departedViewOwners`. That snapshot is the last history state that
 * can restore the node: older states that hold it leave history first, because eviction removes the
 * oldest entry and a new change discards the whole redo branch, and removed node ids never return
 * through a change. When history releases the snapshot, `releaseViews` drops the views of its departed
 * owners unless the document holds them again. History itself is never walked. Recording a structural
 * change may build the replacement's node index, one walk of that document that publishing it usually
 * needs anyway, and a release that drops a view copies the map of inactive views once.
 */

const NO_OWNERS: readonly NodeId[] = []

/**
 * The owners of views, active or inactive, whose nodes `recorded` contains and `replacement` lacks.
 * Documents that share one node index hold the same nodes, so a text edit looks up no owner.
 */
export function departedViewOwners(
  expansion: ExpansionState,
  recorded: Document,
  replacement: Document,
): readonly NodeId[] {
  if (expansion.viewOwnerId === null && expansion.otherViews.size === 0) return NO_OWNERS
  const before = buildNodeIndex(recorded)
  const after = buildNodeIndex(replacement)
  if (before === after) return NO_OWNERS
  const departed: NodeId[] = []
  const check = (ownerId: NodeId | null): void => {
    if (ownerId !== null && !after.has(ownerId) && before.has(ownerId)) departed.push(ownerId)
  }
  for (const ownerId of expansion.otherViews.keys()) check(ownerId)
  check(expansion.viewOwnerId)
  return departed.length === 0 ? NO_OWNERS : departed
}

/**
 * Drops the views of `released` owners, which no history state can restore any longer, unless `document`
 * contains them. Returns `expansion` itself when it drops nothing.
 */
export function releaseViews(
  expansion: ExpansionState,
  document: Document,
  released: readonly NodeId[],
): ExpansionState {
  if (released.length === 0) return expansion
  const unreachable = released.filter((ownerId) => !buildNodeIndex(document).has(ownerId))
  // While Agenda is open, Tree keeps its view active even after the view's owner leaves the document.
  // The root view replaces such a view; closing Agenda then activates the view of the Tree location.
  const state =
    expansion.viewOwnerId !== null && unreachable.includes(expansion.viewOwnerId)
      ? activateExpansionView(expansion, document, null)
      : expansion
  if (!unreachable.some((ownerId) => state.otherViews.has(ownerId))) return state
  const otherViews = new Map(state.otherViews)
  for (const ownerId of unreachable) otherViews.delete(ownerId)
  return { ...state, otherViews }
}
