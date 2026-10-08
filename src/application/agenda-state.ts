import type { DayNumber } from '../domain/calendar-date'
import type { Location, NodeId } from '../domain/document'
import { collapseGap, revealNext } from '../domain/agenda-timeline'
import type { AgendaRow } from './agenda-rows'

export interface AgendaState {
  readonly origin: { readonly location: Location; readonly cursor: number }
  readonly scopeParentId: NodeId | null
  readonly today: DayNumber
  readonly selectedKey: string
  readonly collapsed: ReadonlySet<string>
  readonly revealed: ReadonlySet<DayNumber>
}

export type AgendaCommand =
  | { readonly kind: 'select'; readonly key: string; readonly cursor?: number }
  | { readonly kind: 'toggle-fold'; readonly key: string }
  | { readonly kind: 'toggle-gap'; readonly key: string }

export function dayKey(day: DayNumber): string {
  return `day:${day}`
}

export function openAgendaState(location: Location, cursor: number, today: DayNumber): AgendaState {
  return {
    origin: { location, cursor },
    scopeParentId: location.currentParentId,
    today,
    selectedKey: dayKey(today),
    collapsed: new Set(),
    revealed: new Set(),
  }
}

export function applyAgendaCommand(
  state: AgendaState,
  command: AgendaCommand,
  rows: readonly AgendaRow[],
): AgendaState {
  const rowIndex = rows.findIndex((row) => row.key === command.key)
  if (rowIndex < 0) return state
  const row = rows[rowIndex]!
  if (command.kind === 'select') {
    return state.selectedKey === row.key ? state : { ...state, selectedKey: row.key }
  }
  if (command.kind === 'toggle-gap') {
    if (row.kind !== 'gap') return state
    return {
      ...state,
      revealed: row.expanded ? collapseGap(state.revealed, row) : revealNext(state.revealed, row),
      selectedKey: row.key,
    }
  }
  if (row.kind === 'gap' || (row.kind === 'node' && !row.hasProjectedChildren)) return state
  const collapsed = new Set(state.collapsed)
  if (collapsed.has(row.key)) collapsed.delete(row.key)
  else collapsed.add(row.key)
  const selectedIndex = rows.findIndex((candidate) => candidate.key === state.selectedKey)
  let hidesSelection = false
  if (collapsed.has(row.key) && selectedIndex > rowIndex) {
    // >= is equivalent when the selected row is the folding row: it selects that same key.
    // The kind/day checks are defensive: timeline day boundaries already break the depth predicate.
    hidesSelection = rows
      .slice(rowIndex + 1, selectedIndex + 1)
      .every(
        (candidate) =>
          candidate.kind === 'node' && candidate.day === row.day && (row.kind === 'day' || candidate.depth > row.depth),
      )
  }
  return { ...state, collapsed, selectedKey: hidesSelection ? row.key : state.selectedKey }
}

/** The document-edit reconciliation arrives with AG-13. */
export function reconcileAgenda(state: AgendaState): AgendaState {
  return state
}
