import type { TreeNode } from '../domain/document'

/** One flattened row: a node plus its actual (not flattened) parent and sibling context. */
export interface VisibleRow {
  readonly node: TreeNode
  readonly depth: number
  readonly parentId: string | null
  readonly siblingIndex: number
  readonly siblingCount: number
}

/**
 * Flattens `nodes` and the descendants of every expanded node into preorder rows. A node's children
 * are only visited when `isExpanded` reports it expanded, so a collapsed subtree costs one row
 * regardless of its own size and contributes no traversal beyond that row.
 */
export function buildVisibleRows(
  nodes: readonly TreeNode[],
  isExpanded: (nodeId: string) => boolean,
  parentId: string | null = null,
  depth = 0,
): VisibleRow[] {
  const rows: VisibleRow[] = []
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!
    rows.push({ node, depth, parentId, siblingIndex: index, siblingCount: nodes.length })
    if (node.children.length > 0 && isExpanded(node.id)) {
      rows.push(...buildVisibleRows(node.children, isExpanded, node.id, depth + 1))
    }
  }
  return rows
}

/**
 * Valid drop-boundary positions, in flattened `rows` index space, for reordering among `parentId`'s
 * actual children. A collapsed subtree still occupies a contiguous block of rows (its own row plus
 * every visible descendant row, in preorder), so each child's block is skipped as a whole rather than
 * walked row by row; a drop is only ever offered before a child's own row or after its entire visible
 * block, never inside it (`docs/PRODUCT.md` §2.4: "An expanded view provides no cross-level drop
 * target"). Returns `childCount + 1` boundaries: one before each real child, plus one after the last.
 */
export function siblingBoundaryIndices(rows: readonly VisibleRow[], parentId: string | null): number[] {
  const boundaries: number[] = []
  let index = 0
  let lastBlockEnd = -1
  while (index < rows.length) {
    const row = rows[index]!
    if (row.parentId !== parentId) {
      index += 1
      continue
    }
    boundaries.push(index)
    const childDepth = row.depth
    index += 1
    while (index < rows.length && rows[index]!.depth > childDepth) index += 1
    lastBlockEnd = index
  }
  if (lastBlockEnd >= 0) boundaries.push(lastBlockEnd)
  return boundaries
}

/** Snaps a raw flattened drop position to the nearest valid boundary in `boundaries`. */
export function nearestSiblingBoundary(boundaries: readonly number[], rawIndex: number): number | undefined {
  return boundaries.reduce<number | undefined>((closest, candidate) => {
    if (closest === undefined) return candidate
    return Math.abs(candidate - rawIndex) < Math.abs(closest - rawIndex) ? candidate : closest
  }, undefined)
}
