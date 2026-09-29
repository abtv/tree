import { describe, expect, it, vi } from 'vitest'
import { createInitialDocument } from '../domain/document'
import { COLLAPSED_EXPANSION_STATE } from './expansion-state'
import { EditorRuntimeState } from './editor-runtime-state'

describe('EditorRuntimeState', () => {
  it('owns focus tokens, structural versions, listener delivery, and error clearing', () => {
    const state = new EditorRuntimeState()
    const listener = vi.fn()
    const unsubscribe = state.subscribe(listener)
    expect(() => state.ready()).toThrow('The editor is not ready.')
    const document = createInitialDocument('root')
    state.replaceReady({
      status: 'ready',
      document,
      location: { currentParentId: null, selectedNodeId: 'root' },
      focus: state.newFocus('root', 0),
      structuralVersion: 0,
      expansion: COLLAPSED_EXPANSION_STATE,
      operationError: 'old error',
    })
    expect(state.ready().focus.token).toBe(1)
    expect(state.ready().operationError).toBeUndefined()
    expect(state.getStructuralVersion()).toBe(0)
    state.replaceReady({ ...state.ready(), focus: state.newFocus('root', 1) }, true)
    expect(state.ready().focus.token).toBe(2)
    expect(state.getStructuralVersion()).toBe(1)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    state.emit()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
