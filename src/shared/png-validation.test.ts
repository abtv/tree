import { describe, expect, it, vi } from 'vitest'
import {
  isPng,
  PNG_DIMENSIONS_HEADER_BYTES,
  pngPresentation,
  readPngDimensions,
  validateAttachmentBytes,
} from './png-validation'
import { onePixelPng, pngIhdr, pngWith, transparentPng } from './png-test-utils'
import { MAX_ATTACHMENT_BYTES } from './attachment-limits'

function withHeader(header: number[]) {
  return pngWith([
    ['IHDR', header],
    ['IDAT', [1]],
    ['IEND', []],
  ])
}

describe('PNG presentation metadata', () => {
  const header: [string, number[]] = ['IHDR', pngIhdr(800, 600)]
  const control: [string, number[]] = ['acTL', [0, 0, 0, 2, 0, 0, 0, 0]]
  const image: [string, number[]] = ['IDAT', [97, 99, 84, 76]]

  it('preserves animation in a PNG view with a nonzero byte offset', () => {
    const png = pngWith([header, control, image])
    const padded = new Uint8Array(png.length + 6)
    padded.set(png, 5)

    expect(pngPresentation(padded.subarray(5, -1))).toBe('original')
  })

  it('does not detect bytes within or after image data or in a truncated header', () => {
    expect(pngPresentation(pngWith([header, image, control]))).toBe('plain')
    expect(pngPresentation(new Uint8Array([137, 80, 78, 71]))).toBe('original')
  })

  it('keeps the original when image data is missing or its first chunk is truncated', () => {
    const headerOnly = pngWith([header])
    const png = pngWith([header, image])
    const partialDataHeader = png.subarray(0, headerOnly.length + 6)
    const partialDataChunk = png.subarray(0, png.length - 1)

    expect(pngPresentation(headerOnly)).toBe('original')
    expect(pngPresentation(partialDataHeader)).toBe('original')
    expect(pngPresentation(partialDataChunk)).toBe('original')
  })

  it('keeps the original for an image whose declared dimensions cannot be used', () => {
    const png = pngWith([['IHDR', pngIhdr(0, 600)], image])

    expect(pngPresentation(png)).toBe('original')
  })

  it('distinguishes embedded profiles from explicit media color metadata', () => {
    expect(pngPresentation(pngWith([header, ['iCCP', [1]], image]))).toBe('profiled')
    expect(pngPresentation(pngWith([header, ['cICP', [9, 16, 0, 1]], image]))).toBe('original')
  })

  it('uses the ordinary path for standard sRGB chromaticities or an explicit sRGB marker', () => {
    const chromaticities = (red: number): [string, number[]] => {
      const values = new DataView(new ArrayBuffer(32))
      const pairs = [31270, 32900, red, 33000, 30000, 60000, 15000, 6000]
      pairs.forEach((value, index) => values.setUint32(index * 4, value))
      return ['cHRM', [...new Uint8Array(values.buffer)]]
    }

    expect(pngPresentation(pngWith([header, chromaticities(64000), image]))).toBe('plain')
    expect(pngPresentation(pngWith([header, chromaticities(68000), image]))).toBe('profiled')
    expect(pngPresentation(pngWith([header, chromaticities(68000), ['sRGB', [0]], image]))).toBe('plain')
  })

  it('does not read ordinary metadata or a short chromaticity chunk as a color profile', () => {
    const comment = Array.from('Comment\0Exported from screenshot', (character) => character.charCodeAt(0))
    const incompleteChromaticities = Array.from({ length: 28 }, () => 0)

    expect(pngPresentation(pngWith([header, ['tEXt', comment], image]))).toBe('plain')
    expect(pngPresentation(pngWith([header, ['cHRM', incompleteChromaticities], image]))).toBe('plain')
  })
})

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

  it('reads the image size from the header alone', () => {
    const header = withHeader(pngIhdr(640, 480)).subarray(0, PNG_DIMENSIONS_HEADER_BYTES)

    expect(readPngDimensions(header)).toEqual({ width: 640, height: 480 })
    expect(readPngDimensions(onePixelPng)).toEqual({ width: 1, height: 1 })
    expect(readPngDimensions(transparentPng)).toEqual({ width: 2, height: 1 })
  })

  it.each([
    [32_767, 2048, { width: 32_767, height: 2048 }],
    [8192, 8192, { width: 8192, height: 8192 }],
    [32_768, 1, undefined],
    [8193, 8192, undefined],
    [0, 1, undefined],
    [1, 0, undefined],
  ])('reads a %i×%i header within the attachment limits only', (width, height, expected) => {
    expect(readPngDimensions(withHeader(pngIhdr(width, height)))).toEqual(expected)
  })

  it('returns no size for anything that is not a PNG signature followed by an IHDR header', () => {
    const wrongSignature = onePixelPng.slice()
    wrongSignature[1] = 0
    const wrongLength = onePixelPng.slice()
    wrongLength[11] = 14
    const wrongType = pngWith([['IDAT', pngIhdr(1, 1)]])

    expect(readPngDimensions(onePixelPng.subarray(0, PNG_DIMENSIONS_HEADER_BYTES - 1))).toBeUndefined()
    expect(readPngDimensions(wrongSignature)).toBeUndefined()
    expect(readPngDimensions(wrongLength)).toBeUndefined()
    expect(readPngDimensions(wrongType)).toBeUndefined()
    expect(readPngDimensions(new Uint8Array(0))).toBeUndefined()
  })

  it('accepts an ArrayBuffer and respects the offset and length of a view', () => {
    const padded = new Uint8Array(onePixelPng.length + 4)
    padded.set(onePixelPng, 2)

    expect(validateAttachmentBytes(onePixelPng.slice().buffer, () => true)).toEqual(onePixelPng)
    expect(validateAttachmentBytes(new DataView(padded.buffer, 2, onePixelPng.length), () => true)).toEqual(onePixelPng)
  })
})
