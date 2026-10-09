import { describe, expect, it } from 'vitest'
import { agendaAllows, type AgendaElement, type AgendaAction } from './agenda-key-policy'

// @requirement PRODUCT.md §23.9
// @requirement PRODUCT.md §23.10
describe('Agenda command policy', () => {
  const elements: AgendaElement[] = ['day', 'gap', 'match', 'context']
  const shared: AgendaAction[] = ['navigate', 'fold', 'history']
  const editing: AgendaAction[] = ['text', 'clipboard', 'strikethrough', 'empty-delete']
  const prohibited: AgendaAction[] = ['structure', 'create', 'node-put', 'whole-node-visual']
  for (const element of elements) {
    for (const action of shared)
      it(`${element} permits ${action}`, () => expect(agendaAllows(element, action)).toBe(true))
    for (const action of editing)
      it(`${element} permits ${action} only on matches`, () =>
        expect(agendaAllows(element, action)).toBe(element === 'match'))
    for (const action of prohibited)
      it(`${element} blocks ${action}`, () => expect(agendaAllows(element, action)).toBe(false))
  }
})
