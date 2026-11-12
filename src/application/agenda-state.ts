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
  readonly presentation: AgendaPresentation
  readonly activity: AgendaActivity
}

export interface AgendaTimelineReturn {
  readonly selectedKey: string
  readonly collapsed: ReadonlySet<string>
  readonly scrollTop: number
}

export type AgendaPresentation =
  | { readonly kind: 'timeline' }
  | { readonly kind: 'focused-day'; readonly day: DayNumber; readonly timelineReturn: AgendaTimelineReturn }

export function focusedAgendaDay(state: Pick<AgendaState, 'presentation'> | undefined): DayNumber | undefined {
  return state?.presentation.kind === 'focused-day' ? state.presentation.day : undefined
}

export function agendaTimelineReturn(
  state: Pick<AgendaState, 'presentation'> | undefined,
): AgendaTimelineReturn | undefined {
  return state?.presentation.kind === 'focused-day' ? state.presentation.timelineReturn : undefined
}

export interface AgendaOccurrence {
  readonly nodeId: NodeId
  readonly day: DayNumber
}

/** A removed date keeps one editable occurrence until selection leaves it. */
export type AgendaActivity =
  | { readonly kind: 'inactive' }
  | { readonly kind: 'dated'; readonly occurrence: AgendaOccurrence }
  | { readonly kind: 'pinned-until-leave'; readonly occurrence: AgendaOccurrence }

export function activeAgendaOccurrence(state: Pick<AgendaState, 'activity'> | undefined): AgendaOccurrence | undefined {
  return state === undefined || state.activity.kind === 'inactive' ? undefined : state.activity.occurrence
}

export function pinnedAgendaOccurrence(state: Pick<AgendaState, 'activity'> | undefined): AgendaOccurrence | undefined {
  return state?.activity.kind === 'pinned-until-leave' ? state.activity.occurrence : undefined
}

export type AgendaCommand =
  | { readonly kind: 'select'; readonly key: string; readonly cursor?: number; readonly revealLine?: boolean }
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
    presentation: { kind: 'timeline' },
    activity: { kind: 'inactive' },
  }
}

/** Construct a focused presentation after the command owner has validated the day row. */
export function focusAgendaState(state: AgendaState, day: DayNumber, scrollTop: number): AgendaState {
  return {
    ...state,
    activity: { kind: 'inactive' },
    selectedKey: dayKey(day),
    collapsed: new Set(state.collapsed),
    presentation: {
      kind: 'focused-day',
      day,
      timelineReturn: {
        selectedKey: state.selectedKey,
        collapsed: state.collapsed,
        scrollTop: Math.max(0, scrollTop),
      },
    },
  }
}

export function applyAgendaCommand(
  state: AgendaState,
  command: AgendaCommand,
  rows: readonly AgendaRow[],
): AgendaState {
  if (command.kind === 'return-timeline') {
    if (state.presentation.kind !== 'focused-day') return state
    const timelineReturn = state.presentation.timelineReturn
    return {
      ...state,
      activity: { kind: 'inactive' },
      presentation: { kind: 'timeline' },
      selectedKey: timelineReturn.selectedKey,
      collapsed: timelineReturn.collapsed,
    }
  }

  const row = rows.find((candidate) => candidate.key === command.key)
  if (row === undefined) return state
  if (command.kind === 'focus-day') {
    if (row.kind !== 'day' || state.presentation.kind !== 'timeline') return state
    return focusAgendaState(state, row.day, command.scrollTop)
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
  delete rest.selectionCursor
  return {
    ...rest,
    selectedKey: row.key,
    activity:
      row.kind === 'node' ? { kind: 'dated', occurrence: { nodeId: row.nodeId, day: row.day } } : { kind: 'inactive' },
  }
}
