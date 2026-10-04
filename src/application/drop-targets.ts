import type { VisibleRow } from './visible-rows'
import { locateNode, type Document } from '../domain/document'

/** The dragged node's own row plus every visible descendant row, as `[start, end)` in the row list. */
export interface DragBlock {
  readonly start: number
  readonly end: number
}

/** Where a dropped node goes: under `parentId` (`null` for the document root) at a post-removal `index`. */
export interface DropTarget {
  readonly parentId: string | null
  readonly index: number
}

/** Breadcrumb ancestors append the source; the current parent is never a destination. */
export function breadcrumbDropTargets(
  document: Document,
  currentParentId: string | null,
): ReadonlyMap<string | null, DropTarget> {
  if (currentParentId === null) return new Map()
  const current = locateNode(document, currentParentId)
  if (current === undefined) return new Map()
  return new Map([
    [null, { parentId: null, index: document.roots.length }],
    ...current.ancestors.map((node): [string, DropTarget] => [
      node.id,
      { parentId: node.id, index: node.children.length },
    ]),
  ])
}

/** The inclusive range of row depths a gap offers; depth 0 is the displayed location's top level. */
export interface GapLevels {
  readonly min: number
  readonly max: number
}

const rowIndexCache = new WeakMap<readonly VisibleRow[], ReadonlyMap<string, number>>()

function rowIndexById(rows: readonly VisibleRow[]): ReadonlyMap<string, number> {
  const cached = rowIndexCache.get(rows)
  if (cached !== undefined) return cached
  const index = new Map<string, number>()
  for (const [position, row] of rows.entries()) index.set(row.node.id, position)
  rowIndexCache.set(rows, index)
  return index
}

/**
 * The block of rows that moves with `nodeId`. A collapsed subtree occupies only its own row, so a
 * block holds exactly what the user sees move with the pointer. `undefined` when the node has no row.
 */
export function dragBlock(rows: readonly VisibleRow[], nodeId: string): DragBlock | undefined {
  const start = rowIndexById(rows).get(nodeId)
  if (start === undefined) return undefined
  const depth = rows[start]!.depth
  let end = start + 1
  while (end < rows.length && rows[end]!.depth > depth) end += 1
  return { start, end }
}

/** The row at `position` of the list without the dragged block. */
function reducedRow(rows: readonly VisibleRow[], block: DragBlock, position: number): VisibleRow | undefined {
  return rows[position < block.start ? position : position + block.end - block.start]
}

/**
 * A gap is the position before `rows[gap]`, so `rows.length` is the gap after the last row. Returns
 * the same gap counted in the list without the dragged block, or `undefined` for a position inside
 * the block. The two gaps next to the block map to one position, because they are one place once the
 * block is lifted out.
 */
function reducedGap(rows: readonly VisibleRow[], block: DragBlock, gap: number): number | undefined {
  if (!Number.isInteger(gap) || gap < 0 || gap > rows.length) return undefined
  if (gap <= block.start) return gap
  if (gap >= block.end) return gap - (block.end - block.start)
  return undefined
}

/**
 * The levels at which the dragged block can be dropped into `gap`. They are computed against the list
 * without the block: no shallower than the row below, which would otherwise become a child of the
 * dropped node, and no deeper than one below the row above. `undefined` when the gap lies inside the
 * block.
 */
export function gapLevels(rows: readonly VisibleRow[], block: DragBlock, gap: number): GapLevels | undefined {
  const position = reducedGap(rows, block, gap)
  if (position === undefined) return undefined
  const above = reducedRow(rows, block, position - 1)
  const below = reducedRow(rows, block, position)
  return { min: below?.depth ?? 0, max: above === undefined ? 0 : above.depth + 1 }
}

/**
 * The drop target for `gap` at `level`, or `undefined` when the gap lies inside the block or the level
 * is outside what `gapLevels` offers. The parent is the row above, or its ancestor at `level - 1`;
 * the node lands before the row below when that row is a sibling at `level`, and otherwise after
 * every child of the parent, which for a collapsed or empty parent means as its last child.
 */
export function dropTargetAtGap(
  rows: readonly VisibleRow[],
  block: DragBlock,
  gap: number,
  level: number,
): DropTarget | undefined {
  const levels = gapLevels(rows, block, gap)
  if (levels === undefined || !Number.isInteger(level) || level < levels.min || level > levels.max) return undefined
  const position = reducedGap(rows, block, gap)!
  const below = reducedRow(rows, block, position)
  const dragged = rows[block.start]!

  let parent: VisibleRow | undefined
  if (level > 0) {
    // level > 0 implies a row above, because max is 0 without one.
    parent = reducedRow(rows, block, position - 1)!
    const index = rowIndexById(rows)
    while (parent.depth > level - 1) parent = rows[index.get(parent.parentId!)!]!
  }
  const parentId = parent === undefined ? rows[0]!.parentId : parent.node.id
  // Rows only carry a parent id from the same list, except at the top level, so equality is exact.
  const draggedIsChild = dragged.parentId === parentId
  if (below !== undefined && below.depth === level) {
    const removedBefore = draggedIsChild && dragged.siblingIndex < below.siblingIndex ? 1 : 0
    return { parentId, index: below.siblingIndex - removedBefore }
  }
  const childCount = parent === undefined ? rows[0]!.siblingCount : parent.node.children.length
  return { parentId, index: childCount - (draggedIsChild ? 1 : 0) }
}

/**
 * The drop target for a drop on the node in `rows[row]`: its last child. `undefined` for the dragged
 * row, its visible descendants, and a position outside the list.
 */
export function dropTargetOnRow(rows: readonly VisibleRow[], block: DragBlock, row: number): DropTarget | undefined {
  if (!Number.isInteger(row) || row < 0 || row >= rows.length) return undefined
  if (row >= block.start && row < block.end) return undefined
  const target = rows[row]!
  const dragged = rows[block.start]!
  return {
    parentId: target.node.id,
    index: target.node.children.length - (dragged.parentId === target.node.id ? 1 : 0),
  }
}

/** Whether dropping at `target` leaves the dragged node where it already is. */
export function isNoOpDrop(rows: readonly VisibleRow[], block: DragBlock, target: DropTarget): boolean {
  const dragged = rows[block.start]!
  return target.parentId === dragged.parentId && target.index === dragged.siblingIndex
}
