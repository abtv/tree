// @vitest-environment jsdom

import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { createEditorKeyDownHandler } from './editor-input-handlers'

function createStore(): EditorStore {
  return {
    copy: vi.fn(async () => true),
    createSiblingOrFirstChild: vi.fn(),
    cut: vi.fn(async () => true),
    deleteEmptySelected: vi.fn(),
    deleteLink: vi.fn(() => false),
    deleteSelected: vi.fn(),
    endTextSession: vi.fn(),
    enter: vi.fn(),
    leave: vi.fn(),
    moveHorizontal: vi.fn(() => false),
    moveSelection: vi.fn(),
    redo: vi.fn(),
    reportError: vi.fn(),
    undo: vi.fn(),
  } as unknown as EditorStore
}

function keyEvent(input: HTMLElement, key: string, options: { metaKey?: boolean; shiftKey?: boolean } = {}) {
  return {
    currentTarget: input,
    key,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLElement>
}

function handler(store: EditorStore, node: TreeNode, composing = false) {
  const onPreviewAttachment = vi.fn()
  const setSelectAllNodeId = vi.fn()
  return {
    onPreviewAttachment,
    setSelectAllNodeId,
    handle: createEditorKeyDownHandler({
      store,
      node,
      isComposing: () => composing,
      setSelectAllNodeId,
      onPreviewAttachment,
    }),
  }
}

describe('editor keyboard handler', () => {
  it('does not dispatch commands while native text composition is active', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(2, 2)

    handler(store, { id: 'node', text: 'text', children: [] }, true).handle(keyEvent(input, 'Enter'))

    expect(store.createSiblingOrFirstChild).not.toHaveBeenCalled()
  })

  it('dispatches structural and navigation commands with the current caret position', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(2, 2)
    const { handle } = handler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, 'Enter'))
    handle(keyEvent(input, 'ArrowUp'))
    handle(keyEvent(input, 'ArrowDown'))
    handle(keyEvent(input, 'Backspace', { metaKey: true }))

    expect(store.createSiblingOrFirstChild).toHaveBeenCalledWith(2)
    expect(store.moveSelection).toHaveBeenNthCalledWith(1, 'up', 2)
    expect(store.moveSelection).toHaveBeenNthCalledWith(2, 'down', 2)
    expect(store.deleteSelected).toHaveBeenCalledOnce()
  })

  it('routes command navigation, history, and image preview actions', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const node: TreeNode = {
      id: 'node',
      text: 'text',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    }
    const { handle, onPreviewAttachment } = handler(store, node)

    handle(keyEvent(input, '.', { metaKey: true }))
    handle(keyEvent(input, ',', { metaKey: true }))
    handle(keyEvent(input, 'z', { metaKey: true }))
    handle(keyEvent(input, 'z', { metaKey: true, shiftKey: true }))
    handle(keyEvent(input, 'Enter', { metaKey: true }))

    expect(store.enter).toHaveBeenCalledOnce()
    expect(store.leave).toHaveBeenCalledOnce()
    expect(store.undo).toHaveBeenCalledOnce()
    expect(store.redo).toHaveBeenCalledOnce()
    expect(onPreviewAttachment).toHaveBeenCalledWith('image')
  })

  it('selects all linked content and removes link text at its end', async () => {
    const store = createStore()
    vi.mocked(store.deleteLink).mockReturnValue(true)
    const input = document.createElement('div')
    input.innerHTML = '<a contenteditable="false" href="https://example.test">link</a>'
    document.body.append(input)
    const node = {
      id: 'node',
      text: 'link',
      links: [{ start: 0, end: 4, url: 'https://example.test' }],
      children: [],
    }
    const { handle, setSelectAllNodeId } = handler(store, node)

    const selectAllEvent = keyEvent(input, 'a', { metaKey: true })
    handle(selectAllEvent)
    await Promise.resolve()
    const selection = window.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(input)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
    const deleteEvent = keyEvent(input, 'Backspace')
    handle(deleteEvent)

    expect(selectAllEvent.preventDefault).toHaveBeenCalledOnce()
    expect(setSelectAllNodeId).toHaveBeenCalledWith('node')
    expect(store.deleteLink).toHaveBeenCalledWith('node', 4)
    expect(deleteEvent.preventDefault).toHaveBeenCalledOnce()
  })

  it('selects all plain text content explicitly', async () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'plain text'
    input.setSelectionRange(2, 2)
    const { handle, setSelectAllNodeId } = handler(store, { id: 'node', text: 'plain text', children: [] })

    const event = keyEvent(input, 'a', { metaKey: true })
    handle(event)
    await Promise.resolve()

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
    expect(setSelectAllNodeId).toHaveBeenCalledWith('node')
  })

  it('leaves collapsed copy and cut selections to the browser', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(2, 2)
    const { handle } = handler(store, { id: 'node', text: 'text', children: [] })

    const copyEvent = keyEvent(input, 'c', { metaKey: true })
    const cutEvent = keyEvent(input, 'x', { metaKey: true })
    handle(copyEvent)
    handle(cutEvent)

    expect(copyEvent.preventDefault).not.toHaveBeenCalled()
    expect(cutEvent.preventDefault).not.toHaveBeenCalled()
    expect(store.copy).not.toHaveBeenCalled()
    expect(store.cut).not.toHaveBeenCalled()
  })

  it('leaves non-empty plain-text copy to the browser', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(0, 4)
    const { handle } = handler(store, { id: 'node', text: 'text', children: [] })

    const event = keyEvent(input, 'c', { metaKey: true })
    handle(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(store.copy).not.toHaveBeenCalled()
  })

  it('does not open a preview for an image command when the node has no attachment', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    const { handle, onPreviewAttachment } = handler(store, { id: 'node', text: 'text', children: [] })

    const event = keyEvent(input, 'Enter', { metaKey: true })
    handle(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(onPreviewAttachment).not.toHaveBeenCalled()
  })
})
