import { expect, it } from 'vitest'
import { countDocumentNodes } from './node-count'
import type { Document, TreeNode } from '../domain/document'

const node = (id: string, children: TreeNode[] = []): TreeNode => ({ id, text: id, children })

it('counts no nodes in an empty document', () => {
  expect(countDocumentNodes({ roots: [] })).toBe(0)
})

it('counts every node at every depth, including roots and leaves', () => {
  const document: Document = {
    roots: [node('a', [node('a1', [node('a1x'), node('a1y')]), node('a2')]), node('b')],
  }

  expect(countDocumentNodes(document)).toBe(6)
})

it('counts a new document that shares an unchanged branch with an earlier one', () => {
  const shared = node('shared', [node('child')])
  const before: Document = { roots: [shared, node('removed', [node('removed-child')])] }
  expect(countDocumentNodes(before)).toBe(4)

  const after: Document = { roots: [node('added', [node('added-1'), node('added-2')]), shared] }

  expect(countDocumentNodes(after)).toBe(5)
  expect(countDocumentNodes(before)).toBe(4)
})

it('reuses the counts of a document and of unchanged branches', () => {
  let reads = 0
  const childList = [node('leaf')]
  const unchanged: TreeNode = {
    id: 'unchanged',
    text: 'unchanged',
    get children() {
      reads++
      return childList
    },
  }
  const document: Document = { roots: [unchanged] }
  expect(countDocumentNodes(document)).toBe(2)
  reads = 0

  expect(countDocumentNodes(document)).toBe(2)
  expect(countDocumentNodes({ roots: [unchanged, node('added')] })).toBe(3)

  expect(reads).toBe(0)
})
