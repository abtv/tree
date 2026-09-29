import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../domain/document'
import { buildVisibleRows } from './visible-rows'

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
})
