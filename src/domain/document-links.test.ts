import { describe, expect, it } from 'vitest'
import { insertLinks, linkAtPosition, replaceLinkedText, replaceLinkedTextRanges } from './document-links'

describe('replaceLinkedText', () => {
  it('preserves unaffected links and shifts them around an edit', () => {
    const url = 'https://example.com'
    const text = `before ${url} after`
    const start = text.indexOf(url)

    expect(replaceLinkedText(text, [{ start, end: start + url.length, url }], 0, 6, 'now').links).toEqual([
      { start: 4, end: 4 + url.length, url },
    ])
  })

  it('removes a link intersected by the replacement', () => {
    const url = 'https://example.com'
    expect(replaceLinkedText(url, [{ start: 0, end: url.length, url }], 3, 4, '').links).toEqual([])
  })

  it('inserts at the requested character within a link', () => {
    const url = 'https://example.com'
    const result = replaceLinkedText(url, [{ start: 0, end: url.length, url }], 2, 2, 'X')

    expect(result.text).toBe('htXtps://example.com')
    expect(result.links).toEqual([])

    const valid = replaceLinkedText(url, [{ start: 0, end: url.length, url }], url.length, url.length, '/a')
    expect(valid.links).toEqual([{ start: 0, end: url.length + 2, url: `${url}/a` }])
  })
})

describe('insertLinks', () => {
  const url = 'https://example.com'
  const link = { start: 0, end: url.length, url }

  it('recomputes the URL and keeps a link a paste lands inside when the covered text stays valid', () => {
    expect(insertLinks([link], 15, 'x')).toEqual([{ start: 0, end: 20, url: 'https://examplex.com' }])
  })

  it('drops a link a paste lands inside when the covered text is no longer a valid URL', () => {
    expect(insertLinks([link], 5, 'XYZ')).toEqual([])
  })

  it('leaves a link untouched when the paste lands exactly at either boundary', () => {
    expect(insertLinks([link], url.length, '!')).toEqual([link])
    expect(insertLinks([link], 0, '!')).toEqual([{ start: 1, end: url.length + 1, url }])
  })

  it('keeps a valid pasted link range when the surrounding link is dropped', () => {
    const pasted = 'https://paste.example'
    const result = insertLinks([link], 5, pasted, [{ start: 0, end: pasted.length, url: pasted }])
    expect(result).toEqual([{ start: 5, end: 5 + pasted.length, url: pasted }])
  })
})

describe('linkAtPosition', () => {
  const url = 'https://example.com'
  const link = { start: 1, end: 1 + url.length, url }

  it('matches the link at its first and last character', () => {
    expect(linkAtPosition([link], link.start)).toEqual(link)
    expect(linkAtPosition([link], link.end - 1)).toEqual(link)
  })

  it('does not match the characters immediately before or after the link', () => {
    expect(linkAtPosition([link], link.start - 1)).toBeUndefined()
    expect(linkAtPosition([link], link.end)).toBeUndefined()
  })

  it('returns undefined when there are no links', () => {
    expect(linkAtPosition(undefined, 0)).toBeUndefined()
    expect(linkAtPosition([], 0)).toBeUndefined()
  })

  it('picks the link that actually covers the position among several', () => {
    const other = { start: link.end + 5, end: link.end + 10, url: 'https://example.org' }
    expect(linkAtPosition([link, other], other.start)).toEqual(other)
    expect(linkAtPosition([link, other], link.start)).toEqual(link)
  })
})

describe('replaceLinkedTextRanges', () => {
  const url = 'https://example.com'

  it('keeps a link wrapped by two insertions and shifts it behind the opening delimiter', () => {
    const result = replaceLinkedTextRanges(
      url,
      [{ start: 0, end: url.length, url }],
      [
        { start: 0, end: 0, inserted: '(' },
        { start: url.length, end: url.length, inserted: ')' },
      ],
    )
    expect(result.text).toBe(`(${url})`)
    expect(result.links).toEqual([{ start: 1, end: url.length + 1, url }])
    expect(result.createsNewLink).toBe(false)
  })

  it('shifts a link that follows the wrapped range by both delimiters', () => {
    const text = `ab ${url}`
    const result = replaceLinkedTextRanges(
      text,
      [{ start: 3, end: text.length, url }],
      [
        { start: 0, end: 0, inserted: '"' },
        { start: 2, end: 2, inserted: '"' },
      ],
    )
    expect(result.text).toBe(`"ab" ${url}`)
    expect(result.links).toEqual([{ start: 5, end: text.length + 2, url }])
  })

  it('creates a link when removing delimiters exposes a bare URL', () => {
    const text = `"${url}"`
    const result = replaceLinkedTextRanges(
      text,
      [],
      [
        { start: 0, end: 1, inserted: '' },
        { start: text.length - 1, end: text.length, inserted: '' },
      ],
    )
    expect(result.text).toBe(url)
    expect(result.links).toEqual([{ start: 0, end: url.length, url }])
    expect(result.createsNewLink).toBe(true)
  })

  it('drops a link that an edit splits', () => {
    const result = replaceLinkedTextRanges(
      url,
      [{ start: 0, end: url.length, url }],
      [{ start: 4, end: 4, inserted: 'X' }],
    )
    expect(result.links).toEqual([])
  })

  it('leaves the text unchanged when two edits overlap', () => {
    const result = replaceLinkedTextRanges(
      'abcdef',
      [],
      [
        { start: 0, end: 4, inserted: 'X' },
        { start: 2, end: 5, inserted: 'Y' },
      ],
    )
    expect(result.text).toBe('abcdef')
  })

  it('clamps edit bounds to the text', () => {
    const result = replaceLinkedTextRanges('ab', [], [{ start: 5, end: 9, inserted: '!' }])
    expect(result.text).toBe('ab!')
  })
})
