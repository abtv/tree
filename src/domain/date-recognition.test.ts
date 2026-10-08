import { describe, expect, it } from 'vitest'
import { dayNumberOf } from './calendar-date'
import { findCanonicalDates } from './date-recognition'

describe('canonical date recognition', () => {
  it.each([
    '2026-10-1',
    '2026-02-31',
    '2026-00-01',
    '2026-13-01',
    '2026-01-00',
    '1900-02-29',
    '12026-10-14',
    '2026-10-140',
    '２０２６-10-14',
    '',
  ])('ignores %s', (text) => {
    expect(findCanonicalDates(text)).toEqual([])
  })
  it('keeps repeated occurrences and accepts touching non-digits', () => {
    const day = dayNumberOf({ year: 2026, month: 10, day: 14 })
    expect(findCanonicalDates('2026-10-14a2026-10-14')).toEqual([
      { start: 0, end: 10, day },
      { start: 11, end: 21, day },
    ])
    expect(findCanonicalDates('2026-10-142026-10-14')).toEqual([])
  })
  it('returns UTF-16 offsets and excludes any overlapping hyperlink range', () => {
    const text = '😀2026-10-14 2026-10-15'
    const matches = findCanonicalDates(text)
    expect(matches.map(({ start, end }) => [start, end])).toEqual([
      [2, 12],
      [13, 23],
    ])
    for (const range of [
      { start: 2, end: 12 },
      { start: 0, end: 3 },
      { start: 11, end: 14 },
      { start: 3, end: 4 },
    ]) {
      expect(findCanonicalDates(text, [range])).toEqual(
        matches.filter(({ start, end }) => !(start < range.end && end > range.start)),
      )
    }
    expect(
      findCanonicalDates(text, [
        { start: 0, end: 2 },
        { start: 12, end: 13 },
        { start: 23, end: 24 },
      ]),
    ).toEqual(matches)
  })
})
