import type { AgendaRow } from './agenda-rows'
import type { AgendaOccurrence, AgendaState } from './agenda-state'

/**
 * The sources of `dd` with a count (`plans/agenda.md` §13, m19): the selected direct match plus the next
 * `count − 1` direct matches of its day at its nesting level (D5). Contextual ancestors and nodes at other
 * levels are skipped, and the search ends at the day's last row. Returns nothing unless a direct match is selected.
 */
export function pendingMoveSources(
  rows: readonly AgendaRow[],
  selectedKey: string,
  count: number,
): readonly AgendaOccurrence[] {
  const start = rows.findIndex((row) => row.key === selectedKey)
  const first = rows[start]
  if (first?.kind !== 'node' || first.role !== 'match') return []
  const sources: AgendaOccurrence[] = [{ nodeId: first.nodeId, day: first.day }]
  for (let index = start + 1; index < rows.length && sources.length < count; index += 1) {
    const row = rows[index]!
    // Node rows follow their day header, so the next header or gap ends the day.
    if (row.kind !== 'node') break
    if (row.role === 'match' && row.depth === first.depth) sources.push({ nodeId: row.nodeId, day: row.day })
  }
  return sources
}

export function isPendingMoveSource(agenda: Pick<AgendaState, 'pendingMove'>, nodeId: string, day: number): boolean {
  return agenda.pendingMove?.some((source) => source.nodeId === nodeId && source.day === day) ?? false
}

/** The day a `p`/`P` on this row targets: a day or node row has one; a gap has none and keeps the move pending. */
export function pendingMoveTargetDay(row: AgendaRow | undefined): number | undefined {
  // Stryker disable next-line ConditionalExpression,StringLiteral: A gap has no day property, so this test only narrows the type.
  return row === undefined || row.kind === 'gap' ? undefined : row.day
}
