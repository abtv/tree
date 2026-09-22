import type { KeyboardEvent } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { getCaret, getSelectionRange, selectAll, setCaret, setNormalCaret, setSelectionRange } from './editor-dom'
import type { EditorContextMenuCommand } from '../shared/ipc'
import { firstNonWhitespace, moveWordBackward, moveWordForward, type VimMode } from './vim-editing'

export interface VimKeyboardState {
  mode: VimMode
  register: { current: string }
  pending: { current: string | undefined }
  visualAnchor: { current: number | undefined }
  visualFocus: { current: number | undefined }
  moveBoundary: (boundary: 'first' | 'last', cursor: number) => void
  moveViewport: (nodeId: string, motion: VimViewportMotion, cursor: number) => void
  setMode: (mode: VimMode) => void
  scheduleCaret: (input: HTMLElement, cursor: number) => void
}

export type VimViewportMotion = 'top' | 'middle' | 'bottom' | 'half-up' | 'half-down'

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
    if (vim !== undefined && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (vim.mode === 'insert' && event.key === 'Escape') {
        event.preventDefault()
        vim.pending.current = undefined
        vim.visualAnchor.current = undefined
        vim.visualFocus.current = undefined
        vim.setMode('normal')
        setNormalCaret(event.currentTarget, Math.max(0, cursor - 1))
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
      store.enter()
    } else if (event.metaKey && event.key === ',') {
      event.preventDefault()
      store.leave()
    } else if (event.metaKey && event.key === 'Backspace') {
      event.preventDefault()
      store.deleteSelected()
    } else if (event.metaKey && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) store.redo()
      else store.undo()
    } else if (event.metaKey && event.key.toLowerCase() === 'q') {
      event.preventDefault()
      void window.treeApi.quit().catch((error: unknown) => store.reportError(error))
    } else if (event.metaKey && event.key === '0') event.preventDefault()
    else if (event.metaKey && event.key === 'Enter') {
      event.preventDefault()
      if (node.attachment !== undefined) {
        onPreviewAttachment(node.attachment.id)
      }
    } else if (event.key === 'Backspace' && store.deleteLink(node.id, cursor)) {
      event.preventDefault()
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

function handleVimKey(
  event: KeyboardEvent<HTMLElement>,
  store: EditorStore,
  node: TreeNode,
  vim: VimKeyboardState,
): boolean {
  const input = event.currentTarget
  const cursor = getCaret(input)
  const selection = getSelectionRange(input)
  const visual = vim.mode === 'visual'
  const motionCursor = visual ? (vim.visualFocus.current ?? cursor) : cursor
  const move = (target: number): void => {
    const maximum = node.text.length > 0 ? node.text.length - 1 : 0
    const clamped = Math.max(0, Math.min(target, maximum))
    if (visual) {
      const anchor = vim.visualAnchor.current ?? cursor
      vim.visualFocus.current = clamped
      setSelectionRange(input, Math.min(anchor, clamped), Math.max(anchor, clamped) + 1)
    } else setNormalCaret(input, clamped)
  }
  const handled = (): true => {
    event.preventDefault()
    return true
  }

  if (event.key === 'Escape') {
    vim.pending.current = undefined
    vim.visualAnchor.current = undefined
    vim.visualFocus.current = undefined
    vim.setMode('normal')
    setNormalCaret(input, selection.start)
    return handled()
  }
  if (!visual && (event.key === 'i' || event.key === 'a' || event.key === 'I' || event.key === 'A')) {
    vim.pending.current = undefined
    vim.setMode('insert')
    setCaret(
      input,
      event.key === 'A'
        ? node.text.length
        : event.key === 'I'
          ? firstNonWhitespace(node.text)
          : event.key === 'a'
            ? Math.min(cursor + 1, node.text.length)
            : cursor,
    )
    return handled()
  }
  if (!visual && event.key === 'v') {
    vim.pending.current = undefined
    vim.visualAnchor.current = cursor
    vim.visualFocus.current = cursor
    vim.setMode('visual')
    setSelectionRange(input, cursor, Math.min(cursor + 1, node.text.length))
    return handled()
  }
  if (event.key === 'h') move(motionCursor - 1)
  else if (event.key === 'l') move(motionCursor + 1)
  else if (event.key === 'w') move(moveWordForward(node.text, motionCursor))
  else if (event.key === 'b') move(moveWordBackward(node.text, motionCursor))
  else if (event.key === '0') move(0)
  else if (event.key === '^') move(firstNonWhitespace(node.text))
  else if (event.key === '$') move(Math.max(0, node.text.length - 1))
  else if (!visual && (event.key === 'j' || event.key === 'k')) {
    vim.visualAnchor.current = undefined
    vim.visualFocus.current = undefined
    vim.setMode('normal')
    store.moveSelection(event.key === 'j' ? 'down' : 'up', cursor)
  } else if (visual && (event.key === 'd' || event.key === 'y')) {
    if (selection.start !== selection.end) vim.register.current = node.text.slice(selection.start, selection.end)
    if (event.key === 'd' && selection.start !== selection.end) {
      store.replaceTextRange(node.id, selection.start, selection.end, '')
      vim.scheduleCaret(input, selection.start)
    } else setNormalCaret(input, selection.start)
    vim.visualAnchor.current = undefined
    vim.visualFocus.current = undefined
    vim.setMode('normal')
  } else if (!visual && event.key === 'x') {
    if (cursor < node.text.length) {
      vim.register.current = node.text.slice(cursor, cursor + 1)
      store.replaceTextRange(node.id, cursor, cursor + 1, '')
      vim.scheduleCaret(input, Math.min(cursor, Math.max(0, node.text.length - 2)))
    }
  } else if (!visual && (event.key === 'p' || event.key === 'P')) {
    const value = vim.register.current
    if (value !== '') {
      const position = event.key === 'p' ? Math.min(cursor + 1, node.text.length) : cursor
      store.replaceTextRange(node.id, position, position, value)
      vim.scheduleCaret(input, position + value.length - 1)
    }
  } else if (!visual && event.key === 'g') {
    if (vim.pending.current === 'g') {
      vim.pending.current = undefined
      vim.moveBoundary('first', cursor)
    } else vim.pending.current = 'g'
  } else if (!visual && event.key === 'G') {
    vim.pending.current = undefined
    vim.moveBoundary('last', cursor)
  } else if (!visual && (event.key === 'H' || event.key === 'M' || event.key === 'L')) {
    vim.pending.current = undefined
    vim.moveViewport(node.id, event.key === 'H' ? 'top' : event.key === 'M' ? 'middle' : 'bottom', cursor)
  } else if (!visual && event.key === 'd') {
    if (vim.pending.current === 'd') {
      vim.pending.current = undefined
      store.deleteSelected()
    } else if (vim.pending.current === 'g') {
      vim.pending.current = undefined
      store.enter()
    } else vim.pending.current = 'd'
  } else {
    vim.pending.current = undefined
    return false
  }
  if (event.key !== 'd' && event.key !== 'g') vim.pending.current = undefined
  return handled()
}
