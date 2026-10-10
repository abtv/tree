import { describe, expect, it } from 'vitest'
import { dayNumberOf } from './calendar-date'
import { findCanonicalDates, findDateLikeTokens } from './date-recognition'

// @requirement PRODUCT.md §20.10
describe('date-like token recognition', () => {
  it.each([
    ['2026-10-1', [[0, 9]]],
    ['2026-1-15', [[0, 9]]],
    ['2026-1-5', [[0, 8]]],
    ['2026-02-31', [[0, 10]]],
    ['2026-13-01', [[0, 10]]],
    ['2026-00-10', [[0, 10]]],
    ['2026-01-00', [[0, 10]]],
    ['1900-02-29', [[0, 10]]],
    ['2026-02-29', [[0, 10]]],
    ['due 2026-02-31.', [[4, 14]]],
    ['😀2026-1-5', [[2, 10]]],
  ])('flags %s', (text, ranges) => {
    expect(findDateLikeTokens(text).map(({ start, end }) => [start, end])).toEqual(ranges)
  })
  it.each([
    '2026-10-14',
    '2024-02-29',
    '2026-10',
    '26-10-14',
    '12026-10-14',
    '12026-10-1',
    '2026-10-140',
    '2026-10-142026-10-1',
    '2026-100-1',
    '2026/10/14',
    '2026 - 10 - 14',
    'abc',
    '',
  ])('does not flag %s', (text) => {
    expect(findDateLikeTokens(text)).toEqual([])
  })
  it('flags every token, keeps touching non-digits, and skips excluded ranges', () => {
    const text = '2026-10-1a2026-2-3 2026-10-14'
    expect(findDateLikeTokens(text)).toEqual([
      { start: 0, end: 9 },
      { start: 10, end: 18 },
    ])
    expect(findDateLikeTokens(text, [{ start: 9, end: 11 }])).toEqual([{ start: 0, end: 9 }])
    expect(findDateLikeTokens(text, [{ start: 8, end: 10 }])).toEqual([{ start: 10, end: 18 }])
    expect(findDateLikeTokens(text, [{ start: 18, end: 19 }])).toHaveLength(2)
    expect(findDateLikeTokens(text, [{ start: 0, end: 0 }])).toHaveLength(2)
  })
})

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
