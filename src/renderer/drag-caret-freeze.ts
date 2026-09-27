import type { VimCaretState } from './vim-caret-transition'

export interface CaretFreeze {
  nodeId: string
  pointerId: number
  caret: VimCaretState
}

/** The imperative surface the drag layer may use; the caret authority owns the record. */
export interface NodeDragCaretFreeze {
  begin(nodeId: string, pointerId: number): void
  end(pointerId?: number): void
}

/** Record the caret a node drag suspends until the frozen pointer is released. */
export function freezeCaret(nodeId: string, pointerId: number, caret: VimCaretState): CaretFreeze {
  return { nodeId, pointerId, caret }
}

/** The freeze a release applies to; `pointerId === undefined` releases any freeze. */
export function releaseCaret(freeze: CaretFreeze | undefined, pointerId: number | undefined): CaretFreeze | undefined {
  if (freeze === undefined) return undefined
  if (pointerId !== undefined && pointerId !== freeze.pointerId) return undefined
  return freeze
}
