import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../domain/document'
import { buildVisibleRows } from '../application/visible-rows'
import { nearestSiblingBoundary, siblingBoundaryIndices, type VisibleRow } from './visible-tree'

function node(id: string, children: TreeNode[] = []): TreeNode {
  return { id, text: id, children }
}

describe('buildVisibleRows', () => {
  it('produces one row per sibling when nothing is expanded', () => {
    const nodes = [node('a'), node('b', [node('b1')]), node('c')]
    const rows = buildVisibleRows(nodes, () => false)
    expect(rows.map((row) => row.node.id)).toEqual(['a', 'b', 'c'])
    expect(rows.every((row) => row.depth === 0)).toBe(true)
    expect(rows.every((row) => row.parentId === null)).toBe(true)
  })

  it('inserts an expanded node’s children immediately beneath it, in preorder', () => {
    const nodes = [node('a'), node('b', [node('b1'), node('b2')]), node('c')]
    const rows = buildVisibleRows(nodes, (id) => id === 'b')
    expect(rows.map((row) => row.node.id)).toEqual(['a', 'b', 'b1', 'b2', 'c'])
    const b1 = rows.find((row) => row.node.id === 'b1')!
    expect(b1.depth).toBe(1)
    expect(b1.parentId).toBe('b')
    expect(b1.siblingIndex).toBe(0)
    expect(b1.siblingCount).toBe(2)
  })

  it('expands nested descendants when their own ancestor chain is fully expanded', () => {
    const nodes = [node('a', [node('a1', [node('a1a')])])]
    const rows = buildVisibleRows(nodes, () => true)
    expect(rows.map((row) => row.node.id)).toEqual(['a', 'a1', 'a1a'])
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2])
  })

  it('does not descend into a collapsed node’s children, regardless of their own expansion state', () => {
    const nodes = [node('a', [node('a1', [node('a1a')])])]
    // a1 and a1a report themselves expanded, but a (their ancestor) does not, so neither is visible.
    const rows = buildVisibleRows(nodes, (id) => id === 'a1' || id === 'a1a')
    expect(rows.map((row) => row.node.id)).toEqual(['a'])
  })

  it('gives every node the same actual-sibling context regardless of expansion elsewhere', () => {
    const target = node('target')
    const nodes = [node('a', [node('a1'), target]), node('b')]
    const collapsedRows = buildVisibleRows(nodes, () => false)
    const expandedRows = buildVisibleRows(nodes, () => true)
    expect(collapsedRows.find((row) => row.node.id === 'a')?.siblingIndex).toBe(0)
    const targetRow = expandedRows.find((row) => row.node.id === 'target')!
    expect(targetRow.parentId).toBe('a')
    expect(targetRow.siblingIndex).toBe(1)
    expect(targetRow.siblingCount).toBe(2)
  })

  it('returns no rows for an empty sibling list', () => {
    expect(buildVisibleRows([], () => true)).toEqual([])
  })
})

describe('siblingBoundaryIndices', () => {
  it('offers a boundary only before or after each real child’s whole visible block, never inside it', () => {
    // A > A1 > A1a, A2 > A2a, then B as A's next real sibling.
    const nodes = [node('a', [node('a1', [node('a1a')]), node('a2', [node('a2a')])]), node('b')]
    const rows = buildVisibleRows(nodes, () => true)
    expect(rows.map((row) => row.node.id)).toEqual(['a', 'a1', 'a1a', 'a2', 'a2a', 'b'])
    expect(siblingBoundaryIndices(rows, 'a')).toEqual([1, 3, 5])
    expect(siblingBoundaryIndices(rows, null)).toEqual([0, 5, 6])
  })

  it('offers exactly two boundaries around an only child’s whole block', () => {
    const nodes = [node('a', [node('a1', [node('a1a')])])]
    const rows = buildVisibleRows(nodes, () => true)
    expect(siblingBoundaryIndices(rows, 'a')).toEqual([1, 3])
    expect(siblingBoundaryIndices(rows, null)).toEqual([0, 3])
  })

  it('matches the flat sibling case when nothing is expanded', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const rows = buildVisibleRows(nodes, () => false)
    expect(siblingBoundaryIndices(rows, null)).toEqual([0, 1, 2, 3])
  })

  it('returns no boundaries for a parent with no rendered children', () => {
    const rows: VisibleRow[] = [{ node: node('a'), depth: 0, parentId: null, siblingIndex: 0, siblingCount: 1 }]
    expect(siblingBoundaryIndices(rows, 'a')).toEqual([])
  })
})

describe('nearestSiblingBoundary', () => {
  it('snaps to the closest boundary, favoring the earlier one on a tie', () => {
    expect(nearestSiblingBoundary([1, 3, 5], 2)).toBe(1)
    expect(nearestSiblingBoundary([1, 3, 5], 4)).toBe(3)
    expect(nearestSiblingBoundary([1, 3, 5], 0)).toBe(1)
    expect(nearestSiblingBoundary([1, 3, 5], 10)).toBe(5)
    expect(nearestSiblingBoundary([1, 3, 5], 3)).toBe(3)
  })

  it('returns undefined for no boundaries', () => {
    expect(nearestSiblingBoundary([], 2)).toBeUndefined()
  })
})
