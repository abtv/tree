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
        {
          ...image('a', 'second'),
          children: [image('b', 'first'), image('c', 'sized', { width: 2, height: 3 }), image('f', 'third')],
        },
        image('d', 'first'),
        { id: 'e', text: '', children: [] },
      ],
    }

    expect(attachmentIdsWithoutDimensions(document)).toEqual(['second', 'first', 'third'])
    expect(attachmentIdsWithoutDimensions({ roots: [{ id: 'x', text: '', children: [] }] })).toEqual([])
  })

  it('fills every missing reference to an attachment and keeps unrelated nodes and summaries', () => {
    const unrelated = { id: 'plain', text: 'Plain', children: [image('deep', 'other')] }
    const document: Document = {
      roots: [image('a', 'image'), unrelated, { id: 'p', text: '', children: [image('b', 'image')] }],
    }
    const summary = attachmentSummary(document)
    const before = JSON.stringify(document)

    const sizes = new Map([
      ['absent', { width: 2, height: 3 }],
      ['image', { width: 640, height: 480 }],
    ])

    const result = attachmentSizeEnrichment(sizes, 'fill')(document)

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

  it.each([
    { width: 20, height: 20 },
    { width: 10, height: 30 },
  ])('preserves the stored size during fill and corrects a single changed dimension to %j during replace', (size) => {
    const document: Document = { roots: [image('a', 'image', { width: 10, height: 20 })] }
    const sizes = new Map([['image', size]])

    const filled = attachmentSizeEnrichment(sizes, 'fill')(document)
    const replaced = attachmentSizeEnrichment(sizes, 'replace')(document)
    const same = attachmentSizeEnrichment(new Map([['image', { width: 10, height: 20 }]]), 'replace')(document)

    expect(filled).toBe(document)
    expect(replaced.roots[0]!.attachment).toMatchObject(size)
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

  it('skips tree traversal when the cached snapshot contains no images', () => {
    const roots: TreeNode[] = [{ id: 'plain', text: '', children: [] }]
    let rootReads = 0
    const document: Document = {
      get roots() {
        rootReads++
        return roots
      },
    }
    attachmentSummary(document)
    rootReads = 0
    const enrich = attachmentSizeEnrichment(new Map([['image', { width: 1, height: 1 }]]), 'replace')

    expect(enrich(document)).toBe(document)
    expect(attachmentIdsWithoutDimensions(document)).toEqual([])
    expect(rootReads).toBe(0)
  })

  it('returns a document that references none of the attachments unchanged', () => {
    const document: Document = { roots: [image('a', 'other')] }

    expect(attachmentSizeEnrichment(new Map([['image', { width: 1, height: 1 }]]), 'replace')(document)).toBe(document)
  })
})
