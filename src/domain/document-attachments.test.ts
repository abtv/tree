import { describe, expect, it } from 'vitest'
import {
  attachImage,
  attachmentSummary,
  deleteNode,
  insertSiblingAfter,
  insertSubtreeSibling,
  replaceSiblingRange,
  type Document,
  type TreeNode,
} from './document'

describe('derived attachment accounting', () => {
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
