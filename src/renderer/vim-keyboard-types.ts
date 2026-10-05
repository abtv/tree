import type { NodeForest, NodeVisualCommand } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import type { NodeFoldCommand } from '../application/expansion-state'
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
    }
  | { kind: 'replace'; count: number; character: string }
  | {
      kind: 'substitute'
      count: number
      insertedText?: string
      insertOffset?: number
      deleteCount?: number
    }
  | {
      kind: 'insert'
      entry: 'i' | 'a' | 'I' | 'A'
      insertedText?: string
      insertOffset?: number
      deleteCount?: number
    }
  | {
      kind: 'paste'
      after: boolean
      text: string
      /** Set for `gp` and `gP`: the caret goes to the character after the inserted text. */
      past?: boolean
    }
  | { kind: 'overwrite'; text: string; replaced: number }
  | {
      kind: 'case'
      mode: 'toggle' | 'lower' | 'upper'
      count: number
      /** Set for `gu`, `gU`, and `g~`: the in-node motion or text object that selects the range. */
      motion?: string
    }

export type VimSurroundChange =
  | { kind: 'surround-add'; motion: string; count: number; delimiter: string }
  | { kind: 'surround-delete'; target: string; count: number }
  | { kind: 'surround-change'; target: string; delimiter: string; count: number }

export type VimStructuralChange =
  | { kind: 'structural-delete'; span: number }
  | {
      kind: 'structural-put'
      position: 'before' | 'after'
      source: TreeNode
      sourceIds: readonly string[]
      /** Set for `gp` and `gP`: the node after the inserted copy is selected. */
      past?: boolean
      repeat?: number
    }
  | { kind: 'structural-forest-put'; position: 'before' | 'after'; source: NodeForest; past?: boolean; repeat?: number }
  | { kind: 'structural-shift'; direction: 'in' | 'out'; span: number; count: number }
  | { kind: 'structural-join'; span: number; spaced: boolean }
  | { kind: 'structural-open'; position: 'before' | 'after'; text: string }
  | { kind: 'structural-child-open'; text: string }
  | {
      kind: 'structural-visual'
      command: Exclude<NodeVisualCommand, 'y'>
      span: number
      source?: NodeForest
      text?: string
      /** Copies of `source` a counted Visual put inserted; absent means one. */
      repeat?: number
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
  /** `u`, `U`, and `~` are the case operators `gu`, `gU`, and `g~`; `s` is the `ys` surround. */
  operator?: 'd' | 'y' | 'c' | 's' | 'u' | 'U' | '~'
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
  /**
   * Finish the pending Insert session. Only Escape completes it (`completed = true`) and records its
   * diff for `.`; every other caller passes no flag, consumes the plain session, and keeps the
   * previous repeatable change (PRODUCT §20.2.1 T8). Structural sessions always capture.
   */
  finishInsert: (input: HTMLElement, completed?: boolean) => void
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
  /** Publish the complete Normal intent and project it through the hook's registered input. */
  applyCaretState: (
    nodeId: string,
    state: VimCaretState,
    fromFocus?: boolean,
    timing?: 'immediate' | 'after-edit' | 'preserve-selection',
  ) => void
  moveBoundary: (boundary: 'first' | 'last' | 'parent', cursor: number, count?: number) => void
  moveViewport: (nodeId: string, motion: VimViewportMotion, cursor: number, count?: number) => void
  syncImageCaretToFocus: () => void
  setMode: (mode: VimMode) => void
  openAttachment: (attachmentId: string) => void
  setImageCaret: (nodeId: string, active: boolean, fromFocus?: boolean) => void
  scheduleCaret: (input: HTMLElement, cursor: number) => void
  nodeVisual: {
    enter: (nodeId: string) => boolean
    move: (direction: 'up' | 'down' | 'first' | 'last', count?: number) => void
    swap: () => void
    exit: () => void
    command: (command: NodeVisualCommand, count?: number) => void
    /** `>` (`in`) or `<` (`out`) over the selected sibling range, `count` levels. */
    shift: (direction: 'in' | 'out', count: number, confineOutdentToCurrentParent?: boolean) => void
    /** `J` (`spaced`) or `gJ` over the selected sibling range; leaves whole-node Visual mode on success. */
    join: (spaced: boolean) => void
    /** The selected whole-node range, for application commands such as `Cmd+Enter` that act on all of it. */
    selection: () => { anchorId: string; focusId: string } | undefined
  }
  /**
   * Normal `gv` (`docs/PRODUCT.md` §20.2.1 T7): re-enter the remembered Visual selection when it is
   * still valid and displayed; otherwise do nothing.
   */
  restoreVisual: () => void
  /**
   * Character Visual `>` or `<`: moves the current node and keeps the character selection
   * `[start, end)` selected once the moved row has rendered.
   */
  shiftCurrentNode: (
    nodeId: string,
    direction: 'in' | 'out',
    count: number,
    selection: { start: number; end: number },
    cursor?: number,
    confineOutdentToCurrentParent?: boolean,
  ) => void
  /**
   * `dj`, `dk`, `yj`, `yk`, `cj`, and `ck` (`docs/PRODUCT.md` §20.2.1 T4): the node and the `count`
   * sibling subtrees beyond it in `direction`, clamped at the first and last sibling.
   */
  verticalOperator: (nodeId: string, operator: 'd' | 'y' | 'c', direction: 'down' | 'up', count: number) => void
  beginStructuralOpen: (position: 'before' | 'after') => void
  beginStructuralChildOpen: () => void
  /** Returns false at the first failed iteration, so counted dot cannot skip a failure. */
  repeatStructural: (change: VimStructuralChange, cursor: number) => boolean
  fold: (command: VimFoldCommand, nodeId: string) => void
}

export type VimViewportMotion = 'top' | 'middle' | 'bottom' | 'half-up' | 'half-down'

export type VimRegister =
  | { kind: 'empty' }
  | { kind: 'text'; value: string }
  | { kind: 'node'; value: TreeNode; sourceIds?: readonly string[] }
  | { kind: 'nodes'; value: NodeForest }
