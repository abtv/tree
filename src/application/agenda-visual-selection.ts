import type { AgendaRow } from './agenda-rows'
import type { AgendaOccurrence } from './agenda-state'

export interface AgendaVisualEndpoints {
  anchorId: string
  focusId: string
}

/** D5: one day's direct matches at the anchor's projected depth, regardless of real parent. */
export function agendaVisualCandidates(
  rows: readonly AgendaRow[],
  day: number,
  anchorId: string,
): readonly Extract<AgendaRow, { kind: 'node' }>[] {
  const anchor = rows.find((row) => row.kind === 'node' && row.day === day && row.nodeId === anchorId)
  if (anchor?.kind !== 'node' || anchor.role !== 'match') return []
  return rows.filter(
    (row): row is Extract<AgendaRow, { kind: 'node' }> =>
      row.kind === 'node' && row.day === day && row.role === 'match' && row.depth === anchor.depth,
  )
}

export function agendaVisualSources(
  rows: readonly AgendaRow[],
  day: number,
  endpoints: AgendaVisualEndpoints,
): readonly AgendaOccurrence[] {
  const candidates = agendaVisualCandidates(rows, day, endpoints.anchorId)
  const anchor = candidates.findIndex((row) => row.nodeId === endpoints.anchorId)
  const focus = candidates.findIndex((row) => row.nodeId === endpoints.focusId)
  if (anchor < 0 || focus < 0) return []
  return candidates
    .slice(Math.min(anchor, focus), Math.max(anchor, focus) + 1)
    .map((row) => ({ nodeId: row.nodeId, day }))
}

export function agendaVisualTarget(
  rows: readonly AgendaRow[],
  day: number,
  endpoints: AgendaVisualEndpoints,
  direction: 'up' | 'down' | 'first' | 'last',
  count: number,
): Extract<AgendaRow, { kind: 'node' }> | undefined {
  const candidates = agendaVisualCandidates(rows, day, endpoints.anchorId)
  const focus = candidates.findIndex((row) => row.nodeId === endpoints.focusId)
  if (focus < 0) return undefined
  const index =
    direction === 'first'
      ? 0
      : direction === 'last'
        ? candidates.length - 1
        : Math.max(0, Math.min(candidates.length - 1, focus + (direction === 'down' ? count : -count)))
  return candidates[index]
}
