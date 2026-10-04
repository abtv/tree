import type { EditorStore } from '../application/editor-store'
import { requireNode } from '../domain/document'
import { getCaret, hasMultiCharacterSelection, readEditableContent, setEditableText } from './editor-dom'
import { editCaretTransition, type VimCaretState } from './vim-caret-transition'
import {
  clearCommandAssembly,
  recordRepeatChange,
  structuralRepeatChange,
  takeStructuralInsert,
  type VimCommandState,
} from './vim-command-state'
import {
  insertRepeatChange,
  resolveReplaceCommit,
  takeInsertSession,
  takeReplaceSession,
  type VimEditSessionState,
} from './vim-edit-session'
import type { VimMode } from './vim-editing'
import type { NodeVisualSelection } from './node-input-types'

type Authority = { nodeId?: string; caret: VimCaretState }
type ApplyCaretState = (
  nodeId: string,
  caret: VimCaretState,
  fromFocus?: boolean,
  timing?: 'immediate' | 'after-edit' | 'preserve-selection',
) => void
type FinishReplace = (input?: HTMLElement, retreatCursor?: boolean, preserveDomSelection?: boolean) => boolean

export function finishStructuralInsertSession(deps: { commandState: VimCommandState }, input: HTMLElement): void {
  const { commandState } = deps
  const session = takeStructuralInsert(commandState)
  if (session === undefined) return
  const text = input instanceof HTMLTextAreaElement ? input.value : readEditableContent(input).text
  recordRepeatChange(commandState, structuralRepeatChange(session, text))
}

export function finishReplaceSession(
  deps: {
    store: EditorStore
    session: VimEditSessionState
    commandState: VimCommandState
    readAuthority: () => Authority
    applyCaretState: ApplyCaretState
  },
  input?: HTMLElement,
  retreatCursor = false,
  preserveDomSelection = false,
): boolean {
  const { store, session: sessionState, commandState, readAuthority, applyCaretState } = deps
  const session = takeReplaceSession(sessionState)
  if (session === undefined) return false
  const commit = resolveReplaceCommit(session)
  if (commit === undefined) return false
  const { finalText, replacedStart, replacedEnd, rawCursor } = commit
  store.replaceTextRange(session.nodeId, replacedStart, replacedEnd, session.typed)
  recordRepeatChange(commandState, {
    kind: 'overwrite',
    text: session.typed,
    replaced: replacedEnd - replacedStart,
  })
  const state = store.getSnapshot()
  const hasAttachment =
    state.status === 'ready' && requireNode(state.document, session.nodeId).node.attachment !== undefined
  const prior =
    readAuthority().nodeId === session.nodeId ? readAuthority().caret : { cursor: rawCursor, imageActive: false }
  const committedCursor = retreatCursor ? Math.max(0, rawCursor - 1) : rawCursor
  const next = editCaretTransition(prior, committedCursor, finalText.length, hasAttachment)
  // A command-driven commit must not rewrite the DOM: the visible text already equals the
  // committed text, and the user's selection is what the command is about to act on.
  if (input !== undefined && !preserveDomSelection) {
    setEditableText(input, finalText)
  }
  applyCaretState(
    session.nodeId,
    next,
    false,
    preserveDomSelection ? 'preserve-selection' : input === undefined ? 'after-edit' : 'immediate',
  )
  return true
}

// The store invokes this before it captures a quit save and again after that save completes, so
// a pending Replace buffer is committed into the document and persisted by the quit flush rather
// than dying with the renderer. The commit path is the same one blur uses: no DOM rewrite (the
// visible text already equals the committed text), no Escape-style caret retreat, and a return to
// Normal mode so a failed quit leaves the editor in a consistent state. The session is consumed
// before the commit, so repeated invocations are no-ops; the returned flag tells the flush to run
// another pass when this call committed an edit.
export function finishPendingEditSessions(deps: {
  session: VimEditSessionState
  finishVimReplace: FinishReplace
  getMode: () => VimMode
  changeVimMode: (mode: VimMode) => void
}): boolean {
  const { session, finishVimReplace, getMode, changeVimMode } = deps
  // A shutdown flush interrupts a pending plain Insert session: consume it without recording, so a
  // later Escape cannot capture the session the flush already ended (PRODUCT §20.2.1 T8). The
  // structural session needs its input's text to capture, so it stays pending for a later finish.
  takeInsertSession(session)
  const committed = finishVimReplace()
  if (getMode() === 'replace') changeVimMode('normal')
  return committed
}

/**
 * Finish the pending Insert session. The structural session always captures; the plain session
 * is recorded for `.` only when Escape completed it on its own node. Every other finish (blur,
 * pointer, navigation, shortcut, toggle, flush) consumes it and keeps the previous repeatable
 * change (PRODUCT §20.2.1 T8). The registered-input check is the fail-closed backstop against a
 * session that crossed to another node without a blur consuming it first.
 */
export function finishInsertSession(
  deps: {
    finishStructuralInsert: (input: HTMLElement) => void
    session: VimEditSessionState
    commandState: VimCommandState
    getInput: (id: string) => HTMLElement | undefined
  },
  input: HTMLElement,
  completed = false,
): void {
  const { finishStructuralInsert, session: sessionState, commandState, getInput } = deps
  finishStructuralInsert(input)
  const session = takeInsertSession(sessionState)
  if (session === undefined) return
  if (!completed) return
  if (getInput(session.nodeId) !== input) return
  const finalText = input instanceof HTMLTextAreaElement ? input.value : readEditableContent(input).text
  const change = insertRepeatChange(session, finalText)
  if (change !== undefined) recordRepeatChange(commandState, change)
}

export function switchVimEditing(
  deps: {
    store: EditorStore
    getInput: (id: string) => HTMLElement | undefined
    readAuthority: () => Authority
    changeVimMode: (mode: VimMode) => void
    applyCaretState: ApplyCaretState
    finishVimInsert: (input: HTMLElement) => void
    finishVimReplace: FinishReplace
    commandState: VimCommandState
    setNodeVisualSelection: (selection: NodeVisualSelection | undefined) => void
  },
  enabled: boolean,
): void {
  const {
    store,
    getInput,
    readAuthority,
    changeVimMode,
    applyCaretState,
    finishVimInsert,
    finishVimReplace,
    commandState,
    setNodeVisualSelection,
  } = deps
  const state = store.getSnapshot()
  if (state.status !== 'ready') {
    changeVimMode(enabled ? 'normal' : 'insert')
    return
  }
  const node = requireNode(state.document, state.location.selectedNodeId).node
  const candidate = getInput(node.id)
  const input = candidate !== undefined && candidate.ownerDocument.activeElement === candidate ? candidate : undefined
  const hasAttachment = node.attachment !== undefined
  if (enabled) {
    changeVimMode('normal')
    const cursor = input === undefined ? (state.focus?.cursor ?? 0) : getCaret(input)
    // A deliberate multi-character selection survives the switch, as it survives other changes
    // into Normal mode; otherwise the block caret is drawn at the caret.
    applyCaretState(
      node.id,
      editCaretTransition({ cursor, imageActive: false }, cursor, node.text.length, hasAttachment),
      false,
      input === undefined || hasMultiCharacterSelection(input) ? 'preserve-selection' : 'immediate',
    )
    return
  }
  // Disabling resolves every Vim session the way a focus change would, except that the editor
  // keeps focus: Insert bookkeeping finishes, a pending replacement commits as one edit without
  // rewriting the visible text, and Visual ranges and an unfinished command clear.
  if (input !== undefined) finishVimInsert(input)
  finishVimReplace(input, false, true)
  clearCommandAssembly(commandState)
  setNodeVisualSelection(undefined)
  const caret = readAuthority().nodeId === node.id ? readAuthority().caret : undefined
  const cursor =
    caret?.imageActive === true ? node.text.length : input === undefined ? (state.focus?.cursor ?? 0) : getCaret(input)
  applyCaretState(node.id, { cursor, imageActive: false }, false, 'preserve-selection')
  changeVimMode('insert')
}
