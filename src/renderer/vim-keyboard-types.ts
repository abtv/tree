import type { NodeForest, NodeVisualCommand } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import type { NodeFoldCommand } from './expansion-state'
import type { VimMode } from './vim-editing'
import type { VimCaretState } from './vim-caret-transition'
import type { VimCommandState } from './vim-command-state'

export type VimTextChange =
  | {
      kind: 'delete' | 'change' | 'yank'
      motion: string
      count: number
      insertedText?: string
      insertOffset?: number
      deleteCount?: number
      /** Set only when enriched via a finished Insert session (`change`); see `nodeId` below. */
      nodeId?: string
    }
  | { kind: 'replace'; count: number; character: string }
  | {
      kind: 'substitute'
      count: number
      insertedText?: string
      insertOffset?: number
      deleteCount?: number
      nodeId?: string
    }
  | {
      kind: 'insert'
      entry: 'i' | 'a' | 'I' | 'A'
      insertedText?: string
      insertOffset?: number
      deleteCount?: number
      /**
       * The node an Insert session's diff was captured against. A session can span a node change
       * (e.g. `Enter` while still in Insert mode) with no intervening Escape to finish it in place,
       * so `.` must only replay this diff when the node it was captured on is still the current one
       * — reapplying it elsewhere would misattribute text typed into one node to another.
       */
      nodeId?: string
    }
  | { kind: 'paste'; after: boolean; text: string }
  | { kind: 'overwrite'; text: string; replaced: number }
  | { kind: 'case'; mode: 'toggle' | 'lower' | 'upper'; count: number }

export type VimSurroundChange =
  | { kind: 'surround-add'; motion: string; count: number; delimiter: string }
  | { kind: 'surround-delete'; target: string; count: number }
  | { kind: 'surround-change'; target: string; delimiter: string; count: number }

export type VimStructuralChange =
  | { kind: 'structural-delete' }
  | { kind: 'structural-put'; position: 'before' | 'after'; source: TreeNode; sourceIds: readonly string[] }
  | { kind: 'structural-forest-put'; position: 'before' | 'after'; source: NodeForest }
  | { kind: 'structural-open'; position: 'before' | 'after'; text: string }
  | { kind: 'structural-child-open'; text: string }
  | {
      kind: 'structural-visual'
      command: Exclude<NodeVisualCommand, 'y'>
      span: number
      source?: NodeForest
      text?: string
    }

export type VimRepeatChange = VimTextChange | VimSurroundChange | VimStructuralChange

export interface VimFindCommand {
  kind: 'f' | 'F' | 't' | 'T'
  character: string
}

/** The keystrokes a surround command still needs after `ys`, `ds`, or `cs`. */
export type VimSurroundStage =
  | { stage: 'delimiter'; start: number; end: number; fromVisual?: boolean }
  | { stage: 'target'; operation: 'delete' | 'change'; count: number }
  | { stage: 'replacement'; target: string; count: number }

export interface VimPendingCommand {
  count: string
  operator?: 'd' | 'y' | 'c' | 's'
  motionCount: string
  awaiting?: 'f' | 'F' | 't' | 'T' | 'r'
  prefix?: 'g' | 'i' | 'a' | 'z'
  surround?: VimSurroundStage
}

/**
 * The fold transitions the `z` keys request (`docs/PRODUCT.md` §20.2). The per-node commands act on
 * the selected node's own fold; the `-all` forms act on every fold in the current location.
 */
export type VimFoldCommand = NodeFoldCommand | 'close-all' | 'open-all'

export interface VimKeyboardState {
  mode: VimMode
  register: { current: VimRegister }
  /** The command-state owner; handlers read and write its fields and clear through its transitions. */
  commandState: VimCommandState
  beginInsert: (nodeId: string, baseline: string, position: number, change: VimTextChange) => void
  finishInsert: (input: HTMLElement) => void
  beginReplace: (nodeId: string, input: HTMLElement, baseline: string, position: number) => void
  handleReplaceKey: (input: HTMLElement, key: string) => boolean
  /**
   * Commit and consume a pending Replace session. `retreatCursor` mirrors the Escape/undo retreat;
   * `preserveDomSelection` commits only to the store and leaves the DOM text, selection, and caret
   * untouched, because a text-editing command that interrupts the session (paste/cut) must act on
   * what the user still sees selected.
   */
  finishReplace: (input: HTMLElement, retreatCursor?: boolean, preserveDomSelection?: boolean) => boolean
  imageTextCursor: { current: number | undefined }
  getCaretState: (nodeId: string, cursor: number, imageActive: boolean) => VimCaretState
  applyCaretState: (nodeId: string, state: VimCaretState, fromFocus?: boolean) => void
  moveBoundary: (boundary: 'first' | 'last' | 'parent', cursor: number, count?: number) => void
  moveViewport: (nodeId: string, motion: VimViewportMotion, cursor: number) => void
  syncImageCaretToFocus: () => void
  setMode: (mode: VimMode) => void
  openAttachment: (attachmentId: string) => void
  setImageCaret: (nodeId: string, active: boolean, fromFocus?: boolean) => void
  scheduleCaret: (input: HTMLElement, cursor: number) => void
  nodeVisual: {
    enter: (nodeId: string) => boolean
    move: (direction: 'up' | 'down' | 'first' | 'last') => void
    swap: () => void
    exit: () => void
    command: (command: NodeVisualCommand) => void
  }
  beginStructuralOpen: (position: 'before' | 'after') => void
  beginStructuralChildOpen: () => void
  repeatStructural: (change: VimStructuralChange) => void
  fold: (command: VimFoldCommand, nodeId: string) => void
}

export type VimViewportMotion = 'top' | 'middle' | 'bottom' | 'half-up' | 'half-down'

export type VimRegister =
  | { kind: 'empty' }
  | { kind: 'text'; value: string }
  | { kind: 'node'; value: TreeNode; sourceIds?: readonly string[] }
  | { kind: 'nodes'; value: NodeForest }
