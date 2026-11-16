import type { Document, TreeNode } from '../domain/document'
import { completionPresentation, label, resultText, type RecentNode } from './recent-nodes'

const containsStar = new WeakMap<TreeNode, boolean>()
const results = new WeakMap<Document, readonly RecentNode[]>()

function hasStar(node: TreeNode): boolean {
  const cached = containsStar.get(node)
  if (cached !== undefined) return cached
  const value = node.starred === true || node.children.some(hasStar)
  containsStar.set(node, value)
  return value
}

/** Prepared only when opening/clearing Search; unchanged branches reuse their summaries. */
export function starredNodes(document: Document): readonly RecentNode[] {
  const cached = results.get(document)
  if (cached !== undefined) return cached
  const entries: { key: string; result: RecentNode }[] = []
  const visit = (nodes: readonly TreeNode[], ancestors: readonly TreeNode[]): void => {
    for (const node of nodes) {
      if (!hasStar(node)) continue
      if (node.starred) {
        entries.push({
          key: [...ancestors, node].map((part) => part.text || label(part)).join(' › '),
          result: {
            id: node.id,
            text: resultText(node),
            path: ancestors.length === 0 ? null : ancestors.map(label).join(' › '),
            ...completionPresentation(node, ancestors),
          },
        })
      }
      visit(node.children, [...ancestors, node])
    }
  }
  visit(document.roots, [])
  entries.sort((a, b) => a.key.localeCompare(b.key))
  const value = entries.map((entry) => entry.result)
  results.set(document, value)
  return value
}
