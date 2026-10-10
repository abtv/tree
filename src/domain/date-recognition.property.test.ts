import fc from 'fast-check'
import { expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { findCanonicalDates, findDateLikeTokens } from './date-recognition'

// @requirement PRODUCT.md §20.10
it('flags exactly the digit-bounded year-month-day shapes that are not canonical dates', () => {
  const part = (min: number, max: number) => fc.integer({ min, max })
  const token = fc
    .tuple(part(0, 9999), part(0, 120), part(0, 120), fc.boolean(), fc.boolean())
    .map(
      ([year, month, day, padMonth, padDay]) =>
        `${String(year).padStart(4, '0')}-${padMonth ? String(month).padStart(2, '0') : month}-${padDay ? String(day).padStart(2, '0') : day}`,
    )
  fc.assert(
    fc.property(
      fc.array(fc.tuple(fc.constantFrom('', 'a', '9', '😀', ' '), token), { maxLength: 12 }),
      fc.nat(150),
      fc.nat(20),
      (parts, offset, length) => {
        const text = parts.map(([prefix, value]) => prefix + value).join('')
        const range = { start: offset, end: offset + length + 1 }
        const flagged = findDateLikeTokens(text, [range])
        const canonical = findCanonicalDates(text, [range])
        for (const { start, end } of flagged) {
          const value = text.slice(start, end)
          expect(value).toMatch(/^\d{4}-\d{1,2}-\d{1,2}$/)
          expect(/[0-9]/.test(text[start - 1] ?? '')).toBe(false)
          expect(/[0-9]/.test(text[end] ?? '')).toBe(false)
          expect(start < range.end && end > range.start).toBe(false)
          expect(canonical.some((date) => date.start < end && date.end > start)).toBe(false)
        }
        for (let index = 1; index < flagged.length; index++)
          expect(flagged[index]!.start).toBeGreaterThanOrEqual(flagged[index - 1]!.end)
        // Every digit-bounded shape outside the range is either canonical or flagged.
        for (const match of text.matchAll(/[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}/g)) {
          const start = match.index
          const end = start + match[0].length
          if (/[0-9]/.test(text[start - 1] ?? '') || /[0-9]/.test(text[end] ?? '')) continue
          if (start < range.end && end > range.start) continue
          const isCanonical = canonical.some((date) => date.start === start && date.end === end)
          const isFlagged = flagged.some((token) => token.start === start && token.end === end)
          expect(isCanonical !== isFlagged).toBe(true)
        }
      },
    ),
    { numRuns: propertyRuns(1000) },
  )
})

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
