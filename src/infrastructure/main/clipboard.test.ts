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
