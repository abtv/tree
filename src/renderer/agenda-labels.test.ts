import { describe, expect, it } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { agendaDateLabel, agendaStatusMessage, isAgendaMirror } from './agenda-labels'

const day = (year: number, month: number, date: number): number => dayNumberOf({ year, month, day: date })
describe('Agenda labels', () => {
  it('uses weekday and appends only a different year, independently of timezone', () => {
    const today = day(2026, 10, 8)

    expect(agendaDateLabel(today, today, true)).toBe('Thu Oct 8')
    expect(agendaDateLabel(day(2027, 1, 1), today, true)).toBe('Fri Jan 1 2027')
    expect(agendaDateLabel(day(2026, 10, 14), today)).toBe('Oct 14')
  })

  // @requirement PRODUCT.md §23.7
  it('shows the invalid-item hint only while an occurrence is pinned', () => {
    const occurrence = { nodeId: 'a', day: 1 }

    expect(agendaStatusMessage(undefined)).toBeUndefined()
    expect(agendaStatusMessage({ activity: { kind: 'inactive' } })).toBeUndefined()
    expect(agendaStatusMessage({ activity: { kind: 'pinned-until-leave' as const, occurrence: occurrence } })).toBe(
      'Add a date to keep this item in Agenda',
    )
  })

  // @requirement PRODUCT.md §23.7
  it('treats only other-day direct matches of the active node as mirrors', () => {
    const agenda = { activity: { kind: 'dated' as const, occurrence: { nodeId: 'a', day: 1 } } }

    expect(isAgendaMirror(agenda, { nodeId: 'a', day: 2, role: 'match' })).toBe(true)
    expect(isAgendaMirror(agenda, { nodeId: 'a', day: 1, role: 'match' })).toBe(false)
    expect(isAgendaMirror(agenda, { nodeId: 'b', day: 2, role: 'match' })).toBe(false)
    expect(isAgendaMirror(agenda, { nodeId: 'a', day: 2, role: 'context' })).toBe(false)
    expect(isAgendaMirror({ activity: { kind: 'inactive' } }, { nodeId: 'a', day: 2, role: 'match' })).toBe(false)
  })
})
