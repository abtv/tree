import { expect, it } from 'vitest'
import { searchScope } from './search-scope'
import type { DayNumber } from './calendar-date'
import type { TreeNode } from './document-types'

const document = {
  roots: [
    { id: 'a', text: 'heading', children: [{ id: 'b', text: 'child', children: [] }] },
    { id: 'c', text: 'sibling', children: [] },
  ],
}

it('includes current parent first and all descendants without folds or siblings', () => {
  expect([...searchScope(document, { kind: 'tree', parentId: 'a' })]).toEqual([
    { nodeId: 'a', text: 'heading' },
    { nodeId: 'b', text: 'child' },
  ])
  expect([...searchScope(document, { kind: 'tree', parentId: 'missing' })].filter(Boolean)).toEqual([])
})

it('keeps a work checkpoint for each pruned completed branch in scoped Find', () => {
  const archive: TreeNode = {
    id: 'archive',
    text: 'Archive',
    struckThrough: true,
    children: [{ id: 'archived', text: 'Archived task', struckThrough: true, children: [] }],
  }
  const folder: TreeNode = {
    id: 'folder',
    text: 'Folder',
    children: [
      { id: 'finished', text: 'Finished task', struckThrough: true, children: [] },
      { id: 'open', text: 'Open task', children: [] },
    ],
  }
  const source = { roots: [archive, folder] }

  const visible = [...searchScope(source, { kind: 'tree', parentId: 'archive' })]
  const filtered = [...searchScope(source, { kind: 'tree', parentId: 'folder', hideFinishedTasks: true })]

  expect(visible).toEqual([
    { nodeId: 'archive', text: 'Archive' },
    { nodeId: 'archived', text: 'Archived task' },
  ])
  expect(filtered).toEqual([
    undefined,
    { nodeId: 'folder', text: 'Folder' },
    undefined,
    { nodeId: 'open', text: 'Open task' },
  ])
})

it('includes contextual and repeated Agenda occurrences, filtering focused days', () => {
  const projection = [1, 2].map((day) => ({
    day: day as DayNumber,
    rows: [
      { nodeId: 'a', depth: 0, role: 'context' as const },
      { nodeId: 'b', depth: 1, role: 'match' as const },
      { nodeId: 'missing', depth: 0, role: 'match' as const },
    ],
  }))
  const all = [...searchScope(document, { kind: 'agenda', projection })].filter((row) => row !== undefined)

  expect(all.map(({ nodeId, day }) => [nodeId, day])).toEqual([
    ['a', 1],
    ['b', 1],
    ['a', 2],
    ['b', 2],
  ])
  expect(
    [...searchScope(document, { kind: 'agenda', projection, focusedDay: 2 as DayNumber })].filter(Boolean),
  ).toEqual(all.slice(2))
})
