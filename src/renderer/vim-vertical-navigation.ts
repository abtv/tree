import type { EditorSnapshot } from '../application/editor-store-types'
import { requireNode, type TreeNode } from '../domain/document'
import { focusCaretTransition, verticalCaretTransition, type VimCaretState } from './vim-caret-transition'

export interface VimVerticalNavigationStore {
  getSnapshot: () => EditorSnapshot
  moveSelection: (direction: 'up' | 'down', cursor: number) => void
}

export interface VimVerticalNavigationOptions {
  store: VimVerticalNavigationStore
  node: TreeNode
  caret: VimCaretState
  direction: 'up' | 'down'
  count: number
  setCaret: (cursor: number) => void
  applyCaretState: (nodeId: string, state: VimCaretState, isFocus?: boolean) => void
}

/** Apply counted vertical motion, including same-node image steps and focus transitions. */
export function navigateVertically({
  store,
  node,
  caret: initialCaret,
  direction,
  count,
  setCaret,
  applyCaretState,
}: VimVerticalNavigationOptions): void {
  let currentNode = node
  let caret = initialCaret
  let navigationCursor = initialCaret.cursor

  for (let index = 0; index < count; index += 1) {
    const before = store.getSnapshot()
    if (before.status !== 'ready') break
    // Counted vertical motion crosses onto the selected node's own actual sibling (or real parent),
    // whatever depth it is displayed at through inline expansion.
    const located =
      before.document === undefined ? undefined : requireNode(before.document, before.location.selectedNodeId)
    const canCrossNode =
      located === undefined ||
      (direction === 'down'
        ? before.location.selectedNodeId === before.location.currentParentId
          ? currentNode.children.length > 0
          : located.index < located.siblings.length - 1
        : before.location.selectedNodeId === before.location.currentParentId ||
          located.index > 0 ||
          located.parent !== null)
    const step = verticalCaretTransition(
      caret,
      direction,
      currentNode.text.length,
      index === 0 && currentNode.attachment !== undefined,
      canCrossNode,
    )
    if (!step.crossNode) {
      if (step.caret === caret) {
        applyCaretState(currentNode.id, caret)
        break
      }
      caret = step.caret
      navigationCursor = caret.cursor
      setCaret(caret.cursor)
      applyCaretState(currentNode.id, caret)
      continue
    }

    const focusCursor = index === 0 ? step.focusCursor : navigationCursor
    store.moveSelection(direction, focusCursor)
    if (index === 0 && direction === 'down' && caret.imageActive) navigationCursor = 0
    const after = store.getSnapshot()
    if (after.status !== 'ready') break
    if (
      (after.focus !== undefined && after.focus.token === before.focus?.token) ||
      (after.focus === undefined &&
        after.location.selectedNodeId === before.location.selectedNodeId &&
        after.location.selectedNodeId === currentNode.id &&
        count === 1)
    ) {
      applyCaretState(currentNode.id, caret)
      break
    }
    if (after.document === undefined) continue
    const crossedToDifferentNode = after.location.selectedNodeId !== currentNode.id
    currentNode = requireNode(after.document, after.location.selectedNodeId).node
    caret = focusCaretTransition(
      caret,
      after.focus?.cursor ?? focusCursor,
      currentNode.text.length,
      currentNode.attachment !== undefined,
      true,
      direction === 'up' && crossedToDifferentNode,
    )
    applyCaretState(currentNode.id, caret, true)
  }
}
