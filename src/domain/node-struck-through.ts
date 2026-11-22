import type { TreeNode } from './document-types'

/** Leaves own their state; parents derive it from their already normalized children. */
export function deriveStruckThrough(node: TreeNode): TreeNode {
  if (node.children.length === 0) return node
  return withStruckThrough(
    node,
    node.children.every((child) => child.struckThrough === true),
  )
}

export function withStruckThrough(node: TreeNode, struckThrough: boolean): TreeNode {
  if ((node.struckThrough === true) === struckThrough) return node
  if (struckThrough) return { ...node, struckThrough: true }
  const normal = { ...node }
  delete normal.struckThrough
  return normal
}

/** Set every descendant as well, preserving unchanged subtrees and all other content. */
export function setSubtreeStruckThrough(node: TreeNode, struckThrough: boolean): TreeNode {
  const children = node.children.map((child) => setSubtreeStruckThrough(child, struckThrough))
  const sameChildren = children.every((child, index) => child === node.children[index])
  return withStruckThrough(sameChildren ? node : { ...node, children }, struckThrough)
}
