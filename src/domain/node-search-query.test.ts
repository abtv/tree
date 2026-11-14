import { expect, it } from 'vitest'
import { prepareNodeSearch, searchNodeTerm } from './node-search-query'
import type { TreeNode } from './document-types'

function matches(query: string, node: TreeNode) {
  const preparation = prepareNodeSearch(query)
  let next = preparation.next()
  while (!next.done) next = preparation.next()
  return next.value.map((term) => [...searchNodeTerm(node, term)].filter((match) => match !== undefined))
}

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

it('can interrupt preparation of a long pasted term before compiling a search pattern', () => {
  const preparation = prepareNodeSearch('x'.repeat(100_000))

  for (let step = 0; step < 1000; step++) expect(preparation.next()).toEqual({ done: false, value: undefined })
  preparation.return([])

  expect(preparation.next().done).toBe(true)
})
