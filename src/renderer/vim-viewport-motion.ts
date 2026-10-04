import type { EditorStore } from '../application/editor-store'
import { requireNode } from '../domain/document'
import { viewportBounds } from './scroll-viewport'
import { firstNonWhitespace } from './vim-editing'
import type { VimViewportMotion } from './vim-keyboard-types'

type ViewportRow = { nodeId: string | undefined; top: number; bottom: number }
type Viewport = ReturnType<typeof viewportBounds>

export function readViewportRows(): { rows: ViewportRow[]; viewport: Viewport } {
  const viewport = viewportBounds()
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.node-row')).map((row) => {
    const bounds = row.getBoundingClientRect()
    return { nodeId: row.dataset.nodeId, top: bounds.top, bottom: bounds.bottom }
  })
  return { rows, viewport }
}

export function viewportMotionTarget(
  rows: readonly ViewportRow[],
  viewport: Viewport,
  nodeId: string,
  motion: VimViewportMotion,
  count = 1,
): string | undefined {
  const intersectingRows = rows.filter((row) => row.top < viewport.bottom && row.bottom > viewport.top)
  // H, M, and L pick among fully visible rows, as Vim does, so the destination never needs the
  // scroll that revealing a clipped row would cause. A viewport with none falls back to the clipped ones.
  const fullyVisibleRows =
    motion === 'top' || motion === 'middle' || motion === 'bottom'
      ? intersectingRows.filter((row) => row.top >= viewport.top && row.bottom <= viewport.bottom)
      : []
  const visibleRows = fullyVisibleRows.length > 0 ? fullyVisibleRows : intersectingRows
  if (visibleRows.length === 0) return
  const currentIndex = visibleRows.findIndex((row) => row.nodeId === nodeId)
  const baseIndex = currentIndex < 0 ? (motion === 'half-up' ? visibleRows.length - 1 : 0) : currentIndex
  const targetIndex =
    motion === 'top'
      ? Math.min(visibleRows.length - 1, count - 1)
      : motion === 'middle'
        ? Math.floor((visibleRows.length - 1) / 2)
        : motion === 'bottom'
          ? Math.max(0, visibleRows.length - count)
          : Math.max(
              0,
              Math.min(
                visibleRows.length - 1,
                baseIndex + (motion === 'half-down' ? 1 : -1) * Math.max(1, Math.floor(visibleRows.length / 2)),
              ),
            )
  return visibleRows[targetIndex]?.nodeId
}

export function moveViewportSelection(
  deps: { store: EditorStore; syncImageCaretToFocus: () => void },
  nodeId: string,
  motion: VimViewportMotion,
  cursor: number,
  count = 1,
): void {
  const { store, syncImageCaretToFocus } = deps
  const { rows, viewport } = readViewportRows()
  const targetId = viewportMotionTarget(rows, viewport, nodeId, motion, count)
  if (targetId !== undefined) {
    // H, M, and L are line motions: they land on the first non-blank character, or on the image of a
    // node that has one (the position after its text), where the half-page motions keep the caret column.
    const state = store.getSnapshot()
    const lineMotion = motion === 'top' || motion === 'middle' || motion === 'bottom'
    let column = cursor
    if (lineMotion && state.status === 'ready') {
      const { text, attachment } = requireNode(state.document, targetId).node
      column = attachment === undefined ? firstNonWhitespace(text) : text.length
    }
    store.selectNode(targetId, column)
    syncImageCaretToFocus()
  }
}
