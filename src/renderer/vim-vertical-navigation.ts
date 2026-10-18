import type { EditorSnapshot } from '../application/editor-store-types'
import { requireNode, type TreeNode } from '../domain/document'
import { focusCaretTransition, verticalCaretTransition, type VimCaretState } from './vim-caret-transition'

export interface VimVerticalNavigationStore {
  getSnapshot: () => EditorSnapshot
  getVisibleRows: () => readonly { node: TreeNode }[]
  moveSelection: (direction: 'up' | 'down', cursor: number) => void
}

export interface VimVerticalNavigationOptions {
  store: VimVerticalNavigationStore
  node: TreeNode
  caret: VimCaretState
  direction: 'up' | 'down'
  count: number
  applyCaretState: (nodeId: string, state: VimCaretState, isFocus?: boolean) => void
  textLineCursor?: (node: TreeNode, cursor: number, entering: boolean, resetColumn?: boolean) => number | undefined
}

/** Apply counted vertical motion, including same-node image steps and focus transitions. */
export function navigateVertically({
  store,
  node,
  caret: initialCaret,
  direction,
  count,
  applyCaretState,
  textLineCursor,
}: VimVerticalNavigationOptions): void {
  let currentNode = node
  let caret = initialCaret
  let navigationCursor = initialCaret.cursor

  for (let index = 0; index < count; index += 1) {
    const before = store.getSnapshot()
    if (before.status !== 'ready') break
    if (!caret.imageActive) {
      const lineCursor = textLineCursor?.(currentNode, caret.cursor, false)
      if (lineCursor !== undefined) {
        caret = { cursor: lineCursor, imageActive: false }
        navigationCursor = lineCursor
        applyCaretState(currentNode.id, caret)
        continue
      }
    }
    // Counted vertical motion crosses onto the adjacent visible row, or to the current-parent
    // heading when moving up from the first visible row.
    const rows = store.getVisibleRows()
    const rowIndex = rows.findIndex((row) => row.node.id === before.location.selectedNodeId)
    const headingSelected = before.location.selectedNodeId === before.location.currentParentId
    const canCrossNode = headingSelected
      ? direction === 'down'
        ? rows.length > 0
        : true
      : rowIndex < 0 ||
        (direction === 'down' ? rowIndex < rows.length - 1 : rowIndex > 0 || before.location.currentParentId !== null)
    const step = verticalCaretTransition(
      caret,
      direction,
      currentNode.text.length,
      currentNode.id === node.id && currentNode.attachment !== undefined,
      canCrossNode,
    )
    if (!step.crossNode) {
      if (step.caret === caret) {
        applyCaretState(currentNode.id, caret)
        break
      }
      caret = step.caret
      navigationCursor = caret.cursor
      applyCaretState(currentNode.id, caret)
      continue
    }

    const focusCursor = index === 0 ? step.focusCursor : navigationCursor
    store.moveSelection(direction, focusCursor)
    // Mutation triage: an upward crossing with the image active only happens for an image-only node,
    // whose cursor is already `0`, so resetting the navigation cursor for both directions is a no-op.
    if (index === 0 && direction === 'down' && caret.imageActive) navigationCursor = 0
    const after = store.getSnapshot()
    if (after.status !== 'ready') break
    // Mutation triage: a ready snapshot always carries `focus` and `document` (see `EditorSnapshot`),
    // so the optional chains, the `focus === undefined` clause, and the `document` guard below are
    // defensive and unreachable; changing them cannot alter a result.
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
    const leftImage = caret.imageActive
    currentNode = requireNode(after.document, after.location.selectedNodeId).node
    caret = focusCaretTransition(
      caret,
      after.focus?.cursor ?? focusCursor,
      currentNode.text.length,
      currentNode.attachment !== undefined,
      true,
      direction === 'up' && crossedToDifferentNode,
    )
    // Retain the existing counted-image arrival offset; wrapped text only changes text-line steps.
    if (crossedToDifferentNode && currentNode.text.length > 0 && !(leftImage && index > 0 && direction === 'down')) {
      const lineCursor = textLineCursor?.(currentNode, caret.cursor, true, direction === 'down' && leftImage)
      if (lineCursor !== undefined)
        caret =
          direction === 'up' && caret.imageActive
            ? { ...caret, imageTextReturnCursor: lineCursor }
            : { cursor: lineCursor, imageActive: false }
    }
    applyCaretState(currentNode.id, caret, true)
  }
}
