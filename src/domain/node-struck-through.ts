import type { TreeNode } from './document-types'

/** Each node owns its state; returns the node unchanged when it already has `struckThrough`. */
export function withStruckThrough(node: TreeNode, struckThrough: boolean): TreeNode {
  if ((node.struckThrough === true) === struckThrough) return node
  if (struckThrough) return { ...node, struckThrough: true }
  const normal = { ...node }
  delete normal.struckThrough
  return normal
}
