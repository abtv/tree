import { describe, expect, it } from 'vitest'
import type { VimFindCommand, VimPendingCommand, VimRepeatChange } from './vim-keyboard-types'
import {
  beginStructuralChildOpen,
  beginStructuralOpen,
  beginStructuralVisual,
  clearCommandAssembly,
  clearPending,
  clearVisualRange,
  createVimCommandState,
  recordRepeatChange,
  rememberNodeVisual,
  rememberTextVisual,
  setVisualRange,
  structuralRepeatChange,
  swapNodeVisual,
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

describe('Visual memory for gv', () => {
  it('writes the live endpoints and the memory together and survives every clear', () => {
    const state = createVimCommandState()
    setVisualRange(state, 'a', 2, 0, true)
    expect([state.visualAnchor, state.visualFocus]).toEqual([2, 0])
    expect(state.lastVisual).toEqual({ kind: 'text', nodeId: 'a', anchor: 2, focus: 0, hadText: true })
    clearVisualRange(state)
    clearCommandAssembly(state)
    expect(state.visualAnchor).toBeUndefined()
    expect(state.lastVisual).toEqual({ kind: 'text', nodeId: 'a', anchor: 2, focus: 0, hadText: true })
  })

  it('keeps only the latest selection, whatever its kind', () => {
    const state = createVimCommandState()
    setVisualRange(state, 'a', 0, 1, true)
    rememberNodeVisual(state, 'b', 'c', ['b', 'c'])
    expect(state.lastVisual).toEqual({ kind: 'nodes', anchorId: 'b', focusId: 'c', ids: ['b', 'c'] })
    rememberTextVisual(state, 'a', 3, 5, true)
    expect(state.lastVisual).toEqual({ kind: 'text', nodeId: 'a', anchor: 3, focus: 5, hadText: true })
  })

  it('exchanges the ends of a remembered whole-node range and leaves any other memory alone', () => {
    const state = createVimCommandState()
    swapNodeVisual(state)
    expect(state.lastVisual).toBeUndefined()
    rememberNodeVisual(state, 'b', 'c', ['b', 'c'])
    swapNodeVisual(state)
    expect(state.lastVisual).toEqual({ kind: 'nodes', anchorId: 'c', focusId: 'b', ids: ['b', 'c'] })
    setVisualRange(state, 'a', 0, 2, true)
    swapNodeVisual(state)
    expect(state.lastVisual).toEqual({ kind: 'text', nodeId: 'a', anchor: 0, focus: 2, hadText: true })
  })

  it('remembers a text selection without making it the live Visual range', () => {
    const state = createVimCommandState()
    rememberTextVisual(state, 'a', 1, 2, true)
    expect(state.visualAnchor).toBeUndefined()
    expect(state.visualFocus).toBeUndefined()
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

describe('clearCommandAssembly', () => {
  it('clears the pending command and both Visual endpoints together and leaves repeat and insert state alone', () => {
    const state = populatedState()
    clearCommandAssembly(state)
    expect(state.pending).toBeUndefined()
    expect(state.visualAnchor).toBeUndefined()
    expect(state.visualFocus).toBeUndefined()
    expect(state.lastChange).toBe(change)
    expect(state.lastFind).toBe(find)
    expect(state.structuralInsert).toEqual({ kind: 'open', originNodeId: 'a', position: 'after' })
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
