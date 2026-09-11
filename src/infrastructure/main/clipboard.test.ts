import { describe, expect, it } from 'vitest'
import { readClipboard } from './clipboard'

describe('readClipboard', () => {
  it('uses an image in preference to text when both representations exist', async () => {
    await expect(readClipboard({
      read: async () => [{ types: ['text/plain', 'image/png'], getType: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }) }],
      readText: async () => 'text',
    })).resolves.toEqual({
      kind: 'image',
      png: new Uint8Array([1]),
    })
  })

  it('returns text when no image representation exists', async () => {
    await expect(readClipboard({
      read: async () => [{ types: ['text/plain'], getType: async () => 'text' }],
      readText: async () => 'hello',
    })).resolves.toEqual({ kind: 'text', text: 'hello' })
  })

  it('returns empty text for an empty clipboard', async () => {
    await expect(readClipboard({
      read: async () => [],
      readText: async () => '',
    })).resolves.toEqual({ kind: 'text', text: '' })
  })
})
