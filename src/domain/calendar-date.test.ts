import { describe, expect, it } from 'vitest'
import { calendarDateOf, dayNumberOf, formatCanonicalDate, isValidCalendarDate, weekdayOf } from './calendar-date'

describe('calendar dates', () => {
  it.each([0, 4, 400, 2000, 2024])('accepts leap day in %i', (year) => {
    expect(isValidCalendarDate({ year, month: 2, day: 29 })).toBe(true)
  })
  it.each([100, 1900, 2026, 2100])('rejects leap day in %i', (year) => {
    expect(isValidCalendarDate({ year, month: 2, day: 29 })).toBe(false)
  })
  it.each([
    [-1, 1, 1],
    [10000, 1, 1],
    [2026.5, 1, 1],
    [NaN, 1, 1],
    [2026, 0, 1],
    [2026, 13, 1],
    [2026, 1.5, 1],
    [2026, NaN, 1],
    [2026, 1, 0],
    [2026, 1, 32],
    [2026, 1, 1.5],
    [2026, 1, NaN],
    [2026, 2, 31],
    [2026, 4, 31],
  ])('rejects invalid date %s-%s-%s', (year, month, day) => {
    const date = { year, month, day }
    expect(isValidCalendarDate(date)).toBe(false)
    expect(() => dayNumberOf(date)).toThrow(RangeError)
    expect(() => formatCanonicalDate(date)).toThrow(RangeError)
  })
  it('uses the Unix epoch and Monday-first weekdays', () => {
    expect(dayNumberOf({ year: 1970, month: 1, day: 1 })).toBe(0)
    expect(calendarDateOf(-1)).toEqual({ year: 1969, month: 12, day: 31 })
    expect(weekdayOf(dayNumberOf({ year: 2026, month: 10, day: 8 }))).toBe(3)
    expect(Array.from({ length: 7 }, (_, i) => weekdayOf(i - 3))).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
  it('supports both canonical endpoints', () => {
    for (const date of [
      { year: 0, month: 1, day: 1 },
      { year: 9999, month: 12, day: 31 },
    ]) {
      expect(calendarDateOf(dayNumberOf(date))).toEqual(date)
    }
    expect(formatCanonicalDate({ year: 0, month: 1, day: 1 })).toBe('0000-01-01')
    expect(formatCanonicalDate({ year: 9999, month: 12, day: 31 })).toBe('9999-12-31')
  })
  it.each([-719529, 2932897, 0.5, NaN, Infinity])('rejects out-of-range day %s', (day) => {
    expect(() => calendarDateOf(day)).toThrow(RangeError)
  })
})
