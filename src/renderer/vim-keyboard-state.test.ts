// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRealStoreHarness } from './test/real-store-harness'
import type { NodeVisualSelection } from './node-input-types'
import type { VimCaretState } from './vim-caret-transition'
import { createVimCommandState } from './vim-command-state'
import { createVimEditSessionState } from './vim-edit-session'
import { createVimKeyboardState } from './vim-keyboard-state'

afterEach(() => document.body.replaceChildren())

function input(text = 'hello'): HTMLTextAreaElement {
  const element = document.createElement('textarea')
  element.value = text
  document.body.append(element)
  return element
}

async function fixture(selection?: NodeVisualSelection, text = 'hello', unavailable = false) {
  const harness = await createRealStoreHarness({
    document: { roots: [{ id: 'node', text, children: [{ id: 'child', text: 'child', children: [] }] }] },
    ...(unavailable
      ? {
          services: {
            load: async () => {
              throw new Error('load failed')
            },
          },
        }
      : {}),
  })
  const session = createVimEditSessionState()
  const commandState = createVimCommandState()
  const authority: { nodeId?: string; caret: VimCaretState } = {
    nodeId: 'node',
    caret: { cursor: 2, imageActive: true, imageTextReturnCursor: 1 },
  }
  const deps = {
    store: harness.store,
    vimMode: 'normal' as const,
    registerHandle: {
      get current() {
        return session.register
      },
      set current(value) {
        session.register = value
      },
    },
    commandState,
    session,
    readAuthority: () => authority,
    finishVimInsert: vi.fn(),
    finishVimReplace: vi.fn(() => true),
    applyCaretState: vi.fn(),
    syncImageCaretToFocus: vi.fn(),
    moveVimViewport: vi.fn(),
    changeVimMode: vi.fn(),
    onPreviewAttachment: vi.fn(),
    schedulePendingCaret: vi.fn(),
    nodeVisualSelection: selection,
    setNodeVisualSelection: vi.fn(),
    moveNodeVisual: vi.fn(),
    commandNodeVisual: vi.fn(),
    shiftNodeVisual: vi.fn(),
    joinNodeVisual: vi.fn(),
    shiftCurrentNode: vi.fn(),
    restoreVisual: vi.fn(),
    verticalOperator: vi.fn(),
    repeatStructural: vi.fn(() => true),
    onFoldCommand: vi.fn(),
  } satisfies Parameters<typeof createVimKeyboardState>[0]
  const vim = createVimKeyboardState(deps, { id: 'node', text, children: [] })
  return { ...harness, session, commandState, authority, deps, vim }
}

describe('live caret and owner wiring', () => {
  it('retains owner and register accessors without copying their state', async () => {
    const f = await fixture()
    expect(f.vim.mode).toBe('normal')
    expect(f.vim.commandState).toBe(f.commandState)
    expect(Object.getOwnPropertyDescriptor(f.vim, 'commandState')?.get).toBeTypeOf('function')
    expect(f.vim.register).toBe(f.deps.registerHandle)
    f.vim.register.current = { kind: 'text', value: 'saved' }
    expect(f.session.register).toEqual({ kind: 'text', value: 'saved' })
    expect(f.vim.register.current).toBe(f.session.register)
  })

  it('uses current authority for the same node and caller state for another node', async () => {
    const f = await fixture()
    expect(f.vim.getCaretState('node', 4, false)).toEqual({ cursor: 4, imageActive: true, imageTextReturnCursor: 1 })
    expect(f.vim.getCaretState('other', 3, false)).toEqual({
      cursor: 3,
      imageActive: false,
      imageTextReturnCursor: undefined,
    })
    f.authority.caret = { cursor: 0, imageActive: false, imageTextReturnCursor: 3 }
    expect(f.vim.getCaretState('node', 1, true)).toEqual({ cursor: 1, imageActive: false, imageTextReturnCursor: 3 })
    expect(f.vim.imageTextCursor.current).toBe(3)
  })

  it('publishes return-cursor changes only for an attached authority and preserves selection', async () => {
    const f = await fixture()
    f.vim.imageTextCursor.current = 4
    expect(f.deps.applyCaretState).toHaveBeenCalledWith(
      'node',
      { ...f.authority.caret, imageTextReturnCursor: 4 },
      false,
      'preserve-selection',
    )
    f.vim.imageTextCursor.current = undefined
    expect(f.deps.applyCaretState).toHaveBeenLastCalledWith(
      'node',
      { ...f.authority.caret, imageTextReturnCursor: undefined },
      false,
      'preserve-selection',
    )
    delete f.authority.nodeId
    f.deps.applyCaretState.mockClear()
    f.vim.imageTextCursor.current = 7
    expect(f.deps.applyCaretState).not.toHaveBeenCalled()
  })

  it.each([
    { active: true, text: 'hello', cursor: 2, expected: 5, returnCursor: 1 },
    { active: false, text: 'hello', cursor: 9, expected: 4, returnCursor: undefined },
    { active: false, text: 'hello', cursor: 2, expected: 2, returnCursor: undefined },
    { active: false, text: '', cursor: 9, expected: 0, returnCursor: undefined },
  ])(
    'projects image state at the text boundary: $active/$text/$cursor',
    async ({ active, text, cursor, expected, returnCursor }) => {
      const f = await fixture(undefined, text)
      f.authority.caret.cursor = cursor
      f.vim.setImageCaret('node', active, true)
      expect(f.deps.applyCaretState).toHaveBeenCalledWith(
        'node',
        { cursor: expected, imageActive: active, imageTextReturnCursor: returnCursor },
        true,
      )
    },
  )

  it('schedules the adapter node and the supplied native input', async () => {
    const f = await fixture()
    const element = input()
    f.vim.scheduleCaret(element, 3)
    expect(f.deps.schedulePendingCaret).toHaveBeenCalledWith({ nodeId: 'node', input: element, cursor: 3 })
  })
})

describe('session and command ports', () => {
  it('begins Insert on the shared session and forwards completion', async () => {
    const f = await fixture()
    const element = input()
    f.vim.beginInsert('node', 'hello', 2, { kind: 'insert', entry: 'i' })
    expect(f.session.insert).toMatchObject({
      nodeId: 'node',
      baseline: 'hello',
      position: 2,
      change: { kind: 'insert', entry: 'i' },
    })
    f.vim.finishInsert(element, true)
    expect(f.deps.finishVimInsert).toHaveBeenCalledWith(element, true)
  })

  it('projects accepted Replace keys and rejects keys without pending work', async () => {
    const f = await fixture()
    const element = input()
    expect(f.vim.handleReplaceKey(element, 'X')).toBe(false)
    f.vim.beginReplace('node', element, 'hello', 1)
    expect(f.session.replace).toMatchObject({ nodeId: 'node', baseline: 'hello', position: 1 })
    expect(f.vim.handleReplaceKey(element, 'ArrowLeft')).toBe(false)
    expect(element.value).toBe('hello')
    expect(f.vim.handleReplaceKey(element, 'X')).toBe(true)
    expect(element.value).toBe('hXllo')
    expect(element.selectionStart).toBe(2)
    expect(element.selectionEnd).toBe(2)
    expect(f.vim.finishReplace(element, true, true)).toBe(true)
    expect(f.deps.finishVimReplace).toHaveBeenCalledWith(element, true, true)
  })

  it('moves the real store boundary before synchronizing image focus', async () => {
    const f = await fixture()
    f.store.enter()
    f.deps.syncImageCaretToFocus.mockImplementation(() => expect(f.snapshot().location.selectedNodeId).toBe('node'))
    f.vim.moveBoundary('parent', 1, 1)
    expect(f.snapshot().location.selectedNodeId).toBe('node')
    expect(f.deps.syncImageCaretToFocus).toHaveBeenCalledOnce()
  })

  it('forwards navigation, attachment, caret and Visual command arguments', async () => {
    const f = await fixture()
    const caret = { cursor: 2, imageActive: false }
    f.vim.applyCaretState('child', caret, false, 'after-edit')
    expect(f.deps.applyCaretState).toHaveBeenCalledWith('child', caret, false, 'after-edit')
    f.vim.moveViewport('child', 'middle', 2, 3)
    expect(f.deps.moveVimViewport).toHaveBeenCalledWith('child', 'middle', 2, 3)
    f.vim.syncImageCaretToFocus()
    expect(f.deps.syncImageCaretToFocus).toHaveBeenCalledOnce()
    f.vim.setMode('insert')
    expect(f.deps.changeVimMode).toHaveBeenCalledWith('insert')
    f.vim.openAttachment('image')
    expect(f.deps.onPreviewAttachment).toHaveBeenCalledWith('image')
    f.vim.nodeVisual.move('down', 2)
    expect(f.deps.moveNodeVisual).toHaveBeenCalledWith('down', 2)
    f.vim.nodeVisual.command('d', 2)
    expect(f.deps.commandNodeVisual).toHaveBeenCalledWith('d', 2)
    f.vim.nodeVisual.shift('in', 3)
    expect(f.deps.shiftNodeVisual).toHaveBeenCalledWith('in', 3)
    f.vim.nodeVisual.join(true)
    expect(f.deps.joinNodeVisual).toHaveBeenCalledWith(true)
    f.vim.shiftCurrentNode('node', 'out', 2, { start: 1, end: 3 })
    expect(f.deps.shiftCurrentNode).toHaveBeenCalledWith('node', 'out', 2, { start: 1, end: 3 })
    f.vim.restoreVisual()
    expect(f.deps.restoreVisual).toHaveBeenCalledOnce()
    f.vim.verticalOperator('node', 'd', 'down', 2)
    expect(f.deps.verticalOperator).toHaveBeenCalledWith('node', 'd', 'down', 2)
    const change = { kind: 'structural-open' as const, position: 'after' as const, text: 'new' }
    expect(f.vim.repeatStructural(change, 1)).toBe(true)
    expect(f.deps.repeatStructural).toHaveBeenCalledWith(change, 1)
    f.vim.fold('toggle', 'node')
    expect(f.deps.onFoldCommand).toHaveBeenCalledWith('toggle', 'node')
  })
})

describe('whole-node Visual and structural owners', () => {
  // @requirement PRODUCT.md §23.14
  it('enters only a valid active Agenda occurrence and swaps Agenda focus without Tree visual memory', async () => {
    const f = await fixture({ anchorId: 'node', focusId: 'node' }, '2026-10-14 hello')
    f.store.openAgenda()
    expect(f.vim.nodeVisual.enter('node')).toBe(false)
    f.vim.nodeVisual.swap()
    expect(f.deps.syncImageCaretToFocus).not.toHaveBeenCalled()
    const key = f.store.getAgendaRows().find((row) => row.kind === 'node' && row.nodeId === 'node')!.key
    f.store.applyAgenda({ kind: 'select', key })
    expect(f.vim.nodeVisual.enter('node')).toBe(true)
    expect(f.commandState.lastVisual).toBeUndefined()
    f.vim.nodeVisual.swap()
    expect(f.deps.syncImageCaretToFocus).toHaveBeenCalledOnce()
    f.store.editText('node', 'no date')
    expect(f.vim.nodeVisual.enter('node')).toBe(false)
  })
  it('enters and remembers a node range, then exits', async () => {
    const f = await fixture()
    expect(f.vim.nodeVisual.enter('node')).toBe(true)
    expect(f.deps.setNodeVisualSelection).toHaveBeenCalledWith({ anchorId: 'node', focusId: 'node' })
    expect(f.commandState.lastVisual).toEqual({ kind: 'nodes', anchorId: 'node', focusId: 'node', ids: ['node'] })
    f.vim.nodeVisual.exit()
    expect(f.deps.setNodeVisualSelection).toHaveBeenLastCalledWith(undefined)
  })

  it('refuses the current-parent heading', async () => {
    const f = await fixture()
    f.store.enter()
    expect(f.vim.nodeVisual.enter('node')).toBe(false)
    expect(f.deps.setNodeVisualSelection).not.toHaveBeenCalled()
  })

  it('swaps the render-time selection only when present', async () => {
    const f = await fixture({ anchorId: 'node', focusId: 'child' })
    f.commandState.lastVisual = { kind: 'nodes', anchorId: 'node', focusId: 'child', ids: ['node', 'child'] }
    f.vim.nodeVisual.swap()
    expect(f.deps.setNodeVisualSelection).toHaveBeenCalledWith({ anchorId: 'child', focusId: 'node' })
    expect(f.commandState.lastVisual).toEqual({
      kind: 'nodes',
      anchorId: 'child',
      focusId: 'node',
      ids: ['node', 'child'],
    })
    const absent = await fixture()
    absent.vim.nodeVisual.swap()
    expect(absent.deps.setNodeVisualSelection).not.toHaveBeenCalled()
  })

  it('starts structural open and child-open on the adapter node', async () => {
    const f = await fixture()
    f.vim.beginStructuralOpen('before')
    expect(f.commandState.structuralInsert).toEqual({ kind: 'open', originNodeId: 'node', position: 'before' })
    f.vim.beginStructuralChildOpen()
    expect(f.commandState.structuralInsert).toEqual({ kind: 'child-open', originNodeId: 'node' })
  })

  it('refuses image projection and Visual entry when the store is unavailable', async () => {
    const f = await fixture(undefined, 'hello', true)
    expect(f.store.getSnapshot().status).toBe('error')
    f.vim.setImageCaret('node', true)
    expect(f.deps.applyCaretState).not.toHaveBeenCalled()
    expect(f.vim.nodeVisual.enter('node')).toBe(false)
    expect(f.deps.setNodeVisualSelection).not.toHaveBeenCalled()
  })
})
