import type { Document, TreeNode } from '../domain/document'
import { completionPresentation, label, resultText, type NodeResult } from './node-result'

const containsFlag = new WeakMap<TreeNode, boolean>()
const results = new WeakMap<Document, readonly NodeResult[]>()

function hasFlag(node: TreeNode): boolean {
  const cached = containsFlag.get(node)
  if (cached !== undefined) return cached
  const value = node.marked === true || node.starred === true || node.children.some(hasFlag)
  containsFlag.set(node, value)
  return value
}

/**
 * Marked starred nodes, then the other marked nodes, then the starred nodes that are not marked; each
 * group keeps document order, as Tree shows it (`docs/PRODUCT.md` §20.14.5). Prepared only when
 * opening/clearing Search; unchanged branches reuse their summaries.
 */
export function markedAndStarredNodes(document: Document): readonly NodeResult[] {
  const cached = results.get(document)
  if (cached !== undefined) return cached
  const both: NodeResult[] = []
  const marked: NodeResult[] = []
  const starred: NodeResult[] = []
  const visit = (nodes: readonly TreeNode[], ancestors: readonly TreeNode[]): void => {
    for (const node of nodes) {
      if (!hasFlag(node)) continue
      if (node.marked || node.starred) {
        ;(node.marked ? (node.starred ? both : marked) : starred).push({
          id: node.id,
          text: resultText(node),
          path: ancestors.length === 0 ? null : ancestors.map(label).join(' › '),
          ...completionPresentation(node, ancestors),
        })
      }
      visit(node.children, [...ancestors, node])
    }
  }
  visit(document.roots, [])
  const value = [...both, ...marked, ...starred]
  results.set(document, value)
  return value
}
