import type { KeyboardEvent } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import type { EditorContextMenuCommand } from '../shared/ipc'
import { editCaretTransition } from './vim-caret-transition'
import { clearCommandAssembly, clearPending } from './vim-command-state'
import { getCaret, getSelectionRange, nodeTextLength, readEditableContent, selectAll } from './editor-dom'
import { handleVimKey } from './vim-keyboard-handler'
import type { VimKeyboardState } from './vim-keyboard-types'
import { agendaAllows } from './agenda-key-policy'
import { createAgendaKeyDownHandler } from './agenda-row-keyboard'

export type {
  VimFindCommand,
  VimKeyboardState,
  VimPendingCommand,
  VimRegister,
  VimRepeatChange,
  VimStructuralChange,
  VimTextChange,
  VimViewportMotion,
} from './vim-keyboard-types'

/**
 * Drops the command state that belongs to the node or level being left — the pending command and
 * both character-wise Visual endpoints — and leaves whole-node Visual for Normal mode, because its
 * range is relative to the displayed level and cannot survive a focus or level change. Character
 * Visual mode keeps its mode; only the stale slots clear, matching the pointer rule that preserves
 * the mode while re-anchoring.
 */
function clearCommandAssemblyBeforeCommand(vim: VimKeyboardState | undefined): void {
  if (vim === undefined) return
  clearCommandAssembly(vim.commandState)
  if (vim.mode !== 'visual-node') return
  vim.nodeVisual.exit()
  vim.setMode('normal')
}

/**
 * A Ctrl-modified Normal-mode command is dispatched here instead of in `handleVimKey`, so it must
 * apply the rule the in-handler commands apply for itself: an unfinished command — a pending count,
 * operator, prefix, or a command awaiting a character or delimiter (`r`, `f`/`F`/`t`/`T`, a surround
 * stage) — is discarded and the command makes no change, as `u`, `i`, `o`, `R`, `S`, and `H`/`M`/`L`
 * already do. A Ctrl-modified key can never be the awaited character, so unlike plain `u` it always
 * discards. Without this a half-typed command followed by `Ctrl+r` redid a change while the same
 * prefix followed by `u` correctly did nothing.
 */
function discardsUnfinishedCommand(vim: VimKeyboardState): boolean {
  if (vim.commandState.pending === undefined) return false
  clearPending(vim.commandState)
  return true
}

/**
 * The renderer-local state a text-editing application command must resolve before it runs. The
 * full `VimKeyboardState` satisfies it structurally; the narrowed shape lets the context-menu
 * command path resolve the same state — its mode and the command-state owner it clears through —
 * without receiving the whole keyboard surface.
 */
export interface VimTextCommandState {
  mode: VimKeyboardState['mode']
  commandState: VimKeyboardState['commandState']
  finishReplace?: VimKeyboardState['finishReplace']
  setMode: VimKeyboardState['setMode']
}

/**
 * Commit a pending Replace edit as one edit without rewriting the DOM, then return to Normal. The
 * visible text already equals the committed text, so callers that keep acting on the selection
 * (cut/paste/select-all) must preserve it. No-op outside Replace mode.
 */
function commitPendingReplace(vim: VimTextCommandState | undefined, input: HTMLElement): void {
  if (vim === undefined || vim.mode !== 'replace') return
  vim.finishReplace?.(input, false, true)
  vim.setMode('normal')
}

/**
 * Resolve renderer-local session state before an application command that edits the focused node's
 * text through the store (`Cmd+V`/`Cmd+X`, context-menu Paste/Cut, and the native paste fallback).
 * A pending Replace edit commits as one edit first and returns to Normal without rewriting the DOM,
 * so a following Cut or Paste acts on what the user still sees selected. Insert sessions and
 * whole-node Visual mode and its range are untouched; otherwise the unfinished command and both
 * character Visual endpoints clear while character Visual mode stays active.
 */
export function finishVimSessionBeforeTextEdit(vim: VimTextCommandState | undefined, input: HTMLElement): void {
  if (vim === undefined) return
  if (vim.mode === 'replace') {
    commitPendingReplace(vim, input)
  } else if (vim.mode === 'insert' || vim.mode === 'visual-node') return
  clearCommandAssembly(vim.commandState)
}

/**
 * Finishes a pending Insert or Replace session before a command that moves focus off the current
 * node (`Cmd+.`, `Cmd+,`, `Cmd+Backspace`, undo, redo). A pending Insert session's text is already
 * live in the store, so consuming it without `completed` records nothing and keeps the previous
 * repeatable change, per PRODUCT §20.2.1 T8; a pending Replace session commits its buffered text and
 * returns to Normal mode, matching the documented undo/redo rule. Character Visual mode's stale
 * command assembly clears while the mode stays active, and whole-node Visual mode ends because its
 * range belongs to the displayed level being left.
 */
function finishVimSessionBeforeNavigation(vim: VimKeyboardState | undefined, input: HTMLElement): void {
  vim?.finishInsert(input)
  clearCommandAssemblyBeforeCommand(vim)
  if (vim?.mode !== 'replace') return
  vim.finishReplace(input, false)
  vim.setMode('normal')
}

export function executeEditorContextMenuCommand(
  command: EditorContextMenuCommand,
  store: EditorStore,
  node: TreeNode,
  input: HTMLElement,
  vim?: VimTextCommandState,
): void {
  const selection = getSelectionRange(input)
  if (command === 'selectAll') {
    selectAll(input)
    return
  }
  if (command === 'copy' && selection.start !== selection.end) {
    void store.copy(node.id, selection.start, selection.end).catch((error: unknown) => store.reportError(error))
  } else if (command === 'cut' && selection.start !== selection.end) {
    finishVimSessionBeforeTextEdit(vim, input)
    void store.cut(node.id, selection.start, selection.end).catch((error: unknown) => store.reportError(error))
  } else if (command === 'paste') {
    finishVimSessionBeforeTextEdit(vim, input)
    void store.paste(node.id, getCaret(input)).catch((error: unknown) => store.reportError(error))
  }
}

export interface EditorKeyboardHandlerDependencies {
  store: EditorStore
  node: TreeNode
  isComposing: () => boolean
  setSelectAllNodeId: (nodeId: string | undefined) => void
  onPreviewAttachment: (attachmentId: string) => void
  /** Shift the focused subtree while preserving the editor's current text selection. */
  shiftFocusedNode: (direction: 'in' | 'out', selection: { start: number; end: number }, cursor: number) => void
  /** Absent while Vim editing is disabled: every key then takes the standard editing path. */
  vim?: VimKeyboardState | undefined
}

export function createEditorKeyDownHandler({
  store,
  node,
  isComposing,
  setSelectAllNodeId,
  onPreviewAttachment,
  shiftFocusedNode,
  vim,
}: EditorKeyboardHandlerDependencies): (event: KeyboardEvent<HTMLElement>) => void {
  return (event): void => {
    // PRODUCT §20.2 suspends Vim handling during native text composition. The `composing` state is
    // set by `onCompositionStart`, but the keydown that begins composition can arrive before that
    // handler runs, so the browser's own flag on the native event is honored as well: a composing
    // key must not run a command, move the caret, or edit text. The optional read keeps the partial
    // key-event doubles used by other focused tests working. Chromium can instead report that first
    // keydown as `Process` or `Unidentified` (keyCode 229) with `isComposing` false, which the
    // neutral-key set in `vim-keyboard-handler.ts` covers; "ignores a keydown the native composition
    // flag marks as composing" and "clears a pending fold prefix through composition started by a
    // Process keydown" in `editor-input-handlers.test.ts` pin both shapes.
    if (isComposing() || event.nativeEvent?.isComposing) return
    const snapshot = store.getSnapshot()
    const agenda = snapshot.status === 'ready' ? snapshot.agenda : undefined
    if (agenda !== undefined) {
      const row = store.getAgendaRows().find((candidate) => candidate.key === agenda.selectedKey)
      const element = row?.kind === 'node' ? row.role : row?.kind
      if (element === undefined) return
      const block = (action: import('./agenda-key-policy').AgendaAction): boolean => {
        if (agendaAllows(element, action)) return false
        event.preventDefault()
        return true
      }
      if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        block('structure')
        return
      }
      if (event.metaKey && event.key === 'Backspace') {
        block('structure')
        return
      }
      if (event.key === 'Enter' && !event.metaKey) {
        event.preventDefault()
        // Vim Normal, Replace, and Visual keep `Enter` inert in Agenda; splitting is an Insert and standard-editing command.
        if ((vim === undefined || vim.mode === 'insert') && agendaAllows(element, 'split'))
          store.splitAgendaNode(getCaret(event.currentTarget))
        return
      }
      if (event.metaKey && event.key === 'Enter') {
        if (vim?.mode === 'visual-node') {
          event.preventDefault()
          return
        }
        if (block('strikethrough')) return
      }
      if (
        event.key === 'Backspace' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        node.text === '' &&
        nodeTextLength(event.currentTarget) === 0
      ) {
        event.preventDefault()
        if (node.children.length === 0) store.deleteEmptySelected()
        return
      }
      if (event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        finishVimSessionBeforeNavigation(vim, event.currentTarget)
        store.closeAgenda()
        return
      }
      if (event.metaKey && event.key === '.') {
        event.preventDefault()
        finishVimSessionBeforeNavigation(vim, event.currentTarget)
        store.closeAgenda()
        store.selectNode(node.id, getCaret(event.currentTarget))
        store.enter()
        vim?.syncImageCaretToFocus()
        return
      }
      if (event.metaKey && event.key === ',') {
        event.preventDefault()
        if (agenda.focusedDay !== undefined) {
          finishVimSessionBeforeNavigation(vim, event.currentTarget)
          store.applyAgenda({ kind: 'return-timeline', key: agenda.selectedKey })
        }
        return
      }
      if (event.metaKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        clearCommandAssemblyBeforeCommand(vim)
        store.applyAgenda({ kind: 'toggle-fold', key: agenda.selectedKey })
        return
      }
      if (
        event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        vim?.mode === 'normal' &&
        event.key.toLowerCase() === 'o'
      ) {
        event.preventDefault()
        finishVimSessionBeforeNavigation(vim, event.currentTarget)
        store.applyAgenda({ kind: 'return-timeline', key: agenda.selectedKey })
        return
      }
      if (
        !event.metaKey &&
        !event.altKey &&
        (event.key === 'ArrowUp' ||
          event.key === 'ArrowDown' ||
          (vim?.mode === 'normal' && event.ctrlKey && (event.key === 'd' || event.key === 'u')))
      ) {
        finishVimSessionBeforeNavigation(vim, event.currentTarget)
        createAgendaKeyDownHandler({ store, vim })(event)
        return
      }
    }
    if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      const direction = event.shiftKey ? 'out' : 'in'
      const tabCursor = getCaret(event.currentTarget)
      if (direction === 'out') {
        const visualRange = vim?.mode === 'visual-node' ? vim.nodeVisual.selection() : undefined
        const anchorId = visualRange?.anchorId ?? node.id
        const focusId = visualRange?.focusId ?? node.id
        if (!store.canShiftNodeVisualOutWithinCurrentParent(anchorId, focusId)) {
          if (vim?.mode === 'normal' || vim?.mode === 'visual' || vim?.mode === 'visual-node')
            clearPending(vim.commandState)
          return
        }
      }
      if (vim?.mode === 'visual-node') {
        clearPending(vim.commandState)
        vim.nodeVisual.shift(direction, 1, true)
      } else {
        if (vim?.mode === 'replace') {
          vim.finishReplace(event.currentTarget, false, true)
        }
        if (vim?.mode === 'normal' || vim?.mode === 'visual') clearPending(vim.commandState)
        const selection = getSelectionRange(event.currentTarget)
        if (vim !== undefined) {
          vim.shiftCurrentNode(node.id, direction, 1, selection, tabCursor, true)
          if (vim.mode === 'replace') {
            const inputText =
              event.currentTarget instanceof HTMLTextAreaElement
                ? event.currentTarget.value
                : readEditableContent(event.currentTarget).text
            vim.beginReplace(node.id, event.currentTarget, inputText, getCaret(event.currentTarget))
          }
        } else shiftFocusedNode(direction, selection, tabCursor)
      }
      return
    }
    const selectingAll = event.metaKey && event.key.toLowerCase() === 'a'
    const copying = event.metaKey && event.key.toLowerCase() === 'c'
    const pasting = event.metaKey && event.key.toLowerCase() === 'v'
    if (!selectingAll && !copying && !pasting) {
      setSelectAllNodeId(undefined)
      event.currentTarget.classList.remove('select-all')
    }
    const cursor = getCaret(event.currentTarget)
    if (vim !== undefined && vim.mode === 'replace' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      if (event.key === 'Escape') {
        const committed = vim.finishReplace(event.currentTarget, true)
        store.cancelAgendaMove()
        vim.setMode('normal')
        if (!committed) {
          const prior = vim.getCaretState(node.id, cursor, node.attachment !== undefined && cursor === node.text.length)
          vim.applyCaretState(
            node.id,
            editCaretTransition(prior, cursor, node.text.length, node.attachment !== undefined),
          )
        }
        store.endTextSession()
      } else vim.handleReplaceKey(event.currentTarget, event.key)
      return
    }
    if (
      vim !== undefined &&
      !event.metaKey &&
      !event.altKey &&
      vim.mode === 'normal' &&
      event.ctrlKey &&
      (event.key === 'd' || event.key === 'u')
    ) {
      event.preventDefault()
      if (discardsUnfinishedCommand(vim)) return
      vim.moveViewport(node.id, event.key === 'd' ? 'half-down' : 'half-up', cursor)
      return
    }
    if (
      vim !== undefined &&
      !event.metaKey &&
      !event.altKey &&
      vim.mode === 'normal' &&
      event.ctrlKey &&
      event.key.toLowerCase() === 'o'
    ) {
      event.preventDefault()
      if (discardsUnfinishedCommand(vim)) return
      store.leave()
      vim.syncImageCaretToFocus()
      return
    }
    if (
      vim !== undefined &&
      !event.metaKey &&
      !event.altKey &&
      vim.mode === 'normal' &&
      event.ctrlKey &&
      event.key.toLowerCase() === 'r'
    ) {
      event.preventDefault()
      if (discardsUnfinishedCommand(vim)) return
      store.redo()
      vim.syncImageCaretToFocus()
      return
    }
    /**
     * Any other Ctrl-modified key in a non-Insert Vim mode reaches here unhandled. It must not fall
     * through to native Chromium editing: the node stays contentEditable (or a non-readOnly textarea)
     * across every Vim mode, so an unblocked Ctrl combo can still trigger the browser's own undo/redo,
     * select-all, or macOS's Emacs-style caret and deletion bindings, bypassing the app's own command
     * and document model. Discards a pending command for the same reason the explicit Ctrl+d/u/o/r
     * commands above do: a Ctrl-modified key can never be the awaited character. Excludes the bare
     * `Control` keydown itself — pressing the modifier alone fires that event with `ctrlKey` already
     * true, before the combined key arrives, and it must not discard a command a following Ctrl+d/u/o/r
     * press still needs to see pending.
     */
    if (
      vim !== undefined &&
      !event.metaKey &&
      !event.altKey &&
      event.ctrlKey &&
      event.key !== 'Control' &&
      vim.mode !== 'insert'
    ) {
      event.preventDefault()
      discardsUnfinishedCommand(vim)
      return
    }
    if (vim !== undefined && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (vim.mode === 'insert' && event.key === 'Escape') {
        event.preventDefault()
        // Escape is the one completion that records the plain session's diff for `.`; every other
        // finish path below consumes it without recording (PRODUCT §20.2.1 T8).
        vim.finishInsert(event.currentTarget, true)
        clearCommandAssembly(vim.commandState)
        store.cancelAgendaMove()
        vim.setMode('normal')
        const input = event.currentTarget
        const prior = vim.getCaretState(node.id, cursor, input.classList.contains('node-input-image-caret'))
        const next = editCaretTransition(
          prior,
          Math.max(0, cursor - 1),
          node.text.length,
          node.attachment !== undefined,
        )
        vim.applyCaretState(node.id, next)
        store.endTextSession()
        return
      }
      if (vim.mode !== 'insert') {
        if (handleVimKey(event, store, node, vim)) return
        event.preventDefault()
        return
      }
    }
    if (selectingAll) {
      event.preventDefault()
      // Select-all replaces the selection, so it ends whole-node Visual and clears a pending command
      // or character Visual endpoints. A pending Replace edit commits first without rewriting the
      // DOM, because the select-all feedback render would otherwise rewind the visible replacement
      // to the stored text.
      commitPendingReplace(vim, event.currentTarget)
      clearCommandAssemblyBeforeCommand(vim)
      const input = event.currentTarget
      selectAll(input)
      globalThis.queueMicrotask(() => {
        setSelectAllNodeId(node.id)
        input.classList.add('select-all')
      })
    } else if (event.metaKey && event.key.toLowerCase() === 'c') {
      const selection = getSelectionRange(event.currentTarget)
      if (selection.start !== selection.end) {
        event.preventDefault()
        void store.copy(node.id, selection.start, selection.end).catch((error: unknown) => store.reportError(error))
      }
    } else if (event.metaKey && event.key.toLowerCase() === 'v') {
      event.preventDefault()
      // A paste edits this node's text, so any session or command assembly describing the old text
      // must resolve before the store changes.
      finishVimSessionBeforeTextEdit(vim, event.currentTarget)
      void store.paste(node.id, getCaret(event.currentTarget)).catch((error: unknown) => store.reportError(error))
    } else if (event.metaKey && event.key.toLowerCase() === 'x') {
      const selection = getSelectionRange(event.currentTarget)
      if (selection.start !== selection.end) {
        event.preventDefault()
        // A cut edits this node's text; resolve the session first and preserve the visible selection
        // so the cut removes exactly what the user selected.
        finishVimSessionBeforeTextEdit(vim, event.currentTarget)
        void store.cut(node.id, selection.start, selection.end).catch((error: unknown) => store.reportError(error))
      }
    } else if (event.metaKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'p') {
      event.preventDefault()
      finishVimSessionBeforeNavigation(vim, event.currentTarget)
      store.openAgenda(getCaret(event.currentTarget))
    } else if (event.metaKey && event.key === '.') {
      event.preventDefault()
      finishVimSessionBeforeNavigation(vim, event.currentTarget)
      store.enter()
      vim?.syncImageCaretToFocus()
    } else if (event.metaKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'e') {
      // Toggles the selected node's own fold like `za`. The caret and the Insert session are
      // untouched, so only the unfinished command assembly clears.
      event.preventDefault()
      clearCommandAssemblyBeforeCommand(vim)
      store.applyFold('toggle', node.id)
    } else if (event.metaKey && event.key === 'Enter') {
      // Every Cmd-modified Enter is claimed so it can never fall through to node creation; only the
      // plain Cmd+Enter toggles the strikethrough (PRODUCT §2.5) of the whole-node Visual range, or
      // else of this node. A pending Replace edit commits first without rewriting the DOM, so the
      // toggle's render cannot rewind the visible replacement; Insert stays active and the caret
      // stays where it is.
      event.preventDefault()
      if (event.shiftKey || event.altKey) return
      const range = vim?.mode === 'visual-node' ? vim.nodeVisual.selection() : undefined
      commitPendingReplace(vim, event.currentTarget)
      clearCommandAssemblyBeforeCommand(vim)
      store.toggleStrikethrough(range?.anchorId ?? node.id, range?.focusId ?? node.id)
    } else if (event.metaKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      if (node.attachment !== undefined) {
        onPreviewAttachment(node.attachment.id)
      }
    } else if (event.metaKey && event.key === ',') {
      event.preventDefault()
      finishVimSessionBeforeNavigation(vim, event.currentTarget)
      store.leave()
      vim?.syncImageCaretToFocus()
    } else if (event.metaKey && event.key === 'Backspace') {
      event.preventDefault()
      finishVimSessionBeforeNavigation(vim, event.currentTarget)
      store.deleteSelected()
    } else if (event.metaKey && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (vim?.mode === 'replace') {
        vim.finishReplace(event.currentTarget, true)
        vim.setMode('normal')
      } else if (vim?.mode === 'insert') {
        vim.finishInsert(event.currentTarget)
      }
      clearCommandAssemblyBeforeCommand(vim)
      if (event.shiftKey) store.redo()
      else store.undo()
      vim?.syncImageCaretToFocus()
    } else if (event.metaKey && event.key.toLowerCase() === 'q') {
      event.preventDefault()
      void window.treeApi.quit().catch((error: unknown) => store.reportError(error))
    } else if (event.metaKey && event.key === '0') event.preventDefault()
    else if (event.key === 'Backspace' && node.text === '') {
      event.preventDefault()
      store.deleteEmptySelected()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      store.createSiblingOrFirstChild(cursor)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      store.moveSelection('up', cursor)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      store.moveSelection('down', cursor)
    } else if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'Home' ||
      event.key === 'End' ||
      event.key === 'PageUp' ||
      event.key === 'PageDown'
    ) {
      const selection = getSelectionRange(event.currentTarget)
      const moved =
        selection.start === selection.end &&
        ((event.key === 'ArrowLeft' && store.moveHorizontal('left', cursor)) ||
          (event.key === 'ArrowRight' && store.moveHorizontal('right', cursor)))
      if (moved) event.preventDefault()
      else store.endTextSession()
    }
  }
}
