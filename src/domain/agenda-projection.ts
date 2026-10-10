import type { DayNumber } from './calendar-date'
import { findCanonicalDates } from './date-recognition'
import { requireNode } from './document-index'
import type { Document, NodeId, TreeNode } from './document-types'

export interface AgendaProjectionRow {
  readonly nodeId: NodeId
  readonly depth: number
  readonly role: 'match' | 'context'
}

export interface AgendaProjectionDay {
  readonly day: DayNumber
  readonly rows: readonly AgendaProjectionRow[]
}

interface DateSummary {
  readonly direct: ReadonlySet<DayNumber>
  readonly subtree: ReadonlySet<DayNumber>
}

const summaries = new WeakMap<TreeNode, DateSummary>()

function summaryOf(node: TreeNode): DateSummary {
  const cached = summaries.get(node)
  if (cached !== undefined) return cached
  const direct = new Set<DayNumber>()
  for (const match of findCanonicalDates(node.text, node.links)) direct.add(match.day)
  let subtree: Set<DayNumber> | undefined
  for (const child of node.children) {
    for (const day of summaryOf(child).subtree) {
      if ((subtree ?? direct).has(day)) continue
      ;(subtree ??= new Set(direct)).add(day)
    }
  }
  const summary = { direct, subtree: subtree ?? direct }
  summaries.set(node, summary)
  return summary
}

/** Project real nodes below the scope; depth zero is a root of that scope. */
export function projectAgenda(
  document: Document,
  scopeParentId: NodeId | null,
  previous?: { document: Document; projection: readonly AgendaProjectionDay[] },
): readonly AgendaProjectionDay[] {
  const roots = scopeParentId === null ? document.roots : requireNode(document, scopeParentId).node.children
  const previousRoots =
    previous === undefined
      ? undefined
      : scopeParentId === null
        ? previous.document.roots
        : requireNode(previous.document, scopeParentId).node.children
  const days = new Set<DayNumber>()
  for (const root of roots) {
    for (const day of summaryOf(root).subtree) days.add(day)
  }
  const sorted = [...days].sort((a, b) => a - b)
  const previousDays =
    previous === undefined ? undefined : new Map(previous.projection.map((entry) => [entry.day, entry]))
  const reused = new Map<DayNumber, AgendaProjectionDay>()
  // Days that need fresh rows collect them during one shared traversal, so cost does not multiply by the day count.
  const fresh = new Map<DayNumber, AgendaProjectionRow[]>()
  // Path copying leaves most roots identical, so find the replaced ones once rather than once per day.
  let replaced: number[] | undefined
  if (previousRoots !== undefined && roots.length === previousRoots.length) {
    replaced = []
    for (let index = 0; index < roots.length; index++) if (roots[index] !== previousRoots[index]) replaced.push(index)
  }
  for (const day of sorted) {
    const old = previousDays?.get(day)
    const same = (left: TreeNode, right: TreeNode): boolean => {
      if (left === right) return true
      if (left.id !== right.id || left.children.length !== right.children.length) return false
      if (summaryOf(left).direct.has(day) !== summaryOf(right).direct.has(day)) return false
      return left.children.every((child, index) => same(child, right.children[index]!))
    }
    if (
      old !== undefined &&
      previousRoots !== undefined &&
      replaced !== undefined &&
      replaced.every((index) => same(roots[index]!, previousRoots[index]!))
    ) {
      reused.set(day, old)
    } else {
      fresh.set(day, [])
    }
  }
  if (fresh.size > 0) {
    const visit = (node: TreeNode, depth: number): void => {
      const summary = summaryOf(node)
      let included = false
      for (const day of summary.subtree) {
        const rows = fresh.get(day)
        if (rows === undefined) continue
        included = true
        rows.push({ nodeId: node.id, depth, role: summary.direct.has(day) ? 'match' : 'context' })
      }
      // A child's subtree days are a subset of its parent's, so a node with no wanted day has no wanted descendants.
      if (included) for (const child of node.children) visit(child, depth + 1)
    }
    for (const root of roots) visit(root, 0)
  }
  return sorted.map((day) => reused.get(day) ?? { day, rows: fresh.get(day)! })
}
