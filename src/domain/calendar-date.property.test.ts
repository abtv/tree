import fc from 'fast-check'
import { expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { calendarDateOf, dayNumberOf, formatCanonicalDate, isValidCalendarDate, weekdayOf } from './calendar-date'
import { findCanonicalDates } from './date-recognition'

it('round trips every canonical day and agrees with an independent UTC calendar', () => {
  fc.assert(
    fc.property(fc.integer({ min: -719528, max: 2932896 }), (day) => {
      const date = calendarDateOf(day)
      expect(isValidCalendarDate(date)).toBe(true)
      expect(dayNumberOf(date)).toBe(day)
      const reference = new Date(day * 86400000)
      expect(date).toEqual({
        year: reference.getUTCFullYear(),
        month: reference.getUTCMonth() + 1,
        day: reference.getUTCDate(),
      })
      expect(weekdayOf(day)).toBe((reference.getUTCDay() + 6) % 7)
      expect(findCanonicalDates(formatCanonicalDate(date))).toEqual([{ start: 0, end: 10, day }])
    }),
    { numRuns: propertyRuns(2000) },
  )
})
