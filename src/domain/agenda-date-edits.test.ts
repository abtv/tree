import { expect, it } from 'vitest'
import { nextActiveDay } from './agenda-date-edits'
import { dayNumberOf } from './calendar-date'

const day = (value: number) => dayNumberOf({ year: 2026, month: 10, day: value })

// @requirement PRODUCT.md §23.7
it('selects the nearest remaining day, earlier on ties, with no ordering assumption', () => {
  expect(nextActiveDay([], day(14))).toBeUndefined()
  expect(nextActiveDay([day(20), day(15), day(13)], day(14))).toBe(day(13))
  expect(nextActiveDay([day(13), day(15)], day(14))).toBe(day(13))
  expect(nextActiveDay(new Set([day(20), day(14), day(10)]), day(14))).toBe(day(14))
  expect(nextActiveDay([day(20)], day(14))).toBe(day(20))
})
