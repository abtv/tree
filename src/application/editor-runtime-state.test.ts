import { describe, expect, it, vi } from 'vitest'
import { buildNodeIndex, createInitialDocument, toggleStarNode } from '../domain/document'
import { COLLAPSED_EXPANSION_STATE, expansionFromViews } from './expansion-state'
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

  // @requirement PRODUCT.md §2.4
  describe('showing the view that governs the location', () => {
    const starredWork = {
      roots: [
        {
          id: 'work',
          text: 'Work',
          starred: true as const,
          children: [{ id: 'project', text: 'Project', children: [{ id: 'task', text: 'Task', children: [] }] }],
        },
      ],
    }

    it('switches to the inherited view when a star disappears and moves a selection it hides', () => {
      const state = new EditorRuntimeState()
      state.replaceReady({
        status: 'ready',
        document: starredWork,
        location: { currentParentId: 'work', selectedNodeId: 'task' },
        focus: state.newFocus('task', 2),
        structuralVersion: 0,
        expansion: expansionFromViews([], [['work', ['project']]]),
      })

      expect(state.ready().expansion.viewOwnerId).toBe('work')
      expect(state.ready().location.selectedNodeId).toBe('task')

      const unstarred = toggleStarNode(starredWork, 'work')
      state.replaceReady({ ...state.ready(), document: unstarred })

      expect(state.ready().expansion.viewOwnerId).toBeNull()
      expect(state.ready().location).toEqual({ currentParentId: 'work', selectedNodeId: 'project' })
      expect(state.ready().focus).toMatchObject({ nodeId: 'project', cursor: 0, token: 2 })
    })

    it('keeps the snapshot’s view and selection when the governing view is unchanged', () => {
      const state = new EditorRuntimeState()
      const expansion = expansionFromViews([], [['work', ['project']]])
      state.replaceReady({
        status: 'ready',
        document: starredWork,
        location: { currentParentId: 'work', selectedNodeId: 'task' },
        focus: state.newFocus('task', 2),
        structuralVersion: 0,
        expansion,
      })
      const shown = state.ready().expansion

      state.replaceReady({ ...state.ready(), location: { currentParentId: 'project', selectedNodeId: 'task' } })

      expect(state.ready().expansion).toBe(shown)
      expect(state.ready().focus).toMatchObject({ nodeId: 'task', cursor: 2, token: 1 })
    })
  })

  describe('releasing the node index of a replaced document', () => {
    function readyState(document = createInitialDocument('root')): EditorRuntimeState {
      const state = new EditorRuntimeState()
      state.replaceReady({
        status: 'ready',
        document,
        location: { currentParentId: null, selectedNodeId: 'root' },
        focus: state.newFocus('root', 0),
        structuralVersion: 0,
        expansion: COLLAPSED_EXPANSION_STATE,
      })
      return state
    }

    it('drops the index of the previous document when the document changes', () => {
      const state = readyState()
      const previous = state.ready().document

      const cached = buildNodeIndex(previous)

      state.replaceReady({ ...state.ready(), document: createInitialDocument('other') })

      expect(buildNodeIndex(previous)).not.toBe(cached)
    })

    it('keeps the index when the same document is replaced by a new snapshot', () => {
      const state = readyState()
      const current = state.ready().document

      const cached = buildNodeIndex(current)

      state.replaceReady({ ...state.ready(), focus: state.newFocus('root', 1) })

      expect(buildNodeIndex(current)).toBe(cached)
    })

    it('does not touch the index of a document installed from the loading state', () => {
      const document = createInitialDocument('root')

      const cached = buildNodeIndex(document)

      readyState(document)

      expect(buildNodeIndex(document)).toBe(cached)
    })
  })
})
