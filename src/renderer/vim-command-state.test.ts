import { describe, expect, it } from 'vitest'
import type { VimFindCommand, VimPendingCommand, VimRepeatChange } from './vim-keyboard-types'
import {
  beginStructuralChildOpen,
  beginStructuralOpen,
  beginStructuralVisual,
  clearPending,
  clearVisualRange,
  createVimCommandHandles,
  createVimCommandState,
  recordRepeatChange,
  structuralRepeatChange,
  takeStructuralInsert,
  type VimCommandState,
} from './vim-command-state'

const pending: VimPendingCommand = { count: '2', operator: 'd', motionCount: '' }
const find: VimFindCommand = { kind: 'f', character: 'x' }
const change: VimRepeatChange = { kind: 'delete', motion: 'w', count: 1 }

function populatedState(): VimCommandState {
  const state = createVimCommandState()
  state.pending = { ...pending }
  state.lastChange = change
  state.lastFind = find
  state.visualAnchor = 1
  state.visualFocus = 3
  state.structuralInsert = { kind: 'open', originNodeId: 'a', position: 'after' }
  return state
}

describe('createVimCommandState', () => {
  it('starts with every slot empty', () => {
    const state = createVimCommandState()
    expect(state.pending).toBeUndefined()
    expect(state.lastChange).toBeUndefined()
    expect(state.lastFind).toBeUndefined()
    expect(state.visualAnchor).toBeUndefined()
    expect(state.visualFocus).toBeUndefined()
    expect(state.structuralInsert).toBeUndefined()
  })
})

describe('clearPending', () => {
  it('clears only the pending command and is idempotent', () => {
    const state = populatedState()
    clearPending(state)
    clearPending(state)
    expect(state.pending).toBeUndefined()
    expect(state.lastChange).toBe(change)
    expect(state.lastFind).toBe(find)
    expect(state.visualAnchor).toBe(1)
    expect(state.visualFocus).toBe(3)
    expect(state.structuralInsert).toEqual({ kind: 'open', originNodeId: 'a', position: 'after' })
  })
})

describe('recordRepeatChange', () => {
  it('stores the latest descriptor by reference', () => {
    const state = createVimCommandState()
    const first: VimRepeatChange = { kind: 'paste', after: true, text: 'one' }
    const second: VimRepeatChange = { kind: 'case', mode: 'toggle', count: 2 }
    recordRepeatChange(state, first)
    expect(state.lastChange).toBe(first)
    recordRepeatChange(state, second)
    expect(state.lastChange).toBe(second)
  })
})

describe('clearVisualRange', () => {
  it('clears both endpoints together and leaves every other slot alone', () => {
    const state = populatedState()
    clearVisualRange(state)
    expect(state.visualAnchor).toBeUndefined()
    expect(state.visualFocus).toBeUndefined()
    expect(state.lastChange).toBe(change)
    expect(state.lastFind).toBe(find)
  })
})

describe('structural insert session', () => {
  it('takes each begun kind exactly once and replaces a prior session', () => {
    const state = createVimCommandState()
    beginStructuralOpen(state, 'a', 'after')
    const open = takeStructuralInsert(state)
    expect(open).toEqual({ kind: 'open', originNodeId: 'a', position: 'after' })
    expect(takeStructuralInsert(state)).toBeUndefined()

    beginStructuralChildOpen(state, 'b')
    expect(takeStructuralInsert(state)).toEqual({ kind: 'child-open', originNodeId: 'b' })

    beginStructuralOpen(state, 'first', 'before')
    beginStructuralVisual(state, 'c', 'c', 4)
    expect(takeStructuralInsert(state)).toEqual({ kind: 'visual', originNodeId: 'c', command: 'c', span: 4 })
    expect(takeStructuralInsert(state)).toBeUndefined()
  })

  it('maps each session kind to its repeat-change descriptor', () => {
    expect(structuralRepeatChange({ kind: 'open', originNodeId: 'a', position: 'before' }, 'typed')).toEqual({
      kind: 'structural-open',
      position: 'before',
      text: 'typed',
    })
    expect(structuralRepeatChange({ kind: 'child-open', originNodeId: 'a' }, 'typed')).toEqual({
      kind: 'structural-child-open',
      text: 'typed',
    })
    expect(structuralRepeatChange({ kind: 'visual', originNodeId: 'a', command: 's', span: 3 }, 'typed')).toEqual({
      kind: 'structural-visual',
      command: 's',
      span: 3,
      text: 'typed',
    })
  })
})

describe('createVimCommandHandles', () => {
  it('reads and writes the owner at access time for every slot', () => {
    const state = createVimCommandState()
    const handles = createVimCommandHandles({ current: state })

    expect(handles.pending.current).toBeUndefined()
    expect(handles.lastChange.current).toBeUndefined()
    expect(handles.lastFind.current).toBeUndefined()
    expect(handles.visualAnchor.current).toBeUndefined()
    expect(handles.visualFocus.current).toBeUndefined()

    handles.pending.current = pending
    handles.lastChange.current = change
    handles.lastFind.current = find
    handles.visualAnchor.current = 0
    handles.visualFocus.current = 4
    expect(state.pending).toBe(pending)
    expect(state.lastChange).toBe(change)
    expect(state.lastFind).toBe(find)
    expect(state.visualAnchor).toBe(0)
    expect(state.visualFocus).toBe(4)

    state.pending = { count: '9', motionCount: '' }
    state.visualFocus = 2
    expect(handles.pending.current).toEqual({ count: '9', motionCount: '' })
    expect(handles.visualFocus.current).toBe(2)

    handles.pending.current = undefined
    expect(state.pending).toBeUndefined()
    expect(state.lastChange).toBe(change)
  })

  it('keeps a single owner shared by every accessor', () => {
    const state = createVimCommandState()
    const handles = createVimCommandHandles({ current: state })
    const second = createVimCommandHandles({ current: state })
    handles.visualAnchor.current = 7
    expect(second.visualAnchor.current).toBe(7)
    second.visualFocus.current = 8
    expect(state.visualAnchor).toBe(7)
    expect(state.visualFocus).toBe(8)
  })
})
