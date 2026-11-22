import type { Document, TreeNode } from '../domain/document'
import { completionPresentation, label, resultText, type NodeResult } from './node-result'

const containsFlag = new WeakMap<TreeNode, boolean>()
const results = new WeakMap<Document, readonly NodeResult[]>()
// One shared collator: numeric runs compare by value, so `Release 0.9` precedes `Release 0.11`.
const collator = new Intl.Collator(undefined, { numeric: true })

/** Compares ancestor and node names one level at a time; a path that is a prefix of another sorts first. */
function comparePaths(a: readonly string[], b: readonly string[]): number {
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index++) {
    const order = collator.compare(a[index]!, b[index]!)
    if (order !== 0) return order
  }
  return a.length - b.length
}

function hasFlag(node: TreeNode): boolean {
  const cached = containsFlag.get(node)
  if (cached !== undefined) return cached
  const value = node.marked === true || node.starred === true || node.children.some(hasFlag)
  containsFlag.set(node, value)
  return value
}

/**
 * Marked starred nodes, then the other marked nodes, then the starred nodes that are not marked; each
 * group is sorted by path (`docs/PRODUCT.md` §20.14). Prepared only when opening/clearing Search;
 * unchanged branches reuse their summaries.
 */
export function markedAndStarredNodes(document: Document): readonly NodeResult[] {
  const cached = results.get(document)
  if (cached !== undefined) return cached
  const both: { key: readonly string[]; result: NodeResult }[] = []
  const marked: { key: readonly string[]; result: NodeResult }[] = []
  const starred: { key: readonly string[]; result: NodeResult }[] = []
  const visit = (nodes: readonly TreeNode[], ancestors: readonly TreeNode[]): void => {
    for (const node of nodes) {
      if (!hasFlag(node)) continue
      if (node.marked || node.starred) {
        ;(node.marked ? (node.starred ? both : marked) : starred).push({
          key: [...ancestors, node].map((part) => part.text || label(part)),
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
  const value = [both, marked, starred].flatMap((entries) =>
    entries.sort((a, b) => comparePaths(a.key, b.key)).map((entry) => entry.result),
  )
  results.set(document, value)
  return value
}
