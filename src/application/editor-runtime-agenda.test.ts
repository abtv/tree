import { activeAgendaOccurrence, openAgendaState } from './agenda-state'
import { expect, it, vi } from 'vitest'
import * as agendaModule from './agenda-reconcile'
import { EditorRuntimeState, type ReadySnapshot } from './editor-runtime-state'
import { COLLAPSED_EXPANSION_STATE } from './expansion-state'
import { isValidLocation, type Document } from '../domain/document'

// @requirement PRODUCT.md §23.7
it('publishes the active Agenda node while preserving the recorded Tree origin', () => {
  const runtime = new EditorRuntimeState()
  const document: Document = {
    roots: [
      { id: 'origin', text: 'Origin', children: [] },
      { id: 'active', text: '1970-04-11', children: [] },
    ],
  }
  const location = { currentParentId: null, selectedNodeId: 'origin' }
  const agenda = {
    ...openAgendaState(location, 4, 100),
    selectedKey: 'node:100:active',
    activity: { kind: 'dated' as const, occurrence: { nodeId: 'active', day: 100 } },
  }

  runtime.replaceReady({
    status: 'ready',
    document,
    location,
    agenda,
    focus: runtime.newFocus('active', 0),
    structuralVersion: 0,
    expansion: COLLAPSED_EXPANSION_STATE,
  })

  expect(runtime.ready().location).toEqual({ currentParentId: null, selectedNodeId: 'active' })
  expect(runtime.ready().agenda!.origin).toEqual({ location, cursor: 4 })
  expect(activeAgendaOccurrence(runtime.ready().agenda)).toEqual({ nodeId: 'active', day: 100 })
})

it('returns to the nearest surviving origin ancestor when the Agenda scope is deleted', () => {
  const closed = vi.fn()
  const runtime = new EditorRuntimeState(closed)
  const scope = { id: 'scope', text: 'Scope', children: [{ id: 'a', text: '1970-04-11', children: [] }] }
  const document: Document = {
    roots: [
      { id: 'unrelated', text: '', children: [] },
      { id: 'grand', text: 'Grand', children: [scope] },
    ],
  }
  const location = { currentParentId: 'scope', selectedNodeId: 'a' }
  const state: ReadySnapshot = {
    status: 'ready',
    document,
    location,
    agenda: openAgendaState(location, 4, 100),
    focus: runtime.newFocus('a', 4),
    structuralVersion: 0,
    expansion: COLLAPSED_EXPANSION_STATE,
  }
  runtime.replaceReady(state)
  const previousToken = runtime.ready().focus.token

  runtime.replaceReady(
    {
      ...runtime.ready(),
      document: { roots: [document.roots[0]!, { ...document.roots[1]!, children: [] }] },
    },
    true,
  )

  expect(runtime.ready().agenda).toBeUndefined()
  expect(runtime.ready().location).toEqual({ currentParentId: 'grand', selectedNodeId: 'grand' })
  expect(runtime.ready().focus).toEqual({ nodeId: 'grand', cursor: 0, token: previousToken + 1 })
  expect(closed).toHaveBeenCalledOnce()
})

it('short-circuits Agenda reconciliation in Tree and calls the seam once when Agenda is present', () => {
  const runtime = new EditorRuntimeState()
  const state: ReadySnapshot = {
    status: 'ready',
    document: { roots: [{ id: 'a', text: '', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'a' },
    focus: runtime.newFocus('a', 0),
    structuralVersion: 0,
    expansion: COLLAPSED_EXPANSION_STATE,
  }
  const reconcile = vi.spyOn(agendaModule, 'reconcileAgenda')
  try {
    runtime.replaceReady(state)

    expect(reconcile).not.toHaveBeenCalled()
    expect(runtime.ready()).not.toHaveProperty('agenda')

    const agenda = openAgendaState(state.location, 4, 100)

    runtime.replaceReady({ ...state, agenda })

    expect(reconcile).toHaveBeenCalledExactlyOnceWith(state.document, agenda, false, undefined)
    expect(runtime.ready().agenda).toBe(agenda)

    runtime.replaceReady({ ...runtime.ready(), agenda: { ...agenda, selectedKey: 'day:101' } })

    expect(reconcile).toHaveBeenCalledTimes(1)
  } finally {
    reconcile.mockRestore()
  }
})

it.each(['deleted', 'moved'] as const)(
  'keeps a valid Tree location when the active item is %s out of scope',
  (kind) => {
    const runtime = new EditorRuntimeState()
    const node = { id: 'a', text: '1970-04-11', children: [] }
    const scope = { id: 'scope', text: 'Scope', children: [node] }
    const document: Document = { roots: [{ id: 'grand', text: 'Grand', children: [scope] }] }
    const location = { currentParentId: 'scope', selectedNodeId: 'a' }
    const agenda = {
      ...openAgendaState(location, 4, 100),
      selectedKey: 'node:100:a',
      activity: { kind: 'dated' as const, occurrence: { nodeId: 'a', day: 100 } },
    }
    const state: ReadySnapshot = {
      status: 'ready',
      document,
      location,
      agenda,
      focus: runtime.newFocus('a', 4),
      expansion: COLLAPSED_EXPANSION_STATE,
      structuralVersion: 0,
    }

    runtime.replaceReady(state)
    const changed: Document = {
      roots: [{ ...document.roots[0]!, children: [{ ...scope, children: [] }] }, ...(kind === 'moved' ? [node] : [])],
    }

    runtime.replaceReady({ ...runtime.ready(), document: changed }, true)

    expect(runtime.ready().location).toEqual({ currentParentId: 'scope', selectedNodeId: 'scope' })
    expect(runtime.ready().focus).toMatchObject({ nodeId: 'scope', cursor: 0 })
    expect(runtime.ready().agenda!.selectedKey).toBe('day:100')
    expect(activeAgendaOccurrence(runtime.ready().agenda!)).toBeUndefined()
    expect(isValidLocation(changed, runtime.ready().location)).toBe(true)
  },
)

it('calls the cache-release callback only when Agenda closes and reconciles an active document change', () => {
  const closed = vi.fn()
  const runtime = new EditorRuntimeState(closed)
  const document: Document = { roots: [{ id: 'a', text: '1970-04-11', children: [] }] }
  const state: ReadySnapshot = {
    status: 'ready',
    document,
    location: { currentParentId: null, selectedNodeId: 'a' },
    focus: runtime.newFocus('a', 4),
    expansion: COLLAPSED_EXPANSION_STATE,
    structuralVersion: 0,
  }

  runtime.replaceReady(state)
  const agenda = {
    ...openAgendaState(state.location, 4, 100),
    selectedKey: 'node:100:a',
    activity: { kind: 'dated' as const, occurrence: { nodeId: 'a', day: 100 } },
  }

  runtime.replaceReady({ ...state, agenda })
  runtime.replaceReady({ ...runtime.ready(), document: { roots: [{ ...document.roots[0]!, text: '1970-04-13' }] } })

  expect(runtime.ready().agenda!.selectedKey).toBe('node:102:a')
  expect(runtime.ready().location.selectedNodeId).toBe('a')
  expect(closed).not.toHaveBeenCalled()

  const { agenda: _agenda, ...tree } = runtime.ready()

  expect(_agenda).toBeDefined()

  runtime.replaceReady(tree)

  expect(closed).toHaveBeenCalledOnce()

  runtime.replaceReady(tree)

  expect(closed).toHaveBeenCalledOnce()
})

it('does not reconcile unchanged pinned content when only its focus intent changes', () => {
  const runtime = new EditorRuntimeState()
  const document: Document = { roots: [{ id: 'a', text: 'Undated', children: [] }] }
  const location = { currentParentId: null, selectedNodeId: 'a' }
  const occurrence = { nodeId: 'a', day: 100 }
  const agenda = {
    ...openAgendaState(location, 0, 100),
    selectedKey: 'node:100:a',
    activity: { kind: 'pinned-until-leave' as const, occurrence: occurrence },
  }
  const state: ReadySnapshot = {
    status: 'ready',
    document,
    location,
    agenda,
    focus: runtime.newFocus('a', 0),
    expansion: COLLAPSED_EXPANSION_STATE,
    structuralVersion: 0,
  }
  runtime.replaceReady(state)
  const reconcile = vi.spyOn(agendaModule, 'reconcileAgenda')
  try {
    runtime.replaceReady({ ...runtime.ready(), focus: runtime.newFocus('a', 3) })

    expect(reconcile).not.toHaveBeenCalled()
    expect(runtime.ready().agenda).toBe(agenda)
  } finally {
    reconcile.mockRestore()
  }
})
