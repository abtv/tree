import { expect, it } from 'vitest'
import { markedAndStarredNodes } from './starred-nodes'
import { RecentNodes } from './recent-nodes'
import type { Document, TreeNode } from '../domain/document'
import { toggleMarkNode, toggleStarNode } from '../domain/document'

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

  const results = markedAndStarredNodes(document)

  expect(results.map((item) => item.id)).toEqual(['a-child2', 'a-child', 'same-prefix', 'z-child'])
  expect(results[0]!.path).toBe(prefix)
  expect(markedAndStarredNodes(document)).toBe(results)
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

  expect(markedAndStarredNodes(changed).map((entry) => entry.id)).toEqual(['1', '2'])
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

  const visible = markedAndStarredNodes(source)
  const filtered = markedAndStarredNodes(source, true)

  expect(visible).toEqual([
    { id: 'active', text: 'Active', path: null, starred: true },
    { id: 'archive', text: 'Archived', path: null, starred: true, struckThrough: true },
    { id: 'empty', text: 'Empty node', path: null, starred: true },
    { id: 'report', text: 'Report', path: 'Workspace › Projects', parentId: 'projects', starred: true },
  ])
  expect(filtered.map(({ id }) => id)).toEqual(['active', 'empty', 'report'])
  expect(markedAndStarredNodes(source)).toBe(visible)
})

// @requirement PRODUCT.md §20.14
it('lists marked nodes before starred ones, each group by path, and a marked star once', () => {
  const document: Document = {
    roots: [
      node('star-a', 'Alpha', [], true),
      { ...node('mark-z', 'Zulu'), marked: true },
      node('plain', 'Plain', [{ ...node('both', 'Both', [], true), marked: true }]),
      { ...node('mark-b', 'Bravo'), marked: true },
      node('star-c', 'Charlie', [], true),
    ],
  }

  const results = markedAndStarredNodes(document)

  expect(results.map((item) => item.id)).toEqual(['mark-b', 'both', 'mark-z', 'star-a', 'star-c'])
  expect(results[1]).toEqual({
    id: 'both',
    text: 'Both',
    path: 'Plain',
    parentId: 'plain',
    starred: true,
    marked: true,
  })
})

// @requirement PRODUCT.md §20.14
it('omits marked nodes from the recent part and returns them when the mark is removed', () => {
  const document: Document = {
    roots: [{ ...node('0', 'Zero'), marked: true }, node('1', 'One'), node('2', 'Two')],
  }
  const recent = new RecentNodes()
  recent.load(['0', '1', '2'], document)

  expect(recent.getResults().map((entry) => entry.id)).toEqual(['1', '2'])
  const changed = toggleMarkNode(document, '0')
  recent.update(changed)

  expect(markedAndStarredNodes(changed)).toEqual([])
  expect(recent.getResults().map((entry) => entry.id)).toEqual(['0', '1', '2'])
})

// @requirement PRODUCT.md §2.5
it('filters completed marked nodes with finished tasks hidden', () => {
  const document: Document = {
    roots: [
      { ...node('done', 'Done'), marked: true, struckThrough: true },
      { ...node('open', 'Open'), marked: true },
    ],
  }

  expect(markedAndStarredNodes(document).map(({ id }) => id)).toEqual(['done', 'open'])
  expect(markedAndStarredNodes(document, true).map(({ id }) => id)).toEqual(['open'])
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
  markedAndStarredNodes({ roots: [unstarred, star] })
  childReads = 0

  const results = markedAndStarredNodes({ roots: [unstarred, { ...star, text: 'Edited' }] })

  expect(results).toEqual([{ id: 'star', text: 'Edited', path: null, starred: true }])
  expect(childReads).toBe(0)
})
