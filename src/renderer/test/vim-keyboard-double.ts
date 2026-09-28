import { vi } from 'vitest'
import {
  beginStructuralChildOpen,
  beginStructuralOpen,
  createVimCommandState,
  type VimCommandState,
} from '../vim-command-state'
import type { VimCaretState } from '../vim-caret-transition'
import type { VimKeyboardState, VimRegister } from '../vim-keyboard-types'
import type { VimMode } from '../vim-editing'

/**
 * The single test double for `VimKeyboardState`.
 *
 * Every member of that interface is supplied, because the production wiring in
 * `use-node-input-bindings.ts` supplies every member unconditionally. A double that omits one makes
 * the suite exercise a path the application never takes, which is the defect class
 * [ADR 0014](../../../docs/decisions/0014-single-owner-for-renderer-interaction-state.md) exists to
 * remove — so this helper is the one place the wiring is expressed, not a per-file literal.
 *
 * The caret authority and the command-state owner are real: `getCaretState`, `applyCaretState`,
 * `setImageCaret`, and `imageTextCursor` close over one shared `VimCaretState`, copying the formulas
 * in `use-node-input-bindings.ts`, and the command slots come from a real `vim-command-state.ts`
 * owner. They are still wrapped in `vi.fn` so call assertions keep working. The session and
 * navigation members are bare spies, because their behavior belongs to `vim-edit-session.ts` and
 * `EditorStore`, which own their own tests.
 */
export interface VimKeyboardDouble {
  vim: VimKeyboardState
  /** The caret the authority currently holds, for asserting state instead of calls. */
  caret: () => VimCaretState
  /** The node the caret authority is currently attached to, or `undefined` before the first write. */
  caretNodeId: () => string | undefined
  /** The live command-state owner, for seeding or inspecting pending, repeat, and Visual slots. */
  commandState: VimCommandState
}

export function createVimKeyboardDouble(
  nodeId: string,
  options: { mode?: VimMode; register?: VimRegister; onPreviewAttachment?: (attachmentId: string) => void } = {},
): VimKeyboardDouble {
  const authority: { nodeId?: string; caret: VimCaretState } = { caret: { cursor: 0, imageActive: false } }
  const commandState = createVimCommandState()

  // Typed from the interface so callers may pass `fromFocus`; the double has no store focus token
  // to consume, so that flag does not affect the caret the authority holds. Tests that care about
  // it assert on the recorded call.
  const applyCaretState: VimKeyboardState['applyCaretState'] = vi.fn((target, caret): void => {
    authority.nodeId = target
    authority.caret = caret
  })
  const getCaretState = vi.fn((target: string, cursor: number, imageActive: boolean): VimCaretState =>
    authority.nodeId === target
      ? { ...authority.caret, cursor }
      : { cursor, imageActive, imageTextReturnCursor: undefined },
  )
  const setImageCaret = vi.fn((target: string, active: boolean, fromFocus?: boolean): void => {
    applyCaretState(
      target,
      {
        cursor: authority.caret.cursor,
        imageActive: active,
        imageTextReturnCursor: active ? authority.caret.imageTextReturnCursor : undefined,
      },
      fromFocus,
    )
  })

  const vim: VimKeyboardState = {
    mode: options.mode ?? 'normal',
    register: { current: options.register ?? { kind: 'empty' } },
    commandState,
    imageTextCursor: {
      get current(): number | undefined {
        return authority.caret.imageTextReturnCursor
      },
      set current(value: number | undefined) {
        authority.caret = { ...authority.caret, imageTextReturnCursor: value }
      },
    },
    getCaretState,
    applyCaretState,
    setImageCaret,
    beginInsert: vi.fn(),
    finishInsert: vi.fn(),
    beginReplace: vi.fn(),
    handleReplaceKey: vi.fn(() => false),
    finishReplace: vi.fn(() => false),
    moveBoundary: vi.fn(),
    moveViewport: vi.fn(),
    syncImageCaretToFocus: vi.fn(),
    setMode: vi.fn((next: VimMode) => {
      vim.mode = next
    }),
    openAttachment: options.onPreviewAttachment ?? vi.fn(),
    scheduleCaret: vi.fn(),
    // Whole-node Visual entry is refused by default, matching a displayed node whose level cannot
    // enter Visual; tests that exercise the mode replace `vim.nodeVisual` with their own object.
    nodeVisual: { enter: vi.fn(() => false), move: vi.fn(), swap: vi.fn(), exit: vi.fn(), command: vi.fn() },
    beginStructuralOpen: vi.fn((position: 'before' | 'after') => {
      beginStructuralOpen(commandState, nodeId, position)
    }),
    beginStructuralChildOpen: vi.fn(() => {
      beginStructuralChildOpen(commandState, nodeId)
    }),
    repeatStructural: vi.fn(),
    fold: vi.fn(),
  }

  return {
    vim,
    caret: () => authority.caret,
    caretNodeId: () => authority.nodeId,
    commandState,
  }
}
