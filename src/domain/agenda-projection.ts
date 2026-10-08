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
  const direct = new Set(findCanonicalDates(node.text, node.links).map((match) => match.day))
  const subtree = new Set(direct)
  for (const child of node.children) {
    for (const day of summaryOf(child).subtree) subtree.add(day)
  }
  const summary = { direct, subtree }
  summaries.set(node, summary)
  return summary
}

/** Project real nodes below the scope; depth zero is a root of that scope. */
export function projectAgenda(document: Document, scopeParentId: NodeId | null): readonly AgendaProjectionDay[] {
  const roots = scopeParentId === null ? document.roots : requireNode(document, scopeParentId).node.children
  const days = new Set<DayNumber>()
  for (const root of roots) {
    for (const day of summaryOf(root).subtree) days.add(day)
  }
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => {
      const rows: AgendaProjectionRow[] = []
      const visit = (node: TreeNode, depth: number): void => {
        const summary = summaryOf(node)
        if (!summary.subtree.has(day)) return
        rows.push({ nodeId: node.id, depth, role: summary.direct.has(day) ? 'match' : 'context' })
        for (const child of node.children) visit(child, depth + 1)
      }
      for (const root of roots) visit(root, 0)
      return { day, rows }
    })
}
