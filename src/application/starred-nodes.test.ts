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
      node('same-prefix', `${prefix}aa`, [], true),
      node('a', `${prefix}a`, [node('a-child', 'Zulu', [], true), node('a-child2', 'Beta', [], true)]),
    ],
  }

  const results = starredNodes(document)

  expect(results.map((item) => item.id)).toEqual(['a-child2', 'a-child', 'same-prefix', 'z-child'])
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

it('filters completed stars while preserving the prepared list and complete parent paths', () => {
  const source: Document = {
    roots: [
      { ...node('archive', 'Archived', [], true), struckThrough: true },
      node('empty', '', [], true),
      node('workspace', 'Workspace', [
        node('projects', 'Projects', [node('draft', 'Draft'), node('report', 'Report', [], true)]),
      ]),
      node('active', 'Active', [], true),
    ],
  }

  const visible = starredNodes(source)
  const filtered = starredNodes(source, true)

  expect(visible).toEqual([
    { id: 'active', text: 'Active', path: null, starred: true },
    { id: 'archive', text: 'Archived', path: null, starred: true, struckThrough: true },
    { id: 'empty', text: 'Empty node', path: null, starred: true },
    { id: 'report', text: 'Report', path: 'Workspace › Projects', parentId: 'projects', starred: true },
  ])
  expect(filtered.map(({ id }) => id)).toEqual(['active', 'empty', 'report'])
  expect(starredNodes(source)).toBe(visible)
})

it('reuses a star-free subtree summary across immutable document changes', () => {
  let childReads = 0
  const children = [node('plain-child', 'Unstarred child')]
  const unstarred: TreeNode = {
    id: 'plain',
    text: 'Plain',
    get children() {
      childReads += 1
      return children
    },
  }
  const star = node('star', 'Original', [], true)
  starredNodes({ roots: [unstarred, star] })
  childReads = 0

  const results = starredNodes({ roots: [unstarred, { ...star, text: 'Edited' }] })

  expect(results).toEqual([{ id: 'star', text: 'Edited', path: null, starred: true }])
  expect(childReads).toBe(0)
})
