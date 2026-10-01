import { describe, expect, it } from 'vitest'
import {
  attachImage,
  attachmentSummary,
  deleteNode,
  insertSiblingAfter,
  insertSubtreeSibling,
  replaceSiblingRange,
  createInitialDocument,
  buildNodeIndex,
  deleteLink,
  removeTextRange,
  pasteText,
  editNodeText,
  type Document,
  type TreeNode,
} from './document'
import { seedEmptyAttachmentSummary } from './document-attachments'
import { requireNode } from './document-index'

describe('derived attachment accounting', () => {
  it('uses a seeded empty summary without traversing the known empty document', () => {
    let reads = 0
    const document: Document = {
      get roots() {
        reads += 1
        return []
      },
    }
    seedEmptyAttachmentSummary(document)
    expect(attachmentSummary(document).size).toBe(0)
    expect(reads).toBe(0)
  })

  it('seeds the initial document summary before its first query', () => {
    const document = createInitialDocument('root')
    let reads = 0
    // Instrument the synthetic fixture only, retaining its original value.
    Object.defineProperty(document.roots[0]!, 'attachment', {
      get() {
        reads += 1
        return undefined
      },
    })
    expect(attachmentSummary(document).size).toBe(0)
    expect(reads).toBe(0)
  })

  it('keeps warm indexes through link deletion, range removal, paste and image insertion', () => {
    const url = 'https://a.test'
    let childrenReads = 0
    const watched: TreeNode = {
      id: 'watched',
      text: '',
      get children() {
        childrenReads += 1
        return []
      },
    }
    const document: Document = {
      roots: [{ id: 'target', text: url, links: [{ start: 0, end: url.length, url }], children: [] }, watched],
    }
    buildNodeIndex(document)
    attachmentSummary(document)
    for (const result of [
      deleteLink(document, 'target', url.length)!,
      editNodeText(document, 'target', 'ordinary'),
      removeTextRange(document, 'target', 0, 1),
      pasteText(document, 'target', 0, '!'),
      attachImage(document, 'target', { id: 'image', mimeType: 'image/png' }),
    ]) {
      const before = childrenReads
      expect(requireNode(result, 'target').node).toBe(result.roots[0])
      expect(childrenReads).toBe(before)
    }
    expect(() => requireNode(document, 'missing')).toThrow('Node missing does not exist.')
  })

  it('answers summary queries after membership changes without traversing untouched nodes again', () => {
    let attachmentReads = 0
    const watched: TreeNode = {
      id: 'watched',
      text: '',
      children: [],
      get attachment() {
        attachmentReads += 1
        return { id: 'shared', mimeType: 'image/png' as const }
      },
    }
    const document: Document = { roots: [{ id: 'target', text: '', children: [] }, watched] }
    attachmentSummary(document)
    const image = { id: 'added', mimeType: 'image/png' as const }
    const operations = [
      () => attachImage(document, 'target', image),
      () => insertSiblingAfter(document, 'target', 'new', '', image),
      () =>
        insertSubtreeSibling(
          document,
          'target',
          'after',
          { id: 'source', text: '', attachment: image, children: [] },
          () => 'copy',
        ),
      () =>
        replaceSiblingRange(document, 'target', 1, [{ id: 'replacement', text: '', attachment: image, children: [] }]),
      () => deleteNode(document, 'target'),
      () => deleteNode(attachImage(document, 'target', image), 'target'),
    ]
    for (const operation of operations) {
      const result = operation()
      const readsBeforeQuery = attachmentReads
      expect(attachmentSummary(result).get('shared')).toBe(1)
      // Architecture §11 requires propagated summaries so cleanup and history
      // queries cost no additional traversal of the document's untouched nodes.
      expect(attachmentReads).toBe(readsBeforeQuery)
    }
    expect(attachmentSummary(deleteNode(document, 'target'))).toBe(attachmentSummary(document))
  })
})
