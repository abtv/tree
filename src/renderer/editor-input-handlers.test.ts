// @vitest-environment jsdom

import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import type { VimKeyboardState } from './editor-input-handlers'

function createStore(): EditorStore {
  return {
    createChild: vi.fn(() => true),
    createChildWithText: vi.fn(),
    copy: vi.fn(async () => true),
    createSiblingOrFirstChild: vi.fn(),
    createSibling: vi.fn(() => true),
    cut: vi.fn(async () => true),
    deleteEmptySelected: vi.fn(),
    deleteLink: vi.fn(() => false),
    deleteSelected: vi.fn(() => true),
    endTextSession: vi.fn(),
    enter: vi.fn(),
    leave: vi.fn(),
    moveHorizontal: vi.fn(() => false),
    moveSelection: vi.fn(),
    paste: vi.fn(async () => {}),
    pasteSubtree: vi.fn(() => true),
    pasteNodeForest: vi.fn(() => true),
    redo: vi.fn(),
    replaceTextRange: vi.fn(),
    reportError: vi.fn(),
    undo: vi.fn(),
    getSnapshot: vi.fn(() => ({
      status: 'ready',
      location: { currentParentId: null, selectedNodeId: 'node' },
    })),
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
  const onPreviewAttachment = vi.fn()
  const vim: VimKeyboardState = {
    mode,
    register: { current: { kind: 'empty' } },
    lastFind: { current: undefined },
    pending: { current: undefined },
    lastChange: { current: undefined },
    beginInsert: vi.fn(),
    finishInsert: vi.fn(),
    visualAnchor: { current: undefined },
    visualFocus: { current: undefined },
    imageTextCursor: { current: undefined },
    moveBoundary: vi.fn(),
    moveViewport: vi.fn(),
    setMode: vi.fn((next) => {
      vim.mode = next
    }),
    openAttachment: onPreviewAttachment,
    setImageCaret: vi.fn(),
    scheduleCaret: vi.fn(),
  }
  return {
    vim,
    handle: createEditorKeyDownHandler({
      store,
      node,
      isComposing: () => false,
      setSelectAllNodeId: vi.fn(),
      onPreviewAttachment,
      vim,
    }),
    onPreviewAttachment,
  }
}

describe('editor keyboard handler', () => {
  it('uses word and bracket text objects with operators and character Visual mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'one (two three)'
    input.setSelectionRange(6, 6)
    const { handle, vim } = vimHandler(store, { id: 'node', text: input.value, children: [] })
    handle(keyEvent(input, 'd'))
    handle(keyEvent(input, 'i'))
    handle(keyEvent(input, 'w'))
    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 5, 8, '')
    expect(vim.register.current).toEqual({ kind: 'text', value: 'two' })

    input.setSelectionRange(6, 6)
    handle(keyEvent(input, 'v'))
    const visualHandle = createEditorKeyDownHandler({
      store,
      node: { id: 'node', text: input.value, children: [] },
      isComposing: () => false,
      setSelectAllNodeId: vi.fn(),
      onPreviewAttachment: vi.fn(),
      vim,
    })
    visualHandle(keyEvent(input, 'i'))
    visualHandle(keyEvent(input, '('))
    expect(input.selectionStart).toBe(5)
    expect(input.selectionEnd).toBe(14)
  })

  it('routes whole-node Visual commands and leaves the parent heading unavailable', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'node'
    input.setSelectionRange(2, 2)
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'node', children: [] })
    const enter = vi.fn(() => true)
    const move = vi.fn()
    const command = vi.fn()
    vim.nodeVisual = { enter, move, command, swap: vi.fn(), exit: vi.fn() }
    handle(keyEvent(input, 'V'))
    expect(enter).toHaveBeenCalledWith('node')
    expect(vim.mode).toBe('visual-node')
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(2)
    handle(keyEvent(input, 'j'))
    handle(keyEvent(input, 'd'))
    expect(move).toHaveBeenCalledWith('down')
    expect(command).toHaveBeenCalledWith('d')
  })

  it('handles whole-node Visual boundaries, endpoint exchange, mutation keys, and exit', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'node'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'node', children: [] }, 'visual-node')
    const move = vi.fn()
    const swap = vi.fn()
    const exit = vi.fn()
    const command = vi.fn()
    vim.nodeVisual = { enter: vi.fn(() => true), move, swap, exit, command }
    handle(keyEvent(input, 'G'))
    handle(keyEvent(input, 'g'))
    handle(keyEvent(input, 'g'))
    handle(keyEvent(input, 'o'))
    handle(keyEvent(input, 'c'))
    handle(keyEvent(input, 's'))
    handle(keyEvent(input, 'u'))
    handle(keyEvent(input, 'U'))
    handle(keyEvent(input, 'p'))
    handle(keyEvent(input, 'P'))
    expect(move.mock.calls).toEqual([['last'], ['first']])
    expect(swap).toHaveBeenCalledOnce()
    expect(command.mock.calls.map(([key]) => key)).toEqual(['c', 's', 'u', 'U', 'p', 'P'])
    handle(keyEvent(input, 'Escape'))
    expect(exit).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('normal')
  })

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

  it('applies a navigation count before the next command', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abcd'
    input.setSelectionRange(0, 0)
    const { handle } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    handle(keyEvent(input, '2'))
    handle(keyEvent(input, 'j'))
    handle(keyEvent(input, 'l'))

    expect(store.moveSelection).toHaveBeenNthCalledWith(1, 'down', 0)
    expect(store.moveSelection).toHaveBeenNthCalledWith(2, 'down', 0)
    expect(input.selectionStart).toBe(1)
  })

  it('activates an attached parent image when k moves up from the first child', () => {
    const store = createStore()
    vi.mocked(store.getSnapshot).mockReturnValue({
      status: 'ready',
      document: {
        roots: [
          {
            id: 'parent',
            text: 'Parent',
            attachment: { id: 'image', mimeType: 'image/png' },
            children: [{ id: 'child', text: 'Child', children: [] }],
          },
        ],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'parent' },
    } as never)
    const input = document.createElement('textarea')
    input.value = 'Child'
    input.setSelectionRange(4, 5)
    const { handle, vim } = vimHandler(store, { id: 'child', text: input.value, children: [] })

    handle(keyEvent(input, 'k'))

    expect(store.moveSelection).toHaveBeenCalledWith('up', 4)
    expect(vim.setImageCaret).toHaveBeenLastCalledWith('parent', true)
  })

  it('moves from an active parent image to its text with k', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'Parent'
    input.setSelectionRange(4, 5)
    input.classList.add('node-input-image-caret')
    const { handle, vim } = vimHandler(store, {
      id: 'parent',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, 'k'))

    expect(input.selectionStart).toBe(5)
    expect(input.selectionEnd).toBe(6)
    expect(vim.setImageCaret).toHaveBeenLastCalledWith('parent', false)
  })

  it('restores the text position after moving from text to an image and back', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'Parent'
    input.setSelectionRange(2, 3)
    input.classList.add('node-input-image-caret')
    const { handle, vim } = vimHandler(store, {
      id: 'parent',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })
    vim.imageTextCursor!.current = 2

    handle(keyEvent(input, 'k'))

    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(3)
    expect(vim.setImageCaret).toHaveBeenLastCalledWith('parent', false)
  })

  it('applies the remaining h count after restoring the text position from an image', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abcd'
    input.setSelectionRange(4, 4)
    input.classList.add('node-input-image-caret')
    const { handle, vim } = vimHandler(store, {
      id: 'node',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })
    vim.imageTextCursor!.current = 1

    handle(keyEvent(input, '2'))
    handle(keyEvent(input, 'h'))

    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(1)
  })

  it('does not leave the last node image when j reaches the boundary', () => {
    const store = createStore()
    vi.mocked(store.getSnapshot).mockReturnValue({
      status: 'ready',
      document: {
        roots: [{ id: 'node', text: 'Last', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'node' },
    } as never)
    const input = document.createElement('textarea')
    input.value = 'Last'
    input.setSelectionRange(4, 4)
    input.classList.add('node-input-image-caret')
    const { handle, vim } = vimHandler(store, {
      id: 'node',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })
    vim.imageTextCursor!.current = 1

    handle(keyEvent(input, 'j'))

    expect(store.moveSelection).not.toHaveBeenCalled()
    expect(vim.imageTextCursor!.current).toBe(1)
    expect(vim.setImageCaret).toHaveBeenLastCalledWith('node', true)
  })

  it('keeps an image caret on a current-parent heading with no child', () => {
    const store = createStore()
    vi.mocked(store.getSnapshot).mockReturnValue({
      status: 'ready',
      document: {
        roots: [{ id: 'parent', text: 'Parent', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'parent' },
    } as never)
    const input = document.createElement('textarea')
    input.value = 'Parent'
    input.setSelectionRange(6, 6)
    input.classList.add('node-input-image-caret')
    const { handle, vim } = vimHandler(store, {
      id: 'parent',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, 'j'))

    expect(store.moveSelection).not.toHaveBeenCalled()
    expect(vim.setImageCaret).toHaveBeenLastCalledWith('parent', true)
  })

  it('does not reactivate the image when k reaches the current-parent text boundary', () => {
    const store = createStore()
    vi.mocked(store.getSnapshot).mockReturnValue({
      status: 'ready',
      document: {
        roots: [
          {
            id: 'parent',
            text: 'Parent',
            attachment: { id: 'image', mimeType: 'image/png' },
            children: [],
          },
        ],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'parent' },
    } as never)
    const input = document.createElement('textarea')
    input.value = 'Parent'
    input.setSelectionRange(5, 6)
    const { handle, vim } = vimHandler(store, {
      id: 'parent',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, 'k'))

    expect(vim.setImageCaret).toHaveBeenLastCalledWith('parent', false)
  })

  it('opens a new child with Normal-mode o and enters Insert mode', () => {
    const store = createStore()
    vi.mocked(store.getSnapshot).mockReturnValue({
      status: 'ready',
      location: { currentParentId: 'node', selectedNodeId: 'node' },
    } as never)
    const input = document.createElement('textarea')
    input.value = 'Parent'
    input.setSelectionRange(2, 2)
    const { handle, vim } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    const event = keyEvent(input, 'o')
    handle(event)

    expect(store.createChild).toHaveBeenCalledOnce()
    expect(store.createSibling).not.toHaveBeenCalled()
    expect(vim.mode).toBe('insert')
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('uses counts and text operators without deleting the node', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'one two three'
    input.setSelectionRange(0, 0)
    const { handle, vim } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    for (const key of ['2', 'd', 'w']) handle(keyEvent(input, key))

    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 0, 8, '')
    expect(store.deleteSelected).not.toHaveBeenCalled()
    expect(vim.register.current).toEqual({ kind: 'text', value: 'one two ' })
    expect(vim.lastChange?.current).toEqual({ kind: 'delete', motion: 'w', count: 2 })
  })

  it('changes the current word and enters Insert mode with a text baseline', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'one two'
    input.setSelectionRange(0, 0)
    const { handle, vim } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    for (const key of ['c', 'w']) handle(keyEvent(input, key))

    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 0, 3, '')
    expect(vim.register.current).toEqual({ kind: 'text', value: 'one' })
    expect(vim.beginInsert).toHaveBeenCalledWith('node', ' two', 0, { kind: 'change', motion: 'w', count: 1 })
    expect(vim.mode).toBe('insert')
  })

  it('supports end-of-node edits and yank without touching the subtree', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'one two'
    input.setSelectionRange(4, 4)
    const node: TreeNode = { id: 'node', text: input.value, children: [{ id: 'child', text: 'Child', children: [] }] }
    const first = vimHandler(store, node)
    for (const key of ['y', 'w']) first.handle(keyEvent(input, key))
    expect(first.vim.register.current).toEqual({ kind: 'text', value: 'two' })
    first.handle(keyEvent(input, 'D'))
    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 4, 7, '')
    expect(store.deleteSelected).not.toHaveBeenCalled()
  })

  it('finds characters and replaces a counted run', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'a.b.c'
    input.setSelectionRange(0, 0)
    const { handle } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    for (const key of ['2', 'f', '.']) handle(keyEvent(input, key))
    expect(input.selectionStart).toBe(3)
    for (const key of ['2', 'r', 'X']) handle(keyEvent(input, key))
    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 3, 5, 'XX')
  })

  it('handles backward and until searches and keeps failed searches stationary', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'a.b.c'
    input.setSelectionRange(0, 0)
    const { handle } = vimHandler(store, { id: 'node', text: input.value, children: [] })
    for (const key of ['t', 'c']) handle(keyEvent(input, key))
    expect(input.selectionStart).toBe(3)
    for (const key of ['T', 'a']) handle(keyEvent(input, key))
    expect(input.selectionStart).toBe(1)
    for (const key of ['f', 'z']) handle(keyEvent(input, key))
    expect(input.selectionStart).toBe(1)
  })

  it('applies backward h operators and inclusive adjacent t ranges', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abc'
    input.setSelectionRange(1, 1)
    const first = vimHandler(store, { id: 'node', text: 'abc', children: [] })
    for (const key of ['d', 'h']) first.handle(keyEvent(input, key))
    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 0, 1, '')

    const second = vimHandler(store, { id: 'node', text: 'abc', children: [] })
    for (const key of ['c', 'h']) second.handle(keyEvent(input, key))
    expect(second.vim.mode).toBe('insert')
    expect(second.vim.beginInsert).toHaveBeenCalledWith('node', 'bc', 0, {
      kind: 'change',
      motion: 'h',
      count: 1,
    })

    input.value = 'aXb'
    input.setSelectionRange(0, 0)
    const third = vimHandler(store, { id: 'node', text: 'aXb', children: [] })
    for (const key of ['d', 't', 'X']) third.handle(keyEvent(input, key))
    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 0, 1, '')
  })

  it('applies inclusive end-of-text deletion and leaves a final character available to change', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abc def'
    input.setSelectionRange(4, 4)
    const { handle, vim } = vimHandler(store, { id: 'node', text: input.value, children: [] })
    for (const key of ['d', '$']) handle(keyEvent(input, key))
    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 4, 7, '')
    expect(vim.register.current).toEqual({ kind: 'text', value: 'def' })
  })

  it('bounds a very large motion count by reaching the end of a short node', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'one two'
    input.setSelectionRange(0, 0)
    const { handle } = vimHandler(store, { id: 'node', text: input.value, children: [] })
    for (const key of '999999999w') handle(keyEvent(input, key))
    expect(input.selectionStart).toBe(6)
  })

  it('repeats the last text edit at the current caret without replacing it on yank', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'one two three'
    input.setSelectionRange(0, 0)
    const { handle, vim } = vimHandler(store, { id: 'node', text: input.value, children: [] })
    for (const key of ['d', 'w']) handle(keyEvent(input, key))
    input.setSelectionRange(4, 4)
    for (const key of ['y', 'w', '.']) handle(keyEvent(input, key))

    expect(store.replaceTextRange).toHaveBeenNthCalledWith(2, 'node', 4, 8, '')
    expect(vim.lastChange?.current).toEqual({ kind: 'delete', motion: 'w', count: 1 })
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

  it('opens a sibling below with o and above with O', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'texted'
    input.setSelectionRange(2, 2)
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    const below = keyEvent(input, 'o')
    handle(below)
    expect(store.createChild).not.toHaveBeenCalled()
    expect(store.createSibling).toHaveBeenNthCalledWith(1, 'after')
    expect(vim.mode).toBe('insert')
    expect(below.preventDefault).toHaveBeenCalledOnce()

    vim.mode = 'normal'
    const above = keyEvent(input, 'O')
    handle(above)
    expect(store.createSibling).toHaveBeenCalledWith('before')
    expect(vim.mode).toBe('insert')
    expect(above.preventDefault).toHaveBeenCalledOnce()
  })

  it('does nothing when O is pressed on the current-parent heading', () => {
    const store = createStore()
    vi.mocked(store.getSnapshot).mockReturnValue({
      status: 'ready',
      location: { currentParentId: 'parent', selectedNodeId: 'parent' },
    } as never)
    const input = document.createElement('textarea')
    const { handle, vim } = vimHandler(store, { id: 'parent', text: 'Parent', children: [] })

    const event = keyEvent(input, 'O')
    handle(event)

    expect(store.createSibling).not.toHaveBeenCalled()
    expect(vim.mode).toBe('normal')
    expect(event.preventDefault).toHaveBeenCalledOnce()
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

  it('applies counts to node motions and G', () => {
    const store = createStore()
    vi.mocked(store.getSnapshot).mockReturnValue({
      status: 'ready',
      document: {
        roots: [
          {
            id: 'parent',
            text: 'parent',
            children: Array.from({ length: 12 }, (_, index) => ({
              id: index === 0 ? 'node' : `node-${index}`,
              text: 'text',
              children: [],
            })),
          },
        ],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'node' },
    } as never)
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, '3'))
    handle(keyEvent(input, 'j'))
    expect(store.moveSelection).toHaveBeenCalledTimes(3)
    handle(keyEvent(input, '5'))
    handle(keyEvent(input, 'k'))
    expect(store.moveSelection).toHaveBeenCalledTimes(8)
    handle(keyEvent(input, '1'))
    handle(keyEvent(input, '0'))
    handle(keyEvent(input, 'G'))
    expect(vim.moveBoundary).toHaveBeenLastCalledWith('last', 4, 10)
  })

  it('yanks, deletes, and puts counted sibling subtrees', () => {
    const store = createStore()
    const treeDocument = {
      roots: [
        {
          id: 'root',
          text: 'Root',
          children: [
            { id: 'first', text: 'First', children: [] },
            { id: 'second', text: 'Second', children: [] },
          ],
        },
      ],
    }
    vi.mocked(store.getSnapshot).mockReturnValue({
      status: 'ready',
      document: treeDocument,
      location: { currentParentId: 'root', selectedNodeId: 'first' },
    } as never)
    const input = document.createElement('textarea')
    input.value = 'First'
    const node: TreeNode = treeDocument.roots[0]!.children[0]!
    const { handle, vim } = vimHandler(store, node)

    handle(keyEvent(input, '2'))
    handle(keyEvent(input, 'y'))
    handle(keyEvent(input, 'y'))
    expect(vim.register.current).toEqual({
      kind: 'nodes',
      value: { nodes: [node, treeDocument.roots[0]!.children[1]], sourceIds: ['first', 'second'] },
    })

    handle(keyEvent(input, '3'))
    handle(keyEvent(input, 'p'))
    expect(store.pasteNodeForest).toHaveBeenCalledTimes(3)

    const deleteStore = createStore()
    vi.mocked(deleteStore.getSnapshot).mockReturnValue({
      status: 'ready',
      document: treeDocument,
      location: { currentParentId: 'root', selectedNodeId: 'first' },
    } as never)
    const deleteInput = document.createElement('textarea')
    deleteInput.value = 'First'
    const deleteHandler = vimHandler(deleteStore, node)
    deleteHandler.handle(keyEvent(deleteInput, '3'))
    deleteHandler.handle(keyEvent(deleteInput, 'd'))
    deleteHandler.handle(keyEvent(deleteInput, 'd'))
    expect(deleteStore.deleteSelected).toHaveBeenCalledTimes(2)
    expect(deleteHandler.vim.register.current.kind).toBe('nodes')
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

    expect(vim.register.current).toEqual({ kind: 'node', value: node, sourceIds: ['node'] })
    expect(vim.register.current).not.toBe(node)
    const subtree = vim.register.current.kind === 'node' ? vim.register.current.value : undefined

    handle(keyEvent(input, 'p'))
    expect(store.pasteSubtree).toHaveBeenCalledWith('node', 'after', subtree, ['node'])
    handle(keyEvent(input, 'P'))
    expect(store.pasteSubtree).toHaveBeenCalledWith('node', 'before', subtree, ['node'])
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
    vi.mocked(store.getSnapshot).mockReturnValue({
      status: 'ready',
      document: {
        roots: [
          {
            id: 'parent',
            text: 'parent',
            children: Array.from({ length: 12 }, (_, index) => ({
              id: index === 0 ? 'node' : `node-${index}`,
              text: 'text',
              children: [],
            })),
          },
        ],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'node' },
    } as never)
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, 'g'))
    handle(keyEvent(input, 'g'))
    handle(keyEvent(input, 'G'))

    expect(vim.moveBoundary).toHaveBeenNthCalledWith(1, 'parent', 4)
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

  it('keeps the caret in place when Replace mode ends without a change', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abcd'
    input.setSelectionRange(2, 2)
    const { handle, vim } = vimHandler(store, { id: 'node', text: input.value, children: [] }, 'replace')
    vim.finishReplace = vi.fn(() => false)

    handle(keyEvent(input, 'Escape'))

    expect(vim.mode).toBe('normal')
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(3)
  })

  it('supports WORD and backward word-end motions with operators', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'foo.bar  baz qux'
    input.setSelectionRange(0, 0)
    const { handle } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    handle(keyEvent(input, 'W'))
    expect(input.selectionStart).toBe(9)
    handle(keyEvent(input, 'E'))
    expect(input.selectionStart).toBe(11)
    for (const key of ['g', 'e']) handle(keyEvent(input, key))
    expect(input.selectionStart).toBe(6)
    for (const key of ['d', 'W']) handle(keyEvent(input, key))
    expect(store.replaceTextRange).toHaveBeenCalledWith('node', 6, 9, '')
  })

  it('repeats and reverses the latest character find', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'a.b.c'
    input.setSelectionRange(0, 0)
    const { handle, vim } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    for (const key of ['f', '.', ';']) handle(keyEvent(input, key))
    expect(input.selectionStart).toBe(3)
    handle(keyEvent(input, ','))
    expect(input.selectionStart).toBe(1)
    expect(vim.lastFind.current).toEqual({ kind: 'f', character: '.' })
  })

  it('changes the whole node with cc and S without deleting its subtree', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'parent'
    const node: TreeNode = { id: 'node', text: 'parent', children: [{ id: 'child', text: 'child', children: [] }] }
    const first = vimHandler(store, node)
    for (const key of ['c', 'c']) first.handle(keyEvent(input, key))
    expect(store.replaceTextRange).toHaveBeenLastCalledWith('node', 0, 6, '')
    expect(store.deleteSelected).not.toHaveBeenCalled()
    expect(first.vim.mode).toBe('insert')

    const second = vimHandler(store, node)
    second.handle(keyEvent(input, 'S'))
    expect(second.vim.mode).toBe('insert')
  })

  it('deletes backward with X, toggles case, and repeats a text register with a count', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'aBcD'
    input.setSelectionRange(3, 3)
    const { handle, vim } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    for (const key of ['2', 'X']) handle(keyEvent(input, key))
    expect(store.replaceTextRange).toHaveBeenLastCalledWith('node', 1, 3, '')

    input.setSelectionRange(0, 0)
    for (const key of ['3', '~']) handle(keyEvent(input, key))
    expect(store.replaceTextRange).toHaveBeenLastCalledWith('node', 0, 3, 'AbC')

    vim.register.current = { kind: 'text', value: 'xy' }
    input.setSelectionRange(1, 1)
    for (const key of ['3', 'p']) handle(keyEvent(input, key))
    expect(store.replaceTextRange).toHaveBeenLastCalledWith('node', 2, 2, 'xyxyxy')
  })

  it('completes Visual editing, endpoint exchange, case, and text replacement', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'AbCd'
    input.setSelectionRange(0, 2)
    const { handle, vim } = vimHandler(store, { id: 'node', text: input.value, children: [] }, 'visual')
    vim.visualAnchor.current = 0
    vim.visualFocus.current = 1

    handle(keyEvent(input, 'o'))
    expect(vim.visualAnchor.current).toBe(1)
    expect(vim.visualFocus.current).toBe(0)
    handle(keyEvent(input, 'u'))
    expect(store.replaceTextRange).toHaveBeenLastCalledWith('node', 0, 2, 'ab')
    expect(vim.mode).toBe('normal')

    const change = vimHandler(store, { id: 'node', text: input.value, children: [] }, 'visual')
    input.setSelectionRange(1, 3)
    change.handle(keyEvent(input, 'c'))
    expect(store.replaceTextRange).toHaveBeenLastCalledWith('node', 1, 3, '')
    expect(change.vim.mode).toBe('insert')

    const put = vimHandler(store, { id: 'node', text: input.value, children: [] }, 'visual')
    put.vim.register.current = { kind: 'text', value: 'ZZ' }
    input.setSelectionRange(1, 3)
    put.handle(keyEvent(input, 'p'))
    expect(store.replaceTextRange).toHaveBeenLastCalledWith('node', 1, 3, 'ZZ')
    expect(put.vim.register.current).toEqual({ kind: 'text', value: 'ZZ' })
    expect(put.vim.mode).toBe('normal')
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
      text: 'texted',
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

  it('selects all linked content and leaves Backspace to native character editing', async () => {
    const store = createStore()
    const input = document.createElement('div')
    input.innerHTML = '<a href="https://example.test">link</a>'
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
    expect(store.deleteLink).not.toHaveBeenCalled()
    expect(deleteEvent.preventDefault).not.toHaveBeenCalled()
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

  it('moves onto an attached image with l, back to text with h, and opens it with Enter', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'texted'
    input.setSelectionRange(1, 2)
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    row.append(input, document.createElement('button'))
    document.body.append(row)
    const node = {
      id: 'node',
      text: 'texted',
      attachment: { id: 'image', mimeType: 'image/png' as const },
      children: [],
    }
    const { handle, onPreviewAttachment, vim } = vimHandler(store, node)

    handle(keyEvent(input, '3'))
    handle(keyEvent(input, 'l'))
    handle(keyEvent(input, 'l'))
    handle(keyEvent(input, 'l'))
    expect(input.selectionStart).toBe(6)
    expect(input.selectionEnd).toBe(6)
    expect(vim.setImageCaret).toHaveBeenCalledWith('node', true)

    const enter = keyEvent(input, 'Enter')
    handle(enter)
    expect(onPreviewAttachment).toHaveBeenCalledOnce()
    expect(onPreviewAttachment).toHaveBeenCalledWith('image')
    expect(store.createSiblingOrFirstChild).not.toHaveBeenCalled()
    expect(enter.preventDefault).toHaveBeenCalledOnce()

    handle(keyEvent(input, 'h'))
    expect(input.selectionStart).toBe(5)
    expect(input.selectionEnd).toBe(6)
    expect(vim.setImageCaret).toHaveBeenLastCalledWith('node', false)
    row.remove()
  })

  it('restores the saved text position when h exits an image entered with j', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(1, 2)
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    row.append(input)
    document.body.append(row)
    const node = {
      id: 'node',
      text: 'text',
      attachment: { id: 'image', mimeType: 'image/png' as const },
      children: [],
    }
    const { handle, vim } = vimHandler(store, node)

    handle(keyEvent(input, 'j'))
    input.classList.add('node-input-image-caret')
    handle(keyEvent(input, 'h'))

    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(2)
    expect(vim.setImageCaret).toHaveBeenLastCalledWith('node', false)
    row.remove()
  })

  it('uses j and k to move between text and an attached image before changing nodes', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(1, 1)
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    row.append(input)
    document.body.append(row)
    const node = {
      id: 'node',
      text: 'text',
      attachment: { id: 'image', mimeType: 'image/png' as const },
      children: [],
    }
    const { handle, vim } = vimHandler(store, node)

    handle(keyEvent(input, 'j'))
    expect(input.selectionStart).toBe(4)
    expect(store.moveSelection).not.toHaveBeenCalled()
    expect(vim.setImageCaret).toHaveBeenLastCalledWith('node', true)

    handle(keyEvent(input, 'k'))
    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(2)
    expect(store.moveSelection).not.toHaveBeenCalled()
    expect(vim.setImageCaret).toHaveBeenLastCalledWith('node', false)
    row.remove()
  })

  it('keeps j on an image at the default next-node motion and uses k for an image-only previous node', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(4, 4)
    const { handle, vim } = vimHandler(store, {
      id: 'node',
      text: 'text',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, 'j'))
    expect(store.moveSelection).toHaveBeenCalledWith('down', 4)

    const imageOnly = {
      id: 'image-only',
      text: '',
      attachment: { id: 'image', mimeType: 'image/png' as const },
      children: [],
    }
    const imageOnlyInput = document.createElement('textarea')
    const imageOnlyHandler = vimHandler(store, imageOnly)
    imageOnlyHandler.handle(keyEvent(imageOnlyInput, 'k'))
    expect(store.moveSelection).toHaveBeenLastCalledWith('up', 0)
    expect(vim.setImageCaret).toHaveBeenCalled()
  })

  it('starts the next node at its text caret when j leaves an active image', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'Root'
    input.setSelectionRange(3, 3)
    input.classList.add('node-input-image-caret')
    const { handle } = vimHandler(store, {
      id: 'root-image',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, 'j'))

    expect(store.moveSelection).toHaveBeenCalledWith('down', 0)
  })

  it('opens an image-only node from its sole Normal-mode character', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    row.append(input, document.createElement('button'))
    document.body.append(row)
    const { handle, onPreviewAttachment } = vimHandler(store, {
      id: 'empty-image',
      text: '',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, 'Enter'))

    expect(onPreviewAttachment).toHaveBeenCalledWith('image')
    expect(store.createSiblingOrFirstChild).not.toHaveBeenCalled()
    row.remove()
  })

  it('opens the hyperlink under the Normal-mode caret with Enter', () => {
    const store = createStore()
    const url = 'https://example.test'
    const text = `A${url}B`
    const links = [{ start: 1, end: 1 + url.length, url }]
    const input = document.createElement('textarea')
    input.value = text
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    const firstChar = keyEvent(input, 'Enter')
    input.setSelectionRange(1, 1)
    vimHandler(store, { id: 'node', text, links, children: [] }).handle(firstChar)
    expect(open).toHaveBeenCalledWith(url, '_blank')
    expect(firstChar.preventDefault).toHaveBeenCalledOnce()

    open.mockClear()
    const lastChar = keyEvent(input, 'Enter')
    input.setSelectionRange(url.length, url.length)
    vimHandler(store, { id: 'node', text, links, children: [] }).handle(lastChar)
    expect(open).toHaveBeenCalledWith(url, '_blank')

    open.mockRestore()
  })

  it('does nothing on Enter when the Normal-mode caret is adjacent to but outside a hyperlink', () => {
    const store = createStore()
    const url = 'https://example.test'
    const text = `A${url}B`
    const links = [{ start: 1, end: 1 + url.length, url }]
    const input = document.createElement('textarea')
    input.value = text
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    input.setSelectionRange(0, 0)
    vimHandler(store, { id: 'node', text, links, children: [] }).handle(keyEvent(input, 'Enter'))
    input.setSelectionRange(1 + url.length, 1 + url.length)
    vimHandler(store, { id: 'node', text, links, children: [] }).handle(keyEvent(input, 'Enter'))

    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('does nothing on Enter when the node has no links', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'plain text'
    input.setSelectionRange(2, 2)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { handle } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    handle(keyEvent(input, 'Enter'))

    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('discards a pending count and does not open the link on Enter', () => {
    const store = createStore()
    const url = 'https://example.test'
    const text = `A${url}B`
    const links = [{ start: 1, end: 1 + url.length, url }]
    const input = document.createElement('textarea')
    input.value = text
    input.setSelectionRange(1, 1)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { handle, vim } = vimHandler(store, { id: 'node', text, links, children: [] })
    vim.pending.current = { count: '3', motionCount: '' }

    handle(keyEvent(input, 'Enter'))

    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('leaves Enter as a no-op over a hyperlink in character Visual mode', () => {
    const store = createStore()
    const url = 'https://example.test'
    const text = `A${url}B`
    const links = [{ start: 1, end: 1 + url.length, url }]
    const input = document.createElement('textarea')
    input.value = text
    input.setSelectionRange(1, 2)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { handle } = vimHandler(store, { id: 'node', text, links, children: [] }, 'visual')

    handle(keyEvent(input, 'Enter'))

    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
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
