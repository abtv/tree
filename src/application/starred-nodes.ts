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
 * Marked nodes, then the starred nodes that are not marked; each group is sorted by path
 * (`docs/PRODUCT.md` §20.14). Prepared only when opening/clearing Search; unchanged branches reuse
 * their summaries.
 */
export function markedAndStarredNodes(document: Document, hideFinishedTasks = false): readonly NodeResult[] {
  const all = allMarkedAndStarredNodes(document)
  return hideFinishedTasks ? all.filter((node) => !node.struckThrough) : all
}

function allMarkedAndStarredNodes(document: Document): readonly NodeResult[] {
  const cached = results.get(document)
  if (cached !== undefined) return cached
  const marked: { key: string; result: NodeResult }[] = []
  const starred: { key: string; result: NodeResult }[] = []
  const visit = (nodes: readonly TreeNode[], ancestors: readonly TreeNode[]): void => {
    for (const node of nodes) {
      if (!hasFlag(node)) continue
      if (node.marked || node.starred) {
        ;(node.marked ? marked : starred).push({
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
  const value = [marked, starred].flatMap((entries) =>
    entries.sort((a, b) => a.key.localeCompare(b.key)).map((entry) => entry.result),
  )
  results.set(document, value)
  return value
}
