import type { TreeNode } from '../domain/document'

export interface VisibleRow {
  readonly node: TreeNode
  readonly depth: number
  readonly parentId: string | null
  readonly siblingIndex: number
  readonly siblingCount: number
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
