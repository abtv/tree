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

// @requirement PRODUCT.md §20.14.5
it.each([
  [[], 'Marked and starred'],
  [[star], 'Starred'],
  [[mark], 'Marked'],
  [[both], 'Marked and starred'],
  [[both, mark], 'Marked and starred'],
  [[mark, star], 'Marked and starred'],
  [[both, star], 'Marked and starred'],
] as const)('names the parts that are present, and both for an empty list: %j', (items, heading) => {
  expect(initialSearchHeading(items)).toBe(heading)
})
