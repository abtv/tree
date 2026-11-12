import type { NodeForest, NodeVisualCommand } from '../application/editor-store'
import { cloneNode, type TreeNode } from '../domain/document'
import type { VimRegister, VimTextChange } from './vim-keyboard-types'

export interface VimTextDiff {
  insertedText: string
  insertOffset: number
  deleteCount: number
}

/** The minimal insert/delete diff between an Insert session's baseline and its final text. */
export function diffTypedText(baseline: string, finalText: string, position: number): VimTextDiff {
  let prefix = 0
  // Mutation triage: an index past either string reads `undefined` against a defined character, so the
  // element comparison already stops the loop and every bound here is redundant.
  while (prefix < baseline.length && prefix < finalText.length && baseline[prefix] === finalText[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < baseline.length - prefix &&
    suffix < finalText.length - prefix &&
    baseline[baseline.length - 1 - suffix] === finalText[finalText.length - 1 - suffix]
  )
    suffix += 1
  return {
    insertedText: finalText.slice(prefix, finalText.length - suffix),
    insertOffset: prefix - position,
    deleteCount: baseline.length - prefix - suffix,
  }
}

export interface VimReplaceCommit {
  finalText: string
  replacedStart: number
  replacedEnd: number
  rawCursor: number
}

/** The text a pending Replace session commits, or undefined when nothing was typed. */
export function resolveReplaceCommit(session: {
  baseline: string
  position: number
  typed: string
  selectionEnd?: number
}): VimReplaceCommit | undefined {
  if (session.typed === '') return undefined
  const replaced = replaceLength(session)
  const finalText =
    session.baseline.slice(0, session.position) + session.typed + session.baseline.slice(session.position + replaced)
  return {
    finalText,
    replacedStart: session.position,
    replacedEnd: session.position + replaced,
    rawCursor: session.position + session.typed.length,
  }
}

export interface VimInsertSession {
  nodeId: string
  baseline: string
  position: number
  change: VimTextChange
}

export interface VimReplaceSession {
  nodeId: string
  baseline: string
  position: number
  typed: string
  /** A pointer-selected word is replaced by the first character, before overwrite continues. */
  selectionEnd?: number
}

function replaceLength(session: Pick<VimReplaceSession, 'baseline' | 'position' | 'typed' | 'selectionEnd'>): number {
  if (session.typed === '') return 0
  const selected = (session.selectionEnd ?? session.position) - session.position
  return Math.min(session.typed.length + Math.max(0, selected - 1), session.baseline.length - session.position)
}

/**
 * The single owner of the renderer-local Vim register and the one pending Insert or Replace
 * session. The `begin*`/`take*` transitions are the only writers of the pending sessions, and the
 * register is only ever assigned a value produced by `visualCommandRegister` or `nodeRegister`;
 * every other export here is a pure function. This module must stay free of React, DOM, Electron,
 * filesystem, and store dependencies so its behavior is unit-testable without a browser.
 */
export interface VimEditSessionState {
  register: VimRegister
  insert?: VimInsertSession | undefined
  replace?: VimReplaceSession | undefined
  replaceGesture: VimReplaceGesture
}

export type VimReplaceGesture =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'pressed' | 'settling'
      readonly identity: object
      readonly moved: boolean
      readonly agendaKey?: string
    }

export function createVimEditSessionState(): VimEditSessionState {
  return { register: { kind: 'empty' }, replaceGesture: { kind: 'idle' } }
}

export function beginReplaceClick(state: VimEditSessionState, agendaKey?: string): void {
  state.replaceGesture = {
    kind: 'pressed',
    identity: {},
    moved: false,
    ...(agendaKey === undefined ? {} : { agendaKey }),
  }
}

export function replaceClickAgendaKey(state: VimEditSessionState): string | undefined {
  return state.replaceGesture.kind === 'idle' ? undefined : state.replaceGesture.agendaKey
}

export function replaceClickMoved(state: VimEditSessionState): boolean {
  return state.replaceGesture.kind !== 'idle' && state.replaceGesture.moved
}

/** Release waits for the native mouseup/click before consuming this particular press. */
export function settleReplaceClick(state: VimEditSessionState): object | undefined {
  if (state.replaceGesture.kind !== 'pressed') return undefined
  state.replaceGesture = { ...state.replaceGesture, kind: 'settling' }
  return state.replaceGesture.identity
}

/** A press can carry Replace across input blur only while the window still has focus. */
export function continueReplaceClickAfterBlur(state: VimEditSessionState, windowFocused: boolean): boolean {
  if (state.replaceGesture.kind === 'idle' || !windowFocused) return false
  state.replaceGesture = { ...state.replaceGesture, moved: true }
  return true
}

/** End the press intent, reporting whether one was pending. */
export function takeReplaceClick(state: VimEditSessionState, identity?: object): boolean {
  if (state.replaceGesture.kind === 'idle' || (identity !== undefined && identity !== state.replaceGesture.identity))
    return false
  state.replaceGesture = { kind: 'idle' }
  return true
}

export function beginInsertSession(state: VimEditSessionState, session: VimInsertSession): void {
  state.insert = session
}

/** Consume the pending Insert session, clearing it before the caller can observe it. */
export function takeInsertSession(state: VimEditSessionState): VimInsertSession | undefined {
  const session = state.insert
  state.insert = undefined
  return session
}

export function beginReplaceSession(state: VimEditSessionState, session: Omit<VimReplaceSession, 'typed'>): void {
  state.replace = { ...session, typed: '' }
}

/** Consume the pending Replace session, clearing it before the caller can observe it. */
export function takeReplaceSession(state: VimEditSessionState): VimReplaceSession | undefined {
  const session = state.replace
  state.replace = undefined
  return session
}

/**
 * Apply one Replace-mode key to its pending session and return the DOM working text and caret.
 * Backspace and single-character keys are consumed; any other key leaves `typed` unchanged and
 * returns undefined so the caller can fall through to ordinary handling.
 */
export function applyReplaceKey(
  session: VimReplaceSession | undefined,
  key: string,
): { workingText: string; cursor: number } | undefined {
  if (session === undefined) return undefined
  if (key === 'Backspace') session.typed = session.typed.slice(0, -1)
  else if (key.length === 1) session.typed += key
  else return undefined
  // Mutation triage: a larger bound only matters once it exceeds the remaining baseline, where
  // `slice` past the end is already empty, so the working text is unchanged.
  const replaced = replaceLength(session)
  return {
    workingText:
      session.baseline.slice(0, session.position) + session.typed + session.baseline.slice(session.position + replaced),
    cursor: session.position + session.typed.length,
  }
}

/**
 * The repeat-change payload a completed Insert session captures, or undefined when a plain
 * `i`/`a`/`I`/`A` session is unchanged or the session's kind is not text-capturing. The payload is
 * node-agnostic so `.` can replay the same typed diff at the current caret in another node; whether
 * a session is recorded at all is decided at the finish site (PRODUCT §20.2.19).
 */
export function insertRepeatChange(session: VimInsertSession, finalText: string): VimTextChange | undefined {
  const { baseline, position, change } = session
  if (change.kind === 'insert' && finalText === baseline) return undefined
  if (change.kind !== 'insert' && change.kind !== 'change' && change.kind !== 'substitute') return undefined
  return { ...change, ...diffTypedText(baseline, finalText, position) }
}

/** The register payload a Visual or structural command reads as its put source. */
export function registerSource(register: VimRegister): NodeForest | undefined {
  if (register.kind === 'nodes') return register.value
  if (register.kind === 'node') return { nodes: [register.value], sourceIds: register.sourceIds ?? [] }
  return undefined
}

/**
 * The register update for a whole-node Visual command that produced a result. `p` exchanges: the
 * removed selection becomes the register; `P` keeps the incoming register (`docs/PRODUCT.md` §20.2.23).
 */
export function visualCommandRegister(command: NodeVisualCommand, result: NodeForest): VimRegister | undefined {
  return 'ydxcsp'.includes(command) ? { kind: 'nodes', value: result } : undefined
}

/** A structural delete records the removed subtree as a single-node register entry. */
export function nodeRegister(node: TreeNode): VimRegister {
  return { kind: 'node', value: cloneNode(node), sourceIds: [node.id] }
}
