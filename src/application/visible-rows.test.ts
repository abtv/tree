import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../domain/document'
import { buildVisibleRows, selectedSubtreeRowRange } from './visible-rows'

function node(id: string, children: TreeNode[] = []): TreeNode {
  return { id, text: id, children }
}

describe('buildVisibleRows', () => {
  it('flattens expanded descendants in preorder with actual sibling context', () => {
    const nodes = [node('a'), node('b', [node('b1'), node('b2')]), node('c')]

    const rows = buildVisibleRows(nodes, (id) => id === 'b')

    expect(rows.map((row) => row.node.id)).toEqual(['a', 'b', 'b1', 'b2', 'c'])
    expect(rows.find((row) => row.node.id === 'b1')).toMatchObject({
      depth: 1,
      parentId: 'b',
      siblingIndex: 0,
      siblingCount: 2,
    })
  })

  it('does not descend through a collapsed ancestor or an empty list', () => {
    const nodes = [node('a', [node('a1', [node('a1a')])])]

    expect(buildVisibleRows(nodes, (id) => id === 'a1')).toHaveLength(1)
    expect(buildVisibleRows([], () => true)).toEqual([])
  })

  it('shows completed branches by default and preserves physical sibling positions when hiding them', () => {
    const completed = (id: string): TreeNode => ({ ...node(id), struckThrough: true })
    const nodes = [
      { ...node('archived', [completed('archived-child')]), struckThrough: true as const },
      node('project', [completed('finished'), node('open')]),
    ]

    const visible = buildVisibleRows(nodes, () => true)
    const filtered = buildVisibleRows(nodes, () => true, null, 0, true)

    expect(visible.map(({ node }) => node.id)).toEqual(['archived', 'archived-child', 'project', 'finished', 'open'])
    expect(filtered.map(({ node, ...position }) => ({ id: node.id, ...position }))).toEqual([
      { id: 'project', depth: 0, parentId: null, siblingIndex: 1, siblingCount: 2 },
      { id: 'open', depth: 1, parentId: 'project', siblingIndex: 1, siblingCount: 2 },
    ])
  })

  it('does not ask whether a leaf is expanded', () => {
    const asked: string[] = []

    buildVisibleRows([node('leaf'), node('parent', [node('child')])], (id) => {
      asked.push(id)
      return false
    })

    expect(asked).toEqual(['parent'])
  })
})

// @requirement PRODUCT.md §20.2.23
describe('selected subtree row range', () => {
  const nodes = [node('a', [node('a1'), node('a2')]), node('b', [node('b1', [node('last')])]), node('outside')]
  const rows = buildVisibleRows(nodes, () => true)

  it('includes a single branch and stops before its unselected sibling', () => {
    expect(selectedSubtreeRowRange(rows, { anchorId: 'b', focusId: 'b' })).toEqual({ start: 3, end: 5 })
  })

  it('selects nested siblings without including their parent', () => {
    expect(selectedSubtreeRowRange(rows, { anchorId: 'a2', focusId: 'a1' })).toEqual({ start: 1, end: 2 })
  })

  it('keeps collapsed descendants collapsed', () => {
    expect(
      selectedSubtreeRowRange(
        buildVisibleRows(nodes, () => false),
        { anchorId: 'a', focusId: 'b' },
      ),
    ).toEqual({ start: 0, end: 1 })
  })

  it('rejects missing or mixed-parent endpoints without inventing a range', () => {
    expect(selectedSubtreeRowRange(rows, undefined)).toBeUndefined()
    expect(selectedSubtreeRowRange(rows, { anchorId: 'missing', focusId: 'b' })).toBeUndefined()
    expect(selectedSubtreeRowRange(rows, { anchorId: 'a', focusId: 'missing' })).toBeUndefined()
    expect(selectedSubtreeRowRange(rows, { anchorId: 'a1', focusId: 'b1' })).toBeUndefined()
  })
})
