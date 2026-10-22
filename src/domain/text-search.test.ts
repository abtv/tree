import { describe, expect, it } from 'vitest'
import { prepareSearch, searchText, type SearchPattern } from './text-search'

// @requirement PRODUCT.md §20.2.26

export function pattern(query: string): SearchPattern {
  const work = prepareSearch(query)
  let step = work.next()
  while (!step.done) step = work.next()
  return step.value
}

describe('literal search', () => {
  it.each([
    [
      'a.b [x] a.b',
      'a.b',
      [
        [0, 3],
        [8, 11],
      ],
    ],
    ['aaa', 'aa', [[0, 2]]],
    [
      'aAaA',
      'aa',
      [
        [0, 2],
        [2, 4],
      ],
    ],
    ['aAaA', 'Aa', [[1, 3]]],
    [
      'Σσς',
      'σ',
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    ],
    ['Σσς', 'Σ', [[0, 1]]],
    [
      'x😀😀',
      '😀',
      [
        [1, 3],
        [3, 5],
      ],
    ],
    ['a\u0301é', '\u0301', [[1, 2]]],
    ['a\u0301é', 'á', []],
    ['Straße', 'ss', []],
    ['visit https://example.org now', '.org now', [[21, 29]]],
    ['anything', '', []],
    ['ababababac', 'ababac', [[4, 10]]],
  ])('matches %j with %j', (text, query, expected) => {
    expect(
      [...searchText(text, pattern(query))]
        .filter((match) => match !== undefined)
        .map(({ start, end }) => [start, end]),
    ).toEqual(expected)
  })
})
