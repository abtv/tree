import type { AgendaRow } from '../application/agenda-rows'
import type { DayNumber } from '../domain/calendar-date'
import type { NodeId } from '../domain/document'

export interface AgendaDragSource {
  nodeId: NodeId
  day: DayNumber
  key: string
}

/**
 * What a drop on a row does: `day` moves the occurrence to that day, `invalid` is a row that is not a
 * day (a gap), and `none` is the source's own day, which changes nothing.
 */
export type AgendaDropTarget = { kind: 'day'; day: DayNumber } | { kind: 'invalid' } | { kind: 'none' }

export interface AgendaRowRegion {
  key: string
  top: number
  bottom: number
}

/** Only a direct match is dragged; contextual ancestors, day headers, and gaps never are (`plans/agenda.md` §11). */
export function agendaDragSource(row: AgendaRow): AgendaDragSource | undefined {
  // Stryker disable next-line ConditionalExpression: Only node rows have a role, so a day or gap row fails the second test anyway.
  if (row.kind !== 'node' || row.role !== 'match') return undefined
  return { nodeId: row.nodeId, day: row.day, key: row.key }
}

/** Any row of a day, its header included, drops on that day (m18). */
export function agendaDropTarget(row: AgendaRow, source: AgendaDragSource): AgendaDropTarget {
  if (row.kind === 'gap') return { kind: 'invalid' }
  return row.day === source.day ? { kind: 'none' } : { kind: 'day', day: row.day }
}

/** The key of the row whose band holds `pointerY`; a row without height holds no point. */
export function agendaRowKeyAtPoint(regions: readonly AgendaRowRegion[], pointerY: number): string | undefined {
  return regions.find((region) => pointerY >= region.top && pointerY < region.bottom)?.key
}
