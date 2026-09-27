import type { VimFindCommand, VimPendingCommand, VimRepeatChange, VimStructuralChange } from './vim-keyboard-types'

export type VimStructuralInsertSession =
  | { kind: 'open'; originNodeId: string; position: 'before' | 'after' }
  | { kind: 'child-open'; originNodeId: string }
  | { kind: 'visual'; originNodeId: string; command: 'c' | 's'; span: number }

/**
 * The single owner of the renderer-local Vim command state: the pending command being assembled,
 * the last repeatable change and character find, the character-wise Visual endpoints, and the one
 * structural Insert session. `use-node-input-bindings.ts` holds one instance in a ref and performs
 * its own writes through the transitions below; `createVimCommandHandles` exposes owner-backed
 * access-time accessors so `vim-keyboard-handler.ts`'s direct reads and writes land in the same
 * object. This module must stay free of React, DOM, Electron, filesystem, and store dependencies
 * so its behavior is unit-testable without a browser.
 */
export interface VimCommandState {
  pending?: VimPendingCommand | undefined
  lastChange?: VimRepeatChange | undefined
  lastFind?: VimFindCommand | undefined
  visualAnchor?: number | undefined
  visualFocus?: number | undefined
  structuralInsert?: VimStructuralInsertSession | undefined
}

export function createVimCommandState(): VimCommandState {
  return {}
}

/** Clear an unfinished command without disturbing dot-repeat, find, Visual, or structural state. */
export function clearPending(state: VimCommandState): void {
  state.pending = undefined
}

/** Record the most recent repeatable change by reference; the last write wins. */
export function recordRepeatChange(state: VimCommandState, change: VimRepeatChange): void {
  state.lastChange = change
}

/** The character-wise Visual endpoints only exist as a pair, so clear both halves together. */
export function clearVisualRange(state: VimCommandState): void {
  state.visualAnchor = undefined
  state.visualFocus = undefined
}

/**
 * Drop the unfinished command together with both character-wise Visual endpoints. Every path that
 * abandons the command assembly for the current node — a Visual mode exit or an application command
 * that moves focus — must clear the pending command and the Visual range as one unit; leaving either
 * behind makes the next motion reinterpret state that belongs to an earlier node. Repeat changes,
 * the last character find, and the structural insert session survive.
 */
export function clearCommandAssembly(state: VimCommandState): void {
  clearPending(state)
  clearVisualRange(state)
}

export function beginStructuralOpen(state: VimCommandState, originNodeId: string, position: 'before' | 'after'): void {
  state.structuralInsert = { kind: 'open', originNodeId, position }
}

export function beginStructuralChildOpen(state: VimCommandState, originNodeId: string): void {
  state.structuralInsert = { kind: 'child-open', originNodeId }
}

export function beginStructuralVisual(
  state: VimCommandState,
  originNodeId: string,
  command: 'c' | 's',
  span: number,
): void {
  state.structuralInsert = { kind: 'visual', originNodeId, command, span }
}

/** Consume the pending structural session, clearing it before the caller can observe it. */
export function takeStructuralInsert(state: VimCommandState): VimStructuralInsertSession | undefined {
  const session = state.structuralInsert
  state.structuralInsert = undefined
  return session
}

/** The repeat-change payload a structural Insert session captures from its typed text. */
export function structuralRepeatChange(session: VimStructuralInsertSession, text: string): VimStructuralChange {
  if (session.kind === 'open') return { kind: 'structural-open', position: session.position, text }
  if (session.kind === 'child-open') return { kind: 'structural-child-open', text }
  return { kind: 'structural-visual', command: session.command, span: session.span, text }
}

/** A stable holder for one owner state; a React ref is structurally compatible. */
export interface VimCommandStateHolder {
  readonly current: VimCommandState
}

export interface VimCommandHandles {
  pending: { current: VimPendingCommand | undefined }
  lastChange: { current: VimRepeatChange | undefined }
  lastFind: { current: VimFindCommand | undefined }
  visualAnchor: { current: number | undefined }
  visualFocus: { current: number | undefined }
}

/**
 * Access-time accessors over one owner state, shaped for the `VimKeyboardState` fields
 * `vim-keyboard-handler.ts` already reads and writes directly. Each read reflects the latest write
 * from either side and each write lands in the owner slot immediately.
 */
export function createVimCommandHandles(holder: VimCommandStateHolder): VimCommandHandles {
  return {
    pending: {
      get current(): VimPendingCommand | undefined {
        return holder.current.pending
      },
      set current(value: VimPendingCommand | undefined) {
        holder.current.pending = value
      },
    },
    lastChange: {
      get current(): VimRepeatChange | undefined {
        return holder.current.lastChange
      },
      set current(value: VimRepeatChange | undefined) {
        holder.current.lastChange = value
      },
    },
    lastFind: {
      get current(): VimFindCommand | undefined {
        return holder.current.lastFind
      },
      set current(value: VimFindCommand | undefined) {
        holder.current.lastFind = value
      },
    },
    visualAnchor: {
      get current(): number | undefined {
        return holder.current.visualAnchor
      },
      set current(value: number | undefined) {
        holder.current.visualAnchor = value
      },
    },
    visualFocus: {
      get current(): number | undefined {
        return holder.current.visualFocus
      },
      set current(value: number | undefined) {
        holder.current.visualFocus = value
      },
    },
  }
}
