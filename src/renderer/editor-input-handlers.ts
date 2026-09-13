import type { KeyboardEvent } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { getCaret, getSelectionRange, selectAll } from './editor-dom'

export interface EditorKeyboardHandlerDependencies {
  store: EditorStore
  node: TreeNode
  isComposing: () => boolean
  setSelectAllNodeId: (nodeId: string | undefined) => void
  onPreviewAttachment: (attachmentId: string) => void
}

export function createEditorKeyDownHandler({
  store,
  node,
  isComposing,
  setSelectAllNodeId,
  onPreviewAttachment,
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
