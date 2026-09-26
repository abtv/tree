import { describe, expect, it } from 'vitest'
import { linkAtPosition, replaceLinkedText } from './document-links'

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
