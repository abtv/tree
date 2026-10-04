import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../domain/document'
import {
  breadcrumbDropTargets,
  dragBlock,
  dropTargetAtGap,
  dropTargetOnRow,
  gapLevels,
  isNoOpDrop,
  type DragBlock,
  type DropTarget,
} from './drop-targets'
import { buildVisibleRows, type VisibleRow } from './visible-rows'

function node(id: string, children: TreeNode[] = []): TreeNode {
  return { id, text: id, children }
}

// Rows with a and c expanded and a2 collapsed (its children a2x and a2y are hidden):
//   0 a   1 a1   2 a2   3 b   4 c   5 c1   6 d
const roots = [
  node('a', [node('a1'), node('a2', [node('a2x'), node('a2y')])]),
  node('b'),
  node('c', [node('c1')]),
  node('d'),
]
const rows = buildVisibleRows(roots, (id) => id === 'a' || id === 'c')

describe('breadcrumbDropTargets', () => {
  it('offers root and ancestors as last-child destinations, excluding the current parent', () => {
    expect([...breadcrumbDropTargets({ roots }, 'a2').entries()]).toEqual([
      [null, target(null, roots.length)],
      ['a', target('a', 2)],
    ])
    expect(breadcrumbDropTargets({ roots }, 'a').has('a')).toBe(false)
    expect(breadcrumbDropTargets({ roots }, null).size).toBe(0)
    expect(breadcrumbDropTargets({ roots }, 'missing').size).toBe(0)
  })
})

function blockOf(source: readonly VisibleRow[], id: string): DragBlock {
  const block = dragBlock(source, id)
  if (block === undefined) throw new Error(`no row for ${id}`)
  return block
}

function target(parentId: string | null, index: number): DropTarget {
  return { parentId, index }
}

describe('dragBlock', () => {
  it('covers the row and its visible descendants only', () => {
    expect(dragBlock(rows, 'a')).toEqual({ start: 0, end: 3 })
    expect(dragBlock(rows, 'c')).toEqual({ start: 4, end: 6 })
    expect(dragBlock(rows, 'a2')).toEqual({ start: 2, end: 3 })
    expect(dragBlock(rows, 'd')).toEqual({ start: 6, end: 7 })
  })

  it('has no block for a node without a row', () => {
    expect(dragBlock(rows, 'a2x')).toBeUndefined()
    expect(dragBlock([], 'a')).toBeUndefined()
  })
})

describe('gapLevels', () => {
  const b = blockOf(rows, 'b')

  it('offers every level from the row below up to one below the row above', () => {
    expect(gapLevels(rows, b, 3)).toEqual({ min: 0, max: 2 })
    expect(gapLevels(rows, b, 4)).toEqual({ min: 0, max: 2 })
    expect(gapLevels(rows, b, 7)).toEqual({ min: 0, max: 1 })
  })

  it('offers a single level at the top and between an expanded node and its first child', () => {
    expect(gapLevels(rows, b, 0)).toEqual({ min: 0, max: 0 })
    expect(gapLevels(rows, b, 1)).toEqual({ min: 1, max: 1 })
  })

  it('treats the two gaps beside the block as one place', () => {
    expect(gapLevels(rows, blockOf(rows, 'a'), 0)).toEqual(gapLevels(rows, blockOf(rows, 'a'), 3))
    expect(gapLevels(rows, blockOf(rows, 'c'), 4)).toEqual(gapLevels(rows, blockOf(rows, 'c'), 6))
  })

  it('has no levels inside the dragged block or outside the list', () => {
    const a = blockOf(rows, 'a')
    expect(gapLevels(rows, a, 1)).toBeUndefined()
    expect(gapLevels(rows, a, 2)).toBeUndefined()
    expect(gapLevels(rows, b, -1)).toBeUndefined()
    expect(gapLevels(rows, b, 8)).toBeUndefined()
    expect(gapLevels(rows, b, 1.5)).toBeUndefined()
  })

  it('computes against the list without the block', () => {
    // Without c and c1 the rows end at b, so the gap after the block is the end of the list.
    expect(gapLevels(rows, blockOf(rows, 'c'), 6)).toEqual({ min: 0, max: 1 })
    // Without b, a2 sits directly above c.
    expect(gapLevels(rows, b, 4)).toEqual({ min: 0, max: 2 })
  })
})

describe('dropTargetAtGap', () => {
  const b = blockOf(rows, 'b')

  it('nests under a collapsed node above as its last child, hidden children included', () => {
    expect(dropTargetAtGap(rows, b, 3, 2)).toEqual(target('a2', 2))
  })

  it('outdents through an expanded branch, picking the ancestor at the chosen level', () => {
    expect(dropTargetAtGap(rows, b, 3, 1)).toEqual(target('a', 2))
    expect(dropTargetAtGap(rows, b, 3, 0)).toEqual(target(null, 1))
  })

  it('puts the node first when the only level is between an expanded node and its first child', () => {
    expect(dropTargetAtGap(rows, b, 1, 1)).toEqual(target('a', 0))
  })

  it('nests under a leaf and at the end of the list', () => {
    expect(dropTargetAtGap(rows, b, 7, 1)).toEqual(target('d', 0))
    expect(dropTargetAtGap(rows, b, 7, 0)).toEqual(target(null, 3))
  })

  it('counts the destination index without the dragged node', () => {
    const c1 = blockOf(rows, 'c1')
    expect(dropTargetAtGap(rows, c1, 5, 1)).toEqual(target('c', 0))
    expect(dropTargetAtGap(rows, c1, 5, 0)).toEqual(target(null, 3))
    const d = blockOf(rows, 'd')
    expect(dropTargetAtGap(rows, d, 4, 0)).toEqual(target(null, 2))
  })

  it('rejects a gap inside the block and a level the gap does not offer', () => {
    expect(dropTargetAtGap(rows, blockOf(rows, 'a'), 1, 0)).toBeUndefined()
    expect(dropTargetAtGap(rows, b, 3, 3)).toBeUndefined()
    expect(dropTargetAtGap(rows, b, 3, -1)).toBeUndefined()
    expect(dropTargetAtGap(rows, b, 3, 1.5)).toBeUndefined()
    expect(dropTargetAtGap(rows, b, 0, 1)).toBeUndefined()
    expect(dropTargetAtGap(rows, b, 1, 0)).toBeUndefined()
  })

  it('uses the displayed parent as the parent of top-level targets', () => {
    const inside = buildVisibleRows([node('x'), node('y')], () => false, 'location')
    expect(dropTargetAtGap(inside, blockOf(inside, 'y'), 0, 0)).toEqual(target('location', 0))
    expect(dropTargetAtGap(inside, blockOf(inside, 'x'), 2, 0)).toEqual(target('location', 1))
  })

  it('resolves the only gap of a single-row list', () => {
    const single = buildVisibleRows([node('only')], () => false)
    const block = blockOf(single, 'only')
    expect(dropTargetAtGap(single, block, 0, 0)).toEqual(target(null, 0))
    expect(dropTargetAtGap(single, block, 1, 0)).toEqual(target(null, 0))
    expect(dropTargetAtGap(single, block, 0, 1)).toBeUndefined()
  })
})

describe('dropTargetOnRow', () => {
  it('appends as the last child, including to a collapsed node and a leaf', () => {
    const b = blockOf(rows, 'b')
    expect(dropTargetOnRow(rows, b, 2)).toEqual(target('a2', 2))
    expect(dropTargetOnRow(rows, b, 6)).toEqual(target('d', 0))
    expect(dropTargetOnRow(rows, b, 4)).toEqual(target('c', 1))
  })

  it('does not count the dragged node among the children of its own parent', () => {
    expect(dropTargetOnRow(rows, blockOf(rows, 'c1'), 4)).toEqual(target('c', 0))
  })

  it('rejects the dragged row, its visible descendants, and positions outside the list', () => {
    const a = blockOf(rows, 'a')
    for (const row of [0, 1, 2]) expect(dropTargetOnRow(rows, a, row)).toBeUndefined()
    expect(dropTargetOnRow(rows, a, 3)).toEqual(target('b', 0))
    expect(dropTargetOnRow(rows, a, -1)).toBeUndefined()
    expect(dropTargetOnRow(rows, a, 7)).toBeUndefined()
    expect(dropTargetOnRow(rows, a, 0.5)).toBeUndefined()
  })
})

describe('isNoOpDrop', () => {
  it('is true for the current parent and position, however the target was chosen', () => {
    const b = blockOf(rows, 'b')
    expect(isNoOpDrop(rows, b, dropTargetAtGap(rows, b, 3, 0)!)).toBe(true)
    expect(isNoOpDrop(rows, b, dropTargetAtGap(rows, b, 4, 0)!)).toBe(true)
    const c1 = blockOf(rows, 'c1')
    expect(isNoOpDrop(rows, c1, dropTargetOnRow(rows, c1, 4)!)).toBe(true)
  })

  it('is false when the parent or the position differs', () => {
    const b = blockOf(rows, 'b')
    expect(isNoOpDrop(rows, b, target(null, 0))).toBe(false)
    expect(isNoOpDrop(rows, b, target('a', 1))).toBe(false)
  })
})
