import { describe, expect, it, vi } from 'vitest'
import { readClipboard, writeClipboard } from './clipboard'

describe('readClipboard', () => {
  it('rejects an oversized image before reading its bytes or falling back to text', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(1))
    const readText = vi.fn(async () => 'fallback')

    await expect(
      readClipboard({
        read: async () => [
          { types: ['image/png', 'text/plain'], getType: async () => ({ size: 25 * 1024 * 1024 + 1, arrayBuffer }) },
        ],
        readText,
      }),
    ).rejects.toThrow('Clipboard image is too large (maximum 25 MiB).')
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(readText).not.toHaveBeenCalled()
  })

  it('reads image bytes when the reported size is exactly the attachment limit', async () => {
    const arrayBuffer = vi.fn(async () => new Uint8Array([1]).buffer)

    await expect(
      readClipboard({
        read: async () => [{ types: ['image/png'], getType: async () => ({ size: 25 * 1024 * 1024, arrayBuffer }) }],
        readText: async () => '',
      }),
    ).resolves.toEqual({ kind: 'image', png: new Uint8Array([1]) })
    expect(arrayBuffer).toHaveBeenCalledOnce()
  })

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
