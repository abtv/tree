import type { VimCaretState } from './vim-caret-transition'

export type PendingCaret = {
  nodeId: string
  input?: HTMLElement
  cursor: number
  normal: boolean
  revision: number
  focusToken: number | undefined
  /** The edit replaced the node's element, so the new element must take focus before the caret. */
  refocus?: boolean
  /** A released drag restores the captured caret after its move's focus intent is applied. */
  restoredCaret?: VimCaretState
}

export type PendingVisualSelection = {
  nodeId: string
  start: number
  end: number
  endpoints?: { anchor: number; focus: number; hadText: boolean }
}

export type NodeVisualSelection = { anchorId: string; focusId: string }
