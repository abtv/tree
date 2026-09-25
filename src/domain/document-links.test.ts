import { describe, expect, it } from 'vitest'
import { replaceLinkedText } from './document-links'

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
