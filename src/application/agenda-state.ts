import type { DayNumber } from '../domain/calendar-date'
import type { Location, NodeId } from '../domain/document'
import { collapseGap, revealNext } from '../domain/agenda-timeline'
import type { AgendaRow } from './agenda-rows'

export interface AgendaState {
  /** Explicit arrival offset for the selected row; runtime only, never persisted. */
  readonly selectionCursor?: number
  readonly origin: { readonly location: Location; readonly cursor: number }
  readonly scopeParentId: NodeId | null
  readonly today: DayNumber
  readonly selectedKey: string
  readonly collapsed: ReadonlySet<string>
  readonly revealed: ReadonlySet<DayNumber>
  readonly focusedDay?: DayNumber
  readonly timelineReturn?: {
    readonly selectedKey: string
    readonly collapsed: ReadonlySet<string>
    readonly revealed: ReadonlySet<DayNumber>
    readonly scrollTop: number
  }
  readonly activeOccurrence?: AgendaOccurrence
  readonly pinnedOccurrence?: AgendaOccurrence
  /** Occurrences `dd` marked for `p`/`P`; runtime only, dropped by every document change (D4). */
  readonly pendingMove?: readonly AgendaOccurrence[]
}

export interface AgendaOccurrence {
  readonly nodeId: NodeId
  readonly day: DayNumber
}

export type AgendaCommand =
  | { readonly kind: 'select'; readonly key: string; readonly cursor?: number }
  | { readonly kind: 'focus-day'; readonly key: string; readonly scrollTop: number }
  | { readonly kind: 'return-timeline'; readonly key: string }
  | { readonly kind: 'toggle-fold'; readonly key: string }
  | { readonly kind: 'toggle-gap'; readonly key: string }
  | {
      readonly kind: 'fold'
      readonly key: string
      readonly operation: 'close' | 'open' | 'toggle' | 'close-recursive' | 'open-recursive' | 'close-all' | 'open-all'
    }

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
  if (command.kind === 'return-timeline') {
    if (state.timelineReturn === undefined) return state
    const timelineReturn = state.timelineReturn
    const rest = { ...state }
    delete rest.focusedDay
    delete rest.timelineReturn
    delete rest.activeOccurrence
    delete rest.pinnedOccurrence
    delete rest.pendingMove
    return {
      ...rest,
      selectedKey: timelineReturn.selectedKey,
      collapsed: timelineReturn.collapsed,
      revealed: timelineReturn.revealed,
    }
  }
  const rowIndex = rows.findIndex((row) => row.key === command.key)
  if (rowIndex < 0) return state
  const row = rows[rowIndex]!
  if (command.kind === 'focus-day') {
    if (row.kind !== 'day' || state.focusedDay !== undefined) return state
    const rest = { ...state }
    delete rest.pendingMove
    delete rest.activeOccurrence
    delete rest.pinnedOccurrence
    return {
      ...rest,
      focusedDay: row.day,
      selectedKey: row.key,
      collapsed: new Set(state.collapsed),
      revealed: new Set(state.revealed),
      timelineReturn: {
        selectedKey: state.selectedKey,
        collapsed: state.collapsed,
        revealed: state.revealed,
        scrollTop: Math.max(0, command.scrollTop),
      },
    }
  }
  if (command.kind === 'select') {
    const next = selectAgendaRow(state, row)
    return command.cursor === undefined ? next : { ...next, selectionCursor: command.cursor }
  }
  if (command.kind === 'toggle-gap') {
    if (row.kind !== 'gap') return state
    // Revealing a remainder replaces it with days and a smaller remainder, so its own row ceases to exist;
    // the expanded header of its region stays and is the row that remains selectable.
    const header = row.expanded
      ? row
      : (rows.find(
          (candidate) =>
            candidate.kind === 'gap' &&
            candidate.expanded &&
            candidate.startDay <= row.startDay &&
            row.endDay <= candidate.endDay,
        ) ?? row)
    return selectAgendaRow(
      {
        ...state,
        revealed: row.expanded ? collapseGap(state.revealed, row) : revealNext(state.revealed, row),
      },
      header,
    )
  }
  if (command.kind === 'fold') {
    if (command.operation === 'toggle') return applyAgendaCommand(state, { kind: 'toggle-fold', key: row.key }, rows)
    const collapsed = new Set(state.collapsed)
    const close = command.operation.startsWith('close')
    const all = command.operation.endsWith('all')
    const recursive = command.operation.endsWith('recursive')
    if (all && !close) collapsed.clear()
    else {
      const descendants: AgendaRow[] = []
      if (recursive) {
        for (const candidate of rows.slice(rowIndex + 1)) {
          if (
            candidate.kind !== 'node' ||
            row.kind === 'gap' ||
            candidate.day !== row.day ||
            (row.kind === 'node' && candidate.depth <= row.depth)
          )
            break
          descendants.push(candidate)
        }
      }
      const targets = all ? rows : [row, ...descendants]
      for (const target of targets) {
        if (
          target.kind === 'gap' ||
          (target.kind === 'day' && !target.content) ||
          (target.kind === 'node' && !target.hasProjectedChildren)
        )
          continue
        if (close) collapsed.add(target.key)
        else collapsed.delete(target.key)
      }
    }
    const selectedIndex = rows.findIndex((candidate) => candidate.key === state.selectedKey)
    const hiding = rows
      .slice(0, selectedIndex)
      .find(
        (candidate, index) =>
          collapsed.has(candidate.key) &&
          rows
            .slice(index + 1, selectedIndex + 1)
            .every(
              (child) =>
                child.kind === 'node' &&
                candidate.kind !== 'gap' &&
                child.day === candidate.day &&
                (candidate.kind === 'day' || child.depth > candidate.depth),
            ),
      )
    const next = { ...state, collapsed }
    return hiding === undefined ? next : selectAgendaRow(next, hiding)
  }
  if (row.kind === 'gap' || (row.kind === 'day' && !row.content) || (row.kind === 'node' && !row.hasProjectedChildren))
    return state
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
  const next = { ...state, collapsed }
  return hidesSelection ? selectAgendaRow(next, row) : next
}

/** Selecting another row leaves an invalid item; reselection does not. */
export function selectAgendaRow(state: AgendaState, row: AgendaRow): AgendaState {
  if (state.selectedKey === row.key) return state
  const rest = { ...state }
  delete rest.activeOccurrence
  delete rest.pinnedOccurrence
  delete rest.selectionCursor
  return {
    ...rest,
    selectedKey: row.key,
    // Day and gap rows have no role, so the role check alone also prevents them becoming active.
    ...(row.kind === 'node' && row.role === 'match' ? { activeOccurrence: { nodeId: row.nodeId, day: row.day } } : {}),
  }
}
