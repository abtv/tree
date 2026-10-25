import { expect, it } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { recognizeCompletion } from './completion-sources'

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })

// @requirement PRODUCT.md §20.13
it('keeps date-like tag names literal when no existing tag matches', () => {
  const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
  for (const text of ['#today', '#tomorrow', 'Plan #mon']) {
    expect(recognizeCompletion(text, text.length, today)).toBeUndefined()
    expect(recognizeCompletion(text, text.length - 1, today)).toBeUndefined()
  }
})

// @requirement PRODUCT.md §20.9
// @requirement PRODUCT.md §20.12
it('adapts date and emoji matches to shared suggestions with their selection policies', () => {
  expect(recognizeCompletion('x tomor', 7, today)).toEqual({
    start: 2,
    end: 7,
    listLabel: 'Date suggestions',
    retainsSelection: true,
    preferredSuggestionId: `date:${today + 1}:tomorrow`,
    suggestions: [
      {
        id: `date:${today + 1}:tomorrow`,
        replacement: '2026-10-09',
        label: '2026-10-09',
        description: 'Fri · tomorrow',
      },
    ],
  })
  expect(recognizeCompletion(':+1', 3, today)).toMatchObject({
    start: 0,
    end: 3,
    listLabel: 'Emoji suggestions',
    retainsSelection: false,
  })
  expect(recognizeCompletion(':+1', 3, today)?.suggestions).toContainEqual({
    id: 'emoji:+1',
    replacement: '👍',
    label: '👍',
    description: ':+1:',
  })
  expect(recognizeCompletion('plain', 5, today)).toBeUndefined()
})

// @requirement PRODUCT.md §20.9
// @requirement PRODUCT.md §20.9.3
it('sorts dates chronologically without changing the preferred candidate', () => {
  for (const [text, expected, preferred] of [
    ['in sep', ['2026-09-01', '2027-09-01'], '2027-09-01'],
    ['Oct 2', ['2026-10-02', '2027-10-02'], '2027-10-02'],
    ['Monday', ['2026-10-05', '2026-10-12'], '2026-10-12'],
    ['Friday', ['2026-10-09', '2026-10-16'], '2026-10-09'],
    ['last January', ['2026-01-01'], '2026-01-01'],
    ['in October', ['2026-10-15'], '2026-10-15'],
    ['next month', ['2026-11-01', '2026-11-15', '2026-11-30'], '2026-11-01'],
    ['last month', ['2026-09-01', '2026-09-15', '2026-09-30'], '2026-09-30'],
    [
      'next wee',
      ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'],
      '2026-10-12',
    ],
  ] as const) {
    const match = recognizeCompletion(text, text.length, today)!

    expect(
      match.suggestions.map(({ replacement }) => replacement),
      text,
    ).toEqual(expected)
    expect(match.suggestions.find(({ id }) => id === match.preferredSuggestionId)?.replacement, text).toBe(preferred)
  }
})

// @requirement PRODUCT.md §20.9
it('describes each date with its weekday', () => {
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = today + offset
    const expression = `in ${offset} ${offset === 1 ? 'day' : 'days'}`
    const description = recognizeCompletion(`in ${offset} days`, `in ${offset} days`.length, today)?.suggestions.find(
      (suggestion) => suggestion.id === `date:${day}:${expression}`,
    )?.description

    expect(description).toBe(`${['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'][offset - 1]} · ${expression}`)
  }
})
