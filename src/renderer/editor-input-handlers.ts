import type { KeyboardEvent } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import type { EditorContextMenuCommand } from '../shared/ipc'
import { editCaretTransition } from './vim-caret-transition'
import { getCaret, getSelectionRange, selectAll, setNormalCaret } from './editor-dom'
import { handleVimKey } from './vim-keyboard-handler'
import type { VimKeyboardState } from './vim-keyboard-types'

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
 * the mode while re-anchoring. Mirrors `clearCommandAssembly` in `vim-command-state.ts`, which this
 * module cannot call because it receives access-time handles to the owner rather than the owner
 * itself.
 */
function clearCommandAssemblyBeforeCommand(vim: VimKeyboardState | undefined): void {
  if (vim === undefined) return
  vim.pending.current = undefined
  vim.visualAnchor.current = undefined
  vim.visualFocus.current = undefined
  if (vim.mode !== 'visual-node') return
  vim.nodeVisual?.exit()
  vim.setMode('normal')
}

/**
 * Finishes a pending Insert or Replace session before a command that moves focus off the current
 * node (`Cmd+.`, `Cmd+,`, `Cmd+Backspace`, undo, redo). A pending Insert session's text is already
 * live in the store, so this only captures its dot-repeat bookkeeping (`.` later checks whether the
 * captured node still matches before replaying it); a pending Replace session commits its buffered
 * text and returns to Normal mode, matching the documented undo/redo rule. Character Visual mode's
 * stale command assembly clears while the mode stays active, and whole-node Visual mode ends
 * because its range belongs to the displayed level being left.
 */
function finishVimSessionBeforeNavigation(vim: VimKeyboardState | undefined, input: HTMLElement): void {
  vim?.finishInsert?.(input)
  clearCommandAssemblyBeforeCommand(vim)
  if (vim?.mode !== 'replace') return
  vim.finishReplace?.(input, false)
  vim.setMode('normal')
}

export function executeEditorContextMenuCommand(
  command: EditorContextMenuCommand,
  store: EditorStore,
  node: TreeNode,
  input: HTMLElement,
): void {
  const selection = getSelectionRange(input)
  if (command === 'selectAll') {
    selectAll(input)
    return
  }
  if (command === 'copy' && selection.start !== selection.end) {
    void store.copy(node.id, selection.start, selection.end).catch((error: unknown) => store.reportError(error))
  } else if (command === 'cut' && selection.start !== selection.end) {
    void store.cut(node.id, selection.start, selection.end).catch((error: unknown) => store.reportError(error))
  } else if (command === 'paste') {
    void store.paste(node.id, getCaret(input)).catch((error: unknown) => store.reportError(error))
  }
}

export interface EditorKeyboardHandlerDependencies {
  store: EditorStore
  node: TreeNode
  isComposing: () => boolean
  setSelectAllNodeId: (nodeId: string | undefined) => void
  onPreviewAttachment: (attachmentId: string) => void
  vim?: VimKeyboardState
}

export function createEditorKeyDownHandler({
  store,
  node,
  isComposing,
  setSelectAllNodeId,
  onPreviewAttachment,
  vim,
}: EditorKeyboardHandlerDependencies): (event: KeyboardEvent<HTMLElement>) => void {
  return (event): void => {
    if (isComposing()) return
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
        const changed = vim.finishReplace?.(event.currentTarget, true) ?? false
        vim.setMode('normal')
        setNormalCaret(event.currentTarget, Math.max(0, getCaret(event.currentTarget) - (changed ? 1 : 0)))
        store.endTextSession()
      } else vim.handleReplaceKey?.(event.currentTarget, event.key)
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
      vim.pending.current = undefined
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
      vim.pending.current = undefined
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
      vim.pending.current = undefined
      store.redo()
      vim.syncImageCaretToFocus()
      return
    }
    if (vim !== undefined && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (vim.mode === 'insert' && event.key === 'Escape') {
        event.preventDefault()
        vim.finishInsert?.(event.currentTarget)
        vim.pending.current = undefined
        vim.visualAnchor.current = undefined
        vim.visualFocus.current = undefined
        vim.setMode('normal')
        const input = event.currentTarget
        const prior = vim.getCaretState?.(node.id, cursor, input.classList.contains('node-input-image-caret')) ?? {
          cursor,
          imageActive:
            input.classList.contains('node-input-image-caret') ||
            (node.attachment !== undefined && cursor === node.text.length),
          imageTextReturnCursor: vim.imageTextCursor?.current,
        }
        const next = editCaretTransition(
          prior,
          Math.max(0, cursor - 1),
          node.text.length,
          node.attachment !== undefined,
        )
        setNormalCaret(input, next.cursor)
        if (vim.applyCaretState !== undefined) vim.applyCaretState(node.id, next)
        else {
          if (vim.imageTextCursor !== undefined) vim.imageTextCursor.current = next.imageTextReturnCursor
          vim.setImageCaret?.(node.id, next.imageActive)
        }
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
      // Select-all replaces the selection, so a pending command or character Visual endpoints must
      // not survive it; whole-node Visual ends because its range no longer describes the selection.
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
      void store.paste(node.id, getCaret(event.currentTarget)).catch((error: unknown) => store.reportError(error))
    } else if (event.metaKey && event.key.toLowerCase() === 'x') {
      const selection = getSelectionRange(event.currentTarget)
      if (selection.start !== selection.end) {
        event.preventDefault()
        void store.cut(node.id, selection.start, selection.end).catch((error: unknown) => store.reportError(error))
      }
    } else if (event.metaKey && event.key === '.') {
      event.preventDefault()
      finishVimSessionBeforeNavigation(vim, event.currentTarget)
      store.enter()
      vim?.syncImageCaretToFocus()
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
        const changed = vim.finishReplace?.(event.currentTarget, true) ?? false
        vim.setMode('normal')
        if (changed) setNormalCaret(event.currentTarget, Math.max(0, getCaret(event.currentTarget) - 1))
      } else if (vim?.mode === 'insert') {
        vim.finishInsert?.(event.currentTarget)
      }
      clearCommandAssemblyBeforeCommand(vim)
      if (event.shiftKey) store.redo()
      else store.undo()
      vim?.syncImageCaretToFocus()
    } else if (event.metaKey && event.key.toLowerCase() === 'q') {
      event.preventDefault()
      void window.treeApi.quit().catch((error: unknown) => store.reportError(error))
    } else if (event.metaKey && event.key === '0') event.preventDefault()
    else if (event.metaKey && event.key === 'Enter') {
      event.preventDefault()
      if (node.attachment !== undefined) {
        onPreviewAttachment(node.attachment.id)
      }
    } else if (event.key === 'Backspace' && node.text === '') {
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
