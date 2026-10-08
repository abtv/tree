import type { DayNumber } from '../domain/calendar-date'
import type { Document, NodeId } from '../domain/document'
import { projectAgenda, type AgendaProjectionDay } from '../domain/agenda-projection'
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

export function buildAgendaRows(projection: readonly AgendaProjectionDay[], state: AgendaState): readonly AgendaRow[] {
  const days = new Map(projection.map((day) => [day.day, day.rows]))
  const timeline = buildTimeline({ contentDays: new Set(days.keys()), today: state.today, revealed: state.revealed })
  const rows: AgendaRow[] = []
  for (const entry of timeline) {
    if (entry.kind === 'gap') {
      rows.push({ ...entry, key: `gap:${entry.startDay}:${entry.endDay}` })
      continue
    }
    const key = dayKey(entry.day)
    rows.push({ ...entry, key })
    if (state.collapsed.has(key)) continue
    const projected = days.get(entry.day) ?? []
    let hiddenBelow: number | undefined
    for (let index = 0; index < projected.length; index++) {
      const node = projected[index]!
      // The explicit undefined guard is equivalent to comparing with undefined (which is false).
      if (hiddenBelow !== undefined && node.depth > hiddenBelow) continue
      hiddenBelow = undefined
      const nodeKey = `node:${entry.day}:${node.nodeId}`
      rows.push({
        ...node,
        kind: 'node',
        key: nodeKey,
        day: entry.day,
        hasProjectedChildren: (projected[index + 1]?.depth ?? -1) > node.depth,
      })
      if (state.collapsed.has(nodeKey)) hiddenBelow = node.depth
    }
  }
  return rows
}

function sameProjection(left: readonly AgendaProjectionDay[], right: readonly AgendaProjectionDay[]): boolean {
  return (
    left.length === right.length &&
    left.every((day, index) => {
      const other = right[index]!
      return (
        day.day === other.day &&
        day.rows.length === other.rows.length &&
        day.rows.every((row, rowIndex) => {
          const candidate = other.rows[rowIndex]!
          return row.nodeId === candidate.nodeId && row.depth === candidate.depth && row.role === candidate.role
        })
      )
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

  public get(document: Document, state: AgendaState): readonly AgendaRow[] {
    let changed = false
    if (document !== this.document || state.scopeParentId !== this.scope) {
      const projection = projectAgenda(document, state.scopeParentId)
      changed = !sameProjection(this.projection, projection)
      this.projection = projection
      this.document = document
      this.scope = state.scopeParentId
    }
    if (
      changed ||
      this.state?.today !== state.today ||
      this.state.collapsed !== state.collapsed ||
      this.state.revealed !== state.revealed
    ) {
      this.rows = buildAgendaRows(this.projection, state)
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
  }
}
