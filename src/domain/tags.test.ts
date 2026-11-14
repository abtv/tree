import { describe, expect, it } from 'vitest'
import {
  findTags,
  nodeTags,
  tagFragment,
  TAG_PREFIXES,
  tagPrefix,
  tagGroupLabel,
  lowercaseTypedMarkerText,
} from './tags'
import type { TreeNode } from './document-types'

// @requirement PRODUCT.md §20.13
describe('literal tags', () => {
  it.each(TAG_PREFIXES)('lowercases only typed letters inside a %s name', (prefix) => {
    expect(lowercaseTypedMarkerText(`${prefix}W`, 1, 2)).toBe(`${prefix}w`)
    expect(lowercaseTypedMarkerText(`${prefix}OldWName`, 4, 5)).toBe(`${prefix}OldwName`)
    expect(lowercaseTypedMarkerText(`${prefix}Anna_SMITH`, 6, 11)).toBe(`${prefix}Anna_smith`)
    expect(lowercaseTypedMarkerText(`Plan ${prefix}ПЛАН End`, 6, 10)).toBe(`Plan ${prefix}план End`)
  })

  it.each([
    ['#Work End', 6, 9],
    ['C#WORK', 2, 6],
    ['name@WORK.com', 5, 9],
    ['R&D', 2, 3],
    ['https://x.test/#WORK', 16, 20],
    ['#tag.WORK', 5, 9],
    ['##WORK', 2, 6],
  ])('keeps typing outside recognized names in %s', (text, start, end) => {
    expect(lowercaseTypedMarkerText(text, start, end)).toBe(text)
  })

  it('excludes hyperlinks and lowercases only marker portions of a typed fragment', () => {
    const text = '#WORK @ANNA &MEETING End'

    expect(lowercaseTypedMarkerText(text, 0, text.length)).toBe('#work @anna &meeting End')
    expect(lowercaseTypedMarkerText('#WORK', 1, 5, [{ start: 0, end: 5 }])).toBe('#WORK')
    expect(lowercaseTypedMarkerText('#İ End', 1, 2)).toBe('#i\u0307 End')
  })

  it('handles a long node without altering its existing names or suffix', () => {
    const prefix = '#Existing '.repeat(10_000)
    const suffix = ' @Existing'.repeat(10_000)
    const text = `${prefix}&W${suffix}`

    expect(lowercaseTypedMarkerText(text, prefix.length + 1, prefix.length + 2)).toBe(`${prefix}&w${suffix}`)
  })

  it.each(TAG_PREFIXES)('recognizes only %s names with the shared grammar and hyperlink exclusions', (prefix) => {
    const text = `${prefix}Anna_Smith ${prefix}anna-smith ${prefix}週_2 ${prefix}Anna Smith x${prefix}hidden ${prefix}`

    expect(findTags(text, [], prefix).map(({ name }) => name)).toEqual(['Anna_Smith', 'anna-smith', '週_2', 'Anna'])
    expect(findTags(`${prefix}Anna`, [{ start: 0, end: 5 }], prefix)).toEqual([])
    expect(findTags('name@example.com R&D https://a.test/?x&event', [], prefix)).toEqual([])
    expect(tagFragment(`Plan ${prefix}`, 6, prefix)).toEqual({ start: 5, end: 6, name: '' })
    expect(tagFragment(`${prefix}Anna`, 3, prefix)).toBeUndefined()
    expect(tagPrefix(`${prefix}Anna`)).toBe(prefix)
    expect(tagGroupLabel(prefix)).toBe(prefix === '#' ? 'Tags' : prefix === '@' ? 'People' : 'Events')
  })

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
