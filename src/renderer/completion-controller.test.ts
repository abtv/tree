import { expect, it } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { CompletionController, moveSuggestionIndex } from './completion-controller'

it('keeps an empty suggestion list at index zero in either direction', () => {
  expect(moveSuggestionIndex(0, -1, 0)).toBe(0)
  expect(moveSuggestionIndex(0, 1, 0)).toBe(0)
})

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
it('retains a month choice through ambiguous refinement and preserves both identities on equal dates', () => {
  const assist = new CompletionController()

  assist.edit('n', 'next mon', 8, today, [])

  expect(assist.popup?.suggestions).toHaveLength(4)

  assist.move(1)
  assist.move(1)

  expect(assist.popup?.suggestions[assist.popup.selected]?.replacement).toBe('2026-11-15')

  assist.edit('n', 'next mont', 9, today, [])

  expect(assist.popup?.suggestions[assist.popup.selected]?.replacement).toBe('2026-11-15')

  assist.edit('n', 'next month', 10, today, [])

  expect(assist.popup?.suggestions[assist.popup.selected]?.replacement).toBe('2026-11-15')

  assist.edit('n', 'next mon', 8, today, [])

  expect(assist.popup?.suggestions[assist.popup.selected]?.replacement).toBe('2026-11-15')

  assist.edit('n', 'next mond', 9, today, [])

  expect(assist.popup?.suggestions).toHaveLength(1)
  expect(assist.popup?.suggestions[assist.popup.selected]?.replacement).toBe('2026-10-12')

  const overlap = dayNumberOf({ year: 2026, month: 5, day: 25 })

  assist.close()
  assist.edit('n', 'next mon', 8, overlap, [])

  expect(new Set(assist.popup?.suggestions.map(({ id }) => id)).size).toBe(4)

  assist.move(1)

  expect(assist.popup?.suggestions[assist.popup.selected]?.description).toContain('next month')

  assist.edit('n', 'next mont', 9, overlap, [])

  expect(assist.popup?.suggestions[assist.popup.selected]?.description).toContain('next month')

  assist.edit('n', 'next mon', 8, overlap, [])

  expect(assist.popup?.suggestions[assist.popup.selected]?.description).toContain('next month')

  assist.edit('n', 'next mond', 9, overlap, [])

  expect(assist.popup?.suggestions[assist.popup.selected]?.replacement).toBe('2026-06-01')

  assist.close()
  assist.edit('n', 'last Monday', 11, today, [])
  assist.edit('n', 'Sep 28', 6, today, [])

  expect(assist.popup?.suggestions[assist.popup.selected]?.replacement).toBe('2026-09-28')
})

// @requirement PRODUCT.md §20.9
it('opens on the preferred date and preserves an earlier manual choice through refinement', () => {
  const assist = new CompletionController()
  const selected = () => assist.popup?.suggestions[assist.popup.selected]?.replacement

  assist.edit('n', 'in sep', 6, today, [])

  expect(assist.popup?.suggestions.map(({ replacement }) => replacement)).toEqual(['2026-09-01', '2027-09-01'])
  expect(assist.popup?.selected).toBe(1)
  expect(selected()).toBe('2027-09-01')

  assist.move(-1)

  expect(selected()).toBe('2026-09-01')

  assist.edit('n', 'in September', 12, today, [])

  expect(selected()).toBe('2026-09-01')

  assist.edit('n', 'in jan', 6, today, [])

  expect(selected()).toBe('2027-01-01')

  assist.move(-1)
  assist.edit('other', 'in jan', 6, today, [])

  expect(selected()).toBe('2027-01-01')

  assist.move(-1)
  assist.edit('other', 'x in jan', 8, today, [])

  expect(selected()).toBe('2027-01-01')

  assist.move(-1)
  assist.close()
  assist.edit('other', 'x in jan', 8, today, [])

  expect(selected()).toBe('2027-01-01')
})
// @requirement PRODUCT.md §20.12
it('shares dismissal, selection and hyperlink exclusion with emoji completion', () => {
  const assist = new CompletionController()

  assist.edit('n', ':roc', 4, today, [])

  expect(assist.popup?.suggestions).toContainEqual({
    id: 'emoji:rocket',
    replacement: '🚀',
    label: '🚀',
    description: ':rocket:',
  })

  assist.move(-1)

  expect(assist.popup?.selected).toBe(assist.popup!.suggestions.length - 1)

  assist.observe('n', ':roc', 0, 4, true)

  expect(assist.popup).toBeUndefined()

  assist.edit('n', ':roc', 4, today, [{ start: 0, end: 4 }])

  expect(assist.popup).toBeUndefined()

  assist.edit('n', ':roc ', 5, today, [])

  expect(assist.popup).toBeUndefined()
})
// @requirement PRODUCT.md §20.9
it('opens only from an edit, updates suggestions, and closes rather than reopening on observation', () => {
  const assist = new CompletionController()

  assist.observe('n', 'tomorrow', 8, 8, true)

  expect(assist.popup).toBeUndefined()

  assist.edit('n', 'tomor', 5, today, [])

  expect(assist.popup).toMatchObject({
    nodeId: 'n',
    start: 0,
    end: 5,
    selected: 0,
    suggestions: [{ id: `date:${today + 1}:tomorrow` }],
  })

  assist.edit('n', 'Friday', 6, today, [])

  expect(assist.popup?.suggestions).toHaveLength(2)

  assist.move(1)

  expect(assist.popup?.selected).toBe(1)

  assist.move(1)

  expect(assist.popup?.selected).toBe(0)

  assist.move(-1)

  expect(assist.popup?.selected).toBe(1)

  assist.close()
  assist.move(1)
  assist.observe('n', 'Friday', 6, 6, true)

  expect(assist.popup).toBeUndefined()

  assist.edit('n', 'to', 2, today, [])

  expect(assist.popup).toBeUndefined()

  assist.edit('n', 'Friday', 6, today, [])
  assist.edit('n', 'to', 2, today, [])

  expect(assist.popup).toBeUndefined()

  assist.edit('n', 'next week', 9, today, [])
  assist.move(1)

  expect(assist.popup?.selected).toBe(1)

  assist.move(-1)

  expect(assist.popup?.selected).toBe(0)
})

// @requirement PRODUCT.md §20.9
it('keeps the popup only for an eligible collapsed caret in its unchanged expression and node', () => {
  const assist = new CompletionController()
  for (const caret of [2, 5, 10]) {
    assist.edit('n', 'x tomorrow y', 10, today, [])
    assist.observe('n', 'x tomorrow y', caret, caret, true)

    expect(assist.popup).toBeDefined()
  }
  for (const [nodeId, text, start, end, eligible] of [
    ['n', 'x tomorrow y', 1, 1, true],
    ['n', 'x tomorrow y', 11, 11, true],
    ['n', 'x tomorrow y', 5, 6, true],
    ['other', 'x tomorrow y', 5, 5, true],
    [undefined, 'x tomorrow y', 5, 5, true],
    ['n', 'x tomorrow!', 5, 5, true],
    ['n', 'x tomorrow y', 5, 5, false],
  ] as const) {
    assist.edit('n', 'x tomorrow y', 10, today, [])
    assist.observe(nodeId, text, start, end, eligible)

    expect(assist.popup).toBeUndefined()
  }
})

// @requirement PRODUCT.md §20.9
it('excludes hyperlink spans but not adjacent text', () => {
  const assist = new CompletionController()

  assist.edit('n', 'tomorrow', 8, today, [{ start: 0, end: 8 }])

  expect(assist.popup).toBeUndefined()

  for (const range of [
    { start: 0, end: 2 },
    { start: 10, end: 12 },
  ]) {
    assist.edit('n', 'x tomorrow y', 10, today, [range])

    expect(assist.popup).toBeDefined()
  }
})

// @requirement PRODUCT.md §20.9
it('retains a selected date through refinement and resets when that date or expression disappears', () => {
  const assist = new CompletionController()

  assist.edit('n', 'next wee', 8, today, [])
  assist.move(1)
  assist.move(1)
  const selectedDay = assist.popup?.suggestions[assist.popup.selected]

  expect(selectedDay).toMatchObject({ id: `date:${today + 6}:next week`, description: 'Wed · next week' })

  assist.edit('n', 'next week', 9, today, [])

  expect(assist.popup?.selected).toBe(2)

  assist.edit('n', 'NEXT   WEEK', 11, today, [])

  expect(assist.popup?.selected).toBe(2)

  assist.edit('n', 'last week', 9, today, [])

  expect(assist.popup?.selected).toBe(0)

  assist.edit('n', 'next weekend', 12, today, [])

  expect(assist.popup).toBeUndefined()

  assist.edit('n', 'next week', 9, today, [])

  expect(assist.popup?.selected).toBe(0)

  assist.move(1)
  assist.edit('other', 'next week', 9, today, [])

  expect(assist.popup?.selected).toBe(0)

  assist.move(1)
  assist.edit('other', 'x next week', 11, today, [])

  expect(assist.popup?.selected).toBe(0)
})

// @requirement PRODUCT.md §20.9
it('retains a date by value when its index changes and does not carry emoji selection into dates', () => {
  const assist = new CompletionController()

  assist.edit('n', 'Friday', 6, today, [])
  assist.move(1)
  assist.edit('n', 'Friday', 6, today + 9, [])

  expect(assist.popup?.selected).toBe(0)
  expect(assist.popup?.suggestions[0]?.replacement).toBe('2026-10-16')

  assist.edit('n', ':roc', 4, today, [])
  assist.move(1)
  assist.edit('n', 'Friday', 6, today, [])

  expect(assist.popup?.selected).toBe(0)
})

// @requirement PRODUCT.md §20.12
it('resets emoji selection when the same shortcode fragment is refined', () => {
  const assist = new CompletionController()

  assist.edit('n', ':ro', 3, today, [])
  assist.move(1)
  const selected = assist.popup!.suggestions[1]!

  assist.edit('n', ':ro', 3, today, [])

  expect(assist.popup?.selected).toBe(0)
  expect(assist.popup?.suggestions[1]).toEqual(selected)
})
