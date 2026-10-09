import fc from 'fast-check'
import { expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { calendarDateOf, dayNumberOf, formatCanonicalDate, isValidCalendarDate, weekdayOf } from './calendar-date'
import { suggestDates } from './natural-date'

const reference = fc.integer({
  min: dayNumberOf({ year: 10, month: 1, day: 1 }),
  max: dayNumberOf({ year: 9990, month: 1, day: 1 }),
})

it('bare weekdays put the next occurrence first and a distinct nearby alternative second', () => {
  fc.assert(
    fc.property(reference, fc.integer({ min: 0, max: 6 }), (today, weekday) => {
      const expression = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekday]!
      const suggestions = suggestDates(expression, expression.length, today)!.suggestions
      expect(suggestions).toHaveLength(2)
      expect(suggestions[0]!.day).toBe(today + ((weekday - weekdayOf(today) + 7) % 7))
      expect(Math.abs(suggestions[1]!.day - suggestions[0]!.day)).toBe(7)
      for (const suggestion of suggestions) {
        expect(isValidCalendarDate(calendarDateOf(suggestion.day))).toBe(true)
        expect(weekdayOf(suggestion.day)).toBe(weekday)
      }
    }),
    { numRuns: propertyRuns(1000) },
  )
})

it('month/day suggestions are the nearest upcoming and previous valid occurrences', () => {
  fc.assert(
    fc.property(reference, fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }), (today, month, date) => {
      const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]!
      const text = `${monthName} ${date}`
      const result = suggestDates(text, text.length, today)
      const year = calendarDateOf(today).year
      const occurrences: number[] = []
      for (let candidate = year - 8; candidate <= year + 8; candidate++) {
        const value = { year: candidate, month, day: date }
        if (isValidCalendarDate(value)) occurrences.push(dayNumberOf(value))
      }
      const expected = [
        occurrences.find((day) => day >= today),
        occurrences.filter((day) => day < today).at(-1),
      ].filter((day) => day !== undefined)
      expect(result?.suggestions.map((suggestion) => suggestion.day) ?? []).toEqual(expected)
    }),
    { numRuns: propertyRuns(1000) },
  )
})

it('conversion changes only the recognized expression and produces valid canonical dates', () => {
  fc.assert(
    fc.property(
      reference,
      fc.constantFrom(
        'today',
        'tomor',
        'tomorrow',
        'yesterday',
        'next Friday',
        'last Monday',
        'next week',
        'Oct 22',
        'in 3 days',
        '3 days ago',
      ),
      fc.string(),
      fc.string(),
      (today, expression, prefix, suffix) => {
        const text = `${prefix} (${expression}) ${suffix}`
        const start = prefix.length + 2
        const result = suggestDates(text, start + expression.length, today)!
        expect(result.start).toBe(start)
        expect(result.end).toBe(start + expression.length)
        for (const suggestion of result.suggestions) {
          const canonical = formatCanonicalDate(calendarDateOf(suggestion.day))
          expect(isValidCalendarDate(calendarDateOf(suggestion.day))).toBe(true)
          expect(text.slice(0, result.start) + canonical + text.slice(result.end)).toBe(
            `${prefix} (${canonical}) ${suffix}`,
          )
        }
      },
    ),
    { numRuns: propertyRuns(1000) },
  )
})
