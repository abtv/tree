import { expect, it } from 'vitest'
import { markedAndStarredNodes } from './starred-nodes'
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

it('lists every starred node and reflects star removal', () => {
  const document: Document = {
    roots: Array.from({ length: 12 }, (_, i) => node(`${i}`, `${i}`, [], i < 10 ? true : undefined)),
  }

  expect(markedAndStarredNodes(document).map((entry) => entry.id)).toEqual([
    '0',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
  ])

  const changed = toggleStarNode(document, '0')

  expect(markedAndStarredNodes(changed).map((entry) => entry.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
})

it('lists completed stars and reuses the prepared list', () => {
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

  expect(visible).toEqual([
    { id: 'active', text: 'Active', path: null, starred: true },
    { id: 'archive', text: 'Archived', path: null, starred: true, struckThrough: true },
    { id: 'empty', text: 'Empty node', path: null, starred: true },
    { id: 'report', text: 'Report', path: 'Workspace › Projects', parentId: 'projects', starred: true },
  ])
  expect(markedAndStarredNodes(source)).toBe(visible)
})

// @requirement PRODUCT.md §20.14.5
it('lists marked stars, then marked nodes, then stars, each group by path, and each node once', () => {
  const document: Document = {
    roots: [
      node('star-a', 'Alpha', [], true),
      { ...node('mark-z', 'Zulu'), marked: true },
      node('plain', 'Plain', [{ ...node('both', 'Both', [], true), marked: true }]),
      { ...node('mark-b', 'Bravo'), marked: true },
      { ...node('both-a', 'Able', [], true), marked: true },
      node('star-c', 'Charlie', [], true),
    ],
  }

  const results = markedAndStarredNodes(document)

  expect(results.map((item) => item.id)).toEqual(['both-a', 'both', 'mark-b', 'mark-z', 'star-a', 'star-c'])
  expect(results[1]).toEqual({
    id: 'both',
    text: 'Both',
    path: 'Plain',
    parentId: 'plain',
    starred: true,
    marked: true,
  })
})

// @requirement PRODUCT.md §20.14.5
it('compares numbers in names by value, so version 0.9 precedes 0.11 and 0.14', () => {
  const marked = (id: string, text: string, children: TreeNode[] = []): TreeNode => ({
    ...node(id, text, children),
    marked: true,
  })
  const document: Document = {
    roots: [
      node('r14', 'Release 0.14', [marked('deps', 'Do we need all deps')]),
      node('r11', 'Release 0.11 - improved agentic flow', [marked('copy', '1 - Copy text and images')]),
      marked('r9', 'Release 0.9 - perfect global search'),
      marked('item10', 'Item 10'),
      marked('item2', 'Item 2'),
    ],
  }

  expect(markedAndStarredNodes(document).map((item) => item.id)).toEqual(['item2', 'item10', 'r9', 'copy', 'deps'])
})

// @requirement PRODUCT.md §20.14.5
it('compares paths one ancestor at a time, keeping children next to their parent', () => {
  const marked = (id: string, text: string, children: TreeNode[] = []): TreeNode => ({
    ...node(id, text, children),
    marked: true,
  })
  const document: Document = {
    roots: [
      marked('trash', 'Release 0.11 - Trash feature'),
      node('release', 'Release 0.11', [marked('child', 'Alpha child')]),
      marked('plain-release', 'Release 0.11'),
    ],
  }

  expect(markedAndStarredNodes(document).map((item) => item.id)).toEqual(['plain-release', 'child', 'trash'])
})

// @requirement PRODUCT.md §20.14.5
it('omits unmarked, unstarred nodes and drops a node when its mark is removed', () => {
  const document: Document = {
    roots: [{ ...node('0', 'Zero'), marked: true }, node('1', 'One'), node('2', 'Two')],
  }

  expect(markedAndStarredNodes(document).map((entry) => entry.id)).toEqual(['0'])

  const changed = toggleMarkNode(document, '0')

  expect(markedAndStarredNodes(changed)).toEqual([])
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
