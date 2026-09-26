import type { NodeForest, NodeVisualCommand } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import type { VimMode } from './vim-editing'

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
  | { kind: 'substitute'; count: number; insertedText?: string; insertOffset?: number; deleteCount?: number }
  | {
      kind: 'insert'
      entry: 'i' | 'a' | 'I' | 'A'
      insertedText?: string
      insertOffset?: number
      deleteCount?: number
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
  prefix?: 'g' | 'i' | 'a'
  surround?: VimSurroundStage
}

export interface VimKeyboardState {
  mode: VimMode
  register: { current: VimRegister }
  pending: { current: VimPendingCommand | undefined }
  lastChange?: { current: VimRepeatChange | undefined }
  lastFind: { current: VimFindCommand | undefined }
  beginInsert?: (nodeId: string, baseline: string, position: number, change: VimTextChange) => void
  finishInsert?: (input: HTMLElement) => void
  beginReplace?: (nodeId: string, input: HTMLElement, baseline: string, position: number) => void
  handleReplaceKey?: (input: HTMLElement, key: string) => boolean
  finishReplace?: (input: HTMLElement) => boolean
  visualAnchor: { current: number | undefined }
  visualFocus: { current: number | undefined }
  imageTextCursor?: { current: number | undefined }
  moveBoundary: (boundary: 'first' | 'last' | 'parent', cursor: number, count?: number) => void
  moveViewport: (nodeId: string, motion: VimViewportMotion, cursor: number) => void
  syncImageCaretToFocus: () => void
  setMode: (mode: VimMode) => void
  openAttachment?: (attachmentId: string) => void
  setImageCaret?: (nodeId: string, active: boolean, fromFocus?: boolean) => void
  scheduleCaret: (input: HTMLElement, cursor: number) => void
  nodeVisual?: {
    enter: (nodeId: string) => boolean
    move: (direction: 'up' | 'down' | 'first' | 'last') => void
    swap: () => void
    exit: () => void
    command: (command: NodeVisualCommand) => void
  }
  beginStructuralOpen?: (position: 'before' | 'after') => void
  beginStructuralChildOpen?: () => void
  repeatStructural?: (change: VimStructuralChange) => void
}

export type VimViewportMotion = 'top' | 'middle' | 'bottom' | 'half-up' | 'half-down'

export type VimRegister =
  | { kind: 'empty' }
  | { kind: 'text'; value: string }
  | { kind: 'node'; value: TreeNode; sourceIds?: readonly string[] }
  | { kind: 'nodes'; value: NodeForest }
