import { describe, expect, it } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { agendaDateLabel, agendaGapLabel } from './agenda-labels'

const day = (year: number, month: number, date: number): number => dayNumberOf({ year, month, day: date })
describe('Agenda labels', () => {
  it('uses weekday and appends only a different year, independently of timezone', () => {
    const today = day(2026, 10, 8)
    expect(agendaDateLabel(today, today, true)).toBe('Thu Oct 8')
    expect(agendaDateLabel(day(2027, 1, 1), today, true)).toBe('Fri Jan 1 2027')
    expect(agendaDateLabel(day(2026, 10, 14), today)).toBe('Oct 14')
    expect(agendaGapLabel(day(2026, 12, 31), day(2027, 1, 3), today)).toBe('4 empty days · Dec 31 – Jan 3 2027')
  })
})
