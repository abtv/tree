import { describe, expect, it } from 'vitest'
import { attachmentIdsWithoutDimensions, attachmentSizeEnrichment } from './attachment-size-enrichment'
import { attachmentSummary, type Document, type TreeNode } from './document'

function image(id: string, attachmentId: string, size?: { width: number; height: number }): TreeNode {
  return { id, text: id, attachment: { id: attachmentId, mimeType: 'image/png', ...size }, children: [] }
}

// @requirement PRODUCT.md §17
describe('attachment size enrichment', () => {
  it('lists each attachment without a stored size once, in tree order', () => {
    const document: Document = {
      roots: [
        { ...image('a', 'second'), children: [image('b', 'first'), image('c', 'sized', { width: 2, height: 3 })] },
        image('d', 'first'),
        { id: 'e', text: '', children: [] },
      ],
    }

    expect(attachmentIdsWithoutDimensions(document)).toEqual(['second', 'first'])
    expect(attachmentIdsWithoutDimensions({ roots: [{ id: 'x', text: '', children: [] }] })).toEqual([])
  })

  it('fills every missing reference to an attachment and keeps unrelated nodes and summaries', () => {
    const unrelated = { id: 'plain', text: 'Plain', children: [image('deep', 'other')] }
    const document: Document = {
      roots: [image('a', 'image'), unrelated, { id: 'p', text: '', children: [image('b', 'image')] }],
    }
    const summary = attachmentSummary(document)
    const before = JSON.stringify(document)

    const result = attachmentSizeEnrichment(new Map([['image', { width: 640, height: 480 }]]), 'fill')(document)

    expect(JSON.stringify(document)).toBe(before)
    expect(result.roots[0]!.attachment).toEqual({ id: 'image', mimeType: 'image/png', width: 640, height: 480 })
    expect(result.roots[2]!.children[0]!.attachment).toEqual({
      id: 'image',
      mimeType: 'image/png',
      width: 640,
      height: 480,
    })
    expect(result.roots[1]).toBe(unrelated)
    expect(attachmentSummary(result)).toBe(summary)
  })

  it('fills only missing sizes, while replace also corrects a different size', () => {
    const document: Document = { roots: [image('a', 'image', { width: 10, height: 20 })] }
    const size = new Map([['image', { width: 20, height: 10 }]])

    const filled = attachmentSizeEnrichment(size, 'fill')(document)
    const replaced = attachmentSizeEnrichment(size, 'replace')(document)
    const same = attachmentSizeEnrichment(new Map([['image', { width: 10, height: 20 }]]), 'replace')(document)

    expect(filled).toBe(document)
    expect(replaced.roots[0]!.attachment).toMatchObject({ width: 20, height: 10 })
    expect(same).toBe(document)
  })

  it('shares each replacement across snapshots and returns the same result for the same document', () => {
    const shared = { id: 'p', text: '', children: [image('a', 'image')] }
    const current: Document = { roots: [shared, { id: 'edited', text: 'now', children: [] }] }
    const undo: Document = { roots: [shared, { id: 'edited', text: 'before', children: [] }] }
    const enrich = attachmentSizeEnrichment(new Map([['image', { width: 1, height: 1 }]]), 'fill')

    const next = enrich(current)
    const previous = enrich(undo)

    expect(previous.roots[0]).toBe(next.roots[0])
    expect(enrich(current)).toBe(next)
  })

  it('returns a document that references none of the attachments unchanged', () => {
    const document: Document = { roots: [image('a', 'other')] }

    expect(attachmentSizeEnrichment(new Map([['image', { width: 1, height: 1 }]]), 'replace')(document)).toBe(document)
  })
})
