// @vitest-environment jsdom

import type { KeyboardEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { createEditorKeyDownHandler, executeEditorContextMenuCommand } from './editor-input-handlers'
import type { VimKeyboardState, VimPendingCommand, VimTextCommandState } from './editor-input-handlers'
import { createEditorStoreDouble } from './test/editor-store-double'
import { createRealStoreHarness } from './test/real-store-harness'
import type { RealStoreOptions } from './test/real-store-harness'
import { createVimKeyboardDouble } from './test/vim-keyboard-double'
import type { VimCaretState } from './vim-caret-transition'
import { clearPending } from './vim-command-state'
import { setNormalCaret } from './editor-dom'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

function createStore(): EditorStore {
  return createEditorStoreDouble({
    snapshot: {
      status: 'ready',
      location: { currentParentId: null, selectedNodeId: 'node' },
    },
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
  })
}

function keyEvent(
  input: HTMLElement,
  key: string,
  options: {
    altKey?: boolean
    ctrlKey?: boolean
    metaKey?: boolean
    shiftKey?: boolean
    isComposing?: boolean
    repeat?: boolean
  } = {},
) {
  return {
    currentTarget: input,
    key,
    altKey: options.altKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    repeat: options.repeat ?? false,
    nativeEvent: { isComposing: options.isComposing ?? false },
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

function vimHandler(
  store: EditorStore,
  node: TreeNode,
  mode: VimKeyboardState['mode'] = 'normal',
  isComposing: () => boolean = () => false,
) {
  const onPreviewAttachment = vi.fn()
  const double = createVimKeyboardDouble(node.id, { mode, onPreviewAttachment })
  const { vim } = double
  let currentInput: HTMLElement | undefined
  const publish = vim.applyCaretState
  vim.applyCaretState = vi.fn((id, caret, fromFocus, timing) => {
    publish(id, caret, fromFocus, timing)
    if (currentInput !== undefined && timing !== 'preserve-selection') setNormalCaret(currentInput, caret.cursor)
  })
  const handle = createEditorKeyDownHandler({
    store,
    node,
    isComposing,
    setSelectAllNodeId: vi.fn(),
    onPreviewAttachment,
    vim,
  })
  return {
    vim,
    caret: double.caret,
    caretNodeId: double.caretNodeId,
    commandState: double.commandState,
    handle: (event: KeyboardEvent<HTMLElement>) => {
      currentInput = event.currentTarget
      handle(event)
    },
    onPreviewAttachment,
  }
}

async function textFixture(node: TreeNode, mode: VimKeyboardState['mode'] = 'normal', options: RealStoreOptions = {}) {
  const harness = await createRealStoreHarness({ document: { roots: [node] }, ...options })
  const input = document.createElement('textarea')
  input.value = node.text
  const keyboard = vimHandler(harness.store, harness.node(), mode)
  const caretRequests: number[] = []
  const publish = keyboard.vim.applyCaretState
  keyboard.vim.applyCaretState = vi.fn((id, caret, fromFocus, timing) => {
    publish(id, caret, fromFocus, timing)
    if (timing === 'after-edit') caretRequests.push(caret.cursor)
    if (timing !== 'preserve-selection') {
      input.value = harness.node().text
      setNormalCaret(input, caret.cursor)
    }
  })
  keyboard.vim.scheduleCaret = (_input, cursor) => {
    caretRequests.push(cursor)
  }
  const dispatch = (key: string, options: Parameters<typeof keyEvent>[2] = {}) => {
    const handle = createEditorKeyDownHandler({
      store: harness.store,
      node: harness.node(),
      isComposing: () => false,
      setSelectAllNodeId: vi.fn(),
      onPreviewAttachment: vi.fn(),
      vim: keyboard.vim,
    })
    const event = keyEvent(input, key, options)
    handle(event)
    const cursor = input.selectionStart
    if (input.value !== harness.node().text) {
      input.value = harness.node().text
      input.setSelectionRange(cursor, cursor)
    }
    return event
  }
  const press = (...keys: string[]) => {
    const events: KeyboardEvent<HTMLElement>[] = []
    for (const key of keys) {
      events.push(dispatch(key))
    }
    return events
  }
  return { ...harness, ...keyboard, input, press, dispatch, caretRequests }
}

async function pendingReplaceFixture() {
  const fixture = await textFixture({ id: 'node', text: 'abcd', children: [] }, 'replace')
  fixture.input.value = 'abXd'
  // The session owner's callback is the handler's seam. Commit a known buffered edit here;
  // clipboard and history outcomes then prove that dispatch happened after this callback.
  fixture.vim.finishReplace = vi.fn(() => {
    fixture.store.replaceTextRange('node', 2, 3, 'X')
    return true
  })
  return fixture
}

/**
 * The image caret is owned by the caret authority, so assert the authority's resulting state rather
 * than the `setImageCaret` call that the pre-owner wiring used to emit. `fromFocus` is still a call
 * detail, so tests that care about it assert on `applyCaretState` directly.
 */
function expectImageCaret(
  caretNodeId: () => string | undefined,
  caret: () => VimCaretState,
  nodeId: string,
  active: boolean,
): void {
  expect(caretNodeId()).toBe(nodeId)
  expect(caret().imageActive).toBe(active)
}

describe('editor keyboard handler', () => {
  it('uses word and bracket text objects with operators and character Visual mode', async () => {
    const { store, node, input, press, vim } = await textFixture({ id: 'node', text: 'one (two three)', children: [] })
    input.setSelectionRange(6, 6)
    press('d', 'i', 'w')
    expect(node().text).toBe('one ( three)')
    expect(vim.register.current).toEqual({ kind: 'text', value: 'two' })
    store.undo()
    expect(node().text).toBe('one (two three)')
    input.value = node().text
    input.setSelectionRange(6, 6)
    press('v', 'i', '(')
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
    vim.nodeVisual = { enter, move, command, swap: vi.fn(), exit: vi.fn(), shift: vi.fn() }
    handle(keyEvent(input, 'V'))
    expect(enter).toHaveBeenCalledWith('node')
    expect(vim.mode).toBe('visual-node')
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(2)
    handle(keyEvent(input, 'j'))
    handle(keyEvent(input, 'd'))
    expect(move).toHaveBeenCalledWith('down', 1)
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
    vim.nodeVisual = { enter: vi.fn(() => true), move, swap, exit, command, shift: vi.fn() }
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
    expect(vim.syncImageCaretToFocus).toHaveBeenCalledOnce()
  })

  it('routes whole-node Visual > and < with a count, and discards a count or prefix for anything else', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'node'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'node', children: [] }, 'visual-node')
    const shift = vi.fn()
    const move = vi.fn()
    vim.nodeVisual = { enter: vi.fn(() => true), move, swap: vi.fn(), exit: vi.fn(), command: vi.fn(), shift }
    const press = (key: string): ReturnType<typeof keyEvent> => {
      const event = keyEvent(input, key)
      handle(event)
      return event
    }

    const plain = press('>')
    expect(plain.preventDefault).toHaveBeenCalledOnce()
    press('<')
    press('1')
    press('2')
    press('>')
    press('0')
    press('<')
    // A lone `0` is not a count digit, but `10` is.
    press('1')
    press('0')
    press('<')
    expect(shift.mock.calls).toEqual([
      ['in', 1],
      ['out', 1],
      ['in', 12],
      ['out', 1],
      ['out', 10],
    ])
    expect(vim.commandState.pending).toBeUndefined()

    // A count does not reach another command, and `g` cancels `>` instead of leaving a stale prefix.
    shift.mockClear()
    press('3')
    press('j')
    press('>')
    press('g')
    press('>')
    // `j` and `k` carry the count; `>` after `3j` sees no leftover count.
    expect(move.mock.calls).toEqual([['down', 3]])
    expect(shift.mock.calls).toEqual([['in', 1]])
    expect(vim.commandState.pending).toBeUndefined()

    move.mockClear()
    press('k')
    press('g')
    press('j')
    expect(move.mock.calls).toEqual([
      ['up', 1],
      ['down', 1],
    ])
  })

  it('routes d, y, and c with j or k to the vertical operator with the multiplied count', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'node'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'node', children: [] }, 'normal')
    const press = (...keys: string[]): void => {
      for (const key of keys) handle(keyEvent(input, key))
    }
    press('d', 'j', 'y', 'k', 'c', 'j')
    press('2', 'd', '3', 'j')
    press('d', '2', 'k')
    expect(vim.verticalOperator).toHaveBeenNthCalledWith(1, 'node', 'd', 'down', 1)
    expect(vim.verticalOperator).toHaveBeenNthCalledWith(2, 'node', 'y', 'up', 1)
    expect(vim.verticalOperator).toHaveBeenNthCalledWith(3, 'node', 'c', 'down', 1)
    expect(vim.verticalOperator).toHaveBeenNthCalledWith(4, 'node', 'd', 'down', 6)
    expect(vim.verticalOperator).toHaveBeenNthCalledWith(5, 'node', 'd', 'up', 2)
    expect(vim.commandState.pending).toBeUndefined()
    // `ys` is a surround prefix, not a vertical operator, and a plain `j` keeps navigating.
    vi.mocked(vim.verticalOperator).mockClear()
    press('y', 's', 'j')
    expect(vim.verticalOperator).not.toHaveBeenCalled()
  })

  it('moves the current subtree for character Visual > and < and keeps the selection and mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'one two'
    input.setSelectionRange(0, 3)
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'one two', children: [] }, 'visual')
    vim.commandState.visualAnchor = 0
    vim.commandState.visualFocus = 2

    const event = keyEvent(input, '>')
    handle(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    handle(keyEvent(input, '2'))
    handle(keyEvent(input, '<'))

    expect(vim.shiftCurrentNode).toHaveBeenNthCalledWith(1, 'node', 'in', 1, { start: 0, end: 3 })
    expect(vim.shiftCurrentNode).toHaveBeenNthCalledWith(2, 'node', 'out', 2, { start: 0, end: 3 })
    expect(vim.mode).toBe('visual')
    expect(vim.commandState.visualAnchor).toBe(0)
    expect(vim.commandState.visualFocus).toBe(2)
    expect(vim.commandState.pending).toBeUndefined()
  })

  it('moves and edits in Normal mode without inserting command characters', async () => {
    const { node, input, press, store, vim } = await textFixture({ id: 'node', text: 'one two', children: [] })
    input.setSelectionRange(0, 0)
    const [word] = press('w')
    expect(input.selectionStart).toBe(4)
    expect(word!.preventDefault).toHaveBeenCalledOnce()
    const [remove] = press('x')
    expect(node().text).toBe('one wo')
    expect(remove!.preventDefault).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('normal')
    store.undo()
    expect(node().text).toBe('one two')
  })

  it('moves onto an attached image after deleting the final text character', async () => {
    const { store, node, input, press, caretRequests, caret, caretNodeId } = await textFixture({
      id: 'node',
      text: 'ab',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    input.setSelectionRange(1, 1)
    press('x')
    expect(node().text).toBe('a')
    expect(node().attachment?.id).toBe('image')
    expect(caretRequests).toEqual([1])
    expectImageCaret(caretNodeId, caret, 'node', true)
    store.undo()
    expect(node().text).toBe('ab')
  })

  it('keeps the sole image as the caret after deleting its only text character', async () => {
    const { node, input, press, caretRequests, caret, caretNodeId } = await textFixture({
      id: 'node',
      text: 'a',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })
    input.setSelectionRange(0, 0)
    press('x')
    expect(node().text).toBe('')
    expect(node().attachment?.id).toBe('image')
    expect(caretRequests).toEqual([0])
    expectImageCaret(caretNodeId, caret, 'node', true)
  })

  it('keeps a text-only deletion on the preceding character', async () => {
    const { node, input, press, caretRequests, caret, caretNodeId } = await textFixture({
      id: 'node',
      text: 'ab',
      children: [],
    })
    input.setSelectionRange(1, 1)
    press('x')
    expect(node().text).toBe('a')
    expect(caretRequests).toEqual([0])
    expectImageCaret(caretNodeId, caret, 'node', false)
  })

  it('activates the terminal image after a Visual deletion of final text', async () => {
    const { node, input, press, caretRequests, caret, caretNodeId } = await textFixture(
      { id: 'node', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
      'visual',
    )

    input.setSelectionRange(1, 2)
    press('d')
    expect(node().text).toBe('a')
    expect(node().attachment?.id).toBe('image')
    expect(caretRequests).toEqual([1])
    expectImageCaret(caretNodeId, caret, 'node', true)
  })

  it('clears the image caret when putting plain text from an attached image', async () => {
    const { node, input, press, vim, caretRequests, caret, caretNodeId } = await textFixture({
      id: 'node',
      text: 'ab',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })
    input.setSelectionRange(2, 2)
    input.classList.add('node-input-image-caret')
    vim.register.current = { kind: 'text', value: 'Z' }

    press('P')
    expect(node().text).toBe('abZ')
    expect(node().attachment?.id).toBe('image')
    expect(caretRequests).toEqual([2])
    expectImageCaret(caretNodeId, caret, 'node', false)
  })

  it('preserves the saved return position when a no-op edit is pressed while already on the image', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abcd'
    input.setSelectionRange(4, 4)
    input.classList.add('node-input-image-caret')
    const { handle, vim, caret, caretNodeId } = vimHandler(store, {
      id: 'node',
      text: 'abcd',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })
    // Seed through the caret authority, as production does. Writing `imageTextCursor` alone is not
    // enough once the authority owns the node: an authority that has never seen this node reports
    // no saved return position regardless of what the DOM class says.
    vim.applyCaretState('node', { cursor: 4, imageActive: true, imageTextReturnCursor: 1 })

    handle(keyEvent(input, 'x'))

    expect(store.replaceTextRange).not.toHaveBeenCalled()
    expectImageCaret(caretNodeId, caret, 'node', true)
    expect(vim.imageTextCursor.current).toBe(1)
  })

  it('applies a navigation count before the next command', async () => {
    const roots = ['node', 'second', 'third'].map((id) => ({ id, text: 'abcd', children: [] }))
    const { snapshot, input, press } = await textFixture(roots[0]!, 'normal', { document: { roots } })
    input.setSelectionRange(0, 0)
    press('2', 'j')
    expect(snapshot().location.selectedNodeId).toBe('third')
    expect(snapshot().focus).toMatchObject({ nodeId: 'third', cursor: 0 })
    press('l')
    expect(input.selectionStart).toBe(1)
  })

  it('activates an attached parent image when k moves up from the first child', async () => {
    const child: TreeNode = { id: 'child', text: 'Child', children: [] }
    const { snapshot, input, press, vim, caret, caretNodeId } = await textFixture(child, 'normal', {
      document: {
        roots: [
          { id: 'parent', text: 'Parent', attachment: { id: 'image', mimeType: 'image/png' }, children: [child] },
        ],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'child' },
    })
    input.setSelectionRange(4, 5)
    press('k')
    expect(snapshot().location).toEqual({ currentParentId: 'parent', selectedNodeId: 'parent' })
    expect(snapshot().focus).toMatchObject({ nodeId: 'parent', cursor: 4 })
    expectImageCaret(caretNodeId, caret, 'parent', true)
    // The cross-node write is a focus-driven one, which the projection uses to consume the store's
    // focus token; assert that flag on the authority call, since it is not part of the caret value.
    expect(vim.applyCaretState).toHaveBeenLastCalledWith('parent', expect.objectContaining({ imageActive: true }), true)
  })

  it('moves from an active parent image to its text with k', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'Parent'
    input.setSelectionRange(4, 5)
    input.classList.add('node-input-image-caret')
    const { handle, caret, caretNodeId } = vimHandler(store, {
      id: 'parent',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, 'k'))

    expect(input.selectionStart).toBe(5)
    expect(input.selectionEnd).toBe(6)
    expectImageCaret(caretNodeId, caret, 'parent', false)
  })

  it('restores the text position after moving from text to an image and back', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'Parent'
    input.setSelectionRange(2, 3)
    input.classList.add('node-input-image-caret')
    const { handle, vim, caret, caretNodeId } = vimHandler(store, {
      id: 'parent',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })
    vim.applyCaretState('parent', { cursor: 6, imageActive: true, imageTextReturnCursor: 2 })

    handle(keyEvent(input, 'k'))

    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(3)
    expectImageCaret(caretNodeId, caret, 'parent', false)
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
    vim.applyCaretState('node', { cursor: 4, imageActive: true, imageTextReturnCursor: 1 })

    handle(keyEvent(input, '2'))
    handle(keyEvent(input, 'h'))

    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(1)
  })

  it.each([
    { motion: '0', destination: 0, afterH: 0 },
    { motion: '$', destination: 3, afterH: 2 },
  ])('clears image state when $motion moves from image to text', ({ motion, destination, afterH }) => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abcd'
    input.setSelectionRange(1, 1)
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    row.append(input)
    document.body.append(row)
    const { handle, vim, caret, caretNodeId } = vimHandler(store, {
      id: 'node',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, 'j'))
    expectImageCaret(caretNodeId, caret, 'node', true)
    expect(vim.imageTextCursor.current).toBe(1)

    handle(keyEvent(input, motion))
    expect(input.selectionStart).toBe(destination)
    expectImageCaret(caretNodeId, caret, 'node', false)
    expect(vim.imageTextCursor.current).toBeUndefined()

    handle(keyEvent(input, 'h'))
    expect(input.selectionStart).toBe(afterH)
    row.remove()
  })

  it.each(['Escape', 'v'])('clears image state when Visual %s returns to text', (exitKey) => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abcd'
    input.setSelectionRange(1, 1)
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    row.append(input)
    document.body.append(row)
    const { handle, vim, caret, caretNodeId } = vimHandler(store, {
      id: 'node',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, 'j'))
    handle(keyEvent(input, 'v'))
    handle(keyEvent(input, '0'))
    handle(keyEvent(input, exitKey))

    expect(vim.mode).toBe('normal')
    expect(input.selectionStart).toBe(0)
    expectImageCaret(caretNodeId, caret, 'node', false)
    expect(vim.imageTextCursor.current).toBeUndefined()
    row.remove()
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
    const { handle, vim, caret, caretNodeId } = vimHandler(store, {
      id: 'node',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })
    vim.applyCaretState('node', { cursor: 4, imageActive: true, imageTextReturnCursor: 1 })

    handle(keyEvent(input, 'j'))

    expect(store.moveSelection).not.toHaveBeenCalled()
    expect(vim.imageTextCursor.current).toBe(1)
    expectImageCaret(caretNodeId, caret, 'node', true)
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
    const { handle, caret, caretNodeId } = vimHandler(store, {
      id: 'parent',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, 'j'))

    expect(store.moveSelection).not.toHaveBeenCalled()
    expectImageCaret(caretNodeId, caret, 'parent', true)
  })

  it('keeps image-only horizontal motions on its sole image character', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = ''
    input.classList.add('node-input-image-caret')
    const { handle, caret, caretNodeId } = vimHandler(store, {
      id: 'image-only',
      text: '',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    for (const key of ['h', 'l', '2', 'h', '2', 'l']) {
      handle(keyEvent(input, key))
      expect(input.selectionStart).toBe(0)
      expectImageCaret(caretNodeId, caret, 'image-only', true)
    }
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
    const { handle, vim, caret, caretNodeId } = vimHandler(store, {
      id: 'parent',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, 'k'))

    expectImageCaret(caretNodeId, caret, 'parent', false)
    // A clamped `k` produces no new focus intent, so it must not be reported as a focus-driven
    // write: `docs/VIM_CONFORMANCE.md` requires a no-op to preserve the local caret rather than
    // consume the store's focus token. The removed fallback passed `fromFocus` here and the shipped
    // path never did; the shipped path is the one that matches the contract.
    expect(vim.applyCaretState).toHaveBeenLastCalledWith('parent', expect.objectContaining({ imageActive: false }))
  })

  it('opens a new child with Normal-mode o and enters Insert mode', async () => {
    const parent: TreeNode = { id: 'node', text: 'Parent', children: [] }
    const { store, snapshot, input, dispatch, vim } = await textFixture(parent, 'normal', {
      location: { currentParentId: 'node', selectedNodeId: 'node' },
    })
    input.setSelectionRange(2, 2)
    const event = dispatch('o')
    expect(snapshot().document.roots).toEqual([
      { ...parent, children: [{ id: 'generated-0', text: '', children: [] }] },
    ])
    expect(snapshot().location).toEqual({ currentParentId: 'node', selectedNodeId: 'generated-0' })
    expect(vim.mode).toBe('insert')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    store.undo()
    expect(snapshot().document.roots).toEqual([parent])
  })

  it('uses counts and text operators without deleting the node', async () => {
    const { node, input, press, vim } = await textFixture({ id: 'node', text: 'one two three', children: [] })
    input.setSelectionRange(0, 0)
    press('2', 'd', 'w')
    expect(node()).toEqual({ id: 'node', text: 'three', children: [] })
    expect(vim.register.current).toEqual({ kind: 'text', value: 'one two ' })
    expect(vim.commandState.lastChange).toEqual({ kind: 'delete', motion: 'w', count: 2 })
  })

  it('changes the current word and enters Insert mode with a text baseline', async () => {
    const { node, input, press, vim } = await textFixture({ id: 'node', text: 'one two', children: [] })
    input.setSelectionRange(0, 0)
    press('c', 'w')
    expect(node().text).toBe(' two')
    expect(vim.register.current).toEqual({ kind: 'text', value: 'one' })
    expect(vim.beginInsert).toHaveBeenCalledWith('node', ' two', 0, { kind: 'change', motion: 'w', count: 1 })
    expect(vim.mode).toBe('insert')
  })

  it('supports end-of-node edits and yank without touching the subtree', async () => {
    const original: TreeNode = { id: 'node', text: 'one two', children: [{ id: 'child', text: 'Child', children: [] }] }
    const { store, node, input, press, vim } = await textFixture(original)
    input.setSelectionRange(4, 4)
    press('y', 'w')
    expect(vim.register.current).toEqual({ kind: 'text', value: 'two' })
    expect(node()).toEqual(original)
    press('D')
    expect(node()).toEqual({ ...original, text: 'one ' })
    store.undo()
    expect(node()).toEqual(original)
  })

  it('finds characters and replaces a counted run', async () => {
    const { node, input, press, store } = await textFixture({ id: 'node', text: 'a.b.c', children: [] })
    input.setSelectionRange(0, 0)
    press('2', 'f', '.')
    expect(input.selectionStart).toBe(3)
    press('2', 'r', 'X')
    expect(node().text).toBe('a.bXX')
    store.undo()
    expect(node().text).toBe('a.b.c')
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

  it('applies backward h operators and inclusive adjacent t ranges', async () => {
    const first = await textFixture({ id: 'node', text: 'abc', children: [] })
    first.input.setSelectionRange(1, 1)
    first.press('d', 'h')
    expect(first.node().text).toBe('bc')
    const second = await textFixture({ id: 'node', text: 'abc', children: [] })
    second.input.setSelectionRange(1, 1)
    second.press('c', 'h')
    expect(second.node().text).toBe('bc')
    expect(second.vim.mode).toBe('insert')
    expect(second.vim.beginInsert).toHaveBeenCalledWith('node', 'bc', 0, {
      kind: 'change',
      motion: 'h',
      count: 1,
    })

    const third = await textFixture({ id: 'node', text: 'aXb', children: [] })
    third.input.setSelectionRange(0, 0)
    third.press('d', 't', 'X')
    expect(third.node().text).toBe('Xb')
  })

  it('applies inclusive end-of-text deletion and leaves a final character available to change', async () => {
    const { node, input, press, vim } = await textFixture({ id: 'node', text: 'abc def', children: [] })
    input.setSelectionRange(4, 4)
    press('d', '$')
    expect(node().text).toBe('abc ')
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

  it('repeats the last text edit at the current caret without replacing it on yank', async () => {
    const { node, input, press, store, vim } = await textFixture({ id: 'node', text: 'one two three', children: [] })
    input.setSelectionRange(0, 0)
    press('d', 'w')
    expect(node().text).toBe('two three')
    input.setSelectionRange(4, 4)
    press('y', 'w', '.')
    expect(vim.register.current).toEqual({ kind: 'text', value: 'three' })
    expect(node().text).toBe('two ')
    store.undo()
    expect(node().text).toBe('two three')
    expect(vim.commandState.lastChange).toEqual({ kind: 'delete', motion: 'w', count: 1 })
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

  it('opens a sibling below with o and above with O', async () => {
    const { store, snapshot, input, dispatch, vim } = await textFixture({ id: 'node', text: 'text', children: [] })
    input.setSelectionRange(2, 2)
    const below = dispatch('o')
    expect(snapshot().document.roots.map(({ text }) => text)).toEqual(['text', ''])
    const belowId = snapshot().location.selectedNodeId
    expect(belowId).not.toBe('node')
    expect(vim.mode).toBe('insert')
    expect(below.preventDefault).toHaveBeenCalledOnce()

    vim.mode = 'normal'
    const above = dispatch('O')
    expect(snapshot().document.roots.map(({ text }) => text)).toEqual(['text', '', ''])
    expect(snapshot().document.roots[1]!.id).toBe(snapshot().location.selectedNodeId)
    expect(snapshot().document.roots[2]!.id).toBe(belowId)
    expect(vim.mode).toBe('insert')
    expect(above.preventDefault).toHaveBeenCalledOnce()
    store.undo()
    expect(snapshot().document.roots.map(({ id }) => id)).toEqual(['node', belowId])
    store.undo()
    expect(snapshot().document.roots.map(({ id }) => id)).toEqual(['node'])
  })

  it('does nothing when O is pressed on the current-parent heading', async () => {
    const { snapshot, dispatch, vim } = await textFixture({ id: 'parent', text: 'Parent', children: [] }, 'normal', {
      location: { currentParentId: 'parent', selectedNodeId: 'parent' },
    })
    const original = snapshot()
    const event = dispatch('O')
    expect(snapshot().document).toEqual(original.document)
    expect(snapshot().location).toEqual(original.location)
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

  it('deletes the selected node only after dd', async () => {
    const { snapshot, store, press, vim } = await textFixture({ id: 'node', text: 'text', children: [] })
    const original = snapshot().document
    press('d')
    expect(snapshot().document).toEqual(original)
    press('d')
    expect(snapshot().document.roots).toEqual([{ id: 'generated-0', text: '', children: [] }])
    expect(vim.register.current).toMatchObject({ kind: 'node', value: { id: 'node', text: 'text' } })
    store.undo()
    expect(snapshot().document).toEqual(original)
  })

  it('applies counts to node motions and G', async () => {
    const children = Array.from({ length: 12 }, (_, index) => ({
      id: index === 0 ? 'node' : `node-${index}`,
      text: 'text',
      children: [],
    }))
    const { snapshot, input, press, vim } = await textFixture(children[0]!, 'normal', {
      document: { roots: [{ id: 'parent', text: 'parent', children }] },
      location: { currentParentId: 'parent', selectedNodeId: 'node' },
    })
    input.setSelectionRange(0, 0)
    press('3', 'j')
    expect(snapshot().location.selectedNodeId).toBe('node-3')
    press('5', 'k')
    expect(snapshot().location.selectedNodeId).toBe('parent')
    expect(snapshot().focus).toMatchObject({ nodeId: 'parent', cursor: 0 })
    press('1', '0', 'G')
    expect(vim.moveBoundary).toHaveBeenLastCalledWith('last', 0, 10)
  })

  it('yanks, deletes, and puts counted sibling subtrees', async () => {
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
    const options: RealStoreOptions = {
      document: treeDocument,
      location: { currentParentId: 'root', selectedNodeId: 'first' },
    }
    const node: TreeNode = treeDocument.roots[0]!.children[0]!
    const { store, snapshot, press, vim } = await textFixture(node, 'normal', options)
    press('2', 'y', 'y')
    expect(vim.register.current).toEqual({
      kind: 'nodes',
      value: { nodes: [node, treeDocument.roots[0]!.children[1]], sourceIds: ['first', 'second'] },
    })

    expect(snapshot().document).toEqual(treeDocument)
    press('3', 'p')
    const children = snapshot().document.roots[0]!.children
    expect(children.map(({ text }) => text)).toEqual([
      'First',
      'First',
      'Second',
      'First',
      'Second',
      'First',
      'Second',
      'Second',
    ])
    expect(new Set(children.map(({ id }) => id)).size).toBe(8)
    // A counted put is one undoable command (PRODUCT §20.2.1 T1).
    store.undo()
    expect(snapshot().document).toEqual(treeDocument)
    const deletion = await textFixture(node, 'normal', options)
    deletion.press('3', 'd', 'd')
    expect(deletion.snapshot().document.roots).toEqual([{ id: 'root', text: 'Root', children: [] }])
    expect(deletion.vim.register.current.kind).toBe('nodes')
    // A counted deletion is one undoable command.
    deletion.store.undo()
    expect(deletion.snapshot().document).toEqual(treeDocument)
  })

  it('copies a node subtree with yy and pastes it as a sibling with p or P', async () => {
    const node: TreeNode = {
      id: 'node',
      text: 'parent',
      children: [{ id: 'child', text: 'child', children: [] }],
    }
    const { store, snapshot, press, vim } = await textFixture(node)
    press('y')
    expect(snapshot().document.roots).toEqual([node])
    press('y')

    expect(vim.register.current).toEqual({ kind: 'node', value: node, sourceIds: ['node'] })
    expect(vim.register.current).not.toBe(node)
    press('p')
    const afterId = snapshot().location.selectedNodeId
    expect(snapshot().document.roots.map(({ id }) => id)).toEqual(['node', afterId])
    press('P')
    const roots = snapshot().document.roots
    expect(roots.map(({ id }) => id)).toEqual(['node', snapshot().location.selectedNodeId, afterId])
    expect(roots.map(({ text, children }) => [text, children.map(({ text }) => text)])).toEqual([
      ['parent', ['child']],
      ['parent', ['child']],
      ['parent', ['child']],
    ])
    expect(new Set(roots.flatMap((root) => [root.id, root.children[0]!.id])).size).toBe(6)
    store.undo()
    store.undo()
    expect(snapshot().document.roots).toEqual([node])
  })

  it('enters the selected node after gd and resyncs the image caret', async () => {
    const { snapshot, press, vim } = await textFixture({
      id: 'node',
      text: 'Parent',
      children: [{ id: 'child', text: 'Child', children: [] }],
    })
    const original = snapshot().document
    press('g')
    expect(snapshot().location).toEqual({ currentParentId: null, selectedNodeId: 'node' })
    press('d')
    expect(snapshot().location).toEqual({ currentParentId: 'node', selectedNodeId: 'child' })
    expect(snapshot().document).toEqual(original)
    expect(vim.syncImageCaretToFocus).toHaveBeenCalledOnce()
  })

  it('leaves the current node with Ctrl+o in Normal mode', async () => {
    const child: TreeNode = { id: 'child', text: 'Child', children: [] }
    const { snapshot, input, dispatch, vim } = await textFixture(child, 'normal', {
      document: { roots: [{ id: 'parent', text: 'Parent', children: [child] }] },
      location: { currentParentId: 'parent', selectedNodeId: 'child' },
    })
    input.setSelectionRange(2, 2)
    const event = dispatch('o', { ctrlKey: true })
    expect(snapshot().location).toEqual({ currentParentId: null, selectedNodeId: 'parent' })
    expect(vim.syncImageCaretToFocus).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('blocks an unhandled Ctrl-modified key in every non-Insert Vim mode instead of letting it reach native editing', () => {
    for (const mode of ['normal', 'replace', 'visual', 'visual-node'] as const) {
      const store = createStore()
      const input = document.createElement('textarea')
      input.value = 'text'
      const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, mode)
      vim.commandState.pending = { count: '', motionCount: '', operator: 'd' }

      const event = keyEvent(input, 'w', { ctrlKey: true })
      handle(event)

      expect(event.preventDefault, mode).toHaveBeenCalledOnce()
      expect(vim.commandState.pending, mode).toBeUndefined()
      expect(store.leave, mode).not.toHaveBeenCalled()
      expect(store.enter, mode).not.toHaveBeenCalled()
      expect(store.undo, mode).not.toHaveBeenCalled()
      expect(store.redo, mode).not.toHaveBeenCalled()
    }
  })

  it('leaves Ctrl-modified keys unblocked in Insert mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'insert')

    const event = keyEvent(input, 'w', { ctrlKey: true })
    handle(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
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

  it('undoes with u and redoes with Ctrl+r in Normal mode', async () => {
    const { node, input, press, dispatch, vim } = await textFixture({ id: 'node', text: 'text', children: [] })
    input.setSelectionRange(0, 0)
    press('x')
    expect(node().text).toBe('ext')
    press('u')
    expect(node().text).toBe('text')
    dispatch('r', { ctrlKey: true })
    expect(node().text).toBe('ext')
    expect(vim.syncImageCaretToFocus).toHaveBeenCalledTimes(2)
  })

  // Ctrl+r is dispatched outside handleVimKey, so it used to redo while the same unfinished command
  // followed by u correctly made no change.
  it('discards an unfinished Normal-mode command instead of undoing or redoing', () => {
    const unfinished: VimPendingCommand[] = [
      { count: '3', motionCount: '' },
      { count: '', motionCount: '', operator: 'd' },
      { count: '', motionCount: '', prefix: 'g' },
      { count: '', motionCount: '', prefix: 'z' },
      { count: '', motionCount: '', awaiting: 'r' },
      { count: '', motionCount: '', awaiting: 'f' },
      { count: '', motionCount: '', surround: { stage: 'target', operation: 'delete', count: 1 } },
    ]

    for (const pending of unfinished) {
      for (const key of ['u', 'r'] as const) {
        const store = createStore()
        const input = document.createElement('textarea')
        input.value = 'text'
        const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })
        vim.commandState.pending = { ...pending }
        const context = `${JSON.stringify(pending)} then ${key === 'u' ? 'u' : 'Ctrl+r'}`

        handle(keyEvent(input, key, key === 'r' ? { ctrlKey: true } : {}))

        expect(store.undo, context).not.toHaveBeenCalled()
        expect(store.redo, context).not.toHaveBeenCalled()
        expect(vim.commandState.pending, context).toBeUndefined()
      }
    }
  })

  it('discards an unfinished Normal-mode command instead of leaving the current parent with Ctrl+o', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })
    vim.commandState.pending = { count: '', motionCount: '', operator: 'd' }

    handle(keyEvent(input, 'o', { ctrlKey: true }))

    expect(store.leave).not.toHaveBeenCalled()
    expect(vim.commandState.pending).toBeUndefined()
  })

  it('discards a pending count instead of moving by half a page with Ctrl+d and Ctrl+u', () => {
    for (const key of ['d', 'u'] as const) {
      const store = createStore()
      const input = document.createElement('textarea')
      input.value = 'text'
      const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })
      vim.commandState.pending = { count: '3', motionCount: '' }

      handle(keyEvent(input, key, { ctrlKey: true }))

      expect(vim.moveViewport, key).not.toHaveBeenCalled()
      expect(vim.commandState.pending, key).toBeUndefined()
    }
  })

  it('commits and ends a pending Replace session before undoing it', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'replace')
    const finishReplace = vi.fn(() => true)
    vim.finishReplace = finishReplace

    handle(keyEvent(input, 'z', { metaKey: true }))

    expect(finishReplace).toHaveBeenCalledWith(input, true)
    expect(finishReplace.mock.invocationCallOrder[0]).toBeLessThan(
      (store.undo as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!,
    )
    expect(store.undo).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('normal')
    expect(vim.syncImageCaretToFocus).toHaveBeenCalledOnce()
  })

  it('commits and ends a pending Replace session before Cmd+Shift+Z redo', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'replace')
    const finishReplace = vi.fn(() => true)
    vim.finishReplace = finishReplace

    handle(keyEvent(input, 'z', { metaKey: true, shiftKey: true }))

    expect(finishReplace).toHaveBeenCalledWith(input, true)
    expect(finishReplace.mock.invocationCallOrder[0]).toBeLessThan(
      (store.redo as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!,
    )
    expect(store.redo).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('normal')
    expect(vim.syncImageCaretToFocus).toHaveBeenCalledOnce()
  })

  it('finishes a pending Insert session before Cmd+Z undoes it, staying in Insert mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'insert')
    const finishInsert = vi.fn()
    vim.finishInsert = finishInsert

    handle(keyEvent(input, 'z', { metaKey: true }))

    expect(finishInsert).toHaveBeenCalledWith(input)
    expect(finishInsert.mock.invocationCallOrder[0]).toBeLessThan(
      (store.undo as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!,
    )
    expect(store.undo).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('insert')
  })

  it('commits and ends a pending Replace session before Cmd+. enters the selected node', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'replace')
    const finishReplace = vi.fn(() => true)
    vim.finishReplace = finishReplace

    handle(keyEvent(input, '.', { metaKey: true }))

    expect(finishReplace).toHaveBeenCalledWith(input, false)
    expect(finishReplace.mock.invocationCallOrder[0]).toBeLessThan(
      (store.enter as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!,
    )
    expect(store.enter).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('normal')
  })

  it('commits and ends a pending Replace session before Cmd+, leaves the current parent', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'replace')
    const finishReplace = vi.fn(() => true)
    vim.finishReplace = finishReplace

    handle(keyEvent(input, ',', { metaKey: true }))

    expect(finishReplace).toHaveBeenCalledWith(input, false)
    expect(finishReplace.mock.invocationCallOrder[0]).toBeLessThan(
      (store.leave as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!,
    )
    expect(store.leave).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('normal')
  })

  it('commits and ends a pending Replace session before Cmd+Backspace deletes the node', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'replace')
    const finishReplace = vi.fn(() => true)
    vim.finishReplace = finishReplace

    handle(keyEvent(input, 'Backspace', { metaKey: true }))

    expect(finishReplace).toHaveBeenCalledWith(input, false)
    expect(finishReplace.mock.invocationCallOrder[0]).toBeLessThan(
      (store.deleteSelected as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!,
    )
    expect(store.deleteSelected).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('normal')
  })

  it('finishes a pending Insert session before Cmd+. and Cmd+Backspace, staying in Insert mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'insert')
    const finishInsert = vi.fn()
    vim.finishInsert = finishInsert

    handle(keyEvent(input, '.', { metaKey: true }))
    handle(keyEvent(input, 'Backspace', { metaKey: true }))

    expect(finishInsert).toHaveBeenNthCalledWith(1, input)
    expect(finishInsert).toHaveBeenNthCalledWith(2, input)
    expect(store.enter).toHaveBeenCalledOnce()
    expect(store.deleteSelected).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('insert')
  })

  it('resyncs the image caret after Cmd+Z, Cmd+Shift+Z, and Cmd+, in Normal mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, 'z', { metaKey: true }))
    handle(keyEvent(input, 'z', { metaKey: true, shiftKey: true }))
    handle(keyEvent(input, ',', { metaKey: true }))

    expect(store.undo).toHaveBeenCalledOnce()
    expect(store.redo).toHaveBeenCalledOnce()
    expect(store.leave).toHaveBeenCalledOnce()
    expect(vim.syncImageCaretToFocus).toHaveBeenCalledTimes(3)
  })

  it('clears a whole-node Visual g prefix on Escape so a following d does not run gd', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'node'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'node', children: [] }, 'visual-node')
    const exit = vi.fn()
    vim.nodeVisual = { enter: vi.fn(() => true), move: vi.fn(), swap: vi.fn(), exit, command: vi.fn(), shift: vi.fn() }

    handle(keyEvent(input, 'g'))
    expect(vim.commandState.pending).toEqual({ count: '', motionCount: '', prefix: 'g' })
    handle(keyEvent(input, 'Escape'))
    expect(exit).toHaveBeenCalledOnce()
    expect(vim.commandState.pending).toBeUndefined()
    handle(keyEvent(input, 'd'))
    expect(store.enter).not.toHaveBeenCalled()
  })

  it('clears a whole-node Visual g prefix on V exit', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'node'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'node', children: [] }, 'visual-node')
    const exit = vi.fn()
    vim.nodeVisual = { enter: vi.fn(() => true), move: vi.fn(), swap: vi.fn(), exit, command: vi.fn(), shift: vi.fn() }

    handle(keyEvent(input, 'g'))
    handle(keyEvent(input, 'V'))

    expect(exit).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('normal')
    expect(vim.commandState.pending).toBeUndefined()
    handle(keyEvent(input, 'd'))
    expect(store.enter).not.toHaveBeenCalled()
  })

  it('keeps character Visual mode but clears its command assembly before Cmd+.', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'visual')
    vim.commandState.visualAnchor = 0
    vim.commandState.visualFocus = 1
    vim.commandState.pending = { count: '', motionCount: '', prefix: 'i' }

    handle(keyEvent(input, '.', { metaKey: true }))

    expect(store.enter).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('visual')
    expect(vim.commandState.visualAnchor).toBeUndefined()
    expect(vim.commandState.visualFocus).toBeUndefined()
    expect(vim.commandState.pending).toBeUndefined()
  })

  it('keeps character Visual mode but clears its command assembly before Cmd+,', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'visual')
    vim.commandState.visualAnchor = 0
    vim.commandState.visualFocus = 1

    handle(keyEvent(input, ',', { metaKey: true }))

    expect(store.leave).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('visual')
    expect(vim.commandState.visualAnchor).toBeUndefined()
    expect(vim.commandState.visualFocus).toBeUndefined()
  })

  it('keeps character Visual mode but clears its command assembly before Cmd+Backspace', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'visual')
    vim.commandState.visualAnchor = 0
    vim.commandState.visualFocus = 1

    handle(keyEvent(input, 'Backspace', { metaKey: true }))

    expect(store.deleteSelected).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('visual')
    expect(vim.commandState.visualAnchor).toBeUndefined()
    expect(vim.commandState.visualFocus).toBeUndefined()
  })

  it('keeps character Visual mode but clears its command assembly before Cmd+Z and Cmd+Shift+Z', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'visual')
    vim.commandState.visualAnchor = 0
    vim.commandState.visualFocus = 1
    vim.commandState.pending = { count: '', motionCount: '', prefix: 'a' }

    handle(keyEvent(input, 'z', { metaKey: true }))

    expect(store.undo).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('visual')
    expect(vim.commandState.visualAnchor).toBeUndefined()
    expect(vim.commandState.visualFocus).toBeUndefined()
    expect(vim.commandState.pending).toBeUndefined()

    vim.commandState.visualAnchor = 2
    vim.commandState.visualFocus = 3
    handle(keyEvent(input, 'z', { metaKey: true, shiftKey: true }))

    expect(store.redo).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('visual')
    expect(vim.commandState.visualAnchor).toBeUndefined()
    expect(vim.commandState.visualFocus).toBeUndefined()
  })

  it.each([
    { name: 'Cmd+.', key: '.', options: { metaKey: true } },
    { name: 'Cmd+,', key: ',', options: { metaKey: true } },
    { name: 'Cmd+Backspace', key: 'Backspace', options: { metaKey: true } },
    { name: 'Cmd+Z', key: 'z', options: { metaKey: true } },
    { name: 'Cmd+Shift+Z', key: 'z', options: { metaKey: true, shiftKey: true } },
    { name: 'Cmd+A', key: 'a', options: { metaKey: true } },
  ])('clears a Normal-mode pending command before $name', ({ key, options }) => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })
    handle(keyEvent(input, 'd'))
    expect(vim.commandState.pending).toBeDefined()

    handle(keyEvent(input, key, options))

    expect(vim.commandState.pending).toBeUndefined()
    expect(vim.mode).toBe('normal')
    if (key === '.') expect(store.enter).toHaveBeenCalledOnce()
    else if (key === ',') expect(store.leave).toHaveBeenCalledOnce()
    else if (key === 'Backspace') expect(store.deleteSelected).toHaveBeenCalledOnce()
    else if (key === 'z') expect(options.shiftKey ? store.redo : store.undo).toHaveBeenCalledOnce()
    else expect(input.selectionEnd).toBe(input.value.length)
  })

  it('toggles the selected node fold on Cmd+E and clears a pending Normal-mode command', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })
    handle(keyEvent(input, 'd'))

    handle(keyEvent(input, 'e', { metaKey: true }))

    expect(store.applyFold).toHaveBeenCalledExactlyOnceWith('toggle', 'node')
    expect(vim.commandState.pending).toBeUndefined()
    expect(vim.mode).toBe('normal')
  })

  it('toggles the fold on Cmd+E without leaving Insert mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'insert')

    handle(keyEvent(input, 'e', { metaKey: true }))

    expect(store.applyFold).toHaveBeenCalledExactlyOnceWith('toggle', 'node')
    expect(vim.mode).toBe('insert')
  })

  it('ignores Cmd+Shift+E and plain e as fold toggles', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'insert')

    handle(keyEvent(input, 'e', { metaKey: true, shiftKey: true }))
    handle(keyEvent(input, 'e'))

    expect(store.applyFold).not.toHaveBeenCalled()
  })

  it('clears a Normal-mode g prefix before Cmd+.', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })
    handle(keyEvent(input, 'g'))
    expect(vim.commandState.pending).toEqual({ count: '', motionCount: '', prefix: 'g' })

    handle(keyEvent(input, '.', { metaKey: true }))

    expect(store.enter).toHaveBeenCalledOnce()
    expect(vim.commandState.pending).toBeUndefined()
  })

  it('clears a Normal-mode z prefix before Cmd+.', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })
    handle(keyEvent(input, 'z'))
    expect(vim.commandState.pending).toEqual({ count: '', motionCount: '', prefix: 'z' })

    handle(keyEvent(input, '.', { metaKey: true }))

    expect(store.enter).toHaveBeenCalledOnce()
    expect(vim.commandState.pending).toBeUndefined()
    expect(vim.fold).not.toHaveBeenCalled()
  })

  it.each([
    { keys: ['z', 'c'], command: 'close' },
    { keys: ['z', 'o'], command: 'open' },
    { keys: ['z', 'a'], command: 'toggle' },
    { keys: ['z', 'C'], command: 'close-recursive' },
    { keys: ['z', 'O'], command: 'open-recursive' },
    { keys: ['z', 'M'], command: 'close-all' },
    { keys: ['z', 'R'], command: 'open-all' },
  ])('dispatches the $command fold command for $keys', ({ keys, command }) => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    for (const key of keys) handle(keyEvent(input, key))

    expect(vim.fold).toHaveBeenCalledExactlyOnceWith(command, 'node')
    expect(vim.commandState.pending).toBeUndefined()
  })

  it('ignores an unrecognized z key without editing or continuing the command', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, 'z'))
    handle(keyEvent(input, 'q'))

    expect(vim.fold).not.toHaveBeenCalled()
    expect(vim.commandState.pending).toBeUndefined()
    expect(store.replaceTextRange).not.toHaveBeenCalled()
  })

  it('discards a pending count and runs the fold command once', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, '3'))
    handle(keyEvent(input, 'z'))
    handle(keyEvent(input, 'c'))

    expect(vim.fold).toHaveBeenCalledExactlyOnceWith('close', 'node')
    expect(vim.commandState.pending).toBeUndefined()
  })

  it('clears a pending z prefix on Escape without dispatching a fold', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, 'z'))
    handle(keyEvent(input, 'Escape'))

    expect(vim.fold).not.toHaveBeenCalled()
    expect(vim.commandState.pending).toBeUndefined()
    expect(vim.mode).toBe('normal')
  })

  it('leaves a z key unhandled in character Visual mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'visual')

    handle(keyEvent(input, 'z'))

    expect(vim.fold).not.toHaveBeenCalled()
    expect(vim.mode).toBe('visual')
    expect(vim.commandState.pending).toBeUndefined()
  })

  it('leaves a z key unhandled in whole-node Visual mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'visual-node')
    const exit = vi.fn()
    vim.nodeVisual = { enter: vi.fn(() => true), move: vi.fn(), swap: vi.fn(), exit, command: vi.fn(), shift: vi.fn() }
    const event = keyEvent(input, 'z')

    handle(event)

    expect(vim.fold).not.toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()
    expect(vim.mode).toBe('visual-node')
    expect(vim.commandState.pending).toBeUndefined()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('keeps a pending fold prefix across the Shift keydown of a capital key', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, 'z'))
    // A physical keyboard fires Shift's own keydown before the capital key that follows it.
    handle(keyEvent(input, 'Shift', { shiftKey: true }))
    expect(vim.commandState.pending).toEqual({ count: '', motionCount: '', prefix: 'z' })
    handle(keyEvent(input, 'O'))

    expect(vim.fold).toHaveBeenCalledExactlyOnceWith('open-recursive', 'node')
    expect(vim.commandState.pending).toBeUndefined()
  })

  it.each([
    { key: 'Shift', options: { shiftKey: true } },
    { key: 'CapsLock', options: {} },
    { key: 'NumLock', options: {} },
    { key: 'ScrollLock', options: {} },
    { key: 'Fn', options: {} },
    { key: 'FnLock', options: {} },
    { key: 'AltGraph', options: {} },
    { key: 'Dead', options: {} },
    { key: 'Compose', options: {} },
    { key: 'Process', options: {} },
    { key: 'Unidentified', options: {} },
    { key: 'Control', options: { ctrlKey: true } },
    { key: 'Meta', options: { metaKey: true } },
    { key: 'Alt', options: { altKey: true } },
  ])('keeps a pending fold prefix through the neutral $key keydown', ({ key, options }) => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, 'z'))
    handle(keyEvent(input, key, options))
    expect(vim.commandState.pending).toEqual({ count: '', motionCount: '', prefix: 'z' })
    handle(keyEvent(input, 'c'))

    expect(vim.fold).toHaveBeenCalledExactlyOnceWith('close', 'node')
  })

  it.each(['Process', 'Unidentified'])(
    'clears a pending fold prefix through composition started by a %s keydown',
    (imeKey) => {
      const store = createStore()
      const input = document.createElement('textarea')
      input.value = 'text'
      input.setSelectionRange(2, 2)
      let composing = false
      const { handle, vim, commandState } = vimHandler(
        store,
        { id: 'node', text: 'text', children: [] },
        'normal',
        () => composing,
      )

      // Chromium can report the keydown that begins composition before `compositionstart` sets the
      // composing state, as `Process` (keyCode 229) or `Unidentified`. It is not the command key, so
      // the pending `z` must survive it and stay available for the composition path to clear.
      handle(keyEvent(input, 'z'))
      handle(keyEvent(input, imeKey))
      expect(commandState.pending).toEqual({ count: '', motionCount: '', prefix: 'z' })

      // `compositionstart` then clears the unfinished command — the same production `clearPending`
      // call `use-node-input-bindings.ts` makes — and the composed keydown is ignored because the
      // composing state is set.
      clearPending(commandState)
      composing = true
      handle(keyEvent(input, 'Enter'))

      expect(commandState.pending).toBeUndefined()
      expect(vim.fold).not.toHaveBeenCalled()
      expect(store.createSiblingOrFirstChild).not.toHaveBeenCalled()
      expect(store.replaceTextRange).not.toHaveBeenCalled()
      expect(input.value).toBe('text')
      expect(input.selectionStart).toBe(2)
      expect(input.selectionEnd).toBe(2)
    },
  )

  it.each(['w', 'x', 'Enter'])('ignores a keydown the native composition flag marks as composing: %s', (key) => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'one two'
    input.setSelectionRange(0, 0)
    const { handle, commandState } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    // The keydown that begins composition can arrive before `compositionstart` sets React's
    // composing state, so the native event flag is the only signal that the key belongs to the input
    // method. It must run no command — a motion (`w`), a text edit (`x`), or a structural command
    // (`Enter`) — and must stay available to the IME instead of being prevented and consumed.
    const event = keyEvent(input, key, { isComposing: true })
    handle(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(0)
    expect(commandState.pending).toBeUndefined()
    expect(store.moveHorizontal).not.toHaveBeenCalled()
    expect(store.replaceTextRange).not.toHaveBeenCalled()
    expect(store.createSiblingOrFirstChild).not.toHaveBeenCalled()
    expect(store.endTextSession).not.toHaveBeenCalled()
  })

  it('keeps a pending operator through a keydown the native composition flag marks as composing', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'one two'
    input.setSelectionRange(0, 0)
    const { handle, commandState } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    handle(keyEvent(input, 'd'))
    handle(keyEvent(input, 'w', { isComposing: true }))

    // The composition keydown must not complete `dw`; `compositionstart` clears the unfinished
    // command itself, so it stays available for that path.
    expect(commandState.pending).toEqual({ count: '', motionCount: '', operator: 'd' })
    expect(store.replaceTextRange).not.toHaveBeenCalled()
  })

  it('does not type a keydown the native composition flag marks as composing in Replace mode', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abcd'
    input.setSelectionRange(2, 3)
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'abcd', children: [] }, 'replace')

    const event = keyEvent(input, 'X', { isComposing: true })
    handle(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(vim.handleReplaceKey).not.toHaveBeenCalled()
    expect(vim.finishReplace).not.toHaveBeenCalled()
    expect(input.value).toBe('abcd')
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(3)
    expect(store.replaceTextRange).not.toHaveBeenCalled()
  })

  it('does not end an Insert session for an Escape the native composition flag marks as composing', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'insert')

    const event = keyEvent(input, 'Escape', { isComposing: true })
    handle(event)

    // The first Escape during composition cancels the composition, so the Insert session must
    // survive it; the IME owns the event and the handler must not consume it.
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(vim.finishInsert).not.toHaveBeenCalled()
    expect(vim.setMode).not.toHaveBeenCalled()
    expect(vim.mode).toBe('insert')
    expect(store.endTextSession).not.toHaveBeenCalled()
  })

  it('keeps a pending operator and an awaited character across a bare Shift keydown', async () => {
    const { node, input, press, dispatch } = await textFixture({ id: 'node', text: 'abc def', children: [] })
    input.setSelectionRange(4, 4)
    press('d')
    dispatch('Shift', { shiftKey: true })
    press('$')
    expect(node().text).toBe('abc ')

    input.setSelectionRange(0, 0)
    press('r')
    dispatch('Shift', { shiftKey: true })
    press('A')
    expect(node().text).toBe('Abc ')
  })

  // Auto-repeat: holding a key sends keydowns with `repeat: true`, and the handler treats each as
  // one more ordinary press. `z`, `r`, `g`, and operator keys change pending state on the first
  // press, so the repeat completes or consumes that state. `l` follows each repeat because a
  // prefix that wrongly stayed pending would swallow it as an unrecognized key, and the repeat
  // event's `preventDefault` keeps the held key out of native editing.
  it('treats a repeated z keydown as the second press of the fold prefix', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'one two'
    input.setSelectionRange(0, 0)
    const { handle, vim, commandState } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    handle(keyEvent(input, 'z'))
    expect(commandState.pending).toEqual({ count: '', motionCount: '', prefix: 'z' })

    const repeat = keyEvent(input, 'z', { repeat: true })
    handle(repeat)

    // `zz` is not one of the implemented fold keys, so the repeat consumes the prefix as an
    // ordinary second press and dispatches no fold.
    expect(vim.fold).not.toHaveBeenCalled()
    expect(commandState.pending).toBeUndefined()
    expect(store.replaceTextRange).not.toHaveBeenCalled()
    expect(input.value).toBe('one two')
    expect(input.selectionStart).toBe(0)
    expect(repeat.preventDefault).toHaveBeenCalledOnce()

    handle(keyEvent(input, 'l'))
    expect(input.selectionStart).toBe(1)
    expect(vim.fold).not.toHaveBeenCalled()
  })

  it('treats a repeated r keydown as the awaited replacement character', async () => {
    const { node, input, press, dispatch, commandState } = await textFixture({ id: 'node', text: 'abc', children: [] })
    input.setSelectionRange(0, 0)
    press('r')
    expect(commandState.pending).toEqual({ count: '', motionCount: '', awaiting: 'r' })

    const repeat = dispatch('r', { repeat: true })

    // Holding `r` types literal `r`s in Vim: the repeat is the awaited character, so it replaces
    // the character under the caret once and clears the pending command.
    expect(node().text).toBe('rbc')
    expect(commandState.pending).toBeUndefined()
    expect(input.selectionStart).toBe(0)
    expect(repeat.preventDefault).toHaveBeenCalledOnce()

    press('l')
    expect(input.selectionStart).toBe(1)
    expect(node().text).toBe('rbc')
  })

  it('treats a repeated g keydown as the second g of the parent-boundary motion', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(0, 0)
    const { handle, vim, commandState } = vimHandler(store, { id: 'node', text: input.value, children: [] })

    handle(keyEvent(input, 'g'))
    expect(commandState.pending).toEqual({ count: '', motionCount: '', prefix: 'g' })

    const repeat = keyEvent(input, 'g', { repeat: true })
    handle(repeat)

    // `gg` consumes the prefix and selects the current parent; the repeat leaves no second `g`
    // pending and runs no store command.
    expect(vim.moveBoundary).toHaveBeenCalledExactlyOnceWith('parent', 0)
    expect(commandState.pending).toBeUndefined()
    expect(store.replaceTextRange).not.toHaveBeenCalled()
    expect(input.selectionStart).toBe(0)
    expect(repeat.preventDefault).toHaveBeenCalledOnce()

    handle(keyEvent(input, 'l'))
    expect(input.selectionStart).toBe(1)
    expect(vim.moveBoundary).toHaveBeenCalledTimes(1)
  })

  it('treats a repeated d operator keydown as the second d of the node delete', async () => {
    const roots = [
      { id: 'node', text: 'text', children: [] },
      { id: 'next', text: 'next', children: [] },
    ]
    const { snapshot, input, press, dispatch, vim, commandState } = await textFixture(roots[0]!, 'normal', {
      document: { roots },
    })
    input.setSelectionRange(0, 0)
    press('d')
    expect(commandState.pending).toEqual({ count: '', motionCount: '', operator: 'd' })

    const repeat = dispatch('d', { repeat: true })

    // `dd` consumes the operator: the repeat deletes the node exactly once, records one repeatable
    // structural change, and does not fall through to a text edit.
    expect(snapshot().document.roots).toEqual([roots[1]])
    expect(snapshot().location.selectedNodeId).toBe('next')
    expect(vim.register.current).toMatchObject({
      kind: 'node',
      value: { id: 'node', text: 'text' },
      sourceIds: ['node'],
    })
    expect(commandState.lastChange).toEqual({ kind: 'structural-delete' })
    expect(commandState.pending).toBeUndefined()
    expect(input.selectionStart).toBe(0)
    expect(repeat.preventDefault).toHaveBeenCalledOnce()

    press('l')
    expect(input.selectionStart).toBe(1)
    expect(snapshot().document.roots).toEqual([roots[1]])
  })

  it.each([
    { name: 'Cmd+.', key: '.', options: { metaKey: true } },
    { name: 'Cmd+,', key: ',', options: { metaKey: true } },
    { name: 'Cmd+Backspace', key: 'Backspace', options: { metaKey: true } },
    { name: 'Cmd+Z', key: 'z', options: { metaKey: true } },
    { name: 'Cmd+Shift+Z', key: 'z', options: { metaKey: true, shiftKey: true } },
    { name: 'Cmd+A', key: 'a', options: { metaKey: true } },
  ])('exits whole-node Visual mode to Normal before $name', ({ key, options }) => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'visual-node')
    const exit = vi.fn()
    vim.nodeVisual = { enter: vi.fn(() => true), move: vi.fn(), swap: vi.fn(), exit, command: vi.fn(), shift: vi.fn() }
    vim.commandState.pending = { count: '', motionCount: '', prefix: 'g' }
    vim.commandState.visualAnchor = 0
    vim.commandState.visualFocus = 1

    handle(keyEvent(input, key, options))

    expect(exit).toHaveBeenCalledOnce()
    expect(vim.mode).toBe('normal')
    expect(vim.commandState.pending).toBeUndefined()
    expect(vim.commandState.visualAnchor).toBeUndefined()
    expect(vim.commandState.visualFocus).toBeUndefined()
  })

  it('keeps character Visual mode but clears its command assembly before Cmd+A', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'visual')
    vim.commandState.visualAnchor = 0
    vim.commandState.visualFocus = 2
    vim.commandState.pending = { count: '', motionCount: '', prefix: 'i' }

    handle(keyEvent(input, 'a', { metaKey: true }))

    expect(vim.mode).toBe('visual')
    expect(vim.commandState.visualAnchor).toBeUndefined()
    expect(vim.commandState.visualFocus).toBeUndefined()
    expect(vim.commandState.pending).toBeUndefined()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
  })

  it('commits and ends a pending Replace session before Cmd+V pastes at the typed end', async () => {
    const { node, store, input, clipboard, dispatch, vim } = await pendingReplaceFixture()
    clipboard.current = { kind: 'text', text: 'YZ' }
    input.setSelectionRange(3, 3)
    dispatch('v', { metaKey: true })
    expect(vim.finishReplace).toHaveBeenCalledWith(input, false, true)
    expect(vim.mode).toBe('normal')
    await vi.waitFor(() => expect(node().text).toBe('abXYZd'))
    store.undo()
    expect(node().text).toBe('abXd')
    store.undo()
    expect(node().text).toBe('abcd')
  })

  it('commits and ends a pending Replace session before Cmd+X cuts the visible selection', async () => {
    const { node, store, input, clipboard, dispatch, vim } = await pendingReplaceFixture()
    input.setSelectionRange(0, 4)
    dispatch('x', { metaKey: true })
    expect(vim.finishReplace).toHaveBeenCalledWith(input, false, true)
    expect(vim.mode).toBe('normal')
    await vi.waitFor(() => expect(node().text).toBe(''))
    expect(clipboard.written?.text).toBe('abXd')
    store.undo()
    expect(node().text).toBe('abXd')
    store.undo()
    expect(node().text).toBe('abcd')
  })

  it('commits and ends a pending Replace session before Cmd+A selects all', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abXd'
    input.setSelectionRange(3, 3)
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'abcd', children: [] }, 'replace')
    const finishReplace = vi.fn(() => true)
    vim.finishReplace = finishReplace

    handle(keyEvent(input, 'a', { metaKey: true }))

    expect(finishReplace).toHaveBeenCalledWith(input, false, true)
    expect(vim.mode).toBe('normal')
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
  })

  it('does not commit a pending Replace session for a Cmd+X with no selection', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abXd'
    input.setSelectionRange(3, 3)
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'abcd', children: [] }, 'replace')
    const finishReplace = vi.fn(() => true)
    vim.finishReplace = finishReplace

    handle(keyEvent(input, 'x', { metaKey: true }))

    expect(finishReplace).not.toHaveBeenCalled()
    expect(store.cut).not.toHaveBeenCalled()
    expect(vim.mode).toBe('replace')
  })

  it.each([
    { name: 'Cmd+V', key: 'v' },
    { name: 'Cmd+X', key: 'x' },
  ])('clears a Normal-mode pending command before $name', ({ key }) => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(0, 1)
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })
    handle(keyEvent(input, 'd'))
    expect(vim.commandState.pending).toBeDefined()

    handle(keyEvent(input, key, { metaKey: true }))

    expect(vim.commandState.pending).toBeUndefined()
    expect(vim.mode).toBe('normal')
    if (key === 'v') expect(store.paste).toHaveBeenCalledOnce()
    else expect(store.cut).toHaveBeenCalledWith('node', 0, 1)
  })

  it('keeps character Visual mode but clears its command assembly before Cmd+V', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(0, 2)
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'visual')
    vim.commandState.visualAnchor = 0
    vim.commandState.visualFocus = 2
    vim.commandState.pending = { count: '', motionCount: '', prefix: 'i' }

    handle(keyEvent(input, 'v', { metaKey: true }))

    expect(vim.mode).toBe('visual')
    expect(vim.commandState.visualAnchor).toBeUndefined()
    expect(vim.commandState.visualFocus).toBeUndefined()
    expect(vim.commandState.pending).toBeUndefined()
    expect(store.paste).toHaveBeenCalledWith('node', 0)
  })

  it('keeps whole-node Visual mode and its range before Cmd+V', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'visual-node')
    const exit = vi.fn()
    vim.nodeVisual = { enter: vi.fn(() => true), move: vi.fn(), swap: vi.fn(), exit, command: vi.fn(), shift: vi.fn() }
    const pending = { count: '', motionCount: '', prefix: 'g' as const }
    vim.commandState.pending = pending

    handle(keyEvent(input, 'v', { metaKey: true }))

    expect(exit).not.toHaveBeenCalled()
    expect(vim.mode).toBe('visual-node')
    expect(vim.commandState.pending).toBe(pending)
    expect(store.paste).toHaveBeenCalledOnce()
  })

  it('keeps an Insert session and mode before Cmd+V', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] }, 'insert')

    handle(keyEvent(input, 'v', { metaKey: true }))

    expect(vim.finishInsert).not.toHaveBeenCalled()
    expect(vim.setMode).not.toHaveBeenCalled()
    expect(store.paste).toHaveBeenCalledOnce()
  })

  function textCommandState(vim: VimKeyboardState): VimTextCommandState {
    return {
      get mode() {
        return vim.mode
      },
      commandState: vim.commandState,
      finishReplace: vim.finishReplace,
      setMode: vim.setMode,
    }
  }

  it('commits and ends a pending Replace session before the context-menu Paste', async () => {
    const { node, store, input, clipboard, vim } = await pendingReplaceFixture()
    clipboard.current = { kind: 'text', text: 'YZ' }
    input.setSelectionRange(3, 3)

    executeEditorContextMenuCommand('paste', store, node(), input, textCommandState(vim))

    expect(vim.finishReplace).toHaveBeenCalledWith(input, false, true)
    expect(vim.mode).toBe('normal')
    await vi.waitFor(() => expect(node().text).toBe('abXYZd'))
    store.undo()
    expect(node().text).toBe('abXd')
    store.undo()
    expect(node().text).toBe('abcd')
  })

  it('commits and ends a pending Replace session before the context-menu Cut', async () => {
    const { node, store, input, clipboard, vim } = await pendingReplaceFixture()
    input.setSelectionRange(0, 4)

    executeEditorContextMenuCommand('cut', store, node(), input, textCommandState(vim))

    expect(vim.finishReplace).toHaveBeenCalledWith(input, false, true)
    expect(vim.mode).toBe('normal')
    await vi.waitFor(() => expect(node().text).toBe(''))
    expect(clipboard.written?.text).toBe('abXd')
    store.undo()
    expect(node().text).toBe('abXd')
    store.undo()
    expect(node().text).toBe('abcd')
  })

  it('clears a Normal-mode pending command before the context-menu Paste', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(0, 0)
    const { vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })
    vim.commandState.pending = { count: '', motionCount: '', prefix: 'g' }

    executeEditorContextMenuCommand(
      'paste',
      store,
      { id: 'node', text: 'text', children: [] },
      input,
      textCommandState(vim),
    )

    expect(vim.commandState.pending).toBeUndefined()
    expect(store.paste).toHaveBeenCalledOnce()
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
    second.vim.commandState.visualAnchor = first.vim.commandState.visualAnchor
    second.vim.commandState.visualFocus = first.vim.commandState.visualFocus
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

  it('puts the local register before or after the current character', async () => {
    const { node, input, press, store, vim, caretRequests } = await textFixture({
      id: 'node',
      text: 'abcd',
      children: [],
    })
    input.setSelectionRange(1, 1)
    vim.register.current = { kind: 'text', value: 'XY' }

    const [after] = press('p')
    expect(node().text).toBe('abXYcd')
    expect(caretRequests).toEqual([3])
    expect(after!.preventDefault).toHaveBeenCalledOnce()
    input.setSelectionRange(3, 3)
    const [before] = press('P')
    expect(node().text).toBe('abXXYYcd')
    expect(caretRequests).toEqual([3, 4])
    expect(before!.preventDefault).toHaveBeenCalledOnce()
    store.undo()
    expect(node().text).toBe('abXYcd')
    store.undo()
    expect(node().text).toBe('abcd')
  })

  it('handles p and P without editing when the local register is empty', async () => {
    const { store, input, press, snapshot, vim, caretRequests } = await textFixture({
      id: 'node',
      text: 'abc',
      children: [],
    })
    input.setSelectionRange(1, 1)
    const original = snapshot()
    const [after, before] = press('p', 'P')
    expect(snapshot().document).toEqual(original.document)
    expect(snapshot().location).toEqual(original.location)
    store.undo()
    expect(snapshot().document).toEqual(original.document)
    expect(input.selectionStart).toBe(1)
    expect(vim.mode).toBe('normal')
    expect(caretRequests).toEqual([])
    expect(after!.preventDefault).toHaveBeenCalledOnce()
    expect(before!.preventDefault).toHaveBeenCalledOnce()
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

  it('supports WORD and backward word-end motions with operators', async () => {
    const { input, press, node, store } = await textFixture({ id: 'node', text: 'foo.bar  baz qux', children: [] })
    input.setSelectionRange(0, 0)
    press('W')
    expect(input.selectionStart).toBe(9)
    press('E')
    expect(input.selectionStart).toBe(11)
    press('g', 'e')
    expect(input.selectionStart).toBe(6)
    press('d', 'W')
    expect(node().text).toBe('foo.babaz qux')
    store.undo()
    expect(node().text).toBe('foo.bar  baz qux')
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
    expect(vim.commandState.lastFind).toEqual({ kind: 'f', character: '.' })
  })

  it.each([['c', 'c'], ['S']])('clears text with %j while preserving subtree and metadata', async (...keys) => {
    const original: TreeNode = {
      id: 'node',
      text: 'parent',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [{ id: 'child', text: 'child', children: [] }],
    }
    const fixture = await textFixture(original)
    fixture.press(...keys)
    expect(fixture.node()).toEqual({ ...original, text: '' })
    expect(fixture.snapshot().location).toEqual({ currentParentId: null, selectedNodeId: 'node' })
    expect(fixture.vim.mode).toBe('insert')
    fixture.store.undo()
    expect(fixture.node()).toEqual(original)
  })

  it.each([
    { keys: ['2', 'X'], cursor: 3, text: 'aD', register: 'Bc' },
    { keys: ['3', '~'], cursor: 0, text: 'AbCD', register: 'xy' },
    { keys: ['3', 'p'], cursor: 1, text: 'aBxyxyxycD', register: 'xy' },
    { keys: ['P'], cursor: 1, text: 'axyBcD', register: 'xy' },
  ])('applies counted text edit $keys as one undoable change', async ({ keys, cursor, text, register }) => {
    const fixture = await textFixture({ id: 'node', text: 'aBcD', children: [] })
    fixture.vim.register.current = { kind: 'text', value: 'xy' }
    fixture.input.setSelectionRange(cursor, cursor)
    fixture.press(...keys)
    expect(fixture.node().text).toBe(text)
    expect(fixture.vim.register.current).toEqual({ kind: 'text', value: register })
    expect(fixture.vim.mode).toBe('normal')
    fixture.store.undo()
    expect(fixture.node().text).toBe('aBcD')
    fixture.store.redo()
    expect(fixture.node().text).toBe(text)
  })

  it('completes Visual endpoint exchange and lowercase editing', async () => {
    const { input, press, node, store, vim, caretRequests } = await textFixture(
      { id: 'node', text: 'AbCd', children: [] },
      'visual',
    )
    input.setSelectionRange(0, 2)
    vim.commandState.visualAnchor = 0
    vim.commandState.visualFocus = 1
    press('o')
    expect(vim.commandState.visualAnchor).toBe(1)
    expect(vim.commandState.visualFocus).toBe(0)
    press('u')
    expect(node().text).toBe('abCd')
    expect(vim.mode).toBe('normal')
    expect(caretRequests.at(-1)).toBe(0)
    store.undo()
    expect(node().text).toBe('AbCd')
  })

  it.each([
    { key: 'c', text: 'Ad', mode: 'insert', register: 'bC' },
    // `p` exchanges the register with the replaced selection; `P` keeps the incoming value.
    { key: 'p', text: 'AZZd', mode: 'normal', register: 'bC' },
    { key: 'P', text: 'AZZd', mode: 'normal', register: 'ZZ' },
    { key: 'U', text: 'ABCd', mode: 'normal', register: 'ZZ' },
  ])('applies character Visual $key to the selected text', async ({ key, text, mode, register }) => {
    const fixture = await textFixture({ id: 'node', text: 'AbCd', children: [] }, 'visual')
    fixture.vim.register.current = { kind: 'text', value: 'ZZ' }
    fixture.vim.commandState.visualAnchor = 1
    fixture.vim.commandState.visualFocus = 2
    fixture.input.setSelectionRange(1, 3)
    fixture.press(key)
    expect(fixture.node().text).toBe(text)
    expect(fixture.vim.mode).toBe(mode)
    expect(fixture.vim.register.current).toEqual({ kind: 'text', value: register })
    fixture.store.undo()
    expect(fixture.node().text).toBe('AbCd')
  })

  it.each([
    { key: 'p', register: 'bC' },
    { key: 'P', register: 'ZZ' },
  ])('repeats the incoming text for a counted character Visual $key as one edit', async ({ key, register }) => {
    const fixture = await textFixture({ id: 'node', text: 'AbCd', children: [] }, 'visual')
    fixture.vim.register.current = { kind: 'text', value: 'ZZ' }
    fixture.vim.commandState.visualAnchor = 1
    fixture.vim.commandState.visualFocus = 2
    fixture.input.setSelectionRange(1, 3)
    fixture.press('3', key)
    expect(fixture.node().text).toBe('AZZZZZZd')
    expect(fixture.vim.mode).toBe('normal')
    expect(fixture.vim.register.current).toEqual({ kind: 'text', value: register })
    fixture.store.undo()
    expect(fixture.node().text).toBe('AbCd')
  })

  it('keeps register, mode, and selection when a character Visual put is rejected', async () => {
    const fixture = await textFixture({ id: 'node', text: 'AbCd', children: [] }, 'visual')
    fixture.vim.register.current = { kind: 'text', value: 'ZZ' }
    fixture.vim.commandState.visualAnchor = 1
    fixture.vim.commandState.visualFocus = 2
    fixture.input.setSelectionRange(1, 3)
    vi.spyOn(fixture.store, 'replaceTextRange').mockReturnValue(false)
    fixture.press('p')
    expect(fixture.node().text).toBe('AbCd')
    expect(fixture.vim.mode).toBe('visual')
    expect(fixture.vim.register.current).toEqual({ kind: 'text', value: 'ZZ' })
    expect(fixture.input.selectionStart).toBe(1)
    expect(fixture.input.selectionEnd).toBe(3)
  })

  it('leaves the register and the Visual selection alone for an empty or node register', async () => {
    for (const register of [{ kind: 'empty' }, { kind: 'text', value: '' }] as const) {
      const fixture = await textFixture({ id: 'node', text: 'AbCd', children: [] }, 'visual')
      fixture.vim.register.current = register
      fixture.input.setSelectionRange(1, 3)
      fixture.press('p')
      expect(fixture.node().text).toBe('AbCd')
      expect(fixture.vim.mode).toBe('visual')
      expect(fixture.vim.register.current).toEqual(register)
    }
  })

  it('routes a count to whole-node Visual p and P only', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'node'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'node', children: [] }, 'visual-node')
    const command = vi.fn()
    vim.nodeVisual = { enter: vi.fn(() => true), move: vi.fn(), swap: vi.fn(), exit: vi.fn(), command, shift: vi.fn() }
    for (const key of ['3', 'p', '2', 'P', '4', 'd', 'p']) handle(keyEvent(input, key))
    expect(command.mock.calls).toEqual([['p', 3], ['P', 2], ['d'], ['p', 1]])
  })

  it('leaves the caret at the start of a character-wise Visual case range', async () => {
    const lower = await textFixture({ id: 'node', text: 'aBcDe', children: [] }, 'visual')
    lower.input.setSelectionRange(1, 4)
    lower.vim.commandState.visualAnchor = 3
    lower.vim.commandState.visualFocus = 1

    lower.press('u')
    expect(lower.node().text).toBe('abcde')
    expect(lower.vim.mode).toBe('normal')
    expect(lower.caretRequests).toEqual([1])
    expectImageCaret(lower.caretNodeId, lower.caret, 'node', false)

    const upper = await textFixture({ id: 'node', text: 'ab', children: [] }, 'visual')
    upper.input.setSelectionRange(0, 2)
    upper.vim.commandState.visualAnchor = 0
    upper.vim.commandState.visualFocus = 1

    upper.press('U')
    expect(upper.node().text).toBe('AB')
    expect(upper.caretRequests).toEqual([0])
    const image = await textFixture(
      { id: 'node', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
      'visual',
    )
    image.input.setSelectionRange(0, 2)
    image.vim.commandState.visualAnchor = 0
    image.vim.commandState.visualFocus = 1

    image.press('u')
    expect(image.node().text).toBe('ab')
    expect(image.node().attachment?.id).toBe('image')
    expect(image.caretRequests).toEqual([0])
    expectImageCaret(image.caretNodeId, image.caret, 'node', false)
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

  it('resyncs the image caret after entering a node with Cmd+.', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'text'
    const { handle, vim } = vimHandler(store, { id: 'node', text: 'text', children: [] })

    handle(keyEvent(input, '.', { metaKey: true }))

    expect(store.enter).toHaveBeenCalledOnce()
    expect(vim.syncImageCaretToFocus).toHaveBeenCalledOnce()
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

  it('copies a non-empty plain-text selection through the store', async () => {
    const { store, node, clipboard } = await createRealStoreHarness({
      document: { roots: [{ id: 'node', text: 'text', children: [] }] },
    })
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(0, 4)
    const { handle } = handler(store, node())

    const event = keyEvent(input, 'c', { metaKey: true })
    handle(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(clipboard.written?.text).toBe('text'))
    expect(node().text).toBe('text')
  })

  it('cuts a non-empty plain-text selection through the store', async () => {
    const { store, node, clipboard } = await createRealStoreHarness({
      document: { roots: [{ id: 'node', text: 'text', children: [] }] },
    })
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(0, 4)
    const { handle } = handler(store, node())

    const event = keyEvent(input, 'x', { metaKey: true })
    handle(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(node().text).toBe(''))
    expect(clipboard.written?.text).toBe('text')
    store.undo()
    expect(node().text).toBe('text')
  })

  it('pastes the clipboard through the store on Cmd+V', async () => {
    const { store, node, clipboard } = await createRealStoreHarness({
      document: { roots: [{ id: 'node', text: 'text', children: [] }] },
    })
    clipboard.current = { kind: 'text', text: 'XY' }
    const input = document.createElement('textarea')
    input.value = 'text'
    input.setSelectionRange(2, 2)
    const { handle } = handler(store, node())

    const event = keyEvent(input, 'v', { metaKey: true })
    handle(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(node().text).toBe('teXYxt'))
    store.undo()
    expect(node().text).toBe('text')
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
    const { handle, onPreviewAttachment, caret, caretNodeId } = vimHandler(store, node)

    handle(keyEvent(input, '3'))
    handle(keyEvent(input, 'l'))
    handle(keyEvent(input, 'l'))
    handle(keyEvent(input, 'l'))
    expect(input.selectionStart).toBe(6)
    expect(input.selectionEnd).toBe(6)
    expectImageCaret(caretNodeId, caret, 'node', true)

    const enter = keyEvent(input, 'Enter')
    handle(enter)
    expect(onPreviewAttachment).toHaveBeenCalledOnce()
    expect(onPreviewAttachment).toHaveBeenCalledWith('image')
    expect(store.createSiblingOrFirstChild).not.toHaveBeenCalled()
    expect(enter.preventDefault).toHaveBeenCalledOnce()

    handle(keyEvent(input, 'h'))
    expect(input.selectionStart).toBe(5)
    expect(input.selectionEnd).toBe(6)
    expectImageCaret(caretNodeId, caret, 'node', false)
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
    const { handle, caret, caretNodeId } = vimHandler(store, node)

    handle(keyEvent(input, 'j'))
    input.classList.add('node-input-image-caret')
    handle(keyEvent(input, 'h'))

    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(2)
    expectImageCaret(caretNodeId, caret, 'node', false)
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
    const { handle, caret, caretNodeId } = vimHandler(store, node)

    handle(keyEvent(input, 'j'))
    expect(input.selectionStart).toBe(4)
    expect(store.moveSelection).not.toHaveBeenCalled()
    expectImageCaret(caretNodeId, caret, 'node', true)

    handle(keyEvent(input, 'k'))
    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(2)
    expect(store.moveSelection).not.toHaveBeenCalled()
    expectImageCaret(caretNodeId, caret, 'node', false)
    row.remove()
  })

  it('keeps j on an image at the default next-node motion and uses k for an image-only previous node', async () => {
    const image: TreeNode = {
      id: 'node',
      text: 'text',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    }
    const first = await textFixture(image)
    const initialFocus = first.snapshot().focus
    first.input.setSelectionRange(4, 4)
    first.input.classList.add('node-input-image-caret')
    first.press('j')
    expect(first.snapshot().location.selectedNodeId).toBe('node')
    expect(first.snapshot().focus).toEqual(initialFocus)
    expectImageCaret(first.caretNodeId, first.caret, 'node', true)

    const imageOnly = {
      id: 'image-only',
      text: '',
      attachment: { id: 'image', mimeType: 'image/png' as const },
      children: [],
    }
    const second = await textFixture(imageOnly, 'normal', {
      document: { roots: [{ id: 'previous', text: 'Previous', children: [] }, imageOnly] },
      location: { currentParentId: null, selectedNodeId: 'image-only' },
    })
    second.press('k')
    expect(second.snapshot().location.selectedNodeId).toBe('previous')
    expect(second.snapshot().focus).toMatchObject({ nodeId: 'previous', cursor: 0 })
    expectImageCaret(second.caretNodeId, second.caret, 'previous', false)
  })

  it('restores a valid text character after an oversized counted l enters an image', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    input.value = 'abcd'
    input.setSelectionRange(1, 2)
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    row.append(input)
    document.body.append(row)
    const { handle, vim, caret, caretNodeId } = vimHandler(store, {
      id: 'node',
      text: input.value,
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, '9'))
    handle(keyEvent(input, 'l'))
    expect(input.selectionStart).toBe(4)
    expect(vim.imageTextCursor.current).toBe(3)
    input.classList.add('node-input-image-caret')
    handle(keyEvent(input, 'h'))
    expect(input.selectionStart).toBe(3)
    expect(input.selectionEnd).toBe(4)
    expectImageCaret(caretNodeId, caret, 'node', false)
    row.remove()
  })

  it('does not save a text return position for an image-only node before its caret class settles', () => {
    const store = createStore()
    const input = document.createElement('textarea')
    const { handle, vim, caret, caretNodeId } = vimHandler(store, {
      id: 'node',
      text: '',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    })

    handle(keyEvent(input, 'l'))
    expect(vim.imageTextCursor.current).toBeUndefined()
    expect(input.selectionStart).toBe(0)
    expectImageCaret(caretNodeId, caret, 'node', true)
  })

  it('starts the next node at its text caret when j leaves an active image', async () => {
    const image: TreeNode = {
      id: 'root-image',
      text: 'Root',
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [],
    }
    const { snapshot, input, press, caret, caretNodeId } = await textFixture(image, 'normal', {
      document: { roots: [image, { id: 'next', text: 'Next', children: [] }] },
    })
    input.setSelectionRange(3, 3)
    input.classList.add('node-input-image-caret')
    press('j')
    expect(snapshot().location.selectedNodeId).toBe('next')
    expect(snapshot().focus).toMatchObject({ nodeId: 'next', cursor: 0 })
    expectImageCaret(caretNodeId, caret, 'next', false)
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
    vim.commandState.pending = { count: '3', motionCount: '' }

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
