import { describe, expect, it, vi } from 'vitest'
import {
  MAX_ATTACHMENT_BYTES,
  isTrustedRendererUrl,
  validateAttachmentBytes,
  validateAttachmentId,
  validateAttachmentIds,
  validateClipboardWritePayload,
  validatePersistedEditorState,
} from './ipc-security'
import { decodePngWithZlib, onePixelPng, pngIhdr, pngWith, transparentPng } from './png-test-utils'

const state = {
  version: 1,
  document: { roots: [{ id: 'root', text: '', children: [] }] },
  location: { currentParentId: null, selectedNodeId: 'root' },
}

const validIhdr = [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]

describe('IPC security validation', () => {
  it('accepts only the expected renderer URL', () => {
    expect(isTrustedRendererUrl('file:///app/out/renderer/index.html', 'file:///app/out/renderer/index.html')).toBe(
      true,
    )
    expect(isTrustedRendererUrl('https://evil.example/index.html', 'file:///app/out/renderer/index.html')).toBe(false)
    expect(isTrustedRendererUrl(undefined, 'file:///app/out/renderer/index.html')).toBe(false)
    expect(isTrustedRendererUrl('not a url', 'file:///app/out/renderer/index.html')).toBe(false)
  })

  it('validates persisted state without rebuilding it', () => {
    expect(validatePersistedEditorState(state)).toBe(state)
    expect(() => validatePersistedEditorState({ version: 1 })).toThrow('unsupported format')
  })

  it('rejects malformed clipboard payloads', () => {
    expect(validateClipboardWritePayload({ text: 'text', html: '<p>text</p>' })).toEqual({
      text: 'text',
      html: '<p>text</p>',
    })
    expect(() => validateClipboardWritePayload({ text: 'text' })).toThrow('Clipboard payload')
  })

  it('validates attachment IDs and lists', () => {
    expect(validateAttachmentId('image_01-test')).toBe('image_01-test')
    expect(validateAttachmentIds(['one', 'two'])).toEqual(['one', 'two'])
    expect(() => validateAttachmentId('../document')).toThrow('Attachment IDs')
    expect(() => validateAttachmentIds('one')).toThrow('Attachment IDs')
  })

  it('accepts genuinely decodable PNGs and supported byte forms', () => {
    expect(validateAttachmentBytes(onePixelPng, decodePngWithZlib)).toBe(onePixelPng)
    expect(validateAttachmentBytes([...onePixelPng], decodePngWithZlib)).toEqual(onePixelPng)
    expect(validateAttachmentBytes({ type: 'Buffer', data: [...onePixelPng] }, decodePngWithZlib)).toEqual(onePixelPng)
    expect(validateAttachmentBytes(transparentPng, decodePngWithZlib)).toBe(transparentPng)
    expect(() => validateAttachmentBytes(new Uint8Array(), decodePngWithZlib)).toThrow('empty')
    expect(() => validateAttachmentBytes(new Uint8Array(MAX_ATTACHMENT_BYTES + 1), decodePngWithZlib)).toThrow(
      'too large',
    )
  })

  it('rejects the signature-and-IEND payload that contains no image data', () => {
    const invalidPng = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,
    ])
    expect(() => validateAttachmentBytes(invalidPng, decodePngWithZlib)).toThrow('PNG')
  })

  it('rejects truncated chunks, missing image data, bad CRCs, and zero dimensions', () => {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10]

    expect(() => validateAttachmentBytes(new Uint8Array([...signature, 0, 0, 0, 13, 73]), decodePngWithZlib)).toThrow(
      'PNG',
    )
    expect(() =>
      validateAttachmentBytes(
        pngWith([
          ['IHDR', validIhdr],
          ['IEND', []],
        ]),
        decodePngWithZlib,
      ),
    ).toThrow('PNG')

    const badCrc = Uint8Array.from(onePixelPng)
    badCrc[32] = badCrc[32]! ^ 0xff
    expect(() => validateAttachmentBytes(badCrc, decodePngWithZlib)).toThrow('PNG')

    const zeroWidth = [...validIhdr]
    zeroWidth[0] = 0
    zeroWidth[1] = 0
    zeroWidth[2] = 0
    zeroWidth[3] = 0
    expect(() =>
      validateAttachmentBytes(
        pngWith([
          ['IHDR', zeroWidth],
          ['IDAT', [1, 2, 3]],
          ['IEND', []],
        ]),
        decodePngWithZlib,
      ),
    ).toThrow('PNG')

    expect(() => validateAttachmentBytes(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), decodePngWithZlib)).toThrow(
      'PNG',
    )
  })

  it('rejects structurally valid PNGs whose image data cannot decode', () => {
    const corrupt = pngWith([
      ['IHDR', validIhdr],
      ['IDAT', [1, 2, 3]],
      ['IEND', []],
    ])
    expect(() => validateAttachmentBytes(corrupt, decodePngWithZlib)).toThrow('decodable')
    expect(() => validateAttachmentBytes(onePixelPng, () => false)).toThrow('decodable')
  })

  it('rejects PNGs above the decoded size budget before invoking the decoder', () => {
    const decode = vi.fn(() => true)
    const oversizedPixels = pngWith([
      ['IHDR', pngIhdr(30_000, 30_000)],
      ['IDAT', [1, 2, 3]],
      ['IEND', []],
    ])
    expect(() => validateAttachmentBytes(oversizedPixels, decode)).toThrow('image is too large')

    const oversizedSide = pngWith([
      ['IHDR', pngIhdr(32_768, 1)],
      ['IDAT', [1, 2, 3]],
      ['IEND', []],
    ])
    expect(() => validateAttachmentBytes(oversizedSide, decode)).toThrow('image is too large')

    const oversizedHeight = pngWith([
      ['IHDR', pngIhdr(1, 32_768)],
      ['IDAT', [1, 2, 3]],
      ['IEND', []],
    ])
    expect(() => validateAttachmentBytes(oversizedHeight, decode)).toThrow('image is too large')

    const justOverPixels = pngWith([
      ['IHDR', pngIhdr(8_192, 8_193)],
      ['IDAT', [1, 2, 3]],
      ['IEND', []],
    ])
    expect(() => validateAttachmentBytes(justOverPixels, decode)).toThrow('image is too large')

    expect(decode).not.toHaveBeenCalled()
  })

  it('accepts PNGs at the decoded size budget boundary', () => {
    const decode = vi.fn(() => true)
    const exactPixels = pngWith([
      ['IHDR', pngIhdr(8_192, 8_192)],
      ['IDAT', [1, 2, 3]],
      ['IEND', []],
    ])
    expect(validateAttachmentBytes(exactPixels, decode)).toBe(exactPixels)

    const tallWithinBudget = pngWith([
      ['IHDR', pngIhdr(32_767, 2_048)],
      ['IDAT', [1, 2, 3]],
      ['IEND', []],
    ])
    expect(validateAttachmentBytes(tallWithinBudget, decode)).toBe(tallWithinBudget)

    expect(decode).toHaveBeenCalledTimes(2)
  })

  it('accepts typed-array views and rejects invalid byte values', () => {
    const buffer = new ArrayBuffer(onePixelPng.byteLength + 2)
    new Uint8Array(buffer, 1, onePixelPng.byteLength).set(onePixelPng)

    expect(validateAttachmentBytes(new DataView(buffer, 1, onePixelPng.byteLength), decodePngWithZlib)).toEqual(
      onePixelPng,
    )
    expect(() => validateAttachmentBytes([256], decodePngWithZlib)).toThrow('invalid')
  })
})
