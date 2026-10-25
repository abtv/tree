import { describe, expect, it } from 'vitest'
import { findTags, tagFragment } from './tags'

// @requirement PRODUCT.md §20.13
describe('literal tags', () => {
  it('recognizes Unicode letters and digits, preserves case, and stops at punctuation', () => {
    const text = '#Work #work #план-2026_週 #１２٣ #_ #- #two.words'

    expect(findTags(text).map((tag) => text.slice(tag.start, tag.end))).toEqual([
      '#Work',
      '#work',
      '#план-2026_週',
      '#１２٣',
      '#_',
      '#-',
      '#two',
    ])
  })

  it('requires a word boundary and excludes hyperlinks', () => {
    const text = 'C#code https://example.com/#anchor ##title #label #real'
    const start = text.indexOf('#label')

    expect(findTags(text, [{ start, end: start + 6 }]).map((tag) => tag.name)).toEqual(['real'])
    expect(findTags('#')).toEqual([])
  })

  it('recognizes only a caret at the end of a tag fragment', () => {
    expect(tagFragment('Plan #', 6)).toEqual({ start: 5, end: 6, name: '' })
    expect(tagFragment('Plan #週_2-x suffix', 11)).toEqual({ start: 5, end: 11, name: '週_2-x' })
    for (const caret of [-1, 0.5, 5, 7, 100]) expect(tagFragment('Plan #abc', caret)).toBeUndefined()
    expect(tagFragment('a#tag', 5)).toBeUndefined()
    expect(tagFragment('#tag ', 5)).toBeUndefined()
  })
})
