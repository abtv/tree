import { describe, expect, it } from 'vitest'
import { isValidAttachmentDimensions, MAX_ATTACHMENT_DIMENSION, MAX_ATTACHMENT_PIXELS } from './attachment-dimensions'
import { parsePersistedState, validatePersistedState } from './document'

function savedWithAttachment(attachment: Record<string, unknown>): unknown {
  return {
    version: 6,
    document: { roots: [{ id: 'a', text: 'Image', attachment, children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'a' },
    view: { expandedIds: [] },
  }
}

// @requirement PRODUCT.md §17
describe('attachment dimensions', () => {
  it.each([
    [1, 1],
    [MAX_ATTACHMENT_DIMENSION, 1],
    [1, MAX_ATTACHMENT_DIMENSION],
    [8192, 8192],
    [MAX_ATTACHMENT_DIMENSION, Math.floor(MAX_ATTACHMENT_PIXELS / MAX_ATTACHMENT_DIMENSION)],
  ])('accepts %j×%j within the attachment limits', (width, height) => {
    expect(isValidAttachmentDimensions(width, height)).toBe(true)
  })

  it.each([
    [0, 1],
    [1, 0],
    [-1, 1],
    [1.5, 1],
    [MAX_ATTACHMENT_DIMENSION + 1, 1],
    [1, MAX_ATTACHMENT_DIMENSION + 1],
    [8193, 8192],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    ['1', 1],
    [null, 1],
    [undefined, 1],
    [1, undefined],
  ])('rejects %j×%j', (width, height) => {
    expect(isValidAttachmentDimensions(width, height)).toBe(false)
  })

  it('keeps a valid stored size when parsing', () => {
    const saved = savedWithAttachment({ id: 'image', mimeType: 'image/png', width: 640, height: 480 })

    const parsed = parsePersistedState(saved)

    expect(parsed.document.roots[0]!.attachment).toEqual({
      id: 'image',
      mimeType: 'image/png',
      width: 640,
      height: 480,
    })
  })

  it.each([
    { width: 640 },
    { height: 480 },
    { width: 0, height: 480 },
    { width: 640.5, height: 480 },
    { width: '640', height: 480 },
    { width: 32_768, height: 1 },
    { width: 8193, height: 8192 },
    { width: null, height: null },
  ])('drops an invalid stored size %j without rejecting the document', (size) => {
    const saved = savedWithAttachment({ id: 'image', mimeType: 'image/png', searchText: 'Text', ...size })

    expect(() => validatePersistedState(saved)).not.toThrow()
    const parsed = parsePersistedState(saved)

    expect(parsed.document.roots[0]).toEqual({
      id: 'a',
      text: 'Image',
      attachment: { id: 'image', mimeType: 'image/png', searchText: 'Text' },
      children: [],
    })
  })
})
