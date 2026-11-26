import { expect, it } from 'vitest'
import {
  nodeSearchCompletionTerm,
  nodeSearchHighlights,
  prepareNodeSearch,
  searchNodeTerm,
  validNodeSearchMarker,
} from './node-search-query'
import type { TreeNode } from './document-types'

// @requirement PRODUCT.md §20.14.4
it.each([
  ['@al task', 1, { start: 0, end: 3, text: '@al' }],
  ['task @al next', 7, { start: 5, end: 8, text: '@al' }],
  ['task #wo', 8, { start: 5, end: 8, text: '#wo' }],
  ['😀\t&meet  task', 4, { start: 3, end: 8, text: '&meet' }],
  ['task @al next', 5, { start: 5, end: 8, text: '@al' }],
  ['task @al next', 8, { start: 5, end: 8, text: '@al' }],
  ['task @al next', 9, undefined],
  ['task@al', 7, undefined],
  ['task ', 5, undefined],
  ['', 0, undefined],
] as const)('locates the complete marker term in %s at caret %s', (query, caret, expected) => {
  expect(nodeSearchCompletionTerm(query, caret)).toEqual(expected)
})

function matches(query: string, node: TreeNode) {
  const preparation = prepareNodeSearch(query)
  let next = preparation.next()
  while (!next.done) next = preparation.next()
  return next.value.map((term) => [...searchNodeTerm(node, term)].filter((match) => match !== undefined))
}

// @requirement PRODUCT.md §20.14.3
it('highlights a complete marker term and leaves a term with two markers plain', () => {
  expect(validNodeSearchMarker('@Été')).toBe('@')
  expect(validNodeSearchMarker('#@Été')).toBeUndefined()
})

// @requirement PRODUCT.md §20.14.3
it('keeps literal punctuation and original UTF-16 offsets with Unicode smart case', () => {
  const node = { id: 'a', text: '😀 [x] Σ @Σ #K &Été', children: [] }

  expect(matches('[x] σ @ς #k &été', node)).toEqual([
    [{ start: 3, end: 6 }],
    [
      { start: 7, end: 8 },
      { start: 10, end: 11 },
    ],
    [{ start: 9, end: 11 }],
    [{ start: 12, end: 14 }],
    [{ start: 15, end: 19 }],
  ])
  expect(matches('@Σ #K &ÉTÉ', node)).toEqual([[{ start: 9, end: 11 }], [], []])
  expect(matches('#k.* [.*]', node)).toEqual([[], []])
})

// @requirement PRODUCT.md §20.14.3
it('rejects an invalid marker even when Unicode case folding would match a valid name', () => {
  const node = { id: 'a', text: '@ι', children: [] }

  expect(matches('@ι @\u0345', node)).toEqual([[{ start: 0, end: 2 }], []])
})

it('can interrupt preparation of a long pasted term before compiling a search pattern', () => {
  const preparation = prepareNodeSearch('x'.repeat(100_000))

  for (let step = 0; step < 1000; step++) expect(preparation.next()).toEqual({ done: false, value: undefined })
  preparation.return([])

  expect(preparation.next().done).toBe(true)
})

// @requirement PRODUCT.md §20.14.2
it.each([
  ['abcd cdef', [{ start: 0, end: 6 }]],
  [
    'abc def',
    [
      { start: 0, end: 3 },
      { start: 3, end: 6 },
    ],
  ],
])('merges overlapping but not adjacent literal highlights (%s)', (query, expected) => {
  const work = nodeSearchHighlights('abcdef', query, [])
  let step = work.next()
  while (!step.done) step = work.next()

  expect(step.value).toEqual(expected)
})

// @requirement PRODUCT.md §20.14.2
it('maps each inferred fragment to its own recognized marker and preserves explicit full matches', () => {
  const text = '@Alex @bob @Carol #work &meeting Rev'
  const work = nodeSearchHighlights(
    text,
    '@al @bo @ar @Carol #or & rev',
    [
      { start: 0, end: 5 },
      { start: 6, end: 10 },
      { start: 11, end: 17 },
      { start: 18, end: 23 },
      { start: 24, end: 32 },
    ],
    [
      { fragment: '@al', name: 'Alex' },
      { fragment: '@bo', name: 'bob' },
      { fragment: '@ar', name: 'Carol' },
      { fragment: '#or', name: 'work' },
      { fragment: '&', name: 'meeting' },
    ],
  )

  let step = work.next()
  while (!step.done) step = work.next()

  expect(step.value.map(({ start, end }) => text.slice(start, end))).toEqual(['@Al', '@bo', '@Carol', 'or', 'Rev'])
})

// @requirement PRODUCT.md §20.14.2
it('merges inferred fragments in source order without borrowing a full match from another marker', () => {
  const text = '@Jonathan #Jonathan @Jon &meeting'
  const work = nodeSearchHighlights(
    text,
    '@than @nat @Jon #Jonathan &meeting',
    [
      { start: 0, end: 9 },
      { start: 10, end: 19 },
      { start: 20, end: 24 },
      { start: 25, end: 33 },
    ],
    [
      { fragment: '@than', name: 'Jonathan' },
      { fragment: '@nat', name: 'Jonathan' },
    ],
  )
  let step = work.next()
  while (!step.done) step = work.next()

  expect(step.value).toEqual([
    { start: 3, end: 9 },
    { start: 10, end: 19 },
    { start: 20, end: 24 },
    { start: 25, end: 33 },
  ])
})

// @requirement PRODUCT.md §20.14.2
it('continues highlighting a recognized name after a nonmatching full-term scan yields', () => {
  const work = nodeSearchHighlights(
    '@Thunderstorms @An',
    '@storms @An',
    [
      { start: 0, end: 14 },
      { start: 15, end: 18 },
    ],
    [{ fragment: '@storms', name: 'Thunderstorms' }],
  )
  let step = work.next()
  while (!step.done) step = work.next()

  expect(step.value).toEqual([
    { start: 8, end: 14 },
    { start: 15, end: 18 },
  ])
})

// @requirement PRODUCT.md §20.14.3
it('prepares repeated terms once while preserving independent smart case', () => {
  const work = prepareNodeSearch('  alpha alpha\tAlpha\nalpha ')
  let step = work.next()
  while (!step.done) step = work.next()

  expect(step.value.map(({ pattern }) => [pattern.characters.join(''), pattern.sensitive])).toEqual([
    ['alpha', false],
    ['Alpha', true],
  ])
})
