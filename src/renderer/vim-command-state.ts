import type { VimFindCommand, VimPendingCommand, VimRepeatChange, VimStructuralChange } from './vim-keyboard-types'

export type VimStructuralInsertSession =
  | { kind: 'open'; originNodeId: string; position: 'before' | 'after' }
  | { kind: 'child-open'; originNodeId: string }
  | { kind: 'visual'; originNodeId: string; command: 'c' | 's'; span: number }

/**
 * The latest Visual selection, remembered for `gv` (`docs/PRODUCT.md` §20.2.1 T7). A character-wise
 * selection is the node and its two character offsets; a whole-node selection is its two endpoint
 * IDs plus the IDs of the sibling range between them in ascending order, so a node inserted,
 * deleted, or replaced inside the range is detected when the memory is resolved.
 */
export type VimVisualMemory =
  | { kind: 'text'; nodeId: string; anchor: number; focus: number; hadText: boolean }
  | { kind: 'nodes'; anchorId: string; focusId: string; ids: readonly string[] }

/**
 * The single owner of the renderer-local Vim command state: the pending command being assembled,
 * the last repeatable change and character find, the character-wise Visual endpoints, the latest
 * Visual selection for `gv`, and the one
 * structural Insert session. `use-node-input-bindings.ts` holds one instance in a ref and exposes
 * it through the keyboard state, so `vim-keyboard-handler.ts` and `editor-input-handlers.ts` read
 * and write the same object and clear pending and Visual state only through the transitions below.
 * This module must stay free of React, DOM, Electron, filesystem, and store dependencies so its
 * behavior is unit-testable without a browser.
 */
export interface VimCommandState {
  pending?: VimPendingCommand | undefined
  lastChange?: VimRepeatChange | undefined
  lastFind?: VimFindCommand | undefined
  visualAnchor?: number | undefined
  visualFocus?: number | undefined
  /** Survives every clear below: only a later Visual selection replaces it. */
  lastVisual?: VimVisualMemory | undefined
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

/** Write the character-wise Visual endpoints and the `gv` memory together, so they cannot disagree. */
export function setVisualRange(
  state: VimCommandState,
  nodeId: string,
  anchor: number,
  focus: number,
  hadText: boolean,
): void {
  state.visualAnchor = anchor
  state.visualFocus = focus
  state.lastVisual = { kind: 'text', nodeId, anchor, focus, hadText }
}

/** Remember a whole-node Visual selection; `ids` is the sibling range in ascending order. */
export function rememberNodeVisual(
  state: VimCommandState,
  anchorId: string,
  focusId: string,
  ids: readonly string[],
): void {
  state.lastVisual = { kind: 'nodes', anchorId, focusId, ids }
}

/** Exchange the ends of a remembered whole-node range, as `o` does; the sibling IDs are unchanged. */
export function swapNodeVisual(state: VimCommandState): void {
  const memory = state.lastVisual
  if (memory?.kind === 'nodes') state.lastVisual = { ...memory, anchorId: memory.focusId, focusId: memory.anchorId }
}

/** Remember a character-wise selection without making it the live Visual range (after a put). */
export function rememberTextVisual(
  state: VimCommandState,
  nodeId: string,
  anchor: number,
  focus: number,
  hadText: boolean,
): void {
  state.lastVisual = { kind: 'text', nodeId, anchor, focus, hadText }
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
