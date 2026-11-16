import { expect, it } from 'vitest'
import { starredNodes } from './starred-nodes'
import { RecentNodes } from './recent-nodes'
import type { Document, TreeNode } from '../domain/document'
import { toggleStarNode } from '../domain/document'

const node = (id: string, text: string, children: TreeNode[] = [], starred?: true): TreeNode => ({
  id,
  text,
  children,
  ...(starred ? { starred } : {}),
})

it('sorts by the complete path including text beyond the displayed ancestor preview', () => {
  const prefix = 'a'.repeat(160)
  const document = {
    roots: [
      node('z', `${prefix}z`, [node('z-child', 'Alpha', [], true)]),
      node('a', `${prefix}a`, [node('a-child', 'Zulu', [], true), node('a-child2', 'Beta', [], true)]),
    ],
  }

  const results = starredNodes(document)

  expect(results.map((item) => item.id)).toEqual(['a-child2', 'a-child', 'z-child'])
  expect(results[0]!.path).toBe(prefix)
  expect(starredNodes(document)).toBe(results)
})

it('retains eight other recent nodes and reflects star removal', () => {
  const document: Document = {
    roots: Array.from({ length: 12 }, (_, i) => node(`${i}`, `${i}`, [], i < 3 ? true : undefined)),
  }
  const recent = new RecentNodes()
  recent.load(
    document.roots.map((entry) => entry.id),
    document,
  )

  expect(recent.getResults().map((entry) => entry.id)).toEqual(['3', '4', '5', '6', '7', '8', '9', '10'])
  const changed = toggleStarNode(document, '0')
  recent.update(changed)

  expect(starredNodes(changed).map((entry) => entry.id)).toEqual(['1', '2'])
  expect(recent.getResults()[0]!.id).toBe('0')
})
