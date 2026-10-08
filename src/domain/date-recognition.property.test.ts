import fc from 'fast-check'
import { expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { findCanonicalDates } from './date-recognition'

it('finds exactly valid canonical substrings outside digit boundaries and excluded ranges', () => {
  const token = fc
    .tuple(fc.integer({ min: 0, max: 9999 }), fc.integer({ min: 0, max: 13 }), fc.integer({ min: 0, max: 32 }))
    .map(
      ([year, month, day]) =>
        `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    )
  fc.assert(
    fc.property(
      fc.array(fc.tuple(fc.constantFrom('', 'a', '9', '😀', ' '), token), { maxLength: 15 }),
      fc.nat(200),
      fc.nat(20),
      (parts, offset, length) => {
        const text = parts.map(([prefix, value]) => prefix + value).join('')
        const range = { start: offset, end: offset + length + 1 }
        const expected = []
        for (let start = 0; start + 10 <= text.length; start++) {
          const value = text.slice(start, start + 10)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) continue
          if (/[0-9]/.test(text[start - 1] ?? '') || /[0-9]/.test(text[start + 10] ?? '')) continue
          if (start < range.end && start + 10 > range.start) continue
          const year = Number(value.slice(0, 4)),
            month = Number(value.slice(5, 7)),
            day = Number(value.slice(8))
          const reference = new Date(0)
          reference.setUTCFullYear(year, month - 1, day)
          if (
            reference.getUTCFullYear() === year &&
            reference.getUTCMonth() === month - 1 &&
            reference.getUTCDate() === day
          )
            expected.push({ start, end: start + 10, day: reference.getTime() / 86400000 })
        }
        expect(findCanonicalDates(text, [range])).toEqual(expected)
      },
    ),
    { numRuns: propertyRuns(1000) },
  )
})
