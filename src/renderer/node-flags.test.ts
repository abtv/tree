import { expect, it } from 'vitest'
import { initialSearchHeading, nodeFlagsLabel } from './node-flags'

const star = { starred: true } as const
const mark = { marked: true } as const
const both = { starred: true, marked: true } as const

// @requirement PRODUCT.md §2.7
it('names a mark before a star and nothing for a plain node', () => {
  expect(nodeFlagsLabel({})).toBeUndefined()
  expect(nodeFlagsLabel(star)).toBe('Starred')
  expect(nodeFlagsLabel(mark)).toBe('Marked')
  expect(nodeFlagsLabel(both)).toBe('Marked, starred')
})

// @requirement PRODUCT.md §20.14
it.each([
  [[], 'Recent'],
  [[{}], 'Recent'],
  [[star, {}], 'Starred and recent'],
  [[mark, {}], 'Marked and recent'],
  [[both, {}], 'Marked and recent'],
  [[mark, star], 'Marked, starred and recent'],
  [[both, star], 'Marked, starred and recent'],
] as const)('names the marked and starred parts only when present: %j', (items, heading) => {
  expect(initialSearchHeading(items)).toBe(heading)
})
