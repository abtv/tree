import type { DayNumber } from '../domain/calendar-date'
import type { Location, NodeId } from '../domain/document'
import type { AgendaRow } from './agenda-rows'

export interface AgendaState {
  /** Explicit arrival offset for the selected row; runtime only, never persisted. */
  readonly selectionCursor?: number
  readonly origin: { readonly location: Location; readonly cursor: number }
  readonly scopeParentId: NodeId | null
  readonly today: DayNumber
  readonly selectedKey: string
  readonly collapsed: ReadonlySet<string>
  readonly focusedDay?: DayNumber
  readonly timelineReturn?: {
    readonly selectedKey: string
    readonly collapsed: ReadonlySet<string>
    readonly scrollTop: number
  }
  readonly activeOccurrence?: AgendaOccurrence
  readonly pinnedOccurrence?: AgendaOccurrence
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
    return {
      ...rest,
      selectedKey: timelineReturn.selectedKey,
      collapsed: timelineReturn.collapsed,
    }
  }

  const row = rows.find((candidate) => candidate.key === command.key)
  if (row === undefined) return state
  if (command.kind === 'focus-day') {
    if (row.kind !== 'day' || state.focusedDay !== undefined) return state
    const rest = { ...state }
    delete rest.activeOccurrence
    delete rest.pinnedOccurrence
    return {
      ...rest,
      focusedDay: row.day,
      selectedKey: row.key,
      collapsed: new Set(state.collapsed),
      timelineReturn: {
        selectedKey: state.selectedKey,
        collapsed: state.collapsed,
        scrollTop: Math.max(0, command.scrollTop),
      },
    }
  }
  if (command.kind === 'select') {
    const next = selectAgendaRow(state, row)
    return command.cursor === undefined ? next : { ...next, selectionCursor: command.cursor }
  }

  const operation = command.kind === 'toggle-fold' ? 'toggle' : command.operation
  const all = operation.endsWith('all')
  if (!all && (row.kind !== 'day' || !row.content)) return state
  const collapsed = new Set(state.collapsed)
  const targets = all ? rows : [row]
  for (const target of targets) {
    if (target.kind !== 'day' || !target.content) continue
    const close = operation === 'toggle' ? !collapsed.has(target.key) : operation.startsWith('close')
    if (close) collapsed.add(target.key)
    else collapsed.delete(target.key)
  }

  const selected = rows.find((candidate) => candidate.key === state.selectedKey)
  const next = { ...state, collapsed }
  if (selected?.kind === 'node' && collapsed.has(dayKey(selected.day))) {
    return selectAgendaRow(
      next,
      rows.find((candidate) => candidate.key === dayKey(selected.day))!,
    )
  }
  return next
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
    ...(row.kind === 'node' ? { activeOccurrence: { nodeId: row.nodeId, day: row.day } } : {}),
  }
}
