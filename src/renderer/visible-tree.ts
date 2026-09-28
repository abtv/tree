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
