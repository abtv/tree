import { describe, expect, it, vi } from 'vitest'
import { isPng, validateAttachmentBytes } from './png-validation'
import { onePixelPng, pngIhdr, pngWith } from './png-test-utils'
import { MAX_ATTACHMENT_BYTES } from './attachment-limits'

function withHeader(header: number[]) {
  return pngWith([
    ['IHDR', header],
    ['IDAT', [1]],
    ['IEND', []],
  ])
}

describe('shared PNG structural validation', () => {
  it('rejects a tiny input declaring a four-gigabyte chunk before attempting its CRC scan', () => {
    const bytes = onePixelPng.slice()
    bytes.set([255, 255, 255, 255], 8)
    const decode = vi.fn(() => true)

    expect(() => validateAttachmentBytes(bytes, decode)).toThrow('not a valid PNG')
    expect(decode).not.toHaveBeenCalled()
  })

  it('checks byte size before the PNG structure at the exact storage limit', () => {
    const decode = vi.fn(() => true)

    expect(() => validateAttachmentBytes(new Uint8Array(MAX_ATTACHMENT_BYTES), decode)).toThrow('not a valid PNG')
    expect(() => validateAttachmentBytes(new Uint8Array(MAX_ATTACHMENT_BYTES + 1), decode)).toThrow(
      'Attachment is too large.',
    )
    expect(decode).not.toHaveBeenCalled()
  })

  it('rejects a bad byte among otherwise valid bytes in either array representation', () => {
    const bytes = [...onePixelPng, 256]

    expect(() => validateAttachmentBytes(bytes, () => true)).toThrow('Attachment data is invalid.')
    expect(() => validateAttachmentBytes({ type: 'Buffer', data: bytes }, () => true)).toThrow(
      'Attachment data is invalid.',
    )
  })

  it('accepts the maximum height and rejects the next height before decoding', () => {
    const decode = vi.fn(() => true)
    const accepted = withHeader(pngIhdr(1, 32_767))

    expect(validateAttachmentBytes(accepted, decode)).toBe(accepted)
    expect(() => validateAttachmentBytes(withHeader(pngIhdr(1, 32_768)), decode)).toThrow(
      'Attachment image is too large.',
    )
    expect(decode).toHaveBeenCalledExactlyOnceWith(accepted)
  })

  it('rejects a CRC-valid header with an incorrect declared header size', () => {
    expect(isPng(withHeader([...pngIhdr(1, 1), 0]))).toBe(false)
    expect(isPng(onePixelPng.subarray(0, 8))).toBe(false)
  })

  it('requires the first chunk to identify itself as IHDR even when its bytes form a valid header', () => {
    const bytes = pngWith([
      ['tEXt', pngIhdr(1, 1)],
      ['IDAT', [1]],
      ['IEND', []],
    ])
    const decode = vi.fn(() => true)

    expect(() => validateAttachmentBytes(bytes, decode)).toThrow('not a valid PNG')
    expect(decode).not.toHaveBeenCalled()
  })

  it.each([
    [0, [1, 2, 4, 8, 16]],
    [2, [8, 16]],
    [3, [1, 2, 4, 8]],
    [4, [8, 16]],
    [6, [8, 16]],
  ] as const)('checks legal bit depths for color type %i', (color, depths) => {
    for (const depth of [0, 1, 2, 3, 4, 8, 16, 32]) {
      expect(isPng(withHeader(pngIhdr(1, 1, depth, color)))).toBe((depths as readonly number[]).includes(depth))
    }
  })

  it.each([1, 5, 7, 255])('rejects unknown color type %i', (color) => {
    expect(isPng(withHeader(pngIhdr(1, 1, 8, color)))).toBe(false)
  })

  it.each([10, 11, 12])('rejects an invalid header method at byte %i before decoding', (index) => {
    const header = pngIhdr(1, 1)
    header[index] = 2
    const decode = vi.fn(() => true)

    expect(() => validateAttachmentBytes(withHeader(header), decode)).toThrow('not a valid PNG')
    expect(decode).not.toHaveBeenCalled()
  })

  it('accepts Adam7 interlace and rejects zero height', () => {
    const header = pngIhdr(1, 1)
    header[12] = 1

    expect(isPng(withHeader(header))).toBe(true)
    expect(isPng(withHeader(pngIhdr(1, 0)))).toBe(false)
  })

  it('requires header, data and a final empty end chunk without trailing bytes', () => {
    const header: [string, number[]] = ['IHDR', pngIhdr(1, 1)]
    const data: [string, number[]] = ['IDAT', [1]]
    const end: [string, number[]] = ['IEND', []]

    for (const chunks of [
      [data, header, end],
      [header, end],
      [header, data],
      [header, ['IDAT', []], end],
      [header, data, ['IEND', [1]]],
    ] as Array<Array<[string, number[]]>>) {
      expect(isPng(pngWith(chunks))).toBe(false)
    }
    expect(isPng(new Uint8Array([...onePixelPng, 0]))).toBe(false)
    expect(isPng(onePixelPng.subarray(0, onePixelPng.length - 1))).toBe(false)
  })

  it.each([
    undefined,
    null,
    false,
    1,
    'png',
    {},
    { type: 'Other', data: [...onePixelPng] },
    { type: 'Buffer', data: 'png' },
  ])('rejects invalid byte container %j', (value) => {
    expect(() => validateAttachmentBytes(value, () => true)).toThrow('Attachment data is invalid.')
  })

  it.each([-1, 256, 0.5, NaN, Infinity, '1', null])('rejects non-byte array member %j in both array forms', (value) => {
    for (const input of [[value], { type: 'Buffer', data: [value] }]) {
      expect(() => validateAttachmentBytes(input, () => true)).toThrow('Attachment data is invalid.')
    }
  })

  it('accepts an ArrayBuffer and respects the offset and length of a view', () => {
    const padded = new Uint8Array(onePixelPng.length + 4)
    padded.set(onePixelPng, 2)

    expect(validateAttachmentBytes(onePixelPng.slice().buffer, () => true)).toEqual(onePixelPng)
    expect(validateAttachmentBytes(new DataView(padded.buffer, 2, onePixelPng.length), () => true)).toEqual(onePixelPng)
  })
})
