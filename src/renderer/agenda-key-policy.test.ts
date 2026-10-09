import { describe, expect, it } from 'vitest'
import { agendaAllows, type AgendaElement, type AgendaAction } from './agenda-key-policy'

// @requirement PRODUCT.md §23.9
// @requirement PRODUCT.md §23.10
describe('Agenda command policy', () => {
  const elements: AgendaElement[] = ['day', 'gap', 'match', 'context']
  const shared: AgendaAction[] = ['navigate', 'fold', 'history']
  const editing: AgendaAction[] = [
    'text',
    'clipboard',
    'strikethrough',
    'empty-delete',
    'split',
    'open-sibling',
    'start-move',
    'whole-node-visual',
  ]
  const prohibited: AgendaAction[] = ['structure', 'node-put']
  for (const element of elements) {
    it(`${element} permits create only on days`, () => expect(agendaAllows(element, 'create')).toBe(element === 'day'))
    for (const action of shared)
      it(`${element} permits ${action}`, () => expect(agendaAllows(element, action)).toBe(true))
    for (const action of editing)
      it(`${element} permits ${action} only on matches`, () =>
        expect(agendaAllows(element, action)).toBe(element === 'match'))
    for (const action of prohibited)
      it(`${element} blocks ${action}`, () => expect(agendaAllows(element, action)).toBe(false))
    // @requirement PRODUCT.md §23.13
    it(`${element} accepts a put of a pending move on every row of a day but never on a gap`, () =>
      expect(agendaAllows(element, 'put-move')).toBe(element !== 'gap'))
  }
})
