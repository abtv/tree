import type { PendingCaretPlacement } from './caret-projection-state'

export type PendingCaret = PendingCaretPlacement<HTMLElement>
export type { PendingVisualSelection } from './caret-projection-state'

export type NodeVisualSelection = { anchorId: string; focusId: string }
