import type { TreeNode } from '../domain/document'

export interface VisibleRow {
  readonly node: TreeNode
  readonly depth: number
  readonly parentId: string | null
  readonly siblingIndex: number
  readonly siblingCount: number
}

/** Inclusive visible range of selected sibling subtrees, including the final root's descendants. */
export function selectedSubtreeRowRange(
  rows: readonly VisibleRow[],
  selection: { anchorId: string; focusId: string } | undefined,
): { start: number; end: number } | undefined {
  if (selection === undefined) return undefined
  const anchor = rows.findIndex((row) => row.node.id === selection.anchorId)
  const focus = rows.findIndex((row) => row.node.id === selection.focusId)
  if (anchor < 0 || focus < 0 || rows[anchor]!.parentId !== rows[focus]!.parentId) return undefined
  const start = Math.min(anchor, focus)
  let end = Math.max(anchor, focus)
  const depth = rows[end]!.depth
  while (end + 1 < rows.length && rows[end + 1]!.depth > depth) end += 1
  return { start, end }
}

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
    if (node.children.length > 0 && isExpanded(node.id))
      rows.push(...buildVisibleRows(node.children, isExpanded, node.id, depth + 1))
  }
  return rows
}
