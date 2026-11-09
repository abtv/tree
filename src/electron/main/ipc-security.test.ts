import { describe, expect, it, vi } from 'vitest'
import {
  MAX_ATTACHMENT_BYTES,
  MAX_CONTEXT_MENU_SELECTION_CODE_POINTS,
  isTrustedRendererUrl,
  validateAttachmentBytes,
  validateAttachmentId,
  validateAttachmentIds,
  validateClipboardWritePayload,
  validateClipboardContent,
  validateEditorContextMenuRequest,
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
  it.each([null, undefined, [], 'selection'])('rejects a non-record context menu request %j', (value) => {
    expect(() => validateEditorContextMenuRequest(value)).toThrow('Editor context menu request is invalid.')
  })

  it('counts U+FFFF as a single code point when bounding a context-menu selection', () => {
    const selectionText = '\uffff'.repeat(MAX_CONTEXT_MENU_SELECTION_CODE_POINTS)

    const result = validateEditorContextMenuRequest({
      x: 0,
      y: 0,
      selectionText,
      canCut: false,
      canCopy: true,
      canPaste: false,
      canSelectAll: true,
    })

    expect(result.selectionText).toBe('\uffff'.repeat(MAX_CONTEXT_MENU_SELECTION_CODE_POINTS - 1) + '…')
  })

  it.each([null, [], { text: 1, html: '<b>x</b>' }, { text: 'x', html: 1 }])(
    'rejects malformed rich clipboard value %j',
    (value) => {
      expect(() => validateClipboardWritePayload(value)).toThrow('Clipboard payload is invalid.')
    },
  )

  it.each([null, [], {}, { kind: 'text', text: 1 }, { kind: 'unknown', text: 'x' }])(
    'rejects malformed clipboard content %j',
    (value) => {
      expect(() => validateClipboardContent(value)).toThrow('Clipboard content is invalid.')
    },
  )

  it('copies only the validated fields from clipboard content', () => {
    expect(validateClipboardContent({ kind: 'text', text: '', attachmentId: '../secret' })).toEqual({
      kind: 'text',
      text: '',
    })
    expect(validateClipboardContent({ kind: 'image', attachmentId: 'safe-image', text: 'ignored' })).toEqual({
      kind: 'image',
      attachmentId: 'safe-image',
    })
    expect(() => validateClipboardContent({ kind: 'image', attachmentId: '../secret' })).toThrow('Attachment IDs')
  })

  it.each(['x', 'y', 'selectionText', 'canCut', 'canCopy', 'canPaste', 'canSelectAll'] as const)(
    'rejects a context menu request whose %s has the wrong type',
    (field) => {
      const request = {
        x: 4,
        y: 8,
        selectionText: 'label',
        canCut: true,
        canCopy: true,
        canPaste: false,
        canSelectAll: true,
      }

      expect(() => validateEditorContextMenuRequest({ ...request, [field]: null })).toThrow(
        'Editor context menu request is invalid.',
      )
    },
  )

  it.each([254, 255, 256])('bounds a mixed Unicode context-menu selection of %i code points', (length) => {
    const selectionText = 'x'.repeat(length - 1) + '😀'
    const request = { x: 0, y: 0, selectionText, canCut: false, canCopy: false, canPaste: true, canSelectAll: false }

    const result = validateEditorContextMenuRequest(request)

    expect(result.selectionText).toBe(length <= 255 ? selectionText : 'x'.repeat(255) + '…')
    expect(result).toMatchObject({ x: 0, y: 0, canCut: false, canCopy: false, canPaste: true, canSelectAll: false })
  })

  it('does not trust a matching renderer host and path under another protocol or port', () => {
    expect(isTrustedRendererUrl('http://tree/index.html', 'app://tree/index.html')).toBe(false)
    expect(isTrustedRendererUrl('http://localhost:5174/', 'http://localhost:5173/')).toBe(false)
    expect(isTrustedRendererUrl('app://tree/index.html?view=tree#node', 'app://tree/index.html')).toBe(true)
  })

  it('accepts only the expected renderer URL', () => {
    expect(isTrustedRendererUrl('app://tree/index.html', 'app://tree/index.html')).toBe(true)
    expect(isTrustedRendererUrl('app://tree/assets/index.js', 'app://tree/index.html')).toBe(false)
    expect(isTrustedRendererUrl('app://other/index.html', 'app://tree/index.html')).toBe(false)
    expect(isTrustedRendererUrl('file:///app/out/renderer/index.html', 'app://tree/index.html')).toBe(false)
    expect(isTrustedRendererUrl('https://evil.example/index.html', 'app://tree/index.html')).toBe(false)
    expect(isTrustedRendererUrl(undefined, 'app://tree/index.html')).toBe(false)
    expect(isTrustedRendererUrl('not a url', 'app://tree/index.html')).toBe(false)
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

  it('requires finite context-menu coordinates and bounds selected text', () => {
    const request = {
      x: 4,
      y: 8,
      selectionText: 'ordinary selection',
      canCut: true,
      canCopy: true,
      canPaste: false,
      canSelectAll: true,
    }

    expect(validateEditorContextMenuRequest(request)).toEqual(request)
    expect(() => validateEditorContextMenuRequest({ ...request, x: Number.NaN })).toThrow('Editor context menu request')
    expect(() => validateEditorContextMenuRequest({ ...request, y: Number.POSITIVE_INFINITY })).toThrow(
      'Editor context menu request',
    )
    expect(() => validateEditorContextMenuRequest({ ...request, x: Number.NEGATIVE_INFINITY })).toThrow(
      'Editor context menu request',
    )

    const longSelection = '😀'.repeat(MAX_CONTEXT_MENU_SELECTION_CODE_POINTS + 20)
    const bounded = validateEditorContextMenuRequest({ ...request, selectionText: longSelection }).selectionText

    expect(Array.from(bounded)).toHaveLength(MAX_CONTEXT_MENU_SELECTION_CODE_POINTS)
    expect(bounded).toBe('😀'.repeat(MAX_CONTEXT_MENU_SELECTION_CODE_POINTS - 1) + '…')
    expect(validateEditorContextMenuRequest({ ...request, selectionText: 'x'.repeat(100) }).selectionText).toBe(
      'x'.repeat(100),
    )
  })

  it('validates attachment IDs and lists', () => {
    expect(validateAttachmentId('image_01-test')).toBe('image_01-test')
    expect(validateAttachmentIds(['one', 'two'])).toEqual(['one', 'two'])
    expect(() => validateAttachmentId('../document')).toThrow('Attachment IDs')
    expect(() => validateAttachmentIds('one')).toThrow('Attachment IDs')
  })

  it.each([null, undefined, 42, true, ['safe-image'], {}])('rejects a nonstring attachment ID %j', (value) => {
    expect(() => validateAttachmentId(value)).toThrow(
      'Attachment IDs may contain only letters, numbers, underscores, and hyphens.',
    )
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
