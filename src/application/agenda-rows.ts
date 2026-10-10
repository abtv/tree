import type { DayNumber } from '../domain/calendar-date'
import { locateNode, type Document, type NodeId, type TreeNode } from '../domain/document'
import { projectAgenda, type AgendaProjectionDay, type AgendaProjectionRow } from '../domain/agenda-projection'
import { buildTimeline, type TimelineDay, type TimelineGap } from '../domain/agenda-timeline'
import { dayKey, type AgendaState } from './agenda-state'

export type AgendaRow =
  | (TimelineDay & { readonly key: string })
  | (TimelineGap & { readonly key: string })
  | {
      readonly kind: 'node'
      readonly key: string
      readonly day: DayNumber
      readonly nodeId: NodeId
      readonly depth: number
      readonly role: 'match' | 'context'
      readonly hasProjectedChildren: boolean
    }

/** Add the one temporarily invalid item and its ancestors without copying document nodes. */
export function agendaProjection(
  document: Document,
  state: AgendaState,
  previous?: { document: Document; projection: readonly AgendaProjectionDay[] },
): readonly AgendaProjectionDay[] {
  const projection = projectAgenda(document, state.scopeParentId, previous)
  const pin = state.pinnedOccurrence
  if (pin === undefined) return projection
  const located = locateNode(document, pin.nodeId)
  if (located === undefined) return projection
  const start =
    state.scopeParentId === null ? 0 : located.ancestors.findIndex((node) => node.id === state.scopeParentId) + 1
  if (state.scopeParentId !== null && start === 0) return projection
  // Stryker disable next-line ArrayDeclaration: A non-row default element has undefined identity and never matches any real tree node.
  const original = projection.find((entry) => entry.day === pin.day)?.rows ?? []
  const included = new Map(original.map((row) => [row.nodeId, row.role]))
  // Stryker disable next-line MethodExpression: Traversal starts below the scope, so extra ancestors in this map are never emitted.
  for (const ancestor of located.ancestors.slice(start)) {
    if (!included.has(ancestor.id)) included.set(ancestor.id, 'context')
  }
  included.set(pin.nodeId, 'match')
  const rows: AgendaProjectionRow[] = []
  const visit = (node: TreeNode, depth: number): void => {
    const role = included.get(node.id)
    if (role === undefined) return
    rows.push({ nodeId: node.id, depth, role })
    for (const child of node.children) visit(child, depth + 1)
  }
  const roots = state.scopeParentId === null ? document.roots : locateNode(document, state.scopeParentId)!.node.children
  for (const root of roots) visit(root, 0)
  return [...projection.filter((entry) => entry.day !== pin.day), { day: pin.day, rows }].sort((a, b) => a.day - b.day)
}

interface DayRows {
  projected: readonly AgendaProjectionRow[]
  collapsed: ReadonlySet<string>
  rows: readonly AgendaRow[]
}

export function buildAgendaRows(
  projection: readonly AgendaProjectionDay[],
  state: AgendaState,
  cache?: Map<DayNumber, DayRows>,
): readonly AgendaRow[] {
  const days = new Map(projection.map((day) => [day.day, day.rows]))
  const timeline =
    state.focusedDay === undefined
      ? buildTimeline({ contentDays: new Set(days.keys()), today: state.today, revealed: state.revealed })
      : [
          {
            kind: 'day' as const,
            day: state.focusedDay,
            content: days.has(state.focusedDay),
            isToday: state.focusedDay === state.today,
          },
        ]
  const rows: AgendaRow[] = []
  const anyCollapsed = state.collapsed.size > 0
  for (const entry of timeline) {
    if (entry.kind === 'gap') {
      rows.push({ ...entry, key: `gap:${entry.startDay}:${entry.endDay}` })
      continue
    }
    const key = dayKey(entry.day)
    rows.push({ ...entry, key })
    if (state.collapsed.has(key)) continue
    const projected = days.get(entry.day) ?? []
    const cached = cache?.get(entry.day)
    if (cached?.projected === projected && cached.collapsed === state.collapsed) {
      for (const row of cached.rows) rows.push(row)
      continue
    }
    const dayRows: AgendaRow[] = []
    let hiddenBelow: number | undefined
    for (let index = 0; index < projected.length; index++) {
      const node = projected[index]!
      // The explicit undefined guard is equivalent to comparing with undefined (which is false).
      if (hiddenBelow !== undefined && node.depth > hiddenBelow) continue
      hiddenBelow = undefined
      const nodeKey = `node:${entry.day}:${node.nodeId}`
      dayRows.push({
        kind: 'node',
        key: nodeKey,
        day: entry.day,
        nodeId: node.nodeId,
        depth: node.depth,
        role: node.role,
        hasProjectedChildren: (projected[index + 1]?.depth ?? -1) > node.depth,
      })
      // Hashing each freshly built key is measurable at 100,000 rows, and most Agendas have no folds.
      if (anyCollapsed && state.collapsed.has(nodeKey)) hiddenBelow = node.depth
    }
    cache?.set(entry.day, { projected, collapsed: state.collapsed, rows: dayRows })
    for (const row of dayRows) rows.push(row)
  }
  if (cache !== undefined) {
    for (const day of cache.keys()) if (!days.has(day)) cache.delete(day)
  }
  return rows
}

function sameDay(left: AgendaProjectionDay, right: AgendaProjectionDay): boolean {
  if (left === right) return true
  return (
    left.day === right.day &&
    left.rows.length === right.rows.length &&
    left.rows.every((row, index) => {
      const other = right.rows[index]!
      return row.nodeId === other.nodeId && row.depth === other.depth && row.role === other.role
    })
  )
}

/** One bounded cache per store; rows contain identities, never retained document snapshots. */
export class AgendaRowsCache {
  private document: Document | undefined
  private scope: NodeId | null | undefined
  private projection: readonly AgendaProjectionDay[] = []
  private state: AgendaState | undefined
  private rows: readonly AgendaRow[] = []
  private readonly dayRows = new Map<DayNumber, DayRows>()

  public get(document: Document, state: AgendaState): readonly AgendaRow[] {
    let changed = false
    if (
      document !== this.document ||
      state.scopeParentId !== this.scope ||
      // The document/scope guards run first; an equal cached document always has cached state.
      state.pinnedOccurrence !== this.state?.pinnedOccurrence
    ) {
      const previous = new Map(this.projection.map((day) => [day.day, day]))
      const reusable =
        this.document !== undefined &&
        state.scopeParentId === this.scope &&
        state.pinnedOccurrence === undefined &&
        this.state?.pinnedOccurrence === undefined
          ? { document: this.document, projection: this.projection }
          : undefined
      const projection = agendaProjection(document, state, reusable).map((day) => {
        const old = previous.get(day.day)
        return old !== undefined && sameDay(old, day) ? old : day
      })
      changed =
        projection.length !== this.projection.length || projection.some((day, index) => day !== this.projection[index])
      this.projection = projection
      this.document = document
      this.scope = state.scopeParentId
    }
    if (
      changed ||
      this.state?.today !== state.today ||
      this.state.focusedDay !== state.focusedDay ||
      this.state.collapsed !== state.collapsed ||
      this.state.revealed !== state.revealed
    ) {
      this.rows = buildAgendaRows(this.projection, state, this.dayRows)
    }
    this.state = state
    return this.rows
  }

  public clear(): void {
    // Empty-array literal mutants are overwritten on the next get; clearing the document and state
    // is the lifecycle guarantee. These resets also release projection/row storage immediately.
    this.document = undefined
    this.scope = undefined
    this.projection = []
    this.state = undefined
    this.rows = []
    this.dayRows.clear()
  }
}
