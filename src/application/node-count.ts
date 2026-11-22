import type { Document, TreeNode } from '../domain/document'

const subtreeCounts = new WeakMap<TreeNode, number>()
const documentCounts = new WeakMap<Document, number>()

function subtreeCount(node: TreeNode): number {
  const cached = subtreeCounts.get(node)
  if (cached !== undefined) return cached
  const value = node.children.reduce((total, child) => total + subtreeCount(child), 1)
  subtreeCounts.set(node, value)
  return value
}

/**
 * The number of nodes in the document, an upper bound on Search results (`docs/PRODUCT.md` §20.14).
 * Unchanged branches reuse their counts, so repeated calls after an edit only revisit its path.
 */
export function countDocumentNodes(document: Document): number {
  const cached = documentCounts.get(document)
  if (cached !== undefined) return cached
  const value = document.roots.reduce((total, root) => total + subtreeCount(root), 0)
  documentCounts.set(document, value)
  return value
}
