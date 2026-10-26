import { describe, expect, it } from 'vitest'
import { extractClipboardLinks } from './clipboard-links'

describe('clipboard link extraction', () => {
  it('retains the original href for a partial hyperlink label', () => {
    expect(extractClipboardLinks('<a href="https://example.com">example.com</a>', 'example.com')).toEqual([
      { start: 0, end: 11, url: 'https://example.com' },
    ])
  })

  it('decodes a non-breaking space in a hyperlink label to match the text flavor', () => {
    expect(extractClipboardLinks('<a href="https://example.com">A&nbsp;B</a>', 'A\u00a0B')).toEqual([
      { start: 0, end: 3, url: 'https://example.com' },
    ])
  })

  it('decodes decimal and hexadecimal numeric references in hyperlink labels', () => {
    expect(extractClipboardLinks('<a href="https://example.com">A&#8203;&#x2019;B</a>', 'A\u200b\u2019B')).toEqual([
      { start: 0, end: 4, url: 'https://example.com' },
    ])
  })

  it('decodes HTML character references only once', () => {
    expect(extractClipboardLinks('<a href="https://example.com">&amp;lt;</a>', '&lt;')).toEqual([
      { start: 0, end: 4, url: 'https://example.com' },
    ])
  })

  it('decodes an escaped ampersand in an href once', () => {
    expect(extractClipboardLinks('<a href="https://example.com/?a=1&amp;b=2">label</a>', 'label')).toEqual([
      { start: 0, end: 5, url: 'https://example.com/?a=1&b=2' },
    ])
  })

  it('keeps multiple decoded hyperlink ranges in text order', () => {
    expect(
      extractClipboardLinks(
        '<a href="https://one.example/?x=1&amp;y=2">One&nbsp;link</a> and <a href="https://two.example/">Two&#33;</a>',
        'One\u00a0link and Two!',
      ),
    ).toEqual([
      { start: 0, end: 8, url: 'https://one.example/?x=1&y=2' },
      { start: 13, end: 17, url: 'https://two.example/' },
    ])
  })

  it('ignores anchors with empty text or text absent from the clipboard strings', () => {
    expect(extractClipboardLinks('<a href="https://example.com"></a>', 'plain text')).toEqual([])
    expect(extractClipboardLinks('<a href="https://example.com">missing</a>', 'plain text')).toEqual([])
  })

  it('caps the number of links extracted from clipboard HTML', () => {
    const linkCount = 105
    const html = Array.from({ length: linkCount }, (_, index) => `<a href="https://${index}.example">x</a>`).join(' ')

    expect(extractClipboardLinks(html, 'x '.repeat(linkCount))).toHaveLength(100)
  })

  it('finishes promptly on repeated malformed anchor prefixes', () => {
    const malformed = '<a '.repeat(10_000)
    const startedAt = performance.now()

    expect(extractClipboardLinks(malformed, '')).toEqual([])
    expect(performance.now() - startedAt).toBeLessThan(2_000)
  }, 5_000)

  it('retains a link after a long malformed break tag without blocking clipboard parsing', () => {
    const html = `<br${' '.repeat(128_000)}x><a href="https://example.com">label</a>`
    const startedAt = performance.now()

    const links = extractClipboardLinks(html, 'label')
    const elapsed = performance.now() - startedAt

    expect(links).toEqual([{ start: 0, end: 5, url: 'https://example.com' }])
    expect(elapsed).toBeLessThan(2_000)
  }, 15_000)

  it.each(['<br>', '<BR />', '<br\t/\n>', '<br\u00a0>'])('preserves line breaks from %s before links', (tag) => {
    const html = `label${tag}<a href="https://example.com">label</a>`

    const links = extractClipboardLinks(html, 'label\nlabel')

    expect(links).toEqual([{ start: 6, end: 11, url: 'https://example.com' }])
  })
})
