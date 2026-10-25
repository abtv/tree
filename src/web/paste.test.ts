import { describe, expect, it, vi } from 'vitest'
import { capturePasteClipboard } from './paste'
import { MAX_ATTACHMENT_BYTES } from '../shared/attachment-limits'

function data(files: File[] = [], text = '', html = ''): DataTransfer {
  return { files, getData: (type: string) => (type === 'text/html' ? html : text) } as unknown as DataTransfer
}

describe('browser paste event clipboard', () => {
  it.each(['', '<span>https://example.com/path</span>'])(
    'leaves URL recognition to the store when clipboard HTML has no anchors: %s',
    async (html) => {
      await expect(capturePasteClipboard(data([], 'https://example.com/path', html))()).resolves.toEqual({
        kind: 'text',
        text: 'https://example.com/path',
      })
    },
  )

  it('captures text and hyperlinks before the event data becomes unavailable', async () => {
    const transfer = data([], 'Example', '<a href="https://example.com">Example</a>')
    const read = capturePasteClipboard(transfer)
    transfer.getData = () => ''

    await expect(read()).resolves.toEqual({
      kind: 'text',
      text: 'Example',
      links: [{ start: 0, end: 7, url: 'https://example.com' }],
    })
  })

  it('prefers the PNG file to text and retains the file after the event', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' })
    const transfer = data([file], 'fallback')
    const read = capturePasteClipboard(transfer)
    Object.defineProperty(transfer, 'files', { value: [] })

    await expect(read()).resolves.toEqual({ kind: 'image', png: new Uint8Array([1, 2, 3]) })
  })

  it('rejects oversized PNG data without reading bytes or falling back to text', async () => {
    const file = new File([], 'large.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: MAX_ATTACHMENT_BYTES + 1 })
    const readBytes = vi.spyOn(file, 'arrayBuffer')

    await expect(capturePasteClipboard(data([file], 'fallback'))()).rejects.toThrow('maximum 25 MiB')
    expect(readBytes).not.toHaveBeenCalled()
  })

  it('does not reinterpret other file types as PNG attachments', async () => {
    const file = new File([], 'photo.jpg', { type: 'image/jpeg' })

    await expect(capturePasteClipboard(data([file], 'fallback'))()).resolves.toMatchObject({
      kind: 'text',
      text: 'fallback',
    })
  })

  it('propagates an image read failure without falling back to text', async () => {
    const file = new File([], 'image.png', { type: 'image/png' })
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('Image read failed'))

    await expect(capturePasteClipboard(data([file], 'fallback'))()).rejects.toThrow('Image read failed')
  })
})
