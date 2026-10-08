import { expect, it, vi } from 'vitest'
import * as agendaModule from './agenda-state'
import { EditorRuntimeState, type ReadySnapshot } from './editor-runtime-state'
import { COLLAPSED_EXPANSION_STATE } from './expansion-state'

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
    const agenda = agendaModule.openAgendaState(state.location, 4, 100)
    runtime.replaceReady({ ...state, agenda })
    expect(reconcile).toHaveBeenCalledExactlyOnceWith(agenda)
    expect(runtime.ready().agenda).toBe(agenda)
  } finally {
    reconcile.mockRestore()
  }
})
