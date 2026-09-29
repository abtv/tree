import { describe, expect, it } from 'vitest'
import { extractClipboardLinks, readClipboard, writeClipboard } from './clipboard'

describe('readClipboard', () => {
  it('uses an image in preference to text when both representations exist', async () => {
    await expect(
      readClipboard({
        read: async () => [
          {
            types: ['text/plain', 'image/png'],
            getType: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }),
          },
        ],
        readText: async () => 'text',
      }),
    ).resolves.toEqual({
      kind: 'image',
      png: new Uint8Array([1]),
    })
  })

  it('returns text when no image representation exists', async () => {
    await expect(
      readClipboard({
        read: async () => [{ types: ['text/plain'], getType: async () => 'text' }],
        readText: async () => 'hello',
      }),
    ).resolves.toEqual({ kind: 'text', text: 'hello' })
  })

  it('does not treat non-PNG image clipboard data as a PNG attachment', async () => {
    await expect(
      readClipboard({
        read: async () => [{ types: ['image/jpeg'], getType: async () => new Blob([new Uint8Array([1])]) }],
        readText: async () => 'fallback',
      }),
    ).resolves.toEqual({ kind: 'text', text: 'fallback' })
  })

  it('returns empty text for an empty clipboard', async () => {
    await expect(
      readClipboard({
        read: async () => [],
        readText: async () => '',
      }),
    ).resolves.toEqual({ kind: 'text', text: '' })
  })

  it('preserves matching hyperlink ranges from HTML clipboard data', async () => {
    await expect(
      readClipboard({
        read: async () => [{ types: ['text/plain', 'text/html'], getType: async () => '' }],
        readText: async () => 'See https://example.com',
        readHTML: () => '<p>See <a href="https://example.com">https://example.com</a></p>',
      }),
    ).resolves.toEqual({
      kind: 'text',
      text: 'See https://example.com',
      links: [{ start: 4, end: 23, url: 'https://example.com' }],
    })
  })

  it('does not preserve a partial hyperlink selection as a link', () => {
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

  it('returns plain text when the HTML clipboard representation exceeds its size bound', async () => {
    const html = `<a href="https://example.com">link</a>${' '.repeat(1_048_576)}`
    await expect(
      readClipboard({
        read: async () => [],
        readText: async () => 'link',
        readHTML: () => html,
      }),
    ).resolves.toEqual({ kind: 'text', text: 'link' })
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

  it('writes both plain text and HTML clipboard representations atomically', async () => {
    const calls: Array<{ text: string; html: string }> = []
    await writeClipboard(
      {
        read: async () => [],
        readText: async () => '',
        writeRichText: async (text, html) => {
          calls.push({ text, html })
        },
      },
      { text: 'https://example.com', html: '<a href="https://example.com">https://example.com</a>' },
    )
    expect(calls).toEqual([
      { text: 'https://example.com', html: '<a href="https://example.com">https://example.com</a>' },
    ])
  })

  it('falls back to separate clipboard representations when atomic writing is unavailable', async () => {
    const calls: string[] = []
    await writeClipboard(
      {
        read: async () => [],
        readText: async () => '',
        writeText: (text) => calls.push(`text:${text}`),
        writeHTML: (html) => calls.push(`html:${html}`),
      },
      { text: 'text', html: '<p>text</p>' },
    )
    expect(calls).toEqual(['text:text', 'html:<p>text</p>'])
  })
})
