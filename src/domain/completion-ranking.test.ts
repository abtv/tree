import { expect, it } from 'vitest'
import { compareCompletionRank, rankCompletionName } from './completion-ranking'

it.each([
  ['same', 'same', [0]],
  ['--_-_x', '-x', [4, -2, 2, 3, 6]],
  ['abbca', 'ba', [4, -0, 2, 2, 5]],
])('ranks %s against %s using a complete ordered alignment', (name, query, expected) => {
  expect(rankCompletionName(name, query, '_-')).toEqual(expected)
})

it('compares equal ranks as ties so callers can apply their alphabetical fallback', () => {
  expect(compareCompletionRank([4, -2, 5, 0, 9], [4, -2, 5, 0, 9])).toBe(0)
})

it('prefers a later final word boundary over the greedy subsequence', () => {
  expect(rankCompletionName('axb_b', 'ab')).toEqual([4, -2, 4, 0, 5])
})

it('recognizes word prefixes with the default underscore separator', () => {
  expect(rankCompletionName('red_apple', 'apple')).toEqual([2])
})
