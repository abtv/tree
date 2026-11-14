import { describe, expect, it } from 'vitest'
import { agendaAllows, type AgendaElement, type AgendaAction } from './agenda-key-policy'

// @requirement PRODUCT.md §23.9
// @requirement PRODUCT.md §23.10
describe('Agenda command policy', () => {
  const elements: AgendaElement[] = ['day', 'separator', 'match']
  const editing: AgendaAction[] = ['text', 'clipboard', 'strikethrough']
  const prohibited: AgendaAction[] = [
    'structure',
    'node-put',
    'create',
    'empty-delete',
    'split',
    'open-sibling',
    'start-move',
    'put-move',
    'whole-node-visual',
  ]
  for (const element of elements) {
    for (const action of ['navigate', 'history'] as const)
      it(`${element} permits ${action}`, () => expect(agendaAllows(element, action)).toBe(true))
    it(`${element} folds only days`, () => expect(agendaAllows(element, 'fold')).toBe(element === 'day'))
    for (const action of editing)
      it(`${element} permits ${action} only on matches`, () =>
        expect(agendaAllows(element, action)).toBe(element === 'match'))
    for (const action of prohibited)
      it(`${element} blocks ${action}`, () => expect(agendaAllows(element, action)).toBe(false))
  }
})
