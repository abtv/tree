// @vitest-environment jsdom

import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import type { VimKeyboardState } from './editor-input-handlers'

function createStore(): EditorStore {
  return {
    copy: vi.fn(async () => true),
    createSiblingOrFirstChild: vi.fn(),
    createSibling: vi.fn(),
    cut: vi.fn(async () => true),
    deleteEmptySelected: vi.fn(),
    deleteLink: vi.fn(() => false),
    deleteSelected: vi.fn(),
    endTextSession: vi.fn(),
    enter: vi.fn(),
    leave: vi.fn(),
    moveHorizontal: vi.fn(() => false),
    moveSelection: vi.fn(),
    paste: vi.fn(async () => {}),
    pasteSubtree: vi.fn(),
    redo: vi.fn(),
    replaceTextRange: vi.fn(),
    reportError: vi.fn(),
    undo: vi.fn(),
  } as unknown as EditorStore
}

function keyEvent(
  input: HTMLElement,
  key: string,
  options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
) {
  return {
    currentTarget: input,
    key,
    ctrlKey: options.ctrlKey ?? false,
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

function vimHandler(store: EditorStore, node: TreeNode, mode: VimKeyboardState['mode'] = 'normal') {
  const vim: VimKeyboardState = {
    mode,
    register: { current: { kind: 'empty' } },
    pending: { current: undefined },
    visualAnchor: { current: undefined },
    visualFocus: { current: undefined },
    moveBoundary: vi.fn(),
    moveViewport: vi.fn(),
    setMode: vi.fn((next) => {
      vim.mode = next
    }),
    scheduleCaret: vi.fn(),
  }
  return {
    vim,
    handle: createEditorKeyDownHandler({
      store,
      node,
      isComposing: () => false,
      setSelectAllNodeId: vi.fn(),
      onPreviewAttachment: vi.fn(),
      vim,
    }),
  }
}

describe('editor keyboard handler', () => {
  it('moves and edits in Normal mode without inserting command characters', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'one two'
    input.setSelectionRange(0, 0)
    const { handle } = vimHandler(store, { id: 'node', text: 'one two', children: [] })

    const word = keyEvent(input, 'w')
    handle(word)
    expect(input.selectionStart).toBe(4)
    expect(word.preventDefault).toHaveBeenCalledOnce()

    const remove = keyEvent(input, 'x')
    handle(remove)
    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 4, 5, '')
    expect(remove.preventDefault).toHaveBeenCalledOnce()
  })

  it('enters Insert mode at the end of the node with A', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'one two'
    input.setSelectionRange(1, 1)
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'one two', children: [] })

    const event = keyEvent(input, 'A')
    handle(event)

    expect(vim.mode).toBe('insert')
    expect(input.selectionStart).toBe(7)
    expect(input.selectionEnd).toBe(7)
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('enters Insert mode at position zero with A on an empty node', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    const { handle, vim } = vimHandler(store, { id: 'node', text: '', children: [] })

    handle(keyEvent(input, 'A'))

    expect(vim.mode).toBe('insert')
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(0)
  })

  it('enters Insert mode at the first non-whitespace character with I', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = '  one two'
    input.setSelectionRange(6, 6)
    const { handle, vim } = vimHandler(store, { id: 'node', text: '  one two', children: [] })

    handle(keyEvent(input, 'I'))

    expect(vim.mode).toBe('insert')
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(2)
  })

  it('opens an empty sibling below with o and above with O', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(2, 2)
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    const below = keyEvent(input, 'o')
    handle(below)
    expect(store.createSibling).toHaveBeenNthCalledWith(1, 'after')
    expect(vim.mode).toBe('insert')
    expect(below.preventDefault).toHaveBeenCalledOnce()

    vim.mode = 'normal'
    const above = keyEvent(input, 'O')
    handle(above)
    expect(store.createSibling).toHaveBeenNthCalledWith(2, 'before')
    expect(vim.mode).toBe('insert')
    expect(above.preventDefault).toHaveBeenCalledOnce()
  })

  it('enters Insert mode at zero with I for an all-whitespace node', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = '   '
    const { handle } = vimHandler(store, { id: 'node', text: '   ', children: [] })

    handle(keyEvent(input, 'I'))

    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(0)
  })

  it('deletes the selected node only after dd', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, 'd'))
    expect(store.deleteSelected).not.toHaveBeenCalled()
    handle(keyEvent(input, 'd'))
    expect(store.deleteSelected).toHaveBeenCalledOnce()
    expect(vim.register.current).toMatchObject({ kind: 'node', value: { id: 'node', text: 'text' } })
  })

  it('copies a node subtree with yy and pastes it as a sibling with p or P', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'parent'
    const node: TreeNode = {
      id: 'node',
      text: 'parent',
      children: [{ id: 'child', text: 'child', children: [] }],
    }
    const { handle, vim } = vimHandler(store, node)

    handle(keyEvent(input, 'y'))
    expect(store.pasteSubtree).not.toHaveBeenCalled()
    handle(keyEvent(input, 'y'))

    expect(vim.register.current).toEqual({ kind: 'node', value: node })
    expect(vim.register.current).not.toBe(node)
    const subtree = vim.register.current.kind === 'node' ? vim.register.current.value : undefined

    handle(keyEvent(input, 'p'))
    expect(store.pasteSubtree).toHaveBeenCalledWith('node', 'after', subtree)
    handle(keyEvent(input, 'P'))
    expect(store.pasteSubtree).toHaveBeenCalledWith('node', 'before', subtree)
  })

  it('enters the selected node after gd', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'Parent'
    const { handle } = vimHandler(store, { id: 'node', text: 'Parent', children: [] })

    handle(keyEvent(input, 'g'))
    expect(store.enter).not.toHaveBeenCalled()
    handle(keyEvent(input, 'd'))

    expect(store.enter).toHaveBeenCalledOnce()
    expect(store.deleteSelected).not.toHaveBeenCalled()
  })

  it('leaves the current node with Ctrl+o in Normal mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'Child'
    input.setSelectionRange(2, 2)
    const { handle } = vimHandler(store, { id: 'child', text: 'Child', children: [] })

    const event = keyEvent(input, 'o', { ctrlKey: true })
    handle(event)

    expect(store.leave).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('moves to the first and last nodes with gg and G', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, 'g'))
    handle(keyEvent(input, 'g'))
    handle(keyEvent(input, 'G'))

    expect(vim.moveBoundary).toHaveBeenNthCalledWith(1, 'first', 4)
    expect(vim.moveBoundary).toHaveBeenNthCalledWith(2, 'last', 4)
  })

  it('moves by viewport positions with H, M, L, Ctrl+d, and Ctrl+u', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, 'H'))
    handle(keyEvent(input, 'M'))
    handle(keyEvent(input, 'L'))
    handle(keyEvent(input, 'd', { ctrlKey: true }))
    handle(keyEvent(input, 'u', { ctrlKey: true }))

    expect(vim.moveViewport).toHaveBeenNthCalledWith(1, 'node', 'top', 4)
    expect(vim.moveViewport).toHaveBeenNthCalledWith(2, 'node', 'middle', 4)
    expect(vim.moveViewport).toHaveBeenNthCalledWith(3, 'node', 'bottom', 4)
    expect(vim.moveViewport).toHaveBeenNthCalledWith(4, 'node', 'half-down', 4)
    expect(vim.moveViewport).toHaveBeenNthCalledWith(5, 'node', 'half-up', 4)
  })

  it('undoes with u and redoes with Ctrl+r in Normal mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, 'u'))
    handle(keyEvent(input, 'r', { ctrlKey: true }))

    expect(store.undo).toHaveBeenCalledOnce()
    expect(store.redo).toHaveBeenCalledOnce()
  })

  it('blocks unsupported editing keys in Normal mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle } = vimHandler(store, { id: 'node', text: 'text', children: [] })
    const event = keyEvent(input, 'Backspace')

    handle(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('keeps backward Visual movement inclusive of the anchor character', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abc'
    input.setSelectionRange(1, 1)
    const first = vimHandler(store, { id: 'node', text: 'abc', children: [] })

    first.handle(keyEvent(input, 'v'))
    const second = vimHandler(store, { id: 'node', text: 'abc', children: [] }, 'visual')
    second.vim.visualAnchor.current = first.vim.visualAnchor.current
    second.vim.visualFocus.current = first.vim.visualFocus.current
    second.handle(keyEvent(input, 'h'))

    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(2)
  })

  it('does not move between nodes from Visual mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abc'
    input.setSelectionRange(1, 1)
    const { handle } = vimHandler(store, { id: 'node', text: 'abc', children: [] }, 'visual')

    const event = keyEvent(input, 'j')
    handle(event)

    expect(store.moveSelection).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('moves $ onto the final character', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abc'
    const { handle } = vimHandler(store, { id: 'node', text: 'abc', children: [] })

    handle(keyEvent(input, '$'))

    expect(input.selectionStart).toBe(2)
  })

  it('does not move Normal-mode motions past the final character', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abc'
    input.setSelectionRange(2, 2)
    const { handle } = vimHandler(store, { id: 'node', text: 'abc', children: [] })

    handle(keyEvent(input, 'l'))
    handle(keyEvent(input, 'w'))

    expect(input.selectionStart).toBe(2)
  })

  it('puts the local register before or after the current character', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abcd'
    input.setSelectionRange(1, 1)
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'abcd', children: [] })
    vim.register.current = { kind: 'text', value: 'XY' }

    const after = keyEvent(input, 'p')
    handle(after)
    expect(store.replaceTextRange).toHaveBeenNthCalledWith(1, 'node', 2, 2, 'XY')
    expect(vim.scheduleCaret).toHaveBeenNthCalledWith(1, input, 3)
    expect(after.preventDefault).toHaveBeenCalledOnce()

    const before = keyEvent(input, 'P')
    handle(before)
    expect(store.replaceTextRange).toHaveBeenNthCalledWith(2, 'node', 1, 1, 'XY')
    expect(vim.scheduleCaret).toHaveBeenNthCalledWith(2, input, 2)
    expect(before.preventDefault).toHaveBeenCalledOnce()
  })

  it('handles p and P without editing when the local register is empty', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abc'
    input.setSelectionRange(1, 1)
    const { handle } = vimHandler(store, { id: 'node', text: 'abc', children: [] })

    const after = keyEvent(input, 'p')
    handle(after)
    const before = keyEvent(input, 'P')
    handle(before)

    expect(store.replaceTextRange).not.toHaveBeenCalled()
    expect(store.pasteSubtree).not.toHaveBeenCalled()
    expect(after.preventDefault).toHaveBeenCalledOnce()
    expect(before.preventDefault).toHaveBeenCalledOnce()
  })

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

  it('copies a non-empty plain-text selection through the store', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(0, 4)
    const { handle } = handler(store, { id: 'node', text: 'text', children: [] })

    const event = keyEvent(input, 'c', { metaKey: true })
    handle(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(store.copy).toHaveBeenCalledWith('node', 0, 4)
  })

  it('cuts a non-empty plain-text selection through the store', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(0, 4)
    const { handle } = handler(store, { id: 'node', text: 'text', children: [] })

    const event = keyEvent(input, 'x', { metaKey: true })
    handle(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(store.cut).toHaveBeenCalledWith('node', 0, 4)
  })

  it('pastes the clipboard through the store on Cmd+V', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(2, 2)
    const { handle } = handler(store, { id: 'node', text: 'text', children: [] })

    const event = keyEvent(input, 'v', { metaKey: true })
    handle(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(store.paste).toHaveBeenCalledWith('node', 2)
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

  it('prevents the default for Cmd+0 without dispatching a command', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(2, 2)
    const { handle } = handler(store, { id: 'node', text: 'text', children: [] })

    const event = keyEvent(input, '0', { metaKey: true })
    handle(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(store.createSiblingOrFirstChild).not.toHaveBeenCalled()
    expect(store.moveSelection).not.toHaveBeenCalled()
    expect(store.endTextSession).not.toHaveBeenCalled()
  })

  it('ends the text session for boundary keys that do not move the selection', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(2, 2)
    const { handle } = handler(store, { id: 'node', text: 'text', children: [] })

    for (const key of ['Home', 'End', 'PageUp', 'PageDown']) handle(keyEvent(input, key))

    expect(store.endTextSession).toHaveBeenCalledTimes(4)
    expect(store.moveHorizontal).not.toHaveBeenCalled()
  })

  it('moves horizontally at a text boundary and prevents the browser default', () => {
    const store = createStore()
    vi.mocked(store.moveHorizontal).mockReturnValue(true)
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(2, 2)
    const { handle } = handler(store, { id: 'node', text: 'text', children: [] })

    const left = keyEvent(input, 'ArrowLeft')
    const right = keyEvent(input, 'ArrowRight')
    handle(left)
    handle(right)

    expect(store.moveHorizontal).toHaveBeenNthCalledWith(1, 'left', 2)
    expect(store.moveHorizontal).toHaveBeenNthCalledWith(2, 'right', 2)
    expect(left.preventDefault).toHaveBeenCalledOnce()
    expect(right.preventDefault).toHaveBeenCalledOnce()
    expect(store.endTextSession).not.toHaveBeenCalled()
  })

  it('ends the text session instead of moving when text is selected', () => {
    const store = createStore()
    vi.mocked(store.moveHorizontal).mockReturnValue(true)
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(0, 4)
    const { handle } = handler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, 'ArrowLeft'))

    expect(store.moveHorizontal).not.toHaveBeenCalled()
    expect(store.endTextSession).toHaveBeenCalledOnce()
  })
})
