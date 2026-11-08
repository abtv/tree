import { expect, it } from 'vitest'
import { foldTagName, tagNameMatch } from './tag-search'

it.each([
  ['test', 'tes', { start: 0, end: 3 }],
  ['new_tag', 'TAG', { start: 4, end: 7 }],
  ['ai-automation-meeting', 'tag', undefined],
  ['work', '', undefined],
  ['ΟΣ', 'ος', { start: 0, end: 2 }],
  ['Straße', 'SS', { start: 4, end: 5 }],
  ['𐐀bc', '𐐨B', { start: 0, end: 3 }],
  ['xİz', 'i', { start: 1, end: 2 }],
  ['Kelvin', 'k', { start: 0, end: 1 }],
])('maps continuous Unicode tag matches back to source characters: %s / %s', (name, query, expected) => {
  expect(tagNameMatch(name, query)).toEqual(expected)
})

it('folds contextual lowercase forms consistently', () => {
  expect(foldTagName('ΟΣ')).toBe(foldTagName('ος'))
  expect(foldTagName('οσ')).toBe(foldTagName('ος'))
})
