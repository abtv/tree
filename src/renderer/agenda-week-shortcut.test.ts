import { describe, expect, it } from 'vitest'
import { agendaWeekDirection } from './agenda-week-shortcut'

// @requirement PRODUCT.md §23.4
describe('Agenda week shortcut keys', () => {
  it.each([
    ['[', false, -1],
    [']', false, 1],
    ['[', true, -1],
    [']', true, 1],
    ['{', true, -1],
    ['}', true, 1],
    ['{', false, undefined],
    ['}', false, undefined],
    ['p', true, undefined],
  ] as const)('maps %s with Shift=%s to %s', (key, shiftKey, direction) => {
    expect(agendaWeekDirection({ key, shiftKey, altKey: false })).toBe(direction)
  })

  it.each(['[', ']', '{', '}'])('ignores Alt+%s', (key) => {
    expect(agendaWeekDirection({ key, shiftKey: true, altKey: true })).toBeUndefined()
  })
})
