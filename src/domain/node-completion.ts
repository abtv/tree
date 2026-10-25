import type { TreeNode } from './document-types'

/** Leaves own their state; parents derive it from their already normalized children. */
export function deriveCompletion(node: TreeNode): TreeNode {
  if (node.children.length === 0) return node
  return withCompletion(
    node,
    node.children.every((child) => child.struckThrough === true),
  )
}

export function withCompletion(node: TreeNode, complete: boolean): TreeNode {
  if ((node.struckThrough === true) === complete) return node
  if (complete) return { ...node, struckThrough: true }
  const normal = { ...node }
  delete normal.struckThrough
  return normal
}

/** Set every descendant as well, preserving unchanged subtrees and all non-completion content. */
export function completeSubtree(node: TreeNode, complete: boolean): TreeNode {
  const children = node.children.map((child) => completeSubtree(child, complete))
  const sameChildren = children.every((child, index) => child === node.children[index])
  return withCompletion(sameChildren ? node : { ...node, children }, complete)
}
