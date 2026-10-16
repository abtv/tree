import { expect, it } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { recognizeCompletion } from './completion-sources'

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })

// @requirement PRODUCT.md §20.9
// @requirement PRODUCT.md §20.12
it('adapts date and emoji matches to shared suggestions with their selection policies', () => {
  expect(recognizeCompletion('x tomor', 7, today)).toEqual({
    start: 2,
    end: 7,
    listLabel: 'Date suggestions',
    retainsSelection: true,
    suggestions: [
      { id: `date:${today + 1}`, replacement: '2026-10-09', label: '2026-10-09', description: 'Fri · tomorrow' },
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
it('describes each date with its weekday', () => {
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = today + offset
    const description = recognizeCompletion(`in ${offset} days`, `in ${offset} days`.length, today)?.suggestions.find(
      (suggestion) => suggestion.id === `date:${day}`,
    )?.description
    expect(description).toBe(`${['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'][offset - 1]} · in ${offset} days`)
  }
})
