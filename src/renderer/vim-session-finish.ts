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
  beginReplaceClick,
  continueReplaceClickAfterBlur,
  insertRepeatChange,
  resolveReplaceCommit,
  takeInsertSession,
  takeReplaceSession,
  takeReplaceClick,
  type VimEditSessionState,
} from './vim-edit-session'
import type { VimMode } from './vim-editing'
import type { NodeVisualSelection } from './node-input-types'
import type { VimKeyboardState } from './vim-keyboard-types'

type Authority = { nodeId?: string; caret: VimCaretState }
type ApplyCaretState = (
  nodeId: string,
  caret: VimCaretState,
  fromFocus?: boolean,
  timing?: 'immediate' | 'after-edit' | 'preserve-selection',
) => void
type FinishReplace = (input?: HTMLElement, retreatCursor?: boolean, preserveDomSelection?: boolean) => boolean

/** Live session handles shared by keyboard, pointer, search and view commands. */
export interface VimTextCommandState {
  mode: VimKeyboardState['mode']
  commandState: VimKeyboardState['commandState']
  finishReplace?: VimKeyboardState['finishReplace']
  finishInsert?: VimKeyboardState['finishInsert']
  getCaretState?: VimKeyboardState['getCaretState']
  applyCaretState?: VimKeyboardState['applyCaretState']
  revealVerticalCaret?: VimKeyboardState['revealVerticalCaret']
  register?: VimKeyboardState['register']
  nodeVisual?: Pick<VimKeyboardState['nodeVisual'], 'exit'>
  setMode: VimKeyboardState['setMode']
}

type VimCommandInterruption =
  | 'text-edit'
  | 'navigation'
  | 'view-change'
  | 'search-open'
  | 'search-jump'
  | 'history'
  | 'selection-command'
  | 'command'

function leaveCommandAssembly(vim: VimTextCommandState): void {
  clearCommandAssembly(vim.commandState)
  if (vim.mode !== 'visual-node') return
  vim.nodeVisual?.exit()
  vim.setMode('normal')
}

/**
 * Resolve the session before an application command. Callers name the interruption rather than
 * choosing commit flags, clearing owners and changing modes themselves. These policies deliberately
 * differ: search borrows the current mode, text edits preserve selection, and history retreats the
 * Replace caret. None captures an Insert change for dot-repeat (PRODUCT §20.2.5/6/19).
 */
export function prepareVimCommand(
  vim: VimTextCommandState | undefined,
  reason: VimCommandInterruption,
  input?: HTMLElement,
): void {
  if (vim === undefined) return
  const mode = vim.mode

  switch (reason) {
    case 'text-edit':
      if (mode === 'insert') {
        if (input !== undefined) vim.finishInsert?.(input)
        return
      }
      if (mode === 'visual-node') return
      if (mode === 'replace') {
        vim.finishReplace?.(input, false, true)
        vim.setMode('normal')
      }
      clearCommandAssembly(vim.commandState)
      return
    case 'navigation':
      if (input !== undefined) vim.finishInsert?.(input)
      leaveCommandAssembly(vim)
      if (vim.mode === 'replace') {
        vim.finishReplace?.(input, false)
        vim.setMode('normal')
      }
      return
    case 'view-change':
      if (input !== undefined) {
        vim.finishInsert?.(input)
        if (mode === 'replace') vim.finishReplace?.(input, false)
      }
      clearCommandAssembly(vim.commandState)
      if (mode === 'replace' || mode === 'visual-node') {
        vim.nodeVisual?.exit()
        vim.setMode('normal')
      }
      return
    case 'search-open':
      if (mode === 'replace') vim.finishReplace?.(input, false, true)
      clearCommandAssembly(vim.commandState)
      return
    case 'search-jump':
      if (input !== undefined) {
        vim.finishInsert?.(input)
        vim.finishReplace?.(input, false, true)
      }
      return
    case 'history':
      if (mode === 'replace') {
        vim.finishReplace?.(input, true)
        vim.setMode('normal')
      } else if (mode === 'insert' && input !== undefined) vim.finishInsert?.(input)
      leaveCommandAssembly(vim)
      return
    case 'selection-command':
      if (mode === 'replace') {
        vim.finishReplace?.(input, false, true)
        vim.setMode('normal')
      }
      leaveCommandAssembly(vim)
      return
    case 'command':
      leaveCommandAssembly(vim)
  }
}

interface PointerSession {
  session: VimEditSessionState
  commandState: VimCommandState
  getMode(): VimMode
  changeVimMode(mode: VimMode): void
  finishVimInsert(input: HTMLElement): void
  finishVimReplace: FinishReplace
}

/** DOM adapters supply focus facts; this module owns their effect on the editing session. */
export function finishVimBlur(
  deps: PointerSession,
  nodeId: string,
  input: HTMLElement | undefined,
  focus: { verticalArrival: boolean; windowFocused: boolean },
): void {
  const { commandState, session } = deps
  const goal = commandState.verticalGoal
  clearCommandAssembly(commandState)
  if (focus.verticalArrival) commandState.verticalGoal = goal

  // Creating a structural Insert session blurs its origin before the new input receives focus.
  if (input !== undefined && commandState.structuralInsert?.originNodeId !== nodeId) deps.finishVimInsert(input)
  deps.finishVimReplace()
  if (deps.getMode() === 'replace' && !continueReplaceClickAfterBlur(session, focus.windowFocused))
    deps.changeVimMode('normal')
}

/** Resolve a text press before native selection changes, without committing another node into this input. */
export function prepareVimPointerPress(
  deps: PointerSession,
  nodeId: string,
  input: HTMLElement,
  press: { button: number; detail: number; contextMenu: boolean },
): void {
  deps.finishVimInsert(input)
  const replacement = deps.session.replace
  if (replacement === undefined || replacement.nodeId === nodeId)
    deps.finishVimReplace(input, false, press.button === 2 || press.detail >= 2)

  takeReplaceClick(deps.session)
  if (deps.getMode() === 'replace' && press.button === 0 && !press.contextMenu) beginReplaceClick(deps.session)
  clearCommandAssembly(deps.commandState)
}

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
  commandState: VimCommandState
  finishVimReplace: FinishReplace
  getMode: () => VimMode
  changeVimMode: (mode: VimMode) => void
}): boolean {
  const { session, commandState, finishVimReplace, getMode, changeVimMode } = deps
  // A shutdown flush interrupts a pending plain Insert session: consume it without recording, so a
  // later Escape cannot capture the session the flush already ended (PRODUCT §20.2.19). The
  // structural session is interrupted by the same flush and must not be captured later either.
  takeInsertSession(session)
  takeStructuralInsert(commandState)
  const committed = finishVimReplace()
  if (getMode() === 'replace') changeVimMode('normal')
  return committed
}

/**
 * Finish the pending Insert session. Structural and plain sessions are recorded for `.` only
 * when Escape completes them. Every other finish (blur,
 * pointer, navigation, shortcut, toggle, flush) consumes it and keeps the previous repeatable
 * change (PRODUCT §20.2.19). The registered-input check is the fail-closed backstop against a
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
  if (completed) finishStructuralInsert(input)
  else takeStructuralInsert(commandState)
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
