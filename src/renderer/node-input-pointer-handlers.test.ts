// @vitest-environment jsdom

import type { MouseEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../domain/document'
import { getCaret, setCaret } from './editor-dom'
import { createPointerHandlers } from './node-input-pointer-handlers'
import { createRealStoreHarness } from './test/real-store-harness'
import { beginStructuralOpen, createVimCommandState } from './vim-command-state'
import { pointerCaretTransition, type VimCaretState } from './vim-caret-transition'
import type { VimMode } from './vim-editing'
import type { VimTextCommandState } from './editor-input-handlers'

afterEach(() => {
  document.body.replaceChildren()
  window.treeApi = undefined as never
  vi.restoreAllMocks()
})

function textarea(text: string, cursor = text.length) {
  const input = document.createElement('textarea')
  input.value = text
  document.body.append(input)
  input.setSelectionRange(cursor, cursor)
  return input
}

function richInput(text: string, cursor = text.length, hasAttachment = false) {
  const row = document.createElement('div')
  row.className = 'node-row'
  if (hasAttachment) row.dataset.hasAttachment = 'true'
  const input = document.createElement('div')
  input.contentEditable = 'true'
  input.textContent = text
  row.append(input)
  document.body.append(row)
  setCaret(input, cursor)
  return input
}

async function fixture(
  options: { mode?: VimMode; selectedNodeId?: string | undefined; node?: Partial<TreeNode> } = {},
) {
  const other: TreeNode = { id: 'other', text: 'other', children: [] }
  const node: TreeNode = { id: 'node', text: 'hello', children: [], ...options.node }
  const harness = await createRealStoreHarness({
    document: { roots: [node, other] },
    location: { currentParentId: null, selectedNodeId: 'node' },
  })
  let mode: VimMode = options.mode ?? 'insert'
  let authority: { nodeId?: string; caret: VimCaretState } = { caret: { cursor: 0, imageActive: false } }
  const inputs = new Map<string, HTMLElement>()
  const commandState = createVimCommandState()
  const vimTextCommandState: VimTextCommandState = {
    get mode() {
      return mode
    },
    commandState,
    finishReplace: vi.fn(() => true),
    setMode: vi.fn(),
  }
  const deps = {
    store: harness.store,
    selectedNodeId: 'selectedNodeId' in options ? options.selectedNodeId : 'node',
    persistenceLocked: false as boolean,
    vimMode: mode,
    commandState,
    vimTextCommandState,
    getMode: () => mode,
    getInput: (id: string) => inputs.get(id),
    readAuthority: () => authority,
    applyCaretState: vi.fn(),
    changeVimMode: vi.fn((next: VimMode) => {
      mode = next
    }),
    finishVimInsert: vi.fn(),
    finishVimReplace: vi.fn(() => true),
    setSelectAllNodeId: vi.fn(),
  } satisfies Parameters<typeof createPointerHandlers>[0]
  return {
    ...harness,
    deps,
    inputs,
    commandState,
    handlers: () => createPointerHandlers(deps, harness.node()),
    setMode: (value: VimMode) => {
      mode = value
    },
    setAuthority: (value: { nodeId?: string; caret: VimCaretState }) => {
      authority = value
    },
  }
}

function mouse(currentTarget: HTMLElement, extra: Record<string, unknown> = {}) {
  return { currentTarget, button: 0, preventDefault: vi.fn(), ...extra } as unknown as MouseEvent<HTMLElement>
}

describe('blur', () => {
  it('clears command assembly, finishes the session, and ends the text session', async () => {
    const f = await fixture()
    const input = textarea('hello')
    f.inputs.set('node', input)
    f.commandState.pending = { count: '2', motionCount: '' }
    const endTextSession = vi.spyOn(f.store, 'endTextSession')
    f.handlers().onBlur()
    expect(f.deps.setSelectAllNodeId).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(f.commandState.pending).toBeUndefined()
    expect(f.deps.finishVimInsert).toHaveBeenCalledExactlyOnceWith(input)
    expect(f.deps.finishVimReplace).toHaveBeenCalledExactlyOnceWith()
    expect(f.deps.changeVimMode).not.toHaveBeenCalled()
    expect(endTextSession).toHaveBeenCalledOnce()
  })

  it('does not finish Insert without a registered input', async () => {
    const f = await fixture()
    f.handlers().onBlur()
    expect(f.deps.finishVimInsert).not.toHaveBeenCalled()
    expect(f.deps.finishVimReplace).toHaveBeenCalledOnce()
  })

  it('leaves a structural session to the blur of the node it did not begin on', async () => {
    const f = await fixture()
    f.inputs.set('node', textarea('hello'))
    beginStructuralOpen(f.commandState, 'node', 'after')
    f.handlers().onBlur()
    expect(f.deps.finishVimInsert).not.toHaveBeenCalled()
    beginStructuralOpen(f.commandState, 'other', 'after')
    f.handlers().onBlur()
    expect(f.deps.finishVimInsert).toHaveBeenCalledOnce()
  })

  it.each([
    ['replace', 'normal'],
    ['insert', undefined],
    ['normal', undefined],
  ] as const)('handles %s mode by switching to %s', async (mode, expected) => {
    const f = await fixture({ mode })
    f.handlers().onBlur()
    if (expected === undefined) expect(f.deps.changeVimMode).not.toHaveBeenCalled()
    else expect(f.deps.changeVimMode).toHaveBeenCalledExactlyOnceWith(expected)
  })
})

describe('mouse down', () => {
  it('publishes the pointer caret without rewriting the selection and resets pointer-bound state', async () => {
    const f = await fixture()
    const input = textarea('hello', 2)
    f.inputs.set('node', input)
    input.classList.add('select-all')
    f.commandState.pending = { count: '', motionCount: '' }
    const endTextSession = vi.spyOn(f.store, 'endTextSession')
    const event = mouse(input)
    f.handlers().onMouseDown(event)
    expect(f.deps.applyCaretState).toHaveBeenCalledExactlyOnceWith(
      'node',
      expect.objectContaining({ cursor: 2 }),
      false,
      'preserve-selection',
    )
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(f.deps.setSelectAllNodeId).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(input.classList.contains('select-all')).toBe(false)
    expect(endTextSession).toHaveBeenCalledOnce()
    expect(f.deps.finishVimInsert).toHaveBeenCalledExactlyOnceWith(input)
    expect(f.deps.finishVimReplace).toHaveBeenCalledExactlyOnceWith(input, false, false)
    expect(f.commandState.pending).toBeUndefined()
  })

  it('keeps the visible selection and DOM on a right click', async () => {
    const f = await fixture()
    const input = textarea('hello', 1)
    const event = mouse(input, { button: 2 })
    f.handlers().onMouseDown(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(f.deps.finishVimReplace).toHaveBeenCalledExactlyOnceWith(input, false, true)
  })

  it('leaves a structural session to the focused input blur', async () => {
    const f = await fixture()
    beginStructuralOpen(f.commandState, 'node', 'after')
    f.handlers().onMouseDown(mouse(textarea('hello')))
    expect(f.deps.finishVimInsert).not.toHaveBeenCalled()
    expect(f.commandState.structuralInsert).toBeDefined()
  })

  it('reads the caret authority at event time', async () => {
    const f = await fixture()
    const readAuthority = vi.spyOn(f.deps, 'readAuthority')
    const handlers = f.handlers()
    expect(readAuthority).not.toHaveBeenCalled()
    handlers.onMouseDown(mouse(textarea('hello', 1)))
    expect(readAuthority).toHaveBeenCalledOnce()
    const expected = pointerCaretTransition({ cursor: 0, imageActive: false }, 1, 5, false)
    expect(f.deps.applyCaretState).toHaveBeenCalledExactlyOnceWith('node', expected, false, 'preserve-selection')
  })
})

describe('mouse up', () => {
  it.each(['insert', 'replace', 'visual'] as const)('does nothing outside Normal mode (%s)', async (mode) => {
    const f = await fixture({ mode })
    f.handlers().onMouseUp(mouse(textarea('hello')))
    expect(f.deps.applyCaretState).not.toHaveBeenCalled()
  })

  it('publishes the pointer caret in Normal mode', async () => {
    const f = await fixture({ mode: 'normal' })
    f.handlers().onMouseUp(mouse(textarea('hello', 3)))
    expect(f.deps.applyCaretState).toHaveBeenCalledExactlyOnceWith(
      'node',
      expect.objectContaining({ cursor: 3 }),
      false,
      'preserve-selection',
    )
  })

  it('reads the mode at event time', async () => {
    const f = await fixture({ mode: 'insert' })
    const handlers = f.handlers()
    f.setMode('normal')
    handlers.onMouseUp(mouse(textarea('hello')))
    expect(f.deps.applyCaretState).toHaveBeenCalledOnce()
  })
})

describe('focus', () => {
  it('selects a node that is not the selected one at the focus caret', async () => {
    const f = await fixture({ selectedNodeId: 'other' })
    f.handlers().onFocus({ currentTarget: textarea('hello', 4) } as never)
    expect(f.snapshot().location.selectedNodeId).toBe('node')
    expect(f.snapshot().focus?.cursor).toBe(4)
  })

  it('does not select again when the node is already selected', async () => {
    const f = await fixture()
    const selectNode = vi.spyOn(f.store, 'selectNode')
    f.handlers().onFocus({ currentTarget: textarea('hello') } as never)
    expect(selectNode).not.toHaveBeenCalled()
  })

  it('redraws the Normal caret at the terminal position of an attached node', async () => {
    const f = await fixture({
      mode: 'normal',
      node: { attachment: { id: 'image', mimeType: 'image/png' } },
    })
    const input = richInput('hello', 5, true)
    input.focus()
    setCaret(input, 0)
    setCaret(input, 5)
    f.handlers().onFocus({ currentTarget: input } as never)
    expect(getCaret(input)).toBe(5)
    expect(getSelection()?.isCollapsed).toBe(true)
  })

  it.each([
    ['text without an attachment', 'normal', undefined, 5],
    ['a caret before the end', 'normal', { id: 'image', mimeType: 'image/png' as const }, 2],
    ['a non-Normal mode', 'insert', { id: 'image', mimeType: 'image/png' as const }, 5],
  ] as const)('leaves the caret alone for %s', async (_name, mode, attachment, cursor) => {
    const f = await fixture({ mode, node: attachment === undefined ? {} : { attachment } })
    const input = richInput('hello', cursor, attachment !== undefined)
    f.handlers().onFocus({ currentTarget: input } as never)
    expect(getCaret(input)).toBe(cursor)
  })
})

describe('select', () => {
  it('ignores selection changes in Normal mode', async () => {
    const f = await fixture({ mode: 'normal' })
    const endTextSession = vi.spyOn(f.store, 'endTextSession')
    const input = textarea('hello', 0)
    input.setSelectionRange(0, 3)
    f.handlers().onSelect({ currentTarget: input } as never)
    expect(endTextSession).not.toHaveBeenCalled()
  })

  it('ends the text session only for a non-collapsed textarea selection', async () => {
    const f = await fixture()
    const endTextSession = vi.spyOn(f.store, 'endTextSession')
    const input = textarea('hello', 2)
    f.handlers().onSelect({ currentTarget: input } as never)
    expect(endTextSession).not.toHaveBeenCalled()
    input.setSelectionRange(0, 3)
    f.handlers().onSelect({ currentTarget: input } as never)
    expect(endTextSession).toHaveBeenCalledOnce()
  })

  it('ends the text session only for a non-collapsed rich selection', async () => {
    const f = await fixture()
    const endTextSession = vi.spyOn(f.store, 'endTextSession')
    const input = richInput('hello', 2)
    f.handlers().onSelect({ currentTarget: input } as never)
    expect(endTextSession).not.toHaveBeenCalled()
    const range = document.createRange()
    range.setStart(input.firstChild!, 0)
    range.setEnd(input.firstChild!, 3)
    getSelection()?.removeAllRanges()
    getSelection()?.addRange(range)
    f.handlers().onSelect({ currentTarget: input } as never)
    expect(endTextSession).toHaveBeenCalledOnce()
  })
})

describe('paste', () => {
  it('finishes the Vim session, cancels the native paste, and pastes through the store', async () => {
    const f = await fixture({ mode: 'replace' })
    f.clipboard.current = { kind: 'text', text: ' world' }
    const input = textarea('hello', 5)
    const event = { currentTarget: input, preventDefault: vi.fn() } as never
    f.handlers().onPaste(event)
    expect(f.deps.setSelectAllNodeId).toHaveBeenCalledExactlyOnceWith(undefined)
    expect((event as { preventDefault: () => void }).preventDefault).toHaveBeenCalledOnce()
    expect(f.deps.vimTextCommandState.finishReplace).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(f.node().text).toBe('hello world'))
  })

  it('reports a failed paste through the store', async () => {
    const f = await fixture()
    const failure = new Error('paste failed')
    vi.spyOn(f.store, 'paste').mockRejectedValue(failure)
    const reportError = vi.spyOn(f.store, 'reportError')
    f.handlers().onPaste({ currentTarget: textarea('hello'), preventDefault: vi.fn() } as never)
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledExactlyOnceWith(failure))
  })
})

describe('cut', () => {
  it('marks the next text edit standalone', async () => {
    const f = await fixture()
    const mark = vi.spyOn(f.store, 'markNextTextEditStandalone')
    f.handlers().onCut()
    expect(mark).toHaveBeenCalledOnce()
  })
})

describe('link click', () => {
  function linkInput() {
    const input = document.createElement('div')
    input.innerHTML = 'see <a href="https://example.test">link</a>'
    document.body.append(input)
    return { input, link: input.querySelector('a')! }
  }

  it('prevents navigation when a link is clicked and does not open it without Cmd', async () => {
    const f = await fixture()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { input, link } = linkInput()
    const event = { target: link, currentTarget: input, metaKey: false, preventDefault: vi.fn() } as never
    f.handlers().onClick(event)
    expect((event as { preventDefault: () => void }).preventDefault).toHaveBeenCalledOnce()
    expect(open).not.toHaveBeenCalled()
  })

  it('opens the link in a new window on Cmd+click', async () => {
    const f = await fixture()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { input, link } = linkInput()
    f.handlers().onClick({ target: link, currentTarget: input, metaKey: true, preventDefault: vi.fn() } as never)
    expect(open).toHaveBeenCalledExactlyOnceWith('https://example.test', '_blank')
  })

  it.each(['plain text', 'a link outside the input', 'a non-element target'] as const)(
    'ignores a click on %s',
    async (kind) => {
      const f = await fixture()
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      const { input } = linkInput()
      const outside = document.createElement('a')
      outside.href = 'https://outside.test'
      document.body.append(outside)
      const target = kind === 'plain text' ? input : kind === 'a link outside the input' ? outside : document
      const event = { target, currentTarget: input, metaKey: true, preventDefault: vi.fn() } as never
      f.handlers().onClick(event)
      expect((event as { preventDefault: () => void }).preventDefault).not.toHaveBeenCalled()
      expect(open).not.toHaveBeenCalled()
    },
  )
})

describe('context menu', () => {
  function menuEvent(input: HTMLElement) {
    return { currentTarget: input, clientX: 10, clientY: 20, preventDefault: vi.fn() } as never
  }

  it('does nothing while persistence is locked', async () => {
    const f = await fixture()
    f.deps.persistenceLocked = true
    const showEditorContextMenu = vi.fn()
    window.treeApi = { showEditorContextMenu } as never
    const event = menuEvent(textarea('hello'))
    f.handlers().onContextMenu(event)
    expect((event as { preventDefault: () => void }).preventDefault).not.toHaveBeenCalled()
    expect(showEditorContextMenu).not.toHaveBeenCalled()
  })

  it('suppresses the native menu but stays quiet when the API is unavailable', async () => {
    const f = await fixture()
    window.treeApi = {} as never
    const event = menuEvent(textarea('hello'))
    f.handlers().onContextMenu(event)
    expect((event as { preventDefault: () => void }).preventDefault).toHaveBeenCalledOnce()
  })

  it('requests a menu describing a textarea selection and runs the chosen command', async () => {
    const f = await fixture()
    const showEditorContextMenu = vi.fn(async () => 'copy' as const)
    window.treeApi = { showEditorContextMenu } as never
    const copy = vi.spyOn(f.store, 'copy').mockResolvedValue(true)
    const input = textarea('hello')
    input.setSelectionRange(1, 3)
    f.handlers().onContextMenu(menuEvent(input))
    expect(showEditorContextMenu).toHaveBeenCalledExactlyOnceWith({
      x: 10,
      y: 20,
      selectionText: 'el',
      canCut: true,
      canCopy: true,
      canPaste: true,
      canSelectAll: true,
    })
    await vi.waitFor(() => expect(copy).toHaveBeenCalledExactlyOnceWith('node', 1, 3))
  })

  it('describes an empty rich input as having nothing to cut, copy, or select', async () => {
    const f = await fixture()
    const showEditorContextMenu = vi.fn(async () => 'selectAll' as const)
    window.treeApi = { showEditorContextMenu } as never
    const input = richInput('', 0)
    f.handlers().onContextMenu(menuEvent(input))
    expect(showEditorContextMenu).toHaveBeenCalledExactlyOnceWith({
      x: 10,
      y: 20,
      selectionText: '',
      canCut: false,
      canCopy: false,
      canPaste: true,
      canSelectAll: false,
    })
  })

  it('describes a rich input with the page selection text, or none when the page has no selection', async () => {
    const f = await fixture()
    const showEditorContextMenu = vi.fn(async () => 'selectAll' as const)
    window.treeApi = { showEditorContextMenu } as never
    const input = richInput('hello', 0)
    vi.spyOn(window, 'getSelection').mockReturnValue(null)
    f.handlers().onContextMenu(menuEvent(input))
    expect(showEditorContextMenu).toHaveBeenCalledWith(expect.objectContaining({ selectionText: '' }))
  })

  it('reports a failing menu round trip through the store', async () => {
    const f = await fixture()
    const failure = new Error('menu failed')
    window.treeApi = { showEditorContextMenu: vi.fn(async () => Promise.reject(failure)) } as never
    const reportError = vi.spyOn(f.store, 'reportError')
    f.handlers().onContextMenu(menuEvent(textarea('hello')))
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledExactlyOnceWith(failure))
  })
})
