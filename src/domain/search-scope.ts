import type { DayNumber } from './calendar-date'
import type { Document, NodeId, TreeNode } from './document'
import type { AgendaProjectionDay } from './agenda-projection'
import type { SearchWork } from './text-search'

export interface SearchOccurrence {
  readonly nodeId: NodeId
  readonly day?: DayNumber
}

export interface SearchText extends SearchOccurrence {
  readonly text: string
}

export type SearchScope =
  | { readonly kind: 'tree'; readonly parentId: NodeId | null }
  | {
      readonly kind: 'agenda'
      readonly projection: readonly AgendaProjectionDay[]
      readonly focusedDay?: DayNumber
    }

/** Stack memory scales with depth, not sibling count. No cold whole-document index. */
function* forest(roots: readonly TreeNode[]): Generator<TreeNode, void> {
  const stack = [{ nodes: roots, index: 0 }]
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!
    const node = frame.nodes[frame.index++]
    if (node === undefined) {
      stack.pop()
    } else {
      yield node
      if (node.children.length > 0) stack.push({ nodes: node.children, index: 0 })
    }
  }
}

/** Caller supplies an immutable, already-derived Agenda projection, before fold filtering. */
export function* searchScope(document: Document, scope: SearchScope): SearchWork<SearchText> {
  if (scope.kind === 'tree') {
    if (scope.parentId === null) {
      for (const node of forest(document.roots)) yield { nodeId: node.id, text: node.text }
      return
    }
    for (const node of forest(document.roots)) {
      if (node.id === scope.parentId) {
        for (const descendant of forest([node])) yield { nodeId: descendant.id, text: descendant.text }
        return
      }
      yield undefined
    }
    return
  }
  // Build references incrementally, once per execution. Never copy text or flattened rows.
  const nodes = new Map<NodeId, TreeNode>()
  for (const node of forest(document.roots)) {
    nodes.set(node.id, node)
    yield undefined
  }
  for (const day of scope.projection) {
    yield undefined
    if (scope.focusedDay !== undefined && day.day !== scope.focusedDay) continue
    for (const row of day.rows) {
      const node = nodes.get(row.nodeId)
      yield node === undefined ? undefined : { nodeId: node.id, day: day.day, text: node.text }
    }
  }
}

export function sameOccurrence(left: SearchOccurrence, right: SearchOccurrence): boolean {
  return left.nodeId === right.nodeId && left.day === right.day
}
