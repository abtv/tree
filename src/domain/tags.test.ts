import { describe, expect, it } from 'vitest'
import { findTags, nodeTags, tagFragment } from './tags'
import type { TreeNode } from './document-types'

// @requirement PRODUCT.md §20.13
describe('literal tags', () => {
  it('scans each immutable node once and refreshes tags for a replacement with the same ID', () => {
    let reads = 0
    const original: TreeNode = {
      id: 'node',
      get text() {
        reads += 1
        return '#Work'
      },
      children: [],
    }
    const replacement: TreeNode = { id: 'node', text: '#Personal', children: [] }

    expect(nodeTags(original)).toEqual([{ start: 0, end: 5, name: 'Work' }])
    expect(nodeTags(original)).toEqual([{ start: 0, end: 5, name: 'Work' }])
    expect(nodeTags(replacement)).toEqual([{ start: 0, end: 9, name: 'Personal' }])
    expect(nodeTags(original)).toEqual([{ start: 0, end: 5, name: 'Work' }])
    expect(reads).toBe(1)
  })

  it('keeps tags adjacent to excluded ranges', () => {
    expect(
      findTags('x #tag y', [
        { start: 0, end: 2 },
        { start: 6, end: 8 },
      ]),
    ).toEqual([{ start: 2, end: 6, name: 'tag' }])
  })

  it('rejects a negative caret even when slicing would expose a valid fragment', () => {
    expect(tagFragment('#tag ', -1)).toBeUndefined()
  })

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
