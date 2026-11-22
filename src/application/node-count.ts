import type { Document, TreeNode } from '../domain/document'

const subtreeCounts = new WeakMap<TreeNode, number>()

function subtreeCount(node: TreeNode): number {
  const cached = subtreeCounts.get(node)
  if (cached !== undefined) return cached
  const value = node.children.reduce((total, child) => total + subtreeCount(child), 1)
  subtreeCounts.set(node, value)
  return value
}

/**
 * The number of nodes in the document, an upper bound on Search results (`docs/PRODUCT.md` §20.14).
 * Unchanged branches reuse their counts, so a repeated call visits only top-level nodes and the
 * path of an edit.
 */
export function countDocumentNodes(document: Document): number {
  return document.roots.reduce((total, root) => total + subtreeCount(root), 0)
}
