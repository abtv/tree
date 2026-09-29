import type { VisibleRow } from '../application/visible-rows'
export type { VisibleRow } from '../application/visible-rows'

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
