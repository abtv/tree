import { expect, it } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { DateAssist } from './date-assist'

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
// @requirement PRODUCT.md §20.9
it('opens only from an edit, updates suggestions, and closes rather than reopening on observation', () => {
  const assist = new DateAssist()
  assist.observe('n', 'tomorrow', 8, 8, true)
  expect(assist.popup).toBeUndefined()
  assist.edit('n', 'tomor', 5, today, [])
  expect(assist.popup).toMatchObject({ nodeId: 'n', start: 0, end: 5, selected: 0, suggestions: [{ day: today + 1 }] })
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
  const assist = new DateAssist()
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
  const assist = new DateAssist()
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
