import { describe, expect, it } from 'vitest'
import {
  MAX_ATTACHMENT_BYTES,
  isTrustedRendererUrl,
  validateAttachmentBytes,
  validateAttachmentId,
  validateAttachmentIds,
  validateClipboardWritePayload,
  validatePersistedEditorState,
} from './ipc-security'

const state = {
  version: 1,
  document: { roots: [{ id: 'root', text: '', children: [] }] },
  location: { currentParentId: null, selectedNodeId: 'root' },
}

describe('IPC security validation', () => {
  it('accepts only the expected renderer URL', () => {
    expect(isTrustedRendererUrl('file:///app/out/renderer/index.html', 'file:///app/out/renderer/index.html')).toBe(
      true,
    )
    expect(isTrustedRendererUrl('https://evil.example/index.html', 'file:///app/out/renderer/index.html')).toBe(false)
    expect(isTrustedRendererUrl(undefined, 'file:///app/out/renderer/index.html')).toBe(false)
  })

  it('validates persisted state through the domain parser', () => {
    expect(validatePersistedEditorState(state).version).toBe(2)
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

  it('requires non-empty binary data within the size limit', () => {
    const png = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,
    ])
    expect(validateAttachmentBytes(png)).toBe(png)
    expect(validateAttachmentBytes([...png])).toEqual(png)
    expect(validateAttachmentBytes({ type: 'Buffer', data: [...png] })).toEqual(png)
    expect(() => validateAttachmentBytes(new Uint8Array())).toThrow('empty')
    expect(() => validateAttachmentBytes(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toThrow('PNG')
    expect(() => validateAttachmentBytes(new Uint8Array(MAX_ATTACHMENT_BYTES + 1))).toThrow('too large')
  })

  it('rejects malformed PNG chunk structure and zero-sized images', () => {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10]
    const ihdr = [0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 0, 0, 0, 0, 1, 8, 6, 0, 0, 0]

    expect(() => validateAttachmentBytes(new Uint8Array([...signature, 0, 0, 0, 13, 73]))).toThrow('PNG')
    expect(() => validateAttachmentBytes(new Uint8Array([...signature, ...ihdr, 0, 0, 0, 0]))).toThrow('PNG')
  })

  it('accepts typed-array views and rejects invalid byte values', () => {
    const png = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,
    ])
    const buffer = new ArrayBuffer(png.byteLength + 2)
    new Uint8Array(buffer, 1, png.byteLength).set(png)

    expect(validateAttachmentBytes(new DataView(buffer, 1, png.byteLength))).toEqual(png)
    expect(() => validateAttachmentBytes([256])).toThrow('invalid')
  })
})
